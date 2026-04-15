import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore, HandHistory } from '@/store/useGameStore';
import { Card } from '@/components/ui/Card';
import { StatsBar } from '@/components/ui/StatsBar';
import { HandReplayModal } from '@/components/ui/HandReplayModal';

// ─── Single hand row ──────────────────────────────────────────────────────────

const HistoryRow = ({
  hand,
  index,
  onReplay,
}: {
  hand: HandHistory;
  index: number;
  onReplay: (h: HandHistory) => void;
}) => {
  const [expanded, setExpanded] = useState(false);

  const isWin  = hand.result === 'WON';
  const isFold = hand.result === 'FOLD';
  const isPush = hand.result === 'PUSH';

  const resultColor =
    isWin  ? 'var(--color-primary)' :
    isPush ? '#888' :
    isFold ? 'var(--color-text-secondary)' :
             'var(--color-danger)';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
    >
      {/* Summary row */}
      <div
        className="flex items-center py-4 cursor-pointer px-3 transition-all rounded-lg gap-3"
        onClick={() => setExpanded(!expanded)}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        style={{ background: 'transparent' }}
      >
        <div className="font-mono text-xs min-w-[40px]" style={{ color: 'var(--color-text-dark)' }}>
          #{hand.id}
        </div>
        <div
          className="font-mono text-xs font-bold min-w-[56px] tracking-wider uppercase"
          style={{ color: resultColor }}
        >
          {hand.result}
        </div>
        <div className="font-satoshi text-sm flex-1 truncate pr-2" style={{ color: 'var(--color-text-secondary)' }}>
          {hand.playerEval?.name ?? hand.desc}
        </div>
        <div
          className="font-mono text-sm font-bold"
          style={{ color: hand.delta > 0 ? 'var(--color-primary)' : 'var(--color-danger)' }}
        >
          {hand.delta > 0 ? '+' : ''}{hand.delta}
        </div>
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          className="ml-1 text-xs shrink-0"
          style={{ color: 'var(--color-text-muted)' }}
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
              className="p-5 flex flex-col md:flex-row gap-6 items-center justify-center rounded-xl mx-2 mb-2"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border:     '1px solid rgba(255,255,255,0.10)',
              }}
            >
              {!isFold ? (
                <>
                  <div className="flex flex-col items-center gap-2">
                    <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: 'var(--color-text-muted)' }}>
                      You — {hand.playerEval?.name ?? ''}
                    </span>
                    <div className="flex gap-1 transform scale-75 origin-top">
                      {hand.playerCards.map((id, i) => <Card key={i} id={id} state="faceUp" />)}
                    </div>
                  </div>
                  {hand.botCards.length > 0 && (
                    <>
                      <div className="font-mono text-sm" style={{ color: 'var(--color-text-dark)' }}>vs</div>
                      <div className="flex flex-col items-center gap-2">
                        <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: 'var(--color-text-muted)' }}>
                          Bot — {hand.botEval?.name ?? ''}
                        </span>
                        <div className="flex gap-1 transform scale-75 origin-top">
                          {hand.botCards.map((id, i) => <Card key={i} id={id} state="faceUp" />)}
                        </div>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="font-mono text-xs py-4" style={{ color: 'var(--color-text-muted)' }}>
                  Hand folded. Cards encrypted forever.
                </div>
              )}

              {/* Actions */}
              <div className="w-full md:w-auto md:ml-auto flex flex-col items-end gap-2">
                {/* REPLAY button */}
                {!isFold && hand.playerCards.length > 0 && (
                  <button
                    onClick={e => { e.stopPropagation(); onReplay(hand); }}
                    className="font-mono text-[10px] tracking-widest uppercase px-4 py-1.5 rounded-full transition-all hover:brightness-110"
                    style={{
                      color:      'var(--color-fhe)',
                      border:     '1px solid rgba(179,102,255,0.25)',
                      background: 'rgba(179,102,255,0.06)',
                    }}
                  >
                    ▶ REPLAY
                  </button>
                )}
                <a
                  href="#"
                  className="font-mono text-[10px] transition-colors hover:text-white"
                  style={{ color: 'var(--color-text-dark)' }}
                >
                  tx: {hand.txHash.substring(0, 10)}…
                </a>
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
  const [replayHand, setReplayHand] = useState<HandHistory | null>(null);

  return (
    <div className="w-full max-w-[900px] mx-auto py-10 px-4 min-h-[calc(100vh-112px)]">
      <h1 className="font-clash text-[48px] uppercase tracking-tight mb-6">HANDS</h1>

      {/* Rich stats bar */}
      <StatsBar />

      {history.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-5xl mb-4" style={{ color: 'var(--color-text-dark)' }}>♠</div>
          <div className="font-mono text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
            No hands played yet.
          </div>
          <button
            onClick={() => setActiveTab('play')}
            className="font-mono text-sm font-bold tracking-wider flex items-center gap-2 transition-colors hover:text-primary"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <span style={{ color: 'var(--color-primary)' }}>▶</span> PLAY →
          </button>
        </div>
      ) : (
        <div className="flex flex-col">
          {history.map((hand, i) => (
            <HistoryRow
              key={hand.id}
              hand={hand}
              index={i}
              onReplay={setReplayHand}
            />
          ))}
        </div>
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
