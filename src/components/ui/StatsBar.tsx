/**
 * StatsBar — compact statistics panel shown at the top of HistoryTab.
 * Derives all values from the persisted history array in the game store.
 */
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useGameStore, HandHistory } from '@/store/useGameStore';

// ─── Derived stats ───────────────────────────────────────────────────────────

function computeStreak(history: HandHistory[]): { type: 'W' | 'L' | null; count: number } {
  if (history.length === 0) return { type: null, count: 0 };
  const recent = [...history]; // history is newest-first
  const first = recent[0].result === 'WON' ? 'W' : recent[0].result === 'LOST' ? 'L' : null;
  if (!first) return { type: null, count: 0 };
  let count = 0;
  for (const h of recent) {
    const r = h.result === 'WON' ? 'W' : h.result === 'LOST' ? 'L' : null;
    if (r === first) count++;
    else break;
  }
  return { type: first, count };
}

function bestHandName(history: HandHistory[]): string {
  const ranked = [
    'Straight Flush', 'Three of a Kind', 'Straight', 'Flush', 'Pair', 'High Card'
  ];
  for (const target of ranked) {
    if (history.some(h => h.playerEval?.name === target || h.desc?.includes(target))) {
      return target;
    }
  }
  // fallback: check payout desc field
  for (const h of history) {
    if (h.payout?.desc) return h.payout.desc;
  }
  return '—';
}

function sparklinePoints(history: HandHistory[], width = 120, height = 28): string {
  if (history.length < 2) return '';
  const deltas = [...history].reverse().map(h => h.delta);
  let cumulative = 0;
  const values = deltas.map(d => { cumulative += d; return cumulative; });
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return pts.join(' ');
}

// ─── Sub-components ──────────────────────────────────────────────────────────

const StatCell = ({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color?: string;
  sub?: string;
}) => (
  <div className="flex flex-col items-center gap-0.5 min-w-[56px]">
    <span className="font-clash text-xl leading-none" style={{ color: color || 'white' }}>
      {value}
    </span>
    {sub && (
      <span className="font-mono text-[8px] tracking-wider" style={{ color: color || 'rgba(255,255,255,0.5)' }}>
        {sub}
      </span>
    )}
    <span className="font-mono text-[8px] tracking-[0.12em] uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>
      {label}
    </span>
  </div>
);

const StreakBadge = ({ type, count }: { type: 'W' | 'L' | null; count: number }) => {
  if (!type || count === 0) return null;
  const isWin = type === 'W';
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="flex items-center gap-1 px-2.5 py-1 rounded-full font-mono text-[10px] tracking-widest uppercase font-bold"
      style={{
        background: isWin ? 'rgba(57,255,20,0.1)' : 'rgba(255,59,59,0.1)',
        border:     `1px solid ${isWin ? 'rgba(57,255,20,0.3)' : 'rgba(255,59,59,0.3)'}`,
        color:      isWin ? 'var(--color-success)' : 'var(--color-danger)',
      }}
    >
      <motion.span
        animate={isWin ? { scale: [1, 1.3, 1] } : { rotate: [0, -5, 5, 0] }}
        transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
      >
        {isWin ? '🔥' : '❄️'}
      </motion.span>
      {count}{type} STREAK
    </motion.div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export const StatsBar = () => {
  const { history, balance } = useGameStore();

  const wins   = history.filter(h => h.result === 'WON').length;
  const losses = history.filter(h => h.result === 'LOST').length;
  const total  = history.length;
  const rate   = total > 0 ? Math.round((wins / total) * 100) : 0;
  const net    = history.reduce((s, h) => s + h.delta, 0);

  const streak  = useMemo(() => computeStreak(history), [history]);
  const best    = useMemo(() => bestHandName(history), [history]);
  const points  = useMemo(() => sparklinePoints(history), [history]);

  if (total === 0) {
    return (
      <div
        className="w-full rounded-2xl px-5 py-6 mb-6 flex flex-col items-center gap-2"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
      >
        <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.2)' }}>
          No hands played yet
        </span>
        <span className="font-satoshi text-xs" style={{ color: 'rgba(255,255,255,0.15)' }}>
          Play your first hand to see stats
        </span>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full rounded-2xl mb-6 overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* Top accent */}
      <div className="h-[1px] w-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,224,61,0.4), transparent)' }} />

      <div className="px-5 pt-4 pb-4">
        {/* Row 1 — streak + sparkline */}
        <div className="flex items-center justify-between mb-4">
          <StreakBadge type={streak.type} count={streak.count} />

          {/* Chip sparkline */}
          {points && (
            <div className="flex flex-col items-end gap-1">
              <svg width={120} height={28} className="opacity-70">
                <polyline
                  points={points}
                  fill="none"
                  stroke={net >= 0 ? 'var(--color-success)' : 'var(--color-danger)'}
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
              <span
                className="font-mono text-[9px] tracking-wider"
                style={{ color: net >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}
              >
                {net >= 0 ? '+' : ''}{net} chips net
              </span>
            </div>
          )}
        </div>

        {/* Row 2 — stat cells */}
        <div className="flex items-end justify-around gap-2">
          <StatCell
            label="Hands"
            value={String(total)}
            color="white"
          />
          <div className="w-px h-8 self-center" style={{ background: 'rgba(255,255,255,0.08)' }} />
          <StatCell
            label="Win Rate"
            value={`${rate}%`}
            color={rate >= 50 ? 'var(--color-success)' : 'var(--color-danger)'}
          />
          <div className="w-px h-8 self-center" style={{ background: 'rgba(255,255,255,0.08)' }} />
          <StatCell
            label="Balance"
            value={balance.toLocaleString()}
            color="var(--color-primary)"
            sub="chips"
          />
          <div className="w-px h-8 self-center" style={{ background: 'rgba(255,255,255,0.08)' }} />
          <StatCell
            label="Best Hand"
            value={best === '—' ? '—' : best.split(' ').length > 1 ? best.split(' ')[0] : best}
            sub={best !== '—' && best.includes(' ') ? best.split(' ').slice(1).join(' ') : undefined}
            color="var(--color-fhe)"
          />
        </div>
      </div>
    </motion.div>
  );
};
