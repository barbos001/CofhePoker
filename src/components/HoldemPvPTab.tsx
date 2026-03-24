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
import { getCardData } from '@/lib/poker';
import { evaluate7 } from '@/lib/holdem';
import { Card } from '@/components/ui/Card';
import { sleep } from '@/lib/utils';

import { buildRoomUrl } from './PlayHub';

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
  const { decryptCard, decryptPublicCard } = useCofhe();
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
  const [activityLog, setActivityLog] = useState<{ id: number; text: string; time: string }[]>([]);
  const logIdRef = useRef(0);
  const lastLogRef = useRef('');
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const logEndRef = useRef<HTMLDivElement>(null);

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

  const writeAndWait = useCallback(async (functionName: string, args?: unknown[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hash = await writeContractAsync({
      address: HOLDEM_PVP_CONTRACT_ADDRESS, abi: CIPHER_HOLDEM_PVP_ABI,
      functionName, args,
    } as any);
    await publicClient!.waitForTransactionReceipt({ hash });
    return hash;
  }, [writeContractAsync, publicClient]);

  // ── State names ──
  const stateToRound = (s: number): string => {
    switch (s) {
      case HoldemPvPState.PREFLOP: return 'Pre-flop';
      case HoldemPvPState.FLOP: return 'Flop';
      case HoldemPvPState.TURN: return 'Turn';
      case HoldemPvPState.RIVER: return 'River';
      default: return '';
    }
  };

  // ── Poll table state (used at every stage) ──
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
        } catch { /* getBettingState may not exist on old deploy */ }
      }

      if (state === HoldemPvPState.OPEN) {
        if (lobbyState !== 'waiting') addLog('Waiting for opponent to join...');
        setLobbyState('waiting');
        setStatus('Waiting for opponent...');
      } else if (state === HoldemPvPState.BOTH_SEATED) {
        if (lobbyState !== 'seated') addLog(`Opponent joined: ${truncAddr(opp)}`);
        setLobbyState('seated');
        setStatus('Opponent joined! Start the hand.');
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
          // Fetch result
          const [winner, resPot] = await readContract('getResult', [BigInt(tableId)]) as [string, bigint];
          setHandResult({ winner, pot: Number(resPot) });
          setLobbyState('result');

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

  // ── Start/stop polling based on lobby state ──
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!tableId || lobbyState === 'idle') return;

    // Poll immediately, then every 4s
    pollTableState();
    pollRef.current = setInterval(pollTableState, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [tableId, lobbyState, pollTableState]);

  // ── Load lobby ──
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

  // ── Check if already seated on mount ──
  useEffect(() => {
    if (!deployed || !publicClient || !address) return;
    (async () => {
      const seat = Number(await readContract('getMySeat') as bigint);
      if (seat > 0) {
        setTableId(seat);
        // pollTableState will determine the correct lobbyState
      }
    })();
  }, [deployed, publicClient, address, readContract]);

  // ── Auto-join from room link ──
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

  // ── Decrypt my cards when entering playing state ──
  useEffect(() => {
    if (lobbyState !== 'playing' || !tableId || myCards.length > 0 || decryptingCards) return;
    setDecryptingCards(true);
    addLog('FHE: Decrypting your hole cards...');
    (async () => {
      try {
        setStatus('Decrypting your cards...');
        const [c0, c1] = await readContract('getMyCards', [BigInt(tableId)]) as [bigint, bigint];
        // Wait for FHE sync
        await sleep(15000);
        const cards = [];
        for (const ct of [c0, c1]) {
          const cardId = await decryptCard(ct);
          cards.push(cardId);
          const d = getCardData(cardId);
          LOG(`Hole card: ${d.rankString}${d.suit}`);
        }
        setMyCards(cards);
        addLog(`Cards decrypted: ${cards.map(c => { const d = getCardData(c); return d.rankString + d.suit; }).join(' ')}`);
      } catch (e) { LOG('Card decrypt error:', e); addLog('FHE: Card decrypt failed, retrying...'); }
      setDecryptingCards(false);
    })();
  }, [lobbyState, tableId, myCards.length, decryptingCards, readContract, decryptCard]);

  // ── Decrypt community cards when round advances ──
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
        await sleep(10000); // FHE sync wait
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

  // ── Actions ──
  const handleCreate = useCallback(async () => {
    if (!deployed) { setError('Contract not deployed'); return; }
    setLoading(true); setError('');
    try {
      // Check if already seated — try to clear with ONE tx max
      const existingSeat = Number(await readContract('getMySeat') as bigint);
      if (existingSeat > 0) {
        LOG(`Already seated at #${existingSeat}, clearing...`);
        // Try leaveTable first (works for OPEN/BOTH_SEATED/COMPLETE)
        try {
          await writeAndWait('leaveTable', [BigInt(existingSeat)]);
        } catch {
          // If game in progress, this will fail — that's OK, user must fold first
          setError('You have an active game. Fold or finish it first.');
          setLoading(false);
          return;
        }
      }

      // Single TX to create table
      await writeAndWait('createTable', [BigInt(buyIn), isPrivate]);

      const seat = Number(await readContract('getMySeat') as bigint);
      if (seat === 0) { setError('Table creation failed'); setLoading(false); return; }

      setTableId(seat);
      setLobbyState('waiting');
      addLog(`Table #${seat} created (${isPrivate ? 'private' : 'public'})`);

      // For private: fetch invite code and build full URL
      if (isPrivate) {
        try {
          const code = await readContract('getInviteCode', [BigInt(seat)]) as `0x${string}`;
          const url = buildRoomUrl('holdem', seat, code);
          setInviteCode(url);
        } catch { /* */ }
      } else {
        // Public room — shareable link without code
        setInviteCode(buildRoomUrl('holdem', seat));
      }
    } catch (e) {
      // User rejected or TX failed — check if created anyway
      const msg = e instanceof Error ? e.message : 'Failed';
      if (msg.includes('User rejected') || msg.includes('denied')) {
        setError('Transaction cancelled');
      } else {
        try {
          const seat = Number(await readContract('getMySeat') as bigint);
          if (seat > 0) {
            setTableId(seat);
            setLobbyState('waiting');
            addLog(`Table #${seat} created`);
            setLoading(false);
            return;
          }
        } catch { /* */ }
        setError(msg);
      }
    }
    setLoading(false);
  }, [deployed, buyIn, isPrivate, writeAndWait, readContract, addLog]);

  const handleJoin = useCallback(async (id: number) => {
    if (!deployed) return;
    setLoading(true); setError('');
    try {
      await writeAndWait('joinTable', [BigInt(id)]);
      setTableId(id);
      setLobbyState('seated');
      LOG(`Joined table #${id}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  }, [deployed, writeAndWait]);

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
    setMyCards([]); setCommunityCards([]); setOppCards([]); setHandResult(null);
    prevRound.current = '';
    try {
      await writeAndWait('startHand', [BigInt(tableId)]);
      setLobbyState('playing');
      addLog('Hand started — dealing encrypted cards');
      addLog('FHE: Generating 9 encrypted cards (3 seeds)');
      LOG('Hand started');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  }, [tableId, writeAndWait]);

  const handleLeave = useCallback(async () => {
    if (!tableId) return;
    try {
      await writeAndWait('leaveTable', [BigInt(tableId)]);
      setTableId(null);
      setLobbyState('idle');
      setMyCards([]); setCommunityCards([]); setOppCards([]);
      refreshLobby();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
  }, [tableId, writeAndWait, refreshLobby]);

  const handleAct = useCallback(async (action: number) => {
    if (!tableId) return;
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
  }, [tableId, writeAndWait, pollTableState]);

  const handleFold = useCallback(async () => {
    if (!tableId) return;
    setLoading(true);
    try {
      await writeAndWait('fold', [BigInt(tableId)]);
      addLog('You: Fold');
      await pollTableState();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setLoading(false);
  }, [tableId, writeAndWait, pollTableState]);

  // ── Showdown flow ──
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

  // ── Eval hand for display ──
  const myHandName = myCards.length >= 2 && communityCards.length >= 3
    ? evaluate7([...myCards, ...communityCards]).name : '';

  // ── Render ──
  if (!deployed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <p className="font-mono text-sm" style={{ color: 'var(--color-danger)' }}>Hold'em PvP contract not deployed</p>
      </div>
    );
  }

  // ── LOBBY ──
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

        {error && <div className="mb-4 px-4 py-2.5 rounded-xl font-mono text-xs" style={{ background: 'rgba(255,59,59,0.08)', border: '1px solid rgba(255,59,59,0.2)', color: 'var(--color-danger)' }}>{error}</div>}

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

  // ── WAITING ──
  if (lobbyState === 'waiting') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} className="text-4xl">&#9876;</motion.div>
        <h2 className="font-clash text-2xl" style={{ color: '#00BFFF' }}>Waiting for Opponent</h2>
        <p className="font-mono text-xs" style={{ color: 'var(--color-text-muted)' }}>Table #{tableId}</p>

        {/* Share room link */}
        {inviteCode && (
          <div className="flex flex-col items-center gap-3 mt-2 px-6 py-5 rounded-xl max-w-[500px] w-full"
            style={{ background: isPrivate ? 'rgba(179,102,255,0.06)' : 'rgba(0,191,255,0.06)', border: `1px solid ${isPrivate ? 'rgba(179,102,255,0.2)' : 'rgba(0,191,255,0.2)'}` }}>
            <span className="font-mono text-xs tracking-wider uppercase font-bold" style={{ color: isPrivate ? 'var(--color-fhe)' : '#00BFFF' }}>
              {isPrivate ? 'Private room — share link' : 'Public room — share link'}
            </span>
            <div className="w-full px-3 py-2.5 rounded-lg font-mono text-[10px] break-all select-all cursor-text"
              style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${isPrivate ? 'rgba(179,102,255,0.15)' : 'rgba(0,191,255,0.15)'}`, color: 'rgba(255,255,255,0.7)' }}>
              {inviteCode}
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(inviteCode);
                addLog('Room link copied!');
              }}
              className="w-full h-10 rounded-lg font-mono text-sm font-bold tracking-wider uppercase"
              style={{ background: isPrivate ? 'var(--color-fhe)' : '#00BFFF', color: '#000' }}>
              COPY LINK
            </button>
            <span className="font-mono text-[9px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
              {isPrivate ? 'Only people with this link can join' : 'Anyone with this link joins instantly'}
            </span>
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

  // ── SEATED ──
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

  // ── Narrator commentary ──
  const [narration, setNarration] = useState<{ text: string; key: number }[]>([]);
  const narrationKeyRef = useRef(0);
  const lastNarrationRef = useRef('');

  const narrate = useCallback((text: string) => {
    if (text === lastNarrationRef.current) return;
    lastNarrationRef.current = text;
    const key = ++narrationKeyRef.current;
    setNarration(prev => [...prev.slice(-4), { text, key }]);
  }, []);

  // Generate commentary based on state changes
  useEffect(() => {
    if (decryptingCards) {
      narrate('The dealer slides two cards face-down across the felt. CoFHE threshold network begins decrypting...');
    }
  }, [decryptingCards, narrate]);

  useEffect(() => {
    if (decryptingCommunity && roundName === 'Flop') {
      narrate('Three community cards hit the board. The flop is being revealed through FHE decryption...');
    } else if (decryptingCommunity && roundName === 'Turn') {
      narrate('The turn card burns and flips. One more card joins the board...');
    } else if (decryptingCommunity && roundName === 'River') {
      narrate('The final card. The river decides everything...');
    }
  }, [decryptingCommunity, roundName, narrate]);

  useEffect(() => {
    if (myCards.length === 2 && !decryptingCards) {
      const c = myCards.map(id => { const d = getCardData(id); return d.rankString + d.suit; });
      narrate(`Cards revealed: ${c.join(' ')}. Time to make a decision.`);
    }
  }, [myCards.length, decryptingCards, myCards, narrate]);

  useEffect(() => {
    if (isMyTurn && myCards.length >= 2 && !decryptingCards && !decryptingCommunity) {
      if (hasBetToMatch) {
        narrate(`Opponent has bet. The pressure is on — call ${oppRoundBet - myRoundBet} chips, raise, or walk away?`);
      } else if (roundName === 'Pre-flop') {
        narrate('Pre-flop action. Check to see more cards for free, or bet to build the pot?');
      } else {
        narrate(`${roundName} action. The board tells a story — what will you do?`);
      }
    } else if (!isMyTurn && lobbyState === 'playing' && myCards.length >= 2) {
      narrate('Opponent is thinking... The tension builds at the table.');
    }
  }, [isMyTurn, hasBetToMatch, roundName, myCards.length, decryptingCards, decryptingCommunity, lobbyState, oppRoundBet, myRoundBet, narrate]);

  useEffect(() => {
    if (lobbyState === 'showdown') {
      narrate('All bets are in. The cards speak now — FHE evaluation determines the winner...');
    }
  }, [lobbyState, narrate]);

  // ── PLAYING ──
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
        <p className="font-mono text-sm" style={{ color: isMyTurn ? '#FFE03D' : 'var(--color-text-muted)' }}>{status}</p>

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

        {/* Activity Log */}
        {activityLog.length > 0 && (
          <div className="w-full max-w-[500px] mt-4 rounded-xl overflow-hidden"
            style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <motion.div className="w-2 h-2 rounded-full" style={{ background: 'var(--color-success)' }}
                animate={{ scale: [1, 1.4, 1], opacity: [1, 0.4, 1] }} transition={{ duration: 1.2, repeat: Infinity }} />
              <span className="font-mono text-[9px] tracking-widest uppercase font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>GAME LOG</span>
            </div>
            <div className="px-3 py-2 max-h-[140px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
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

  // ── RESULT ──
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
