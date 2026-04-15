/**
 * useVaultStore — Zustand store for real-money vault state.
 *
 * All token amounts follow Solidity conventions:
 *   ETH   → bigint in wei   (1 ETH = 1e18n)
 *   USDT  → bigint in 6-dec (1 USDT = 1_000_000n)
 *
 * ethUsdPrice stores the 18-decimal oracle value:
 *   e.g. 3000e18n = $3 000 / ETH
 */
import { create } from 'zustand';
import { ETH_TOKEN } from '@/config/vault';

export type VaultToken = typeof ETH_TOKEN | `0x${string}`;

// ─── Conversion helpers (pure, no hooks) ─────────────────────────────────────

/** Convert 18-dec USD → ETH wei. */
export function usdToEthWei(usdWei: bigint, ethUsdPrice: bigint): bigint {
  if (ethUsdPrice === 0n) return 0n;
  return (usdWei * 10n ** 18n) / ethUsdPrice;
}

/** Convert 18-dec USD → USDT (6-dec). */
export function usdToUsdt(usdWei: bigint): bigint {
  return usdWei / 10n ** 12n;
}

/** Convert ETH wei → 18-dec USD. */
export function ethWeiToUsd(ethWei: bigint, ethUsdPrice: bigint): bigint {
  return (ethWei * ethUsdPrice) / 10n ** 18n;
}

/** Convert USDT (6-dec) → 18-dec USD. */
export function usdtToUsd(usdtAmount: bigint): bigint {
  return usdtAmount * 10n ** 12n;
}

/** Format ETH wei to human-readable string (4 dp). */
export function formatEth(wei: bigint): string {
  const eth = Number(wei) / 1e18;
  return eth.toFixed(4);
}

/** Format USDT (6-dec) to human-readable string (2 dp). */
export function formatUsdt(amount: bigint): string {
  const usdt = Number(amount) / 1e6;
  return usdt.toFixed(2);
}

/** Format 18-dec USD value to "$X.XX". */
export function formatUsd(usdWei: bigint): string {
  const usd = Number(usdWei) / 1e18;
  return `$${usd.toFixed(2)}`;
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface VaultStore {
  // Balances (in token-native units)
  ethFree:    bigint;
  ethLocked:  bigint;
  usdtFree:   bigint;
  usdtLocked: bigint;

  // Oracle price (18-decimal USD per ETH)
  ethUsdPrice: bigint;
  priceStale:  boolean;

  // UI state
  realMoneyMode:  boolean;
  selectedToken:  VaultToken;
  walletPanelOpen: boolean;

  // Setters
  setEthFree:        (v: bigint) => void;
  setEthLocked:      (v: bigint) => void;
  setUsdtFree:       (v: bigint) => void;
  setUsdtLocked:     (v: bigint) => void;
  setEthUsdPrice:    (v: bigint) => void;
  setPriceStale:     (v: boolean) => void;
  setRealMoneyMode:  (v: boolean) => void;
  setSelectedToken:  (t: VaultToken) => void;
  setWalletPanelOpen:(v: boolean) => void;

  // Derived helpers
  freeBalance:    (token: VaultToken) => bigint;
  lockedBalance:  (token: VaultToken) => bigint;
  freeUsd:        (token: VaultToken) => bigint;
  hasLockedFunds: () => boolean;
}

export const useVaultStore = create<VaultStore>((set, get) => ({
  ethFree:         0n,
  ethLocked:       0n,
  usdtFree:        0n,
  usdtLocked:      0n,
  ethUsdPrice:     3000n * 10n ** 18n,
  priceStale:      false,
  realMoneyMode:   false,
  selectedToken:   ETH_TOKEN,
  walletPanelOpen: false,

  setEthFree:         (v) => set({ ethFree: v }),
  setEthLocked:       (v) => set({ ethLocked: v }),
  setUsdtFree:        (v) => set({ usdtFree: v }),
  setUsdtLocked:      (v) => set({ usdtLocked: v }),
  setEthUsdPrice:     (v) => set({ ethUsdPrice: v }),
  setPriceStale:      (v) => set({ priceStale: v }),
  setRealMoneyMode:   (v) => set({ realMoneyMode: v }),
  setSelectedToken:   (t) => set({ selectedToken: t }),
  setWalletPanelOpen: (v) => set({ walletPanelOpen: v }),

  freeBalance: (token) => {
    const s = get();
    return token === ETH_TOKEN ? s.ethFree : s.usdtFree;
  },
  lockedBalance: (token) => {
    const s = get();
    return token === ETH_TOKEN ? s.ethLocked : s.usdtLocked;
  },
  freeUsd: (token) => {
    const s = get();
    if (token === ETH_TOKEN) return ethWeiToUsd(s.ethFree, s.ethUsdPrice);
    return usdtToUsd(s.usdtFree);
  },
  hasLockedFunds: () => {
    const s = get();
    return s.ethLocked > 0n || s.usdtLocked > 0n;
  },
}));
