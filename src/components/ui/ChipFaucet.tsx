/**
 * ChipFaucet — appears in the lobby when balance < 200.
 * Calls claimFaucet() on-chain and plays a chip-rain animation on success.
 */
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWriteContract, usePublicClient, useAccount } from 'wagmi';
import { useGameStore } from '@/store/useGameStore';
import { CONTRACT_ADDRESS, CIPHER_POKER_ABI } from '@/config/contract';

const CHIP_COLORS = ['#FFE03D', '#FF8C42', '#B366FF', '#39FF14', '#4D7CFF'];

const Chip = ({ x, delay }: { x: number; delay: number }) => (
  <motion.div
    className="absolute w-5 h-5 rounded-full border-2 text-[10px] flex items-center justify-center font-bold select-none pointer-events-none"
    style={{
      left:         `calc(50% + ${x}px)`,
      top:          0,
      background:   CHIP_COLORS[Math.abs(x) % CHIP_COLORS.length],
      borderColor:  'rgba(0,0,0,0.3)',
      color:        'rgba(0,0,0,0.6)',
    }}
    initial={{ y: 0, opacity: 1, scale: 0.8 }}
    animate={{ y: -60 - Math.abs(x) * 0.3, opacity: 0, scale: 1.2 }}
    transition={{ duration: 0.9, delay, ease: 'easeOut' }}
  >
    ◆
  </motion.div>
);

const FAUCET_THRESHOLD = 200;
const CHIPS_GRANTED   = 1000;

export const ChipFaucet = () => {
  const { balance, setBalance } = useGameStore();
  const { isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const [busy, setBusy]           = useState(false);
  const [showChips, setShowChips] = useState(false);
  const [success, setSuccess]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const contractDeployed = CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000';
  const canClaim         = isConnected && contractDeployed && balance < FAUCET_THRESHOLD && !busy;

  const claim = useCallback(async () => {
    if (!canClaim) return;
    setBusy(true);
    setError(null);
    try {
      const hash = await writeContractAsync({
        address:      CONTRACT_ADDRESS,
        abi:          CIPHER_POKER_ABI,
        functionName: 'claimFaucet',
        args:         [],
      } as any);
      await publicClient!.waitForTransactionReceipt({ hash });
      setBalance(CHIPS_GRANTED);
      setSuccess(true);
      setShowChips(true);
      setTimeout(() => setShowChips(false), 1200);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transaction failed';
      setError(msg.slice(0, 80));
    } finally {
      setBusy(false);
    }
  }, [canClaim, writeContractAsync, publicClient, setBalance, contractDeployed]);

  if (balance >= FAUCET_THRESHOLD) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="relative flex flex-col items-center gap-2 w-full max-w-xs mx-auto mt-4"
    >
      {/* Chip rain */}
      <AnimatePresence>
        {showChips && (
          <div className="absolute inset-0 pointer-events-none overflow-visible z-10">
            {[-48, -28, -10, 10, 30, 50].map((x, i) => (
              <Chip key={i} x={x} delay={i * 0.07} />
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* Low balance hint */}
      <div
        className="text-center px-4 py-2 rounded-xl font-satoshi text-xs"
        style={{ color: 'var(--color-text-muted)', background: 'rgba(255,140,66,0.06)', border: '1px solid rgba(255,140,66,0.15)' }}
      >
        Low chips — only {balance} left
      </div>

      {/* Claim button */}
      <motion.button
        onClick={claim}
        disabled={!canClaim || success}
        whileTap={{ scale: 0.96 }}
        className="w-full h-11 rounded-full font-mono text-xs tracking-widest uppercase font-bold transition-all disabled:opacity-40"
        style={success ? {
          background: 'rgba(57,255,20,0.12)',
          border:     '1px solid rgba(57,255,20,0.35)',
          color:      'var(--color-success)',
        } : {
          background: 'rgba(255,224,61,0.1)',
          border:     '1px solid rgba(255,224,61,0.3)',
          color:      'var(--color-primary)',
          boxShadow:  '0 0 16px rgba(255,224,61,0.08)',
        }}
      >
        {busy    ? 'CLAIMING…' :
         success ? `✓ +${CHIPS_GRANTED} CHIPS` :
                   'GET 1000 CHIPS'}
      </motion.button>

      {error && (
        <p className="font-mono text-[10px] text-center" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}
    </motion.div>
  );
};
