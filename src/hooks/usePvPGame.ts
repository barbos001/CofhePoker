/**
 * usePvPGame — PvP game action hook (mirrors useGameActions for PvE).
 */
import { useCallback, useRef } from 'react';
import { useAccount, useWriteContract, usePublicClient } from 'wagmi';
import { PVP_CONTRACT_ADDRESS, CIPHER_POKER_PVP_ABI, PvPState } from '@/config/contractPvP';
import { usePvPGameStore } from '@/store/usePvPGameStore';
import { useCofhe } from './useCofhe';
import { sleep } from '@/lib/utils';
import { evaluateHand, getCardData } from '@/lib/poker';

const TX   = (...args: unknown[]) => console.log('%c[PVP·TX]',   'color:#39FF14;font-weight:bold', ...args);
const GAME = (...args: unknown[]) => console.log('%c[PVP·GAME]', 'color:#FFE03D;font-weight:bold', ...args);
const POLL = (...args: unknown[]) => console.log('%c[PVP·POLL]', 'color:#888;font-weight:bold',    ...args);

async function pollUntilTrue(
  label: string,
  check: () => Promise<boolean>,
  interval = 3000,
  maxTries = 60,
): Promise<boolean> {
  POLL(`Polling "${label}"…`);
  for (let i = 0; i < maxTries; i++) {
    if (await check()) { POLL(`"${label}" ready ✓`); return true; }
    await sleep(interval);
  }
  POLL(`"${label}" TIMED OUT`);
  return false;
}

