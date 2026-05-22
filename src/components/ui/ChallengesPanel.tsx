import { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChallengesStore, Challenge } from '@/store/useChallengesStore';
import { useGameStore } from '@/store/useGameStore';

const cp = (w: number, s: number | string, sp = '0.03em') => ({
  fontFamily: "'Chakra Petch', sans-serif", fontWeight: w, fontSize: s, letterSpacing: sp,
});

function timeLeft(expiresAt: number): string {
  const ms = expiresAt - Date.now();
  if (ms <= 0) return 'Expired';
  const h  = Math.floor(ms / 3_600_000);
  const m  = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${m}m`;
}

// ── Single challenge card ─────────────────────────────────────────────────────
const ChallengeCard = ({ challenge, onClaim }: { challenge: Challenge; onClaim: (id: string) => void }) => {
  const pct       = Math.min(100, (challenge.progress / challenge.goal) * 100);
  const done      = challenge.progress >= challenge.goal;
  const claimable = done && !challenge.claimed;
  const claimed   = challenge.claimed;

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      className="flex flex-col gap-3 p-4 rounded-xl"
      style={{
        background:  claimed ? 'rgba(255,255,255,0.02)' : claimable ? 'rgba(255,224,61,0.06)' : 'rgba(255,255,255,0.025)',
        border:      claimed ? '1px solid rgba(255,255,255,0.04)' : claimable ? '1px solid rgba(255,224,61,0.25)' : '1px solid rgba(255,255,255,0.07)',
        opacity:     claimed ? 0.5 : 1,
      }}
    >
      <div className="flex items-start gap-3">
        <span style={{ fontSize: 22, filter: claimed ? 'grayscale(100%)' : 'none' }}>{challenge.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ ...cp(700, 13, '0.04em'), color: claimed ? 'rgba(255,255,255,0.4)' : 'white' }}>
              {challenge.title}
            </span>
            <span className="shrink-0 px-1.5 py-0.5 rounded-full font-mono text-[9px] uppercase"
              style={{
                background: challenge.type === 'daily' ? 'rgba(0,191,255,0.1)' : 'rgba(179,102,255,0.1)',
                border:     challenge.type === 'daily' ? '1px solid rgba(0,191,255,0.25)' : '1px solid rgba(179,102,255,0.25)',
                color:      challenge.type === 'daily' ? '#00BFFF' : '#B366FF',
              }}>
              {challenge.type}
            </span>
          </div>
          <div style={{ ...cp(400, 11, '0.04em'), color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
            {challenge.desc}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div style={{ ...cp(700, 13), color: 'var(--color-primary)' }}>+{challenge.reward}</div>
          <div style={{ ...cp(400, 9, '0.08em'), color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>chips</div>
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span style={{ ...cp(400, 10, '0.06em'), color: 'rgba(255,255,255,0.35)' }}>
            {challenge.progress}/{challenge.goal}
          </span>
          <span style={{ ...cp(400, 10, '0.06em'), color: 'rgba(255,255,255,0.25)' }}>
            {claimed ? '✓ Claimed' : timeLeft(challenge.expiresAt)}
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <motion.div
            className="h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            style={{
              background: claimed ? 'rgba(255,255,255,0.15)' : done ? 'var(--color-primary)' : '#00BFFF',
              boxShadow:  done && !claimed ? '0 0 6px rgba(255,224,61,0.4)' : 'none',
            }}
          />
        </div>
      </div>

      {/* Claim button */}
      <AnimatePresence>
        {claimable && (
          <motion.button
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            onClick={() => onClaim(challenge.id)}
            className="w-full py-2.5 rounded-xl font-mono text-[11px] tracking-widest uppercase font-bold transition-all"
            style={{ background: 'var(--color-primary)', color: '#000', boxShadow: '0 0 16px rgba(255,224,61,0.3)' }}
          >
            Claim +{challenge.reward} Chips ✦
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ── Main panel ────────────────────────────────────────────────────────────────
export const ChallengesPanel = () => {
  const { challenges, refreshIfNeeded, claimReward } = useChallengesStore();
  const { balance, setBalance } = useGameStore();

  useEffect(() => {
    refreshIfNeeded();
    const interval = setInterval(refreshIfNeeded, 60_000);
    return () => clearInterval(interval);
  }, [refreshIfNeeded]);

  const handleClaim = useCallback((id: string) => {
    claimReward(id, (chips) => setBalance(balance + chips));
  }, [claimReward, balance, setBalance]);

  const daily  = challenges.filter(c => c.type === 'daily');
  const weekly = challenges.filter(c => c.type === 'weekly');
  const totalAvailable = challenges.filter(c => c.progress >= c.goal && !c.claimed).length;

  return (
    <div className="flex flex-col gap-4">
      {totalAvailable > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: 'rgba(255,224,61,0.08)', border: '1px solid rgba(255,224,61,0.2)' }}>
          <span style={{ fontSize: 16 }}>🎁</span>
          <span style={{ ...cp(600, 12, '0.04em'), color: '#FFE03D' }}>
            {totalAvailable} reward{totalAvailable > 1 ? 's' : ''} ready to claim!
          </span>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 mb-3">
          <span style={{ fontSize: 14 }}>📅</span>
          <span style={{ ...cp(600, 11, '0.12em'), color: '#00BFFF', textTransform: 'uppercase' }}>Daily Challenges</span>
        </div>
        <div className="flex flex-col gap-2">
          {daily.map(c => <ChallengeCard key={c.id} challenge={c} onClaim={handleClaim} />)}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <span style={{ fontSize: 14 }}>📆</span>
          <span style={{ ...cp(600, 11, '0.12em'), color: '#B366FF', textTransform: 'uppercase' }}>Weekly Challenges</span>
        </div>
        <div className="flex flex-col gap-2">
          {weekly.map(c => <ChallengeCard key={c.id} challenge={c} onClaim={handleClaim} />)}
        </div>
      </div>
    </div>
  );
};
