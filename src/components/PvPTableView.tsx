import { motion, AnimatePresence } from 'framer-motion';
import { usePvPGameStore } from '@/store/usePvPGameStore';
import { usePvPGame } from '@/hooks/usePvPGame';
import { Card } from '@/components/ui/Card';
import { TypewriterText, NumberScramble } from '@/components/ui/TextFX';
import { DecoShapes } from '@/components/ui/DecoShapes';
import { PlayCTA } from '@/components/ui/Pill';
import { useCallback, useRef } from 'react';
import { useMotionValue, useSpring } from 'framer-motion';

const truncAddr = (a: string) => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '???';

// ── Magnetic button (same as PlayTab) ──
const MagneticBtn = ({ children, onClick, disabled, className, style }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean;
  className?: string; style?: React.CSSProperties;
}) => {
  const ref = useRef<HTMLButtonElement>(null);
  const x = useMotionValue(0); const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 300, damping: 20 });
  const sy = useSpring(y, { stiffness: 300, damping: 20 });
  const onMove = useCallback((e: React.MouseEvent) => {
    if (disabled || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * 0.12);
    y.set((e.clientY - (r.top + r.height / 2)) * 0.12);
  }, [disabled, x, y]);
  const onLeave = useCallback(() => { x.set(0); y.set(0); }, [x, y]);
  return (
    <motion.button ref={ref} onClick={onClick} disabled={disabled} onMouseMove={onMove}
      onMouseLeave={onLeave} whileTap={!disabled ? { scale: 0.95 } : {}}
      className={className} style={{ ...style, x: sx, y: sy }}>
      {children}
    </motion.button>
  );
};

// ── Table felt pattern ──
const TablePattern = () => (
  <svg className="absolute inset-0 w-full h-full rounded-3xl" style={{ opacity: 0.04 }} preserveAspectRatio="none">
    <defs>
      <pattern id="pvp-felt" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M20 0 L40 20 L20 40 L0 20Z" stroke="rgba(255,255,255,0.8)" strokeWidth="0.5" fill="none" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#pvp-felt)" />
  </svg>
);

