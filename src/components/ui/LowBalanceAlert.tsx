import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/useGameStore';
import { useAccount } from 'wagmi';
import { claimLowBalanceBonus } from '@/lib/db';
import { isSupabaseEnabled } from '@/config/supabase';

const LOW_BALANCE_THRESHOLD = 100;

export const LowBalanceAlert = () => {
  const balance    = useGameStore(s => s.balance);
  const playState  = useGameStore(s => s.playState);
  const setBalance = useGameStore(s => s.setBalance);
  const { address, isConnected } = useAccount();

  const [visible,  setVisible]  = useState(false);
  const [claimed,  setClaimed]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [denied,   setDenied]   = useState(false); // server said no more claims

  const isIdle = playState === 'lobby' || playState === 'result';

  useEffect(() => {
    if (balance <= LOW_BALANCE_THRESHOLD && isIdle && !claimed && !denied) {
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
    }
  }, [balance, isIdle, claimed, denied]);

  const handleClaim = useCallback(async () => {
    if (!isConnected || !address || loading) return;
    setLoading(true);

    if (isSupabaseEnabled) {
      const { allowed, newBalance } = await claimLowBalanceBonus(address);
      if (allowed) {
        setBalance(newBalance);
        setClaimed(true);
        setVisible(false);
      } else {
        setDenied(true);
        setVisible(false);
      }
    } else {
      // Fallback: allow once per session when offline
      const key = `cofhe-lba-${address}`;
      const used = parseInt(sessionStorage.getItem(key) ?? '0', 10);
      if (used < 2) {
        sessionStorage.setItem(key, String(used + 1));
        setBalance(1000);
        setClaimed(true);
        setVisible(false);
      } else {
        setDenied(true);
        setVisible(false);
      }
    }
    setLoading(false);
  }, [isConnected, address, loading, setBalance]);

  const handleDismiss = useCallback(() => setVisible(false), []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          className="fixed bottom-24 md:bottom-8 left-1/2 z-[150]"
          style={{ transform: 'translateX(-50%)', maxWidth: 480, width: 'calc(100% - 32px)' }}
        >
          <div
            className="flex items-center gap-4 px-5 py-4 rounded-2xl"
            style={{
              background: 'linear-gradient(135deg, #1A0D0D 0%, #0F0A10 100%)',
              border: '1px solid rgba(255,59,59,0.3)',
              boxShadow: '0 8px 40px rgba(255,59,59,0.15)',
            }}
          >
            <span style={{ fontSize: 28 }}>💸</span>
            <div className="flex-1 min-w-0">
              <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: '0.06em', color: 'var(--color-danger)', marginBottom: 2 }}>
                Low Balance — {balance} chips left
              </div>
              <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 400, fontSize: 11, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.45)' }}>
                {isConnected ? 'Claim free chips to keep playing' : 'Connect wallet to claim chips'}
              </div>
            </div>
            <button
              onClick={handleClaim}
              disabled={loading || !isConnected}
              aria-label="Claim 1000 free chips"
              className="shrink-0 px-4 py-2 rounded-full font-mono text-[11px] font-bold tracking-widest uppercase transition-all disabled:opacity-50"
              style={{ background: 'var(--color-primary)', color: '#000', boxShadow: '0 0 16px rgba(255,224,61,0.3)' }}
            >
              {loading ? '...' : 'Claim 1000 ✦'}
            </button>
            <button
              onClick={handleDismiss}
              aria-label="Dismiss alert"
              className="shrink-0 font-mono text-[18px] transition-opacity hover:opacity-60"
              style={{ color: 'rgba(255,255,255,0.2)' }}
            >
              ×
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
