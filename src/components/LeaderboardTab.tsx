import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, TrendingUp, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useAccount } from 'wagmi';
import { useProfileStore } from '@/store/useProfileStore';
import { useGameStore } from '@/store/useGameStore';
import { getLeaderboard, LeaderEntry as DBLeaderEntry } from '@/lib/db';
import { isSupabaseEnabled } from '@/config/supabase';

const cp = (weight: number, size: number | string, spacing = '0.03em') => ({
  fontFamily: "'Chakra Petch', sans-serif",
  fontWeight: weight,
  fontSize: size,
  letterSpacing: spacing,
});

type Period     = 'alltime' | 'weekly';
type ModeFilter = 'all' | 'three-card' | 'holdem' | 'pvp';

interface LeaderEntry {
  rank:     number;
  address:  string;
  name:     string;
  net:      number;
  winRate:  number;
  hands:    number;
  isMe:     boolean;
}

const MODE_LABELS: Record<string, string> = { 'three-card': '3-Card', holdem: "Hold'em", pvp: 'PvP' };
const MODE_COLORS: Record<string, string> = { 'three-card': '#FFE03D', holdem: '#00BFFF', pvp: '#B366FF' };

function dbToUI(row: DBLeaderEntry, myAddress: string | undefined, rank: number): LeaderEntry {
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  return {
    rank,
    address: short(row.player_address),
    name:    row.username || short(row.player_address),
    net:     row.total_delta,
    winRate: row.win_rate,
    hands:   row.total_hands,
    isMe:    !!myAddress && row.player_address.toLowerCase() === myAddress.toLowerCase(),
  };
}

// Local fallback from session history
function buildLocalEntries(
  history: ReturnType<typeof useGameStore.getState>['history'],
  address: string | undefined,
  username: string,
  mode: ModeFilter,
  balance: number,
): LeaderEntry[] {
  const filtered = mode === 'all' ? history : history.filter(h => h.gameMode === mode);
  const wins = filtered.filter(h => h.result === 'WON').length;
  const total = filtered.length;
  const net   = filtered.reduce((s, h) => s + h.delta, 0);
  return [{
    rank:    1,
    address: address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '0x—',
    name:    username || (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'You'),
    net:     balance - 1000, // delta from starting balance
    winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
    hands:   total,
    isMe:    true,
  }];
}

// ── Rank medal ────────────────────────────────────────────────────────────────
const RankMedal = ({ rank }: { rank: number }) => {
  if (rank === 1) return <span style={{ fontSize: 20 }}>🥇</span>;
  if (rank === 2) return <span style={{ fontSize: 20 }}>🥈</span>;
  if (rank === 3) return <span style={{ fontSize: 20 }}>🥉</span>;
  return (
    <span className="font-mono font-bold inline-block text-center" style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, minWidth: 24 }}>
      {rank}
    </span>
  );
};

