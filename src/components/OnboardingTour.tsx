import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';

const cp = (weight: number, size: number | string, spacing = '0.03em') => ({
  fontFamily: "'Chakra Petch', sans-serif",
  fontWeight: weight,
  fontSize: size,
  letterSpacing: spacing,
});

const STORAGE_KEY = 'cofhe-onboarding-done';

const STEPS = [
  {
    icon: '🃏',
    title: 'Welcome to Cofhe Poker',
    body: 'The world\'s first fully on-chain poker with FHE encryption. Every card is encrypted — even the server can\'t see your hand.',
    highlight: 'FHE = Fully Homomorphic Encryption',
  },
  {
    icon: '🔒',
    title: 'Cards are encrypted on-chain',
    body: 'When you hit DEAL, the contract generates encrypted random cards using CoFHE. Only you can decrypt your hole cards — the bot and other players are completely blind.',
    highlight: 'Zero trust, zero servers',
  },
  {
    icon: '⚡',
    title: 'FHE Permit — sign once',
    body: 'To decrypt your cards, you\'ll sign an FHE permit once per session. This gives the CoFHE network permission to reveal only your cards to you.',
    highlight: 'Look for the purple FHE badge',
  },
  {
    icon: '🎮',
    title: '4 game modes',
    body: '3-Card vs Bot · Texas Hold\'em vs Bot · 3-Card PvP · Hold\'em PvP. Start with 3-Card for the fastest experience. Use the PLAY tab to choose your mode.',
    highlight: 'Start with 3-Card — fastest hands',
  },
  {
    icon: '🏆',
    title: 'Track your progress',
    body: 'Every hand is saved in History with hand replay. Check your Profile for XP, achievements and badges. See how you rank on the Leaderboard.',
    highlight: 'Profile → History → Leaderboard',
  },
];

export const OnboardingTour = () => {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      const t = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(t);
    }
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  }, []);

  const next = useCallback(() => {
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else dismiss();
  }, [step, dismiss]);

  const prev = useCallback(() => {
    if (step > 0) setStep(s => s - 1);
  }, [step]);

  const current = STEPS[step];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(6px)' }}
          onClick={e => { if (e.target === e.currentTarget) dismiss(); }}
        >
          <motion.div
            initial={{ scale: 0.92, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 20, opacity: 0 }}
            transition={{ type: 'spring', damping: 24, stiffness: 280 }}
            className="w-full max-w-[480px] relative"
            style={{
              background: 'linear-gradient(145deg, #0F1318 0%, #0A0D12 100%)',
              border: '1px solid rgba(179,102,255,0.25)',
              borderRadius: 20,
              boxShadow: '0 0 60px rgba(179,102,255,0.12)',
              overflow: 'hidden',
            }}
          >
            {/* Top gradient accent */}
            <div className="h-[2px] w-full" style={{ background: 'linear-gradient(90deg, #B366FF, #00BFFF, #FFE03D)' }} />

            {/* Close */}
            <button
              onClick={dismiss}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full transition-all"
              style={{ color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.05)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'white'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.3)'; }}
            >
              <X size={14} />
            </button>

            <div className="p-8">
              {/* Step dots */}
              <div className="flex gap-1.5 mb-8">
                {STEPS.map((_, i) => (
                  <button key={i} onClick={() => setStep(i)} className="h-1.5 rounded-full transition-all"
                    style={{
                      width: i === step ? 24 : 8,
                      background: i === step ? '#B366FF' : 'rgba(255,255,255,0.12)',
                    }}
                  />
                ))}
              </div>

              {/* Content */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="text-5xl mb-6">{current.icon}</div>

                  <h2 className="mb-3" style={{ ...cp(700, 22, '0.04em'), color: 'white' }}>
                    {current.title}
                  </h2>

                  <p className="mb-5" style={{ ...cp(400, 14, '0.03em'), color: 'rgba(255,255,255,0.6)', lineHeight: 1.7 }}>
                    {current.body}
                  </p>

                  <div
                    className="px-4 py-2.5 rounded-xl font-mono text-[11px] tracking-wider"
                    style={{ background: 'rgba(179,102,255,0.08)', border: '1px solid rgba(179,102,255,0.2)', color: '#B366FF' }}
                  >
                    ✦ {current.highlight}
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Navigation */}
              <div className="flex items-center justify-between mt-8">
                <button
                  onClick={prev}
                  disabled={step === 0}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-full font-mono text-[11px] tracking-widest uppercase transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <ChevronLeft size={13} /> Back
                </button>

                <span style={{ ...cp(400, 11, '0.08em'), color: 'rgba(255,255,255,0.25)' }}>
                  {step + 1} / {STEPS.length}
                </span>

                <button
                  onClick={next}
                  className="flex items-center gap-1.5 h-9 px-5 rounded-full font-mono text-[11px] tracking-widest uppercase font-bold transition-all"
                  style={{
                    background: step === STEPS.length - 1 ? '#FFE03D' : '#B366FF',
                    color: '#000',
                    boxShadow: `0 0 20px ${step === STEPS.length - 1 ? 'rgba(255,224,61,0.3)' : 'rgba(179,102,255,0.3)'}`,
                  }}
                >
                  {step === STEPS.length - 1 ? "Let's Play" : 'Next'}
                  <ChevronRight size={13} />
                </button>
              </div>

              <button
                onClick={dismiss}
                className="w-full mt-4 font-mono text-[10px] tracking-widest uppercase transition-colors"
                style={{ color: 'rgba(255,255,255,0.2)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.2)'; }}
              >
                Skip tour
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
