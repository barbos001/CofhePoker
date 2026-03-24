/**
 * useCofhe — initialises the CoFHE client and exposes decrypt helpers.
 *
 * The permit system:
 *   1. getOrCreateSelfPermit() — creates an EIP-712 self-permit if none exists,
 *      stores it as the active permit for (chainId, account).
 *   2. decryptForView(ctHash, FheTypes.Uint64).withPermit(permit).execute()
 *      — fetches from the CoFHE threshold network using the permit.
 *   3. Public cards (allowPublic) still require a permit for the threshold
 *      network auth, just the on-chain ACL is relaxed.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useWalletClient, usePublicClient } from 'wagmi';
import { FheTypes } from '@cofhe/sdk';
import { useGameStore } from '@/store/useGameStore';

// Dynamically import web entry (has WASM) to avoid SSR/build issues
const loadWebSDK = async () => import('@cofhe/sdk/web');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CofheClient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CofhePermit = any;

interface CofheState {
  client:    CofheClient | null;
  isReady:   boolean;
  isLoading: boolean;
  error:     string | null;
}

// ── Logging helper ─────────────────────────────────────────────────
const FHE = (...args: unknown[]) =>
  console.log('%c[FHE]', 'color:#B366FF;font-weight:bold', ...args);

export const useCofhe = () => {
  const [state, setState] = useState<CofheState>({
    client:    null,
    isReady:   false,
    isLoading: false,
    error:     null,
  });

  const { data: walletClient } = useWalletClient();
  const publicClient           = usePublicClient();
  const clientRef              = useRef<CofheClient>(null);
  const initAttemptedRef       = useRef(false);

  const setPermitStatus = useGameStore(s => s.setPermitStatus);
  const setPermitError  = useGameStore(s => s.setPermitError);

  useEffect(() => {
    if (!walletClient || !publicClient) return;
    if (initAttemptedRef.current) return;
    initAttemptedRef.current = true;

    const init = async () => {
      setState(s => ({ ...s, isLoading: true, error: null }));
      try {
        FHE('Loading CoFHE SDK (WASM)…');
        const t0 = performance.now();
        const { createCofheConfig, createCofheClient } = await loadWebSDK();
        FHE(`SDK loaded in ${(performance.now() - t0).toFixed(0)}ms`);

        // Named imports from chains subpackage
        const { sepolia: sepoliaChain } = await import('@cofhe/sdk/chains');

        const config = createCofheConfig({
          supportedChains: [sepoliaChain],
        });
        FHE('Config created — chains: [sepolia]');

        if (!clientRef.current) {
          clientRef.current = createCofheClient(config);
          FHE('Client instance created');
        }

        // connect() sets chainId + account on the internal store
        FHE('Connecting to wallet…');
        const t1 = performance.now();
        await clientRef.current.connect(publicClient, walletClient);
        FHE(`Connected in ${(performance.now() - t1).toFixed(0)}ms ✓`);

        setState({ client: clientRef.current, isReady: true, isLoading: false, error: null });

        // Auto-sign permit right after connect so it's ready before first hand
        FHE('Auto-requesting permit after connect…');
        try {
          setPermitStatus('signing');
          setPermitError(null);
          const permit = await clientRef.current.permits.getOrCreateSelfPermit();
          if (permit) {
            setPermitStatus('active');
            FHE('Permit auto-signed ✓ — ready for gameplay');
          }
        } catch (permitErr) {
          // Not critical — user will be prompted again when starting a hand
          FHE('Auto-permit skipped (user may have rejected):', permitErr instanceof Error ? permitErr.message : permitErr);
          setPermitStatus('none');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'CoFHE init failed';
        FHE('Init FAILED:', msg);
        setState(s => ({ ...s, isLoading: false, error: msg }));
        initAttemptedRef.current = false; // allow retry on reconnect/re-render
        // Auto-retry after 3s if wallet might be slow to connect
        if (msg.includes('onnect') || msg.includes('wallet')) {
          FHE('Will auto-retry CoFHE init in 3s…');
          setTimeout(() => { initAttemptedRef.current = false; }, 3000);
        }
      }
    };

    void init();
  }, [walletClient, publicClient]);

  // Reset when wallet disconnects
  useEffect(() => {
    if (!walletClient) {
      clientRef.current        = null;
      initAttemptedRef.current = false;
      setState({ client: null, isReady: false, isLoading: false, error: null });
      setPermitStatus('none');
      FHE('Wallet disconnected — client reset');
    }
  }, [walletClient, setPermitStatus]);

  /**
   * Ensure an active self-permit exists for the current account.
   * Uses a lock to prevent duplicate signing popups.
   */
  const permitLockRef = useRef<Promise<CofhePermit> | null>(null);

  const ensurePermit = useCallback(async (): Promise<CofhePermit> => {
    if (!clientRef.current) throw new Error('CoFHE not initialised');

    // Already signing — return the same promise (prevents duplicate popups)
    if (permitLockRef.current) {
      FHE('Permit already in progress — waiting…');
      return permitLockRef.current;
    }

    // Already active — return existing permit without popup
    const { permitStatus: currentStatus } = useGameStore.getState();
    if (currentStatus === 'active') {
      try {
        const existing = await clientRef.current.permits.getOrCreateSelfPermit();
        if (existing) return existing;
      } catch { /* fall through to re-sign */ }
    }

    setPermitStatus('signing');
    setPermitError(null);

    const promise = (async () => {
      try {
        FHE('Requesting EIP-712 self-permit…');
        const t0 = performance.now();
        const permit = await clientRef.current!.permits.getOrCreateSelfPermit();
        FHE(`Permit active ✓ (${(performance.now() - t0).toFixed(0)}ms)`);
        setPermitStatus('active');
        return permit;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Permit signing failed';
        FHE('Permit FAILED:', msg);
        setPermitStatus('error');
        setPermitError(msg);
        throw err;
      } finally {
        permitLockRef.current = null;
      }
    })();

    permitLockRef.current = promise;
    return promise;
  }, [setPermitStatus, setPermitError]);

  /**
   * Decrypt a player card ctHash.
   * Retries up to 3 times with exponential backoff if the CoFHE
   * threshold network returns a transient error (5xx, 403, 404).
   * @param ctHash  uint256 ctHash from contract.getMyCards()
   * @returns       card number 0–51
   */
  const decryptCard = useCallback(async (ctHash: bigint): Promise<number> => {
    if (!clientRef.current) throw new Error('CoFHE not initialised');

    FHE(`Decrypt card  ctHash=${ctHash.toString().slice(0, 12)}…`);
    const t0 = performance.now();
    const permit = await ensurePermit();

    const MAX_RETRIES = 10;
    // Longer waits: 428 means threshold network hasn't synced yet, needs patience
    const BACKOFF = [3000, 5000, 8000, 10000, 12000, 15000, 15000, 20000, 20000, 25000]; // ~133s total

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await clientRef.current
          .decryptForView(ctHash, FheTypes.Uint64)
          .withPermit(permit)
          .execute();

        const card = Number(result);
        FHE(`Card decrypted → ${card} (${(performance.now() - t0).toFixed(0)}ms${attempt > 0 ? `, attempt ${attempt + 1}` : ''})`);
        return card;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isTransient = /sealOutput|HTTP\s*[3-5]\d{2}|Failed to fetch|NetworkError|ETIMEDOUT/i.test(msg);

        if (isTransient && attempt < MAX_RETRIES) {
          const delay = BACKOFF[attempt];
          FHE(`Decrypt failed (${msg}) — retry ${attempt + 1}/${MAX_RETRIES} in ${delay / 1000}s…`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw err; // permanent error or retries exhausted
      }
    }

    throw new Error('Decrypt retries exhausted'); // unreachable, but TS needs it
  }, [ensurePermit]);

  /**
   * Decrypt a card that has been made public via FHE.allowPublic().
   * Still requires a permit for the threshold network auth — the on-chain
   * ACL is just relaxed so anyone's permit works.
   */
  const decryptPublicCard = useCallback(async (ctHash: bigint): Promise<number> => {
    if (!clientRef.current) throw new Error('CoFHE not initialised');

    FHE(`Decrypt public card  ctHash=${ctHash.toString().slice(0, 12)}…`);
    const t0 = performance.now();
    const permit = await ensurePermit();

    const MAX_RETRIES = 5;
    const BACKOFF = [2000, 4000, 6000, 8000, 10000];

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await clientRef.current
          .decryptForView(ctHash, FheTypes.Uint64)
          .withPermit(permit)
          .execute();

        const card = Number(result);
        FHE(`Public card decrypted → ${card} (${(performance.now() - t0).toFixed(0)}ms${attempt > 0 ? `, attempt ${attempt + 1}` : ''})`);
        return card;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isTransient = /sealOutput|HTTP\s*[3-5]\d{2}|Failed to fetch|NetworkError|ETIMEDOUT/i.test(msg);

        if (isTransient && attempt < MAX_RETRIES) {
          const delay = BACKOFF[attempt];
          FHE(`Public card decrypt failed (${msg}) — retry ${attempt + 1}/${MAX_RETRIES} in ${delay / 1000}s…`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }

    throw new Error('Public card decrypt retries exhausted');
  }, [ensurePermit]);

  /**
   * Quick health-check: hits the CoFHE endpoint with a no-op to see if it's alive.
   * Returns true if reachable, false if down.
   */
  const checkHealth = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('https://testnet-cofhe-tn.fhenix.zone/v2/sealoutput', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(5000),
      });
      // 400/422 = endpoint exists, processed our request (bad body is expected) = alive
      // 5xx/404/428/403 = service is down or broken
      FHE(`Health check: HTTP ${res.status}`);
      return res.status < 500 && res.status !== 404 && res.status !== 428 && res.status !== 403;
    } catch {
      FHE('Health check: unreachable');
      return false;
    }
  }, []);

  return {
    cofheClient:       clientRef.current,
    isReady:           state.isReady,
    isLoading:         state.isLoading,
    error:             state.error,
    ensurePermit,
    decryptCard,
    decryptPublicCard,
    checkHealth,
  };
};
