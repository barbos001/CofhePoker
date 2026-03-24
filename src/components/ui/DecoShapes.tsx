import { motion } from 'framer-motion';

const SHAPES = [
  // Triangle
  (color: string) => <polygon points="50,10 90,90 10,90" fill={color} />,
  // Circle
  (color: string) => <circle cx="50" cy="50" r="40" fill={color} />,
  // Diamond
  (color: string) => <polygon points="50,10 90,50 50,90 10,50" fill={color} />,
  // 4-Point Star
  (color: string) => <path d="M50 10 Q50 50 90 50 Q50 50 50 90 Q50 50 10 50 Q50 50 50 10" fill={color} />
];

const COLORS = ['#FF3B3B', '#4D7CFF', '#FFE03D', '#00E86C', '#FF66B2', '#FF8C42'];

export const DecoShapes = ({ count = 8, className }: { count?: number, className?: string }) => {
  // Use deterministic random based on index to avoid hydration mismatch if SSR, but we are SPA so Math.random is fine on mount
  const shapes = Array.from({ length: count }).map((_, i) => ({
    id: i,
    Shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    size: Math.floor(Math.random() * 12) + 12, // 12-24px
    left: `${Math.floor(Math.random() * 100)}%`,
    top: `${Math.floor(Math.random() * 100)}%`,
    duration: Math.random() * 4 + 4, // 4-8s
    delay: Math.random() * -5,
  }));

  return (
    <div className={`absolute inset-0 pointer-events-none overflow-hidden ${className || ''}`}>
      {shapes.map((s) => (
        <motion.div
          key={s.id}
          className="absolute"
          style={{ left: s.left, top: s.top, width: s.size, height: s.size }}
          animate={{
            y: [0, -15, 0],
            rotate: [0, 15, -10, 0],
          }}
          transition={{
            duration: s.duration,
            repeat: Infinity,
            repeatType: 'mirror',
            ease: 'easeInOut',
            delay: s.delay,
          }}
        >
          <svg viewBox="0 0 100 100" className="w-full h-full">
            {s.Shape(s.color)}
          </svg>
        </motion.div>
      ))}
    </div>
  );
};
