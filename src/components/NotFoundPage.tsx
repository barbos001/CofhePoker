import { motion } from 'framer-motion';
import { useGameStore } from '@/store/useGameStore';

const cp = (w: number, s: number | string, sp = '0.03em') => ({
  fontFamily: "'Chakra Petch', sans-serif", fontWeight: w, fontSize: s, letterSpacing: sp,
});

export const NotFoundPage = () => {
  const setAppState = useGameStore(s => s.setAppState);
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 text-center">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 20 }}
      >
        {/* Cards */}
        <div className="flex gap-3 justify-center mb-8">
          {['🂿', '🃏', '🂡'].map((c, i) => (
            <motion.div
              key={i}
              animate={{ y: [0, -8, 0], rotate: [-5 + i * 5, 5 - i * 5, -5 + i * 5] }}
              transition={{ duration: 2 + i * 0.3, repeat: Infinity, ease: 'easeInOut' }}
              style={{ fontSize: 56 }}
            >
              {c}
            </motion.div>
          ))}
        </div>

        <h1 style={{ ...cp(700, 96, '0.04em'), color: 'rgba(255,255,255,0.08)', lineHeight: 1 }}>404</h1>
        <h2 style={{ ...cp(700, 28, '0.06em'), color: 'white', marginTop: -16, marginBottom: 12 }}>
          Dead Hand
        </h2>
        <p style={{ ...cp(400, 15, '0.04em'), color: 'rgba(255,255,255,0.4)', marginBottom: 32, maxWidth: 320 }}>
          This page got folded. The URL you're looking for doesn't exist.
        </p>

        <div className="flex gap-3 justify-center flex-wrap">
          <button
            onClick={() => setAppState('app')}
            className="px-8 py-3 rounded-full font-mono text-sm font-bold tracking-widest uppercase transition-all"
            style={{ background: '#FFE03D', color: '#000', boxShadow: '0 0 24px rgba(255,224,61,0.3)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 40px rgba(255,224,61,0.5)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 24px rgba(255,224,61,0.3)'; }}
          >
            ← Back to Table
          </button>
          <button
            onClick={() => setAppState('landing')}
            className="px-8 py-3 rounded-full font-mono text-sm tracking-widest uppercase transition-all"
            style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            Home
          </button>
        </div>
      </motion.div>
    </div>
  );
};
