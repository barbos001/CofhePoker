import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface PillProps {
  children: ReactNode;
  variant?: 'dark' | 'yellow' | 'red' | 'purple' | 'green' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
  layoutId?: string;
  disabled?: boolean;
  title?: string;
}

export const Pill = ({ children, variant = 'dark', size = 'md', className, onClick, layoutId, disabled, title }: PillProps) => {
  const variants = {
    dark: 'bg-elevated text-white hover:bg-hover border border-white/5',
    yellow: 'bg-primary text-black hover:bg-primary-hover',
    red: 'bg-elevated text-danger border border-white/5 hover:bg-hover',
    purple: 'bg-fhe/10 text-fhe border border-fhe/20',
    green: 'bg-success/10 text-success border border-success/20',
    outline: 'bg-transparent border border-white/10 text-white hover:border-white/30',
  };

  const sizes = {
    sm: 'h-7 px-3 text-xs font-satoshi font-medium tracking-wider uppercase',
    md: 'h-10 px-5 text-sm font-satoshi font-bold',
    lg: 'h-12 px-8 text-base font-satoshi font-bold',
  };

  const Component = onClick ? motion.button : motion.div;

  return (
    <Component
      layoutId={layoutId}
      title={title}
      onClick={disabled ? undefined : onClick}
      whileHover={onClick && !disabled ? { scale: 1.04 } : {}}
      whileTap={onClick && !disabled ? { scale: 0.96 } : {}}
      className={cn(
        'relative rounded-full flex items-center justify-center whitespace-nowrap transition-colors duration-200',
        variants[variant],
        sizes[size],
        disabled && 'opacity-50 cursor-not-allowed hover:scale-100',
        className
      )}
    >
      {children}
    </Component>
  );
};

export const PlayCTA = ({ onClick, text = 'PLAY', className }: { onClick: () => void, text?: string, className?: string }) => (
  <motion.button
    onClick={onClick}
    className={cn("group flex items-center gap-3 text-white font-satoshi font-medium text-lg md:text-xl transition-colors hover:text-primary", className)}
  >
    <span className="text-primary text-sm">▶</span>
    {text}
    <motion.span 
      className="font-light"
      variants={{ hover: { x: 8 } }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      →
    </motion.span>
  </motion.button>
);
