import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useCallback } from 'react';
import { create } from 'zustand';

type ToastType = 'success' | 'error' | 'info' | 'warning' | 'tx';

interface ToastItem {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
  txHash?: string;
  duration?: number;
}

interface ToastStore {
  toasts: ToastItem[];
  add: (toast: Omit<ToastItem, 'id'>) => void;
  remove: (id: number) => void;
}

let _nextId = 0;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  add: (toast) => set((s) => ({
    toasts: [...s.toasts.slice(-4), { ...toast, id: ++_nextId }],
  })),
  remove: (id) => set((s) => ({
    toasts: s.toasts.filter((t) => t.id !== id),
  })),
}));

export const toast = {
  success: (title: string, message?: string) =>
    useToastStore.getState().add({ type: 'success', title, message }),
  error: (title: string, message?: string) =>
    useToastStore.getState().add({ type: 'error', title, message }),
  info: (title: string, message?: string) =>
    useToastStore.getState().add({ type: 'info', title, message }),
  warning: (title: string, message?: string) =>
    useToastStore.getState().add({ type: 'warning', title, message }),
  tx: (title: string, txHash: string) =>
    useToastStore.getState().add({ type: 'tx', title, txHash, duration: 6000 }),
};

const TYPE_CONFIG: Record<ToastType, { icon: string; color: string; bg: string; border: string }> = {
  success: {
    icon: '✓',
    color: '#00E86C',
    bg: 'rgba(0,232,108,0.08)',
    border: 'rgba(0,232,108,0.2)',
  },
  error: {
    icon: '✕',
    color: '#FF3B3B',
    bg: 'rgba(255,59,59,0.08)',
    border: 'rgba(255,59,59,0.2)',
  },
  info: {
    icon: 'i',
    color: '#5B9EFF',
    bg: 'rgba(91,158,255,0.08)',
    border: 'rgba(91,158,255,0.2)',
  },
  warning: {
    icon: '!',
    color: '#FFE03D',
    bg: 'rgba(255,224,61,0.08)',
    border: 'rgba(255,224,61,0.2)',
  },
  tx: {
    icon: '⛓',
    color: '#B366FF',
    bg: 'rgba(179,102,255,0.08)',
    border: 'rgba(179,102,255,0.2)',
  },
};

const ToastItem = ({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) => {
  const cfg = TYPE_CONFIG[item.type];
  const dur = item.duration ?? 4000;

  useEffect(() => {
    const t = setTimeout(onDismiss, dur);
    return () => clearTimeout(t);
  }, [dur, onDismiss]);

  const etherscanUrl = item.txHash
    ? `https://sepolia.etherscan.io/tx/${item.txHash}`
    : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="relative rounded-xl px-4 py-3 flex items-start gap-3 max-w-[360px] backdrop-blur-md cursor-pointer"
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03)`,
      }}
      onClick={onDismiss}
    >
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 font-mono text-xs font-bold mt-0.5"
        style={{ background: cfg.border, color: cfg.color }}
      >
        {cfg.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-mono text-xs font-bold tracking-wider" style={{ color: cfg.color }}>
          {item.title}
        </div>
        {item.message && (
          <div className="font-satoshi text-[11px] mt-0.5 opacity-70 text-white truncate">
            {item.message}
          </div>
        )}
        {etherscanUrl && (
          <a
            href={etherscanUrl}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[10px] mt-1 inline-block transition-colors hover:underline"
            style={{ color: cfg.color }}
            onClick={(e) => e.stopPropagation()}
          >
            View on Etherscan ↗
          </a>
        )}
      </div>

      <motion.div
        className="absolute bottom-0 left-0 h-[2px] rounded-b-xl"
        style={{ background: cfg.color }}
        initial={{ width: '100%' }}
        animate={{ width: '0%' }}
        transition={{ duration: dur / 1000, ease: 'linear' }}
      />
    </motion.div>
  );
};

export const ToastContainer = () => {
  const { toasts, remove } = useToastStore();

  return (
    <div className="fixed bottom-24 md:bottom-6 right-4 z-[100] flex flex-col gap-2 items-end">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <ToastItem key={t.id} item={t} onDismiss={() => remove(t.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
};
