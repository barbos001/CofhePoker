/**
 * SpectatorView — watch a live PvP table without joining.
 * Shows: players, round, pot, card backs (count only — FHE keeps values private).
 * Private tables show minimal info.
 */
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, RefreshCw, ArrowLeft, Lock, Users, Zap } from 'lucide-react';
import { usePublicClient } from 'wagmi';
import { HOLDEM_PVP_CONTRACT_ADDRESS, CIPHER_HOLDEM_PVP_ABI, HoldemPvPState } from '@/config/contractHoldemPvP';
import { getActiveTables, subscribeToActiveTables } from '@/lib/db';
import { ActiveTableRow } from '@/config/supabase';
import { isSupabaseEnabled } from '@/config/supabase';

const cp = (weight: number, size: number | string, spacing = '0.03em') => ({
  fontFamily: "'Chakra Petch', sans-serif",
  fontWeight: weight,
  fontSize:   size,
  letterSpacing: spacing,
});

const truncAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const STATE_LABELS: Record<number, string> = {
  [HoldemPvPState.OPEN]:              'Waiting',
  [HoldemPvPState.BOTH_SEATED]:       'Starting',
  [HoldemPvPState.PREFLOP]:           'Pre-flop',
  [HoldemPvPState.FLOP]:              'Flop',
  [HoldemPvPState.TURN]:              'Turn',
  [HoldemPvPState.RIVER]:             'River',
  [HoldemPvPState.AWAITING_SHOWDOWN]: 'Showdown',
  [HoldemPvPState.COMPLETE]:          'Complete',
};

const STATE_COLORS: Record<number, string> = {
  [HoldemPvPState.OPEN]:              '#888',
  [HoldemPvPState.BOTH_SEATED]:       '#FFE03D',
  [HoldemPvPState.PREFLOP]:           '#00BFFF',
  [HoldemPvPState.FLOP]:              '#00BFFF',
  [HoldemPvPState.TURN]:              '#B366FF',
  [HoldemPvPState.RIVER]:             '#FF6B35',
  [HoldemPvPState.AWAITING_SHOWDOWN]: '#FFE03D',
  [HoldemPvPState.COMPLETE]:          '#00E86C',
};

// Number of community cards shown per round
const COMMUNITY_COUNT: Record<number, number> = {
  [HoldemPvPState.PREFLOP]:  0,
  [HoldemPvPState.FLOP]:     3,
  [HoldemPvPState.TURN]:     4,
  [HoldemPvPState.RIVER]:    5,
  [HoldemPvPState.AWAITING_SHOWDOWN]: 5,
};

// ── Card back ─────────────────────────────────────────────────────────────────
const CardBack = ({ small = false }: { small?: boolean }) => (
  <div
    style={{
      width:        small ? 28 : 38,
      height:       small ? 40 : 54,
      borderRadius: 4,
      background:   'linear-gradient(135deg, #1a1f35 0%, #0d1020 100%)',
      border:       '1px solid rgba(0,191,255,0.2)',
      display:      'flex',
      alignItems:   'center',
      justifyContent: 'center',
      flexShrink:   0,
    }}
  >
    <div style={{ width: small ? 16 : 22, height: small ? 22 : 32, borderRadius: 2, background: 'repeating-linear-gradient(45deg, rgba(0,191,255,0.06) 0px, rgba(0,191,255,0.06) 2px, transparent 2px, transparent 6px)', border: '1px solid rgba(0,191,255,0.12)' }} />
  </div>
);

