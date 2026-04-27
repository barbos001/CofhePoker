import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, useBalance } from 'wagmi';
import { useVault } from '@/hooks/useVault';
import {
  useVaultStore, VaultTxRecord,
  formatEth, formatUsdt, formatUsd,
  ethWeiToUsd, usdtToUsd,
  type VaultToken,
} from '@/store/useVaultStore';
import { ETH_TOKEN, USDT_ADDRESS, VAULT_DEPLOYED } from '@/config/vault';

const cp = (w: number, s: number | string, sp = '0.03em') => ({
  fontFamily: "'Chakra Petch', sans-serif", fontWeight: w, fontSize: s, letterSpacing: sp,
});

const ETHERSCAN = 'https://sepolia.etherscan.io/tx/';
const GAS_ESTIMATES: Record<string, number> = { deposit_ETH: 60_000, deposit_USDT: 80_000, withdraw: 55_000 };
const GAS_PRICE_GWEI = 2; // rough Sepolia estimate

function estimateGasUsd(action: string, ethUsdPrice: bigint): string {
  const gasUnits = GAS_ESTIMATES[action] ?? 60_000;
  const gasCostWei = BigInt(gasUnits) * BigInt(GAS_PRICE_GWEI) * 10n ** 9n;
  const usd = ethWeiToUsd(gasCostWei, ethUsdPrice);
  return formatUsd(usd);
}

// ── Price refresh countdown ───────────────────────────────────────────────────
const PRICE_REFRESH_SECS = 30;
const PriceRefreshBadge = () => {
  const { priceStale, priceLastFetch, ethUsdPrice } = useVaultStore();
  const [secs, setSecs] = useState(PRICE_REFRESH_SECS);

  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - priceLastFetch) / 1000);
      setSecs(Math.max(0, PRICE_REFRESH_SECS - elapsed));
    }, 1000);
    return () => clearInterval(id);
  }, [priceLastFetch]);

  const pctLeft = (secs / PRICE_REFRESH_SECS) * 100;
  return (
    <div className="flex items-center gap-2">
      <span style={{ ...cp(400, 10, '0.04em'), color: 'rgba(255,255,255,0.3)' }}>
        1 ETH = <span style={{ color: priceStale ? 'var(--color-danger)' : 'rgba(255,255,255,0.6)' }}>{formatUsd(ethUsdPrice)}</span>
      </span>
      <div className="w-8 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <motion.div className="h-full rounded-full"
          style={{ background: 'rgba(0,191,255,0.6)', width: `${pctLeft}%` }} />
      </div>
      <span style={{ ...cp(400, 9, '0.08em'), color: 'rgba(255,255,255,0.2)' }}>{secs}s</span>
    </div>
  );
};

// ── TX history row ────────────────────────────────────────────────────────────
const TxRow = ({ tx }: { tx: VaultTxRecord }) => {
  const isDeposit = tx.type === 'deposit';
  const date = new Date(tx.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="flex items-center gap-3 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
        style={{ background: isDeposit ? 'rgba(0,232,108,0.1)' : 'rgba(255,140,66,0.1)' }}>
        <span style={{ fontSize: 12 }}>{isDeposit ? '↓' : '↑'}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div style={{ ...cp(600, 12, '0.04em'), color: 'white' }}>
          {isDeposit ? '+' : '-'}{tx.amount} {tx.token}
        </div>
        <div style={{ ...cp(400, 10, '0.04em'), color: 'rgba(255,255,255,0.3)' }}>{date}</div>
      </div>
      <div className="text-right">
        <div style={{ ...cp(500, 11), color: isDeposit ? 'var(--color-success)' : 'var(--color-deco-orange)' }}>
          {tx.usdValue}
        </div>
        {tx.txHash && (
          <a href={`${ETHERSCAN}${tx.txHash}`} target="_blank" rel="noopener noreferrer"
            style={{ ...cp(400, 9, '0.06em'), color: 'rgba(0,191,255,0.5)', textDecoration: 'underline' }}>
            {tx.txHash.slice(0, 8)}…
          </a>
        )}
      </div>
    </div>
  );
};

