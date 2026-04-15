/**
 * PermitExplainerModal — shown once, before the player's first card reveal,
 * to explain what an FHE permit is and why it is required.
 *
 * Displayed when playState === 'decrypting' and hasSeenPermitExplainer === false.
 * Dismissed by clicking "Got it" or by signing the permit directly from the modal.
 */
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/useGameStore';
import { useCofhe } from '@/hooks/useCofhe';
import { useState, useCallback } from 'react';

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

export const PermitExplainerModal = () => {
  const { playState, hasSeenPermitExplainer, setHasSeenPermitExplainer, permitStatus } =
    useGameStore();
  const { ensurePermit, isReady } = useCofhe();
  const [signing, setSigning] = useState(false);
  const [step, setStep] = useState(0);

  const visible =
    playState === 'decrypting' &&
    !hasSeenPermitExplainer &&
    permitStatus !== 'active';

  const dismiss = useCallback(() => {
    setHasSeenPermitExplainer(true);
  }, [setHasSeenPermitExplainer]);

  const signAndDismiss = useCallback(async () => {
    setSigning(true);
    try {
      await ensurePermit();
    } catch {
      // error already handled inside ensurePermit (sets permitStatus)
    } finally {
      setSigning(false);
      setHasSeenPermitExplainer(true);
    }
  }, [ensurePermit, setHasSeenPermitExplainer]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
        >
          <motion.div
            initial={{ scale: 0.92, y: 20 }}
            animate={{ scale: 1,    y: 0  }}
            exit={{ scale: 0.92,    y: 20 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="relative w-full max-w-sm rounded-2xl overflow-hidden"
            style={{
              background: 'rgba(12,12,20,0.97)',
              border:     '1px solid rgba(179,102,255,0.25)',
              boxShadow:  '0 0 60px rgba(179,102,255,0.12), 0 24px 48px rgba(0,0,0,0.6)',
            }}
          >
            {/* purple top-bar accent */}
            <div
              className="h-1 w-full"
              style={{ background: 'linear-gradient(90deg, var(--color-fhe), rgba(179,102,255,0.2))' }}
            />

            <div className="px-6 pt-6 pb-5">
              {/* Step card */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0  }}
                  exit={{ opacity: 0,   x: -20 }}
                  transition={{ duration: 0.22 }}
                  className="mb-5"
                >
                  <div className="text-3xl mb-3">{STEPS[step].icon}</div>
                  <div
                    className="font-satoshi text-base font-bold mb-2"
                    style={{ color: 'var(--color-fhe)' }}
                  >
                    {STEPS[step].title}
                  </div>
                  <div
                    className="font-satoshi text-sm leading-relaxed"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {STEPS[step].body}
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Step dots */}
              <div className="flex items-center gap-1.5 mb-6">
                {STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setStep(i)}
                    className="h-1.5 rounded-full transition-all"
                    style={{
                      width:      i === step ? '24px' : '8px',
                      background: i === step
                        ? 'var(--color-fhe)'
                        : 'rgba(255,255,255,0.15)',
                    }}
                    aria-label={`Step ${i + 1}`}
                  />
                ))}
                <span
                  className="ml-auto font-mono text-[10px] tracking-widest"
                  style={{ color: 'rgba(255,255,255,0.25)' }}
                >
                  {step + 1}/{STEPS.length}
                </span>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2">
                {step < STEPS.length - 1 ? (
                  <button
                    onClick={() => setStep(s => s + 1)}
                    className="w-full py-3 rounded-xl font-mono text-sm font-bold tracking-widest uppercase transition-all hover:brightness-110"
                    style={{
                      background: 'rgba(179,102,255,0.12)',
                      border:     '1px solid rgba(179,102,255,0.3)',
                      color:      'var(--color-fhe)',
                    }}
                  >
                    NEXT →
                  </button>
                ) : (
                  <button
                    onClick={signAndDismiss}
                    disabled={!isReady || signing}
                    className="w-full py-3 rounded-xl font-mono text-sm font-bold tracking-widest uppercase transition-all hover:brightness-110 disabled:opacity-50"
                    style={{
                      background: 'var(--color-fhe)',
                      color:      '#000',
                      boxShadow:  '0 0 24px rgba(179,102,255,0.4)',
                    }}
                  >
                    {signing ? 'CHECK WALLET…' : 'SIGN PERMIT & REVEAL CARDS'}
                  </button>
                )}

                <button
                  onClick={dismiss}
                  className="w-full py-2 rounded-xl font-mono text-xs tracking-widest uppercase transition-colors"
                  style={{ color: 'rgba(255,255,255,0.3)' }}
                >
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
