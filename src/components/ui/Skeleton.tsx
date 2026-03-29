import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export const Skeleton = ({
  className,
  width,
  height,
}: {
  className?: string;
  width?: string | number;
  height?: string | number;
}) => (
  <div
    className={cn('rounded-lg overflow-hidden relative', className)}
    style={{
      width,
      height,
      background: 'rgba(255,255,255,0.04)',
    }}
  >
    <motion.div
      className="absolute inset-0"
      style={{
        background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)',
      }}
      animate={{ x: ['-100%', '100%'] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
    />
  </div>
);

export const CardSkeleton = ({ count = 2 }: { count?: number }) => (
  <div className="flex gap-3 justify-center">
    {Array.from({ length: count }).map((_, i) => (
      <Skeleton
        key={i}
        className="w-[72px] h-[100px] sm:w-[80px] sm:h-[112px] md:w-[110px] md:h-[154px] rounded-xl"
      />
    ))}
  </div>
);

export const TableSkeleton = () => (
  <div className="space-y-4 p-6">
    <div className="flex justify-between items-center">
      <Skeleton width={160} height={24} />
      <Skeleton width={90} height={32} className="rounded-full" />
    </div>
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} height={56} className="w-full rounded-lg" />
      ))}
    </div>
  </div>
);

export const BalanceSkeleton = () => (
  <Skeleton width={80} height={20} className="rounded-full" />
);
