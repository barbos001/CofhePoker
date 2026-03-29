import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

const STAGE_MESSAGES: Record<string, { stages: string[]; color: string }> = {
  dealing: {
    stages: [
      'FHE.randomEuint64() — generating seed',
      'Computing card IDs in ciphertext',
      'FHE.allow() — setting card ACL',
      'Broadcasting encrypted cards',
    ],
    color: '#B366FF',
  },
  decrypting: {
    stages: [
      'Requesting threshold decryption',
      'CoFHE nodes gathering key shares',
      'Reconstructing plaintext card value',
      'Verifying decrypted result',
    ],
    color: '#5B9EFF',
  },
  botThinking: {
    stages: [
      'Bot evaluating encrypted hand',
      'FHE.gte() — comparing hand strength',
      'FHE.decrypt() — resolving decision',
      'Waiting for threshold network',
    ],
    color: '#FFE03D',
  },
  showdown: {
    stages: [
      'Computing 7-card hand scores (~350 FHE ops)',
      'FHE.gt() — comparing encrypted scores',
      'FHE.eq() — checking for tie',
      'FHE.decrypt() — revealing winner',
    ],
    color: '#00E86C',
  },
};

export const FheProgressBar = ({ playState }: { playState: string }) => {
  const config = STAGE_MESSAGES[playState];
  const [stageIdx, setStageIdx] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setStageIdx(0);
    setProgress(0);
  }, [playState]);

  useEffect(() => {
    if (!config) return;
    const interval = setInterval(() => {
      setStageIdx((i) => (i + 1) % config.stages.length);
    }, 3500);
    return () => clearInterval(interval);
  }, [config]);

  useEffect(() => {
    if (!config) return;
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 95) return 95;
        const increment = Math.random() * 8 + 2;
        return Math.min(p + increment, 95);
      });
    }, 800);
    return () => clearInterval(interval);
  }, [config, playState]);

  if (!config) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="w-full max-w-md mx-auto mb-4"
      >
        <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <motion.div
                className="w-2 h-2 rounded-full"
                style={{ background: config.color }}
                animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              <span className="font-mono text-[10px] tracking-wider uppercase" style={{ color: config.color }}>
                {playState === 'dealing' ? 'Dealing' :
                 playState === 'decrypting' ? 'Decrypting' :
                 playState === 'botThinking' ? 'Bot Thinking' : 'Showdown'}
              </span>
            </div>
            <span className="font-mono text-[10px] opacity-50">{Math.round(progress)}%</span>
          </div>

          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${config.color}88, ${config.color})` }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={stageIdx}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 0.6, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="font-mono text-[10px] mt-2 text-white truncate"
            >
              {config.stages[stageIdx]}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
