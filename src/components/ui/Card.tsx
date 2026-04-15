import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { getCardData } from '@/lib/poker';

interface CardProps {
  id?: number;
  state: 'empty' | 'dealing' | 'faceDown' | 'decrypting' | 'faceUp' | 'winner' | 'loser' | 'folded';
  className?: string;
  delay?: number;
}

/* ── SVG suit glyphs — proper vector shapes ─────────────────────── */
const SuitSvg = ({ suit, size = 18, color }: { suit: string; size?: number; color: string }) => {
  const s = size;
  if (suit === '♥') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={color}>
      <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z"/>
    </svg>
  );
  if (suit === '♦') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2L2 12l10 10 10-10z"/>
    </svg>
  );
  if (suit === '♣') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2c-2.209 0-4 1.791-4 4s1.791 4 4 4c-2.209 1.791-4 3.791-4 6 0 2.209 1.791 4 4 4s4-1.791 4-4c0-2.209-1.791-4.209-4-6 2.209 0 4-1.791 4-4s-1.791-4-4-4zm-3 18l1-4h4l1 4h-6z"/>
    </svg>
  );
  // ♠
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2C8 7 2 9 2 14c0 2.5 1.5 4 4 4 1 0 2-.3 2.8-.8L7 21h10l-1.8-3.8c.8.5 1.8.8 2.8.8 2.5 0 4-1.5 4-4C22 9 16 7 12 2z"/>
    </svg>
  );
};

/* ── Center suit large display ───────────────────────────────────── */
const BigSuitSvg = ({ suit, color, size = 40 }: { suit: string; color: string; size?: number }) => (
  <SuitSvg suit={suit} size={size} color={color} />
);

/* ── Luxury FaceUp card design ───────────────────────────────────── */
const FaceUp = ({ cardData, isRed, isWinner }: {
  cardData: ReturnType<typeof getCardData>;
  isRed: boolean;
  isWinner: boolean;
}) => {
  const primaryColor = isRed ? '#C0392B' : '#1A1A2E';
  const accentColor  = isRed ? '#E74C3C' : '#2C3E50';
  const pipColor     = isRed ? '#C0392B' : '#1A1A2E';

  return (
    <div
      className="absolute inset-0 rounded-xl flex flex-col justify-between overflow-hidden"
      style={{
        background: isWinner
          ? 'linear-gradient(160deg, #FFFFF5 0%, #FFFDE8 40%, #FFF8CC 100%)'
          : 'linear-gradient(160deg, #FEFEFE 0%, #F5F5F0 50%, #EEEEEA 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 0 rgba(0,0,0,0.06), 0 4px 20px rgba(0,0,0,0.35)',
      }}
    >
      {/* Subtle inner border */}
      <div
        className="absolute inset-[3px] rounded-[9px] pointer-events-none"
        style={{ border: `1px solid ${isRed ? 'rgba(192,57,43,0.12)' : 'rgba(26,26,46,0.08)'}` }}
      />

      {/* Winner holographic shimmer overlay */}
      {isWinner && (
        <div
          className="absolute inset-0 rounded-xl pointer-events-none overflow-hidden"
          style={{ zIndex: 5 }}
        >
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(135deg, transparent 30%, rgba(255,224,61,0.12) 45%, rgba(255,255,255,0.25) 50%, rgba(255,224,61,0.12) 55%, transparent 70%)',
              animation: 'card-shine 2.5s ease-in-out infinite',
            }}
          />
        </div>
      )}

      {/* Top-left corner — rank + suit */}
      <div className="absolute top-[6px] left-[7px] flex flex-col items-center leading-none" style={{ zIndex: 10 }}>
        <span
          className="font-mono font-black leading-none"
          style={{
            fontSize: 'clamp(14px, 2.5vw, 22px)',
            color: primaryColor,
            textShadow: `0 1px 0 rgba(255,255,255,0.8)`,
            letterSpacing: '-0.02em',
          }}
        >
          {cardData?.rankString}
        </span>
        <div className="mt-0.5">
          <SuitSvg suit={cardData?.suit ?? '♠'} size={12} color={accentColor} />
        </div>
      </div>

      {/* Center large suit */}
      <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 4 }}>
        <div
          style={{
            filter: isWinner
              ? `drop-shadow(0 0 8px ${isRed ? 'rgba(231,76,60,0.4)' : 'rgba(26,26,46,0.3)'}) drop-shadow(0 2px 4px rgba(0,0,0,0.15))`
              : `drop-shadow(0 2px 4px rgba(0,0,0,0.12))`,
            transform: 'scale(clamp(0.9, 2.2vw, 1.3))',
          }}
        >
          <BigSuitSvg
            suit={cardData?.suit ?? '♠'}
            color={pipColor}
            size={42}
          />
        </div>
      </div>

      {/* Bottom-right corner — rotated */}
      <div
        className="absolute bottom-[6px] right-[7px] flex flex-col items-center leading-none rotate-180"
        style={{ zIndex: 10 }}
      >
        <span
          className="font-mono font-black leading-none"
          style={{
            fontSize: 'clamp(14px, 2.5vw, 22px)',
            color: primaryColor,
            textShadow: `0 1px 0 rgba(255,255,255,0.8)`,
            letterSpacing: '-0.02em',
          }}
        >
          {cardData?.rankString}
        </span>
        <div className="mt-0.5">
          <SuitSvg suit={cardData?.suit ?? '♠'} size={12} color={accentColor} />
        </div>
      </div>

      {/* Subtle rank pips — small suit repeats mid-column for face cards */}
      {cardData && ['J', 'Q', 'K'].includes(cardData.rankString) && (
        <>
          <div className="absolute top-[28%] left-1/2 -translate-x-1/2" style={{ opacity: 0.08 }}>
            <SuitSvg suit={cardData.suit} size={20} color={primaryColor} />
          </div>
          <div className="absolute bottom-[28%] left-1/2 -translate-x-1/2 rotate-180" style={{ opacity: 0.08 }}>
            <SuitSvg suit={cardData.suit} size={20} color={primaryColor} />
          </div>
        </>
      )}
    </div>
  );
};

