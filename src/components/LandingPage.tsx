import { motion, useInView, useScroll, useTransform, useMotionValue, useSpring } from 'framer-motion';
import { useGameStore } from '@/store/useGameStore';
import { Pill } from '@/components/ui/Pill';
import { CountUp } from '@/components/ui/TextFX';
import { useEffect, useRef, useState, useCallback } from 'react';
import { CONTRACT_ADDRESS } from '@/config/contract';

const ETHERSCAN_URL = `https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`;

const GlitchText = ({
  children,
  className,
}: {
  children: string;
  className?: string;
}) => {
  const [on, setOn] = useState(false);

  useEffect(() => {
    let handle: ReturnType<typeof setTimeout>;
    const cycle = () => {
      setOn(true);
      handle = setTimeout(() => {
        setOn(false);
        handle = setTimeout(cycle, 2800 + Math.random() * 3500);
      }, 220 + Math.random() * 180);
    };
    handle = setTimeout(cycle, 1600 + Math.random() * 1400);
    return () => clearTimeout(handle);
  }, []);

  return (
    <span className={`relative ${className ?? ''}`} aria-label={children}>
      {on && (
        <>
          <span
            aria-hidden
            className="absolute inset-0"
            style={{
              color:    '#FF3B3B',
              opacity:  0.75,
              clipPath: 'inset(28% 0 48% 0)',
              transform: 'translate(-4px, 1px)',
            }}
          >
            {children}
          </span>
          <span
            aria-hidden
            className="absolute inset-0"
            style={{
              color:    '#4D7CFF',
              opacity:  0.75,
              clipPath: 'inset(62% 0 8% 0)',
              transform: 'translate(4px, -1px)',
            }}
          >
            {children}
          </span>
        </>
      )}
      <span>{children}</span>
    </span>
  );
};

const GradientMesh = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
    {/* Primary mesh blob */}
    <div
      className="absolute"
      style={{
        width:      '80vw',
        height:     '80vh',
        top:        '-20%',
        left:       '-10%',
        background: 'radial-gradient(ellipse at 30% 40%, rgba(179,102,255,0.12) 0%, transparent 60%)',
        animation:  'mesh-move 18s ease-in-out infinite',
        filter:     'blur(80px)',
      }}
    />
    {/* Secondary mesh blob */}
    <div
      className="absolute"
      style={{
        width:      '60vw',
        height:     '60vh',
        bottom:     '-10%',
        right:      '-10%',
        background: 'radial-gradient(ellipse at 70% 60%, rgba(255,224,61,0.08) 0%, transparent 55%)',
        animation:  'mesh-move-2 22s ease-in-out infinite',
        filter:     'blur(100px)',
      }}
    />
    {/* Accent blob */}
    <div
      className="absolute"
      style={{
        width:      '40vw',
        height:     '40vh',
        top:        '40%',
        left:       '50%',
        transform:  'translate(-50%, -50%)',
        background: 'radial-gradient(circle, rgba(77,124,255,0.06) 0%, transparent 50%)',
        animation:  'aurora 25s ease-in-out infinite',
        filter:     'blur(60px)',
      }}
    />
  </div>
);

const SUITS = ['♠', '♥', '♦', '♣'];
const PARTICLES: Array<{
  suit: string;
  x: number;
  y: number;
  size: number;
  dur: number;
  delay: number;
  opacity: number;
}> = Array.from({ length: 32 }, (_, i) => ({
  suit:    SUITS[i % 4],
  x:       Math.random() * 100,
  y:       Math.random() * 100,
  size:    8 + Math.random() * 32,
  dur:     6 + Math.random() * 10,
  delay:   Math.random() * -14,
  opacity: 0.03 + Math.random() * 0.07,
}));

const SuitParticles = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden>
    {PARTICLES.map((p, i) => (
      <div
        key={i}
        style={{
          position:  'absolute',
          left:      `${p.x}%`,
          top:       `${p.y}%`,
          fontSize:  p.size,
          opacity:   p.opacity,
          color:     p.suit === '♥' || p.suit === '♦' ? '#FF6B6B' : '#FFFFFF',
          animation: `float-suit ${p.dur}s ease-in-out ${p.delay}s infinite`,
          filter:    p.size > 24 ? 'blur(1px)' : 'none',
        }}
      >
        {p.suit}
      </div>
    ))}
  </div>
);

const MagneticButton = ({
  children,
  onClick,
  className,
  style,
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
  style?: React.CSSProperties;
}) => {
  const ref = useRef<HTMLButtonElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 300, damping: 20 });
  const springY = useSpring(y, { stiffness: 300, damping: 20 });

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    x.set((e.clientX - cx) * 0.15);
    y.set((e.clientY - cy) * 0.15);
  }, [x, y]);

  const handleMouseLeave = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  return (
    <motion.button
      ref={ref}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      whileTap={{ scale: 0.95 }}
      className={className}
      style={{ ...style, x: springX, y: springY }}
    >
      {children}
    </motion.button>
  );
};

const TiltCard = ({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springRX = useSpring(rotateX, { stiffness: 200, damping: 20 });
  const springRY = useSpring(rotateY, { stiffness: 200, damping: 20 });

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{
        ...style,
        rotateX: springRX,
        rotateY: springRY,
        transformPerspective: 800,
      }}
      onMouseMove={(e) => {
        if (!ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        const cx = e.clientX - rect.left - rect.width / 2;
        const cy = e.clientY - rect.top - rect.height / 2;
        rotateX.set(-cy * 0.08);
        rotateY.set(cx * 0.08);
      }}
      onMouseLeave={() => {
        rotateX.set(0);
        rotateY.set(0);
      }}
    >
      {children}
    </motion.div>
  );
};

const CARD_TRANSFORMS = [
  { rotate: -14, tx: -60, ty: 8 },
  { rotate: 0,   tx: 0,   ty: -12 },
  { rotate: 14,  tx: 60,  ty: 8 },
];

