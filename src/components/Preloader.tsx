import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const N_STRIPS = 10;
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&*♠♥♦♣';

const NEON_GREEN = '#39FF14';
const NEON_PURPLE = '#B366FF';
const CARD_BG = 'rgba(60, 20, 120, 0.65)';

const SUITS = ['♣', '♦', '♥', '♠'] as const;
const SUIT_COLORS: Record<string, string> = {
  '♠': NEON_GREEN,
  '♥': NEON_GREEN,
  '♦': NEON_GREEN,
  '♣': NEON_GREEN,
};

// Final fanned positions (matching logo layout — left to right)
const CARD_FINALS = [
  { rotate: -18, x: -72, y: 14,  scale: 1    },
  { rotate: -6,  x: -24, y: -4,  scale: 1    },
  { rotate: 6,   x: 24,  y: -4,  scale: 1    },
  { rotate: 18,  x: 72,  y: 14,  scale: 1.05 }, // front card slightly larger
];

const ScrambleText = ({ text, active }: { text: string; active: boolean }) => {
  const [chars, setChars] = useState<string[]>(() => Array(text.length).fill('_'));

  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const FPR = 4;
    const total = text.length * FPR + 6;

    const id = setInterval(() => {
      setChars(
        text.split('').map((ch, i) => {
          if (ch === ' ') return ' ';
          const revealAt = i * FPR;
          if (frame >= revealAt + FPR) return ch;
          if (frame >= revealAt) return CHARS[Math.floor(Math.random() * CHARS.length)];
          return '_';
        }),
      );
      if (++frame > total) clearInterval(id);
    }, 36);

    return () => clearInterval(id);
  }, [active, text]);

  return (
    <>
      {chars.map((ch, i) => (
        <span
          key={i}
          style={{ color: ch === text[i] ? '#FFFFFF' : NEON_PURPLE }}
        >
          {ch}
        </span>
      ))}
    </>
  );
};

const SPARKLES = Array.from({ length: 16 }, (_, i) => ({
  x: 8 + Math.random() * 84,
  y: 8 + Math.random() * 84,
  size: 6 + Math.random() * 10,
  delay: Math.random() * 3,
  dur: 1.5 + Math.random() * 2,
  color: i % 3 === 0 ? NEON_GREEN : i % 3 === 1 ? NEON_PURPLE : 'rgba(255,255,255,0.5)',
}));

const AceCard = ({
  suit,
  index,
  revealed,
  allRevealed,
}: {
  suit: string;
  index: number;
  revealed: boolean;
  allRevealed: boolean;
}) => {
  const final = CARD_FINALS[index];
  const isLast = index === 3; // ace of spades — the featured card
  const suitColor = SUIT_COLORS[suit];

  return (
    <motion.div
      className="absolute"
      style={{
        width: 110,
        height: 154,
        left: '50%',
        top: '50%',
        marginLeft: -55,
        marginTop: -77,
        zIndex: index + 1,
        filter: revealed
          ? `drop-shadow(0 0 ${isLast ? 18 : 10}px ${NEON_GREEN}80) drop-shadow(0 0 ${isLast ? 30 : 16}px ${NEON_PURPLE}50)`
          : 'none',
      }}
      initial={{
        opacity: 0,
        scale: 0.4,
        rotate: 0,
        x: 0,
        y: 40,
      }}
      animate={
        revealed
          ? {
              opacity: 1,
              scale: final.scale,
              rotate: final.rotate,
              x: final.x,
              y: final.y,
            }
          : {
              opacity: 0,
              scale: 0.4,
              rotate: 0,
              x: 0,
              y: 40,
            }
      }
      transition={{
        duration: 0.55,
        ease: [0.22, 1.2, 0.36, 1],
        opacity: { duration: 0.3 },
      }}
    >
      {/* Card body */}
      <div
        className="w-full h-full rounded-lg relative overflow-hidden"
        style={{
          background: CARD_BG,
          border: `2px solid ${NEON_PURPLE}`,
          boxShadow: allRevealed
            ? `inset 0 0 20px ${NEON_PURPLE}30, 0 0 8px ${NEON_PURPLE}40`
            : `inset 0 0 15px ${NEON_PURPLE}20`,
        }}
      >
        {/* CRT scanlines on card */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.25) 2px, rgba(0,0,0,0.25) 3px)',
            mixBlendMode: 'multiply',
          }}
        />

        {/* Top-left: A + suit */}
        <div
          className="absolute top-2 left-2.5 flex flex-col items-center leading-none"
          style={{ color: suitColor }}
        >
          <span
            className="font-mono font-bold"
            style={{
              fontSize: 18,
              textShadow: `0 0 8px ${suitColor}`,
            }}
          >
            A
          </span>
          <span
            style={{
              fontSize: 14,
              marginTop: -2,
              textShadow: `0 0 6px ${suitColor}`,
            }}
          >
            {suit}
          </span>
        </div>

        {/* Bottom-right: A + suit (inverted) */}
        <div
          className="absolute bottom-2 right-2.5 flex flex-col items-center leading-none"
          style={{
            color: suitColor,
            transform: 'rotate(180deg)',
          }}
        >
          <span
            className="font-mono font-bold"
            style={{
              fontSize: 18,
              textShadow: `0 0 8px ${suitColor}`,
            }}
          >
            A
          </span>
          <span
            style={{
              fontSize: 14,
              marginTop: -2,
              textShadow: `0 0 6px ${suitColor}`,
            }}
          >
            {suit}
          </span>
        </div>

        {/* Center suit — large (especially on ace of spades) */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            color: suitColor,
            fontSize: isLast ? 52 : 38,
            textShadow: `0 0 16px ${suitColor}, 0 0 30px ${suitColor}60`,
          }}
        >
          <motion.span
            initial={{ scale: 0, opacity: 0 }}
            animate={revealed ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
            transition={{ delay: 0.25, duration: 0.4, ease: [0.22, 1.3, 0.36, 1] }}
          >
            {suit}
          </motion.span>
        </div>

        {/* Shimmer sweep on reveal */}
        {revealed && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            initial={{ x: '-100%' }}
            animate={{ x: '200%' }}
            transition={{ delay: 0.15, duration: 0.6, ease: 'easeInOut' }}
            style={{
              width: '50%',
              background: `linear-gradient(90deg, transparent, ${NEON_GREEN}15, ${NEON_GREEN}25, transparent)`,
            }}
          />
        )}
      </div>
    </motion.div>
  );
};

