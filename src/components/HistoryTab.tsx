import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore, HandHistory } from '@/store/useGameStore';
import { Card } from '@/components/ui/Card';

const HistoryRow = ({ hand, index }: { hand: HandHistory; index: number }) => {
  const [expanded, setExpanded] = useState(false);

  const isWin  = hand.result === 'WON';
  const isFold = hand.result === 'FOLD';
  const isPush = hand.result === 'PUSH';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
    >
      <div
        className="flex items-center py-4 cursor-pointer px-3 transition-all rounded-lg"
        onClick={() => setExpanded(!expanded)}
        style={{ background: 'transparent' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <div className="font-mono text-xs min-w-[40px]" style={{ color: 'var(--color-text-dark)' }}>#{hand.id}</div>
        <div
          className="font-mono text-xs font-bold min-w-[60px] tracking-wider uppercase"
          style={{
            color: isWin
              ? 'var(--color-primary)'
              : isPush
                ? '#888'
                : isFold
                  ? 'var(--color-text-secondary)'
                  : 'var(--color-danger)',
          }}
        >
          {hand.result}
        </div>
        <div className="font-satoshi text-sm flex-1 truncate pr-4" style={{ color: 'var(--color-text-secondary)' }}>
          {hand.desc}
        </div>
        <div
          className="font-mono text-sm font-bold"
          style={{ color: hand.delta > 0 ? 'var(--color-primary)' : 'var(--color-danger)' }}
        >
          {hand.delta > 0 ? '+' : ''}{hand.delta}
        </div>
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          className="ml-3 text-xs"
          style={{ color: 'var(--color-text-muted)' }}
        >
          ▾
        </motion.span>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div
              className="p-5 flex flex-col md:flex-row gap-6 items-center justify-center rounded-xl mx-2 mb-2"
              style={{
                background: 'rgba(255,255,255,0.02)',
                border:     '1px solid rgba(255,255,255,0.04)',
              }}
            >
              {!isFold ? (
                <>
                  <div className="flex flex-col items-center gap-2">
                    <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: 'var(--color-text-muted)' }}>You</span>
                    <div className="flex gap-1 transform scale-75 origin-top">
                      {hand.playerCards.map((id, i) => <Card key={i} id={id} state="faceUp" />)}
                    </div>
                  </div>
                  <div className="font-mono text-sm" style={{ color: 'var(--color-text-dark)' }}>vs</div>
                  <div className="flex flex-col items-center gap-2">
                    <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: 'var(--color-text-muted)' }}>Bot</span>
                    <div className="flex gap-1 transform scale-75 origin-top">
                      {hand.botCards.map((id, i) => <Card key={i} id={id} state="faceUp" />)}
                    </div>
                  </div>
                </>
              ) : (
                <div className="font-mono text-xs py-4" style={{ color: 'var(--color-text-muted)' }}>
                  Hand folded. Cards encrypted forever.
                </div>
              )}
              <div className="w-full md:w-auto md:ml-auto flex flex-col items-end gap-1">
                <a
                  href="#"
                  className="font-mono text-[10px] transition-colors hover:text-white"
                  style={{ color: 'var(--color-text-dark)' }}
                >
                  tx: {hand.txHash.substring(0, 10)}...
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export const HistoryTab = () => {
  const { history, setActiveTab } = useGameStore();

  const played = history.length;
  const wins = history.filter(h => h.result === 'WON').length;
  const winRate = played > 0 ? Math.round((wins / played) * 100) : 0;
  const totalDelta = history.reduce((acc, h) => acc + h.delta, 0);

  return (
    <div className="w-full max-w-[900px] mx-auto py-10 px-4 min-h-[calc(100vh-112px)]">
      <h1 className="font-clash text-[48px] uppercase tracking-tight mb-8">HANDS</h1>

      {/* Stats pills */}
      <div className="flex flex-wrap gap-2 mb-10">
        {[
          { label: `${played} played`, color: 'rgba(255,255,255,0.6)' },
          { label: `${winRate}% win rate`, color: 'var(--color-success)' },
          { label: `${totalDelta >= 0 ? '+' : ''}${totalDelta} chips`, color: totalDelta >= 0 ? 'var(--color-primary)' : 'var(--color-danger)' },
        ].map((s, i) => (
          <div
            key={i}
            className="h-8 px-4 rounded-full font-mono text-xs font-bold tracking-wider flex items-center"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border:     '1px solid rgba(255,255,255,0.06)',
              color:      s.color,
            }}
          >
            {s.label}
          </div>
        ))}
      </div>

      {history.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-5xl mb-4" style={{ color: 'var(--color-text-dark)' }}>♠</div>
          <div className="font-mono text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
            No hands played yet.
          </div>
          <button
            onClick={() => setActiveTab('play')}
            className="font-mono text-sm font-bold tracking-wider flex items-center gap-2 transition-colors hover:text-primary"
          >
            <span style={{ color: 'var(--color-primary)' }}>▶</span> PLAY →
          </button>
        </div>
      ) : (
        <div className="flex flex-col">
          {history.map((hand, i) => (
            <HistoryRow key={hand.id} hand={hand} index={i} />
          ))}
        </div>
      )}
    </div>
  );
};
