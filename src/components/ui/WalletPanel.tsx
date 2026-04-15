/**
 * WalletPanel — real-money deposit / withdraw panel.
 *
 * Layout:
 *   • Balance summary: ETH + USDT free balances with USD equivalent
 *   • Locked funds indicator (disabled withdraw tooltip)
 *   • Deposit tab: token selector, amount input, Max button, confirm
 *   • Withdraw tab: same, but capped to free balance
 *   • Live USD equivalent label below every amount input
 *   • TX status: idle → pending → confirmed / error
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, useBalance } from 'wagmi';
import { useVault } from '@/hooks/useVault';
import {
  useVaultStore,
  formatEth, formatUsdt, formatUsd,
  usdToEthWei, usdToUsdt,
  ethWeiToUsd, usdtToUsd,
  type VaultToken,
} from '@/store/useVaultStore';
import { ETH_TOKEN, USDT_ADDRESS, VAULT_DEPLOYED } from '@/config/vault';

// ─── TX status ────────────────────────────────────────────────────────────────

type TxStatus = 'idle' | 'pending' | 'confirmed' | 'error';

// ─── Token toggle ─────────────────────────────────────────────────────────────

const TokenTab = ({
  token, selected, onSelect,
}: { token: 'ETH' | 'USDT'; selected: boolean; onSelect: () => void }) => (
  <button
    onClick={onSelect}
    className="flex-1 py-2 font-mono text-xs tracking-widest uppercase transition-all rounded-lg"
    style={{
      background: selected ? 'rgba(255,224,61,0.1)' : 'transparent',
      border:     selected ? '1px solid rgba(255,224,61,0.3)' : '1px solid rgba(255,255,255,0.06)',
      color:      selected ? 'var(--color-primary)' : 'var(--color-text-muted)',
    }}
  >
    {token}
  </button>
);

// ─── Amount input with USD equivalent ────────────────────────────────────────

const AmountInput = ({
  value,
  onChange,
  onMax,
  maxLabel,
  usdEquiv,
  disabled,
  placeholder,
}: {
  value:       string;
  onChange:    (v: string) => void;
  onMax:       () => void;
  maxLabel:    string;
  usdEquiv:    string;
  disabled?:   boolean;
  placeholder: string;
}) => (
  <div className="flex flex-col gap-1.5">
    <div
      className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border:     '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <input
        type="number"
        min="0"
        step="any"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="flex-1 bg-transparent font-mono text-sm outline-none disabled:opacity-40"
        style={{ color: 'white' }}
      />
      <button
        onClick={onMax}
        disabled={disabled}
        className="font-mono text-[9px] tracking-widest uppercase px-2 py-1 rounded-md transition-colors disabled:opacity-30"
        style={{
          background: 'rgba(255,224,61,0.08)',
          border:     '1px solid rgba(255,224,61,0.2)',
          color:      'var(--color-primary)',
        }}
      >
        MAX
      </button>
    </div>
    <span className="font-mono text-[10px] pl-1" style={{ color: 'var(--color-text-dark)' }}>
      {usdEquiv} · Max: {maxLabel}
    </span>
  </div>
);

// ─── TX status badge ──────────────────────────────────────────────────────────

const TxBadge = ({ status, error }: { status: TxStatus; error: string }) => {
  if (status === 'idle') return null;
  const cfg = {
    pending:   { color: 'var(--color-primary)',  text: 'Transaction pending…' },
    confirmed: { color: 'var(--color-success)',  text: '✓ Confirmed — balance updated' },
    error:     { color: 'var(--color-danger)',   text: error || 'Transaction failed' },
  }[status];
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="px-3 py-2 rounded-xl font-mono text-[10px] leading-snug"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border:     `1px solid ${cfg.color}33`,
        color:      cfg.color,
      }}
    >
      {cfg.text}
    </motion.div>
  );
};

// ─── Balance row ──────────────────────────────────────────────────────────────

const BalanceRow = ({
  label, amount, usdEquiv, locked,
}: { label: string; amount: string; usdEquiv: string; locked?: string }) => (
  <div className="flex items-center justify-between py-1.5">
    <span className="font-mono text-xs tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
      {label}
    </span>
    <div className="flex flex-col items-end gap-0.5">
      <span className="font-mono text-sm font-bold" style={{ color: 'white' }}>{amount}</span>
      <span className="font-mono text-[10px]" style={{ color: 'var(--color-text-dark)' }}>
        {usdEquiv}
        {locked && locked !== '0' && (
          <span style={{ color: 'var(--color-deco-orange)' }}> · {locked} locked</span>
        )}
      </span>
    </div>
  </div>
);

// ─── Main panel ───────────────────────────────────────────────────────────────

export const WalletPanel = () => {
  const { address, isConnected } = useAccount();
  const { depositETH, depositUSDT, withdraw, refresh } = useVault();

  const {
    ethFree, ethLocked, usdtFree, usdtLocked,
    ethUsdPrice, priceStale,
    walletPanelOpen, setWalletPanelOpen,
    hasLockedFunds,
  } = useVaultStore();

  // Wallet's actual ETH balance (for Max button on deposit)
  const { data: walletEthBalance } = useBalance({ address });

  const [activeTab,  setActiveTab]  = useState<'deposit' | 'withdraw'>('deposit');
  const [tokenChoice, setTokenChoice] = useState<'ETH' | 'USDT'>('ETH');
  const [amount,     setAmount]     = useState('');
  const [txStatus,   setTxStatus]   = useState<TxStatus>('idle');
  const [txError,    setTxError]    = useState('');

  const vaultToken: VaultToken = tokenChoice === 'ETH' ? ETH_TOKEN : USDT_ADDRESS;

  // Reset on tab/token change
  useEffect(() => { setAmount(''); setTxStatus('idle'); setTxError(''); }, [activeTab, tokenChoice]);

  // ── Max helpers ─────────────────────────────────────────────────────────────
  const handleMax = useCallback(() => {
    if (activeTab === 'deposit') {
      if (tokenChoice === 'ETH') {
        // Leave 0.01 ETH for gas
        const maxWei = walletEthBalance?.value ?? 0n;
        const gas    = 10n ** 16n; // 0.01 ETH
        const usable = maxWei > gas ? maxWei - gas : 0n;
        setAmount(formatEth(usable));
      } else {
        // USDT: user's USDT balance (would need separate read; show 0 placeholder)
        setAmount('0');
      }
    } else {
      // Withdraw: max = free balance
      if (tokenChoice === 'ETH')  setAmount(formatEth(ethFree));
      else                        setAmount(formatUsdt(usdtFree));
    }
  }, [activeTab, tokenChoice, walletEthBalance, ethFree, usdtFree]);

  // ── USD equivalent ──────────────────────────────────────────────────────────
  const usdEquiv = (() => {
    const n = parseFloat(amount);
    if (!n || isNaN(n)) return '≈ $0.00';
    try {
      if (tokenChoice === 'ETH') {
        const wei = BigInt(Math.round(n * 1e18));
        return formatUsd(ethWeiToUsd(wei, ethUsdPrice));
      } else {
        const units = BigInt(Math.round(n * 1e6));
        return formatUsd(usdtToUsd(units));
      }
    } catch { return '≈ $0.00'; }
  })();

  // ── Max labels (free balance) ────────────────────────────────────────────────
  const maxLabel = (() => {
    if (activeTab === 'withdraw') {
      return tokenChoice === 'ETH'
        ? `${formatEth(ethFree)} ETH`
        : `${formatUsdt(usdtFree)} USDT`;
    }
    return tokenChoice === 'ETH'
      ? `${formatEth(walletEthBalance?.value ?? 0n)} ETH (wallet)`
      : '— (check wallet)';
  })();

  // ── Confirm handler ──────────────────────────────────────────────────────────
  const handleConfirm = useCallback(async () => {
    const n = parseFloat(amount);
    if (!n || isNaN(n) || n <= 0) return;
    setTxStatus('pending');
    setTxError('');

    try {
      if (activeTab === 'deposit') {
        if (tokenChoice === 'ETH') {
          const wei = BigInt(Math.round(n * 1e18));
          await depositETH(wei);
        } else {
          const units = BigInt(Math.round(n * 1e6));
          await depositUSDT(units);
        }
      } else {
        // Withdraw — check locked
        if (hasLockedFunds()) {
          setTxStatus('error');
          setTxError('Funds locked in active game — finish the hand first');
          return;
        }
        const tokenAmount = tokenChoice === 'ETH'
          ? BigInt(Math.round(n * 1e18))
          : BigInt(Math.round(n * 1e6));
        await withdraw(vaultToken, tokenAmount);
      }
      setTxStatus('confirmed');
      setAmount('');
    } catch (err) {
      setTxStatus('error');
      setTxError(err instanceof Error ? err.message : 'Transaction failed');
    }
  }, [amount, activeTab, tokenChoice, depositETH, depositUSDT, withdraw, vaultToken, hasLockedFunds]);

  const isWithdrawLocked = activeTab === 'withdraw' && hasLockedFunds();

  if (!walletPanelOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)' }}
      onClick={() => setWalletPanelOpen(false)}
    >
      <motion.div
        initial={{ y: 40, scale: 0.97 }}
        animate={{ y: 0,  scale: 1    }}
        exit={{    y: 40, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{
          background: 'rgba(8,8,16,0.98)',
          border:     '1px solid rgba(255,255,255,0.09)',
          boxShadow:  '0 24px 60px rgba(0,0,0,0.8)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
        >
          <div className="flex items-center gap-2.5">
            <motion.div
              className="w-2 h-2 rounded-full"
              style={{ background: VAULT_DEPLOYED ? 'var(--color-success)' : '#888' }}
              animate={VAULT_DEPLOYED ? { opacity: [1, 0.4, 1] } : {}}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <span className="font-clash text-base tracking-wider uppercase">
              Vault Balance
            </span>
            {priceStale && (
              <span
                className="font-mono text-[9px] tracking-widest uppercase px-2 py-0.5 rounded-full"
                style={{
                  background: 'rgba(255,59,59,0.1)',
                  border:     '1px solid rgba(255,59,59,0.3)',
                  color:      'var(--color-danger)',
                }}
              >
                PRICE STALE
              </span>
            )}
          </div>
          <button
            onClick={() => setWalletPanelOpen(false)}
            className="font-mono text-xs px-3 py-1 rounded-full transition-colors"
            style={{ color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            ✕
          </button>
        </div>

        {/* Balance summary */}
        <div
          className="px-5 pt-4 pb-3 space-y-1"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
        >
          {!isConnected ? (
            <p className="font-mono text-xs text-center py-4" style={{ color: 'var(--color-text-dark)' }}>
              Connect wallet to view balance
            </p>
          ) : !VAULT_DEPLOYED ? (
            <p className="font-mono text-xs text-center py-4" style={{ color: 'var(--color-text-muted)' }}>
              Vault contract not deployed yet
            </p>
          ) : (
            <>
              <BalanceRow
                label="ETH"
                amount={`${formatEth(ethFree)} ETH`}
                usdEquiv={formatUsd(ethWeiToUsd(ethFree, ethUsdPrice))}
                locked={formatEth(ethLocked)}
              />
              <BalanceRow
                label="USDT"
                amount={`${formatUsdt(usdtFree)} USDT`}
                usdEquiv={formatUsd(usdtToUsd(usdtFree))}
                locked={formatUsdt(usdtLocked)}
              />
              {/* ETH/USD rate */}
              <div className="flex justify-between pt-1">
                <span className="font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
                  Rate
                </span>
                <span className="font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  1 ETH = {formatUsd(ethUsdPrice)}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Deposit / Withdraw tabs */}
        <div className="px-5 pt-4 pb-5 flex flex-col gap-4">
          {/* Tab selector */}
          <div className="flex gap-2">
            {(['deposit', 'withdraw'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="flex-1 py-2 rounded-xl font-mono text-xs tracking-widest uppercase font-bold transition-all"
                style={{
                  background: activeTab === tab ? 'rgba(255,224,61,0.1)' : 'rgba(255,255,255,0.02)',
                  border:     activeTab === tab
                    ? '1px solid rgba(255,224,61,0.35)'
                    : '1px solid rgba(255,255,255,0.06)',
                  color: activeTab === tab ? 'var(--color-primary)' : 'var(--color-text-muted)',
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Token selector */}
          <div className="flex gap-2">
            <TokenTab token="ETH"  selected={tokenChoice === 'ETH'}  onSelect={() => setTokenChoice('ETH')}  />
            <TokenTab token="USDT" selected={tokenChoice === 'USDT'} onSelect={() => setTokenChoice('USDT')} />
          </div>

          {/* Amount input */}
          <AmountInput
            value={amount}
            onChange={setAmount}
            onMax={handleMax}
            maxLabel={maxLabel}
            usdEquiv={usdEquiv}
            disabled={txStatus === 'pending' || !isConnected || !VAULT_DEPLOYED}
            placeholder={tokenChoice === 'ETH' ? '0.000 ETH' : '0.00 USDT'}
          />

          {/* Withdraw locked warning */}
          {isWithdrawLocked && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="px-3 py-2 rounded-xl font-mono text-[10px] flex items-center gap-2"
              style={{
                background: 'rgba(255,140,66,0.08)',
                border:     '1px solid rgba(255,140,66,0.25)',
                color:      'var(--color-deco-orange)',
              }}
            >
              <span className="text-base">⚠</span>
              Funds locked in active game — finish the hand first
            </motion.div>
          )}

          {/* TX status */}
          <AnimatePresence>
            {txStatus !== 'idle' && <TxBadge status={txStatus} error={txError} />}
          </AnimatePresence>

          {/* Confirm button */}
          <motion.button
            onClick={handleConfirm}
            disabled={
              txStatus === 'pending' ||
              !isConnected ||
              !VAULT_DEPLOYED ||
              !amount ||
              parseFloat(amount) <= 0 ||
              isWithdrawLocked
            }
            whileTap={{ scale: 0.97 }}
            className="w-full h-12 rounded-full font-mono text-xs tracking-widest uppercase font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: txStatus === 'confirmed'
                ? 'rgba(57,255,20,0.12)'
                : 'rgba(255,224,61,0.1)',
              border: txStatus === 'confirmed'
                ? '1px solid rgba(57,255,20,0.35)'
                : '1px solid rgba(255,224,61,0.3)',
              color: txStatus === 'confirmed'
                ? 'var(--color-success)'
                : 'var(--color-primary)',
            }}
          >
            {txStatus === 'pending'   ? 'PROCESSING…'             :
             txStatus === 'confirmed' ? '✓ DONE'                  :
             activeTab === 'deposit'  ? `DEPOSIT ${tokenChoice}`  :
                                        `WITHDRAW ${tokenChoice}` }
          </motion.button>

          {/* Vault note */}
          <p className="font-mono text-[9px] text-center" style={{ color: 'rgba(255,255,255,0.15)' }}>
            Non-custodial · funds withdrawable at any time
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
};