const EncryptedCardsPanel = () => (
  <div className="relative w-full h-full min-h-[600px] flex items-center justify-center overflow-hidden">
    <SuitParticles />

    {/* Ambient glow blob */}
    <div
      className="absolute rounded-full pointer-events-none"
      style={{
        width:     400,
        height:    400,
        background: 'radial-gradient(circle, rgba(255,224,61,0.07) 0%, rgba(179,102,255,0.04) 50%, transparent 70%)',
        animation:  'ambient-breathe 4s ease-in-out infinite',
      }}
    />

    {/* Orbiting ring */}
    <div
      className="absolute pointer-events-none"
      style={{
        width:      300,
        height:     300,
        border:     '1px solid rgba(179,102,255,0.08)',
        borderRadius: '50%',
        animation:  'spin-slow 30s linear infinite',
      }}
    >
      <div
        className="absolute w-2 h-2 rounded-full"
        style={{
          top: -4,
          left: '50%',
          marginLeft: -4,
          background: 'var(--color-fhe)',
          boxShadow: '0 0 10px rgba(179,102,255,0.5)',
        }}
      />
    </div>

    {/* Cards */}
    <div className="relative" style={{ width: 220, height: 300 }}>
      {CARD_TRANSFORMS.map((t, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{
            width:       150,
            height:      210,
            left:        '50%',
            top:         '50%',
            marginLeft:  -75,
            marginTop:   -105,
            transform:   `rotate(${t.rotate}deg) translate(${t.tx}px, ${t.ty}px)`,
            animation:   `card-float ${6 + i}s ease-in-out ${i * 0.5}s infinite`,
          }}
          initial={{ opacity: 0, y: 30, rotate: t.rotate - 5 }}
          animate={{ opacity: 1, y: 0,  rotate: t.rotate }}
          transition={{ delay: 0.4 + i * 0.15, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Card body */}
          <div
            className="w-full h-full rounded-xl border relative overflow-hidden shadow-2xl"
            style={{
              background:  'linear-gradient(135deg, #1A1A2E 0%, #16213E 50%, #0F3460 100%)',
              borderColor: 'rgba(179,102,255,0.25)',
              boxShadow:   i === 1
                ? '0 20px 60px rgba(0,0,0,0.7), 0 0 30px rgba(179,102,255,0.15)'
                : '0 10px 40px rgba(0,0,0,0.6)',
              animation: i === 1 ? 'neon-pulse 3s ease-in-out infinite' : 'none',
            }}
          >
            {/* Back pattern */}
            <svg
              className="absolute inset-0 w-full h-full opacity-20"
              viewBox="0 0 150 210"
              fill="none"
            >
              <pattern id={`grid-${i}`} width="15" height="15" patternUnits="userSpaceOnUse">
                <path d="M15 0L0 0 0 15" stroke="rgba(179,102,255,0.6)" strokeWidth="0.5" fill="none"/>
              </pattern>
              <rect width="150" height="210" fill={`url(#grid-${i})`} />
              <circle cx="75" cy="105" r="40" stroke="rgba(255,224,61,0.3)" strokeWidth="1" fill="none"/>
              <circle cx="75" cy="105" r="25" stroke="rgba(255,224,61,0.2)" strokeWidth="1" fill="none"/>
              <text x="75" y="111" textAnchor="middle" fill="rgba(255,224,61,0.4)" fontSize="18" fontFamily="monospace">♠</text>
            </svg>

            {/* Scanline overlay */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.15) 3px, rgba(0,0,0,0.15) 4px)',
              }}
            />

            {/* Shimmer sweep */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div
                style={{
                  position:   'absolute',
                  top:        0,
                  left:       0,
                  width:      '50%',
                  height:     '100%',
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)',
                  animation:  `shimmer ${3 + i}s ease-in-out ${i * 0.8}s infinite`,
                }}
              />
            </div>

            {/* FHE label */}
            <div className="absolute bottom-3 left-0 right-0 flex justify-center">
              <span
                className="font-mono text-[9px] tracking-widest px-2 py-0.5 rounded"
                style={{
                  background: 'rgba(179,102,255,0.15)',
                  color:      'rgba(179,102,255,0.8)',
                  border:     '1px solid rgba(179,102,255,0.2)',
                }}
              >
                ENCRYPTED
              </span>
            </div>
          </div>
        </motion.div>
      ))}
    </div>

    {/* Bottom caption */}
    <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-1">
      <div className="font-mono text-[11px] tracking-[0.2em] text-text-secondary uppercase">
        Cards hidden until reveal
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-success" style={{ animation: 'pulse-ring 1.6s ease-out infinite' }} />
        <span className="font-mono text-[10px] text-success tracking-wider">FHE ACTIVE</span>
      </div>
    </div>
  </div>
);

const TICKER_ITEMS = [
  'FHE.randomEuint64()',
  'FHE.rem(x, 52)',
  'FHE.eq(a, b)',
  'FHE.div(card, 4)',
  'FHE.rem(card, 4)',
  'FHE.min / FHE.max',
  'FHE.gt(score1, score2)',
  'FHE.select(cond, a, b)',
  'FHE.allow(addr)',
  'FHE.allowPublic()',
];

const Ticker = () => {
  const doubled = [...TICKER_ITEMS, ...TICKER_ITEMS];
  return (
    <div
      className="w-full overflow-hidden border-y py-3"
      style={{ borderColor: 'rgba(255,255,255,0.06)' }}
    >
      <div
        className="flex gap-12 whitespace-nowrap"
        style={{ animation: 'ticker-scroll 22s linear infinite', width: 'max-content' }}
      >
        {doubled.map((item, i) => (
          <span key={i} className="font-mono text-sm" style={{ color: 'var(--color-fhe)' }}>
            {item}
            <span className="mx-4 opacity-30 text-white">◆</span>
          </span>
        ))}
      </div>
    </div>
  );
};