const isPageReload = (): boolean => {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    return nav?.type === 'reload';
  } catch {
    return false;
  }
};

export const Preloader = ({ forceShow = false }: { forceShow?: boolean }) => {
  const [visible, setVisible] = useState(
    () => forceShow ? true : !isPageReload(),
  );
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  const [revealedCards, setRevealedCards] = useState<boolean[]>([false, false, false, false]);
  const [allRevealed, setAllRevealed] = useState(false);
  const [glowPulse, setGlowPulse] = useState(false);
  const [scramble, setScramble] = useState(false);
  const [line1, setLine1] = useState(false);
  const [line2, setLine2] = useState(false);
  const [badge, setBadge] = useState(false);
  const [progress, setProgress] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!visible) return;

    // Progress bar animation
    const progId = setInterval(() => {
      setProgress(p => Math.min(p + Math.random() * 12, 100));
    }, 200);

    // Card reveal sequence — one by one
    const cardTimers = SUITS.map((_, i) =>
      setTimeout(() => {
        setRevealedCards(prev => {
          const next = [...prev];
          next[i] = true;
          return next;
        });
      }, 300 + i * 350), // staggered: 300, 650, 1000, 1350
    );

    const ts = [
      // All cards revealed — glow pulse
      setTimeout(() => {
        setAllRevealed(true);
        setGlowPulse(true);
      }, 1800),
      // Scramble text
      setTimeout(() => setScramble(true), 2100),
      // Status lines
      setTimeout(() => setLine1(true), 2600),
      setTimeout(() => setLine2(true), 2900),
      // Ready
      setTimeout(() => {
        setBadge(true);
        setProgress(100);
        clearInterval(progId);
      }, 3200),
      // Exit
      setTimeout(() => setPhase('out'), 3900),
    ];

    return () => {
      cardTimers.forEach(clearTimeout);
      ts.forEach(clearTimeout);
      clearInterval(progId);
    };
  }, [visible]);

  if (!visible) return null;

  const onLastStrip = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setVisible(false);
  };

  return (
    <div className="fixed inset-0 z-[200] overflow-hidden">
      {/* ── Venetian strips ── */}
      {Array.from({ length: N_STRIPS }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-full bg-black"
          style={{
            top: `${i * (100 / N_STRIPS)}%`,
            height: `${100 / N_STRIPS}%`,
            transformOrigin: i % 2 === 0 ? 'left' : 'right',
          }}
          initial={{ scaleX: 1 }}
          animate={{ scaleX: phase === 'out' ? 0 : 1 }}
          transition={{
            duration: 0.48,
            delay: phase === 'out' ? 0.12 + i * 0.04 : 0,
            ease: [0.76, 0, 0.24, 1],
          }}
          onAnimationComplete={
            i === N_STRIPS - 1 && phase === 'out' ? onLastStrip : undefined
          }
        />
      ))}

      {/* ── Content ── */}
      <motion.div
        className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
        style={{ zIndex: 1 }}
        animate={{ opacity: phase === 'out' ? 0 : 1 }}
        transition={{ duration: 0.25 }}
      >
        {/* ── CRT scanline overlay (full screen) ── */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.12) 2px, rgba(0,0,0,0.12) 3px)',
            zIndex: 20,
          }}
        />

        {/* ── Sparkle cross particles ── */}
        {SPARKLES.map((s, i) => (
          <div
            key={i}
            className="absolute pointer-events-none select-none"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              fontSize: s.size,
              color: s.color,
              opacity: 0,
              animation: `preloader-sparkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
              textShadow: `0 0 4px ${s.color}`,
            }}
          >
            +
          </div>
        ))}

        {/* ── Ambient glow behind cards ── */}
        <motion.div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: 280,
            height: 280,
            background: `radial-gradient(circle, ${NEON_GREEN}12 0%, ${NEON_PURPLE}08 40%, transparent 70%)`,
          }}
          animate={{
            scale: glowPulse ? [1, 1.3, 1.1] : 0.6,
            opacity: glowPulse ? [0.5, 1, 0.7] : 0.2,
          }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />

        {/* ── Outer neon border frame (like logo) ── */}
        <motion.div
          className="absolute rounded-2xl pointer-events-none"
          style={{
            width: 300,
            height: 280,
            border: `2px solid ${NEON_GREEN}`,
            boxShadow: `0 0 15px ${NEON_GREEN}40, inset 0 0 15px ${NEON_GREEN}10, 0 0 30px ${NEON_PURPLE}20`,
          }}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{
            opacity: allRevealed ? 0.6 : 0,
            scale: allRevealed ? 1 : 0.85,
          }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />

        {/* ── Inner neon border frame ── */}
        <motion.div
          className="absolute rounded-xl pointer-events-none"
          style={{
            width: 280,
            height: 260,
            border: `1.5px solid ${NEON_PURPLE}`,
            boxShadow: `0 0 10px ${NEON_PURPLE}30, inset 0 0 10px ${NEON_PURPLE}08`,
          }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{
            opacity: allRevealed ? 0.4 : 0,
            scale: allRevealed ? 1 : 0.9,
          }}
          transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
        />

        {/* ── Cards container ── */}
        <div className="relative" style={{ width: 260, height: 180, marginBottom: 28 }}>
          {SUITS.map((suit, i) => (
            <AceCard
              key={suit}
              suit={suit}
              index={i}
              revealed={revealedCards[i]}
              allRevealed={allRevealed}
            />
          ))}

          {/* Glow flash on all-reveal */}
          <AnimatePresence>
            {glowPulse && (
              <motion.div
                className="absolute inset-0 rounded-xl pointer-events-none"
                style={{
                  background: `radial-gradient(circle, ${NEON_GREEN}30 0%, transparent 70%)`,
                }}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: [0, 1, 0], scale: [0.8, 1.4, 1.6] }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
                exit={{ opacity: 0 }}
              />
            )}
          </AnimatePresence>
        </div>

        {/* ── Scramble title ── */}
        <motion.div
          className="font-mono text-[26px] md:text-[34px] tracking-[0.22em] uppercase select-none"
          style={{
            letterSpacing: '0.22em',
            textShadow: scramble ? `0 0 20px ${NEON_GREEN}50, 0 0 40px ${NEON_PURPLE}30` : 'none',
          }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: scramble ? 1 : 0, y: scramble ? 0 : 10 }}
          transition={{ duration: 0.3 }}
        >
          <ScrambleText text="COFHE POKER" active={scramble} />
        </motion.div>

        {/* ── Progress bar ── */}
        <div
          className="w-44 h-[2px] rounded-full overflow-hidden mt-5"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{
              background: `linear-gradient(90deg, ${NEON_GREEN}, ${NEON_PURPLE})`,
              boxShadow: `0 0 8px ${NEON_GREEN}60`,
            }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.2 }}
          />
        </div>

        {/* ── Status lines ── */}
        <div className="flex flex-col items-center gap-2 mt-3">
          <motion.p
            className="font-mono text-[11px] tracking-[0.18em] uppercase"
            style={{ color: 'var(--color-text-secondary)' }}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: line1 ? 1 : 0, x: line1 ? 0 : -8 }}
            transition={{ duration: 0.35 }}
          >
            SEPOLIA TESTNET · FHENIX COFHE
          </motion.p>
          <motion.p
            className="font-mono text-[11px] tracking-[0.18em] uppercase"
            style={{ color: NEON_GREEN }}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: line2 ? 1 : 0, x: line2 ? 0 : -8 }}
            transition={{ duration: 0.35 }}
          >
            ✓ FHE ENGINE INITIALIZED
          </motion.p>
        </div>

        {/* ── Ready badge ── */}
        <motion.div
          className="mt-3 px-5 py-1.5 rounded-full border font-mono text-[11px] tracking-[0.2em] uppercase"
          style={{
            background: `${NEON_GREEN}12`,
            borderColor: `${NEON_GREEN}50`,
            color: NEON_GREEN,
            boxShadow: badge ? `0 0 12px ${NEON_GREEN}30` : 'none',
          }}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: badge ? 1 : 0, scale: badge ? 1 : 0.85 }}
          transition={{ duration: 0.3, type: 'spring', stiffness: 300, damping: 22 }}
        >
          READY
        </motion.div>
      </motion.div>
    </div>
  );
};