export const usePvPGame = () => {
  const gs = usePvPGameStore.getState;
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { decryptCard, decryptPublicCard } = useCofhe();
  const { writeContractAsync } = useWriteContract();

  const deployed  = PVP_CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000';
  const isOnChain = isConnected && deployed;
  const actingRef = useRef(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const writeAndWait = useCallback(async (fnName: string, args: any): Promise<`0x${string}`> => {
    TX(`${fnName}() — sending…`);
    const t0 = performance.now();
    const hash = await writeContractAsync(args);
    await publicClient!.waitForTransactionReceipt({ hash });
    TX(`${fnName}() — confirmed (${(performance.now() - t0).toFixed(0)}ms) ✓`);
    return hash;
  }, [writeContractAsync, publicClient]);

  const readBalance = useCallback(async (): Promise<number> => {
    if (!publicClient) return 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bal = await publicClient.readContract({
      address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
      functionName: 'getBalance', account: address,
    } as any) as bigint;
    return Number(bal);
  }, [publicClient, address]);

  const startPvPHand = useCallback(async () => {
    if (!isOnChain || !gs().tableId || actingRef.current) return;
    actingRef.current = true;
    const tableId = BigInt(gs().tableId);

    try {
      GAME('═══ NEW PVP HAND ═══');
      gs().setPvPState('dealing');
      gs().setStatus('Dealing encrypted cards (FHE)…', '#B366FF');

      await writeAndWait('startPvPHand', {
        address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
        functionName: 'startPvPHand', args: [tableId],
      });

      // Poll until ACTING state (cards generated)
      await pollUntilTrue('card generation', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const info = await publicClient!.readContract({
          address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
          functionName: 'getPvPTableInfo', args: [tableId],
        } as any) as [string, string, number, bigint, bigint, bigint, boolean, bigint];
        return info[2] >= PvPState.ACTING;
      });

      // Determine who I am
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const info = await publicClient!.readContract({
        address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
        functionName: 'getPvPTableInfo', args: [tableId],
      } as any) as [string, string, number, bigint, bigint, bigint, boolean, bigint];
      const amP1 = info[0].toLowerCase() === address!.toLowerCase();
      gs().setIsPlayer1(amP1);
      gs().setOpponent(amP1 ? info[1] : info[0]);

      // Decrypt my 3 cards
      gs().setPvPState('decrypting');
      gs().setStatus('Decrypting your cards…', '#B366FF');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [c0, c1, c2] = await publicClient!.readContract({
        address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
        functionName: 'getMyPvPCards', args: [tableId],
        account: address,
      } as any) as [bigint, bigint, bigint];

      GAME('Got 3 encrypted ctHashes');

      const revealed: number[] = [];
      for (const [i, ct] of [[0, c0], [1, c1], [2, c2]] as [number, bigint][]) {
        gs().setStatus(`Revealing card ${i + 1}/3…`, '#B366FF');
        const [card] = await Promise.all([decryptCard(ct), sleep(350)]);
        gs().revealMyCard(card);
        revealed.push(card);
        const d = getCardData(card);
        GAME(`Card ${i + 1}: ${d.rankString}${d.suit}`);
      }

      const myEval = evaluateHand(revealed);
      gs().setMyEval(myEval);
      GAME(`My hand: ${myEval.name} (${myEval.score})`);

      gs().setPvPState('acting');
      gs().setStatus('Your turn — Play or Fold?', '#FFF');
      gs().setBalance(await readBalance());
      gs().setPot(Number(info[3]));

    } catch (err) {
      console.error('[startPvPHand]', err);
      GAME('FAILED:', err instanceof Error ? err.message : err);
      gs().setStatus('Error — try again.', '#FF3B3B');
      gs().setPvPState('seated');
    } finally {
      actingRef.current = false;
    }
  }, [isOnChain, writeAndWait, publicClient, address, decryptCard, readBalance]);

  const pvpAct = useCallback(async (plays: boolean) => {
    if (!isOnChain || !gs().tableId || actingRef.current) return;
    actingRef.current = true;
    const tableId = BigInt(gs().tableId);

    try {
      GAME(`Player ${plays ? 'PLAYS' : 'FOLDS'}`);
      gs().setStatus(plays ? 'Placing bet…' : 'Folding…', plays ? '#FFF' : '#FF3B3B');

      const txHash = await writeAndWait('pvpAct', {
        address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
        functionName: 'pvpAct', args: [tableId, plays],
      });

      // Check if both have acted (state would have changed)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const info = await publicClient!.readContract({
        address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
        functionName: 'getPvPTableInfo', args: [tableId],
      } as any) as [string, string, number, bigint, bigint, bigint, boolean, bigint];

      const state = info[2];

      if (state === PvPState.COMPLETE) {
        // One or both folded — resolve immediately
        await _finishHand(tableId, txHash);
        return;
      }

      if (state === PvPState.AWAITING_SHOWDOWN) {
        // Both played → showdown. Only player1 resolves to avoid duplicate TXs.
        GAME('Both played → showdown');
        gs().setPvPState('showdown');
        gs().setStatus('Determining winner (FHE)…', '#B366FF');

        if (gs().isPlayer1) {
          const ready = await pollUntilTrue('pvp showdown', () =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            publicClient!.readContract({
              address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
              functionName: 'isPvPShowdownReady', args: [tableId],
            } as any) as Promise<boolean>
          );
          if (!ready) { gs().setStatus('Showdown timed out.', '#FF3B3B'); return; }
          gs().setStatus('Revealing winner…', '#B366FF');
          const resolveHash = await writeAndWait('resolvePvPShowdown', {
            address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
            functionName: 'resolvePvPShowdown', args: [tableId],
          });
          await _finishHand(tableId, resolveHash);
        } else {
          // Player2 just waits for P1 to resolve, then reads the result
          const complete = await pollUntilTrue('pvp complete (p2 wait)', async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const i = await publicClient!.readContract({
              address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
              functionName: 'getPvPTableInfo', args: [tableId],
            } as any) as [string, string, number, bigint, bigint, bigint, boolean, bigint];
            return i[2] === PvPState.COMPLETE;
          });
          if (!complete) { gs().setStatus('Showdown timed out.', '#FF3B3B'); return; }
          await _finishHand(tableId, txHash);
        }
        return;
      }

      // Opponent hasn't acted yet
      gs().setPvPState('waitingOpponent');
      gs().setStatus('Waiting for opponent…', '#888');

      // Poll until state changes from ACTING
      await pollUntilTrue('opponent action', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const i = await publicClient!.readContract({
          address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
          functionName: 'getPvPTableInfo', args: [tableId],
        } as any) as [string, string, number, bigint, bigint, bigint, boolean, bigint];
        return i[2] !== PvPState.ACTING;
      });

      // Re-read state
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const info2 = await publicClient!.readContract({
        address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
        functionName: 'getPvPTableInfo', args: [tableId],
      } as any) as [string, string, number, bigint, bigint, bigint, boolean, bigint];

      if (info2[2] === PvPState.COMPLETE) {
        await _finishHand(tableId, txHash);
      } else if (info2[2] === PvPState.AWAITING_SHOWDOWN) {
        gs().setPvPState('showdown');
        gs().setStatus('Determining winner (FHE)…', '#B366FF');

        // Only player1 resolves to avoid both players submitting the TX
        if (gs().isPlayer1) {
          await pollUntilTrue('pvp showdown', () =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            publicClient!.readContract({
              address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
              functionName: 'isPvPShowdownReady', args: [tableId],
            } as any) as Promise<boolean>
          );
          gs().setStatus('Revealing winner…', '#B366FF');
          const rHash = await writeAndWait('resolvePvPShowdown', {
            address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
            functionName: 'resolvePvPShowdown', args: [tableId],
          });
          await _finishHand(tableId, rHash);
        } else {
          const complete = await pollUntilTrue('pvp complete (p2 wait)', async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const i = await publicClient!.readContract({
              address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
              functionName: 'getPvPTableInfo', args: [tableId],
            } as any) as [string, string, number, bigint, bigint, bigint, boolean, bigint];
            return i[2] === PvPState.COMPLETE;
          });
          if (!complete) { gs().setStatus('Showdown timed out.', '#FF3B3B'); return; }
          await _finishHand(tableId, txHash);
        }
      }

    } catch (err) {
      console.error('[pvpAct]', err);
      GAME('FAILED:', err instanceof Error ? err.message : err);
      gs().setStatus('Transaction failed.', '#FF3B3B');
    } finally {
      actingRef.current = false;
    }
  }, [isOnChain, writeAndWait, publicClient, address, decryptPublicCard, readBalance]);

  const _finishHand = useCallback(async (tableId: bigint, txHash: `0x${string}`) => {
    if (!publicClient) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [winner, pot] = await publicClient.readContract({
      address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
      functionName: 'getPvPResult', args: [tableId],
    } as any) as [string, bigint];

    const potNum    = Number(pot);
    const myAddr    = address!.toLowerCase();
    const wonAddr   = winner.toLowerCase();
    const iWon      = wonAddr === myAddr;
    const isDraw    = winner === '0x0000000000000000000000000000000000000000';
    const newBal    = await readBalance();

    let result: 'WON' | 'LOST' | 'FOLD' | 'OPP_FOLD' | 'DRAW';
    let delta: number;
    let desc: string;

    if (isDraw) {
      result = 'DRAW';
      delta = 0;
      desc = 'Both folded — pot split';
    } else if (iWon) {
      result = 'WON';
      delta = potNum - 20;
      desc = 'You won the showdown!';
    } else {
      result = 'LOST';
      delta = -20;
      desc = 'Opponent won';
    }

    GAME(`PvP Result: ${result} | pot: ${potNum} | delta: ${delta > 0 ? '+' : ''}${delta}`);

    // Try to decrypt opponent cards (made public after hand)
    let oppCards: number[] | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [o0, o1, o2] = await publicClient.readContract({
        address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
        functionName: 'getOpponentCards', args: [tableId],
        account: address,
      } as any) as [bigint, bigint, bigint];

      oppCards = await Promise.all([o0, o1, o2].map(h => decryptPublicCard(h)));
      GAME(`Opponent cards: ${oppCards.map(c => { const d = getCardData(c); return d.rankString + d.suit; }).join(' ')}`);

      const oppEval = evaluateHand(oppCards);
      gs().setOpponentEval(oppEval);
    } catch {
      GAME('Opponent cards not available');
    }

    gs().finishPvPHand({ result, delta, desc, pot: potNum, balance: newBal, txHash, opponentCards: oppCards });
  }, [publicClient, address, readBalance, decryptPublicCard]);

  return { startPvPHand, pvpAct, isOnChain };
};
