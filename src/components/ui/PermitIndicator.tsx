import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore, PermitState } from '@/store/useGameStore';
import { useState, useCallback } from 'react';
import { useCofhe } from '@/hooks/useCofhe';

// ── Config per state ──────────────────────────────────────────────────
const STATE_CONFIG: Record<PermitState, {
  label: string;
  shortLabel: string;
  color: string;
  bg: string;
  border: string;
  glow: string;
  pulse: boolean;
  icon: string;
}> = {
  none: {
    label:      'No Permit',
    shortLabel: 'NO PERMIT',
    color:      'var(--color-danger)',
    bg:         'rgba(255,59,59,0.1)',
    border:     'rgba(255,59,59,0.3)',
    glow:       'rgba(255,59,59,0.4)',
    pulse:      true,
    icon:       '!',
  },
  signing: {
    label:      'Signing Permit...',
    shortLabel: 'SIGNING...',
    color:      'var(--color-fhe)',
    bg:         'rgba(179,102,255,0.1)',
    border:     'rgba(179,102,255,0.3)',
    glow:       'rgba(179,102,255,0.4)',
    pulse:      true,
    icon:       '*',
  },
  active: {
    label:      'Permit Active',
    shortLabel: 'PERMIT',
    color:      'var(--color-success)',
    bg:         'rgba(0,232,108,0.06)',
    border:     'rgba(0,232,108,0.18)',
    glow:       'rgba(0,232,108,0.4)',
    pulse:      false,
    icon:       'OK',
  },
  expiring: {
    label:      'Permit Expiring',
    shortLabel: 'EXPIRING',
    color:      'var(--color-deco-orange)',
    bg:         'rgba(255,140,66,0.1)',
    border:     'rgba(255,140,66,0.25)',
    glow:       'rgba(255,140,66,0.4)',
    pulse:      true,
    icon:       '!',
  },
  expired: {
    label:      'Permit Expired',
    shortLabel: 'EXPIRED',
    color:      'var(--color-danger)',
    bg:         'rgba(255,59,59,0.1)',
    border:     'rgba(255,59,59,0.3)',
    glow:       'rgba(255,59,59,0.4)',
    pulse:      true,
    icon:       '!',
  },
  error: {
    label:      'Permit Error',
    shortLabel: 'ERROR',
    color:      'var(--color-danger)',
    bg:         'rgba(255,59,59,0.1)',
    border:     'rgba(255,59,59,0.3)',
    glow:       'rgba(255,59,59,0.4)',
    pulse:      true,
    icon:       'X',
  },
};

// ── Hook: sign permit directly ────────────────────────────────────────
const useSignPermit = () => {
  const { ensurePermit, isReady } = useCofhe();
  const { permitStatus } = useGameStore();
  const [signing, setSigning] = useState(false);

  const signPermit = useCallback(async () => {
    if (!isReady || signing || permitStatus === 'signing') return;
    setSigning(true);
    try {
      await ensurePermit();
    } catch {
      // error handled inside ensurePermit
    }
    setSigning(false);
  }, [isReady, signing, permitStatus, ensurePermit]);

  return { signPermit, signing, canSign: isReady && permitStatus !== 'active' && permitStatus !== 'signing' };
};

// ── Compact badge (TopBar / BottomTabBar) ─────────────────────────────
export const PermitBadge = ({ className }: { className?: string }) => {
  const { permitStatus } = useGameStore();
  const { signPermit, canSign } = useSignPermit();
  const cfg = STATE_CONFIG[permitStatus];

  const handleClick = () => {
    if (canSign) {
      signPermit();
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`flex items-center gap-1.5 h-7 px-2.5 rounded-full font-mono text-[10px] tracking-widest uppercase transition-all hover:brightness-110 ${className ?? ''}`}
      style={{
        background: cfg.bg,
        border:     `1px solid ${cfg.border}`,
        color:      cfg.color,
        animation:  canSign ? 'neon-pulse 2s ease-in-out infinite' : 'none',
      }}
      title={canSign ? 'Click to sign FHE permit' : cfg.label}
    >
      <motion.div
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{
          background: cfg.color,
          boxShadow:  `0 0 6px ${cfg.glow}`,
        }}
        animate={cfg.pulse ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
        transition={cfg.pulse ? { duration: 1.5, repeat: Infinity } : {}}
      />
      <span className="hidden sm:inline">
        {canSign && permitStatus !== 'signing' ? 'SIGN PERMIT' : cfg.shortLabel}
      </span>
      <span className="sm:hidden">{cfg.icon}</span>
    </button>
  );
};

