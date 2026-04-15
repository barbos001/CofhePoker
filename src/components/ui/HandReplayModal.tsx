/**
 * HandReplayModal — cinematic card-by-card replay of a completed hand.
 * Triggered by clicking REPLAY on any HistoryTab entry.
 */
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HandHistory } from '@/store/useGameStore';
import { Card } from '@/components/ui/Card';
import { getCardData } from '@/lib/poker';

interface Props {
  hand: HandHistory;
  onClose: () => void;
}

const CARD_DELAY = 420; // ms between each card flip
const PAUSE_AFTER_DEAL = 900;
const PAUSE_BEFORE_RESULT = 600;

export const HandReplayModal = ({ hand, onClose }: Props) => {
  const [phase, setPhase] = useState<'deal' | 'bot' | 'result'>('deal');
  const [visiblePlayerCards, setVisiblePlayerCards] = useState<number[]>([]);
  const [visibleBotCards,    setVisibleBotCards]    = useState<number[]>([]);
  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clear = () => timerRefs.current.forEach(clearTimeout);

  useEffect(() => {
    clear();

    // Deal player cards one by one
    hand.playerCards.forEach((_, i) => {
      const t = setTimeout(() => {
        setVisiblePlayerCards(prev => [...prev, i]);
      }, i * CARD_DELAY);
      timerRefs.current.push(t);
    });

    // After player cards — pause then reveal bot cards
    const botStart = hand.playerCards.length * CARD_DELAY + PAUSE_AFTER_DEAL;
    hand.botCards?.forEach((_, i) => {
      const t = setTimeout(() => {
        setVisibleBotCards(prev => [...prev, i]);
        if (i === 0) setPhase('bot');
      }, botStart + i * CARD_DELAY);
      timerRefs.current.push(t);
    });

    // Then show result
    const resultTime = botStart + (hand.botCards?.length ?? 0) * CARD_DELAY + PAUSE_BEFORE_RESULT;
    const rt = setTimeout(() => setPhase('result'), resultTime);
    timerRefs.current.push(rt);

    return clear;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isWin  = hand.result === 'WON';
  const isFold = hand.result === 'FOLD';

  const resultColor =
    isWin    ? 'var(--color-success)'  :
    isFold   ? 'rgba(255,255,255,0.4)' :
               'var(--color-danger)';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 24 }}
        animate={{ scale: 1,   y: 0  }}
        exit={{ scale: 0.9,    y: 24 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className="relative w-full max-w-sm rounded-2xl overflow-hidden"
        style={{
          background: 'rgba(10,10,18,0.98)',
          border:     '1px solid rgba(255,255,255,0.08)',
          boxShadow:  '0 32px 64px rgba(0,0,0,0.7)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
        >
          <div className="flex items-center gap-2">
            <motion.span
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: 'var(--color-fhe)' }}
            />
            <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: 'var(--color-text-muted)' }}>
              REPLAY  #{hand.id}
            </span>
          </div>
          <button
            onClick={onClose}
            className="font-mono text-xs px-3 py-1 rounded-full transition-colors"
            style={{ color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            ✕
          </button>
        </div>

        {/* Main area */}
        <div className="px-5 py-6 flex flex-col gap-6">
          {/* Player cards */}
          <div className="flex flex-col items-center gap-3">
            <span className="font-mono text-[9px] tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>
              YOUR HAND
            </span>
            <div className="flex gap-2">
              {hand.playerCards.map((id, i) => (
                <AnimatePresence key={i}>
                  {visiblePlayerCards.includes(i) && (
                    <motion.div
                      initial={{ rotateY: 90, opacity: 0 }}
                      animate={{ rotateY: 0,  opacity: 1 }}
                      transition={{ duration: 0.35, ease: 'easeOut' }}
                    >
                      <Card id={id} state="faceUp" />
                    </motion.div>
                  )}
                  {!visiblePlayerCards.includes(i) && (
                    <motion.div
                      initial={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <Card id={0} state="faceDown" />
                    </motion.div>
                  )}
                </AnimatePresence>
              ))}
            </div>
            {visiblePlayerCards.length === hand.playerCards.length && hand.playerCards.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="font-satoshi text-xs font-semibold"
                style={{ color: 'var(--color-fhe)' }}
              >
                {hand.playerEval?.name ?? hand.playerCards.map(c => {
                  const d = getCardData(c);
                  return d.rankString + d.suit;
                }).join(' ')}
              </motion.div>
            )}
          </div>

          {/* Bot cards */}
          {!isFold && hand.botCards && hand.botCards.length > 0 && (
            <div className="flex flex-col items-center gap-3">
              <span className="font-mono text-[9px] tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>
                BOT HAND
              </span>
              <div className="flex gap-2">
                {hand.botCards.map((id, i) => (
                  <AnimatePresence key={i}>
                    {visibleBotCards.includes(i) ? (
                      <motion.div
                        initial={{ rotateY: 90, opacity: 0 }}
                        animate={{ rotateY: 0,  opacity: 1 }}
                        transition={{ duration: 0.35, ease: 'easeOut' }}
                      >
                        <Card id={id} state="faceUp" />
                      </motion.div>
                    ) : (
                      <Card id={0} state="faceDown" />
                    )}
                  </AnimatePresence>
                ))}
              </div>
              {visibleBotCards.length === hand.botCards.length && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="font-satoshi text-xs font-semibold"
                  style={{ color: 'rgba(255,255,255,0.4)' }}
                >
                  {hand.botEval?.name ?? hand.botCards.map(c => {
                    const d = getCardData(c);
                    return d.rankString + d.suit;
                  }).join(' ')}
                </motion.div>
              )}
            </div>
          )}

          {isFold && (
            <div className="flex flex-col items-center gap-1 py-2">
              <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.2)' }}>
                Hand folded
              </span>
              <span className="font-satoshi text-xs" style={{ color: 'rgba(255,255,255,0.12)' }}>
                Cards encrypted forever
              </span>
            </div>
          )}

          {/* Result */}
          <AnimatePresence>
            {phase === 'result' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-1 pt-2"
                style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="font-clash text-3xl" style={{ color: resultColor }}>
                  {hand.result}
                </div>
                <div className="font-mono text-sm font-bold" style={{ color: resultColor }}>
                  {hand.delta > 0 ? '+' : ''}{hand.delta} chips
                </div>
                {hand.desc && (
                  <div className="font-satoshi text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {hand.desc}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3 flex justify-end gap-2"
          style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
        >
          <button
            onClick={onClose}
            className="font-mono text-[10px] tracking-widest uppercase px-5 py-2 rounded-full transition-colors"
            style={{
              color:  'rgba(255,255,255,0.4)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            CLOSE
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