// ── Live table card ───────────────────────────────────────────────────────────
const TableCard = ({ table, onWatch }: { table: ActiveTableRow; onWatch: (t: ActiveTableRow) => void }) => {
  const stateLabel = STATE_LABELS[table.state] ?? 'Active';
  const stateColor = STATE_COLORS[table.state] ?? '#888';
  const commCount  = COMMUNITY_COUNT[table.state] ?? 0;
  const isActive   = table.state >= HoldemPvPState.PREFLOP && table.state <= HoldemPvPState.AWAITING_SHOWDOWN;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-4 cursor-pointer transition-all hover:scale-[1.01]"
      style={{
        background: table.is_private
          ? 'rgba(179,102,255,0.05)'
          : 'rgba(0,191,255,0.04)',
        border: `1px solid ${table.is_private ? 'rgba(179,102,255,0.2)' : 'rgba(0,191,255,0.15)'}`,
      }}
      onClick={() => !table.is_private && onWatch(table)}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {table.is_private
            ? <Lock size={12} style={{ color: '#B366FF' }} />
            : <Eye size={12} style={{ color: '#00BFFF' }} />
          }
          <span style={{ ...cp(600, 11, '0.08em'), color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
            Table #{table.table_id}
          </span>
          {table.is_private && (
            <span className="px-1.5 py-0.5 rounded font-mono text-[9px] font-bold uppercase"
              style={{ background: 'rgba(179,102,255,0.15)', color: '#B366FF' }}>Private</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {isActive && (
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: stateColor }} />
          )}
          <span style={{ ...cp(600, 10, '0.08em'), color: stateColor, textTransform: 'uppercase' }}>
            {stateLabel}
          </span>
        </div>
      </div>

      {table.is_private ? (
        <p style={{ ...cp(400, 11), color: 'rgba(255,255,255,0.25)' }}>
          Private table — invite only
        </p>
      ) : (
        <>
          {/* Players */}
          <div className="flex items-center gap-2 mb-3">
            <Users size={11} style={{ color: 'rgba(255,255,255,0.3)' }} />
            <span style={{ ...cp(400, 11), color: 'rgba(255,255,255,0.5)' }}>
              {truncAddr(table.player1)}
              {table.player2 ? <> vs <span style={{ color: 'rgba(255,255,255,0.7)' }}>{truncAddr(table.player2)}</span></> : ' (waiting)'}
            </span>
          </div>

          {/* Pot + community cards */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <div style={{ ...cp(700, 16), color: '#FFE03D' }}>{table.pot}</div>
                <div style={{ ...cp(400, 9, '0.1em'), color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>pot</div>
              </div>
              <div>
                <div style={{ ...cp(600, 13), color: 'rgba(255,255,255,0.6)' }}>{table.buy_in}</div>
                <div style={{ ...cp(400, 9, '0.1em'), color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>buy-in</div>
              </div>
            </div>

            {/* Community card backs */}
            {commCount > 0 && (
              <div className="flex gap-1">
                {Array.from({ length: commCount }).map((_, i) => <CardBack key={i} small />)}
              </div>
            )}

            {/* Watch button */}
            {isActive && (
              <button
                className="px-3 py-1.5 rounded-lg font-mono text-[10px] font-bold uppercase tracking-wider"
                style={{ background: 'rgba(0,191,255,0.12)', border: '1px solid rgba(0,191,255,0.25)', color: '#00BFFF' }}
                onClick={(e) => { e.stopPropagation(); onWatch(table); }}
              >
                WATCH
              </button>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
};

// ── Watching a specific table ─────────────────────────────────────────────────
const WatchingTable = ({ table, onBack }: { table: ActiveTableRow; onBack: () => void }) => {
  const publicClient = usePublicClient();
  const [liveTable, setLiveTable] = useState(table);
  const [tick, setTick] = useState(0);

  const refreshTable = useCallback(async () => {
    if (!publicClient || !HOLDEM_PVP_CONTRACT_ADDRESS || HOLDEM_PVP_CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const info = await (publicClient as any).readContract({
        address: HOLDEM_PVP_CONTRACT_ADDRESS,
        abi:     CIPHER_HOLDEM_PVP_ABI,
        functionName: 'getTableInfo',
        args: [BigInt(table.table_id)],
      }) as [string, string, number, bigint, bigint, bigint, boolean, string];
      setLiveTable(prev => ({
        ...prev,
        player1:    info[0],
        player2:    info[1],
        state:      info[2],
        pot:        Number(info[3]),
        buy_in:     Number(info[5]),
        is_private: info[6],
      }));
    } catch { /* offline */ }
    setTick(t => t + 1);
  }, [publicClient, table.table_id]);

  useEffect(() => {
    refreshTable();
    const id = setInterval(refreshTable, 10_000);
    return () => clearInterval(id);
  }, [refreshTable]);

  const stateLabel  = STATE_LABELS[liveTable.state] ?? 'Active';
  const stateColor  = STATE_COLORS[liveTable.state] ?? '#888';
  const commCount   = COMMUNITY_COUNT[liveTable.state] ?? 0;
  const holeCards   = 2; // always 2 per player

  return (
    <div className="w-full max-w-[600px] mx-auto">
      {/* Back + header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 rounded-xl transition-all"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <ArrowLeft size={16} style={{ color: 'rgba(255,255,255,0.6)' }} />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="uppercase" style={{ ...cp(700, 20, '0.06em'), color: 'white' }}>
              Table #{liveTable.table_id}
            </h2>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: stateColor }} />
            <span style={{ ...cp(600, 11, '0.08em'), color: stateColor, textTransform: 'uppercase' }}>{stateLabel}</span>
          </div>
          <p style={{ ...cp(400, 11), color: 'rgba(255,255,255,0.3)' }}>
            Spectating · refreshes every 10s
          </p>
        </div>
        <button onClick={refreshTable} className="ml-auto p-2 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <RefreshCw size={12} style={{ color: 'rgba(255,255,255,0.4)' }} />
        </button>
      </div>

      {/* Felt */}
      <div className="rounded-2xl p-6 mb-4"
        style={{ background: 'linear-gradient(135deg, rgba(0,60,20,0.6), rgba(0,40,15,0.8))', border: '2px solid rgba(0,180,60,0.2)' }}>

        {/* Pot */}
        <div className="text-center mb-5">
          <div style={{ ...cp(700, 28, '0.04em'), color: '#FFE03D' }}>{liveTable.pot} chips</div>
          <div style={{ ...cp(400, 10, '0.12em'), color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>pot</div>
        </div>

        {/* Community cards */}
        <div className="flex justify-center gap-2 mb-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ opacity: i < commCount ? 1 : 0.15 }}>
              <CardBack />
            </div>
          ))}
        </div>

        {/* Player seats */}
        <div className="grid grid-cols-2 gap-4">
          {[liveTable.player1, liveTable.player2].map((addr, idx) => (
            <div key={idx} className="rounded-xl p-3 text-center"
              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ ...cp(600, 11, '0.06em'), color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
                {addr && addr !== '0x0000000000000000000000000000000000000000'
                  ? truncAddr(addr)
                  : <span style={{ color: 'rgba(255,255,255,0.2)' }}>Empty seat</span>
                }
              </div>
              {addr && addr !== '0x0000000000000000000000000000000000000000' && (
                <div className="flex justify-center gap-1">
                  {Array.from({ length: holeCards }).map((_, i) => <CardBack key={i} small />)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* FHE privacy note */}
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl"
        style={{ background: 'rgba(0,191,255,0.04)', border: '1px solid rgba(0,191,255,0.1)' }}>
        <Zap size={11} style={{ color: '#00BFFF' }} />
        <p style={{ ...cp(400, 10, '0.06em'), color: 'rgba(255,255,255,0.3)' }}>
          Card values encrypted via CoFHE — spectators see card backs only. Round, pot, and player positions are public.
        </p>
      </div>

      <p className="text-center mt-3" style={{ ...cp(400, 9, '0.1em'), color: 'rgba(255,255,255,0.15)', textTransform: 'uppercase' }}>
        Tick #{tick} · Last updated {new Date().toLocaleTimeString()}
      </p>
    </div>
  );
};

// ── Main SpectatorView ────────────────────────────────────────────────────────
export const SpectatorView = () => {
  const publicClient = usePublicClient();
  const [tables,    setTables]    = useState<ActiveTableRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [watching,  setWatching]  = useState<ActiveTableRow | null>(null);
  const deployed = HOLDEM_PVP_CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000';

  const fetchTables = useCallback(async () => {
    if (!deployed) { setLoading(false); return; }

    // Prefer Supabase (has both open + active tables)
    if (isSupabaseEnabled) {
      try {
        const rows = await getActiveTables();
        setTables(rows);
        setLoading(false);
        return;
      } catch { /* fall through to contract */ }
    }

    // Fallback: read open tables from contract
    if (!publicClient) { setLoading(false); return; }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rc = (publicClient as any).readContract.bind(publicClient);
      const count = Number(await rc({
        address: HOLDEM_PVP_CONTRACT_ADDRESS, abi: CIPHER_HOLDEM_PVP_ABI, functionName: 'getOpenTableCount',
      }) as bigint);
      if (count === 0) { setTables([]); setLoading(false); return; }
      const ids = await rc({
        address: HOLDEM_PVP_CONTRACT_ADDRESS, abi: CIPHER_HOLDEM_PVP_ABI,
        functionName: 'getOpenTables', args: [0n, BigInt(Math.min(count, 20))],
      }) as bigint[];
      const entries: ActiveTableRow[] = [];
      for (const id of ids) {
        const info = await rc({
          address: HOLDEM_PVP_CONTRACT_ADDRESS, abi: CIPHER_HOLDEM_PVP_ABI,
          functionName: 'getTableInfo', args: [id],
        }) as [string, string, number, bigint, bigint, bigint, boolean, string];
        entries.push({
          table_id: Number(id), player1: info[0], player2: info[1],
          state: info[2], pot: Number(info[3]), buy_in: Number(info[5]),
          is_private: info[6], round_name: '', updated_at: '',
        });
      }
      setTables(entries);
    } catch { /* ignore */ }
    setLoading(false);
  }, [deployed, publicClient]);

  useEffect(() => {
    fetchTables();
    const id = setInterval(fetchTables, 15_000);
    return () => clearInterval(id);
  }, [fetchTables]);

  // Realtime Supabase subscription
  useEffect(() => {
    return subscribeToActiveTables(fetchTables);
  }, [fetchTables]);

  if (watching) {
    return <WatchingTable table={watching} onBack={() => setWatching(null)} />;
  }

  const liveTables    = tables.filter(t => t.state >= HoldemPvPState.PREFLOP && t.state <= HoldemPvPState.AWAITING_SHOWDOWN);
  const waitingTables = tables.filter(t => t.state < HoldemPvPState.PREFLOP);

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Eye size={16} style={{ color: '#00BFFF' }} />
          <span style={{ ...cp(600, 14, '0.06em'), color: 'white', textTransform: 'uppercase' }}>
            Spectate
          </span>
          {liveTables.length > 0 && (
            <span className="px-2 py-0.5 rounded-full font-mono text-[10px] font-bold"
              style={{ background: 'rgba(0,232,108,0.15)', color: '#00E86C', border: '1px solid rgba(0,232,108,0.25)' }}>
              {liveTables.length} LIVE
            </span>
          )}
        </div>
        <button onClick={fetchTables} className="p-1.5 rounded-lg"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <RefreshCw size={12} style={{ color: 'rgba(255,255,255,0.4)' }} />
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="h-24 rounded-2xl animate-pulse"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }} />
          ))}
        </div>
      ) : tables.length === 0 ? (
        <div className="py-8 text-center">
          <Eye size={28} style={{ color: 'rgba(255,255,255,0.1)', margin: '0 auto 12px' }} />
          <p style={{ ...cp(400, 12), color: 'rgba(255,255,255,0.25)' }}>No active tables right now</p>
          <p style={{ ...cp(400, 10, '0.06em'), color: 'rgba(255,255,255,0.15)', marginTop: 4 }}>
            Create a game to be the first
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {liveTables.map(t => (
              <TableCard key={t.table_id} table={t} onWatch={setWatching} />
            ))}
            {waitingTables.map(t => (
              <TableCard key={t.table_id} table={t} onWatch={setWatching} />
            ))}
          </AnimatePresence>
        </div>
      )}

      {!deployed && (
        <p className="text-center font-mono text-[11px] mt-4" style={{ color: 'rgba(255,255,255,0.2)' }}>
          Contract not deployed — spectate unavailable
        </p>
      )}
    </div>
  );
};