// ── Dot-only indicator (ultra compact, for mobile bottom bar) ─────────
export const PermitDot = () => {
  const { permitStatus } = useGameStore();
  const { signPermit, canSign } = useSignPermit();
  const cfg = STATE_CONFIG[permitStatus];

  return (
    <motion.div
      className="w-2 h-2 rounded-full cursor-pointer"
      style={{
        background: cfg.color,
        boxShadow: `0 0 6px ${cfg.glow}`,
      }}
      animate={cfg.pulse ? { scale: [1, 1.4, 1], opacity: [1, 0.5, 1] } : {}}
      transition={cfg.pulse ? { duration: 1.5, repeat: Infinity } : {}}
      title={canSign ? 'Tap to sign FHE permit' : cfg.label}
      onClick={() => canSign && signPermit()}
    />
  );
};

// ── Warning banner (PlayTab/HoldemTab, blocks game when no permit) ───
export const PermitWarningBanner = () => {
  const { permitStatus, permitError } = useGameStore();
  const { signPermit, canSign, signing } = useSignPermit();
  const needsAttention = permitStatus === 'none' || permitStatus === 'expired' || permitStatus === 'error';

  return (
    <AnimatePresence>
      {needsAttention && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full overflow-hidden mb-4"
        >
          <div
            className="flex flex-col sm:flex-row items-start sm:items-center gap-3 px-4 py-4 rounded-xl"
            style={{
              background: 'rgba(179,102,255,0.06)',
              border: '2px solid rgba(179,102,255,0.3)',
              boxShadow: '0 0 20px rgba(179,102,255,0.1)',
              animation: 'neon-pulse 3s ease-in-out infinite',
            }}
          >
            <motion.span
              className="text-2xl shrink-0"
              animate={{ rotate: [0, -10, 10, -10, 0], scale: [1, 1.1, 1] }}
              transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
            >
              🔑
            </motion.span>
            <div className="flex-1 min-w-0">
              <div className="font-satoshi text-sm font-bold" style={{ color: 'var(--color-fhe)' }}>
                {permitStatus === 'none' && 'FHE Permit Required'}
                {permitStatus === 'expired' && 'Permit Expired'}
                {permitStatus === 'error' && 'Permit Error'}
              </div>
              <div className="font-satoshi text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                {permitStatus === 'error' && permitError
                  ? permitError
                  : 'You need to sign a cryptographic permit to decrypt your cards. Click the button to open your wallet and sign.'}
              </div>
            </div>
            <button
              onClick={() => canSign && signPermit()}
              disabled={!canSign || signing}
              className="shrink-0 font-mono text-sm font-bold tracking-widest uppercase px-6 py-2.5 rounded-full transition-all hover:brightness-110 disabled:opacity-50"
              style={{
                background: 'var(--color-fhe)',
                color: '#000',
                boxShadow: '0 0 20px rgba(179,102,255,0.4)',
              }}
            >
              {signing || (permitStatus as string) === 'signing' ? 'SIGNING...' : 'SIGN PERMIT'}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ── Expiring soon toast (appears briefly when permit is about to expire) ─
export const PermitExpiryToast = () => {
  const { permitStatus } = useGameStore();
  const { signPermit, canSign } = useSignPermit();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || permitStatus !== 'expiring') return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-50 max-w-sm"
    >
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl"
        style={{
          background: 'rgba(20,20,20,0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,140,66,0.3)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 12px rgba(255,140,66,0.1)',
        }}
      >
        <span className="text-base">⏳</span>
        <div className="flex-1">
          <div className="font-satoshi text-sm font-medium" style={{ color: 'var(--color-deco-orange)' }}>
            Permit expiring soon
          </div>
          <div className="font-satoshi text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            Re-sign to keep decrypting cards
          </div>
        </div>
        {canSign && (
          <button
            onClick={signPermit}
            className="text-xs shrink-0 px-3 py-1.5 rounded-full font-mono font-bold uppercase tracking-wider transition-all hover:brightness-110"
            style={{
              background: 'rgba(255,140,66,0.15)',
              border: '1px solid rgba(255,140,66,0.3)',
              color: 'var(--color-deco-orange)',
            }}
          >
            RE-SIGN
          </button>
        )}
        <button
          onClick={() => setDismissed(true)}
          className="text-xs shrink-0 px-2 py-1 rounded transition-colors hover:bg-white/5"
          style={{ color: 'var(--color-text-muted)' }}
        >
          X
        </button>
      </div>
    </motion.div>
  );
};
