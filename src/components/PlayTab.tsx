import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore }   from '@/store/useGameStore';
import { useGameActions } from '@/hooks/useGameActions';
import { Pill, PlayCTA }  from '@/components/ui/Pill';
import { Card }           from '@/components/ui/Card';
import { TypewriterText, NumberScramble } from '@/components/ui/TextFX';
import { DecoShapes }     from '@/components/ui/DecoShapes';
import { PermitWarningBanner } from '@/components/ui/PermitIndicator';
import { useEffect, useState, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { getOptimalAction } from '@/lib/poker';
import { useAccount } from 'wagmi';
import { CONTRACT_ADDRESS } from '@/config/contract';
import { useMotionValue, useSpring } from 'framer-motion';
import { useGameGuards, PreFlightResult } from '@/hooks/useGameGuards';
import { FheProgressBar } from '@/components/ui/FheProgress';
import { CardSkeleton } from '@/components/ui/Skeleton';

const STEPS = [
  { key: 'deal',    label: 'DEAL',    states: ['dealing'] },
  { key: 'decrypt', label: 'DECRYPT', states: ['decrypting'] },
  { key: 'action',  label: 'ACTION',  states: ['playerTurn', 'folding', 'botThinking'] },
  { key: 'result',  label: 'RESULT',  states: ['showdown', 'result'] },
] as const;

const PhaseTracker = ({ playState }: { playState: string }) => {
  const activeIdx = STEPS.findIndex(s => s.states.includes(playState as never));

  return (
    <div className="flex items-center gap-1 w-full max-w-[420px]">
      {STEPS.map((step, i) => {
        const isDone   = i < activeIdx;
        const isActive = i === activeIdx;
        return (
          <div key={step.key} className="flex items-center flex-1 gap-1">
            <div className="flex flex-col items-center flex-1 gap-1">
              <div className="relative w-full h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                {isDone && (
                  <div className="absolute inset-0 rounded-full" style={{ background: 'var(--color-success)' }} />
                )}
                {isActive && (
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ background: 'var(--color-fhe)' }}
                    animate={{ width: ['20%', '80%', '40%', '90%', '60%'] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}
              </div>
              <span
                className="font-mono text-[8px] tracking-[0.15em] uppercase"
                style={{ color: isActive ? 'var(--color-fhe)' : isDone ? 'var(--color-success)' : 'rgba(255,255,255,0.2)' }}
              >
                {isDone ? `${step.label} ✓` : step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="w-2 h-px mb-3" style={{ background: isDone ? 'var(--color-success)' : 'rgba(255,255,255,0.08)' }} />
            )}
          </div>
        );
      })}
    </div>
  );
};

const FHE_MESSAGES: Record<string, string[]> = {
  dealing: [
    'FHE.randomEuint64() — generating entropy…',
    'Shuffling 52 encrypted cards…',
    'FHE.rem(seed, 52) — mapping to card…',
    'FHE.eq() — checking for duplicates…',
    'Card encrypted in ciphertext ✓',
    'FHE.allow(card, player) — setting ACL…',
  ],
  decrypting: [
    'Requesting threshold decryption…',
    'Gathering key shares from network…',
    'decryptForView() — reconstructing…',
    'Verifying card integrity…',
    'Card decrypted successfully ✓',
  ],
  botThinking: [
    'FHE.gt(botScore, threshold) — evaluating…',
    'Computing encrypted hand strength…',
    'Homomorphic comparison in progress…',
    'Awaiting CoFHE decrypt callback…',
    '_botDecide() — encrypted decision…',
  ],
  showdown: [
    'FHE.gt(playerScore, botScore) — comparing…',
    'Encrypted showdown computation…',
    'Threshold network decrypting result…',
    'allowPublic() — revealing winner…',
    'Verifying on-chain result…',
  ],
};

