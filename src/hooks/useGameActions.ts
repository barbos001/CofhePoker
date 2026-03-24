/**
 * useGameActions — game action hook (on-chain only).
 *
 * All actions execute real on-chain transactions via CipherPoker contract.
 */
import { useCallback, useRef } from 'react';
import { useAccount, useWriteContract, usePublicClient } from 'wagmi';
import { useGameStore } from '@/store/useGameStore';
import { CONTRACT_ADDRESS, CIPHER_POKER_ABI, GameState } from '@/config/contract';
import { useCofhe } from './useCofhe';
import { sleep } from '@/lib/utils';
import { evaluateHand, getCardData } from '@/lib/poker';

// ── Logging helpers ──────────────────────────────────────────────────
const TX  = (...args: unknown[]) =>
  console.log('%c[TX]',   'color:#39FF14;font-weight:bold', ...args);
const GAME = (...args: unknown[]) =>
  console.log('%c[GAME]', 'color:#FFE03D;font-weight:bold', ...args);
const POLL = (...args: unknown[]) =>
  console.log('%c[POLL]', 'color:#888;font-weight:bold',    ...args);

// ── Polling helper ───────────────────────────────────────────────────
const POLL_MS  = 3_000;
const MAX_POLLS = 40;   // ~2 min

async function pollUntilTrue(
  label:    string,
  check:    () => Promise<boolean>,
  interval = POLL_MS,
  maxTries = MAX_POLLS,
  onTick?:  (elapsedSec: number) => void,
): Promise<boolean> {
  POLL(`Polling "${label}" — interval ${interval}ms, max ${maxTries}`);
  const t0 = Date.now();
  for (let i = 0; i < maxTries; i++) {
    if (await check()) {
      POLL(`"${label}" ready ✓ (attempt ${i + 1})`);
      return true;
    }
    const elapsed = Math.round((Date.now() - t0) / 1000);
    POLL(`"${label}" not ready (${i + 1}/${maxTries}, ${elapsed}s)…`);
    onTick?.(elapsed);
    await sleep(interval);
  }
  POLL(`"${label}" TIMED OUT after ${maxTries} attempts`);
  return false;
}