/* ── FaceDown card back ─────────────────────────────────────────── */
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

/* ── Main Card component ─────────────────────────────────────────── */
export const Card = ({ id, state, className, delay = 0 }: CardProps) => {
  const cardData = id !== undefined ? getCardData(id) : null;
  const isRed = cardData?.suit === '♥' || cardData?.suit === '♦';
  const isRevealed = state === 'faceUp' || state === 'winner' || state === 'loser';
  const isWinner = state === 'winner';

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

  return (
    <motion.div
      initial={state === 'dealing' ? { y: -200, opacity: 0, rotate: -15 } : false}
      animate={{
        y: 0,
        opacity: state === 'loser' ? 0.28 : 1,
        rotate: 0,
        scale: state === 'loser' ? 0.90 : 1,
        filter: state === 'loser' ? 'grayscale(100%) brightness(0.7)' : 'grayscale(0%) brightness(1)',
      }}
      transition={{ delay, type: 'spring', stiffness: 300, damping: 25 }}
      whileHover={isRevealed && state !== 'loser' ? { y: -14, scale: 1.04, transition: { duration: 0.18 } } : {}}
      className={cn(baseClasses, className)}
    >
      {/* Face content (behind split back) */}
      {cardData && (
        <FaceUp cardData={cardData} isRed={isRed} isWinner={isWinner} />
      )}

      {/* Split Back — Left Half */}
      <motion.div
        initial={false}
        animate={{ x: isRevealed ? '-100%' : '0%', opacity: isRevealed ? 0 : 1 }}
        transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
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
        transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
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
          {/* Faint purple wash */}
          <motion.div
            className="absolute inset-0"
            style={{ background: 'rgba(179,102,255,0.08)' }}
            animate={{ opacity: [0.3, 0.8, 0.3] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
        </motion.div>
      )}

      {/* Winner Glow — animated border */}
      {state === 'winner' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute inset-0 rounded-xl z-30 pointer-events-none"
          style={{
            border:     '2.5px solid var(--color-primary)',
            boxShadow:  '0 0 20px rgba(255,224,61,0.5), 0 0 50px rgba(255,224,61,0.18), inset 0 0 16px rgba(255,224,61,0.08)',
            animation:  'winner-pulse 1.8s ease-in-out infinite',
          }}
        />
      )}
    </motion.div>
  );
};
