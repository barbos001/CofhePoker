/**
 * useHoldemActions — Texas Hold'em game action hook (on-chain only).
 *
 * Flow: startHand → [preflop → flop → turn → river] → showdown → result
 * Each round: player acts (check/bet/fold) → bot FHE eval → resolve
 * If bot bets after player checks → player must call or fold
 */
import { useCallback, useRef } from 'react';
import { useAccount, useWriteContract, usePublicClient } from 'wagmi';
import { useGameStore } from '@/store/useGameStore';
import { HOLDEM_CONTRACT_ADDRESS, CIPHER_HOLDEM_ABI, HoldemState } from '@/config/contractHoldem';
import { useCofhe } from './useCofhe';
import { toast } from '@/components/ui/Toast';
import { sleep } from '@/lib/utils';
import { getCardData } from '@/lib/poker';
import { evaluate7 } from '@/lib/holdem';

const TX   = (...a: unknown[]) => console.log('%c[TX]',   'color:#39FF14;font-weight:bold', ...a);
const GAME = (...a: unknown[]) => console.log('%c[GAME]', 'color:#00BFFF;font-weight:bold', ...a);
const POLL = (...a: unknown[]) => console.log('%c[POLL]', 'color:#888;font-weight:bold',    ...a);

const POLL_MS   = 3_000;
const MAX_POLLS = 60;

async function pollUntilTrue(
  label: string,
  check: () => Promise<boolean>,
  interval = POLL_MS,
  maxTries = MAX_POLLS,
  onTick?: (sec: number) => void,
): Promise<boolean> {
  POLL(`Polling "${label}" — ${interval}ms × ${maxTries}`);
  const t0 = Date.now();
  for (let i = 0; i < maxTries; i++) {
    if (await check()) { POLL(`"${label}" ready (${i + 1})`); return true; }
    const sec = Math.round((Date.now() - t0) / 1000);
    POLL(`"${label}" not ready (${i + 1}/${maxTries}, ${sec}s)`);
    onTick?.(sec);
    await sleep(interval);
  }
  POLL(`"${label}" TIMED OUT`);
  return false;
}

// Round info for logging and status
type Round = 'preflop' | 'flop' | 'turn' | 'river';
const ROUND_LABELS: Record<Round, string> = {
  preflop: 'Pre-flop', flop: 'Flop', turn: 'Turn', river: 'River',
};

