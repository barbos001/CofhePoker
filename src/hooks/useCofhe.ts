/**
 * useCofhe — initialises the CoFHE client and exposes decrypt helpers.
 *
 * SINGLETON: The client is created once at module level and shared
 * across all components that call useCofhe(). This prevents multiple
 * parallel initializations and "CoFHE not initialised" race conditions.
 *
 * Reactive state (isReady / isLoading / error) is stored in a Zustand
 * store so that component re-renders go through React's normal batching
 * instead of calling forceUpdate() on each subscriber from within an
 * effect (which can exceed React's 50-update nested-update limit).
 */
import { useEffect, useCallback } from 'react';
import { useWalletClient, usePublicClient } from 'wagmi';
import { FheTypes } from '@cofhe/sdk';
import { useGameStore } from '@/store/useGameStore';
import { create } from 'zustand';

const loadWebSDK = async () => import('@cofhe/sdk/web');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CofheClient = any;

const FHE = (...args: unknown[]) =>
  console.log('%c[FHE]', 'color:#B366FF;font-weight:bold', ...args);

// ─── Zustand store for reactive FHE state ───────────────────────────────────
interface CofheState {
  isReady:   boolean;
  isLoading: boolean;
  error:     string | null;
  setReady:   (v: boolean)      => void;
  setLoading: (v: boolean)      => void;
  setError:   (v: string | null) => void;
}

const useCofheStore = create<CofheState>((set) => ({
  isReady:   false,
  isLoading: false,
  error:     null,
  setReady:   (v) => set({ isReady:   v }),
  setLoading: (v) => set({ isLoading: v }),
  setError:   (v) => set({ error:     v }),
}));

// ─── Singleton mutable state (not reactive — only accessed via store) ────────
let _client: CofheClient | null = null;
let _initPromise: Promise<void> | null = null;
let _lastWalletAddress: string | null = null;

async function _initSingleton(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wc: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pc: any,
  walletAddress: string,
) {
  const { isReady, setReady, setLoading, setError } = useCofheStore.getState();

  // Already init'd for this wallet
  if (isReady && _lastWalletAddress === walletAddress) return;
  // Already loading
  if (_initPromise) return _initPromise;

  setLoading(true);
  setError(null);

  _initPromise = (async () => {
    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        FHE(`Loading CoFHE SDK (WASM)… (attempt ${attempt + 1})`);
        const t0 = performance.now();
        const { createCofheConfig, createCofheClient } = await loadWebSDK();
        FHE(`SDK loaded in ${(performance.now() - t0).toFixed(0)}ms`);

        const { sepolia: sepoliaChain } = await import('@cofhe/sdk/chains');
        const config = createCofheConfig({ supportedChains: [sepoliaChain] });

        const client = createCofheClient(config);
        await client.connect(pc, wc);
        FHE('Connected ✓');

        _client = client;
        _lastWalletAddress = walletAddress;
        // Batch both updates into a single store notification
        useCofheStore.setState({ isLoading: false, isReady: true });
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'CoFHE init failed';
        FHE(`Init FAILED (attempt ${attempt + 1}/${MAX_RETRIES}):`, msg);
        if (attempt < MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        } else {
          useCofheStore.setState({ isLoading: false, error: msg });
        }
      }
    }
  })();

  try { await _initPromise; } finally { _initPromise = null; }
}

function _reset() {
  _client = null;
  _initPromise = null;
  _lastWalletAddress = null;
  const s = useCofheStore.getState();
  s.setReady(false);
  s.setLoading(false);
  s.setError(null);
}