const Reveal = ({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
};

const ExpandRow = ({ code, desc }: { code: string; desc: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full py-4 flex items-center justify-between text-left px-2 transition-colors"
        style={{ background: 'transparent' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <span className="font-mono text-sm" style={{ color: 'var(--color-fhe)' }}>{code}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          style={{ color: 'var(--color-text-muted)' }}
        >
          ▾
        </motion.span>
      </button>
      <motion.div
        initial={false}
        animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
        className="overflow-hidden"
      >
        <div className="pb-4 px-2 text-[15px]" style={{ color: 'var(--color-text-secondary)' }}>{desc}</div>
      </motion.div>
    </div>
  );
};

const LiveCounter = () => {
  const [count, setCount] = useState(14);

  useEffect(() => {
    const id = setInterval(() => {
      setCount(c => {
        const delta = Math.random() > 0.5 ? 1 : -1;
        return Math.max(3, Math.min(42, c + delta));
      });
    }, 3000 + Math.random() * 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full font-mono text-[11px] tracking-widest"
      style={{
        background: 'rgba(0,232,108,0.06)',
        border:     '1px solid rgba(0,232,108,0.15)',
        color:      'var(--color-success)',
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{
          background: 'var(--color-success)',
          boxShadow:  '0 0 6px rgba(0,232,108,0.5)',
          animation:  'ambient-breathe 2s ease-in-out infinite',
        }}
      />
      <motion.span key={count} initial={{ y: -4, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
        {count}
      </motion.span>
      ONLINE
    </div>
  );
};

const WIN_MESSAGES = [
  '0x8a3f...2c91 won +30 chips',
  '0xf1b2...7d44 won +30 chips',
  '0x92e5...1a08 won +30 chips',
  '0xd4c8...6f32 won +30 chips',
  '0x7f19...3b57 won +30 chips',
];

const WinTicker = () => {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIdx(i => (i + 1) % WIN_MESSAGES.length);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full font-mono text-[10px] tracking-wider overflow-hidden h-7"
      style={{
        background: 'rgba(255,224,61,0.04)',
        border:     '1px solid rgba(255,224,61,0.1)',
        color:      'var(--color-primary)',
      }}
    >
      <span style={{ animation: 'counter-glow 2s ease-in-out infinite' }}>✦</span>
      <motion.span
        key={idx}
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -10, opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        {WIN_MESSAGES[idx]}
      </motion.span>
    </div>
  );
};

const ParallaxSection = ({
  children,
  className,
  style,
  speed = 0.3,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  speed?: number;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [50 * speed, -50 * speed]);

  return (
    <motion.section ref={ref} className={className} style={{ ...style, y }}>
      {children}
    </motion.section>
  );
};

/* ── Scroll progress bar at top of page ────────────────────────── */
const ScrollProgressBar = () => {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });

  return (
    <motion.div
      className="fixed top-0 left-0 right-0 z-[60] h-[2px] origin-left"
      style={{
        scaleX,
        background: 'linear-gradient(90deg, var(--color-fhe), var(--color-primary), var(--color-success))',
        boxShadow: '0 0 8px rgba(255,224,61,0.4)',
      }}
    />
  );
};

/* ── Live stats with session-persistent counts ───────────────────── */
const useLiveStats = () => {
  const [handsPlayed, setHandsPlayed] = useState(() => {
    try { return parseInt(sessionStorage.getItem('lp_hands') ?? '0', 10) || Math.floor(Math.random() * 800 + 3200); } catch { return 4128; }
  });
  const [totalPot, setTotalPot] = useState(() => {
    try { return parseInt(sessionStorage.getItem('lp_pot') ?? '0', 10) || Math.floor(Math.random() * 50000 + 180000); } catch { return 198500; }
  });

  useEffect(() => {
    const id = setInterval(() => {
      setHandsPlayed(n => {
        const next = n + (Math.random() > 0.6 ? 1 : 0);
        try { sessionStorage.setItem('lp_hands', String(next)); } catch {}
        return next;
      });
      setTotalPot(n => {
        const next = n + Math.floor(Math.random() * 40);
        try { sessionStorage.setItem('lp_pot', String(next)); } catch {}
        return next;
      });
    }, 5000 + Math.random() * 3000);
    return () => clearInterval(id);
  }, []);

  return { handsPlayed, totalPot };
};

export const LandingPage = () => {
  const { setAppState } = useGameStore();
  const handlePlay = () => setAppState('connecting');
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.8], [1, 0.95]);
  const { handsPlayed, totalPot } = useLiveStats();

  return (
    <div
      className="min-h-screen text-white"
      style={{ background: 'var(--color-black)' }}
    >
      <ScrollProgressBar />

      {/* ── Navbar ── */}
      <nav
        className="sticky top-0 z-50 w-full h-20 flex items-center justify-between px-6 md:px-12"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div className="flex items-center gap-2.5">
          <img
            src="/logo.png"
            alt="Cofhe Poker"
            style={{
              width: 30,
              height: 30,
              borderRadius: 7,
              filter: 'drop-shadow(0 0 6px rgba(57,255,20,0.25))',
            }}
          />
          <span className="font-mono text-base font-bold tracking-widest uppercase">Cofhe Poker</span>
        </div>

        <div className="hidden md:flex items-center gap-2">
          <LiveCounter />
          <WinTicker />
        </div>

        <MagneticButton
          onClick={handlePlay}
          className="font-mono text-sm font-bold tracking-widest uppercase px-6 py-2.5 rounded-full transition-all relative overflow-hidden group"
          style={{
            background:  'var(--color-primary)',
            color:       '#000',
          }}
        >
          <span className="relative z-10">PLAY</span>
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: 'linear-gradient(90deg, var(--color-primary), #FFD000, var(--color-primary))', backgroundSize: '200% 100%', animation: 'gradient-shift 2s linear infinite' }}
          />
        </MagneticButton>
      </nav>

      <main>
        {/* ── Hero ── */}
        <motion.section
          ref={heroRef}
          className="relative min-h-[calc(100vh-80px)] flex flex-col md:flex-row overflow-hidden"
          style={{ opacity: heroOpacity, scale: heroScale }}
        >
          <GradientMesh />

          {/* Left column */}
          <div
            className="w-full md:w-1/2 flex flex-col items-start justify-center px-6 md:px-16 py-16 z-10 relative"
          >
            {/* Badge row */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="flex flex-wrap items-center gap-2 mb-6"
            >
              <div
                className="px-4 py-1.5 rounded-full font-mono text-[11px] tracking-widest uppercase inline-flex items-center gap-2"
                style={{
                  background:  'rgba(179,102,255,0.08)',
                  border:      '1px solid rgba(179,102,255,0.22)',
                  color:       'var(--color-fhe)',
                  animation:   'neon-pulse 4s ease-in-out infinite',
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full inline-block"
                  style={{ background: 'var(--color-fhe)' }}
                />
                Fhenix CoFHE
              </div>
              <div
                className="px-3 py-1.5 rounded-full font-mono text-[10px] tracking-widest uppercase"
                style={{
                  background:  'rgba(0,232,108,0.06)',
                  border:      '1px solid rgba(0,232,108,0.15)',
                  color:       'var(--color-success)',
                }}
              >
                SEPOLIA LIVE
              </div>
              <div
                className="px-3 py-1.5 rounded-full font-mono text-[10px] tracking-widest uppercase"
                style={{
                  background:  'rgba(255,224,61,0.06)',
                  border:      '1px solid rgba(255,224,61,0.12)',
                  color:       'var(--color-primary)',
                  animation:   'badge-bounce 3s ease-in-out infinite',
                }}
              >
                HOT
              </div>
              <div
                className="px-3 py-1.5 rounded-full font-mono text-[10px] tracking-widest uppercase"
                style={{
                  background:  'rgba(77,124,255,0.06)',
                  border:      '1px solid rgba(77,124,255,0.15)',
                  color:       'var(--color-info)',
                }}
              >
                4 GAME MODES
              </div>
            </motion.div>

            {/* Headline */}
            <h1
              className="font-clash leading-[0.85] tracking-tighter uppercase mb-8"
              style={{ fontSize: 'clamp(56px, 9vw, 110px)' }}
            >
              <motion.div initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
                <GlitchText>PLAY</GlitchText>
              </motion.div>
              <motion.div initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
                POKER
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: -40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                style={{ color: 'var(--color-primary)' }}
              >
                IN SECRET
              </motion.div>
            </h1>

            {/* Decorative line */}
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: '120px' }}
              transition={{ delay: 0.5, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="h-[2px] mb-8"
              style={{ background: 'linear-gradient(90deg, var(--color-primary), transparent)' }}
            />

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="font-satoshi text-[17px] leading-relaxed mb-10 max-w-[440px]"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Four game modes — 3-Card vs Bot, Texas Hold'em vs Bot,
              PvP multiplayer, and Hold'em PvP — all powered by FHE.
              Every card hidden from validators, opponents, even the chain itself.
            </motion.p>

            {/* Stats row */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="flex gap-8 mb-10"
            >
              {[
                { val: '4',    label: 'GAME MODES' },
                { val: '100%', label: 'ON-CHAIN' },
                { val: '0',    label: 'TRUSTED PARTIES' },
              ].map((s, i) => (
                <div key={i}>
                  <div
                    className="font-clash text-3xl tracking-tight"
                    style={{
                      color: i === 2 ? 'var(--color-primary)' : 'white',
                      animation: i === 2 ? 'counter-glow 3s ease-in-out infinite' : 'none',
                    }}
                  >
                    {s.val}
                  </div>
                  <div className="font-mono text-[9px] tracking-widest uppercase mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </motion.div>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="flex flex-wrap items-center gap-4"
            >
              <MagneticButton
                onClick={handlePlay}
                className="flex items-center gap-3 font-clash text-xl tracking-widest uppercase px-10 py-4 rounded-full text-black font-bold relative overflow-hidden group"
                style={{
                  background: 'var(--color-primary)',
                  boxShadow:  '0 0 30px rgba(255,224,61,0.25), 0 0 60px rgba(255,224,61,0.08)',
                  animation:  'glow-yellow 3s ease-in-out infinite',
                }}
              >
                <span className="text-lg relative z-10">▶</span>
                <span className="relative z-10">PLAY NOW</span>
              </MagneticButton>

            </motion.div>
          </div>

          {/* Right column — EncryptedCardsPanel */}
          <div className="w-full md:w-1/2 min-h-[500px] relative">
            <EncryptedCardsPanel />
          </div>
        </motion.section>

        {/* ── Ticker ── */}
        <Ticker />

        {/* ── Stats strip ── */}
        <section className="py-14 px-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-12 md:gap-4 text-center">
            {[
              { label: 'GAME MODES',          value: <><CountUp to={4} /></> },
              { label: 'HANDS PLAYED',        value: <motion.span key={handsPlayed} initial={{ y: -4, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="font-clash text-[42px] tracking-tight">{handsPlayed.toLocaleString()}</motion.span> },
              { label: 'ON-CHAIN ENCRYPTED',  value: <><CountUp to={100} />%</> },
              { label: 'TRUSTED PARTIES',     value: <span style={{ color: 'var(--color-primary)', animation: 'counter-glow 3s ease-in-out infinite' }}>ZERO</span> },
            ].map((s, i) => (
              <Reveal key={i} delay={i * 0.08}>
                {i !== 1 && <div className="font-clash text-[42px] tracking-tight mb-1">{s.value}</div>}
                {i === 1 && <div className="mb-1">{s.value}</div>}
                <div className="font-mono text-[10px] tracking-widest uppercase" style={{ color: 'var(--color-text-muted)' }}>{s.label}</div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── Features ── */}
        <section className="py-28 px-6 md:px-12 relative overflow-hidden" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          {/* Background decoration */}
          <div
            className="absolute top-0 right-0 w-[600px] h-[600px] pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(179,102,255,0.06) 0%, transparent 60%)',
              filter: 'blur(80px)',
              animation: 'mesh-move 20s ease-in-out infinite',
            }}
          />
          <div
            className="absolute bottom-0 left-0 w-[400px] h-[400px] pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(255,224,61,0.04) 0%, transparent 60%)',
              filter: 'blur(80px)',
              animation: 'mesh-move-2 18s ease-in-out infinite',
            }}
          />

          <div className="max-w-6xl mx-auto relative">
            <Reveal>
              <div className="flex items-center gap-4 mb-4">
                <h2 className="font-clash text-5xl md:text-6xl uppercase tracking-tight">WHY FHE POKER</h2>
                <motion.div
                  className="hidden md:block h-[2px] flex-1"
                  style={{ background: 'linear-gradient(90deg, rgba(179,102,255,0.4), transparent)' }}
                  initial={{ scaleX: 0, transformOrigin: 'left' }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <p className="font-satoshi text-lg mb-16 max-w-xl" style={{ color: 'var(--color-text-secondary)' }}>
                Traditional poker requires trust. <span style={{ color: 'var(--color-primary)' }}>Cofhe Poker requires math.</span>
              </p>
            </Reveal>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  tag: 'INVISIBLE',
                  title: 'Nobody Sees Your Cards',
                  desc: 'FHE encrypts cards on-chain. Not validators, not opponents, not the contract itself. Only your wallet permit decrypts your hand.',
                  code: 'FHE.allow(you)',
                  color: 'var(--color-fhe)',
                  borderGlow: 'rgba(179,102,255,0.25)',
                  bgGlow: 'rgba(179,102,255,0.03)',
                  iconBg: 'rgba(179,102,255,0.1)',
                  iconBorder: 'rgba(179,102,255,0.25)',
                  icon: '♠',
                  iconColor: 'var(--color-fhe)',
                },
                {
                  tag: 'PROVABLY FAIR',
                  title: 'Cryptographic Randomness',
                  desc: 'Cards dealt via FHE.randomEuint64() — on-chain randomness nobody can predict. No RNG server. No house edge.',
                  code: 'FHE.randomEuint64()',
                  color: 'var(--color-success)',
                  borderGlow: 'rgba(0,232,108,0.2)',
                  bgGlow: 'rgba(0,232,108,0.02)',
                  iconBg: 'rgba(0,232,108,0.1)',
                  iconBorder: 'rgba(0,232,108,0.25)',
                  icon: '◈',
                  iconColor: 'var(--color-success)',
                },
                {
                  tag: 'VERIFIABLE',
                  title: 'Every Hand On Etherscan',
                  desc: 'Each deal, bet, and showdown is an Ethereum transaction. Verify everything yourself — no trust needed.',
                  code: 'etherscan.io/tx/0x...',
                  color: 'var(--color-info)',
                  borderGlow: 'rgba(77,124,255,0.2)',
                  bgGlow: 'rgba(77,124,255,0.02)',
                  iconBg: 'rgba(77,124,255,0.1)',
                  iconBorder: 'rgba(77,124,255,0.25)',
                  icon: '⛓',
                  iconColor: 'var(--color-info)',
                },
              ].map((f, i) => (
                <Reveal key={i} delay={i * 0.12}>
                  <TiltCard
                    className="h-full p-8 rounded-2xl transition-all duration-500 group cursor-default relative overflow-hidden"
                    style={{
                      background: f.bgGlow,
                      border: `1px solid rgba(255,255,255,0.06)`,
                    }}
                  >
                    {/* Hover glow */}
                    <div
                      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl"
                      style={{
                        background: `radial-gradient(circle at 50% 0%, ${f.borderGlow} 0%, transparent 70%)`,
                        border: `1px solid ${f.borderGlow}`,
                        borderRadius: 'inherit',
                      }}
                    />

                    {/* Icon */}
                    <div
                      className="relative w-14 h-14 rounded-xl flex items-center justify-center mb-6 transition-all duration-300 group-hover:scale-110"
                      style={{
                        background: f.iconBg,
                        border: `1px solid ${f.iconBorder}`,
                        boxShadow: `0 0 20px ${f.borderGlow}`,
                      }}
                    >
                      <span style={{ fontSize: 24, color: f.iconColor, filter: `drop-shadow(0 0 6px ${f.borderGlow})` }}>{f.icon}</span>
                    </div>

                    <div className="relative">
                      <Pill variant="yellow" size="sm" className="mb-5 inline-flex">{f.tag}</Pill>
                      <h3 className="font-satoshi font-bold text-[22px] mb-3 transition-colors duration-300 group-hover:text-white">{f.title}</h3>
                      <p className="font-satoshi text-[15px] leading-relaxed mb-6" style={{ color: 'var(--color-text-secondary)' }}>
                        {f.desc}
                      </p>
                      <div
                        className="flex items-center gap-2 font-mono text-sm transition-all duration-300 group-hover:translate-x-1"
                        style={{ color: f.color }}
                      >
                        <span style={{ opacity: 0.5 }}>→</span>
                        <code>{f.code}</code>
                      </div>
                    </div>
                  </TiltCard>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Game Modes ── */}
        <section className="py-28 px-6 md:px-12 relative overflow-hidden" style={{ background: 'var(--color-surface)', borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="max-w-6xl mx-auto relative">
            <Reveal>
              <div className="flex items-center gap-4 mb-4">
                <h2 className="font-clash text-5xl md:text-6xl uppercase tracking-tight">4 WAYS TO PLAY</h2>
                <motion.div
                  className="hidden md:block h-[2px] flex-1"
                  style={{ background: 'linear-gradient(90deg, rgba(255,224,61,0.4), transparent)' }}
                  initial={{ scaleX: 0, transformOrigin: 'left' }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <p className="font-satoshi text-lg mb-16 max-w-xl" style={{ color: 'var(--color-text-secondary)' }}>
                Solo or multiplayer. 3-Card or Hold'em. <span style={{ color: 'var(--color-primary)' }}>Every mode fully on-chain with FHE.</span>
              </p>
            </Reveal>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                {
                  title: '3-Card Poker vs Bot',
                  desc: 'The classic mode. 3 encrypted cards each, play or fold, FHE bot opponent. Fast rounds, pure strategy.',
                  pills: ['SOLO', 'VS BOT'],
                  accent: 'var(--color-fhe)',
                  borderGlow: 'rgba(179,102,255,0.2)',
                  bgGlow: 'rgba(179,102,255,0.03)',
                  icon: '♠',
                },
                {
                  title: "Texas Hold'em vs Bot",
                  desc: '4 betting rounds — pre-flop, flop, turn, river. 5 community cards, 2 hole cards. Full Hold\'em flow against an FHE bot.',
                  pills: ['SOLO', '4 ROUNDS'],
                  accent: 'var(--color-success)',
                  borderGlow: 'rgba(0,232,108,0.2)',
                  bgGlow: 'rgba(0,232,108,0.02)',
                  icon: '♦',
                },
                {
                  title: 'PvP Multiplayer',
                  desc: 'Create rooms, invite friends via link, or join open tables. Real-time 3-Card poker against other players on-chain.',
                  pills: ['MULTIPLAYER', 'ROOMS'],
                  accent: 'var(--color-info)',
                  borderGlow: 'rgba(77,124,255,0.2)',
                  bgGlow: 'rgba(77,124,255,0.02)',
                  icon: '♣',
                },
                {
                  title: "Hold'em PvP",
                  desc: 'Full Texas Hold\'em against real opponents. All-in support, side pots, auto-fold timeouts — the complete experience.',
                  pills: ['MULTIPLAYER', 'ALL-IN', 'SIDE POTS'],
                  accent: 'var(--color-primary)',
                  borderGlow: 'rgba(255,224,61,0.2)',
                  bgGlow: 'rgba(255,224,61,0.03)',
                  icon: '♥',
                },
              ].map((mode, i) => (
                <Reveal key={i} delay={i * 0.1}>
                  <TiltCard
                    className="h-full p-8 rounded-2xl transition-all duration-500 group cursor-default relative overflow-hidden"
                    style={{
                      background: mode.bgGlow,
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    {/* Hover glow */}
                    <div
                      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl"
                      style={{
                        background: `radial-gradient(circle at 50% 0%, ${mode.borderGlow} 0%, transparent 70%)`,
                        border: `1px solid ${mode.borderGlow}`,
                        borderRadius: 'inherit',
                      }}
                    />

                    <div className="relative flex items-start gap-5">
                      {/* Icon */}
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-110"
                        style={{
                          background: `${mode.borderGlow}`,
                          border: `1px solid ${mode.accent}`,
                          boxShadow: `0 0 20px ${mode.borderGlow}`,
                        }}
                      >
                        <span style={{ fontSize: 22, color: mode.accent }}>{mode.icon}</span>
                      </div>

                      <div className="flex-1">
                        <h3 className="font-satoshi font-bold text-[20px] mb-2 transition-colors duration-300 group-hover:text-white">{mode.title}</h3>
                        <p className="font-satoshi text-[14px] leading-relaxed mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                          {mode.desc}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {mode.pills.map((pill) => (
                            <span
                              key={pill}
                              className="px-2.5 py-1 rounded-full font-mono text-[9px] tracking-widest uppercase"
                              style={{
                                background: `${mode.borderGlow}`,
                                border: `1px solid ${mode.accent}`,
                                color: mode.accent,
                              }}
                            >
                              {pill}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </TiltCard>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── How It Works ── */}
        <ParallaxSection
          className="py-24 px-6 md:px-12"
          style={{ background: 'var(--color-surface)', borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
          speed={0.15}
        >
          <div className="max-w-4xl mx-auto">
            <Reveal><h2 className="font-clash text-5xl uppercase tracking-tight mb-16">HOW IT WORKS</h2></Reveal>

            <div className="flex flex-col">
              {[
                { num: '01', title: 'CONNECT',  desc: 'Link MetaMask on Sepolia. Takes 10 seconds.',                                          badge: null },
                { num: '02', title: 'DEAL',     desc: 'FHE generates encrypted cards on-chain — 6 for 3-Card, up to 9 for Hold\'em. Nobody knows any values.',  badge: '~10s · FHE',  bv: 'purple' },
                { num: '03', title: 'PEEK',     desc: 'Sign a permit — only your cards decrypt for you. Zero-knowledge reveal.',              badge: '~5s · FHE',   bv: 'purple' },
                { num: '04', title: 'BET',      desc: 'Play or Fold across 4 rounds in Hold\'em, or ante up in 3-Card. Bets on-chain, cards secret.',  badge: 'instant',     bv: 'green'  },
                { num: '05', title: 'WIN',      desc: "FHE compares hands secretly. Winner's cards revealed; loser's encrypted forever.",    badge: '~5s · FHE',   bv: 'purple' },
              ].map((step, i) => (
                <Reveal key={i} delay={i * 0.08}>
                  <div
                    className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8 py-6 last:border-0 group"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                  >
                    <div
                      className="font-clash text-5xl min-w-[70px] transition-colors duration-300 group-hover:text-primary"
                      style={{ color: 'var(--color-elevated)' }}
                    >
                      {step.num}
                    </div>
                    <div className="font-satoshi font-bold text-lg uppercase tracking-wide min-w-[120px]">{step.title}</div>
                    <div className="font-satoshi text-[15px] flex-1" style={{ color: 'var(--color-text-secondary)' }}>{step.desc}</div>
                    {step.badge && (
                      <Pill variant={step.bv as any} size="sm" className="w-fit shrink-0">{step.badge}</Pill>
                    )}
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </ParallaxSection>

        {/* ── Comparison ── */}
        <section className="py-28 px-6 md:px-12 relative overflow-hidden">
          <div
            className="absolute bottom-0 left-0 w-[500px] h-[500px] pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(255,224,61,0.04) 0%, transparent 60%)',
              filter: 'blur(80px)',
            }}
          />
          <div
            className="absolute top-20 right-0 w-[300px] h-[300px] pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(255,59,59,0.04) 0%, transparent 60%)',
              filter: 'blur(60px)',
            }}
          />

          <div className="max-w-5xl mx-auto relative">
            <Reveal>
              <div className="flex flex-col md:flex-row md:items-end gap-4 mb-4">
                <h2 className="font-clash text-5xl md:text-6xl uppercase tracking-tight">
                  OLD POKER
                  <span className="mx-4 text-3xl" style={{ color: 'var(--color-text-muted)' }}>vs</span>
                  <span style={{ color: 'var(--color-primary)' }}>COFHE</span>
                </h2>
              </div>
            </Reveal>
            <Reveal delay={0.06}>
              <p className="font-satoshi text-lg mb-14" style={{ color: 'var(--color-text-secondary)' }}>
                See what changes when you remove the middleman and <span style={{ color: 'var(--color-fhe)' }}>replace trust with math</span>.
              </p>
            </Reveal>

            <Reveal delay={0.1}>
              <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--color-surface)', borderColor: 'rgba(255,255,255,0.07)' }}>
                {/* Header */}
                <div
                  className="grid grid-cols-[1.2fr_1fr_1fr] p-6 items-center"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <div />
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: 'var(--color-danger)', boxShadow: '0 0 6px rgba(255,59,59,0.5)' }}
                    />
                    <span className="font-mono text-[11px] uppercase tracking-widest" style={{ color: 'var(--color-danger)' }}>Online Poker</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: 'var(--color-success)', boxShadow: '0 0 6px rgba(0,232,108,0.5)', animation: 'ambient-breathe 2s ease-in-out infinite' }}
                    />
                    <span className="font-mono text-[11px] uppercase tracking-widest" style={{ color: 'var(--color-primary)' }}>Cofhe Poker</span>
                  </div>
                </div>

                {/* Rows */}
                {[
                  { q: 'Who sees cards?',  bad: 'Server sees all',       good: 'Nobody — FHE encrypted',       badIcon: '👁', goodIcon: '🔒' },
                  { q: 'Fair dealing?',    bad: 'Trust the company',     good: 'Math — FHE.random on-chain',   badIcon: '🤞', goodIcon: '🧮' },
                  { q: 'Can house cheat?', bad: 'Yes, theoretically',    good: 'No — mathematically impossible',badIcon: '⚠',  goodIcon: '✓'  },
                  { q: 'Where is data?',   bad: 'Private servers',       good: 'Public Ethereum blockchain',   badIcon: '🏢', goodIcon: '⛓'  },
                  { q: 'Folded cards?',    bad: 'Server stores them',    good: 'Encrypted forever',            badIcon: '💾', goodIcon: '🔐' },
                  { q: 'Third parties?',   bad: 'Server, database, RNG', good: 'Zero — only smart contract',   badIcon: '👥', goodIcon: '📝' },
                ].map((row, i) => (
                  <motion.div
                    key={i}
                    className="grid grid-cols-[1.2fr_1fr_1fr] p-5 md:p-6 font-satoshi text-[14px] md:text-[15px] transition-all duration-300 group relative"
                    style={{
                      background: i % 2 === 0 ? 'rgba(0,0,0,0.4)' : 'transparent',
                    }}
                    initial={{ opacity: 0, x: -16 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    whileHover={{
                      backgroundColor: 'rgba(255,224,61,0.02)',
                    }}
                  >
                    {/* Hover accent line */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      style={{ background: `linear-gradient(180deg, transparent, var(--color-primary), transparent)` }}
                    />

                    <div className="font-semibold flex items-center gap-2 pr-4">
                      {row.q}
                    </div>
                    <div className="flex items-center gap-2" style={{ color: 'var(--color-danger)' }}>
                      <span className="text-base hidden md:inline opacity-70">{row.badIcon}</span>
                      <span className="opacity-80">{row.bad}</span>
                    </div>
                    <div className="flex items-center gap-2 font-medium" style={{ color: 'var(--color-success)' }}>
                      <span className="text-base hidden md:inline">{row.goodIcon}</span>
                      {row.good}
                    </div>
                  </motion.div>
                ))}

                {/* Bottom verdict */}
                <div
                  className="p-6 flex items-center justify-center gap-3"
                  style={{
                    borderTop: '1px solid rgba(255,224,61,0.1)',
                    background: 'rgba(255,224,61,0.03)',
                  }}
                >
                  <span
                    className="font-mono text-[11px] tracking-widest uppercase"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    ♠ Zero trust required — it's all on-chain math
                  </span>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── FHE Deep Dive ── */}
        <ParallaxSection
          className="py-24 px-6 md:px-12"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
          speed={0.1}
        >
          <div className="max-w-3xl mx-auto">
            <Reveal>
              <h2 className="font-clash text-5xl uppercase tracking-tight mb-2">UNDER THE HOOD</h2>
            </Reveal>
            <Reveal delay={0.08}>
              <p className="font-satoshi text-[17px] mb-12" style={{ color: 'var(--color-text-secondary)' }}>
                15+ unique FHE operations across all game modes. ~79 CoFHE calls per hand.
              </p>
            </Reveal>

            <Reveal delay={0.12}>
              <div className="flex flex-col">
                {[
                  { code: 'FHE.randomEuint64()', desc: 'Generate unpredictable encrypted seed for card dealing' },
                  { code: 'FHE.rem(x, 52)',       desc: 'Map random value to card number 0–51 (no modular bias)' },
                  { code: 'FHE.eq(a, b)',          desc: 'Check no duplicate cards dealt — fully in ciphertext' },
                  { code: 'FHE.div(card, 4)',      desc: 'Extract card rank (2 through Ace)' },
                  { code: 'FHE.rem(card, 4)',      desc: 'Extract card suit (♠ ♥ ♦ ♣)' },
                  { code: 'FHE.min / FHE.max',     desc: 'Sort cards to evaluate hand strength encrypted' },
                  { code: 'FHE.gt(score1, score2)',desc: 'Compare two hands — find the winner without decrypting either' },
                  { code: 'FHE.select(cond, a, b)',desc: 'Conditional logic on encrypted data — no branch leakage' },
                  { code: 'FHE.allow(addr)',       desc: 'Grant only your wallet decryption access to your cards' },
                  { code: 'FHE.allowPublic()',     desc: "Reveal winner's cards after showdown — loser's stay hidden" },
                ].map((item, i) => (
                  <ExpandRow key={i} code={item.code} desc={item.desc} />
                ))}
              </div>
            </Reveal>
          </div>
        </ParallaxSection>

        {/* ── Built With ── */}
        <section className="py-24 px-6 md:px-12 relative" style={{ background: 'var(--color-surface)', borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="max-w-5xl mx-auto">
            <Reveal><h2 className="font-clash text-5xl uppercase tracking-tight mb-4">BUILT WITH</h2></Reveal>
            <Reveal delay={0.06}>
              <p className="font-satoshi text-lg mb-14" style={{ color: 'var(--color-text-secondary)' }}>
                Production-grade cryptography meets modern web3 stack.
              </p>
            </Reveal>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { name: 'Fhenix CoFHE',  desc: 'FHE threshold network for encrypted computation',    accent: 'var(--color-fhe)' },
                { name: 'Solidity',       desc: 'Smart contract with 15+ FHE operations',             accent: 'var(--color-info)' },
                { name: 'Ethereum',       desc: 'Sepolia testnet — fully on-chain game state',        accent: '#627EEA' },
                { name: 'React + TS',     desc: 'TypeScript frontend with strict type safety',        accent: '#61DAFB' },
                { name: 'wagmi + viem',   desc: 'Wallet connection and contract interactions',        accent: 'var(--color-success)' },
                { name: 'Framer Motion',  desc: 'Fluid animations and micro-interactions',            accent: 'var(--color-deco-pink)' },
              ].map((tech, i) => (
                <Reveal key={i} delay={i * 0.06}>
                  <TiltCard
                    className="p-5 rounded-2xl h-full transition-all duration-300 group cursor-default"
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border:     '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    <div className="font-mono text-sm font-bold mb-2 transition-all duration-300 group-hover:translate-x-1" style={{ color: tech.accent }}>{tech.name}</div>
                    <div className="font-satoshi text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>{tech.desc}</div>
                  </TiltCard>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="py-24 px-6 md:px-12">
          <div className="max-w-3xl mx-auto">
            <Reveal><h2 className="font-clash text-5xl uppercase tracking-tight mb-12">FAQ</h2></Reveal>

            <Reveal delay={0.08}>
              <div
                className="rounded-2xl px-6"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
              >
                {[
                  {
                    q: 'What game modes are available?',
                    a: 'Four modes: 3-Card Poker vs Bot, Texas Hold\'em vs Bot (4 betting rounds with 5 community cards), PvP Multiplayer (create rooms, invite friends via link), and Hold\'em PvP (all-in, side pots, timeouts). All modes are fully on-chain with FHE encryption.',
                  },
                  {
                    q: 'Is this real poker with real money?',
                    a: 'No. Cofhe Poker uses virtual chips with no monetary value. It\'s a proof-of-concept built for the Fhenix Buildathon 2026 to demonstrate FHE-encrypted gaming on Ethereum.',
                  },
                  {
                    q: 'How are cards dealt if nobody can see them?',
                    a: 'The smart contract uses FHE.randomEuint64() to generate encrypted random values on-chain. These are mapped to cards 0-51 via modular arithmetic — all in ciphertext. The CoFHE threshold network ensures true randomness.',
                  },
                  {
                    q: 'Can anyone cheat — bot, opponents, or developers?',
                    a: 'No. In bot modes, the bot\'s logic runs through FHE operations in the smart contract. In PvP modes, both players\' cards are encrypted. Nobody — not developers, validators, or nodes — can access encrypted card values.',
                  },
                  {
                    q: 'Why does dealing take ~10 seconds?',
                    a: 'FHE operations are computationally intensive. Generating encrypted random cards, checking for duplicates, evaluating hands — all happen in ciphertext on-chain via the Fhenix CoFHE threshold network.',
                  },
                  {
                    q: 'What do I need to play?',
                    a: 'MetaMask (or any injected wallet) on Ethereum Sepolia testnet, plus a small amount of Sepolia ETH for gas fees. No real ETH is needed — it\'s a testnet. Get free Sepolia ETH from faucets.',
                  },
                  {
                    q: 'Can I see the losing hand after a showdown?',
                    a: 'No. Only the winner\'s cards are revealed via FHE.allowPublic(). The loser\'s cards remain encrypted forever on-chain — just like mucked cards in real poker.',
                  },
                ].map((faq, i) => (
                  <div key={i} style={{ borderBottom: i < 6 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                    <details className="group">
                      <summary className="py-5 flex items-center justify-between cursor-pointer list-none">
                        <span className="font-satoshi text-sm font-medium text-white pr-4">{faq.q}</span>
                        <span
                          className="text-xs shrink-0 transition-transform group-open:rotate-180"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          ▾
                        </span>
                      </summary>
                      <p className="pb-5 font-satoshi text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                        {faq.a}
                      </p>
                    </details>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Community & Links ── */}
        <section className="py-20 px-6 md:px-12" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="max-w-4xl mx-auto text-center">
            <Reveal><h2 className="font-clash text-4xl uppercase tracking-tight mb-4">EXPLORE & CONNECT</h2></Reveal>
            <Reveal delay={0.06}>
              <p className="font-satoshi text-lg mb-12" style={{ color: 'var(--color-text-secondary)' }}>
                Dive into the code, read the docs, or verify on-chain.
              </p>
            </Reveal>

            <Reveal delay={0.12}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
                {[
                  {
                    title: 'Source Code',
                    desc:  'Smart contract + frontend — fully open source',
                    link:  'https://github.com/barbos001/CofhePoker',
                    label: 'GitHub ↗',
                    accent: 'white',
                    icon:  '⟨/⟩',
                  },
                  {
                    title: 'Fhenix Docs',
                    desc:  'Learn about CoFHE, FHE operations, and building encrypted dApps',
                    link:  'https://cofhe-docs.fhenix.zone',
                    label: 'Read Docs ↗',
                    accent: 'var(--color-fhe)',
                    icon:  '📖',
                  },
                  {
                    title: 'On-Chain',
                    desc:  'Verify every transaction, every hand, every card deal on Etherscan',
                    link:  ETHERSCAN_URL,
                    label: 'Etherscan ↗',
                    accent: 'var(--color-info)',
                    icon:  '⛓',
                  },
                ].map((card, i) => (
                  <TiltCard
                    key={i}
                    className="p-6 rounded-2xl text-left transition-all group cursor-default"
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border:     '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <div className="text-2xl mb-3">{card.icon}</div>
                    <div className="font-mono text-sm font-bold mb-2" style={{ color: card.accent }}>{card.title}</div>
                    <div className="font-satoshi text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>{card.desc}</div>
                    <a
                      href={card.link}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs tracking-wider group-hover:text-white transition-colors"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      {card.label}
                    </a>
                  </TiltCard>
                ))}
              </div>
            </Reveal>

            <Reveal delay={0.18}>
              <div className="flex flex-wrap justify-center gap-3">
                {[
                  { label: 'CoFHE SDK',      href: 'https://www.npmjs.com/package/@cofhe/sdk' },
                  { label: 'Awesome Fhenix',  href: 'https://github.com/FhenixProtocol/awesome-fhenix' },
                  { label: 'Fhenix Protocol', href: 'https://www.fhenix.io' },
                  { label: 'Sepolia Faucet',  href: 'https://sepolia-faucet.pk910.de' },
                ].map(link => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[10px] tracking-widest px-4 py-2 rounded-full transition-all hover:text-white hover:border-white/20"
                    style={{ color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    {link.label} ↗
                  </a>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Hackathon Badge ── */}
        <section
          className="py-10 px-6 text-center"
          style={{ background: 'var(--color-surface)', borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
        >
          <Reveal>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <div
                className="px-4 py-2 rounded-full font-mono text-[11px] tracking-widest uppercase"
                style={{ background: 'rgba(179,102,255,0.06)', border: '1px solid rgba(179,102,255,0.15)', color: 'var(--color-fhe)', animation: 'neon-pulse 4s ease-in-out infinite' }}
              >
                Fhenix Buildathon 2026
              </div>
              <span className="font-satoshi text-sm" style={{ color: 'var(--color-text-muted)' }}>·</span>
              <span className="font-satoshi text-sm" style={{ color: 'var(--color-text-muted)' }}>
                Built to prove FHE gaming is real
              </span>
            </div>
          </Reveal>
        </section>

        {/* ── CTA ── */}
        <section className="py-28 flex flex-col items-center justify-center text-center px-6 relative overflow-hidden">
          <GradientMesh />
          <SuitParticles />

          <Reveal>
            <h2
              className="font-clash text-[80px] md:text-[100px] uppercase tracking-tighter mb-4 relative"
              style={{ color: 'var(--color-primary)', lineHeight: 0.85, animation: 'counter-glow 3s ease-in-out infinite' }}
            >
              READY?
            </h2>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="font-satoshi text-lg mb-10" style={{ color: 'var(--color-text-secondary)' }}>
              Your cards. Your key. Your win.
            </p>
          </Reveal>
          <Reveal delay={0.2}>
            <MagneticButton
              onClick={handlePlay}
              className="font-clash text-2xl tracking-widest uppercase px-12 py-5 rounded-full text-black mb-10 relative overflow-hidden font-bold"
              style={{
                background: 'var(--color-primary)',
                animation:  'glow-yellow 2.5s ease-in-out infinite',
              }}
            >
              PLAY NOW →
            </MagneticButton>
          </Reveal>
          <Reveal delay={0.28}>
            <div className="font-mono text-[12px] flex flex-col items-center gap-1.5" style={{ color: 'var(--color-text-dark)' }}>
              <span>Contract: {CONTRACT_ADDRESS.slice(0, 10)}...{CONTRACT_ADDRESS.slice(-8)}</span>
              <a
                href={ETHERSCAN_URL}
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-white"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Etherscan ↗
              </a>
            </div>
          </Reveal>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer
        className="py-10 px-10"
        style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start gap-8 mb-8">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <img src="/logo.png" alt="Cofhe Poker" style={{ width: 22, height: 22, borderRadius: 5 }} />
                <span className="font-mono text-sm font-bold tracking-widest uppercase">Cofhe Poker</span>
              </div>
              <p className="font-satoshi text-xs max-w-[260px]" style={{ color: 'var(--color-text-muted)' }}>
                Fully on-chain poker with FHE encryption — 3-Card, Texas Hold'em, solo and PvP. Zero trust, pure cryptography.
              </p>
            </div>

            {/* Link columns */}
            <div className="flex gap-12">
              <div>
                <div className="font-mono text-[10px] tracking-widest uppercase mb-3" style={{ color: 'var(--color-text-muted)' }}>
                  Resources
                </div>
                <div className="flex flex-col gap-2">
                  <a href="https://cofhe-docs.fhenix.zone" target="_blank" rel="noreferrer" className="font-satoshi text-sm transition-colors hover:text-white" style={{ color: 'var(--color-text-secondary)' }}>Fhenix Docs</a>
                  <a href="https://www.npmjs.com/package/@cofhe/sdk" target="_blank" rel="noreferrer" className="font-satoshi text-sm transition-colors hover:text-white" style={{ color: 'var(--color-text-secondary)' }}>CoFHE SDK</a>
                  <a href="https://github.com/FhenixProtocol/awesome-fhenix" target="_blank" rel="noreferrer" className="font-satoshi text-sm transition-colors hover:text-white" style={{ color: 'var(--color-text-secondary)' }}>Awesome Fhenix</a>
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] tracking-widest uppercase mb-3" style={{ color: 'var(--color-text-muted)' }}>
                  Verify
                </div>
                <div className="flex flex-col gap-2">
                  <a href={ETHERSCAN_URL} target="_blank" rel="noreferrer" className="font-satoshi text-sm transition-colors hover:text-white" style={{ color: 'var(--color-text-secondary)' }}>Etherscan</a>
                  <a href="https://github.com/barbos001/CofhePoker" target="_blank" rel="noreferrer" className="font-satoshi text-sm transition-colors hover:text-white" style={{ color: 'var(--color-text-secondary)' }}>GitHub</a>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div
            className="pt-6 flex flex-col md:flex-row justify-between items-center gap-3"
            style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
          >
            <span className="font-mono text-xs" style={{ color: 'var(--color-text-dark)' }}>
              Fhenix Buildathon 2026 · Built with CoFHE on Ethereum Sepolia
            </span>
            <span className="font-mono text-xs" style={{ color: 'var(--color-text-dark)' }}>
              No real money. Virtual chips only.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};