export const useHoldemActions = () => {
  const store                    = useGameStore();
  const { address, isConnected } = useAccount();
  const publicClient             = usePublicClient();
  const { decryptCard, decryptPublicCard, ensurePermit } = useCofhe();
  const { writeContractAsync }   = useWriteContract();

  const contractDeployed = HOLDEM_CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000';
  const isOnChain        = isConnected && contractDeployed;

  const pendingTableId = useRef<bigint | null>(null);


  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const writeAndWait = useCallback(async (fnName: string, args: any): Promise<`0x${string}`> => {
    TX(`${fnName}() — sending…`);
    const t0 = performance.now();
    const hash = await writeContractAsync(args);
    TX(`${fnName}() — tx: ${hash.slice(0, 14)}…`);
    const TX_TIMEOUT = 60_000;
    const receipt = await Promise.race([
      publicClient!.waitForTransactionReceipt({ hash }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Transaction timed out (60s). Check Etherscan and retry.')), TX_TIMEOUT)),
    ]);
    void receipt;
    TX(`${fnName}() — confirmed ${(performance.now() - t0).toFixed(0)}ms`);
    toast.tx(`${fnName} confirmed`, hash);
    return hash;
  }, [writeContractAsync, publicClient]);

  const getTableId = useCallback(async (): Promise<bigint> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await publicClient!.readContract({
      address: HOLDEM_CONTRACT_ADDRESS, abi: CIPHER_HOLDEM_ABI,
      functionName: 'getMyTableId', account: address,
    } as any) as bigint;
  }, [publicClient, address]);

  const readBalance = useCallback(async (): Promise<number> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bal = await publicClient!.readContract({
      address: HOLDEM_CONTRACT_ADDRESS, abi: CIPHER_HOLDEM_ABI,
      functionName: 'getBalance', account: address,
    } as any) as bigint;
    return Number(bal);
  }, [publicClient, address]);

  const getTableInfo = useCallback(async (tableId: bigint) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const info = await publicClient!.readContract({
      address: HOLDEM_CONTRACT_ADDRESS, abi: CIPHER_HOLDEM_ABI,
      functionName: 'getTableInfo', args: [tableId], account: address,
    } as any) as [string, number, bigint, bigint, boolean, boolean];
    return { state: info[1], pot: Number(info[2]), waitingForCall: info[4], playerBet: info[5] };
  }, [publicClient, address]);


  const startHand = useCallback(async () => {
    if (!isOnChain || !publicClient) return;
    try {
      await ensurePermit();
      GAME('═══ HOLD\'EM HAND ═══');
      store.setPlayState('dealing');
      store.setHoldemRound('preflop');
      store.setStatus('Creating table…', '#00BFFF');
      store.clearPlayerCards();
      store.clearCommunityCards();

      let tableId = await getTableId();
      if (tableId === 0n) {
        await writeAndWait('createTable', {
          address: HOLDEM_CONTRACT_ADDRESS, abi: CIPHER_HOLDEM_ABI,
          functionName: 'createTable',
        });
        tableId = await getTableId();
      }

      store.setTableId(Number(tableId));
      store.setBalance(await readBalance());
      pendingTableId.current = tableId;

      // Check for stuck hand
      const info = await getTableInfo(tableId);
      if (info.state !== HoldemState.WAITING && info.state !== HoldemState.COMPLETE) {
        GAME('Stuck hand — auto-folding…');
        store.setStatus('Recovering stuck hand…', '#FF8C42');
        await writeAndWait('fold', {
          address: HOLDEM_CONTRACT_ADDRESS, abi: CIPHER_HOLDEM_ABI,
          functionName: 'fold', args: [tableId],
        });
        store.setBalance(await readBalance());
      }

      store.setStatus('Posting blinds & dealing…', '#00BFFF');
      await writeAndWait('startHand', {
        address: HOLDEM_CONTRACT_ADDRESS, abi: CIPHER_HOLDEM_ABI,
        functionName: 'startHand', args: [tableId],
      });

      // Poll until PREFLOP
      store.setStatus('Generating encrypted cards… 0s', '#00BFFF');
      const ready = await pollUntilTrue('card generation', async () => {
        const i = await getTableInfo(tableId);
        return i.state === HoldemState.PREFLOP;
      }, POLL_MS, MAX_POLLS,
        (sec) => store.setStatus(`Generating encrypted cards… ${sec}s`, '#00BFFF'),
      );

      if (!ready) {
        store.setStatus('Card generation timed out.', '#FF3B3B');
        store.setPlayState('lobby');
        return;
      }

      // Decrypt 2 hole cards
      store.setPlayState('decrypting');
      const SYNC_WAIT = 20;
      for (let s = SYNC_WAIT; s > 0; s--) {
        store.setStatus(`Waiting for FHE sync… ${s}s`, '#00BFFF');
        await sleep(1000);
      }

      store.setStatus('Decrypting hole cards…', '#00BFFF');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [c0, c1] = await publicClient.readContract({
        address: HOLDEM_CONTRACT_ADDRESS, abi: CIPHER_HOLDEM_ABI,
        functionName: 'getMyCards', args: [tableId], account: address,
      } as any) as [bigint, bigint];

      for (const ct of [c0, c1]) {
        const cardId = await decryptCard(ct);
        store.revealPlayerCard(cardId);
        const d = getCardData(cardId);
        GAME(`Hole card → ${d.rankString}${d.suit}`);
      }

      store.setBalance(await readBalance());
      store.setPlayState('playerTurn');
      store.setStatus('Pre-flop: CHECK or BET', '#FFE03D');

    } catch (err) {
      console.error('[holdem:startHand]', err);
      store.setStatus('Error — try again.', '#FF3B3B');
      store.setPlayState('lobby');
    }
  }, [isOnChain, publicClient, store, writeAndWait, getTableId, readBalance, getTableInfo, decryptCard, address]);


  const actRound = useCallback(async (
    round: Round,
    action: 'check' | 'bet' | 'raise',
    actFn: string,
    pollFn: string,
    resolveFn: string,
    nextRound: Round | 'showdown',
    communityCount: number, // how many community cards to decrypt after this round
  ) => {
    if (!isOnChain || !publicClient) return;
    const tableId = pendingTableId.current ?? BigInt(store.tableId!);
    const actionCode = action === 'check' ? 0 : action === 'raise' ? 2 : 1;
    const label = ROUND_LABELS[round];

    try {
      GAME(`Player ${action.toUpperCase()}S at ${round}`);
      store.setPlayState('botThinking');
      store.setStatus(`Bot evaluating (${label})… 0s`, '#888888');

      await writeAndWait(actFn, {
        address: HOLDEM_CONTRACT_ADDRESS, abi: CIPHER_HOLDEM_ABI,
        functionName: actFn, args: [tableId, actionCode],
      });

      // Poll bot decision
      const botReady = await pollUntilTrue(`bot ${round} decision`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        () => publicClient.readContract({
          address: HOLDEM_CONTRACT_ADDRESS, abi: CIPHER_HOLDEM_ABI,
          functionName: pollFn, args: [tableId], account: address,
        } as any) as Promise<boolean>,
        POLL_MS, MAX_POLLS,
        (sec) => store.setStatus(`Bot evaluating (${label})… ${sec}s`, '#888888'),
      );

      if (!botReady) {
        store.setStatus('Bot decision timed out.', '#FF3B3B');
        return;
      }

      // Resolve
      store.setStatus('Resolving bot decision…', '#00BFFF');
      await writeAndWait(resolveFn, {
        address: HOLDEM_CONTRACT_ADDRESS, abi: CIPHER_HOLDEM_ABI,
        functionName: resolveFn, args: [tableId],
      });

      // Check new state
      const info = await getTableInfo(tableId);
      store.setBalance(await readBalance());

      if (info.state === HoldemState.COMPLETE) {
        GAME(`Bot FOLDED at ${round} → player wins`);
        await _finishHand(tableId, `Bot folded at ${round}`);
        return;
      }

      // Bot bet after player checked → need to call/fold
      if (info.waitingForCall) {
        GAME('Bot BET → player must call or fold');
        store.setPlayState('playerTurn');
        store.setStatus(`Bot bet! CALL or FOLD (${label})`, '#FF8C42');
        return;
      }

      // Advancing to next round — decrypt new community cards
      if (nextRound === 'showdown') {
        GAME('Round complete → showdown');
        await _handleShowdown(tableId);
        return;
      }

      store.setHoldemRound(nextRound);
      if (communityCount > 0) {
        await _decryptCommunity(tableId, communityCount, nextRound);
      }

      store.setPlayState('playerTurn');
      store.setStatus(`${ROUND_LABELS[nextRound]}: CHECK or BET`, '#FFE03D');

    } catch (err) {
      console.error(`[holdem:act${round}]`, err);
      store.setStatus(`Error at ${round}.`, '#FF3B3B');
    }
  }, [isOnChain, publicClient, store, writeAndWait, getTableInfo, readBalance, address]);


  const callBotAction = useCallback(async () => {
    if (!isOnChain || !publicClient) return;
    const tableId = pendingTableId.current ?? BigInt(store.tableId!);

    try {
      GAME('Player CALLS bot bet');
      store.setPlayState('decrypting');
      store.setStatus('Calling…', '#00BFFF');

      await writeAndWait('callBot', {
        address: HOLDEM_CONTRACT_ADDRESS, abi: CIPHER_HOLDEM_ABI,
        functionName: 'callBot', args: [tableId],
      });

      const info = await getTableInfo(tableId);
      store.setBalance(await readBalance());

      // Determine what round we advanced to
      if (info.state === HoldemState.AWAITING_SHOWDOWN) {
        await _handleShowdown(tableId);
        return;
      }

      const nextRound = stateToRound(info.state);
      if (nextRound) {
        store.setHoldemRound(nextRound);
        const communityCount = nextRound === 'flop' ? 3 : 1;
        await _decryptCommunity(tableId, communityCount, nextRound);
        store.setPlayState('playerTurn');
        store.setStatus(`${ROUND_LABELS[nextRound]}: CHECK or BET`, '#FFE03D');
      }

    } catch (err) {
      console.error('[holdem:callBot]', err);
      store.setStatus('Call failed.', '#FF3B3B');
    }
  }, [isOnChain, publicClient, store, writeAndWait, getTableInfo, readBalance]);


  const actPreflop = useCallback((action: 'check' | 'bet' | 'raise') =>
    actRound('preflop', action, 'actPreflop', 'isBotPfReady', 'resolveBotPreFlop', 'flop', 3),
  [actRound]);

  const actFlop = useCallback((action: 'check' | 'bet' | 'raise') =>
    actRound('flop', action, 'actFlop', 'isBotFlopReady', 'resolveBotFlop', 'turn', 1),
  [actRound]);

  const actTurn = useCallback((action: 'check' | 'bet' | 'raise') =>
    actRound('turn', action, 'actTurn', 'isBotTurnReady', 'resolveBotTurn', 'river', 1),
  [actRound]);

  const actRiver = useCallback((action: 'check' | 'bet' | 'raise') =>
    actRound('river', action, 'actRiver', 'isBotRiverReady', 'resolveBotRiver', 'showdown', 0),
  [actRound]);


  const fold = useCallback(async () => {
    if (!isOnChain) return;
    const tableId = pendingTableId.current ?? BigInt(store.tableId!);
    try {
      GAME('Player FOLDS');
      store.setPlayState('folding');
      store.setStatus('Folding…', '#FF3B3B');

      const foldHash = await writeAndWait('fold', {
        address: HOLDEM_CONTRACT_ADDRESS, abi: CIPHER_HOLDEM_ABI,
        functionName: 'fold', args: [tableId],
      });

      await sleep(800);
      const newBal = await readBalance();
      const delta = -10; // lost BB at minimum
      store.finishHand({
        result: 'FOLD',
        delta,
        desc: `Folded at ${store.holdemRound}`,
        pot: 0,
        balance: newBal,
        txHash: foldHash,
        playerCards: store.playerCards,
        botCards: [],
      });
    } catch (err) {
      console.error('[holdem:fold]', err);
      store.setStatus('Fold failed.', '#FF3B3B');
    }
  }, [isOnChain, store, writeAndWait, readBalance]);


  const _handleShowdown = useCallback(async (tableId: bigint) => {
    if (!publicClient) return;

    store.setPlayState('showdown');
    store.setStatus('Computing showdown (part 1)… 0s', '#00BFFF');

    // Part 1: compute bot's 7-card score
    await writeAndWait('computeShowdownP1', {
      address: HOLDEM_CONTRACT_ADDRESS, abi: CIPHER_HOLDEM_ABI,
      functionName: 'computeShowdownP1', args: [tableId],
    });

    store.setStatus('Computing showdown (part 2)… 0s', '#00BFFF');

    // Part 2: compute player's score + comparison
    await writeAndWait('computeShowdownP2', {
      address: HOLDEM_CONTRACT_ADDRESS, abi: CIPHER_HOLDEM_ABI,
      functionName: 'computeShowdownP2', args: [tableId],
    });

    // Poll showdown result
    store.setStatus('Determining winner (FHE)… 0s', '#00BFFF');
    const showdownReady = await pollUntilTrue('showdown',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      () => publicClient.readContract({
        address: HOLDEM_CONTRACT_ADDRESS, abi: CIPHER_HOLDEM_ABI,
        functionName: 'isShowdownReady', args: [tableId], account: address,
      } as any) as Promise<boolean>,
      POLL_MS, MAX_POLLS,
      (sec) => store.setStatus(`Determining winner (FHE)… ${sec}s`, '#00BFFF'),
    );

    if (!showdownReady) {
      store.setStatus('Showdown timed out.', '#FF3B3B');
      return;
    }

    store.setStatus('Revealing winner…', '#00BFFF');
    const showdownHash = await writeAndWait('resolveShowdown', {
      address: HOLDEM_CONTRACT_ADDRESS, abi: CIPHER_HOLDEM_ABI,
      functionName: 'resolveShowdown', args: [tableId],
    });

    await _finishHand(tableId, 'showdown', showdownHash);
  }, [publicClient, store, writeAndWait, address]);


  const _decryptCommunity = useCallback(async (tableId: bigint, count: number, round: Round) => {
    if (!publicClient) return;
    store.setPlayState('decrypting');

    const SYNC = round === 'flop' ? 15 : 10;
    for (let s = SYNC; s > 0; s--) {
      store.setStatus(`Syncing ${ROUND_LABELS[round]} cards… ${s}s`, '#00BFFF');
      await sleep(1000);
    }

    store.setStatus(`Decrypting ${ROUND_LABELS[round]} cards…`, '#00BFFF');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comm = await publicClient.readContract({
      address: HOLDEM_CONTRACT_ADDRESS, abi: CIPHER_HOLDEM_ABI,
      functionName: 'getCommunityCards', args: [tableId], account: address,
    } as any) as [bigint, bigint, bigint, bigint, bigint];

    // Determine which cards to decrypt based on round
    let startIdx: number;
    if (round === 'flop') startIdx = 0;
    else if (round === 'turn') startIdx = 3;
    else startIdx = 4; // river

    for (let i = startIdx; i < startIdx + count; i++) {
      const cardId = await decryptPublicCard(comm[i]);
      store.revealCommunityCard(cardId);
      const d = getCardData(cardId);
      GAME(`Community[${i}] → ${d.rankString}${d.suit}`);
    }

    // Evaluate player's hand for display
    if (store.playerCards.length >= 2 && store.communityCards.length >= 3) {
      const allCards = [...store.playerCards, ...store.communityCards];
      const ev = evaluate7(allCards);
      store.setPlayerEval(ev);
      GAME(`Player hand: ${ev.name}`);
    }
  }, [publicClient, store, decryptPublicCard, address]);


  const _finishHand = useCallback(async (tableId: bigint, desc: string, txHash = '' as `0x${string}`) => {
    if (!publicClient) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [winner, pot] = await publicClient.readContract({
      address: HOLDEM_CONTRACT_ADDRESS, abi: CIPHER_HOLDEM_ABI,
      functionName: 'getHandResult', args: [tableId], account: address,
    } as any) as [string, bigint];

    const playerAddr = address?.toLowerCase() ?? '';
    const playerWon  = winner.toLowerCase() === playerAddr;
    const potNum     = Number(pot);

    const result: 'WON' | 'LOST' = playerWon ? 'WON' : 'LOST';
    const newBal = await readBalance();
    const delta  = newBal - store.balance;

    GAME(`Result: ${result} | pot: ${potNum} | delta: ${delta > 0 ? '+' : ''}${delta}`);

    // Decrypt bot cards
    let botCards: number[] | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [b0, b1] = await publicClient.readContract({
        address: HOLDEM_CONTRACT_ADDRESS, abi: CIPHER_HOLDEM_ABI,
        functionName: 'getBotCards', args: [tableId], account: address,
      } as any) as [bigint, bigint];
      botCards = await Promise.all([b0, b1].map(h => decryptPublicCard(h)));

      // Evaluate bot's hand for display
      if (botCards.length === 2 && store.communityCards.length >= 3) {
        const allBot = [...botCards, ...store.communityCards];
        const ev = evaluate7(allBot);
        store.setBotEval(ev);
        GAME(`Bot hand: ${ev.name}`);
      }
    } catch {
      GAME('Bot cards not available');
    }

    store.finishHand({
      result, delta, desc,
      pot: potNum,
      balance: newBal,
      txHash,
      playerCards: store.playerCards,
      botCards,
    });
  }, [publicClient, address, store, readBalance, decryptPublicCard]);

  return {
    startHand,
    actPreflop, actFlop, actTurn, actRiver,
    callBot: callBotAction,
    fold,
    isOnChain,
  };
};


function stateToRound(state: number): Round | null {
  switch (state) {
    case HoldemState.PREFLOP: return 'preflop';
    case HoldemState.FLOP:    return 'flop';
    case HoldemState.TURN:    return 'turn';
    case HoldemState.RIVER:   return 'river';
    default:                  return null;
  }
}