// ── Result overlay ──
const PvPResultOverlay = () => {
  const { pvpState, handResult, pot, balance, myEval, opponentEval, myCards, opponentCards, resetForNextHand, resetToIdle } = usePvPGameStore();
  if (pvpState !== 'result' || !handResult) return null;
  const isWin = handResult === 'WON' || handResult === 'OPP_FOLD';
  const isFold = handResult === 'FOLD';
  const isDraw = handResult === 'DRAW';
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(10px)' }}
    >
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 20, delay: 0.1 }}
        className="flex flex-col items-center max-w-[600px] w-full relative">
        {isWin && <DecoShapes count={14} className="z-0" />}
        <div className="z-10 mb-8">
          {isWin && (
            <div className="flex font-clash text-[80px] uppercase tracking-tighter"
              style={{ color: 'var(--color-primary)', animation: 'counter-glow 2s ease-in-out infinite' }}>
              {"WON".split('').map((c, i) => (
                <motion.span key={i} initial={{ y: 30, rotateX: -90 }} animate={{ y: [30, -8, 0], rotateX: [-90, 10, 0] }}
                  transition={{ delay: i * 0.1, type: 'spring', stiffness: 200 }}>{c}</motion.span>
              ))}
            </div>
          )}
          {handResult === 'LOST' && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="font-clash text-[56px] uppercase tracking-tighter" style={{ color: 'var(--color-text-dark)' }}>LOST</motion.div>
          )}
          {isFold && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="font-satoshi font-bold text-2xl" style={{ color: 'var(--color-text-muted)' }}>FOLDED</motion.div>
          )}
          {isDraw && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="font-clash text-3xl" style={{ color: 'rgba(255,255,255,0.5)' }}>DRAW</motion.div>
          )}
        </div>

        {/* Cards */}
        {!isFold && !isDraw && (
          <div className="flex flex-col md:flex-row gap-8 md:gap-16 w-full justify-center items-center mb-12 z-10">
            <motion.div className="flex flex-col items-center gap-4"
              initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.2 }}>
              <span className="font-mono text-xs tracking-widest uppercase" style={{ color: 'var(--color-text-secondary)' }}>Your hand</span>
              <div className="flex gap-2">
                {myCards.map((id, i) => <Card key={i} id={id} state={isWin ? 'winner' : 'faceUp'} />)}
              </div>
              {myEval && <div className="font-satoshi font-bold text-lg" style={{ color: 'var(--color-primary)' }}>{myEval.name}</div>}
            </motion.div>
            <motion.div className="flex flex-col items-center gap-4"
              initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.3 }}>
              <span className="font-mono text-xs tracking-widest uppercase" style={{ color: 'var(--color-text-secondary)' }}>Opponent</span>
              <div className="flex gap-2">
                {opponentCards.length > 0
                  ? opponentCards.map((id, i) => <Card key={i} id={id} state={!isWin ? 'winner' : 'faceUp'} />)
                  : [0,1,2].map(i => <Card key={i} state="faceDown" />)}
              </div>
              {opponentEval && <div className="font-satoshi font-bold text-lg" style={{ color: 'var(--color-text-secondary)' }}>{opponentEval.name}</div>}
            </motion.div>
          </div>
        )}

        <div className="flex flex-col items-center gap-6 z-10">
          <motion.div className="font-clash text-4xl" initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.4 }}
            style={{ color: isWin ? 'var(--color-primary)' : isDraw ? 'rgba(255,255,255,0.5)' : 'var(--color-danger)' }}>
            {isWin ? `+${pot - 20}` : isDraw ? '±0' : '-20'} chips
          </motion.div>
          <div className="font-mono text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Balance: {balance.toLocaleString()}
          </div>
          <div className="flex gap-3">
            <PlayCTA onClick={resetForNextHand} text="NEXT HAND" className="text-lg" />
            <button onClick={resetToIdle}
              className="font-mono text-xs px-6 py-2 rounded-full transition-colors hover:text-white"
              style={{ color: 'var(--color-text-dark)', border: '1px solid rgba(255,255,255,0.06)' }}>
              Leave Table
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Main PvP Table ──
export const PvPTableView = () => {
  const { pvpState, statusMsg, pot, balance, myCards, opponentAddress, opponentCards } = usePvPGameStore();
  const { pvpAct } = usePvPGame();

  const isProcessing = ['dealing', 'decrypting', 'waitingOpponent', 'showdown'].includes(pvpState);
  const canAct = pvpState === 'acting';

  return (
    <div className="flex flex-col items-center w-full max-w-[960px] mx-auto py-6 px-4 relative min-h-[calc(100vh-112px)]">
      {/* Badges */}
      <div className="flex flex-wrap gap-2 mb-6 self-start items-center">
        <div className="flex items-center gap-2 h-7 px-3 rounded-full font-mono text-[10px] tracking-widest uppercase"
          style={{ background: 'rgba(179,102,255,0.08)', border: '1px solid rgba(179,102,255,0.18)', color: 'var(--color-fhe)' }}>
          <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 2, repeat: Infinity }}
            className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-fhe)' }} />
          PVP · FHE
        </div>
        <div className="flex items-center gap-1.5 h-7 px-3 rounded-full font-mono text-[10px] tracking-widest uppercase"
          style={{ background: 'rgba(0,232,108,0.06)', border: '1px solid rgba(0,232,108,0.15)', color: 'var(--color-success)' }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-success)' }} />
          ON-CHAIN
        </div>
      </div>

      {/* Poker table */}
      <div className="w-full relative">
        <div className="absolute -inset-4 rounded-[44px] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(26,82,50,0.25) 0%, transparent 70%)', filter: 'blur(20px)' }} />

        <div className="relative w-full rounded-3xl overflow-hidden"
          style={{
            background: 'radial-gradient(ellipse 80% 70% at 50% 45%, #163D28 0%, #0E2A1C 45%, #091A12 100%)',
            border: '2.5px solid rgba(46,120,72,0.45)',
            boxShadow: '0 0 40px rgba(20,80,45,0.3), inset 0 2px 0 rgba(255,255,255,0.03), inset 0 -2px 0 rgba(0,0,0,0.3)',
            padding: 'clamp(24px, 5vw, 48px) clamp(16px, 4vw, 40px)',
          }}>
          <TablePattern />
          <div className="absolute inset-3 rounded-2xl pointer-events-none" style={{ border: '1px solid rgba(46,120,72,0.2)' }} />

          {/* Opponent section */}
          <div className="relative flex flex-col items-center gap-3 mb-6 md:mb-10">
            <div className="font-mono text-[11px] tracking-widest uppercase flex items-center gap-2"
              style={{ color: 'rgba(255,255,255,0.45)' }}>
              <span className="w-2 h-2 rounded-full" style={{ background: 'var(--color-danger)', boxShadow: '0 0 4px rgba(255,59,59,0.4)' }} />
              {truncAddr(opponentAddress ?? '')}
            </div>
            <div className="flex gap-3 md:gap-4">
              {opponentCards.length > 0
                ? opponentCards.map((id, i) => <Card key={i} id={id} state="faceUp" />)
                : [0, 1, 2].map(i => <Card key={i} state={pvpState === 'dealing' ? 'faceDown' : 'empty'} />)}
            </div>
          </div>

          {/* Center divider + Pot */}
          <div className="flex items-center gap-4 mb-6 md:mb-10 relative z-10">
            <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(255,224,61,0.15), transparent)' }} />
            <motion.div className="px-6 py-2.5 rounded-full font-clash text-xl md:text-2xl tracking-wide"
              style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,224,61,0.2)', color: 'var(--color-primary)', textShadow: '0 0 20px rgba(255,224,61,0.3)' }}
              animate={pot > 0 ? { scale: [1, 1.03, 1] } : {}} transition={{ duration: 0.3 }} key={pot}>
              POT: <NumberScramble value={pot} />
            </motion.div>
            <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(255,224,61,0.15), transparent)' }} />
          </div>

          {/* Player section */}
          <div className="relative flex flex-col items-center gap-3">
            <div className="flex gap-3 md:gap-4">
              {myCards.length > 0
                ? myCards.map((id, i) => (
                    <Card key={i} id={id} state={pvpState === 'decrypting' ? 'decrypting' : 'faceUp'} delay={pvpState === 'decrypting' ? i * 0.2 : 0} />
                  ))
                : [0, 1, 2].map(i => <Card key={i} state="empty" />)}
            </div>
            <div className="font-mono text-[11px] tracking-widest uppercase flex items-center gap-2"
              style={{ color: 'rgba(255,255,255,0.55)' }}>
              YOU
              <span className="text-[10px]" style={{ color: 'var(--color-primary)' }}>· {balance} chips</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 mt-8 relative z-10">
        <MagneticBtn onClick={() => pvpAct(true)} disabled={!canAct}
          className="h-12 px-10 rounded-full font-mono text-sm font-bold tracking-widest uppercase flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'var(--color-primary)', color: '#000', boxShadow: canAct ? '0 0 24px rgba(255,224,61,0.25)' : 'none' }}>
          ▶ PLAY <span className="text-xs opacity-70">(10)</span>
        </MagneticBtn>
        <MagneticBtn onClick={() => pvpAct(false)} disabled={!canAct}
          className="h-12 px-8 rounded-full font-mono text-sm font-bold tracking-widest uppercase flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'transparent', color: 'var(--color-danger)', border: '1.5px solid rgba(255,59,59,0.35)' }}>
          ✕ FOLD
        </MagneticBtn>
      </div>

      {/* Status */}
      <div className="mt-6 h-6">
        <TypewriterText text={statusMsg.text} color={statusMsg.color} />
      </div>

      {isProcessing && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 flex items-center gap-2">
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <motion.div key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-fhe)' }}
                animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }} />
            ))}
          </div>
          <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: 'var(--color-fhe)' }}>Processing</span>
        </motion.div>
      )}

      <AnimatePresence><PvPResultOverlay /></AnimatePresence>
    </div>
  );
};
