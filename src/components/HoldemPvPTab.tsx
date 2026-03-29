/**
 * HoldemPvPTab — Lobby + game view for Hold'em PvP.
 * Full flow: idle → create/join → waiting → seated → playing → showdown → result
 * With polling at every stage for opponent actions.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, useWriteContract, usePublicClient } from 'wagmi';
import { HOLDEM_PVP_CONTRACT_ADDRESS, CIPHER_HOLDEM_PVP_ABI, HoldemPvPState } from '@/config/contractHoldemPvP';
import { useCofhe } from '@/hooks/useCofhe';
import { useGameStore } from '@/store/useGameStore';
import { getCardData } from '@/lib/poker';
import { evaluate7 } from '@/lib/holdem';
import { Card } from '@/components/ui/Card';
import { sleep } from '@/lib/utils';

const truncAddr = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;
const LOG = (...a: unknown[]) => console.log('%c[H-PVP]', 'color:#00BFFF;font-weight:bold', ...a);

type LobbyState = 'idle' | 'waiting' | 'seated' | 'playing' | 'showdown' | 'result';

interface TableEntry { id: number; creator: string; buyIn: number; }

interface HoldemPvPProps {
  roomLink?: { tableId: string; code?: string };
}

export const HoldemPvPTab = ({ roomLink }: HoldemPvPProps) => {
  const { isConnected, address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { decryptCard, decryptPublicCard, ensurePermit, isReady: cofheReady } = useCofhe();
  const setBalance = useGameStore(s => s.setBalance);
  const deployed = HOLDEM_PVP_CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000';

  const [lobbyState, setLobbyState] = useState<LobbyState>('idle');
  const [tables, setTables] = useState<TableEntry[]>([]);
  const [tableId, setTableId] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [buyIn, setBuyIn] = useState(25);
  const [isPrivate, setIsPrivate] = useState(false);
  const [inviteCode, setInviteCode] = useState(''); // full invite string "tableId:code"
  const [joinInput, setJoinInput] = useState('');  // single input for paste
  const [opponent, setOpponent] = useState('');
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [myCards, setMyCards] = useState<number[]>([]);
  const [oppCards, setOppCards] = useState<number[]>([]);
  const [communityCards, setCommunityCards] = useState<number[]>([]);
  const [pot, setPot] = useState(0);
  const [roundName, setRoundName] = useState('');
  const [handResult, setHandResult] = useState<{ winner: string; pot: number } | null>(null);
  const [myRoundBet, setMyRoundBet] = useState(0);
  const [oppRoundBet, setOppRoundBet] = useState(0);
  const [hasBetToMatch, setHasBetToMatch] = useState(false);
  const [turnTimer, setTurnTimer] = useState<number | null>(null);
  const [opponentTimeout, setOpponentTimeout] = useState(false);
  const [activityLog, setActivityLog] = useState<{ id: number; text: string; time: string }[]>([]);
  const logIdRef = useRef(0);
  const lastLogRef = useRef('');
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const logEndRef = useRef<HTMLDivElement>(null);

  const [narration, setNarration] = useState<{ text: string; key: number }[]>([]);
  const narrationKeyRef = useRef(0);
  const lastNarrationRef = useRef('');
  const autoStartRef = useRef<(() => void) | null>(null);

  const addLog = useCallback((msg: string) => {
    // Dedup: skip if identical to last message
    if (msg === lastLogRef.current) return;
    lastLogRef.current = msg;
    const id = ++logIdRef.current;
    const time = new Date().toLocaleTimeString();
    setActivityLog(prev => [...prev.slice(-19), { id, text: msg, time }]);
    // Auto-scroll
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readContract = useCallback(async (functionName: string, args?: unknown[]) => {
    return publicClient!.readContract({
      address: HOLDEM_PVP_CONTRACT_ADDRESS, abi: CIPHER_HOLDEM_PVP_ABI,
      functionName, args, account: address,
    } as any);
  }, [publicClient, address]);

  const refreshBalance = useCallback(async () => {
    try {
      const bal = Number(await readContract('getBalance') as bigint);
      setBalance(bal);
    } catch { /* */ }
  }, [readContract, setBalance]);

  const writeAndWait = useCallback(async (functionName: string, args?: unknown[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hash = await writeContractAsync({
      address: HOLDEM_PVP_CONTRACT_ADDRESS, abi: CIPHER_HOLDEM_PVP_ABI,
      functionName, args,
    } as any);
    const TX_TIMEOUT = 60_000;
    await Promise.race([
      publicClient!.waitForTransactionReceipt({ hash }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Transaction timed out (60s). Check Etherscan and retry.')), TX_TIMEOUT)),
    ]);
    return hash;
  }, [writeContractAsync, publicClient]);

  const stateToRound = (s: number): string => {
    switch (s) {
      case HoldemPvPState.PREFLOP: return 'Pre-flop';
      case HoldemPvPState.FLOP: return 'Flop';
      case HoldemPvPState.TURN: return 'Turn';
      case HoldemPvPState.RIVER: return 'River';
      default: return '';
    }
  };

  const pollTableState = useCallback(async () => {
    if (!deployed || !publicClient || !tableId || !address) return;
    try {
      const info = await readContract('getTableInfo', [BigInt(tableId)]) as [string, string, number, bigint, bigint, bigint, boolean, string];
      const [p1, p2, state, potVal, , , , nextToAct] = info;
      setPot(Number(potVal));

      const opp = p1.toLowerCase() === address.toLowerCase() ? p2 : p1;
      if (opp !== '0x0000000000000000000000000000000000000000') setOpponent(opp);

      const myTurn = nextToAct.toLowerCase() === address.toLowerCase();
      setIsMyTurn(myTurn);

      // Fetch betting state for context-aware buttons
      if (state >= HoldemPvPState.PREFLOP && state <= HoldemPvPState.RIVER) {
        try {
          const bs = await readContract('getBettingState', [BigInt(tableId)]) as [bigint, bigint, bigint, bigint, boolean, boolean, number, bigint];
          const isP1 = p1.toLowerCase() === address.toLowerCase();
          const myBet = Number(isP1 ? bs[0] : bs[1]);
          const oBet  = Number(isP1 ? bs[1] : bs[0]);
          setMyRoundBet(myBet);
          setOppRoundBet(oBet);
          setHasBetToMatch(oBet > myBet);
          // Check opponent timeout
          if (!myTurn) {
            try {
              const currentBlock = await publicClient!.getBlockNumber();
              const turnBlock = Number(bs[7]); // turnStartBlock is last field
              if (currentBlock - BigInt(turnBlock) >= 50n) {
                setOpponentTimeout(true);
              } else {
                setOpponentTimeout(false);
              }
            } catch { setOpponentTimeout(false); }
          }
        } catch { /* getBettingState may not exist on old deploy */ }
      }

      if (state === HoldemPvPState.OPEN) {
        if (lobbyState !== 'waiting') addLog('Waiting for opponent to join...');
        setLobbyState('waiting');
        setStatus('Waiting for opponent...');
      } else if (state === HoldemPvPState.BOTH_SEATED) {
        if (lobbyState !== 'seated') {
          addLog(`Opponent joined: ${truncAddr(opp)}`);
          addLog('Auto-starting hand...');
          setLobbyState('seated');
          setStatus('Opponent joined — starting hand...');
          // Auto-start the hand via ref (handleStartHand defined later)
          setTimeout(() => autoStartRef.current?.(), 500);
          return;
        }
        setLobbyState('seated');
        setStatus('Both seated — tap Start Hand');
      } else if (state >= HoldemPvPState.PREFLOP && state <= HoldemPvPState.RIVER) {
        const rn = stateToRound(state);
        if (roundName !== rn) addLog(`Round: ${rn}`);
        if (myTurn && !isMyTurn) addLog('Your turn to act');
        if (!myTurn && isMyTurn) addLog('Waiting for opponent...');
        setLobbyState('playing');
        setRoundName(rn);
        setStatus(myTurn ? `${rn} — Your turn` : `${rn} — Waiting for opponent...`);
      } else if (state === HoldemPvPState.AWAITING_SHOWDOWN) {
        if (lobbyState !== 'showdown') addLog('All rounds complete — Showdown');
        setLobbyState('showdown');
        setStatus('Showdown — computing results...');
      } else if (state === HoldemPvPState.COMPLETE) {
        if (lobbyState !== 'result') {
          // Fetch result + update balance
          const [winner, resPot] = await readContract('getResult', [BigInt(tableId)]) as [string, bigint];
          setHandResult({ winner, pot: Number(resPot) });
          setLobbyState('result');
          await refreshBalance();

          // Try to decrypt opponent cards
          try {
            const [oc0, oc1] = await readContract('getOpponentCards', [BigInt(tableId)]) as [bigint, bigint];
            const oCards = await Promise.all([oc0, oc1].map(h => decryptPublicCard(h)));
            setOppCards(oCards);
          } catch { /* may not be revealed yet */ }
        }
      }
    } catch (e) {
      LOG('Poll error:', e);
    }
  }, [deployed, publicClient, tableId, address, readContract, lobbyState, decryptPublicCard]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!tableId || lobbyState === 'idle') return;

    // Poll immediately, then every 4s
    pollTableState();
    pollRef.current = setInterval(pollTableState, 8000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [tableId, lobbyState, pollTableState]);

  const refreshLobby = useCallback(async () => {
    if (!deployed || !publicClient) return;
    try {
      const count = Number(await readContract('getOpenTableCount') as bigint);
      if (count === 0) { setTables([]); return; }
      const ids = await readContract('getOpenTables', [0n, BigInt(Math.min(count, 20))]) as bigint[];
      const entries: TableEntry[] = [];
      for (const id of ids) {
        const info = await readContract('getTableInfo', [id]) as [string, string, number, bigint, bigint, bigint, boolean, string];
        entries.push({ id: Number(id), creator: info[0], buyIn: Number(info[5]) });
      }
      setTables(entries);
    } catch (e) { LOG('Lobby load error:', e); }
  }, [deployed, publicClient, readContract]);

  useEffect(() => {
    if (lobbyState === 'idle') {
      refreshLobby();
      const id = setInterval(refreshLobby, 10_000);
      return () => clearInterval(id);
    }
  }, [lobbyState, refreshLobby]);

  useEffect(() => {
    if (!deployed || !publicClient || !address) return;
    refreshBalance();
    (async () => {
      try {
        const seat = Number(await readContract('getMySeat') as bigint);
        if (seat > 0) {
          setTableId(seat);

          // Restore invite code for private waiting rooms
          try {
            const info = await readContract('getTableInfo', [BigInt(seat)]) as [string, string, number, bigint, bigint, bigint, boolean, string];
            const isPrivateTable = info[6];
            const state = info[2];
            if (isPrivateTable && state === HoldemPvPState.OPEN) {
              const code = await readContract('getInviteCode', [BigInt(seat)]) as `0x${string}`;
              setInviteCode(`${seat}:${code}`);
              setIsPrivate(true);
            }
          } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    })();
  }, [deployed, publicClient, address, readContract]);

  const roomLinkHandled = useRef(false);
  useEffect(() => {
    if (!roomLink || roomLinkHandled.current || !deployed || !publicClient || !address) return;
    roomLinkHandled.current = true;

    (async () => {
      const tid = parseInt(roomLink.tableId);
      if (isNaN(tid) || tid <= 0) return;

      // Check if already seated
      const seat = Number(await readContract('getMySeat') as bigint);
      if (seat === tid) {
        setTableId(tid);
        return; // pollTableState will handle
      }

      setLoading(true);
      setError('');
      try {
        if (roomLink.code) {
          // Private room — join by invite code
          await writeAndWait('joinByInviteCode', [BigInt(tid), roomLink.code as `0x${string}`]);
        } else {
          // Public room — join directly
          await writeAndWait('joinTable', [BigInt(tid)]);
        }
        setTableId(tid);
        setLobbyState('seated');
        addLog(`Joined table #${tid} via link`);
        LOG(`Auto-joined table #${tid}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to join via link');
      }
      setLoading(false);
    })();
  }, [roomLink, deployed, publicClient, address, readContract, writeAndWait, addLog]);

  const [decryptingCards, setDecryptingCards] = useState(false);
  const decryptRetryCount = useRef(0);
  const MAX_DECRYPT_RETRIES = 3;

  useEffect(() => {
    if (lobbyState !== 'playing' || !tableId || myCards.length > 0 || decryptingCards || !cofheReady) return;
    if (decryptRetryCount.current >= MAX_DECRYPT_RETRIES) {
      addLog('FHE: Card decrypt failed after max retries');
      setStatus('Decrypt failed — try leaving and rejoining');
      return;
    }
    setDecryptingCards(true);
    decryptRetryCount.current++;
    addLog(`FHE: Decrypting your hole cards... (attempt ${decryptRetryCount.current})`);
    (async () => {
      try {
        setStatus('Decrypting your cards...');
        const [c0, c1] = await readContract('getMyCards', [BigInt(tableId)]) as [bigint, bigint];
        const cards = [];
        for (const ct of [c0, c1]) {
          const cardId = await decryptCard(ct);
          cards.push(cardId);
          const d = getCardData(cardId);
          LOG(`Hole card: ${d.rankString}${d.suit}`);
        }
        setMyCards(cards);
        decryptRetryCount.current = 0; // reset on success
        addLog(`Cards decrypted: ${cards.map(c => { const d = getCardData(c); return d.rankString + d.suit; }).join(' ')}`);
      } catch (e) {
        LOG('Card decrypt error:', e);
        addLog('FHE: Card decrypt failed, retrying...');
      }
      setDecryptingCards(false);
    })();
  }, [lobbyState, tableId, myCards.length, decryptingCards, cofheReady, readContract, decryptCard]);

  const prevRound = useRef('');
  const [decryptingCommunity, setDecryptingCommunity] = useState(false);
  useEffect(() => {
    if (roundName === prevRound.current || !tableId || decryptingCommunity) return;
    prevRound.current = roundName;

    const expectedCount = roundName === 'Flop' ? 3 : roundName === 'Turn' ? 4 : roundName === 'River' ? 5 : 0;
    if (expectedCount <= communityCards.length) return;

    setDecryptingCommunity(true);
    addLog(`FHE: Decrypting ${roundName} cards...`);
    (async () => {
      try {
        setStatus(`Decrypting ${roundName} cards...`);
        const comm = await readContract('getCommunityCards', [BigInt(tableId)]) as [bigint, bigint, bigint, bigint, bigint];
        const newCards: number[] = [];
        for (let i = communityCards.length; i < expectedCount; i++) {
          const cardId = await decryptPublicCard(comm[i]);
          newCards.push(cardId);
          const d = getCardData(cardId);
          LOG(`Community[${i}]: ${d.rankString}${d.suit}`);
        }
        setCommunityCards(prev => [...prev, ...newCards]);
      } catch (e) { LOG('Community decrypt error:', e); }
      setDecryptingCommunity(false);
    })();
  }, [roundName, tableId, communityCards.length, decryptingCommunity, readContract, decryptPublicCard]);

  const handleCreate = useCallback(async () => {
    if (!deployed) { setError('Contract not deployed'); return; }
    setLoading(true); setError('');
    try {
      await ensurePermit();

      // Check if already seated — handle based on table state
      try {
        const existingSeat = Number(await readContract('getMySeat') as bigint);
        if (existingSeat > 0) {
          const info = await readContract('getTableInfo', [BigInt(existingSeat)]) as [string, string, number, bigint, bigint, bigint, boolean, string];
          const state = info[2];

          if (state === HoldemPvPState.OPEN) {
            // Table still open — restore it instead of creating new
            LOG(`Already have OPEN table #${existingSeat} — restoring`);
            setTableId(existingSeat);
            setLobbyState('waiting');
            addLog(`Restored table #${existingSeat}`);
            if (info[6]) { // isPrivate
              try {
                const code = await readContract('getInviteCode', [BigInt(existingSeat)]) as `0x${string}`;
                setInviteCode(`${existingSeat}:${code}`);
                setIsPrivate(true);
              } catch { /* */ }
            }
            setLoading(false);
            return;
          }

          if (state >= HoldemPvPState.PREFLOP && state <= HoldemPvPState.AWAITING_SHOWDOWN) {
            // Active game — resume it
            LOG(`Resuming active game at table #${existingSeat}`);
            setTableId(existingSeat);
            setLobbyState('playing');
            addLog(`Resumed game at table #${existingSeat}`);
            setLoading(false);
            return;
          }

          // COMPLETE or BOTH_SEATED — safe to auto-leave
          if (state === HoldemPvPState.COMPLETE || state === HoldemPvPState.BOTH_SEATED) {
            LOG(`Already seated at #${existingSeat} (state ${state}) — leaving first`);
            addLog(`Leaving stale table #${existingSeat}...`);
            await writeAndWait('leaveTable', [BigInt(existingSeat)]);
          }
        }
      } catch { /* no seat — proceed */ }

      await writeAndWait('createTable', [BigInt(buyIn), isPrivate]);

      const seat = Number(await readContract('getMySeat') as bigint);
      if (seat === 0) { setError('Table creation failed'); setLoading(false); return; }

      setTableId(seat);
      setLobbyState('waiting');
      addLog(`Table #${seat} created (${isPrivate ? 'private' : 'public'})`);

      // For private: fetch invite code — show as "tableId:code"
      if (isPrivate) {
        try {
          const code = await readContract('getInviteCode', [BigInt(seat)]) as `0x${string}`;
          setInviteCode(`${seat}:${code}`);
        } catch { /* */ }
      }
    } catch (e) {
      // User rejected or TX failed
      const msg = e instanceof Error ? e.message : 'Failed';
      if (msg.includes('User rejected') || msg.includes('denied') || msg.includes('timed out')) {
        setError('Transaction cancelled');
      } else {
        setError(msg);
      }
    }
    setLoading(false);
  }, [deployed, buyIn, isPrivate, writeAndWait, readContract, addLog]);

  const handleJoin = useCallback(async (id: number) => {
    if (!deployed) return;
    setLoading(true); setError('');
    try {
      // Auto-leave stale table first
      try {
        const existingSeat = Number(await readContract('getMySeat') as bigint);
        if (existingSeat > 0 && existingSeat !== id) {
          await writeAndWait('leaveTable', [BigInt(existingSeat)]);
        }
      } catch { /* */ }
      // Validate table before joining
      const info = await readContract('getTableInfo', [BigInt(id)]) as [string, string, number, bigint, bigint, bigint, boolean, string];
      const state = info[2];
      if (state !== HoldemPvPState.OPEN) { setError('Table is no longer open'); setLoading(false); return; }
      if (info[1] !== '0x0000000000000000000000000000000000000000') { setError('Table is full'); setLoading(false); return; }

      await writeAndWait('joinTable', [BigInt(id)]);
      setTableId(id);
      setLobbyState('seated');
      LOG(`Joined table #${id}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  }, [deployed, writeAndWait, readContract]);

  const handleJoinByCode = useCallback(async () => {
    if (!deployed || !joinInput.trim()) { setError('Paste the room link or invite code'); return; }
    setLoading(true); setError('');
    try {
      let tid: number;
      let code: string | undefined;

      const input = joinInput.trim();

      // Parse full URL: https://...#/room/holdem/5:0xcode
      const urlMatch = input.match(/#\/room\/(?:3card|holdem)\/(.+)$/);
      if (urlMatch) {
        const rest = urlMatch[1];
        const ci = rest.indexOf(':');
        if (ci === -1) {
          tid = parseInt(rest);
        } else {
          tid = parseInt(rest.slice(0, ci));
          code = rest.slice(ci + 1);
        }
      } else {
        // Parse short format: "5:0xcode" or just "5"
        const ci = input.indexOf(':');
        if (ci === -1) {
          tid = parseInt(input);
        } else {
          tid = parseInt(input.slice(0, ci));
          code = input.slice(ci + 1);
        }
      }

      if (isNaN(tid!) || tid! <= 0) { setError('Invalid table ID'); setLoading(false); return; }

      // Validate table before joining
      const info = await readContract('getTableInfo', [BigInt(tid)]) as [string, string, number, bigint, bigint, bigint, boolean, string];
      const tState = info[2];
      if (tState !== HoldemPvPState.OPEN) { setError('Table is no longer open'); setLoading(false); return; }
      if (info[1] !== '0x0000000000000000000000000000000000000000') { setError('Table is full'); setLoading(false); return; }

      if (code) {
        await writeAndWait('joinByInviteCode', [BigInt(tid), code as `0x${string}`]);
      } else {
        await writeAndWait('joinTable', [BigInt(tid)]);
      }
      setTableId(tid);
      setLobbyState('seated');
      LOG(`Joined table #${tid}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Invalid link or table'); }
    setLoading(false);
  }, [deployed, joinInput, writeAndWait]);

  const handleStartHand = useCallback(async () => {
    if (!tableId) return;
    setLoading(true); setError('');

    // Verify table is actually ready (both players seated)
    try {
      const info = await readContract('getTableInfo', [BigInt(tableId)]) as [string, string, number, bigint, bigint, bigint, boolean, string];
      const state = info[2];
      if (state === HoldemPvPState.OPEN) {
        setError('Waiting for opponent to join');
        setLobbyState('waiting');
        setLoading(false);
        return;
      }
      if (state !== HoldemPvPState.BOTH_SEATED && state !== HoldemPvPState.COMPLETE) {
        setError('Game already in progress');
        setLoading(false);
        return;
      }
    } catch (e) {
      LOG('Failed to verify table state before startHand:', e);
      setError('Could not verify table state. Try again.');
      setLoading(false);
      return;
    }

    setMyCards([]); setCommunityCards([]); setOppCards([]); setHandResult(null);
    prevRound.current = '';
    decryptRetryCount.current = 0;
    try {
      await ensurePermit();
      await writeAndWait('startHand', [BigInt(tableId)]);
      setLobbyState('playing');
      await refreshBalance(); // ante deducted
      addLog('Hand started — dealing encrypted cards');
      addLog('FHE: Generating 9 encrypted cards (3 seeds)');
      LOG('Hand started');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed';
      // If TX failed but opponent already started — re-sync state from chain
      if (msg.includes('Cannot start') || msg.includes('reverted')) {
        addLog('Hand already started by opponent — syncing...');
        await pollTableState();
      } else {
        setError(msg);
      }
    }
    setLoading(false);
  }, [tableId, writeAndWait, readContract, addLog, ensurePermit, refreshBalance, pollTableState]);

  // Keep auto-start ref in sync
  autoStartRef.current = handleStartHand;

  const handleLeave = useCallback(async () => {
    if (!tableId) return;
    try {
      // leaveTable handles forfeit automatically if game is active
      await writeAndWait('leaveTable', [BigInt(tableId)]);
      setTableId(null);
      setLobbyState('idle');
      setMyCards([]); setCommunityCards([]); setOppCards([]);
      refreshLobby();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
  }, [tableId, lobbyState, writeAndWait, refreshLobby, addLog]);

  const actingRef = useRef(false);
  const handleAct = useCallback(async (action: number) => {
    if (!tableId || actingRef.current) return;
    actingRef.current = true;
    setLoading(true); setError('');
    try {
      const actionNames: Record<number, string> = { 0: 'Check', 1: 'Bet', 2: 'Raise', 3: 'Fold', 4: 'Call', 5: 'All-in' };
      await writeAndWait('act', [BigInt(tableId), action]);
      addLog(`You: ${actionNames[action] ?? 'Act'}`);
      setIsMyTurn(false);
      setStatus('Waiting for opponent...');
      await pollTableState();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
    actingRef.current = false;
  }, [tableId, writeAndWait, pollTableState]);

  const handleFold = useCallback(async () => {
    if (!tableId || actingRef.current) return;
    actingRef.current = true;
    setLoading(true);
    try {
      await writeAndWait('fold', [BigInt(tableId)]);
      addLog('You: Fold');
      await pollTableState();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
    actingRef.current = false;
  }, [tableId, writeAndWait, pollTableState]);

  const handleShowdown = useCallback(async () => {
    if (!tableId) return;
    setLoading(true); setError('');
    try {
      addLog('FHE: Computing both 7-card hands...');
      setStatus('Computing showdown (FHE)...');
      await writeAndWait('computeShowdown', [BigInt(tableId)]);
      addLog('FHE: Both hands evaluated');

      // Poll for FHE decrypt result
      addLog('FHE: Waiting for threshold decrypt...');
      setStatus('Waiting for FHE decrypt...');
      for (let i = 0; i < 60; i++) {
        const ready = await readContract('isShowdownReady', [BigInt(tableId)]) as boolean;
        if (ready) break;
        await sleep(3000);
      }

      setStatus('Resolving winner...');
      await writeAndWait('resolveShowdown', [BigInt(tableId)]);
      addLog('Winner determined!');
      await pollTableState();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  }, [tableId, writeAndWait, readContract, pollTableState, addLog]);

  const myHandName = myCards.length >= 2 && communityCards.length >= 3
    ? evaluate7([...myCards, ...communityCards]).name : '';

  const narrate = useCallback((text: string) => {
    if (text === lastNarrationRef.current) return;
    lastNarrationRef.current = text;
    const key = ++narrationKeyRef.current;
    setNarration(prev => [...prev.slice(-4), { text, key }]);
  }, []);

  useEffect(() => {
    if (decryptingCards) narrate('The dealer slides two cards face-down across the felt. CoFHE threshold network begins decrypting...');
  }, [decryptingCards, narrate]);

  useEffect(() => {
    if (decryptingCommunity && roundName === 'Flop') narrate('Three community cards hit the board. The flop is being revealed through FHE decryption...');
    else if (decryptingCommunity && roundName === 'Turn') narrate('The turn card burns and flips. One more card joins the board...');
    else if (decryptingCommunity && roundName === 'River') narrate('The final card. The river decides everything...');
  }, [decryptingCommunity, roundName, narrate]);

  useEffect(() => {
    if (myCards.length === 2 && !decryptingCards) {
      const c = myCards.map(id => { const d = getCardData(id); return d.rankString + d.suit; });
      narrate(`Cards revealed: ${c.join(' ')}. Time to make a decision.`);
    }
  }, [myCards.length, decryptingCards, myCards, narrate]);

  useEffect(() => {
    if (isMyTurn && myCards.length >= 2 && !decryptingCards && !decryptingCommunity) {
      if (hasBetToMatch) narrate(`Opponent has bet. The pressure is on — call ${oppRoundBet - myRoundBet} chips, raise, or walk away?`);
      else if (roundName === 'Pre-flop') narrate('Pre-flop action. Check to see more cards for free, or bet to build the pot?');
      else narrate(`${roundName} action. The board tells a story — what will you do?`);
    } else if (!isMyTurn && lobbyState === 'playing' && myCards.length >= 2) {
      narrate('Opponent is thinking... The tension builds at the table.');
    }
  }, [isMyTurn, hasBetToMatch, roundName, myCards.length, decryptingCards, decryptingCommunity, lobbyState, oppRoundBet, myRoundBet, narrate]);

  useEffect(() => {
    if (lobbyState === 'showdown') narrate('All bets are in. The cards speak now — FHE evaluation determines the winner...');
  }, [lobbyState, narrate]);

  useEffect(() => {
    if (!isMyTurn || lobbyState !== 'playing') {
      setTurnTimer(null);
      return;
    }
    const TURN_TIMEOUT = 120; // 2 min for PvP
    setTurnTimer(TURN_TIMEOUT);
    const id = setInterval(() => {
      setTurnTimer(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(id);
          // Auto-fold on timeout
          handleFold();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isMyTurn, lobbyState]);

  useEffect(() => {
    if (lobbyState !== 'playing' && lobbyState !== 'showdown') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [lobbyState]);

  if (!deployed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <p className="font-mono text-sm" style={{ color: 'var(--color-danger)' }}>Hold'em PvP contract not deployed</p>
      </div>
    );
  }

  if (lobbyState === 'idle') {
    return (
      <div className="w-full max-w-[900px] mx-auto py-8 px-4 min-h-[calc(100vh-160px)]">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="font-clash text-3xl tracking-tight" style={{ color: '#00BFFF' }}>Hold'em PvP</h2>
            <p className="font-mono text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {tables.length} open table{tables.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={refreshLobby}
            className="h-10 px-4 rounded-xl font-mono text-xs tracking-wider uppercase"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>
            REFRESH
          </button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-2.5 rounded-xl font-mono text-xs flex items-center justify-between gap-3" style={{ background: 'rgba(255,59,59,0.08)', border: '1px solid rgba(255,59,59,0.2)', color: 'var(--color-danger)' }}>
            <span>{error}</span>
            <button
              onClick={async () => {
                setError('');
                try {
                  const seat = Number(await readContract('getMySeat') as bigint);
                  if (seat > 0) {
                    await writeAndWait('leaveTable', [BigInt(seat)]);
                    addLog(`Left table #${seat}`);
                  }
                  refreshLobby();
                } catch { /* */ }
              }}
              className="shrink-0 px-3 py-1.5 rounded-lg font-mono text-[10px] font-bold uppercase"
              style={{ background: 'rgba(255,59,59,0.15)', color: 'var(--color-danger)' }}
            >
              FORCE LEAVE
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* ── Create Room Panel ── */}
          <div className="lg:col-span-1 rounded-2xl p-5 space-y-4"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <h3 className="font-mono text-sm font-bold tracking-wider uppercase" style={{ color: 'rgba(255,255,255,0.9)' }}>Create Room</h3>

            {/* Buy-in */}
            <div>
              <span className="font-mono text-[10px] tracking-wider uppercase block mb-2" style={{ color: 'var(--color-text-muted)' }}>Buy-in</span>
              <div className="flex gap-1.5">
                {[10, 25, 50, 100].map(v => (
                  <button key={v} onClick={() => setBuyIn(v)}
                    className="flex-1 h-9 rounded-lg font-mono text-xs font-bold"
                    style={{
                      background: buyIn === v ? '#00BFFF' : 'rgba(255,255,255,0.04)',
                      color: buyIn === v ? '#000' : 'rgba(255,255,255,0.5)',
                      border: buyIn === v ? 'none' : '1px solid rgba(255,255,255,0.08)',
                    }}>{v}</button>
                ))}
              </div>
            </div>

            {/* Public / Private toggle */}
            <button onClick={() => setIsPrivate(!isPrivate)}
              className="flex items-center gap-3 w-full py-2.5 px-3 rounded-xl font-mono text-xs transition-all"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)' }}>
              <div className="w-9 h-5 rounded-full relative transition-all shrink-0"
                style={{ background: isPrivate ? 'var(--color-fhe)' : 'rgba(255,255,255,0.1)' }}>
                <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: isPrivate ? 18 : 2 }} />
              </div>
              <span>{isPrivate ? 'Private (invite code)' : 'Public (visible in lobby)'}</span>
            </button>

            <button onClick={handleCreate} disabled={loading}
              className="w-full h-11 rounded-xl font-mono text-sm font-bold tracking-wider uppercase disabled:opacity-50"
              style={{ background: '#00BFFF', color: '#000' }}>
              {loading ? 'CREATING...' : '+ CREATE TABLE'}
            </button>
          </div>

          {/* ── Join by Code Panel ── */}
          <div className="lg:col-span-1 rounded-2xl p-5 space-y-4"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <h3 className="font-mono text-sm font-bold tracking-wider uppercase" style={{ color: 'rgba(255,255,255,0.9)' }}>Join by Link</h3>

            <div>
              <span className="font-mono text-[10px] tracking-wider uppercase block mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Paste room link or code</span>
              <input value={joinInput} onChange={e => setJoinInput(e.target.value)} placeholder="https://...#/room/holdem/5:0x..."
                className="w-full h-10 px-3 rounded-lg font-mono text-[10px]"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', outline: 'none' }}
                onFocus={e => e.currentTarget.style.borderColor = 'rgba(179,102,255,0.4)'}
                onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'} />
              <span className="font-mono text-[9px] mt-1 block" style={{ color: 'rgba(255,255,255,0.25)' }}>
                Accepts full URL, short code, or table ID
              </span>
            </div>

            <button onClick={handleJoinByCode} disabled={loading || !joinInput.trim()}
              className="w-full h-11 rounded-xl font-mono text-sm font-bold tracking-wider uppercase disabled:opacity-30"
              style={{ background: 'var(--color-fhe)', color: '#000' }}>
              JOIN
            </button>
          </div>

          {/* ── Open Tables Panel ── */}
          <div className="lg:col-span-1 rounded-2xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <h3 className="font-mono text-sm font-bold tracking-wider uppercase" style={{ color: 'rgba(255,255,255,0.9)' }}>Open Tables</h3>
            </div>
            {tables.length === 0 ? (
              <div className="py-8 text-center">
                <p className="font-satoshi text-sm" style={{ color: 'rgba(255,255,255,0.25)' }}>No open tables</p>
              </div>
            ) : (
              <div className="max-h-[280px] overflow-y-auto">
                {tables.map(t => (
                  <div key={t.id} className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div>
                      <span className="font-mono text-xs font-bold" style={{ color: 'rgba(255,255,255,0.7)' }}>#{t.id}</span>
                      <span className="font-mono text-[10px] ml-2" style={{ color: 'rgba(255,255,255,0.35)' }}>{truncAddr(t.creator)}</span>
                      <span className="font-mono text-[10px] ml-2" style={{ color: '#00BFFF' }}>{t.buyIn}</span>
                    </div>
                    <button onClick={() => handleJoin(t.id)} disabled={loading}
                      className="h-7 px-3 rounded-lg font-mono text-[10px] font-bold uppercase disabled:opacity-50"
                      style={{ background: 'rgba(0,232,108,0.1)', color: 'var(--color-success)', border: '1px solid rgba(0,232,108,0.2)' }}>
                      JOIN
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (lobbyState === 'waiting') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} className="text-4xl">&#9876;</motion.div>
        <h2 className="font-clash text-2xl" style={{ color: '#00BFFF' }}>Waiting for Opponent</h2>
        <p className="font-mono text-xs" style={{ color: 'var(--color-text-muted)' }}>Table #{tableId}</p>

        {/* Private room — share invite code */}
        {isPrivate && inviteCode && (
          <div className="flex flex-col items-center gap-3 mt-2 px-6 py-5 rounded-xl max-w-[460px] w-full"
            style={{ background: 'rgba(179,102,255,0.06)', border: '1px solid rgba(179,102,255,0.2)' }}>
            <span className="font-mono text-xs tracking-wider uppercase font-bold" style={{ color: 'var(--color-fhe)' }}>
              Private room — share invite code
            </span>
            <div className="w-full px-3 py-2.5 rounded-lg font-mono text-[11px] break-all select-all cursor-text text-center"
              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(179,102,255,0.15)', color: 'rgba(255,255,255,0.8)' }}>
              {inviteCode}
            </div>
            <div className="flex gap-2 w-full">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(inviteCode);
                  addLog('Invite code copied!');
                }}
                className="flex-1 h-10 rounded-lg font-mono text-sm font-bold tracking-wider uppercase"
                style={{ background: 'var(--color-fhe)', color: '#000' }}>
                COPY CODE
              </button>
              <button
                onClick={() => {
                  const link = `${window.location.origin}${window.location.pathname}#/room/holdem/${inviteCode}`;
                  navigator.clipboard.writeText(link);
                  addLog('Room link copied!');
                }}
                className="flex-1 h-10 rounded-lg font-mono text-sm font-bold tracking-wider uppercase"
                style={{ background: 'rgba(0,191,255,0.15)', color: '#00BFFF', border: '1px solid rgba(0,191,255,0.3)' }}>
                COPY LINK
              </button>
            </div>
            <span className="font-mono text-[9px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
              Share code or full link — opponent pastes in "Join by Code"
            </span>
          </div>
        )}

        {/* Public room — show table number + copy link */}
        {!isPrivate && tableId && (
          <div className="flex flex-col items-center gap-3 mt-2">
            <p className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Public table — visible in lobby for everyone
            </p>
            <button
              onClick={() => {
                const link = `${window.location.origin}${window.location.pathname}#/room/holdem/${tableId}`;
                navigator.clipboard.writeText(link);
                addLog('Room link copied!');
              }}
              className="h-9 px-5 rounded-lg font-mono text-xs font-bold tracking-wider uppercase"
              style={{ background: 'rgba(0,191,255,0.1)', color: '#00BFFF', border: '1px solid rgba(0,191,255,0.2)' }}>
              📋 COPY ROOM LINK
            </button>
          </div>
        )}

        <motion.p animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 2, repeat: Infinity }}
          className="font-mono text-[10px] mt-2" style={{ color: 'var(--color-text-dark)' }}>
          Polling every 4s...
        </motion.p>
        <button onClick={handleLeave} className="font-mono text-xs tracking-wider mt-2 hover:text-white transition-colors"
          style={{ color: 'var(--color-text-dark)' }}>CANCEL</button>
      </div>
    );
  }

  if (lobbyState === 'seated') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="text-4xl">&#9876;</div>
        <h2 className="font-clash text-2xl" style={{ color: 'var(--color-success)' }}>Opponent Found!</h2>
        {opponent && <p className="font-mono text-xs" style={{ color: 'var(--color-text-muted)' }}>{truncAddr(opponent)}</p>}
        <button onClick={handleStartHand} disabled={loading}
          className="h-12 px-10 rounded-full font-mono text-sm font-bold tracking-widest uppercase disabled:opacity-50"
          style={{ background: '#00BFFF', color: '#000' }}>
          {loading ? 'STARTING...' : 'START HAND'}
        </button>
        <button onClick={handleLeave} className="font-mono text-xs tracking-wider mt-2 hover:text-white transition-colors"
          style={{ color: 'var(--color-text-dark)' }}>LEAVE TABLE</button>
      </div>
    );
  }

  if (lobbyState === 'playing' || lobbyState === 'showdown') {
    return (
      <div className="flex w-full max-w-[1100px] mx-auto py-6 px-4 gap-6">
        {/* Main game area */}
        <div className="flex flex-col items-center flex-1 gap-4">
        <div className="flex items-center gap-3">
          <h2 className="font-clash text-xl" style={{ color: '#00BFFF' }}>Table #{tableId}</h2>
          <span className="font-mono text-xs px-3 py-1 rounded-full" style={{ background: 'rgba(0,191,255,0.08)', color: '#00BFFF' }}>{roundName || 'Showdown'}</span>
        </div>

        {/* Opponent cards */}
        <div className="flex flex-col items-center gap-2">
          <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {opponent ? truncAddr(opponent) : 'Opponent'}
          </span>
          <div className="flex gap-2">
            {oppCards.length > 0
              ? oppCards.map((id, i) => <Card key={i} id={id} state="faceUp" />)
              : [0, 1].map(i => <Card key={i} state="faceDown" />)
            }
          </div>
        </div>

        {/* Community cards */}
        <div className="flex flex-col items-center gap-2">
          <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: communityCards.length > 0 ? '#00BFFF' : 'rgba(255,255,255,0.25)' }}>COMMUNITY</span>
          <div className="flex gap-2">
            {[0, 1, 2, 3, 4].map(i => {
              if (i < communityCards.length) {
                return (
                  <motion.div key={`c-${i}`}
                    initial={{ rotateY: 180, scale: 0.8, opacity: 0 }}
                    animate={{ rotateY: 0, scale: 1, opacity: 1 }}
                    transition={{ delay: (i % 3) * 0.15, duration: 0.5, type: 'spring' }}>
                    <Card id={communityCards[i]} state="faceUp" />
                  </motion.div>
                );
              }
              const shouldShow = roundName && i < (roundName === 'Pre-flop' ? 0 : roundName === 'Flop' ? 3 : roundName === 'Turn' ? 4 : 5);
              const isDecrypting = decryptingCommunity && shouldShow && i >= communityCards.length;
              return (
                <motion.div key={`ce-${i}`} className="relative"
                  animate={isDecrypting ? { y: [0, -6, 0], scale: [1, 1.04, 1] } : {}}
                  transition={isDecrypting ? { duration: 1.2, repeat: Infinity, delay: i * 0.15 } : {}}>
                  <Card state={shouldShow ? (isDecrypting ? 'decrypting' : 'faceDown') : 'empty'} />
                  {isDecrypting && (
                    <motion.div className="absolute inset-0 rounded-xl pointer-events-none"
                      style={{ boxShadow: '0 0 15px rgba(0,191,255,0.4)', border: '1px solid rgba(0,191,255,0.3)' }}
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.1 }} />
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Pot */}
        <div className="font-clash text-xl px-6 py-2 rounded-full" style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(0,191,255,0.2)', color: '#00BFFF' }}>
          POT: {pot}
        </div>

        {/* My cards */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex gap-3 relative">
            {myCards.length > 0
              ? myCards.map((id, i) => (
                  <motion.div key={`revealed-${i}`}
                    initial={{ rotateY: 180, scale: 0.8 }}
                    animate={{ rotateY: 0, scale: 1 }}
                    transition={{ delay: i * 0.2, duration: 0.6, type: 'spring', stiffness: 200 }}>
                    <Card id={id} state="faceUp" />
                  </motion.div>
                ))
              : [0, 1].map(i => (
                  <motion.div key={`hidden-${i}`} className="relative"
                    animate={decryptingCards ? {
                      y: [0, -8, 0],
                      rotateZ: [0, -2, 2, 0],
                      scale: [1, 1.05, 1],
                    } : {}}
                    transition={decryptingCards ? {
                      duration: 1.5,
                      repeat: Infinity,
                      delay: i * 0.3,
                      ease: 'easeInOut',
                    } : {}}
                  >
                    <Card state={decryptingCards ? 'decrypting' : 'faceDown'} />
                    {/* Glow effect during decrypt */}
                    {decryptingCards && (
                      <motion.div
                        className="absolute inset-0 rounded-xl pointer-events-none"
                        style={{
                          boxShadow: '0 0 20px rgba(179,102,255,0.4), inset 0 0 20px rgba(179,102,255,0.1)',
                          border: '1px solid rgba(179,102,255,0.3)',
                        }}
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1, repeat: Infinity }}
                      />
                    )}
                  </motion.div>
                ))
            }
          </div>
          {myHandName && (
            <div className="flex flex-col items-center gap-1.5">
              <span className="font-satoshi font-bold text-sm" style={{ color: 'var(--color-primary)' }}>{myHandName}</span>
              {/* Hand strength bar */}
              {myCards.length >= 2 && communityCards.length >= 3 && (() => {
                const ev = evaluate7([...myCards, ...communityCards]);
                const cat = Math.floor(ev.score / 1e10);
                const pct = Math.min(100, Math.round((cat / 8) * 100));
                const color = pct >= 60 ? 'var(--color-success)' : pct >= 30 ? 'var(--color-primary)' : 'var(--color-danger)';
                return (
                  <div className="flex items-center gap-2 w-32">
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <motion.div className="h-full rounded-full" style={{ background: color, width: `${pct}%` }}
                        initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.5 }} />
                    </div>
                    <span className="font-mono text-[8px]" style={{ color }}>{pct >= 60 ? 'Strong' : pct >= 30 ? 'Medium' : 'Weak'}</span>
                  </div>
                );
              })()}
            </div>
          )}
          <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.5)' }}>YOU</span>
        </div>

        {/* Status */}
        <div className="flex items-center gap-3">
          <p className="font-mono text-sm" style={{ color: isMyTurn ? '#FFE03D' : 'var(--color-text-muted)' }}>{status}</p>
          {turnTimer !== null && (
            <span className="font-mono text-xs" style={{ color: turnTimer < 15 ? 'var(--color-danger)' : 'var(--color-primary)' }}>
              ⏱ {turnTimer}s
            </span>
          )}
        </div>

        {error && <div className="px-4 py-2 rounded-xl font-mono text-xs w-full" style={{ background: 'rgba(255,59,59,0.08)', color: 'var(--color-danger)' }}>{error}</div>}

        {/* FHE Decrypt Overlay */}
        <AnimatePresence>
          {(decryptingCards || decryptingCommunity) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 pointer-events-none z-30 flex items-center justify-center"
            >
              {/* Scanline */}
              <motion.div className="absolute left-0 right-0 h-[2px]"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(179,102,255,0.8), transparent)', boxShadow: '0 0 20px rgba(179,102,255,0.5)' }}
                animate={{ top: ['0%', '100%', '0%'] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }} />
              {/* Pulse overlay */}
              <motion.div className="absolute inset-0"
                style={{ background: 'rgba(179,102,255,0.02)' }}
                animate={{ opacity: [0, 0.5, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Decrypt status badges */}
        {decryptingCards && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-3 px-5 py-3 rounded-xl"
            style={{ background: 'rgba(179,102,255,0.08)', border: '1px solid rgba(179,102,255,0.25)' }}
          >
            <motion.div className="w-3 h-3 rounded-full" style={{ background: 'var(--color-fhe)' }}
              animate={{ scale: [1, 1.5, 1], opacity: [1, 0.3, 1] }} transition={{ duration: 0.8, repeat: Infinity }} />
            <span className="font-mono text-xs font-bold" style={{ color: 'var(--color-fhe)' }}>
              FHE DECRYPTING HOLE CARDS
            </span>
            <motion.span className="font-mono text-xs" style={{ color: 'rgba(179,102,255,0.6)' }}
              animate={{ opacity: [1, 0] }} transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}>
              ...
            </motion.span>
          </motion.div>
        )}

        {decryptingCommunity && !decryptingCards && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-3 px-5 py-3 rounded-xl"
            style={{ background: 'rgba(0,191,255,0.08)', border: '1px solid rgba(0,191,255,0.25)' }}
          >
            <motion.div className="w-3 h-3 rounded-full" style={{ background: '#00BFFF' }}
              animate={{ scale: [1, 1.5, 1], opacity: [1, 0.3, 1] }} transition={{ duration: 0.8, repeat: Infinity }} />
            <span className="font-mono text-xs font-bold" style={{ color: '#00BFFF' }}>
              FHE DECRYPTING {roundName.toUpperCase()}
            </span>
            <motion.span className="font-mono text-xs" style={{ color: 'rgba(0,191,255,0.6)' }}
              animate={{ opacity: [1, 0] }} transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}>
              ...
            </motion.span>
          </motion.div>
        )}

        {/* Action buttons — only when my turn AND all cards decrypted */}
        {isMyTurn && lobbyState === 'playing' && myCards.length >= 2 && !decryptingCommunity && (
          <div className="flex flex-wrap gap-2 justify-center">
            {hasBetToMatch ? (
              /* Opponent has bet more → CALL / RAISE / ALL-IN / FOLD */
              <>
                <button onClick={() => handleAct(4)} disabled={loading} title="Match opponent's bet to stay in"
                  className="h-10 px-5 rounded-full font-mono text-xs font-bold tracking-widest uppercase disabled:opacity-50"
                  style={{ background: 'var(--color-success)', color: '#000' }}>
                  CALL ({oppRoundBet - myRoundBet})
                </button>
                <button onClick={() => handleAct(2)} disabled={loading} title="Match + increase the bet"
                  className="h-10 px-5 rounded-full font-mono text-xs font-bold tracking-widest uppercase disabled:opacity-50"
                  style={{ background: 'var(--color-primary)', color: '#000' }}>
                  RAISE
                </button>
                <button onClick={() => handleAct(5)} disabled={loading} title="Bet your entire remaining stack"
                  className="h-10 px-5 rounded-full font-mono text-xs font-bold tracking-widest uppercase disabled:opacity-50"
                  style={{ background: '#FF8C42', color: '#000' }}>
                  ALL-IN
                </button>
                <button onClick={handleFold} disabled={loading} title="Give up this hand — opponent wins the pot"
                  className="h-10 px-5 rounded-full font-mono text-xs font-bold tracking-widest uppercase disabled:opacity-50"
                  style={{ background: 'transparent', color: 'var(--color-danger)', border: '1.5px solid rgba(255,59,59,0.35)' }}>
                  FOLD
                </button>
              </>
            ) : (
              /* Bets equal → CHECK / BET / ALL-IN / FOLD */
              <>
                <button onClick={() => handleAct(0)} disabled={loading} title="Pass without betting — free to see next card"
                  className="h-10 px-5 rounded-full font-mono text-xs font-bold tracking-widest uppercase disabled:opacity-50"
                  style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1.5px solid rgba(255,255,255,0.15)' }}>
                  CHECK
                </button>
                <button onClick={() => handleAct(1)} disabled={loading} title="Place a bet — opponent must call, raise, or fold"
                  className="h-10 px-5 rounded-full font-mono text-xs font-bold tracking-widest uppercase disabled:opacity-50"
                  style={{ background: '#00BFFF', color: '#000' }}>
                  BET (10)
                </button>
                <button onClick={() => handleAct(5)} disabled={loading} title="Bet your entire remaining stack"
                  className="h-10 px-5 rounded-full font-mono text-xs font-bold tracking-widest uppercase disabled:opacity-50"
                  style={{ background: '#FF8C42', color: '#000' }}>
                  ALL-IN
                </button>
                <button onClick={handleFold} disabled={loading} title="Give up this hand — opponent wins the pot"
                  className="h-10 px-5 rounded-full font-mono text-xs font-bold tracking-widest uppercase disabled:opacity-50"
                  style={{ background: 'transparent', color: 'var(--color-danger)', border: '1.5px solid rgba(255,59,59,0.35)' }}>
                  FOLD
                </button>
              </>
            )}
          </div>
        )}

        {/* Showdown trigger */}
        {lobbyState === 'showdown' && (
          <button onClick={handleShowdown} disabled={loading}
            className="h-11 px-8 rounded-full font-mono text-sm font-bold tracking-widest uppercase disabled:opacity-50"
            style={{ background: 'var(--color-fhe)', color: '#000' }}>
            {loading ? 'COMPUTING...' : 'COMPUTE SHOWDOWN'}
          </button>
        )}

        {/* Opponent timeout claim */}
        {opponentTimeout && !isMyTurn && (
          <button
            onClick={async () => {
              setLoading(true);
              try {
                await writeAndWait('checkTimeout', [BigInt(tableId!)]);
                addLog('Opponent timed out — you win!');
                await pollTableState();
              } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
              setLoading(false);
            }}
            className="h-10 px-6 rounded-xl font-mono text-xs font-bold tracking-wider uppercase"
            style={{ background: 'rgba(255,59,59,0.1)', border: '1px solid rgba(255,59,59,0.3)', color: 'var(--color-danger)' }}>
            ⏱ CLAIM TIMEOUT
          </button>
        )}

        {/* Activity Log */}
        {activityLog.length > 0 && (
          <div className="w-full max-w-[500px] mt-4 rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(145deg, rgba(10,10,10,0.85), rgba(0,0,0,0.95))',
              border: '1px solid rgba(0,191,255,0.12)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)',
            }}>
            <div className="px-4 py-2.5 flex items-center gap-2.5" style={{ borderBottom: '1px solid rgba(0,191,255,0.08)', background: 'rgba(0,191,255,0.03)' }}>
              <motion.div className="w-2 h-2 rounded-full" style={{ background: '#00BFFF', boxShadow: '0 0 6px rgba(0,191,255,0.5)' }}
                animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }} transition={{ duration: 1.5, repeat: Infinity }} />
              <span className="font-mono text-[9px] tracking-[0.2em] uppercase font-bold" style={{ color: '#00BFFF' }}>GAME LOG</span>
              <span className="font-mono text-[8px] ml-auto" style={{ color: 'rgba(255,255,255,0.2)' }}>{activityLog.length} entries</span>
            </div>
            <div className="px-4 py-2.5 max-h-[160px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
              <AnimatePresence initial={false}>
                {activityLog.map((entry) => {
                  const isTurn = entry.text.includes('Your turn');
                  const isFHE = entry.text.includes('FHE');
                  const isYou = entry.text.includes('You:');
                  const isRound = entry.text.includes('Round:');
                  const color = isTurn ? '#FFE03D' : isFHE ? '#B366FF' : isYou ? '#00E86C' : isRound ? '#00BFFF' : 'rgba(255,255,255,0.45)';

                  return (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, x: -20, height: 0 }}
                      animate={{ opacity: 1, x: 0, height: 'auto' }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      className="font-mono text-[10px] leading-relaxed flex items-start gap-2 py-0.5"
                    >
                      <span style={{ color: 'rgba(255,255,255,0.2)' }}>{entry.time}</span>
                      <motion.span
                        style={{ color }}
                        animate={isTurn || isRound ? { opacity: [1, 0.4, 1] } : {}}
                        transition={isTurn || isRound ? { duration: 1, repeat: 2 } : {}}
                      >
                        {isTurn && '► '}
                        {isFHE && '◈ '}
                        {isYou && '✓ '}
                        {isRound && '● '}
                        {entry.text}
                      </motion.span>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              <div ref={logEndRef} />
            </div>
          </div>
        )}

        {/* Leave */}
        <button onClick={handleFold} className="font-mono text-[10px] tracking-wider mt-2 hover:text-white transition-colors"
          style={{ color: 'var(--color-text-dark)' }}>FOLD & LEAVE</button>
        </div>

        {/* ── Narrator Panel (right side) ── */}
        <div className="hidden lg:flex flex-col w-[240px] shrink-0 gap-3 pt-12">
          <div className="rounded-xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span className="text-sm">&#9824;</span>
              <span className="font-mono text-[9px] tracking-widest uppercase font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>TABLE TALK</span>
            </div>
            <div className="px-4 py-3 space-y-3 min-h-[120px]">
              <AnimatePresence mode="popLayout">
                {narration.slice(-3).map((n) => (
                  <motion.p
                    key={n.key}
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.4 }}
                    className="font-satoshi text-[12px] leading-relaxed italic"
                    style={{ color: 'rgba(255,255,255,0.45)' }}
                  >
                    "{n.text}"
                  </motion.p>
                ))}
              </AnimatePresence>
              {narration.length === 0 && (
                <p className="font-satoshi text-[12px] italic" style={{ color: 'rgba(255,255,255,0.2)' }}>
                  "The table is set. Let the cards decide..."
                </p>
              )}
            </div>
          </div>

          {/* Quick info */}
          <div className="rounded-xl px-4 py-3 space-y-2"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex justify-between font-mono text-[10px]">
              <span style={{ color: 'rgba(255,255,255,0.3)' }}>Pot</span>
              <span style={{ color: '#00BFFF' }}>{pot}</span>
            </div>
            <div className="flex justify-between font-mono text-[10px]">
              <span style={{ color: 'rgba(255,255,255,0.3)' }}>Round</span>
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>{roundName || '—'}</span>
            </div>
            <div className="flex justify-between font-mono text-[10px]">
              <span style={{ color: 'rgba(255,255,255,0.3)' }}>Your bet</span>
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>{myRoundBet}</span>
            </div>
            <div className="flex justify-between font-mono text-[10px]">
              <span style={{ color: 'rgba(255,255,255,0.3)' }}>Opp bet</span>
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>{oppRoundBet}</span>
            </div>
            <div className="flex justify-between font-mono text-[10px]">
              <span style={{ color: 'rgba(255,255,255,0.3)' }}>Hand</span>
              <span style={{ color: 'var(--color-primary)' }}>{myHandName || '—'}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
      {handResult && (
        <>
          <h2 className="font-clash text-4xl" style={{
            color: handResult.winner === '0x0000000000000000000000000000000000000000' ? '#888'
              : handResult.winner.toLowerCase() === address?.toLowerCase() ? 'var(--color-primary)' : 'var(--color-danger)'
          }}>
            {handResult.winner === '0x0000000000000000000000000000000000000000' ? 'TIE'
              : handResult.winner.toLowerCase() === address?.toLowerCase() ? 'YOU WIN!' : 'YOU LOST'}
          </h2>
          <p className="font-mono text-sm" style={{ color: 'var(--color-text-muted)' }}>Pot: {handResult.pot} chips</p>
        </>
      )}

      {/* Show cards side by side */}
      <div className="flex gap-8 mt-4">
        <div className="flex flex-col items-center gap-2">
          <span className="font-mono text-xs" style={{ color: 'var(--color-text-muted)' }}>Your hand</span>
          <div className="flex gap-1">{myCards.map((id, i) => <Card key={i} id={id} state="faceUp" />)}</div>
        </div>
        {oppCards.length > 0 && (
          <div className="flex flex-col items-center gap-2">
            <span className="font-mono text-xs" style={{ color: 'var(--color-text-muted)' }}>Opponent</span>
            <div className="flex gap-1">{oppCards.map((id, i) => <Card key={i} id={id} state="faceUp" />)}</div>
          </div>
        )}
      </div>

      {communityCards.length > 0 && (
        <div className="flex flex-col items-center gap-2 mt-2">
          <span className="font-mono text-xs" style={{ color: '#00BFFF' }}>Community</span>
          <div className="flex gap-1">{communityCards.map((id, i) => <Card key={i} id={id} state="faceUp" />)}</div>
        </div>
      )}

      <div className="flex gap-3 mt-6">
        <button onClick={handleStartHand} disabled={loading}
          className="h-11 px-8 rounded-full font-mono text-sm font-bold uppercase disabled:opacity-50"
          style={{ background: '#00BFFF', color: '#000' }}>
          NEXT HAND
        </button>
        <button onClick={handleLeave} className="h-11 px-6 rounded-full font-mono text-sm tracking-wider uppercase"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
          LEAVE TABLE
        </button>
      </div>
    </div>
  );
};
