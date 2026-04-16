import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History } from 'lucide-react';
import { useGameStore, HandHistory } from '@/store/useGameStore';
import { Card } from '@/components/ui/Card';
import { StatsBar } from '@/components/ui/StatsBar';
import { HandReplayModal } from '@/components/ui/HandReplayModal';

// ─── Typography helpers ───────────────────────────────────────────────────────

const cp = (weight: number, size: number, spacing = '0.03em') => ({
  fontFamily: "'Chakra Petch', sans-serif",
  fontWeight: weight,
  fontSize: size,
  letterSpacing: spacing,
});

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
    isWin  ? '#00FF78' :
    isPush ? 'rgba(255,255,255,0.4)' :
    isFold ? 'rgba(255,255,255,0.3)' :
             '#FF4444';

  const deltaColor = hand.delta > 0 ? '#00FF78' : '#FF4444';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
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
        {/* Hand id */}
        <span style={{ ...cp(400, 12, '0.05em'), color: 'rgba(255,255,255,0.2)', minWidth: 36 }}>
          #{hand.id}
        </span>

        {/* Result badge */}
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

        {/* Description */}
        <span className="flex-1 truncate pr-2" style={{ ...cp(400, 13), color: 'rgba(255,255,255,0.55)' }}>
          {hand.playerEval?.name ?? hand.desc}
        </span>

        {/* Delta */}
        <span style={{ ...cp(600, 14), color: deltaColor, minWidth: 48, textAlign: 'right' }}>
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
                <span style={{ ...cp(400, 13), color: 'rgba(255,255,255,0.3)' }}>
                  Hand folded. Cards encrypted forever.
                </span>
              )}

              {/* Actions */}
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
                <span style={{ ...cp(400, 11, '0.04em'), color: 'rgba(255,255,255,0.2)' }}>
                  tx: {hand.txHash.substring(0, 10)}…
                </span>
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
    <div
      className="w-full max-w-[900px] mx-auto py-10 px-4 min-h-[calc(100vh-112px)]"
      style={{ background: '#0A0D12' }}
    >
      {/* Page title */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 mb-8"
      >
        <h1
          className="uppercase leading-none"
          style={{ ...cp(700, 52, '0.06em'), color: 'white' }}
        >
          HISTORY
        </h1>
        {history.length > 0 && (
          <span
            style={{
              ...cp(400, 12),
              color: 'rgba(255,255,255,0.5)',
              background: 'rgba(255,255,255,0.06)',
              borderRadius: 6,
              padding: '3px 10px',
            }}
          >
            {history.length} hands
          </span>
        )}
      </motion.div>

      {/* Stats bar */}
      <StatsBar />

      {history.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <History size={40} strokeWidth={1} style={{ color: 'rgba(255,255,255,0.1)' }} />
          <span style={{ ...cp(400, 14), color: 'rgba(255,255,255,0.3)' }}>
            No hands played yet.
          </span>
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
        </div>
      ) : (
        /* Hand list card */
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
            {['#', 'Result', 'Hand', 'Δ Chips'].map((h, i) => (
              <span
                key={h}
                className="uppercase"
                style={{
                  ...cp(500, 10, '0.15em'),
                  color: 'rgba(255,255,255,0.25)',
                  minWidth: i === 0 ? 36 : i === 1 ? 56 : i === 3 ? 48 : undefined,
                  flex: i === 2 ? 1 : undefined,
                  textAlign: i === 3 ? 'right' : undefined,
                }}
              >
                {h}
              </span>
            ))}
            <span style={{ minWidth: 20 }} />
          </div>

          {history.map((hand, i) => (
            <HistoryRow
              key={hand.id}
              hand={hand}
              index={i}
              onReplay={setReplayHand}
            />
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
