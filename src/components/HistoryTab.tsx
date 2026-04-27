import { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, Download, Filter, X, Wifi, WifiOff } from 'lucide-react';
import { useGameStore, HandHistory } from '@/store/useGameStore';
import { useAccount } from 'wagmi';
import { Card } from '@/components/ui/Card';
import { StatsBar } from '@/components/ui/StatsBar';
import { getPlayerHandHistory } from '@/lib/db';
import { isSupabaseEnabled } from '@/config/supabase';
import { HandReplayModal } from '@/components/ui/HandReplayModal';

const cp = (weight: number, size: number, spacing = '0.03em') => ({
  fontFamily: "'Chakra Petch', sans-serif",
  fontWeight: weight,
  fontSize: size,
  letterSpacing: spacing,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function exportCSV(history: HandHistory[]) {
  const header = ['#', 'Result', 'Mode', 'Hand', 'Δ Chips', 'Date', 'Tx'];
  const rows = [...history].reverse().map(h => [
    h.id,
    h.result,
    h.gameMode ?? 'unknown',
    h.playerEval?.name ?? h.desc,
    h.delta > 0 ? `+${h.delta}` : String(h.delta),
    h.timestamp ? new Date(h.timestamp).toISOString() : '',
    h.txHash,
  ]);
  const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cofhe-poker-history-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const MODE_LABELS: Record<string, string> = {
  'three-card': '3-Card',
  holdem: "Hold'em",
  pvp: 'PvP',
};

const HAND_RANK_ORDER = [
  'Straight Flush', 'Four of a Kind', 'Full House',
  'Flush', 'Straight', 'Three of a Kind', 'Two Pair', 'Pair', 'High Card',
];

function buildWinDistribution(history: HandHistory[]) {
  const map: Record<string, number> = {};
  for (const h of history) {
    const name = h.playerEval?.name;
    if (name) map[name] = (map[name] ?? 0) + 1;
  }
  const total = Object.values(map).reduce((a, b) => a + b, 0);
  return HAND_RANK_ORDER
    .filter(k => map[k] > 0)
    .map(k => ({ name: k, count: map[k], pct: total > 0 ? (map[k] / total) * 100 : 0 }));
}

// ─── Win Distribution Chart ───────────────────────────────────────────────────

const WinDistribution = ({ history }: { history: HandHistory[] }) => {
  const dist = useMemo(() => buildWinDistribution(history), [history]);
  if (dist.length === 0) return null;

  const RANK_COLORS: Record<string, string> = {
    'Straight Flush':  '#FFE03D',
    'Four of a Kind':  '#FF8C42',
    'Full House':      '#FF5F8C',
    'Flush':           '#B366FF',
    'Straight':        '#00BFFF',
    'Three of a Kind': '#00E86C',
    'Two Pair':        '#39FF14',
    'Pair':            'rgba(255,255,255,0.55)',
    'High Card':       'rgba(255,255,255,0.2)',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="w-full rounded-2xl mb-6 p-5"
      style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="flex items-center gap-2 mb-4">
        <span style={{ ...cp(600, 11, '0.14em'), color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
          Hand Distribution
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {dist.map(({ name, count, pct }) => (
          <div key={name} className="flex items-center gap-3">
            <span style={{ ...cp(400, 11, '0.04em'), color: 'rgba(255,255,255,0.5)', minWidth: 120, whiteSpace: 'nowrap' }}>
              {name}
            </span>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <motion.div
                className="h-full rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                style={{ background: RANK_COLORS[name] ?? 'rgba(255,255,255,0.3)' }}
              />
            </div>
            <span style={{ ...cp(600, 11), color: RANK_COLORS[name] ?? 'rgba(255,255,255,0.4)', minWidth: 24, textAlign: 'right' }}>
              {count}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

// ─── Filter bar ───────────────────────────────────────────────────────────────

type ResultFilter = 'all' | 'WON' | 'LOST' | 'FOLD' | 'PUSH';
type ModeFilter   = 'all' | 'three-card' | 'holdem' | 'pvp';

const FilterPill = ({
  active, label, onClick,
}: { active: boolean; label: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="h-7 px-3 rounded-full font-mono text-[10px] tracking-widest uppercase transition-all"
    style={{
      background: active ? 'rgba(0,191,255,0.15)' : 'rgba(255,255,255,0.05)',
      border:     active ? '1px solid rgba(0,191,255,0.4)' : '1px solid rgba(255,255,255,0.08)',
      color:      active ? '#00BFFF' : 'rgba(255,255,255,0.4)',
    }}
  >
    {label}
  </button>
);

// ─── Single hand row ──────────────────────────────────────────────────────────

const HistoryRow = ({
  hand, index, onReplay,
}: { hand: HandHistory; index: number; onReplay: (h: HandHistory) => void }) => {
  const [expanded, setExpanded] = useState(false);

  const isWin  = hand.result === 'WON';
  const isFold = hand.result === 'FOLD';
  const isPush = hand.result === 'PUSH';

  const resultColor =
    isWin  ? '#00FF78' :
    isPush ? 'rgba(255,255,255,0.4)' :
    isFold ? 'rgba(255,255,255,0.3)' :
             '#FF4444';

  const modeColor: Record<string, string> = {
    'three-card': 'rgba(255,224,61,0.7)',
    holdem:       'rgba(0,191,255,0.7)',
    pvp:          'rgba(179,102,255,0.7)',
  };

  const dateStr = hand.timestamp
    ? new Date(hand.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
    >
      {/* Summary row */}
      <div
        className="flex items-center py-3.5 cursor-pointer px-4 rounded-lg gap-3 transition-colors"
        onClick={() => setExpanded(!expanded)}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        style={{ background: 'transparent' }}
      >
        <span style={{ ...cp(400, 12, '0.05em'), color: 'rgba(255,255,255,0.2)', minWidth: 36 }}>
          #{hand.id.slice(-4)}
        </span>

        <span
          className="uppercase"
          style={{
            ...cp(600, 11, '0.1em'),
            color: resultColor,
            background: `${resultColor}12`,
            border: `1px solid ${resultColor}30`,
            borderRadius: 999,
            padding: '2px 8px',
            minWidth: 56,
            textAlign: 'center',
          }}
        >
          {hand.result}
        </span>

        {hand.gameMode && (
          <span
            style={{
              ...cp(500, 10, '0.1em'),
              color: modeColor[hand.gameMode] ?? 'rgba(255,255,255,0.3)',
              background: `${modeColor[hand.gameMode] ?? 'rgba(255,255,255,0.1)'}18`,
              border: `1px solid ${modeColor[hand.gameMode] ?? 'rgba(255,255,255,0.1)'}40`,
              borderRadius: 999,
              padding: '2px 7px',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            {MODE_LABELS[hand.gameMode] ?? hand.gameMode}
          </span>
        )}

        <span className="flex-1 truncate pr-2" style={{ ...cp(400, 13), color: 'rgba(255,255,255,0.55)' }}>
          {hand.playerEval?.name ?? hand.desc}
        </span>

        {dateStr && (
          <span className="hidden md:block" style={{ ...cp(400, 10, '0.04em'), color: 'rgba(255,255,255,0.2)', whiteSpace: 'nowrap' }}>
            {dateStr}
          </span>
        )}

        <span style={{ ...cp(600, 14), color: hand.delta > 0 ? '#00FF78' : '#FF4444', minWidth: 48, textAlign: 'right' }}>
          {hand.delta > 0 ? '+' : ''}{hand.delta}
        </span>

        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          className="ml-1 shrink-0"
          style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}
        >
          ▾
        </motion.span>
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div
              className="mx-3 mb-3 p-5 flex flex-col md:flex-row gap-6 items-center justify-center"
              style={{
                background: '#0F1318',
                border: '1px solid rgba(0,229,255,0.10)',
                borderRadius: 10,
              }}
            >
              {!isFold ? (
                <>
                  <div className="flex flex-col items-center gap-2">
                    <span className="uppercase" style={{ ...cp(500, 10, '0.14em'), color: 'rgba(255,255,255,0.3)' }}>
                      You — {hand.playerEval?.name ?? ''}
                    </span>
                    <div className="flex gap-1 transform scale-75 origin-top">
                      {hand.playerCards.map((id, i) => <Card key={i} id={id} state="faceUp" />)}
                    </div>
                  </div>
                  {hand.botCards.length > 0 && (
                    <>
                      <span style={{ ...cp(400, 13), color: 'rgba(255,255,255,0.2)' }}>vs</span>
                      <div className="flex flex-col items-center gap-2">
                        <span className="uppercase" style={{ ...cp(500, 10, '0.14em'), color: 'rgba(255,255,255,0.3)' }}>
                          {hand.gameMode === 'pvp' ? 'Opponent' : 'Bot'} — {hand.botEval?.name ?? ''}
                        </span>
                        <div className="flex gap-1 transform scale-75 origin-top">
                          {hand.botCards.map((id, i) => <Card key={i} id={id} state="faceUp" />)}
                        </div>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <span style={{ ...cp(400, 13), color: 'rgba(255,255,255,0.3)' }}>
                  Hand folded. Cards encrypted forever.
                </span>
              )}

              <div className="w-full md:w-auto md:ml-auto flex flex-col items-end gap-2.5">
                {!isFold && hand.playerCards.length > 0 && (
                  <button
                    onClick={e => { e.stopPropagation(); onReplay(hand); }}
                    className="uppercase transition-colors"
                    style={{
                      ...cp(600, 11, '0.1em'),
                      color: '#B366FF',
                      border: '1px solid rgba(179,102,255,0.3)',
                      background: 'rgba(179,102,255,0.07)',
                      borderRadius: 6,
                      padding: '4px 14px',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(179,102,255,0.15)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(179,102,255,0.07)'; }}
                  >
                    ▶ REPLAY
                  </button>
                )}
                {hand.txHash && (
                  <span style={{ ...cp(400, 11, '0.04em'), color: 'rgba(255,255,255,0.2)' }}>
                    tx: {hand.txHash.substring(0, 10)}…
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ─── Main tab ─────────────────────────────────────────────────────────────────

export const HistoryTab = () => {
  const { history, setActiveTab } = useGameStore();
  const { address } = useAccount();
  const [replayHand,    setReplayHand]    = useState<HandHistory | null>(null);
  const [filterResult,  setFilterResult]  = useState<ResultFilter>('all');
  const [filterMode,    setFilterMode]    = useState<ModeFilter>('all');
  const [showFilters,   setShowFilters]   = useState(false);
  const [serverHistory, setServerHistory] = useState<HandHistory[]>([]);
  const [serverLoading, setServerLoading] = useState(false);

  // Load server history — merge with local, deduplicate by id
  useEffect(() => {
    if (!isSupabaseEnabled || !address) return;
    setServerLoading(true);
    getPlayerHandHistory(address, 100).then(rows => {
      const localIds = new Set(history.map(h => h.id));
      const merged: HandHistory[] = rows
        .filter(r => !localIds.has(r.id))
        .map(r => ({
          id:          r.id,
          result:      r.result as HandHistory['result'],
          desc:        r.eval_name ?? r.result,
          delta:       r.delta,
          txHash:      r.tx_hash,
          playerCards: [],
          botCards:    [],
          gameMode:    r.mode as HandHistory['gameMode'],
          timestamp:   new Date(r.played_at).getTime(),
        }));
      setServerHistory(merged);
    }).catch(() => {}).finally(() => setServerLoading(false));
  }, [address]); // eslint-disable-line react-hooks/exhaustive-deps

  // Combined history: local (full details) + server-only (no card data)
  const allHistory = useMemo(() => {
    const combined = [...history, ...serverHistory];
    combined.sort((a, b) => b.timestamp - a.timestamp);
    return combined;
  }, [history, serverHistory]);

  const filteredHistory = useMemo(() => {
    return allHistory.filter(h => {
      if (filterResult !== 'all' && h.result !== filterResult) return false;
      if (filterMode   !== 'all' && h.gameMode !== filterMode)  return false;
      return true;
    });
  }, [allHistory, filterResult, filterMode]);

  const hasFilters = filterResult !== 'all' || filterMode !== 'all';

  const clearFilters = useCallback(() => {
    setFilterResult('all');
    setFilterMode('all');
  }, []);

  const modes = useMemo(() => {
    const s = new Set(allHistory.map(h => h.gameMode).filter(Boolean));
    return Array.from(s) as ModeFilter[];
  }, [allHistory]);

  return (
    <div
      className="w-full max-w-[900px] mx-auto py-10 px-4 min-h-[calc(100vh-112px)]"
      style={{ background: '#0A0D12' }}
    >
      {/* Page title + actions */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 mb-8"
      >
        <h1 className="uppercase leading-none" style={{ ...cp(700, 52, '0.06em'), color: 'white' }}>
          HISTORY
        </h1>
        {allHistory.length > 0 && (
          <span style={{ ...cp(400, 12), color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: '3px 10px' }}>
            {allHistory.length} hands
          </span>
        )}
        {/* Server sync status */}
        <span className="flex items-center gap-1" style={{ ...cp(400, 10), color: isSupabaseEnabled ? (serverLoading ? '#FFE03D' : '#00E86C') : 'rgba(255,255,255,0.25)' }}>
          {isSupabaseEnabled ? <Wifi size={10} /> : <WifiOff size={10} />}
          {serverLoading ? 'Syncing…' : isSupabaseEnabled ? 'Live' : 'Local'}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {history.length > 0 && (
            <>
              <button
                onClick={() => setShowFilters(f => !f)}
                aria-label="Toggle filters"
                aria-expanded={showFilters}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg transition-all"
                style={{
                  ...cp(500, 11, '0.1em'),
                  background: showFilters ? 'rgba(0,191,255,0.12)' : 'rgba(255,255,255,0.05)',
                  border: showFilters ? '1px solid rgba(0,191,255,0.3)' : '1px solid rgba(255,255,255,0.08)',
                  color: showFilters ? '#00BFFF' : 'rgba(255,255,255,0.4)',
                }}
              >
                <Filter size={12} />
                FILTER
                {hasFilters && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ background: '#00BFFF', color: '#000' }}>
                    ON
                  </span>
                )}
              </button>

              <button
                onClick={() => setTimeout(() => exportCSV(allHistory), 0)}
                aria-label="Export hand history as CSV"
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg transition-all"
                style={{
                  ...cp(500, 11, '0.1em'),
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.4)',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'white'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.4)'; }}
              >
                <Download size={12} />
                CSV
              </button>
            </>
          )}
        </div>
      </motion.div>

      {/* Filter panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden mb-6"
          >
            <div
              className="p-4 rounded-xl flex flex-wrap gap-4 items-start"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              {/* Result filter */}
              <div className="flex flex-col gap-2">
                <span style={{ ...cp(500, 10, '0.14em'), color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>Result</span>
                <div className="flex flex-wrap gap-1.5">
                  {(['all', 'WON', 'LOST', 'FOLD'] as ResultFilter[]).map(r => (
                    <FilterPill key={r} active={filterResult === r} label={r === 'all' ? 'All' : r} onClick={() => setFilterResult(r)} />
                  ))}
                </div>
              </div>

              {/* Mode filter */}
              {modes.length > 1 && (
                <div className="flex flex-col gap-2">
                  <span style={{ ...cp(500, 10, '0.14em'), color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>Mode</span>
                  <div className="flex flex-wrap gap-1.5">
                    <FilterPill active={filterMode === 'all'} label="All" onClick={() => setFilterMode('all')} />
                    {modes.map(m => (
                      <FilterPill key={m} active={filterMode === m} label={MODE_LABELS[m] ?? m} onClick={() => setFilterMode(m)} />
                    ))}
                  </div>
                </div>
              )}

              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="ml-auto flex items-center gap-1.5 h-7 px-3 rounded-full text-[10px] font-mono tracking-widest uppercase self-end"
                  style={{ color: 'rgba(255,59,59,0.7)', border: '1px solid rgba(255,59,59,0.2)', background: 'rgba(255,59,59,0.06)' }}
                >
                  <X size={10} /> CLEAR
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats bar */}
      <StatsBar />

      {/* Win distribution */}
      {history.length >= 3 && <WinDistribution history={history} />}

      {filteredHistory.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <History size={40} strokeWidth={1} style={{ color: 'rgba(255,255,255,0.1)' }} />
          <span style={{ ...cp(400, 14), color: 'rgba(255,255,255,0.3)' }}>
            {hasFilters ? 'No hands match the current filters.' : 'No hands played yet.'}
          </span>
          {hasFilters ? (
            <button
              onClick={clearFilters}
              className="uppercase transition-colors"
              style={{
                ...cp(600, 12, '0.1em'),
                color: '#00E5FF',
                border: '1px solid rgba(0,229,255,0.25)',
                background: 'rgba(0,229,255,0.07)',
                borderRadius: 6,
                padding: '6px 18px',
                marginTop: 4,
              }}
            >
              CLEAR FILTERS
            </button>
          ) : (
            <button
              onClick={() => setActiveTab('play')}
              className="uppercase transition-colors"
              style={{
                ...cp(600, 12, '0.1em'),
                color: '#00E5FF',
                border: '1px solid rgba(0,229,255,0.25)',
                background: 'rgba(0,229,255,0.07)',
                borderRadius: 6,
                padding: '6px 18px',
                marginTop: 4,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,229,255,0.14)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,229,255,0.07)'; }}
            >
              PLAY NOW →
            </button>
          )}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          style={{
            background: '#0F1318',
            border: '1px solid rgba(0,229,255,0.12)',
            borderRadius: 12,
            boxShadow: '0 0 32px rgba(0,229,255,0.03)',
            overflow: 'hidden',
          }}
        >
          {/* Column header */}
          <div
            className="flex items-center gap-3 px-4 py-3"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            <span style={{ ...cp(500, 10, '0.15em'), color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', minWidth: 36 }}>#</span>
            <span style={{ ...cp(500, 10, '0.15em'), color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', minWidth: 56 }}>Result</span>
            <span style={{ ...cp(500, 10, '0.15em'), color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>Mode</span>
            <span style={{ ...cp(500, 10, '0.15em'), color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', flex: 1 }}>Hand</span>
            <span className="hidden md:block" style={{ ...cp(500, 10, '0.15em'), color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>Date</span>
            <span style={{ ...cp(500, 10, '0.15em'), color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', minWidth: 48, textAlign: 'right' }}>Δ</span>
            <span style={{ minWidth: 20 }} />
          </div>

          {/* Result count if filtered */}
          {hasFilters && filteredHistory.length !== history.length && (
            <div className="px-4 py-2 text-center" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(0,191,255,0.03)' }}>
              <span style={{ ...cp(400, 11), color: 'rgba(0,191,255,0.6)' }}>
                Showing {filteredHistory.length} of {history.length} hands
              </span>
            </div>
          )}

          {filteredHistory.map((hand, i) => (
            <HistoryRow key={hand.id} hand={hand} index={i} onReplay={setReplayHand} />
          ))}
        </motion.div>
      )}

      {/* Replay modal */}
      <AnimatePresence>
        {replayHand && (
          <HandReplayModal hand={replayHand} onClose={() => setReplayHand(null)} />
        )}
      </AnimatePresence>
    </div>
  );
};