// ── Main panel ────────────────────────────────────────────────────────────────
type WizardStep = 'action' | 'amount' | 'review' | 'receipt';
type TxStatus   = 'idle' | 'pending' | 'confirmed' | 'error';

export const WalletPanel = () => {
  const { address, isConnected } = useAccount();
  const { depositETH, depositUSDT, withdraw, refresh } = useVault();

  const {
    ethFree, ethLocked, usdtFree, usdtLocked,
    ethUsdPrice, priceStale,
    walletPanelOpen, setWalletPanelOpen,
    hasLockedFunds,
    txHistory, rakePaidTotal,
    addTxRecord,
  } = useVaultStore();

  const { data: walletEthBalance } = useBalance({ address });

  // Wizard state
  const [activeTab,    setActiveTab]    = useState<'vault' | 'history'>('vault');
  const [action,       setAction]       = useState<'deposit' | 'withdraw'>('deposit');
  const [tokenChoice,  setTokenChoice]  = useState<'ETH' | 'USDT'>('ETH');
  const [amount,       setAmount]       = useState('');
  const [step,         setStep]         = useState<WizardStep>('action');
  const [txStatus,     setTxStatus]     = useState<TxStatus>('idle');
  const [txError,      setTxError]      = useState('');
  const [lastTxHash,   setLastTxHash]   = useState('');

  const vaultToken: VaultToken = tokenChoice === 'ETH' ? ETH_TOKEN : USDT_ADDRESS;

  // Reset wizard on close
  useEffect(() => {
    if (!walletPanelOpen) {
      setStep('action'); setAmount(''); setTxStatus('idle'); setTxError(''); setLastTxHash('');
    }
  }, [walletPanelOpen]);

  // ── Derived values ──────────────────────────────────────────────────────────
  const usdEquiv = (() => {
    const n = parseFloat(amount);
    if (!n || isNaN(n)) return '≈ $0.00';
    try {
      if (tokenChoice === 'ETH') return formatUsd(ethWeiToUsd(BigInt(Math.round(n * 1e18)), ethUsdPrice));
      return formatUsd(usdtToUsd(BigInt(Math.round(n * 1e6))));
    } catch { return '≈ $0.00'; }
  })();

  const gasEstimate = estimateGasUsd(`${action}_${tokenChoice}`, ethUsdPrice);

  const handleMax = useCallback(() => {
    if (action === 'deposit') {
      if (tokenChoice === 'ETH') {
        const maxWei = walletEthBalance?.value ?? 0n;
        const gas = 10n ** 16n;
        setAmount(formatEth(maxWei > gas ? maxWei - gas : 0n));
      } else setAmount('0');
    } else {
      setAmount(tokenChoice === 'ETH' ? formatEth(ethFree) : formatUsdt(usdtFree));
    }
  }, [action, tokenChoice, walletEthBalance, ethFree, usdtFree]);

  const handleConfirm = useCallback(async () => {
    const n = parseFloat(amount);
    if (!n || isNaN(n) || n <= 0) return;
    setTxStatus('pending');
    setTxError('');
    try {
      let hash = '';
      if (action === 'deposit') {
        if (tokenChoice === 'ETH') {
          const wei = BigInt(Math.round(n * 1e18));
          hash = await depositETH(wei);
        } else {
          const units = BigInt(Math.round(n * 1e6));
          hash = await depositUSDT(units);
        }
      } else {
        if (hasLockedFunds()) throw new Error('Funds locked — finish the hand first');
        const amt = tokenChoice === 'ETH' ? BigInt(Math.round(n * 1e18)) : BigInt(Math.round(n * 1e6));
        hash = await withdraw(vaultToken, amt);
      }
      setLastTxHash(hash ?? '');
      setTxStatus('confirmed');

      // Record in history
      addTxRecord({
        id:        Date.now().toString(),
        type:      action,
        token:     tokenChoice,
        amount:    amount,
        usdValue:  usdEquiv,
        txHash:    hash ?? '',
        timestamp: Date.now(),
        status:    'confirmed',
      });

      setStep('receipt');
    } catch (err) {
      setTxStatus('error');
      setTxError(err instanceof Error ? err.message : 'Transaction failed');
    }
  }, [amount, action, tokenChoice, depositETH, depositUSDT, withdraw, vaultToken, hasLockedFunds, usdEquiv, addTxRecord]);

  if (!walletPanelOpen) return null;

  const isWithdrawLocked = action === 'withdraw' && hasLockedFunds();
  const rakeEth = Number(rakePaidTotal) / 1e18;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(12px)' }}
      onClick={() => setWalletPanelOpen(false)}
    >
      <motion.div
        initial={{ y: 40, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 40, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: 'rgba(8,8,16,0.99)', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 24px 60px rgba(0,0,0,0.8)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2.5">
            <motion.div className="w-2 h-2 rounded-full"
              style={{ background: VAULT_DEPLOYED ? 'var(--color-success)' : '#888' }}
              animate={VAULT_DEPLOYED ? { opacity: [1, 0.4, 1] } : {}}
              transition={{ duration: 2, repeat: Infinity }} />
            <span style={{ ...cp(700, 15, '0.1em'), color: 'white', textTransform: 'uppercase' }}>Vault</span>
          </div>
          <div className="flex items-center gap-3">
            <PriceRefreshBadge />
            <button onClick={() => setWalletPanelOpen(false)}
              style={{ ...cp(400, 11), color: 'rgba(255,255,255,0.3)' }}>✕</button>
          </div>
        </div>

        {/* Panel tabs */}
        <div className="flex px-5 pt-3 gap-2">
          {(['vault', 'history'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className="flex-1 py-2 rounded-xl font-mono text-[11px] tracking-widest uppercase font-bold transition-all"
              style={{
                background: activeTab === t ? 'rgba(255,224,61,0.1)' : 'rgba(255,255,255,0.03)',
                border: activeTab === t ? '1px solid rgba(255,224,61,0.3)' : '1px solid rgba(255,255,255,0.06)',
                color: activeTab === t ? 'var(--color-primary)' : 'rgba(255,255,255,0.35)',
              }}>
              {t === 'vault' ? 'Deposit / Withdraw' : `History (${txHistory.length})`}
            </button>
          ))}
        </div>

        {activeTab === 'history' ? (
          /* ── Transaction history ────────────────────────────────────────── */
          <div className="px-5 py-4 max-h-[400px] overflow-y-auto">
            {/* Rake tracker */}
            {rakeEth > 0 && (
              <div className="flex items-center justify-between py-2 mb-3 px-3 rounded-xl"
                style={{ background: 'rgba(255,140,66,0.06)', border: '1px solid rgba(255,140,66,0.12)' }}>
                <span style={{ ...cp(400, 11), color: 'rgba(255,255,255,0.4)' }}>Total Rake Paid</span>
                <span style={{ ...cp(600, 12), color: 'var(--color-deco-orange)' }}>
                  {rakeEth.toFixed(5)} ETH · {formatUsd(ethWeiToUsd(rakePaidTotal, ethUsdPrice))}
                </span>
              </div>
            )}
            {txHistory.length === 0 ? (
              <p className="text-center py-8 font-mono text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
                No transactions yet
              </p>
            ) : (
              txHistory.map(tx => <TxRow key={tx.id} tx={tx} />)
            )}
          </div>
        ) : (
          /* ── Vault wizard ──────────────────────────────────────────────── */
          <div className="px-5 pt-4 pb-5 flex flex-col gap-4">
            {/* Balance summary */}
            {isConnected && VAULT_DEPLOYED && (
              <div className="flex gap-3">
                {[
                  { label: 'ETH Free', val: `${formatEth(ethFree)} ETH`, usd: formatUsd(ethWeiToUsd(ethFree, ethUsdPrice)), locked: formatEth(ethLocked) },
                  { label: 'USDT Free', val: `${formatUsdt(usdtFree)} USDT`, usd: formatUsd(usdtToUsd(usdtFree)), locked: formatUsdt(usdtLocked) },
                ].map(({ label, val, usd, locked }) => (
                  <div key={label} className="flex-1 px-3 py-2.5 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ ...cp(400, 10, '0.1em'), color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                    <div style={{ ...cp(700, 13, '0.02em'), color: 'white' }}>{val}</div>
                    <div style={{ ...cp(400, 10), color: 'rgba(255,255,255,0.35)' }}>{usd}{locked !== '0.0000' && locked !== '0.00' ? ` · ${locked} locked` : ''}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Wizard steps */}
            <AnimatePresence mode="wait">
              {/* Step: action */}
              {step === 'action' && (
                <motion.div key="action" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                  className="flex flex-col gap-3">
                  <span style={{ ...cp(500, 11, '0.12em'), color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>Select Action</span>
                  <div className="flex gap-2">
                    {(['deposit', 'withdraw'] as const).map(a => (
                      <button key={a} onClick={() => setAction(a)}
                        className="flex-1 py-3 rounded-xl font-mono text-xs tracking-widest uppercase font-bold transition-all"
                        style={{
                          background: action === a ? 'rgba(255,224,61,0.12)' : 'rgba(255,255,255,0.03)',
                          border: action === a ? '1px solid rgba(255,224,61,0.35)' : '1px solid rgba(255,255,255,0.08)',
                          color: action === a ? 'var(--color-primary)' : 'rgba(255,255,255,0.4)',
                        }}>
                        {a === 'deposit' ? '↓ Deposit' : '↑ Withdraw'}
                      </button>
                    ))}
                  </div>
                  <span style={{ ...cp(500, 11, '0.12em'), color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>Token</span>
                  <div className="flex gap-2">
                    {(['ETH', 'USDT'] as const).map(t => (
                      <button key={t} onClick={() => setTokenChoice(t)}
                        className="flex-1 py-2.5 rounded-xl font-mono text-sm tracking-wider uppercase font-bold transition-all"
                        style={{
                          background: tokenChoice === t ? 'rgba(255,224,61,0.1)' : 'rgba(255,255,255,0.03)',
                          border: tokenChoice === t ? '1px solid rgba(255,224,61,0.3)' : '1px solid rgba(255,255,255,0.06)',
                          color: tokenChoice === t ? 'var(--color-primary)' : 'rgba(255,255,255,0.4)',
                        }}>
                        {t}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setStep('amount')}
                    className="w-full py-3 rounded-xl font-mono text-xs tracking-widest uppercase font-bold transition-all"
                    style={{ background: 'var(--color-primary)', color: '#000' }}>
                    Next →
                  </button>
                </motion.div>
              )}

              {/* Step: amount */}
              {step === 'amount' && (
                <motion.div key="amount" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                  className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setStep('action')} style={{ color: 'rgba(255,255,255,0.3)', fontSize: 18 }}>←</button>
                    <span style={{ ...cp(600, 13, '0.06em'), color: 'white' }}>
                      {action === 'deposit' ? 'Deposit' : 'Withdraw'} {tokenChoice}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-3 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>
                    <input
                      autoFocus type="number" min="0" step="any"
                      value={amount} onChange={e => setAmount(e.target.value)}
                      placeholder={tokenChoice === 'ETH' ? '0.000 ETH' : '0.00 USDT'}
                      className="flex-1 bg-transparent font-mono text-sm outline-none" style={{ color: 'white' }}
                    />
                    <button onClick={handleMax}
                      className="font-mono text-[9px] tracking-widest uppercase px-2 py-1 rounded-md"
                      style={{ background: 'rgba(255,224,61,0.08)', border: '1px solid rgba(255,224,61,0.2)', color: 'var(--color-primary)' }}>
                      MAX
                    </button>
                  </div>
                  <span style={{ ...cp(400, 10), color: 'rgba(255,255,255,0.35)' }}>{usdEquiv}</span>

                  {isWithdrawLocked && (
                    <div className="px-3 py-2.5 rounded-xl font-mono text-[11px]"
                      style={{ background: 'rgba(255,140,66,0.08)', border: '1px solid rgba(255,140,66,0.25)', color: 'var(--color-deco-orange)' }}>
                      ⚠ Funds locked — finish the active hand first
                    </div>
                  )}

                  <button
                    onClick={() => setStep('review')}
                    disabled={!amount || parseFloat(amount) <= 0 || isWithdrawLocked || !isConnected || !VAULT_DEPLOYED}
                    className="w-full py-3 rounded-xl font-mono text-xs tracking-widest uppercase font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: 'var(--color-primary)', color: '#000' }}>
                    Review →
                  </button>
                </motion.div>
              )}

              {/* Step: review */}
              {step === 'review' && (
                <motion.div key="review" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                  className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setStep('amount')} style={{ color: 'rgba(255,255,255,0.3)', fontSize: 18 }}>←</button>
                    <span style={{ ...cp(600, 13, '0.06em'), color: 'white' }}>Review Transaction</span>
                  </div>
                  <div className="flex flex-col gap-2 px-4 py-4 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    {[
                      { label: 'Action',   value: `${action === 'deposit' ? 'Deposit' : 'Withdraw'} ${tokenChoice}` },
                      { label: 'Amount',   value: `${amount} ${tokenChoice}` },
                      { label: 'USD',      value: usdEquiv },
                      { label: 'Gas est.', value: `~${gasEstimate}`, sub: true },
                    ].map(({ label, value, sub }) => (
                      <div key={label} className="flex items-center justify-between">
                        <span style={{ ...cp(400, 11, '0.06em'), color: sub ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.45)' }}>{label}</span>
                        <span style={{ ...cp(600, 12, '0.04em'), color: sub ? 'rgba(255,255,255,0.35)' : 'white' }}>{value}</span>
                      </div>
                    ))}
                  </div>

                  {txStatus === 'error' && (
                    <div className="px-3 py-2.5 rounded-xl font-mono text-[11px]"
                      style={{ background: 'rgba(255,59,59,0.08)', border: '1px solid rgba(255,59,59,0.25)', color: 'var(--color-danger)' }}>
                      {txError}
                    </div>
                  )}

                  <button onClick={handleConfirm} disabled={txStatus === 'pending'}
                    className="w-full py-3 rounded-xl font-mono text-xs tracking-widest uppercase font-bold transition-all disabled:opacity-40"
                    style={{ background: 'var(--color-primary)', color: '#000', boxShadow: '0 0 20px rgba(255,224,61,0.2)' }}>
                    {txStatus === 'pending' ? 'PROCESSING…' : `CONFIRM ${action.toUpperCase()}`}
                  </button>
                </motion.div>
              )}

              {/* Step: receipt */}
              {step === 'receipt' && (
                <motion.div key="receipt" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center gap-4 py-4">
                  <motion.div className="text-5xl" animate={{ scale: [0.8, 1.1, 1] }} transition={{ type: 'spring', damping: 12 }}>✅</motion.div>
                  <div style={{ ...cp(700, 18, '0.04em'), color: 'white' }}>
                    {action === 'deposit' ? 'Deposited' : 'Withdrawn'} {amount} {tokenChoice}
                  </div>
                  <div style={{ ...cp(400, 13), color: 'rgba(255,255,255,0.45)' }}>{usdEquiv}</div>
                  {lastTxHash && (
                    <a href={`${ETHERSCAN}${lastTxHash}`} target="_blank" rel="noopener noreferrer"
                      className="font-mono text-[11px] tracking-widest"
                      style={{ color: '#00BFFF', textDecoration: 'underline' }}>
                      View on Etherscan ↗
                    </a>
                  )}
                  <button onClick={() => { setStep('action'); setAmount(''); setTxStatus('idle'); }}
                    className="mt-2 px-8 py-2.5 rounded-full font-mono text-xs tracking-widest uppercase font-bold"
                    style={{ background: 'rgba(255,224,61,0.1)', border: '1px solid rgba(255,224,61,0.3)', color: 'var(--color-primary)' }}>
                    New Transaction
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {!isConnected && (
              <p className="text-center font-mono text-xs py-2" style={{ color: 'rgba(255,255,255,0.25)' }}>
                Connect wallet to use the vault
              </p>
            )}
            {!VAULT_DEPLOYED && (
              <p className="text-center font-mono text-xs py-2" style={{ color: 'rgba(255,255,255,0.2)' }}>
                Vault not deployed · play-money mode only
              </p>
            )}
            <p className="text-center font-mono text-[9px]" style={{ color: 'rgba(255,255,255,0.1)' }}>
              Non-custodial · Ethereum Sepolia · Chainlink oracle
            </p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};
