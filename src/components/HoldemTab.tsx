import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore }   from '@/store/useGameStore';
import { useHoldemActions } from '@/hooks/useHoldemActions';
import { Pill, PlayCTA }  from '@/components/ui/Pill';
import { Card }           from '@/components/ui/Card';
import { TypewriterText, NumberScramble } from '@/components/ui/TextFX';
import { DecoShapes }     from '@/components/ui/DecoShapes';
import { PermitWarningBanner } from '@/components/ui/PermitIndicator';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { HOLDEM_CONTRACT_ADDRESS } from '@/config/contractHoldem';
import { useMotionValue, useSpring } from 'framer-motion';
import { FheProgressBar } from '@/components/ui/FheProgress';
import { useGameGuards, PreFlightResult } from '@/hooks/useGameGuards';
import { getCardData } from '@/lib/poker';

const cp = (weight: number, size: number | string, spacing = '0.03em') => ({
  fontFamily: "'Chakra Petch', sans-serif",
  fontWeight: weight,
  fontSize: size,
  letterSpacing: spacing,
});

const STEPS = [
  { key: 'deal',    label: 'DEAL',     states: ['dealing', 'decrypting'] },
  { key: 'preflop', label: 'PRE-FLOP', states: ['playerTurn:preflop', 'botThinking:preflop'] },
  { key: 'flop',    label: 'FLOP',     states: ['playerTurn:flop', 'botThinking:flop'] },
  { key: 'turn',    label: 'TURN',     states: ['playerTurn:turn', 'botThinking:turn'] },
  { key: 'river',   label: 'RIVER',    states: ['playerTurn:river', 'botThinking:river'] },
  { key: 'result',  label: 'RESULT',   states: ['showdown', 'result', 'folding'] },
] as const;