// ── Row ───────────────────────────────────────────────────────────────────────
const LeaderRow = ({ entry, index }: { entry: LeaderEntry; index: number }) => (
  <motion.div
    initial={{ opacity: 0, x: -10 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: index * 0.03 }}
    className="flex items-center gap-3 px-4 py-3.5 rounded-xl"
    style={{
      background: entry.isMe
        ? 'linear-gradient(90deg, rgba(0,191,255,0.08), rgba(179,102,255,0.05))'
        : entry.rank <= 3 ? 'rgba(255,255,255,0.03)' : 'transparent',
      border: entry.isMe
        ? '1px solid rgba(0,191,255,0.25)'
        : entry.rank <= 3 ? '1px solid rgba(255,255,255,0.05)' : '1px solid transparent',
      marginBottom: 4,
    }}
  >
    <div className="w-8 flex items-center justify-center shrink-0">
      <RankMedal rank={entry.rank} />
    </div>

    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span style={{ ...cp(600, 13, '0.04em'), color: entry.isMe ? '#00BFFF' : 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.name}
        </span>
        {entry.isMe && (
          <span className="shrink-0 px-1.5 py-0.5 rounded font-mono text-[9px] font-bold uppercase"
            style={{ background: 'rgba(0,191,255,0.15)', color: '#00BFFF' }}>YOU</span>
        )}
      </div>
      <span style={{ ...cp(400, 10, '0.04em'), color: 'rgba(255,255,255,0.25)' }}>
        {entry.address} · {entry.hands} hands
      </span>
    </div>

    <div className="hidden sm:flex flex-col items-end shrink-0">
      <span style={{ ...cp(600, 13), color: entry.winRate >= 50 ? '#00E86C' : 'rgba(255,255,255,0.5)' }}>
        {entry.winRate}%
      </span>
      <span style={{ ...cp(400, 9, '0.1em'), color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>win rate</span>
    </div>

    <div className="flex flex-col items-end shrink-0 ml-4">
      <span style={{ ...cp(700, 15, '0.02em'), color: entry.rank === 1 ? '#FFE03D' : entry.net >= 0 ? '#00E86C' : '#FF3B3B' }}>
        {entry.net >= 0 ? '+' : ''}{entry.net.toLocaleString()}
      </span>
      <span style={{ ...cp(400, 9, '0.1em'), color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>net chips</span>
    </div>
  </motion.div>
);

// ── Skeleton row ──────────────────────────────────────────────────────────────
const SkeletonRow = ({ i }: { i: number }) => (
  <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl mb-1" style={{ background: 'transparent' }}>
    <div className="w-8 h-5 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.07)' }} />
    <div className="flex-1 space-y-1.5">
      <div className="h-3.5 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.07)', width: `${55 + i * 8}%` }} />
      <div className="h-2.5 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.04)', width: '40%' }} />
    </div>
    <div className="w-10 h-4 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.07)' }} />
  </div>
);

// ── Main ──────────────────────────────────────────────────────────────────────
export const LeaderboardTab = () => {
  const history  = useGameStore(s => s.history);
  const balance  = useGameStore(s => s.balance);
  const { username } = useProfileStore();
  const { address }  = useAccount();

  const [period,     setPeriod]     = useState<Period>('alltime');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [entries,    setEntries]    = useState<LeaderEntry[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [lastFetch,  setLastFetch]  = useState(0);
  const [error,      setError]      = useState<string | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (!isSupabaseEnabled) {
      setEntries(buildLocalEntries(history, address, username, modeFilter, balance));
      setLoading(false);
      return;
    }

    try {
      const since = period === 'weekly' ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) : undefined;
      const rows  = await getLeaderboard(modeFilter, since, 20);
      const mapped = rows.map((row, i) => dbToUI(row, address, i + 1));

      // Ensure the current player appears even if not in top 20
      const iAmIn = mapped.some(e => e.isMe);
      if (!iAmIn && address) {
        const localEntry = buildLocalEntries(history, address, username, modeFilter, balance)[0];
        localEntry.rank = mapped.length + 1;
        mapped.push(localEntry);
      }

      setEntries(mapped);
      setLastFetch(Date.now());
    } catch {
      setError('Could not load leaderboard — showing local data');
      setEntries(buildLocalEntries(history, address, username, modeFilter, balance));
    } finally {
      setLoading(false);
    }
  }, [period, modeFilter, address, username, history, balance]);

  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

  // Auto-refresh every 60s
  useEffect(() => {
    const id = setInterval(fetchLeaderboard, 60_000);
    return () => clearInterval(id);
  }, [fetchLeaderboard]);

  const myEntry = entries.find(e => e.isMe);

  return (
    <div className="w-full max-w-[760px] mx-auto py-10 px-4 min-h-[calc(100vh-112px)]"
      style={{ background: '#0A0D12' }}>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4 mb-8">
        <h1 className="uppercase leading-none" style={{ ...cp(700, 52, '0.06em'), color: 'white' }}>LEADERBOARD</h1>
        <Trophy size={28} style={{ color: '#FFE03D', opacity: 0.7 }} />
        <div className="ml-auto flex items-center gap-2">
          {/* Backend status */}
          {isSupabaseEnabled
            ? <Wifi size={12} style={{ color: '#00E86C' }} />
            : <WifiOff size={12} style={{ color: 'rgba(255,255,255,0.3)' }} />
          }
          <span style={{ ...cp(400, 10, '0.08em'), color: isSupabaseEnabled ? '#00E86C' : 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>
            {isSupabaseEnabled ? 'Live' : 'Local'}
          </span>
          {/* Refresh */}
          <button
            onClick={fetchLeaderboard}
            disabled={loading}
            className="ml-2 p-1.5 rounded-lg transition-all disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} style={{ color: 'rgba(255,255,255,0.5)' }} />
          </button>
        </div>
      </motion.div>

      {/* Error banner */}
      {error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="mb-4 px-4 py-2.5 rounded-xl font-mono text-[11px]"
          style={{ background: 'rgba(255,140,66,0.08)', border: '1px solid rgba(255,140,66,0.2)', color: 'rgba(255,140,66,0.8)' }}>
          {error}
        </motion.div>
      )}

      {/* Filters row */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }}
        className="flex flex-wrap gap-3 mb-6 items-center">

        {/* Period */}
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {(['alltime', 'weekly'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className="px-4 py-1.5 rounded-lg font-mono text-[11px] tracking-widest uppercase transition-all"
              style={{
                background: period === p ? 'rgba(255,224,61,0.15)' : 'transparent',
                color:      period === p ? '#FFE03D' : 'rgba(255,255,255,0.35)',
                border:     period === p ? '1px solid rgba(255,224,61,0.3)' : '1px solid transparent',
              }}
            >
              {p === 'alltime' ? 'All Time' : 'This Week'}
            </button>
          ))}
        </div>

        {/* Mode filter */}
        <div className="flex gap-1.5 flex-wrap">
          {(['all', 'three-card', 'holdem', 'pvp'] as ModeFilter[]).map(m => (
            <button
              key={m}
              onClick={() => setModeFilter(m)}
              className="h-8 px-3 rounded-full font-mono text-[10px] tracking-widest uppercase transition-all"
              style={{
                background: modeFilter === m ? `${m === 'all' ? '#fff' : MODE_COLORS[m]}18` : 'rgba(255,255,255,0.04)',
                border:     modeFilter === m ? `1px solid ${m === 'all' ? 'rgba(255,255,255,0.3)' : MODE_COLORS[m] + '50'}` : '1px solid rgba(255,255,255,0.06)',
                color:      modeFilter === m ? (m === 'all' ? 'white' : MODE_COLORS[m]) : 'rgba(255,255,255,0.35)',
              }}
            >
              {m === 'all' ? 'All Modes' : MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </motion.div>

      {/* My rank highlight */}
      {myEntry && myEntry.rank > 3 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
          className="mb-4 px-4 py-3 rounded-xl flex items-center gap-3"
          style={{ background: 'rgba(0,191,255,0.06)', border: '1px solid rgba(0,191,255,0.15)' }}>
          <TrendingUp size={14} style={{ color: '#00BFFF' }} />
          <span style={{ ...cp(400, 12), color: 'rgba(255,255,255,0.6)' }}>Your rank:</span>
          <span style={{ ...cp(700, 14), color: '#00BFFF' }}>#{myEntry.rank}</span>
          <span style={{ ...cp(400, 11), color: 'rgba(255,255,255,0.35)' }}>
            · {myEntry.net >= 0 ? '+' : ''}{myEntry.net.toLocaleString()} net · {myEntry.winRate}% win rate
          </span>
        </motion.div>
      )}

      {/* Top 3 podium */}
      {!loading && entries.length >= 3 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          className="grid grid-cols-3 gap-3 mb-6">
          {entries.slice(0, 3).map((e, i) => {
            const heights = ['120px', '96px', '80px'];
            const colors  = ['#FFE03D', '#C0C0C0', '#CD7F32'];
            return (
              <div key={e.rank} className="flex flex-col items-center gap-2">
                <div
                  className="w-full flex flex-col items-center justify-end pb-3 pt-2 rounded-xl"
                  style={{
                    height: heights[i],
                    background: e.isMe
                      ? 'linear-gradient(180deg, rgba(0,191,255,0.12), rgba(0,191,255,0.04))'
                      : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${e.isMe ? 'rgba(0,191,255,0.25)' : colors[i] + '30'}`,
                  }}
                >
                  <span style={{ fontSize: 24, marginBottom: 4 }}>{['🥇', '🥈', '🥉'][i]}</span>
                  <span style={{ ...cp(700, 13, '0.02em'), color: e.isMe ? '#00BFFF' : colors[i], textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '90%', display: 'block' }}>
                    {e.name}
                  </span>
                  <span style={{ ...cp(600, 12), color: 'rgba(255,255,255,0.6)' }}>
                    {e.net >= 0 ? '+' : ''}{e.net.toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })}
        </motion.div>
      )}

      {/* Full list */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.18 }}
        className="rounded-2xl overflow-hidden"
        style={{ background: '#0F1318', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Column headers */}
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <span className="w-8" />
          <span className="flex-1" style={{ ...cp(500, 10, '0.15em'), color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>Player</span>
          <span className="hidden sm:block" style={{ ...cp(500, 10, '0.15em'), color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>Win %</span>
          <span style={{ ...cp(500, 10, '0.15em'), color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', marginLeft: 16 }}>Net Chips</span>
        </div>

        <div className="p-2">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} i={i} />)
          ) : entries.length === 0 ? (
            <p className="text-center font-mono text-[11px] py-10" style={{ color: 'rgba(255,255,255,0.25)' }}>
              {isSupabaseEnabled ? 'No hands played yet — be the first!' : 'Connect wallet and play to appear here'}
            </p>
          ) : (
            <AnimatePresence mode="popLayout">
              {entries.map((e, i) => <LeaderRow key={e.address + e.rank} entry={e} index={i} />)}
            </AnimatePresence>
          )}
        </div>
      </motion.div>

      {/* Footer note */}
      <p className="mt-6 text-center font-mono text-[10px] tracking-widest" style={{ color: 'rgba(255,255,255,0.15)', textTransform: 'uppercase' }}>
        {isSupabaseEnabled
          ? `Live data from Supabase · Net chips = total won minus lost · Auto-refreshes every 60s`
          : 'Local session only — add VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY to enable live leaderboard'}
        {lastFetch > 0 && (
          <span style={{ display: 'block', marginTop: 4 }}>
            Last updated {new Date(lastFetch).toLocaleTimeString()}
          </span>
        )}
      </p>
    </div>
  );
};
