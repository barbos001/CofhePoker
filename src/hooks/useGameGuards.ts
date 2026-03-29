/**
 * useGameGuards — pre-flight checks & in-game safety guards.
 *
 * Pre-game:  gas check, balance check, permit check, network check, cooldown
 * In-game:   beforeunload, disconnect → auto-fold, turn timer, tab visibility
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { useAccount, usePublicClient, useBalance } from 'wagmi';
import { useGameStore } from '@/store/useGameStore';
import { CONTRACT_ADDRESS } from '@/config/contract';
import { parseEther } from 'viem';

const GUARD = (...args: unknown[]) =>
  console.log('%c[GUARD]', 'color:#FF8C42;font-weight:bold', ...args);

const MIN_GAS_ETH       = 0.001;        // ~enough for a few txs
const TURN_TIMEOUT_S    = 60;            // 60s to decide
const COOLDOWN_MS       = 2_000;         // 2s between hands
const SEPOLIA_CHAIN_ID  = 11155111;

export interface PreFlightResult {
  ok:       boolean;
  errors:   string[];
  warnings: string[];
}

export const useGameGuards = () => {
  const store       = useGameStore();
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { data: ethBalance } = useBalance({ address });

  const contractDeployed = CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000';
  const isOnChain = isConnected && contractDeployed;

  const [turnTimeLeft, setTurnTimeLeft] = useState(TURN_TIMEOUT_S);
  const timerRef    = useRef<ReturnType<typeof setInterval>>();
  const foldRef     = useRef<(() => Promise<void>) | null>(null);
  const turnStartRef = useRef(0);   // real timestamp when turn started
  const foldingRef   = useRef(false); // prevent double-fold

  // Store the fold function for auto-fold
  const setFoldFn = useCallback((fn: () => Promise<void>) => {
    foldRef.current = fn;
  }, []);

  // Start/stop turn timer based on playState
  // Uses Date.now() instead of interval counting to survive background-tab throttling
  useEffect(() => {
    if (store.playState === 'playerTurn') {
      turnStartRef.current = Date.now();
      foldingRef.current = false;
      setTurnTimeLeft(TURN_TIMEOUT_S);

      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - turnStartRef.current) / 1000);
        const remaining = Math.max(0, TURN_TIMEOUT_S - elapsed);
        setTurnTimeLeft(remaining);

        if (remaining <= 0) {
          clearInterval(timerRef.current);
          if (!foldingRef.current) {
            foldingRef.current = true;
            GUARD('Turn timer expired — auto-folding');
            foldRef.current?.();
          }
        }
      }, 1000);
      return () => clearInterval(timerRef.current);
    } else {
      clearInterval(timerRef.current);
      foldingRef.current = false;
      setTurnTimeLeft(TURN_TIMEOUT_S);
    }
  }, [store.playState]);

  useEffect(() => {
    const isActive = !['lobby', 'result'].includes(store.playState);
    if (!isActive) return;

    const handler = (e: BeforeUnloadEvent) => {
      GUARD('beforeunload triggered during active game');
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [store.playState]);

  const wasConnected = useRef(isConnected);
  useEffect(() => {
    if (wasConnected.current && !isConnected) {
      const isActive = !['lobby', 'result'].includes(store.playState);
      if (isActive && isOnChain) {
        GUARD('Wallet disconnected during active game — auto-folding');
        store.setStatus('Wallet disconnected — folding…', '#FF3B3B');
        foldRef.current?.();
      }
    }
    wasConnected.current = isConnected;
  }, [isConnected, store.playState, isOnChain, store]);

  useEffect(() => {
    const isActive = !['lobby', 'result'].includes(store.playState);
    if (!isActive) return;

    const handler = () => {
      if (document.hidden) {
        GUARD('Tab hidden during active game — player may miss turn timer');
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [store.playState]);

  const lastHandTime = useRef(0);

  const checkCooldown = useCallback((): boolean => {
    const now = Date.now();
    if (now - lastHandTime.current < COOLDOWN_MS) {
      GUARD(`Cooldown active — ${COOLDOWN_MS - (now - lastHandTime.current)}ms remaining`);
      return false;
    }
    lastHandTime.current = now;
    return true;
  }, []);

  const preflight = useCallback(async (): Promise<PreFlightResult> => {
    const errors:   string[] = [];
    const warnings: string[] = [];
    const { balance, pairPlusBet, playState, permitStatus } = store;
    const ante = 10;
    const totalCost = ante + pairPlusBet + ante; // ante + PP + play bet

    GUARD('Running pre-flight checks…');

    // 1. Already in a game
    if (playState !== 'lobby') {
      errors.push('Game already in progress');
    }

    // 2. Cooldown
    if (!checkCooldown()) {
      errors.push('Please wait before starting another hand');
    }

    // 3. Balance check (need ante + PP + potential play bet)
    if (balance < ante + pairPlusBet) {
      errors.push(`Not enough chips (need ${ante + pairPlusBet}, have ${balance})`);
    } else if (balance < totalCost) {
      warnings.push(`Low balance — you may not be able to Play (need ${totalCost} total)`);
    }

    // On-chain specific checks
    if (isOnChain) {
      // 4. Network check
      if (chainId !== SEPOLIA_CHAIN_ID) {
        errors.push('Wrong network — switch to Sepolia');
      }

      // 5. Gas check
      if (ethBalance) {
        const ethVal = Number(ethBalance.value) / 1e18;
        if (ethVal < MIN_GAS_ETH) {
          errors.push(`Not enough gas (${ethVal.toFixed(5)} ETH, need ~${MIN_GAS_ETH} ETH)`);
        } else if (ethVal < MIN_GAS_ETH * 3) {
          warnings.push(`Low gas (${ethVal.toFixed(4)} ETH) — may run out mid-game`);
        }
      } else if (publicClient && address) {
        // Fallback: fetch directly
        try {
          const bal = await publicClient.getBalance({ address });
          const ethVal = Number(bal) / 1e18;
          if (ethVal < MIN_GAS_ETH) {
            errors.push(`Not enough gas (${ethVal.toFixed(5)} ETH, need ~${MIN_GAS_ETH} ETH)`);
          } else if (ethVal < MIN_GAS_ETH * 3) {
            warnings.push(`Low gas (${ethVal.toFixed(4)} ETH)`);
          }
        } catch {
          warnings.push('Could not verify gas balance');
        }
      }

      // 6. FHE Permit check
      if (permitStatus === 'expired' || permitStatus === 'error') {
        errors.push('FHE permit expired or invalid — reconnect to fix');
      } else if (permitStatus === 'none') {
        warnings.push('No FHE permit — you\'ll need to sign one to see your cards');
      } else if (permitStatus === 'expiring') {
        warnings.push('FHE permit expiring soon — consider refreshing');
      }
    }

    const ok = errors.length === 0;
    GUARD(`Pre-flight: ${ok ? 'PASS' : 'FAIL'} | ${errors.length} errors, ${warnings.length} warnings`);
    errors.forEach(e => GUARD(`  ERROR: ${e}`));
    warnings.forEach(w => GUARD(`  WARN: ${w}`));

    return { ok, errors, warnings };
  }, [store, isOnChain, chainId, ethBalance, publicClient, address, checkCooldown]);

  const leaveGame = useCallback(async () => {
    const isActive = !['lobby', 'result'].includes(store.playState);
    if (!isActive) {
      store.resetToLobby();
      return;
    }
    // Active game → force fold
    GUARD('Player attempting to leave active game — auto-folding');
    if (foldRef.current) {
      await foldRef.current();
    } else {
      // Fallback: force result
      store.finishHand({
        result: 'FOLD',
        delta: -10,
        desc: 'Left the table',
        pot: 0,
        balance: store.balance,
        txHash: '',
        playerCards: store.playerCards,
        botCards: [],
      });
    }
  }, [store]);

  return {
    preflight,
    leaveGame,
    setFoldFn,
    turnTimeLeft,
    isOnChain,
    turnTimerActive: store.playState === 'playerTurn',
  };
};
