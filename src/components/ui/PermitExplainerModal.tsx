import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/useGameStore';
import { useCofhe } from '@/hooks/useCofhe';
import { useState, useCallback } from 'react';

const cp = (w: number, s: number | string, sp = '0.03em') => ({
  fontFamily: "'Chakra Petch', sans-serif", fontWeight: w, fontSize: s, letterSpacing: sp,
});

const STEPS = [
  {
    icon: '🃏',
    title: 'Your cards are encrypted',
    body:  'When the deck is shuffled, every card is sealed with Fully Homomorphic Encryption. Nobody — not the server, not validators — can read them.',
  },
  {
    icon: '🔑',
    title: 'A permit unlocks YOUR view',
    body:  'A permit is a short EIP-712 signature (no gas, no fee). It proves to the FHE decryption network that you are the rightful owner of these cards.',
  },
  {
    icon: '🛡️',
    title: 'Least-privilege by design',
    body:  'The permit is scoped only to your address and expires automatically. No other player — and no contract — can use it to read your hand.',
  },
];

// ── Animated FHE flow diagram ─────────────────────────────────────────────────
const FHEDiagram = () => {
  const nodes = [
    { label: 'CONTRACT',  color: '#B366FF', icon: '📜' },
    { label: 'ENCRYPT',   color: '#FF8C42', icon: '🔐' },
    { label: 'FHE NET',   color: '#00BFFF', icon: '🌐' },
    { label: 'YOU',       color: '#00E86C', icon: '👤' },
  ];

  return (
    <div className="flex items-center justify-center gap-1 py-5 px-2">
      {nodes.map((node, i) => (
        <div key={node.label} className="flex items-center gap-1">
          <div className="flex flex-col items-center gap-1.5">
            <motion.div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-xl"
              style={{ background: `${node.color}15`, border: `1px solid ${node.color}40` }}
              animate={{ y: [0, -3, 0], boxShadow: [`0 0 0px ${node.color}00`, `0 0 12px ${node.color}50`, `0 0 0px ${node.color}00`] }}
              transition={{ duration: 2, repeat: Infinity, delay: i * 0.4 }}
            >
              {node.icon}
            </motion.div>
            <span className="font-mono text-[8px] tracking-widest" style={{ color: node.color }}>
              {node.label}
            </span>
          </div>
          {i < nodes.length - 1 && (
            <div className="flex flex-col items-center gap-1 mx-0.5" style={{ marginBottom: 18 }}>
              <motion.div
                className="h-0.5 w-8 rounded-full"
                style={{ background: `linear-gradient(90deg, ${nodes[i].color}60, ${nodes[i+1].color}60)` }}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.5 }}
              />
              <motion.div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: nodes[i + 1].color }}
                animate={{ x: [-16, 16], opacity: [0, 1, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.5, ease: 'easeInOut' }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ── Main modal ────────────────────────────────────────────────────────────────
export const PermitExplainerModal = () => {
  const { playState, hasSeenPermitExplainer, setHasSeenPermitExplainer, permitStatus } = useGameStore();
  const { ensurePermit, isReady } = useCofhe();
  const [signing, setSigning] = useState(false);
  const [step, setStep]       = useState(0);

  const visible =
    playState === 'decrypting' &&
    !hasSeenPermitExplainer &&
    permitStatus !== 'active';

  const dismiss = useCallback(() => setHasSeenPermitExplainer(true), [setHasSeenPermitExplainer]);

  const signAndDismiss = useCallback(async () => {
    setSigning(true);
    try { await ensurePermit(); } catch { /* handled inside ensurePermit */ }
    finally { setSigning(false); setHasSeenPermitExplainer(true); }
  }, [ensurePermit, setHasSeenPermitExplainer]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(10px)' }}
        >
          <motion.div
            initial={{ scale: 0.92, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 20 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="relative w-full max-w-sm rounded-2xl overflow-hidden"
            style={{
              background: 'rgba(10,10,18,0.98)',
              border:     '1px solid rgba(179,102,255,0.25)',
              boxShadow:  '0 0 60px rgba(179,102,255,0.15), 0 24px 48px rgba(0,0,0,0.6)',
            }}
          >
            {/* Animated gradient top accent */}
            <motion.div
              className="h-1 w-full"
              style={{ background: 'linear-gradient(90deg, #B366FF, #00BFFF, #FFE03D, #B366FF)' }}
              animate={{ backgroundPosition: ['0%', '100%', '0%'] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
            />

            <div className="px-6 pt-5 pb-5">
              {/* FHE flow diagram */}
              <div className="mb-4 rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <FHEDiagram />
              </div>

              {/* Step content */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.2 }}
                  className="mb-5"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span style={{ fontSize: 24 }}>{STEPS[step].icon}</span>
                    <span style={{ ...cp(700, 15, '0.04em'), color: 'var(--color-fhe)' }}>
                      {STEPS[step].title}
                    </span>
                  </div>
                  <p style={{ ...cp(400, 13, '0.03em'), color: 'rgba(255,255,255,0.55)', lineHeight: 1.65 }}>
                    {STEPS[step].body}
                  </p>
                </motion.div>
              </AnimatePresence>

              {/* Step dots */}
              <div className="flex items-center gap-1.5 mb-5">
                {STEPS.map((_, i) => (
                  <button key={i} onClick={() => setStep(i)}
                    className="h-1.5 rounded-full transition-all"
                    style={{ width: i === step ? 24 : 8, background: i === step ? 'var(--color-fhe)' : 'rgba(255,255,255,0.12)' }}
                    aria-label={`Step ${i + 1}`}
                  />
                ))}
                <span className="ml-auto font-mono text-[10px] tracking-widest" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  {step + 1}/{STEPS.length}
                </span>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2">
                {step < STEPS.length - 1 ? (
                  <button
                    onClick={() => setStep(s => s + 1)}
                    className="w-full py-3 rounded-xl font-mono text-sm font-bold tracking-widest uppercase transition-all hover:brightness-110"
                    style={{ background: 'rgba(179,102,255,0.12)', border: '1px solid rgba(179,102,255,0.3)', color: 'var(--color-fhe)' }}
                  >
                    NEXT →
                  </button>
                ) : (
                  <button
                    onClick={signAndDismiss}
                    disabled={!isReady || signing}
                    className="w-full py-3 rounded-xl font-mono text-sm font-bold tracking-widest uppercase transition-all hover:brightness-110 disabled:opacity-50"
                    style={{ background: 'var(--color-fhe)', color: '#000', boxShadow: '0 0 24px rgba(179,102,255,0.4)' }}
                  >
                    {signing ? 'CHECK WALLET…' : 'SIGN PERMIT & REVEAL CARDS'}
                  </button>
                )}
                <button onClick={dismiss} className="w-full py-2 rounded-xl font-mono text-xs tracking-widest uppercase transition-colors"
                  style={{ color: 'rgba(255,255,255,0.25)' }}>
                  GOT IT, SKIP
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
