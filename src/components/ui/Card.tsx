import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { getCardData } from '@/lib/poker';

interface CardProps {
  id?: number;
  state: 'empty' | 'dealing' | 'faceDown' | 'decrypting' | 'faceUp' | 'winner' | 'loser' | 'folded';
  className?: string;
  delay?: number;
}

export const Card = ({ id, state, className, delay = 0 }: CardProps) => {
  const cardData = id !== undefined ? getCardData(id) : null;
  const isRed = cardData?.suit === '♥' || cardData?.suit === '♦';

  const baseClasses = 'relative w-[72px] h-[100px] sm:w-[80px] sm:h-[112px] md:w-[110px] md:h-[154px] lg:w-[120px] lg:h-[168px] rounded-xl shrink-0';

  if (state === 'empty') {
    return (
      <div
        className={cn(baseClasses, className)}
        style={{
          border:     '2px dashed rgba(255,255,255,0.1)',
          background: 'rgba(255,255,255,0.02)',
        }}
      />
    );
  }

  if (state === 'folded') return null;

  // ── Face Up ─────────────────────────────────────────────────────────
  const FaceUp = () => (
    <div
      className="absolute inset-0 rounded-xl flex flex-col justify-between p-2 md:p-3"
      style={{
        background: 'linear-gradient(160deg, #FFFFFF 0%, #F0F0F0 100%)',
        boxShadow:  'inset 0 1px 0 rgba(255,255,255,0.8), 0 4px 20px rgba(0,0,0,0.4)',
      }}
    >
      {/* Top-left rank + suit */}
      <div className={cn('flex flex-col items-start leading-none', isRed ? 'text-[#E53935]' : 'text-[#1A1A1A]')}>
        <span className="font-satoshi font-black text-[18px] md:text-[26px]">{cardData?.rankString}</span>
        <span className="text-[14px] md:text-[18px] -mt-0.5">{cardData?.suit}</span>
      </div>

      {/* Center suit */}
      <div
        className={cn(
          'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[38px] md:text-[52px]',
          isRed ? 'text-[#E53935]' : 'text-[#1A1A1A]',
        )}
        style={{ opacity: 0.9 }}
      >
        {cardData?.suit}
      </div>

      {/* Bottom-right rank + suit (rotated) */}
      <div className={cn('flex flex-col items-end rotate-180 leading-none', isRed ? 'text-[#E53935]' : 'text-[#1A1A1A]')}>
        <span className="font-satoshi font-black text-[18px] md:text-[26px]">{cardData?.rankString}</span>
        <span className="text-[14px] md:text-[18px] -mt-0.5">{cardData?.suit}</span>
      </div>
    </div>
  );

  // ── Face Down (rich FHE card back) ──────────────────────────────────
  const FaceDown = () => (
    <div
      className="absolute inset-0 rounded-xl overflow-hidden"
      style={{
        background: 'linear-gradient(145deg, #1a1a3e 0%, #0c1428 60%, #14102e 100%)',
        border:     '1.5px solid rgba(179,102,255,0.2)',
        boxShadow:  '0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      {/* Geometric grid pattern */}
      <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.12 }}>
        <defs>
          <pattern id="card-grid" width="14" height="14" patternUnits="userSpaceOnUse">
            <path d="M14 0L0 0 0 14" stroke="rgba(179,102,255,0.8)" strokeWidth="0.5" fill="none" />
          </pattern>
          <pattern id="card-diamonds" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M10 0 L20 10 L10 20 L0 10Z" stroke="rgba(255,224,61,0.4)" strokeWidth="0.4" fill="none" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#card-grid)" />
        <rect width="100%" height="100%" fill="url(#card-diamonds)" />
      </svg>

      {/* Center emblem */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        {/* Outer ring */}
        <div
          className="w-10 h-10 md:w-14 md:h-14 rounded-full flex items-center justify-center"
          style={{
            border:     '1px solid rgba(179,102,255,0.25)',
            background: 'rgba(179,102,255,0.06)',
          }}
        >
          <span className="text-xl md:text-2xl" style={{ color: 'rgba(255,224,61,0.35)' }}>♠</span>
        </div>
      </div>

      {/* Lock badge */}
      <div className="absolute bottom-2 left-0 right-0 flex justify-center">
        <span
          className="font-mono text-[7px] md:text-[8px] tracking-[0.2em] uppercase px-2 py-0.5 rounded"
          style={{
            background: 'rgba(179,102,255,0.1)',
            color:      'rgba(179,102,255,0.55)',
            border:     '1px solid rgba(179,102,255,0.12)',
          }}
        >
          🔒 FHE
        </span>
      </div>

      {/* Corner accents */}
      <div className="absolute top-2 left-2 w-2 h-2 border-l border-t" style={{ borderColor: 'rgba(179,102,255,0.2)' }} />
      <div className="absolute top-2 right-2 w-2 h-2 border-r border-t" style={{ borderColor: 'rgba(179,102,255,0.2)' }} />
      <div className="absolute bottom-6 left-2 w-2 h-2 border-l border-b" style={{ borderColor: 'rgba(179,102,255,0.2)' }} />
      <div className="absolute bottom-6 right-2 w-2 h-2 border-r border-b" style={{ borderColor: 'rgba(179,102,255,0.2)' }} />
    </div>
  );

  const isRevealed = state === 'faceUp' || state === 'winner' || state === 'loser';

  return (
    <motion.div
      initial={state === 'dealing' ? { y: -200, opacity: 0, rotate: -15 } : false}
      animate={{
        y: 0,
        opacity: state === 'loser' ? 0.35 : 1,
        rotate: 0,
        scale: state === 'loser' ? 0.92 : 1,
        filter: state === 'loser' ? 'grayscale(100%)' : 'grayscale(0%)',
      }}
      transition={{ delay, type: 'spring', stiffness: 300, damping: 25 }}
      whileHover={isRevealed && state !== 'loser' ? { y: -12, transition: { duration: 0.2 } } : {}}
      className={cn(baseClasses, className)}
    >
      {/* Face content (behind split back) */}
      {cardData && <FaceUp />}

      {/* Split Back — Left Half */}
      <motion.div
        initial={false}
        animate={{ x: isRevealed ? '-100%' : '0%', opacity: isRevealed ? 0 : 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="absolute left-0 top-0 bottom-0 w-1/2 overflow-hidden origin-left z-10"
      >
        <div className="w-[80px] md:w-[120px] h-full relative">
          <FaceDown />
        </div>
      </motion.div>

      {/* Split Back — Right Half */}
      <motion.div
        initial={false}
        animate={{ x: isRevealed ? '100%' : '0%', opacity: isRevealed ? 0 : 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="absolute right-0 top-0 bottom-0 w-1/2 overflow-hidden origin-right z-10"
      >
        <div className="w-[80px] md:w-[120px] h-full relative -left-full">
          <FaceDown />
        </div>
      </motion.div>

      {/* FHE Decrypt Shimmer */}
      {state === 'decrypting' && (
        <motion.div
          className="absolute inset-0 z-20 pointer-events-none rounded-xl overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.div
            className="absolute top-0 bottom-0 w-[2px]"
            style={{
              background: 'var(--color-fhe)',
              boxShadow:  '0 0 12px 3px rgba(179,102,255,0.6)',
            }}
            animate={{ left: ['0%', '100%', '0%'] }}
            transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
          />
        </motion.div>
      )}

      {/* Winner Glow */}
      {state === 'winner' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute inset-0 rounded-xl z-30 pointer-events-none"
          style={{
            border:   '2px solid var(--color-primary)',
            boxShadow: '0 0 20px rgba(255,224,61,0.3), inset 0 0 20px rgba(255,224,61,0.05)',
          }}
        />
      )}
    </motion.div>
  );
};