// ── Hook ─────────────────────────────────────────────────────────────
export const useGameActions = () => {
  const store                    = useGameStore();
  const { address, isConnected } = useAccount();
  const publicClient             = usePublicClient();
  const { decryptCard, decryptPublicCard } = useCofhe();
  const { writeContractAsync }   = useWriteContract();

  const contractDeployed = CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000';
  const isOnChain        = isConnected && contractDeployed;

  // Store ctHashes for retry after FHE failure
  const pendingCtHashes = useRef<[bigint, bigint, bigint] | null>(null);
  const pendingTableId  = useRef<bigint | null>(null);

  /** Write a contract function and wait for the transaction to be mined. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const writeAndWait = useCallback(async (fnName: string, args: any): Promise<`0x${string}`> => {
    TX(`${fnName}() — sending tx…`);
    const t0 = performance.now();
    const hash = await writeContractAsync(args);
    TX(`${fnName}() — tx sent: ${hash.slice(0, 14)}…`);
    await publicClient!.waitForTransactionReceipt({ hash });
    TX(`${fnName}() — confirmed in ${(performance.now() - t0).toFixed(0)}ms ✓`);
    return hash;
  }, [writeContractAsync, publicClient]);

  // ── Helpers ──────────────────────────────────────────────────────

  const getChainTableId = useCallback(async (): Promise<bigint> => {
    if (!publicClient) throw new Error('No public client');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const id = await publicClient.readContract({
      address: CONTRACT_ADDRESS, abi: CIPHER_POKER_ABI,
      functionName: 'getMyTableId',
      account: address,
    } as any) as bigint;
    TX(`getMyTableId() → ${id}`);
    return id;
  }, [publicClient, address]);

  const readBalance = useCallback(async (): Promise<number> => {
    if (!publicClient) return 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bal = await publicClient.readContract({
      address: CONTRACT_ADDRESS, abi: CIPHER_POKER_ABI,
      functionName: 'getBalance',
      account: address,
    } as any) as bigint;
    const n = Number(bal);
    TX(`getBalance() → ${n} chips`);
    return n;
  }, [publicClient, address]);

  // ── _finishHand (must be declared BEFORE play / fold) ────────────
  const _finishHand = useCallback(async (
    tableId: bigint,
    reason: 'fold' | 'botFolded' | 'showdown',
    txHash: `0x${string}`,
  ) => {
    if (!publicClient) return;

    GAME(`Finishing hand — reason: ${reason}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [winner, pot] = await publicClient.readContract({
      address: CONTRACT_ADDRESS, abi: CIPHER_POKER_ABI,
      functionName: 'getHandResult', args: [tableId],
      account: address,
    } as any) as [string, bigint, boolean];

    const playerAddr = address?.toLowerCase() ?? '';
    const playerWon  = winner.toLowerCase() === playerAddr;
    const potNum     = Number(pot);

    const result: 'WON' | 'LOST' | 'FOLD' =
      reason === 'fold'                   ? 'FOLD' :
      playerWon                           ? 'WON'  : 'LOST';

    const delta =
      reason === 'fold'      ? -10 :
      playerWon              ? potNum - 20 : -20;

    const desc =
      reason === 'fold'      ? 'You folded'      :
      reason === 'botFolded' ? 'Opponent folded' : '';

    const newBalance = await readBalance();

    GAME(`Result: ${result} | pot: ${potNum} | delta: ${delta > 0 ? '+' : ''}${delta} | balance: ${newBalance}`);

    // Try to decrypt bot cards if they were made public (showdown where player lost,
    // or botFolded where player won — contract calls allowPublic in both cases)
    let botCards: number[] | undefined;
    if (reason !== 'fold') {
      try {
        GAME('Decrypting bot cards…');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const [b0, b1, b2] = await publicClient.readContract({
          address: CONTRACT_ADDRESS, abi: CIPHER_POKER_ABI,
          functionName: 'getBotCards', args: [tableId],
          account: address,
        } as any) as [bigint, bigint, bigint];

        botCards = await Promise.all([b0, b1, b2].map(h => decryptPublicCard(h)));
        GAME(`Bot cards: [${botCards.join(', ')}] → ${botCards.map(c => { const d = getCardData(c); return d.rankString + d.suit; }).join(' ')}`);
      } catch {
        // allowPublic may not have been called yet — silently skip bot card reveal
        GAME('Bot cards not available (allowPublic not called yet)');
        botCards = undefined;
      }
    }

    // Evaluate hands for result overlay
    const playerCardIds = store.playerCards;
    if (playerCardIds.length === 3) {
      const pEval = evaluateHand(playerCardIds);
      store.setPlayerEval(pEval);
      GAME(`Player hand: ${pEval.name} (score ${pEval.score})`);
    }
    if (botCards && botCards.length === 3) {
      const bEval = evaluateHand(botCards);
      store.setBotEval(bEval);
      GAME(`Bot hand: ${bEval.name} (score ${bEval.score})`);
    }

    store.finishHand({ result, delta, desc, pot: potNum, balance: newBalance, txHash, botCards });
  }, [publicClient, address, store, readBalance, decryptPublicCard]);

  // ── Helper: check on-chain table state ─────────────────────────
  const getTableState = useCallback(async (tableId: bigint): Promise<number> => {
    if (!publicClient) return -1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [, state] = await publicClient.readContract({
      address: CONTRACT_ADDRESS, abi: CIPHER_POKER_ABI,
      functionName: 'getTableInfo', args: [tableId],
      account: address,
    } as any) as [string, number, bigint, bigint];
    return state;
  }, [publicClient, address]);

  // ── Helper: fold a stuck hand on-chain ────────────────────────
  const foldStuckHand = useCallback(async (tableId: bigint): Promise<boolean> => {
    try {
      GAME(`Folding stuck hand on table #${tableId}…`);
      store.setStatus('Recovering stuck hand — folding…', '#FF8C42');
      await writeAndWait('fold', {
        address: CONTRACT_ADDRESS, abi: CIPHER_POKER_ABI,
        functionName: 'fold', args: [tableId],
      });
      GAME('Stuck hand folded ✓');
      store.setBalance(await readBalance());
      return true;
    } catch (foldErr) {
      GAME('Failed to fold stuck hand:', foldErr instanceof Error ? foldErr.message : foldErr);
      return false;
    }
  }, [store, writeAndWait, readBalance]);

  // ── _decryptAndReveal — decrypt ctHashes and show cards ────────
  const _decryptAndReveal = useCallback(async (ctHashes: [bigint, bigint, bigint]) => {
    store.setPlayState('decrypting');
    store.setStatus('Decrypting your cards…', '#B366FF');
    // Clear any partially revealed cards from a previous failed attempt
    store.clearPlayerCards();

    for (let i = 0; i < 3; i++) {
      GAME(`Decrypting card ${i + 1}/3…`);
      const cardId = await decryptCard(ctHashes[i]);
      store.revealPlayerCard(cardId);
      GAME(`Card ${i + 1} revealed → ${cardId}`);
    }

    // All 3 decrypted — move to player turn
    pendingCtHashes.current = null;
    store.setPlayState('playerTurn');
    store.setStatus('Your turn — PLAY or FOLD', '#FFE03D');
    GAME('All cards decrypted — player turn');
  }, [store, decryptCard]);

  // ── retryDecrypt — retry after FHE failure ────────────────────
  const retryDecrypt = useCallback(async () => {
    if (!pendingCtHashes.current) {
      GAME('retryDecrypt called but no pending ctHashes');
      return;
    }
    GAME('Retrying FHE decrypt…');
    try {
      // Clear any partially revealed cards — re-decrypt all 3
      // (store.playerCards may have 0-2 cards from a partial decrypt)
      await _decryptAndReveal(pendingCtHashes.current);
    } catch (err) {
      console.error('[retryDecrypt]', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      GAME('retryDecrypt FAILED:', errMsg);
      store.setPlayState('decrypting');
      store.setStatus('CoFHE still down — tap RETRY or FOLD', '#FF8C42');
    }
  }, [_decryptAndReveal, store]);

  // ── startHand ───────────────────────────────────────────────────
  const startHand = useCallback(async () => {
    if (!isOnChain || !publicClient) return;

    try {
      GAME('═══ NEW HAND ═══');
      store.setPlayState('dealing');
      store.setStatus('Creating poker table…', '#B366FF');

      let tableId = await getChainTableId();

      if (tableId === 0n) {
        GAME('No table found — creating…');
        await writeAndWait('createTable', {
          address: CONTRACT_ADDRESS, abi: CIPHER_POKER_ABI,
          functionName: 'createTable',
        });
        tableId = await getChainTableId();
      }

      store.setTableId(Number(tableId));
      store.setBalance(await readBalance());
      GAME(`Table #${tableId}`);

      // Check if a previous hand is stuck (PLAYER_TURN state from failed FHE decrypt)
      const currentState = await getTableState(tableId);
      if (currentState === GameState.PLAYER_TURN) {
        GAME('Table has a stuck hand in PLAYER_TURN — auto-folding…');
        const folded = await foldStuckHand(tableId);
        if (!folded) {
          store.setStatus('Cannot recover stuck hand — try again later.', '#FF3B3B');
          store.setPlayState('lobby');
          return;
        }
      }

      store.setStatus('Shuffling encrypted deck…', '#B366FF');

      await writeAndWait('startHand', {
        address: CONTRACT_ADDRESS, abi: CIPHER_POKER_ABI,
        functionName: 'startHand', args: [tableId],
      });

      // Poll until PLAYER_TURN (CoFHE finishes card generation)
      store.setStatus('Generating encrypted cards (FHE)… 0s', '#B366FF');
      const cardsReady = await pollUntilTrue('card generation', async () => {
        const state = await getTableState(tableId);
        return state === GameState.PLAYER_TURN;
      }, POLL_MS, MAX_POLLS,
        (sec) => store.setStatus(`Generating encrypted cards (FHE)… ${sec}s`, '#B366FF'),
      );

      if (!cardsReady) {
        GAME('Card generation TIMED OUT');
        store.setStatus('Card generation timed out. Try again.', '#FF3B3B');
        store.setPlayState('lobby');
        return;
      }

      // Decrypt the 3 player cards one by one
      store.setPlayState('decrypting');

      // Give CoFHE threshold network time to sync after card generation
      // (HTTP 428 = "Precondition Required" = data not propagated yet)
      // First card always gets 428s for ~20-30s — waiting upfront avoids wasted retries
      const SYNC_WAIT = 20;
      for (let s = SYNC_WAIT; s > 0; s--) {
        store.setStatus(`Waiting for FHE network sync… ${s}s`, '#B366FF');
        await sleep(1000);
      }

      store.setStatus('Decrypting your cards…', '#B366FF');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [c0, c1, c2] = await publicClient!.readContract({
        address: CONTRACT_ADDRESS, abi: CIPHER_POKER_ABI,
        functionName: 'getMyCards', args: [tableId],
        account: address,
      } as any) as [bigint, bigint, bigint];
      GAME(`Got 3 encrypted ctHashes from contract`);

      // Store ctHashes for retry
      pendingCtHashes.current = [c0, c1, c2];
      pendingTableId.current = tableId;

      await _decryptAndReveal([c0, c1, c2]);

    } catch (err) {
      console.error('[startHand]', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      GAME('startHand FAILED:', errMsg);

      if (pendingCtHashes.current) {
        // Transactions succeeded and we have encrypted cards on-chain —
        // keep the game alive regardless of error type (FHE down, permit rejected, network, etc.)
        GAME('Decrypt/permit failed but hand exists on-chain — keeping alive for retry');
        store.setPlayState('decrypting');
        store.setStatus('Decryption failed — tap RETRY or FOLD below', '#FF8C42');
      } else {
        store.setStatus('Error — please try again.', '#FF3B3B');
        store.setPlayState('lobby');
      }
    }
  }, [isOnChain, store, writeAndWait, publicClient, getChainTableId, readBalance, _decryptAndReveal, address, getTableState, foldStuckHand]);

  // ── play ────────────────────────────────────────────────────────
  const play = useCallback(async () => {
    if (!isOnChain) return;

    try {
      const tableId = BigInt(store.tableId!);
      GAME('Player PLAYS — placing bet…');

      store.setStatus('Placing bet…', '#FFF');
      await writeAndWait('play', {
        address: CONTRACT_ADDRESS, abi: CIPHER_POKER_ABI,
        functionName: 'play', args: [tableId],
      });

      store.setPlayState('botThinking');
      store.setStatus('Bot evaluating hand (FHE)… 0s', '#888888');
      GAME('Waiting for bot FHE decision…');

      // Wait for CoFHE to finish the bot-score decrypt (~30-60s on testnet)
      const botReady = await pollUntilTrue('bot decision', () =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        publicClient!.readContract({
          address: CONTRACT_ADDRESS, abi: CIPHER_POKER_ABI,
          functionName: 'isBotDecisionReady', args: [tableId],
          account: address,
        } as any) as Promise<boolean>,
        POLL_MS, MAX_POLLS,
        (sec) => store.setStatus(`Bot evaluating hand (FHE)… ${sec}s`, '#888888'),
      );

      if (!botReady) {
        GAME('Bot decision TIMED OUT');
        store.setStatus('Opponent decision timed out. Refresh and retry.', '#FF3B3B');
        return;
      }

      // Resolve bot decision (anyone can call — no auth required)
      store.setStatus('Resolving bot decision…', '#B366FF');
      const resolveBotHash = await writeAndWait('resolveBotDecision', {
        address: CONTRACT_ADDRESS, abi: CIPHER_POKER_ABI,
        functionName: 'resolveBotDecision', args: [tableId],
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [, newState] = await publicClient!.readContract({
        address: CONTRACT_ADDRESS, abi: CIPHER_POKER_ABI,
        functionName: 'getTableInfo', args: [tableId],
        account: address,
      } as any) as [string, number, bigint, bigint];

      if (newState === GameState.COMPLETE) {
        // Bot folded — player wins
        GAME('Bot FOLDED → player wins');
        await _finishHand(tableId, 'botFolded', resolveBotHash);
        return;
      }

      // Both played → showdown
      GAME('Bot PLAYS → showdown');
      store.setPlayState('showdown');
      store.setStatus('Determining winner (FHE)… 0s', '#B366FF');

      const showdownReady = await pollUntilTrue('showdown', () =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        publicClient!.readContract({
          address: CONTRACT_ADDRESS, abi: CIPHER_POKER_ABI,
          functionName: 'isShowdownReady', args: [tableId],
          account: address,
        } as any) as Promise<boolean>,
        POLL_MS, MAX_POLLS,
        (sec) => store.setStatus(`Determining winner (FHE)… ${sec}s`, '#B366FF'),
      );

      if (!showdownReady) {
        GAME('Showdown TIMED OUT');
        store.setStatus('Showdown timed out. Refresh and retry.', '#FF3B3B');
        return;
      }

      store.setStatus('Revealing winner…', '#B366FF');
      const resolveShowdownHash = await writeAndWait('resolveShowdown', {
        address: CONTRACT_ADDRESS, abi: CIPHER_POKER_ABI,
        functionName: 'resolveShowdown', args: [tableId],
      });

      await _finishHand(tableId, 'showdown', resolveShowdownHash);

    } catch (err) {
      console.error('[play]', err);
      GAME('play FAILED:', err instanceof Error ? err.message : err);
      store.setStatus('Transaction failed. Try again.', '#FF3B3B');
    }
  }, [isOnChain, store, writeAndWait, publicClient, _finishHand, address]);

  // ── fold ────────────────────────────────────────────────────────
  const fold = useCallback(async () => {
    if (!isOnChain) return;

    try {
      // Use pendingTableId if we're in a stuck decrypt state
      const tableId = pendingTableId.current ?? BigInt(store.tableId!);
      GAME('Player FOLDS');
      store.setPlayState('folding');
      store.setStatus('Folding…', '#FF3B3B');
      const foldHash = await writeAndWait('fold', {
        address: CONTRACT_ADDRESS, abi: CIPHER_POKER_ABI,
        functionName: 'fold', args: [tableId],
      });
      // Clear pending state
      pendingCtHashes.current = null;
      pendingTableId.current = null;
      // Let fold animation play before showing result
      await sleep(800);
      await _finishHand(tableId, 'fold', foldHash);
    } catch (err) {
      console.error('[fold]', err);
      GAME('fold FAILED:', err instanceof Error ? err.message : err);
      store.setStatus('Transaction failed. Try again.', '#FF3B3B');
    }
  }, [isOnChain, store, writeAndWait, _finishHand]);

  return { startHand, play, fold, retryDecrypt, isOnChain };
};