const PhaseTracker = ({ playState, holdemRound }: { playState: string; holdemRound: string | null }) => {
  const combined = holdemRound ? `${playState}:${holdemRound}` : playState;
  const activeIdx = STEPS.findIndex(s =>
    s.states.some(st => st === combined || st === playState),
  );

  return (
    <div className="flex items-center gap-1 w-full max-w-[420px]">
      {STEPS.map((step, i) => {
        const isDone   = i < activeIdx;
        const isActive = i === activeIdx;
        return (
          <div key={step.key} className="flex items-center flex-1 gap-1">
            <div className="flex flex-col items-center flex-1 gap-1">
              <div className="relative w-full h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                {isDone && <div className="absolute inset-0 rounded-full" style={{ background: 'var(--color-success)' }} />}
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
    'FHE.randomEuint64() x 7 - generating entropy...',
    'Dealing 2 hole cards + 3 community + 2 bot...',
    'FHE.rem(seed, 52) - mapping to card...',
    'FHE.eq() - checking for duplicates...',
    'FHE.allow(card, player) - setting ACL...',
    'Card encrypted in ciphertext',
  ],
  decrypting: [
    'Requesting threshold decryption...',
    'Gathering key shares from network...',
    'decryptForView() - reconstructing...',
    'Verifying card integrity...',
    'Card decrypted successfully',
  ],
  botThinking: [
    'FHE.gt(botScore, threshold) - evaluating...',
    'Computing encrypted hand strength...',
    'Homomorphic comparison in progress...',
    'Awaiting CoFHE decrypt callback...',
    '_botDecide() - encrypted decision...',
  ],
  showdown: [
    '_evalHand5() - 5-card FHE evaluation...',
    'Pair count: FHE.eq() x 10 comparisons...',
    'FHE.gt(playerScore, botScore) - comparing...',
    'Threshold network decrypting result...',
    'Verifying on-chain result...',
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
      <div
        className="w-full px-4 py-2.5 rounded-xl font-mono text-[10px] tracking-wider flex items-center gap-2.5 overflow-hidden"
        style={{ background: 'rgba(179,102,255,0.04)', border: '1px solid rgba(179,102,255,0.1)' }}
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
      <div className="flex items-center gap-3 font-mono text-[9px] tracking-wider" style={{ color: 'rgba(255,255,255,0.25)' }}>
        <span>CoFHE Threshold Network</span>
        <span>·</span>
        <motion.span animate={{ opacity: [0.3, 0.8, 0.3] }} transition={{ duration: 2, repeat: Infinity }}>
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
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 pointer-events-none z-10 rounded-xl overflow-hidden"
    >
      <motion.div
        className="absolute left-0 right-0 h-[2px]"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(179,102,255,0.8), transparent)',
          boxShadow: '0 0 15px rgba(179,102,255,0.5)',
        }}
        animate={{ top: ['0%', '100%', '0%'] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="absolute inset-0"
        style={{ background: 'rgba(179,102,255,0.03)' }}
        animate={{ opacity: [0, 0.5, 0] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      />
    </motion.div>
  );
};

const AnimatedBalance = ({ value }: { value: number }) => {
  const [prev, setPrev] = useState(value);
  const [delta, setDelta] = useState(0);
  const [showDelta, setShowDelta] = useState(false);

  useEffect(() => {
    if (value !== prev) {
      setDelta(value - prev);
      setShowDelta(true);
      setPrev(value);
      const t = setTimeout(() => setShowDelta(false), 2000);
      return () => clearTimeout(t);
    }
  }, [value, prev]);

  return (
    <div className="relative inline-flex items-center">
      <motion.span key={value} initial={{ y: -4, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="font-mono">
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
  children, onClick, disabled, className, style,
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
    x.set((e.clientX - rect.left - rect.width / 2) * 0.12);
    y.set((e.clientY - rect.top - rect.height / 2) * 0.12);
  }, [disabled, x, y]);

  const handleMouseLeave = useCallback(() => { x.set(0); y.set(0); }, [x, y]);

  return (
    <motion.button
      ref={ref} onClick={onClick} disabled={disabled}
      onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}
      whileTap={!disabled ? { scale: 0.95 } : {}}
      className={className}
      style={{ ...style, x: springX, y: springY }}
    >
      {children}
    </motion.button>
  );
};

const XPBar = ({ handsPlayed }: { handsPlayed: number }) => {
  const level = Math.floor(handsPlayed / 5) + 1;
  const xpInLevel = (handsPlayed % 5) / 5;
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[10px] tracking-widest"
        style={{ background: 'rgba(255,224,61,0.08)', border: '1px solid rgba(255,224,61,0.15)', color: 'var(--color-primary)' }}
      >
        LVL {level}
      </div>
      <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <motion.div className="h-full rounded-full" style={{ background: 'var(--color-primary)' }}
          initial={{ width: 0 }} animate={{ width: `${xpInLevel * 100}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} />
      </div>
      <span className="font-mono text-[9px]" style={{ color: 'var(--color-text-muted)' }}>{handsPlayed % 5}/5</span>
    </div>
  );
};

const TablePattern = () => (
  <svg className="absolute inset-0 w-full h-full rounded-3xl" style={{ opacity: 0.04 }} preserveAspectRatio="none">
    <defs>
      <pattern id="holdem-felt" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M20 0 L40 20 L20 40 L0 20Z" stroke="rgba(255,255,255,0.8)" strokeWidth="0.5" fill="none" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#holdem-felt)" />
  </svg>
);

const TurnTimer = ({ seconds, active }: { seconds: number; active: boolean }) => {
  if (!active) return null;
  const urgent = seconds <= 10;
  const critical = seconds <= 5;
  const pct = (seconds / 60) * 100;

  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 mb-4">
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
        <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.5, repeat: Infinity }}
          className="font-mono text-[10px] tracking-widest uppercase" style={{ color: 'var(--color-danger)' }}>
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
      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
      className="w-full max-w-[460px] z-10 mb-4 space-y-2"
    >
      {result.errors.map((e, i) => (
        <div key={`e${i}`} className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-mono text-[11px]"
          style={{ background: 'rgba(255,59,59,0.08)', border: '1px solid rgba(255,59,59,0.2)', color: 'var(--color-danger)' }}>
          <span className="shrink-0">&#x2715;</span> {e}
        </div>
      ))}
      {result.warnings.map((w, i) => (
        <div key={`w${i}`} className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-mono text-[11px]"
          style={{ background: 'rgba(255,224,61,0.06)', border: '1px solid rgba(255,224,61,0.15)', color: 'var(--color-primary)' }}>
          <span className="shrink-0">!</span> {w}
        </div>
      ))}
    </motion.div>
  );
};

const HandNameScramble = ({ name }: { name: string }) => {
  const [display, setDisplay] = useState('');
  const chars = '\u2660\u2665\u2666\u2663';
  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i < 10) {
        setDisplay(name.split('').map(c => c === ' ' ? ' ' : chars[Math.floor(Math.random() * chars.length)]).join(''));
      } else {
        setDisplay(name);
        clearInterval(interval);
      }
      i++;
    }, 40);
    return () => clearInterval(interval);
  }, [name]);
  return <span>{display}</span>;
};

const HoldemResultOverlay = () => {
  const { playState, handResult, balance, playerCards, botCards, communityCards, resetToLobby, playerEval, botEval } = useGameStore();

  if (playState !== 'result' || !handResult) return null;

  const isWin  = handResult === 'WON';
  const isFold = handResult === 'FOLD';

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(10px)' }}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 22, delay: 0.15 }}
        className="flex flex-col items-center max-w-[700px] w-full relative"
      >
        {isWin && <DecoShapes count={14} className="z-0" />}

        {/* Headline */}
        <div className="z-10 mb-6">
          {isWin && (
            <div className="flex uppercase" style={{ ...cp(700, 80, '0.06em'), color: '#FFE03D', animation: 'counter-glow 2s ease-in-out infinite' }}>
              {"WON".split('').map((char, i) => (
                <motion.span key={i} initial={{ y: 30, rotateX: -90 }} animate={{ y: [30, -8, 0], rotateX: [-90, 10, 0] }}
                  transition={{ delay: i * 0.1, type: 'spring', stiffness: 200 }}>{char}</motion.span>
              ))}
            </div>
          )}
          {handResult === 'LOST' && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}
              className="uppercase" style={{ ...cp(700, 64, '0.06em'), color: 'rgba(255,255,255,0.25)' }}>LOST</motion.div>
          )}
          {isFold && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="uppercase" style={{ ...cp(600, 32, '0.08em'), color: 'rgba(255,255,255,0.45)' }}>FOLDED</motion.div>
          )}
        </div>

        {/* Cards display */}
        {!isFold && (
          <div className="flex flex-col gap-6 w-full items-center mb-8 z-10">
            {/* Player hand */}
            <motion.div className="flex flex-col items-center gap-3"
              initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.2, duration: 0.5 }}>
              <span className="uppercase" style={{ ...cp(500, 10, '0.14em'), color: 'rgba(255,255,255,0.4)' }}>Your hand</span>
              <div className="flex gap-2">
                {playerCards.map((id, i) => <Card key={i} id={id} state={isWin ? 'winner' : 'faceUp'} />)}
              </div>
              {playerEval && (
                <div style={{ ...cp(600, 15, '0.04em'), color: '#FFE03D' }}>
                  <HandNameScramble name={playerEval.name} />
                </div>
              )}
            </motion.div>

            {/* Community cards */}
            {communityCards.length > 0 && (
              <motion.div className="flex flex-col items-center gap-3"
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}>
                <span className="uppercase" style={{ ...cp(500, 10, '0.14em'), color: '#00BFFF' }}>Community</span>
                <div className="flex gap-2">
                  {communityCards.map((id, i) => <Card key={i} id={id} state="faceUp" />)}
                </div>
              </motion.div>
            )}

            {/* Bot hand */}
            <motion.div className="flex flex-col items-center gap-3"
              initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.4, duration: 0.5 }}>
              <span className="uppercase" style={{ ...cp(500, 10, '0.14em'), color: 'rgba(255,255,255,0.4)' }}>Bot</span>
              <div className="flex gap-2">
                {botCards.length > 0
                  ? botCards.map((id, i) => <Card key={i} id={id} state={!isWin ? 'winner' : 'faceUp'} />)
                  : [0, 1].map(i => <Card key={i} state="faceDown" />)
                }
              </div>
              {botEval && (
                <div style={{ ...cp(500, 14, '0.04em'), color: 'rgba(255,255,255,0.5)' }}>
                  {botEval.name}
                </div>
              )}
            </motion.div>
          </div>
        )}

        {/* Stats + buttons */}
        <div className="flex flex-col items-center gap-4 z-10">
          <div style={{ ...cp(400, 13), color: 'rgba(255,255,255,0.45)' }}>
            Balance: <span style={{ color: 'white', fontWeight: 600 }}>{balance.toLocaleString()}</span>
          </div>
          <button
            onClick={resetToLobby}
            className="uppercase transition-all"
            style={{
              ...cp(700, 13, '0.14em'),
              height: 48, paddingLeft: 48, paddingRight: 48,
              borderRadius: 10,
              background: '#00BFFF',
              color: '#000',
              boxShadow: '0 0 28px rgba(0,191,255,0.35)',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 40px rgba(0,191,255,0.55)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 28px rgba(0,191,255,0.35)'; }}
          >
            DEAL NEXT HAND
          </button>
          <button
            onClick={resetToLobby}
            className="uppercase transition-colors"
            style={{ ...cp(400, 11, '0.1em'), color: 'rgba(255,255,255,0.25)', marginTop: 4 }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.6)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.25)'; }}
          >
            Leave Table
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export const HoldemTab = () => {
  const { playState, statusMsg, pot, balance, playerCards, botCards, communityCards, history, holdemRound, playerEval } = useGameStore();
  const { startHand, actPreflop, actFlop, actTurn, actRiver, callBot, fold, confirmNext, isOnChain } = useHoldemActions();
  const { isConnected } = useAccount();
  const contractDeployed = HOLDEM_CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000';
  const { preflight, leaveGame, setFoldFn, turnTimeLeft, turnTimerActive } = useGameGuards();

  const isActive = playState !== 'lobby';
  const isProcessing = ['dealing', 'decrypting', 'botThinking', 'folding'].includes(playState);

  // Detect waitingForCall from status message (set by hook when bot bets)
  const waitingForCall = statusMsg.text.includes('CALL or FOLD');

  const [preFlightResult, setPreFlightResult] = useState<PreFlightResult | null>(null);

  // Register fold for auto-fold guards
  useEffect(() => { setFoldFn(fold); }, [fold, setFoldFn]);

  const handleStart = useCallback(async () => {
    const result = await preflight();
    setPreFlightResult(result);
    if (result.ok) {
      setPreFlightResult(null);
      startHand();
    }
  }, [preflight, startHand]);

  // Check action
  const handleCheck = useCallback(() => {
    switch (holdemRound) {
      case 'preflop': actPreflop('check'); break;
      case 'flop':    actFlop('check'); break;
      case 'turn':    actTurn('check'); break;
      case 'river':   actRiver('check'); break;
    }
  }, [holdemRound, actPreflop, actFlop, actTurn, actRiver]);

  // Bet action
  const handleBet = useCallback(() => {
    switch (holdemRound) {
      case 'preflop': actPreflop('bet'); break;
      case 'flop':    actFlop('bet'); break;
      case 'turn':    actTurn('bet'); break;
      case 'river':   actRiver('bet'); break;
    }
  }, [holdemRound, actPreflop, actFlop, actTurn, actRiver]);

  // Raise action (2x bet)
  const handleRaise = useCallback(() => {
    switch (holdemRound) {
      case 'preflop': actPreflop('raise'); break;
      case 'flop':    actFlop('raise'); break;
      case 'turn':    actTurn('raise'); break;
      case 'river':   actRiver('raise'); break;
    }
  }, [holdemRound, actPreflop, actFlop, actTurn, actRiver]);

  if (!isActive) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-[calc(100vh-112px)] py-12 relative overflow-hidden"
        style={{ background: '#0A0D12' }}
      >
        {/* Ambient glow */}
        <div
          className="absolute pointer-events-none"
          style={{
            width: 600, height: 600, top: '30%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'radial-gradient(circle, rgba(0,191,255,0.05) 0%, rgba(179,102,255,0.03) 40%, transparent 70%)',
            animation: 'ambient-breathe 4s ease-in-out infinite',
          }}
        />

        {/* XP */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-3 mb-8 z-10">
          <XPBar handsPlayed={history.length} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
          className="text-center mb-3 relative z-10"
        >
          <h1 className="uppercase leading-none mb-1" style={{ ...cp(700, 'clamp(48px,8vw,80px)', '0.06em'), color: 'white' }}>
            TEXAS
          </h1>
          <h1
            className="uppercase leading-none"
            style={{ ...cp(700, 'clamp(48px,8vw,80px)', '0.06em'), color: '#00BFFF', textShadow: '0 0 40px rgba(0,191,255,0.35)', animation: 'counter-glow 3s ease-in-out infinite' }}
          >
            HOLD'EM
          </h1>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
          className="uppercase mb-8 z-10"
          style={{ ...cp(400, 11, '0.18em'), color: 'rgba(255,255,255,0.35)' }}
        >
          2 Hole + 5 Community · 4 Rounds · FHE Encrypted
        </motion.p>

        {/* Pre-flight */}
        <AnimatePresence><PreFlightBanner result={preFlightResult} /></AnimatePresence>

        {/* Start */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.35, type: 'spring' }} className="z-10 mb-6"
        >
          <MagneticBtn
            onClick={handleStart}
            className="uppercase relative overflow-hidden"
            style={{
              ...cp(700, 14, '0.14em'),
              height: 52, paddingLeft: 56, paddingRight: 56,
              borderRadius: 12,
              background: '#00BFFF',
              color: '#000',
              boxShadow: '0 0 32px rgba(0,191,255,0.4)',
            }}
          >
            <span className="relative z-10">DEAL CARDS</span>
          </MagneticBtn>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}
          className="flex items-center gap-2 z-10" style={{ ...cp(400, 12, '0.06em'), color: 'rgba(255,255,255,0.4)' }}
        >
          <span className="w-2 h-2 rounded-full" style={{ background: '#00BFFF', boxShadow: '0 0 6px rgba(0,191,255,0.5)' }} />
          <AnimatedBalance value={balance} /> chips · SB: 5 / BB: 10
          {isOnChain && <span style={{ color: 'var(--color-fhe)' }}>· Sepolia</span>}
        </motion.div>

        {/* Contract not deployed */}
        {!contractDeployed && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }}
            className="mt-8 px-5 py-3 rounded-xl font-mono text-xs text-center max-w-[400px] z-10"
            style={{ background: 'rgba(255,59,59,0.06)', border: '1px solid rgba(255,59,59,0.15)', color: 'var(--color-danger)' }}
          >
            Contract not deployed. Connect wallet and deploy first.<br />
            <code>npx hardhat run scripts/deployHoldem.cts --network eth-sepolia</code>
          </motion.div>
        )}

      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full max-w-[960px] mx-auto py-6 px-4 relative min-h-[calc(100vh-112px)]">
      <PermitWarningBanner />

      {/* Phase tracker */}
      <div className="mb-4 w-full flex justify-center flex-col items-center gap-2">
        <PhaseTracker playState={playState} holdemRound={holdemRound} />
        <FheProgressBar playState={playState} />
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-2 mb-6 self-start items-center">
        <div
          className="flex items-center gap-2 h-7 px-3 rounded-full font-mono text-[10px] tracking-widest uppercase"
          style={{ background: 'rgba(179,102,255,0.08)', border: '1px solid rgba(179,102,255,0.18)', color: 'var(--color-fhe)', animation: 'neon-pulse 3s ease-in-out infinite' }}
        >
          <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 2, repeat: Infinity }}
            className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-fhe)' }} />
          FHE ACTIVE
        </div>
        <div
          className="flex items-center gap-1.5 h-7 px-3 rounded-full font-mono text-[10px] tracking-widest uppercase"
          style={{ background: 'rgba(0,191,255,0.06)', border: '1px solid rgba(0,191,255,0.15)', color: '#00BFFF' }}
        >
          HOLD'EM
        </div>
        {isOnChain && (
          <div
            className="flex items-center gap-1.5 h-7 px-3 rounded-full font-mono text-[10px] tracking-widest uppercase"
            style={{ background: 'rgba(0,232,108,0.06)', border: '1px solid rgba(0,232,108,0.15)', color: 'var(--color-success)' }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-success)' }} />
            ON-CHAIN
          </div>
        )}
        <div className="ml-auto"><XPBar handsPlayed={history.length} /></div>
      </div>

      {/* ── POKER TABLE ── */}
      <div className="w-full relative">
        <div className="absolute -inset-4 rounded-[44px] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(26,82,50,0.25) 0%, transparent 70%)', filter: 'blur(20px)' }} />

        <div className="relative w-full rounded-3xl overflow-hidden"
          style={{
            background: 'radial-gradient(ellipse 80% 70% at 50% 45%, #163D28 0%, #0E2A1C 45%, #091A12 100%)',
            border: '2.5px solid rgba(46,120,72,0.45)',
            boxShadow: '0 0 40px rgba(20,80,45,0.3), inset 0 2px 0 rgba(255,255,255,0.03), inset 0 -2px 0 rgba(0,0,0,0.3)',
            padding: 'clamp(24px, 5vw, 48px) clamp(16px, 4vw, 40px)',
          }}
        >
          <TablePattern />
          <div className="absolute inset-3 rounded-2xl pointer-events-none" style={{ border: '1px solid rgba(46,120,72,0.2)' }} />

          {/* ── Bot section (2 cards) ── */}
          <div className="relative flex flex-col items-center gap-3 mb-4 md:mb-6">
            <div
              className="font-mono text-[11px] tracking-widest uppercase flex items-center gap-2"
              style={{ color: (playState === 'botThinking' || playState === 'showdown') ? 'var(--color-fhe)' : 'rgba(255,255,255,0.45)' }}
            >
              <span>BOT</span>
              {playState === 'botThinking' && (
                <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
                  THINKING...
                </motion.span>
              )}
              {playState === 'showdown' && (
                <motion.span animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 1, repeat: Infinity }}>
                  SHOWDOWN
                </motion.span>
              )}
            </div>

            <div className="relative flex gap-3 md:gap-4">
              <BotScanOverlay active={playState === 'botThinking' || playState === 'showdown'} />
              {playState === 'dealing' ? (
                [0, 1].map(i => (
                  <motion.div key={i}
                    initial={{ x: 0, y: -40, opacity: 0, scale: 0.8 }}
                    animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3 + i * 0.4, type: 'spring', stiffness: 200, damping: 18 }}>
                    <Card state="faceDown" />
                  </motion.div>
                ))
              ) : botCards.length > 0 ? (
                botCards.map((_, i) => (
                  <motion.div key={i}
                    animate={playState === 'botThinking' ? { y: [0, -3, 0] } : {}}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}>
                    <Card state="faceDown" />
                  </motion.div>
                ))
              ) : (
                [0, 1].map(i => <Card key={i} state="empty" />)
              )}
            </div>
          </div>

          {/* ── Community cards (5 slots) ── */}
          <div className="flex flex-col items-center gap-2 mb-4 md:mb-6">
            <div className="font-mono text-[10px] tracking-widest uppercase"
              style={{ color: communityCards.length > 0 ? '#00BFFF' : 'rgba(255,255,255,0.25)' }}>
              COMMUNITY
            </div>
            <div className="flex gap-2 md:gap-3">
              {[0, 1, 2, 3, 4].map(i => {
                const revealed = i < communityCards.length;
                const shouldShow = (
                  (i < 3 && (holdemRound === 'flop' || holdemRound === 'turn' || holdemRound === 'river' || playState === 'showdown')) ||
                  (i === 3 && (holdemRound === 'turn' || holdemRound === 'river' || playState === 'showdown')) ||
                  (i === 4 && (holdemRound === 'river' || playState === 'showdown'))
                );
                if (revealed) {
                  return (
                    <motion.div key={i}
                      initial={{ y: -20, opacity: 0, scale: 0.8 }}
                      animate={{ y: 0, opacity: 1, scale: 1 }}
                      transition={{ delay: (i % 3) * 0.15, type: 'spring', stiffness: 200, damping: 18 }}>
                      <Card id={communityCards[i]} state={playState === 'decrypting' ? 'decrypting' : 'faceUp'} delay={(i % 3) * 0.2} />
                    </motion.div>
                  );
                }
                if (shouldShow || ((playState as string) !== 'lobby' && playState !== 'result' && i < 3)) {
                  return (
                    <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 0.3 }} transition={{ delay: i * 0.1 }}>
                      <Card state="faceDown" />
                    </motion.div>
                  );
                }
                return <Card key={i} state="empty" />;
              })}
            </div>
          </div>

          {/* ── Center divider + Pot ── */}
          <div className="flex items-center gap-4 mb-4 md:mb-6 relative z-10">
            <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(0,191,255,0.15), transparent)' }} />
            <motion.div
              className="px-6 py-2.5 rounded-full relative overflow-hidden"
              style={{
                ...cp(700, 22, '0.04em'),
                background: 'rgba(0,0,0,0.35)',
                border: playState === 'showdown' ? '1px solid rgba(0,191,255,0.5)' : '1px solid rgba(0,191,255,0.2)',
                color: '#00BFFF',
                textShadow: playState === 'showdown' ? '0 0 30px rgba(0,191,255,0.6)' : '0 0 20px rgba(0,191,255,0.3)',
              }}
              animate={playState === 'showdown' ? { scale: [1, 1.05, 1] } : pot > 0 ? { scale: [1, 1.03, 1] } : {}}
              transition={playState === 'showdown' ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
              key={pot}
            >
              <span className="relative z-10">POT: <NumberScramble value={pot} /></span>
            </motion.div>
            <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(0,191,255,0.15), transparent)' }} />
          </div>

          {/* ── Player section (2 hole cards) ── */}
          <div className="relative flex flex-col items-center gap-3">
            <motion.div
              className="flex gap-3 md:gap-4"
              animate={playState === 'folding' ? { opacity: 0.3, scale: 0.92, y: 10 } : { opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeInOut' }}
            >
              {playerCards.length > 0
                ? playerCards.map((id, i) => (
                    <motion.div key={i}
                      initial={{ y: 40, opacity: 0, scale: 0.8 }}
                      animate={{ y: 0, opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.15, type: 'spring', stiffness: 200, damping: 18 }}>
                      <Card id={id} state={playState === 'decrypting' ? 'decrypting' : 'faceUp'} delay={i * 0.2} />
                    </motion.div>
                  ))
                : playState === 'dealing' || playState === 'decrypting'
                  ? [0, 1].map(i => (
                      <motion.div key={i} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 0.4 }}
                        transition={{ delay: 0.5 + i * 0.3, duration: 0.5 }}>
                        <Card state="faceDown" />
                      </motion.div>
                    ))
                  : [0, 1].map(i => <Card key={i} state="empty" />)
              }
            </motion.div>

            {/* Hand name — shown at flop when player has 5-card eval */}
            {playerEval && holdemRound === 'flop' && playState === 'playerTurn' && (
              <motion.div
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                style={{ ...cp(600, 13, '0.05em'), color: '#FFE03D' }}
              >
                <HandNameScramble name={playerEval.name} />
              </motion.div>
            )}

            <div className="font-mono text-[11px] tracking-widest uppercase flex items-center gap-2"
              style={{ color: 'rgba(255,255,255,0.55)' }}>
              YOU
              <span className="text-[10px]" style={{ color: '#00BFFF' }}>· <AnimatedBalance value={balance} /></span>
            </div>
          </div>
        </div>
      </div>

      {/* Turn timer */}
      <TurnTimer seconds={turnTimeLeft} active={turnTimerActive} />

      {/* Round indicator */}
      {/* Round indicator */}
      {playState === 'playerTurn' && holdemRound && (
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="mb-3 px-4 py-1.5 rounded-full font-mono text-[11px] tracking-widest uppercase"
          style={{
            background: 'rgba(0,191,255,0.08)',
            border: '1px solid rgba(0,191,255,0.2)',
            color: '#00BFFF',
          }}
        >
          {holdemRound === 'preflop' ? 'Pre-Flop' : holdemRound === 'flop' ? 'Flop' : holdemRound === 'turn' ? 'Turn' : 'River'}
          {waitingForCall && ' — Bot bet!'}
        </motion.div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 mt-4 relative z-10">
        {playState === 'confirmAction' ? (
          /* Queued TX — user must confirm to send next wallet signature */
          <MagneticBtn
            onClick={confirmNext}
            className="h-12 px-12 rounded-full font-mono text-sm font-bold tracking-widest uppercase flex items-center gap-2 transition-all relative overflow-hidden"
            style={{
              background: '#00BFFF',
              color: '#000',
              boxShadow: '0 0 28px rgba(0,191,255,0.4)',
            }}
          >
            PROCEED
          </MagneticBtn>
        ) : waitingForCall ? (
          /* Bot bet → player must CALL or FOLD */
          <>
            <MagneticBtn
              onClick={callBot}
              disabled={playState !== 'playerTurn'}
              className="h-12 px-10 rounded-full font-mono text-sm font-bold tracking-widest uppercase flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed relative overflow-hidden"
              style={{
                background: 'var(--color-success)',
                color: '#000',
                boxShadow: playState === 'playerTurn' ? '0 0 24px rgba(0,232,108,0.25)' : 'none',
              }}
            >
              CALL
              <span className="text-xs opacity-70">(10)</span>
            </MagneticBtn>

            <MagneticBtn
              onClick={fold}
              disabled={playState !== 'playerTurn'}
              className="h-12 px-8 rounded-full font-mono text-sm font-bold tracking-widest uppercase flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: 'transparent', color: 'var(--color-danger)',
                border: '1.5px solid rgba(255,59,59,0.35)',
                boxShadow: playState === 'playerTurn' ? '0 0 20px rgba(255,59,59,0.1)' : 'none',
              }}
            >
              FOLD
            </MagneticBtn>
          </>
        ) : (
          /* Normal action: CHECK / BET / RAISE / FOLD */
          <>
            <MagneticBtn
              onClick={handleCheck}
              disabled={playState !== 'playerTurn'}
              className="h-12 px-6 rounded-full font-mono text-sm font-bold tracking-widest uppercase flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed relative overflow-hidden"
              style={{
                background: 'rgba(255,255,255,0.08)',
                color: '#fff',
                border: '1.5px solid rgba(255,255,255,0.15)',
                boxShadow: playState === 'playerTurn' ? '0 0 16px rgba(255,255,255,0.05)' : 'none',
              }}
            >
              CHECK
            </MagneticBtn>

            <MagneticBtn
              onClick={handleBet}
              disabled={playState !== 'playerTurn'}
              className="h-12 px-6 rounded-full font-mono text-sm font-bold tracking-widest uppercase flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed relative overflow-hidden"
              style={{
                background: '#00BFFF',
                color: '#000',
                boxShadow: playState === 'playerTurn' ? '0 0 24px rgba(0,191,255,0.25)' : 'none',
              }}
            >
              BET
              <span className="text-xs opacity-70">(10)</span>
            </MagneticBtn>

            <MagneticBtn
              onClick={handleRaise}
              disabled={playState !== 'playerTurn'}
              className="h-12 px-6 rounded-full font-mono text-sm font-bold tracking-widest uppercase flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed relative overflow-hidden"
              style={{
                background: 'var(--color-primary)',
                color: '#000',
                boxShadow: playState === 'playerTurn' ? '0 0 24px rgba(255,224,61,0.25)' : 'none',
              }}
            >
              RAISE
              <span className="text-xs opacity-70">(20)</span>
            </MagneticBtn>

            <MagneticBtn
              onClick={fold}
              disabled={playState !== 'playerTurn'}
              className="h-12 px-6 rounded-full font-mono text-sm font-bold tracking-widest uppercase flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: 'transparent', color: 'var(--color-danger)',
                border: '1.5px solid rgba(255,59,59,0.35)',
                boxShadow: playState === 'playerTurn' ? '0 0 20px rgba(255,59,59,0.1)' : 'none',
              }}
            >
              FOLD
            </MagneticBtn>
          </>
        )}
      </div>

      {/* Status text */}
      <div className="mt-6 h-6">
        <TypewriterText text={statusMsg.text} color={statusMsg.color} />
      </div>

      {/* FHE Activity Feed */}
      <AnimatePresence>
        {isProcessing && <FheActivityFeed playState={playState} />}
      </AnimatePresence>

      {/* Leave table */}
      {isActive && playState !== 'result' && (
        <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={leaveGame}
          className="mt-4 font-mono text-[10px] tracking-widest uppercase transition-colors hover:text-white"
          style={{ color: 'var(--color-text-dark)' }}>
          {playState === 'playerTurn' ? 'LEAVE (auto-fold)' : 'LEAVE TABLE'}
        </motion.button>
      )}

      <AnimatePresence>
        <HoldemResultOverlay />
      </AnimatePresence>
    </div>
  );
};