export const useCofhe = () => {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const setPermitStatus = useGameStore(s => s.setPermitStatus);
  const setPermitError  = useGameStore(s => s.setPermitError);

  // Read FHE state from the store (no forceUpdate needed)
  const isReady   = useCofheStore(s => s.isReady);
  const isLoading = useCofheStore(s => s.isLoading);
  const error     = useCofheStore(s => s.error);

  // Init when wallet connects
  useEffect(() => {
    if (!walletClient || !publicClient) return;
    const addr = (walletClient as any).account?.address;
    if (!addr) return;
    void _initSingleton(walletClient, publicClient, addr);
  }, [walletClient, publicClient]);

  // Reset when wallet disconnects
  useEffect(() => {
    if (!walletClient && useCofheStore.getState().isReady) {
      _reset();
      setPermitStatus('none');
      FHE('Wallet disconnected — client reset');
    }
  }, [walletClient, setPermitStatus]);

  const getOrCreateSelfPermit = useCallback(async () => {
    if (!_client) throw new Error('CoFHE not initialised');
    return _client.permits.getOrCreateSelfPermit();
  }, []);

  const removeActivePermit = useCallback(async () => {
    if (!_client) throw new Error('CoFHE not initialised');
    setPermitStatus('none');
    return _client.permits.removeActivePermit();
  }, [setPermitStatus]);

  const ensurePermit = useCallback(async () => {
    if (!_client) throw new Error('CoFHE not initialised');

    const { permitStatus } = useGameStore.getState();
    if (permitStatus === 'signing') {
      FHE('Permit signing already in progress, waiting…');
      await new Promise(r => setTimeout(r, 500));
      return _client.permits.getOrCreateSelfPermit();
    }

    try {
      setPermitStatus('signing');
      setPermitError(null);
      FHE('Ensuring permit…');
      const permit = await _client.permits.getOrCreateSelfPermit();
      setPermitStatus('active');
      FHE('Permit ready ✓');
      return permit;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Permit signing failed';
      FHE('Permit FAILED:', msg);
      setPermitStatus('error');
      setPermitError(msg);
      throw err;
    }
  }, [setPermitStatus, setPermitError]);

  // Detects wallet rejections and expired/missing permit errors.
  const isPermitError = useCallback((msg: string): boolean =>
    /user rejected|user denied|rejected the request|permit.*expir|not permitted|unauthorized|signature.*invalid|invalid.*signature/i.test(msg),
  []);

  const decryptCard = useCallback(async (ctHash: bigint): Promise<number> => {
    if (!_client) throw new Error('CoFHE not initialised');

    FHE(`Decrypt card  ctHash=${ctHash.toString().slice(0, 12)}…`);
    const t0 = performance.now();
    await ensurePermit();

    const MAX_RETRIES = 10;
    const BACKOFF = [3000, 5000, 8000, 10000, 12000, 15000, 15000, 20000, 20000, 25000];

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await _client
          .decryptForView(ctHash, FheTypes.Uint64)
          .withPermit()
          .execute();
        const card = Number(result);
        FHE(`Card decrypted → ${card} (${(performance.now() - t0).toFixed(0)}ms${attempt > 0 ? `, attempt ${attempt + 1}` : ''})`);
        return card;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (isPermitError(msg)) {
          FHE(`Decrypt blocked by permit error: ${msg}`);
          setPermitStatus('expired');
          setPermitError('Permit rejected or expired — re-sign your FHE permit to decrypt cards.');
          throw err;
        }
        const isTransient = /sealOutput|HTTP\s*[3-5]\d{2}|Failed to fetch|NetworkError|ETIMEDOUT/i.test(msg);
        if (isTransient && attempt < MAX_RETRIES) {
          const delay = BACKOFF[attempt];
          FHE(`Decrypt failed (${msg}) — retry ${attempt + 1}/${MAX_RETRIES} in ${delay / 1000}s…`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
    throw new Error('Decrypt retries exhausted');
  }, [ensurePermit, isPermitError, setPermitStatus, setPermitError]);

  const decryptPublicCard = useCallback(async (ctHash: bigint): Promise<number> => {
    if (!_client) throw new Error('CoFHE not initialised');

    FHE(`Decrypt public card  ctHash=${ctHash.toString().slice(0, 12)}…`);
    const t0 = performance.now();
    await ensurePermit();

    const MAX_RETRIES = 5;
    const BACKOFF = [2000, 4000, 6000, 8000, 10000];

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await _client
          .decryptForView(ctHash, FheTypes.Uint64)
          .withPermit()
          .execute();
        const card = Number(result);
        FHE(`Public card decrypted → ${card} (${(performance.now() - t0).toFixed(0)}ms${attempt > 0 ? `, attempt ${attempt + 1}` : ''})`);
        return card;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (isPermitError(msg)) {
          FHE(`Public card decrypt blocked by permit error: ${msg}`);
          setPermitStatus('expired');
          setPermitError('Permit rejected or expired — re-sign your FHE permit to decrypt cards.');
          throw err;
        }
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
  }, [ensurePermit, isPermitError, setPermitStatus, setPermitError]);

  const decryptForTx = useCallback(async (
    ctHash: bigint,
  ): Promise<{ result: bigint; signature: `0x${string}` }> => {
    if (!_client) throw new Error('CoFHE not initialised');

    FHE(`decryptForTx  ctHash=${ctHash.toString().slice(0, 12)}…`);
    const t0 = performance.now();

    const MAX_RETRIES = 8;
    const BACKOFF = [3000, 5000, 8000, 10000, 12000, 15000, 20000, 25000];

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const output = await _client
          .decryptForTx(ctHash, FheTypes.Bool)
          .execute() as { result: bigint; signature: `0x${string}` };
        FHE(`decryptForTx → result=${output.result} (${(performance.now() - t0).toFixed(0)}ms${attempt > 0 ? `, attempt ${attempt + 1}` : ''})`);
        return output;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isTransient = /sealOutput|HTTP\s*[3-5]\d{2}|Failed to fetch|NetworkError|ETIMEDOUT/i.test(msg);
        if (isTransient && attempt < MAX_RETRIES) {
          const delay = BACKOFF[attempt];
          FHE(`decryptForTx failed (${msg}) — retry ${attempt + 1}/${MAX_RETRIES} in ${delay / 1000}s…`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
    throw new Error('decryptForTx retries exhausted');
  }, []);

  const checkHealth = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('https://testnet-cofhe-tn.fhenix.zone/v2/sealoutput', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(5000),
      });
      FHE(`Health check: HTTP ${res.status}`);
      return res.status < 500 && res.status !== 404 && res.status !== 428 && res.status !== 403;
    } catch {
      FHE('Health check: unreachable');
      return false;
    }
  }, []);

  return {
    cofheClient:       _client,
    isReady,
    isLoading,
    error,
    ensurePermit,
    isPermitError,
    decryptCard,
    decryptPublicCard,
    decryptForTx,
    getOrCreateSelfPermit,
    removeActivePermit,
    checkHealth,
  };
};