const FheActivityFeed = ({ playState }: { playState: string }) => {
  const [msgIdx, setMsgIdx] = useState(0);
  const messages = FHE_MESSAGES[playState] ?? [];

  useEffect(() => {
    if (messages.length === 0) return;
    setMsgIdx(0);
    const interval = setInterval(() => {
      setMsgIdx(prev => (prev + 1) % messages.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [playState, messages.length]);

  if (messages.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="mt-3 flex flex-col items-center gap-2 w-full max-w-[480px]"
    >
      {/* Activity log line */}
      <div
        className="w-full px-4 py-2.5 rounded-xl font-mono text-[10px] tracking-wider flex items-center gap-2.5 overflow-hidden"
        style={{
          background: 'rgba(179,102,255,0.04)',
          border: '1px solid rgba(179,102,255,0.1)',
        }}
      >
        <motion.div
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: 'var(--color-fhe)' }}
          animate={{ opacity: [1, 0.3, 1], scale: [1, 0.8, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
        <AnimatePresence mode="wait">
          <motion.span
            key={msgIdx}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            style={{ color: 'var(--color-fhe)' }}
          >
            {messages[msgIdx]}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Secondary info line */}
      <div className="flex items-center gap-3 font-mono text-[9px] tracking-wider" style={{ color: 'rgba(255,255,255,0.25)' }}>
        <span>CoFHE Threshold Network</span>
        <span>·</span>
        <motion.span
          animate={{ opacity: [0.3, 0.8, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          Encrypted Pipeline Active
        </motion.span>
      </div>
    </motion.div>
  );
};

const BotScanOverlay = ({ active }: { active: boolean }) => {
  if (!active) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 pointer-events-none z-10 rounded-xl overflow-hidden"
    >
      {/* Horizontal scan line */}
      <motion.div
        className="absolute left-0 right-0 h-[2px]"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(179,102,255,0.8), transparent)',
          boxShadow: '0 0 15px rgba(179,102,255,0.5)',
        }}
        animate={{ top: ['0%', '100%', '0%'] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
      />
      {/* Pulsing overlay */}
      <motion.div
        className="absolute inset-0"
        style={{ background: 'rgba(179,102,255,0.03)' }}
        animate={{ opacity: [0, 0.5, 0] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      />
    </motion.div>
  );
};

const HandNameScramble = ({ name }: { name: string }) => {
  const [display, setDisplay] = useState('');
  const chars = '♠♥♦♣';

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i < 10) {
        setDisplay(name.split('').map(c => c === ' ' ? ' ' : chars[Math.floor(Math.random() * chars.length)]).join(''));
      } else {
        setDisplay(`✦ ${name} ✦`);
        clearInterval(interval);
      }
      i++;
    }, 40);
    return () => clearInterval(interval);
  }, [name]);

  return <span>{display}</span>;
};

const XPBar = ({ handsPlayed }: { handsPlayed: number }) => {
  const level = Math.floor(handsPlayed / 5) + 1;
  const xpInLevel = (handsPlayed % 5) / 5;

  return (
    <div className="flex items-center gap-3">
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[10px] tracking-widest"
        style={{
          background: 'rgba(255,224,61,0.08)',
          border: '1px solid rgba(255,224,61,0.15)',
          color: 'var(--color-primary)',
        }}
      >
        LVL {level}
      </div>
      <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'var(--color-primary)' }}
          initial={{ width: 0 }}
          animate={{ width: `${xpInLevel * 100}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      <span className="font-mono text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
        {handsPlayed % 5}/5
      </span>
    </div>
  );
};

const StreakBadge = ({ wins }: { wins: number }) => {
  if (wins < 2) return null;

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="flex items-center gap-1.5 px-3 py-1 rounded-full font-mono text-[10px] tracking-widest"
      style={{
        background: 'rgba(255,140,66,0.1)',
        border: '1px solid rgba(255,140,66,0.2)',
        color: 'var(--color-deco-orange)',
        animation: 'streak-fire 2s ease-in-out infinite',
      }}
    >
      🔥 {wins} WIN STREAK
    </motion.div>
  );
};

const AnimatedBalance = ({ value }: { value: number }) => {
  const [prev, setPrev] = useState(value);
  const [delta, setDelta] = useState(0);
  const [showDelta, setShowDelta] = useState(false);

  useEffect(() => {
    if (value !== prev) {
      const d = value - prev;
      setDelta(d);
      setShowDelta(true);
      setPrev(value);
      const t = setTimeout(() => setShowDelta(false), 2000);
      return () => clearTimeout(t);
    }
  }, [value, prev]);

  return (
    <div className="relative inline-flex items-center">
      <motion.span
        key={value}
        initial={{ y: -4, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="font-mono"
      >
        {value.toLocaleString()}
      </motion.span>
      <AnimatePresence>
        {showDelta && (
          <motion.span
            initial={{ opacity: 1, y: 0, x: 8 }}
            animate={{ opacity: 0, y: -20, x: 8 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5 }}
            className="absolute left-full font-mono text-xs font-bold"
            style={{ color: delta > 0 ? 'var(--color-success)' : 'var(--color-danger)' }}
          >
            {delta > 0 ? '+' : ''}{delta}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
};

const MagneticBtn = ({
  children,
  onClick,
  disabled,
  className,
  style,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) => {
  const ref = useRef<HTMLButtonElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 300, damping: 20 });
  const springY = useSpring(y, { stiffness: 300, damping: 20 });

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (disabled || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    x.set((e.clientX - cx) * 0.12);
    y.set((e.clientY - cy) * 0.12);
  }, [disabled, x, y]);

  const handleMouseLeave = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  return (
    <motion.button
      ref={ref}
      onClick={onClick}
      disabled={disabled}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      whileTap={!disabled ? { scale: 0.95 } : {}}
      className={className}
      style={{ ...style, x: springX, y: springY }}
    >
      {children}
    </motion.button>
  );
};

const PayoutLine = ({ label, value, delay }: { label: string; value: number; delay: number }) => {
  if (value === 0) return null;
  const isPos = value > 0;
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className="flex justify-between w-full font-mono text-xs"
    >
      <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{ color: isPos ? 'var(--color-success)' : 'var(--color-danger)' }}>
        {isPos ? '+' : ''}{value}
      </span>
    </motion.div>
  );
};

const ResultOverlay = () => {
  const { playState, handResult, balance, playerEval, botEval, resetToLobby, playerCards, botCards, lastPayout } = useGameStore();
  const { startHand } = useGameActions();

  if (playState !== 'result' || !handResult) return null;

  const isWin  = handResult === 'WON';
  const isPush = handResult === 'PUSH';
  const isFold = handResult === 'FOLD';
  const p = lastPayout;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(10px)' }}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 22, delay: 0.15 }}
        className="flex flex-col items-center max-w-[600px] w-full relative"
      >
        {isWin && <DecoShapes count={14} className="z-0" />}

        {/* Headline */}
        <div className="z-10 mb-6">
          {isWin && (
            <div
              className="flex font-clash text-[80px] uppercase tracking-tighter"
              style={{ color: 'var(--color-primary)', animation: 'counter-glow 2s ease-in-out infinite' }}
            >
              {"WON".split('').map((char, i) => (
                <motion.span key={i} initial={{ y: 30, rotateX: -90 }} animate={{ y: [30, -8, 0], rotateX: [-90, 10, 0] }} transition={{ delay: i * 0.1, type: 'spring', stiffness: 200 }}>
                  {char}
                </motion.span>
              ))}
            </div>
          )}
          {handResult === 'LOST' && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}
              className="font-clash text-[56px] uppercase tracking-tighter" style={{ color: 'var(--color-text-dark)' }}>
              LOST
            </motion.div>
          )}
          {isPush && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="font-clash text-[48px] uppercase tracking-tighter" style={{ color: '#888' }}>
              PUSH
            </motion.div>
          )}
          {isFold && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="font-satoshi font-bold text-2xl" style={{ color: 'var(--color-text-muted)' }}>
              FOLDED
            </motion.div>
          )}
        </div>

        {/* Dealer qualification badge */}
        {p && !isFold && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="mb-4 px-4 py-1.5 rounded-full font-mono text-[10px] tracking-widest uppercase z-10"
            style={{
              background: p.qualified ? 'rgba(0,232,108,0.08)' : 'rgba(255,224,61,0.08)',
              border: p.qualified ? '1px solid rgba(0,232,108,0.2)' : '1px solid rgba(255,224,61,0.2)',
              color: p.qualified ? 'var(--color-success)' : 'var(--color-primary)',
            }}
          >
            Dealer {p.qualified ? 'qualifies' : 'does not qualify'}
          </motion.div>
        )}

        {/* Cards */}
        {!isFold && (
          <div className="flex flex-col md:flex-row gap-8 md:gap-16 w-full justify-center items-center mb-8 z-10">
            <motion.div
              className="flex flex-col items-center gap-4"
              initial={{ x: -30, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              <span className="font-mono text-xs tracking-widest uppercase" style={{ color: 'var(--color-text-secondary)' }}>Your hand</span>
              <div className="flex gap-2">
                {playerCards.map((id, i) => (
                  <Card key={i} id={id} state={isWin ? 'winner' : 'faceUp'} />
                ))}
              </div>
              <div className="font-satoshi font-bold text-lg h-6" style={{ color: 'var(--color-primary)' }}>
                {playerEval && <HandNameScramble name={playerEval.name} />}
              </div>
            </motion.div>

            <motion.div
              className="flex flex-col items-center gap-4"
              initial={{ x: 30, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
            >
              <span className="font-mono text-xs tracking-widest uppercase" style={{ color: 'var(--color-text-secondary)' }}>Dealer</span>
              <div className="flex gap-2">
                {botCards.length > 0
                  ? botCards.map((id, i) => <Card key={i} id={id} state={!isWin ? 'winner' : 'faceUp'} />)
                  : [0,1,2].map(i => <Card key={i} state="faceDown" />)
                }
              </div>
              {botEval && (
                <div className="font-satoshi font-bold text-lg h-6" style={{ color: 'var(--color-text-secondary)' }}>
                  {botEval.name}
                </div>
              )}
            </motion.div>
          </div>
        )}

        {/* Payout breakdown */}
        {p && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="w-full max-w-[280px] mb-6 z-10 flex flex-col gap-1.5 px-5 py-4 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <PayoutLine label="Ante" value={p.antePayout} delay={0.4} />
            <PayoutLine label="Play" value={p.playPayout} delay={0.45} />
            <PayoutLine label="Ante Bonus" value={p.anteBonus} delay={0.5} />
            <PayoutLine label="Pair Plus" value={p.pairPlus} delay={0.55} />
            <div className="h-px my-1" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="flex justify-between w-full font-mono text-sm font-bold"
            >
              <span style={{ color: 'var(--color-text-secondary)' }}>Net</span>
              <span style={{ color: p.totalDelta > 0 ? 'var(--color-primary)' : p.totalDelta < 0 ? 'var(--color-danger)' : '#888' }}>
                {p.totalDelta > 0 ? '+' : ''}{p.totalDelta} chips
              </span>
            </motion.div>
          </motion.div>
        )}

        {/* Stats */}
        <div className="flex flex-col items-center gap-4 z-10">
          <div className="font-mono text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Balance: {balance.toLocaleString()}
          </div>
          <PlayCTA onClick={startHand} text="DEAL NEXT" className="text-xl" />
          <button onClick={resetToLobby} className="font-mono text-xs transition-colors mt-2 hover:text-white" style={{ color: 'var(--color-text-dark)' }}>
            Leave
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

const TurnTimer = ({ seconds, active }: { seconds: number; active: boolean }) => {
  if (!active) return null;

  const urgent = seconds <= 10;
  const critical = seconds <= 5;
  const pct = (seconds / 60) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 mb-4"
    >
      <div className="w-32 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{
            background: critical ? 'var(--color-danger)' : urgent ? 'var(--color-deco-orange)' : 'var(--color-primary)',
            width: `${pct}%`,
          }}
          animate={critical ? { opacity: [1, 0.4, 1] } : {}}
          transition={critical ? { duration: 0.5, repeat: Infinity } : {}}
        />
      </div>
      <span
        className="font-mono text-sm font-bold tabular-nums"
        style={{ color: critical ? 'var(--color-danger)' : urgent ? 'var(--color-deco-orange)' : 'var(--color-text-muted)' }}
      >
        {seconds}s
      </span>
      {critical && (
        <motion.span
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 0.5, repeat: Infinity }}
          className="font-mono text-[10px] tracking-widest uppercase"
          style={{ color: 'var(--color-danger)' }}
        >
          AUTO-FOLD
        </motion.span>
      )}
    </motion.div>
  );
};

const PreFlightBanner = ({ result }: { result: PreFlightResult | null }) => {
  if (!result || (result.ok && result.warnings.length === 0)) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="w-full max-w-[460px] z-10 mb-4 space-y-2"
    >
      {result.errors.map((e, i) => (
        <div
          key={`e${i}`}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-mono text-[11px]"
          style={{ background: 'rgba(255,59,59,0.08)', border: '1px solid rgba(255,59,59,0.2)', color: 'var(--color-danger)' }}
        >
          <span className="shrink-0">✕</span> {e}
        </div>
      ))}
      {result.warnings.map((w, i) => (
        <div
          key={`w${i}`}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-mono text-[11px]"
          style={{ background: 'rgba(255,224,61,0.06)', border: '1px solid rgba(255,224,61,0.15)', color: 'var(--color-primary)' }}
        >
          <span className="shrink-0">!</span> {w}
        </div>
      ))}
    </motion.div>
  );
};

const TablePattern = () => (
  <svg className="absolute inset-0 w-full h-full rounded-3xl" style={{ opacity: 0.04 }} preserveAspectRatio="none">
    <defs>
      <pattern id="felt-diamonds" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M20 0 L40 20 L20 40 L0 20Z" stroke="rgba(255,255,255,0.8)" strokeWidth="0.5" fill="none" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#felt-diamonds)" />
  </svg>
);

const BeginnerHint = ({ playerCards }: { playerCards: number[] }) => {
  if (playerCards.length !== 3) return null;
  const { action, reason } = getOptimalAction(playerCards);
  const isPlay = action === 'PLAY';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2.5 px-5 py-2.5 rounded-full font-mono text-xs tracking-wider mb-3"
      style={{
        background: isPlay ? 'rgba(0,232,108,0.08)' : 'rgba(255,59,59,0.08)',
        border: isPlay ? '1px solid rgba(0,232,108,0.2)' : '1px solid rgba(255,59,59,0.2)',
        color: isPlay ? 'var(--color-success)' : 'var(--color-danger)',
      }}
    >
      <span className="text-sm">{isPlay ? '▶' : '✕'}</span>
      <span className="font-bold uppercase">{action}</span>
      <span className="opacity-60">—</span>
      <span className="opacity-80">{reason}</span>
    </motion.div>
  );
};

const DealerQualifyingAnim = ({ active }: { active: boolean }) => {
  const [dots, setDots] = useState('.');
  const [glow, setGlow] = useState(false);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '.' : prev + '.');
      setGlow(prev => !prev);
    }, 500);
    return () => clearInterval(id);
  }, [active]);

  if (!active) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="flex flex-col items-center gap-2 mt-2"
    >
      {/* Pulsing dot */}
      <motion.div
        className="w-2 h-2 rounded-full"
        style={{ background: '#fbbf24' }}
        animate={{ scale: [1, 1.5, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 1, repeat: Infinity }}
      />

      {/* Three filling bars */}
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-8 h-1.5 rounded-full overflow-hidden"
            style={{ background: 'rgba(251,191,36,0.15)' }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ background: '#fbbf24' }}
              animate={{ width: ['0%', '100%', '0%'] }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.3,
                ease: 'easeInOut',
              }}
            />
          </div>
        ))}
      </div>

      {/* Cycling dots text */}
      <span
        className="font-mono text-[10px] tracking-widest uppercase"
        style={{
          color: '#fbbf24',
          textShadow: glow ? '0 0 8px rgba(251,191,36,0.5)' : 'none',
          transition: 'text-shadow 0.3s',
        }}
      >
        QUALIFYING{dots}
      </span>
    </motion.div>
  );
};

const PP_OPTIONS = [0, 5, 10, 25, 50] as const;
const PP_LABELS: Record<number, string> = { 0: 'Skip', 5: '5', 10: '10', 25: '25', 50: '50' };

const PairPlusSelector = ({ value, onChange, balance }: { value: number; onChange: (v: number) => void; balance: number }) => {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: 'var(--color-text-muted)' }}>
        Pair Plus Side Bet
      </span>
      <div className="flex items-center gap-1.5">
        {PP_OPTIONS.map(opt => {
          const isActive = value === opt;
          const tooExpensive = opt > 0 && balance < 10 + opt; // ante(10) + pp
          return (
            <button
              key={opt}
              onClick={() => !tooExpensive && onChange(opt)}
              disabled={tooExpensive}
              className="h-9 px-4 rounded-full font-mono text-xs font-bold tracking-wider uppercase transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: isActive
                  ? opt === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(179,102,255,0.15)'
                  : 'rgba(255,255,255,0.03)',
                border: isActive
                  ? opt === 0 ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(179,102,255,0.35)'
                  : '1px solid rgba(255,255,255,0.06)',
                color: isActive
                  ? opt === 0 ? 'var(--color-text-secondary)' : 'var(--color-fhe)'
                  : 'var(--color-text-muted)',
              }}
            >
              {PP_LABELS[opt]}
            </button>
          );
        })}
      </div>
      {value > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 font-mono text-[10px] tracking-wider"
          style={{ color: 'var(--color-fhe)' }}
        >
          <span>Pair 1:1</span>
          <span className="opacity-30">·</span>
          <span>Flush 4:1</span>
          <span className="opacity-30">·</span>
          <span>Straight 6:1</span>
          <span className="opacity-30">·</span>
          <span>Trips 30:1</span>
          <span className="opacity-30">·</span>
          <span>SF 40:1</span>
        </motion.div>
      )}
    </div>
  );
};

export const PlayTab = () => {
  const { playState, statusMsg, pot, balance, playerCards, botCards, history, pairPlusBet, setPairPlusBet } = useGameStore();
  const { startHand, play, fold, retryDecrypt, isOnChain } = useGameActions();
  const { isConnected } = useAccount();
  const contractDeployed = CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000';
  const { preflight, leaveGame, setFoldFn, turnTimeLeft, turnTimerActive } = useGameGuards();

  // Beginner mode — persisted in localStorage
  const [beginnerMode, setBeginnerMode] = useState(() => {
    try { return localStorage.getItem('poker-beginner-mode') === '1'; } catch { return false; }
  });
  const toggleBeginner = useCallback(() => {
    setBeginnerMode(prev => {
      const next = !prev;
      try { localStorage.setItem('poker-beginner-mode', next ? '1' : '0'); } catch {}
      return next;
    });
  }, []);

  const isActive = playState !== 'lobby';
  const isProcessing = playState === 'dealing' || playState === 'decrypting' || playState === 'botThinking' || playState === 'showdown' || playState === 'folding';

  // Pre-flight state
  const [preFlightResult, setPreFlightResult] = useState<PreFlightResult | null>(null);

  // Register fold function for auto-fold guards
  useEffect(() => {
    setFoldFn(fold);
  }, [fold, setFoldFn]);

  // Win streak calculation
  const [winStreak, setWinStreak] = useState(0);
  useEffect(() => {
    let streak = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].result === 'WON') streak++;
      else break;
    }
    setWinStreak(streak);
  }, [history]);

  // Pre-flight before start
  const handleStart = useCallback(async () => {
    const result = await preflight();
    setPreFlightResult(result);
    if (result.ok) {
      setPreFlightResult(null);
      startHand();
    }
  }, [preflight, startHand]);

  if (!isActive) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-112px)] py-12 relative overflow-hidden">
        {/* Ambient glow */}
        <div
          className="absolute pointer-events-none"
          style={{
            width:      600,
            height:     600,
            top:        '30%',
            left:       '50%',
            transform:  'translate(-50%, -50%)',
            background: 'radial-gradient(circle, rgba(255,224,61,0.04) 0%, rgba(179,102,255,0.02) 40%, transparent 70%)',
            animation:  'ambient-breathe 4s ease-in-out infinite',
          }}
        />

        {/* Gamification row */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-3 mb-8 z-10"
        >
          <XPBar handsPlayed={history.length} />
          <StreakBadge wins={winStreak} />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-clash text-[60px] md:text-[88px] leading-[0.9] tracking-tighter uppercase text-center mb-4 relative z-10"
        >
          <span>DEAL</span>
          <br />
          <span style={{ color: 'var(--color-primary)', animation: 'counter-glow 3s ease-in-out infinite' }}>ME IN</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="font-mono text-xs tracking-widest uppercase mb-8 z-10"
          style={{ color: 'var(--color-text-muted)' }}
        >
          3-Card Poker · FHE Encrypted · vs Bot
        </motion.p>

        {/* Pair Plus side bet selector */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="z-10 mb-6"
        >
          <PairPlusSelector value={pairPlusBet} onChange={setPairPlusBet} balance={balance} />
        </motion.div>

        {/* Beginner mode toggle */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="z-10 mb-6"
        >
          <button
            onClick={toggleBeginner}
            className="flex items-center gap-2.5 px-4 py-2 rounded-full font-mono text-[11px] tracking-wider uppercase transition-all"
            style={{
              background: beginnerMode ? 'rgba(0,232,108,0.08)' : 'rgba(255,255,255,0.03)',
              border: beginnerMode ? '1px solid rgba(0,232,108,0.2)' : '1px solid rgba(255,255,255,0.06)',
              color: beginnerMode ? 'var(--color-success)' : 'var(--color-text-muted)',
            }}
          >
            <span
              className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] transition-all"
              style={{
                background: beginnerMode ? 'var(--color-success)' : 'rgba(255,255,255,0.08)',
                color: beginnerMode ? '#000' : 'transparent',
              }}
            >
              {beginnerMode ? '✓' : ''}
            </span>
            Beginner Hints (Q-6-4)
          </button>
        </motion.div>

        {/* Pre-flight errors / warnings */}
        <AnimatePresence>
          <PreFlightBanner result={preFlightResult} />
        </AnimatePresence>

        {/* Start Button */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.35, type: 'spring' }}
          className="z-10 mb-6"
        >
          <MagneticBtn
            onClick={handleStart}
            className="font-clash text-xl tracking-widest uppercase px-14 py-4 rounded-full text-black font-bold relative overflow-hidden group"
            style={{
              background: 'var(--color-primary)',
              animation:  'glow-yellow 2.5s ease-in-out infinite',
            }}
          >
            <span className="relative z-10">▶ START</span>
          </MagneticBtn>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45 }}
          className="flex items-center gap-2 font-mono text-xs tracking-wider z-10"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: 'var(--color-primary)', boxShadow: '0 0 6px rgba(255,224,61,0.5)' }}
          />
          <AnimatedBalance value={balance} /> chips · Ante: 10{pairPlusBet > 0 ? ` + PP: ${pairPlusBet}` : ''}
          {isOnChain && <span style={{ color: 'var(--color-fhe)' }}>· Sepolia</span>}
        </motion.div>

        {/* Contract missing notice */}
        {!contractDeployed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55 }}
            className="mt-8 px-5 py-3 rounded-xl font-mono text-xs text-center max-w-[400px] z-10"
            style={{
              background:  'rgba(255,59,59,0.06)',
              border:      '1px solid rgba(255,59,59,0.15)',
              color:       'var(--color-danger)',
            }}
          >
            Contract not deployed. Connect wallet and deploy first.<br />
            <code>npm run deploy:sepolia</code>
          </motion.div>
        )}

      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full max-w-[960px] mx-auto py-6 px-4 relative min-h-[calc(100vh-112px)]">
      {/* Permit warning — blocks above everything when no permit */}
      <PermitWarningBanner />

      {/* Phase tracker — visible during active game */}
      {(playState as string) !== 'lobby' && (
        <div className="mb-4 w-full flex justify-center flex-col items-center gap-2">
          <PhaseTracker playState={playState} />
          <FheProgressBar playState={playState} />
        </div>
      )}

      {/* FHE + On-chain badges + XP */}
      <div className="flex flex-wrap gap-2 mb-6 self-start items-center">
        <div
          className="flex items-center gap-2 h-7 px-3 rounded-full font-mono text-[10px] tracking-widest uppercase"
          style={{
            background:  'rgba(179,102,255,0.08)',
            border:      '1px solid rgba(179,102,255,0.18)',
            color:       'var(--color-fhe)',
            animation:   'neon-pulse 3s ease-in-out infinite',
          }}
        >
          <motion.div
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: 'var(--color-fhe)' }}
          />
          FHE ACTIVE
        </div>
        {isOnChain && (
          <div
            className="flex items-center gap-1.5 h-7 px-3 rounded-full font-mono text-[10px] tracking-widest uppercase"
            style={{
              background:  'rgba(0,232,108,0.06)',
              border:      '1px solid rgba(0,232,108,0.15)',
              color:       'var(--color-success)',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-success)' }} />
            ON-CHAIN
          </div>
        )}
        <div className="ml-auto">
          <XPBar handsPlayed={history.length} />
        </div>
      </div>

      {/* ── POKER TABLE ── */}
      <div className="w-full relative">
        {/* Ambient table glow */}
        <div
          className="absolute -inset-4 rounded-[44px] pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(26,82,50,0.25) 0%, transparent 70%)',
            filter:     'blur(20px)',
          }}
        />

        {/* Table container */}
        <div
          className="relative w-full rounded-3xl overflow-hidden"
          style={{
            background: 'radial-gradient(ellipse 80% 70% at 50% 45%, #163D28 0%, #0E2A1C 45%, #091A12 100%)',
            border:     '2.5px solid rgba(46,120,72,0.45)',
            boxShadow:  '0 0 40px rgba(20,80,45,0.3), inset 0 2px 0 rgba(255,255,255,0.03), inset 0 -2px 0 rgba(0,0,0,0.3)',
            padding:    'clamp(24px, 5vw, 48px) clamp(16px, 4vw, 40px)',
          }}
        >
          <TablePattern />

          {/* Rail border effect */}
          <div
            className="absolute inset-3 rounded-2xl pointer-events-none"
            style={{ border: '1px solid rgba(46,120,72,0.2)' }}
          />

          {/* ── Bot section ── */}
          <div className="relative flex flex-col items-center gap-3 mb-6 md:mb-10">
            <div
              className="font-mono text-[11px] tracking-widest uppercase flex items-center gap-2"
              style={{ color: (playState === 'botThinking' || playState === 'showdown') ? 'var(--color-fhe)' : 'rgba(255,255,255,0.45)' }}
            >
              <span>🤖</span>
              {playState === 'botThinking' ? (
                <motion.span
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  DEALER — QUALIFYING…
                </motion.span>
              ) : playState === 'showdown' ? (
                <motion.span
                  animate={{ opacity: [1, 0.5, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  DEALER — SHOWDOWN
                </motion.span>
              ) : 'DEALER — ???'}
            </div>

            <div className="relative flex gap-3 md:gap-4">
              <BotScanOverlay active={playState === 'botThinking' || playState === 'showdown'} />
              {playState === 'dealing' ? (
                /* Dealing: cards fan out from center deck */
                [0, 1, 2].map(i => (
                  <motion.div
                    key={i}
                    initial={{ x: 0, y: -40, opacity: 0, rotate: 0, scale: 0.8 }}
                    animate={{ x: 0, y: 0, opacity: 1, rotate: (i - 1) * 6, scale: 1 }}
                    transition={{ delay: 0.3 + i * 0.4, type: 'spring', stiffness: 200, damping: 18 }}
                  >
                    <Card state="faceDown" />
                  </motion.div>
                ))
              ) : botCards.length > 0 ? (
                botCards.map((_, i) => (
                  <motion.div
                    key={i}
                    animate={playState === 'botThinking' ? { y: [0, -3, 0] } : {}}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                  >
                    <Card state="faceDown" />
                  </motion.div>
                ))
              ) : (
                [0, 1, 2].map(i => <Card key={i} state="empty" />)
              )}
            </div>

            {/* Dealer qualifying animation */}
            <AnimatePresence>
              <DealerQualifyingAnim active={playState === 'botThinking'} />
            </AnimatePresence>
          </div>

          {/* ── Center divider + Pot ── */}
          <div className="flex items-center gap-4 mb-6 md:mb-10 relative z-10">
            <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(255,224,61,0.15), transparent)' }} />
            <motion.div
              className="px-6 py-2.5 rounded-full font-clash text-xl md:text-2xl tracking-wide relative overflow-hidden"
              style={{
                background:  'rgba(0,0,0,0.35)',
                border:      playState === 'showdown' ? '1px solid rgba(255,224,61,0.5)' : '1px solid rgba(255,224,61,0.2)',
                color:       'var(--color-primary)',
                textShadow:  playState === 'showdown' ? '0 0 30px rgba(255,224,61,0.6)' : '0 0 20px rgba(255,224,61,0.3)',
              }}
              animate={playState === 'showdown' ? { scale: [1, 1.05, 1] } : pot > 0 ? { scale: [1, 1.03, 1] } : {}}
              transition={playState === 'showdown' ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
              key={pot}
            >
              {playState === 'showdown' && (
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{ background: 'rgba(255,224,61,0.05)' }}
                  animate={{ opacity: [0, 0.3, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              )}
              <span className="relative z-10">POT: <NumberScramble value={pot} /></span>
            </motion.div>
            <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(255,224,61,0.15), transparent)' }} />
          </div>

          {/* ── Player section ── */}
          <div className="relative flex flex-col items-center gap-3">
            <motion.div
              className="flex gap-3 md:gap-4"
              animate={playState === 'folding' ? { opacity: 0.3, scale: 0.92, y: 10 } : { opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeInOut' }}
            >
              {playerCards.length > 0
                ? playerCards.map((id, i) => (
                    <motion.div
                      key={i}
                      initial={{ y: 40, opacity: 0, scale: 0.8 }}
                      animate={{ y: 0, opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.15, type: 'spring', stiffness: 200, damping: 18 }}
                    >
                      <Card
                        id={id}
                        state={playState === 'decrypting' ? 'decrypting' : 'faceUp'}
                        delay={playState === 'decrypting' ? i * 0.2 : 0}
                      />
                    </motion.div>
                  ))
                : playState === 'dealing' || playState === 'decrypting'
                  ? [0, 1, 2].map(i => (
                      <motion.div
                        key={i}
                        initial={{ y: 40, opacity: 0 }}
                        animate={{ y: 0, opacity: 0.4 }}
                        transition={{ delay: 0.5 + i * 0.3, duration: 0.5 }}
                      >
                        <Card state="faceDown" />
                      </motion.div>
                    ))
                  : [0, 1, 2].map(i => <Card key={i} state="empty" />)
              }
            </motion.div>

            <div
              className="font-mono text-[11px] tracking-widest uppercase flex items-center gap-2"
              style={{ color: 'rgba(255,255,255,0.55)' }}
            >
              YOU
              <span className="text-[10px]" style={{ color: 'var(--color-primary)' }}>
                · <AnimatedBalance value={balance} />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Turn timer ── */}
      <TurnTimer seconds={turnTimeLeft} active={turnTimerActive} />

      {/* ── Beginner hint ── */}
      {beginnerMode && playState === 'playerTurn' && (
        <BeginnerHint playerCards={playerCards} />
      )}

      {/* ── Action buttons ── */}
      {playState === 'decrypting' && statusMsg.color === '#FF8C42' ? (
        /* FHE failure — show RETRY / FOLD instead of normal buttons */
        <div className="flex gap-3 mt-4 relative z-10">
          <MagneticBtn
            onClick={retryDecrypt}
            className="h-12 px-10 rounded-full font-mono text-sm font-bold tracking-widest uppercase flex items-center gap-2 transition-all relative overflow-hidden"
            style={{
              background: 'var(--color-fhe)',
              color:      '#000',
              boxShadow:  '0 0 24px rgba(179,102,255,0.3)',
            }}
          >
            RETRY
          </MagneticBtn>

          <MagneticBtn
            onClick={fold}
            className="h-12 px-8 rounded-full font-mono text-sm font-bold tracking-widest uppercase flex items-center gap-2 transition-all"
            style={{
              background: 'transparent',
              color:      'var(--color-danger)',
              border:     '1.5px solid rgba(255,59,59,0.35)',
              boxShadow:  '0 0 20px rgba(255,59,59,0.1)',
            }}
          >
            FOLD (-10)
          </MagneticBtn>
        </div>
      ) : (
        <div className="flex gap-3 mt-4 relative z-10">
          <MagneticBtn
            onClick={play}
            disabled={playState !== 'playerTurn'}
            className="h-12 px-10 rounded-full font-mono text-sm font-bold tracking-widest uppercase flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed relative overflow-hidden"
            style={{
              background: 'var(--color-primary)',
              color:      '#000',
              boxShadow:  playState === 'playerTurn' ? '0 0 24px rgba(255,224,61,0.25)' : 'none',
            }}
          >
            ▶ PLAY
            <span className="text-xs opacity-70">(10)</span>
          </MagneticBtn>

          <MagneticBtn
            onClick={fold}
            disabled={playState !== 'playerTurn'}
            className="h-12 px-8 rounded-full font-mono text-sm font-bold tracking-widest uppercase flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'transparent',
              color:      'var(--color-danger)',
              border:     '1.5px solid rgba(255,59,59,0.35)',
              boxShadow:  playState === 'playerTurn' ? '0 0 20px rgba(255,59,59,0.1)' : 'none',
            }}
          >
            ✕ FOLD
          </MagneticBtn>
        </div>
      )}

      {/* ── Status text ── */}
      <div className="mt-6 h-6">
        <TypewriterText text={statusMsg.text} color={statusMsg.color} />
      </div>

      {/* FHE Activity Feed — shows rotating operations during processing */}
      <AnimatePresence>
        {isProcessing && <FheActivityFeed playState={playState} />}
      </AnimatePresence>

      {/* Leave table (= auto-fold if in game) */}
      {isActive && playState !== 'result' && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={leaveGame}
          className="mt-4 font-mono text-[10px] tracking-widest uppercase transition-colors hover:text-white"
          style={{ color: 'var(--color-text-dark)' }}
        >
          {playState === 'playerTurn' ? 'LEAVE (auto-fold)' : 'LEAVE TABLE'}
        </motion.button>
      )}

      {/* Streak indicator */}
      {winStreak >= 2 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4"
        >
          <StreakBadge wins={winStreak} />
        </motion.div>
      )}

      <AnimatePresence>
        <ResultOverlay />
      </AnimatePresence>
    </div>
  );
};
