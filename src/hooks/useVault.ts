/**
 * useVault — React hook for all Vault contract interactions.
 *
 * Responsibilities:
 *  • Read and sync balances + oracle price into useVaultStore
 *  • depositETH, depositUSDT (with USDT approval flow)
 *  • withdraw (ETH or USDT)
 *  • Decode contract revert reasons into user-readable messages
 *
 * Polling: balances refresh every 12s (one Ethereum block) while
 * the wallet panel is open or a game is active.
 */
import { useCallback, useEffect, useRef } from 'react';
import {
  useAccount,
  usePublicClient,
  useWriteContract,
  useBalance,
} from 'wagmi';
import {
  VAULT_ADDRESS,
  VAULT_DEPLOYED,
  USDT_ADDRESS,
  ETH_TOKEN,
  VAULT_ABI,
  ERC20_APPROVE_ABI,
} from '@/config/vault';
import {
  useVaultStore,
  usdToEthWei,
  usdToUsdt,
  type VaultToken,
} from '@/store/useVaultStore';

// ─── Revert reason extractor ──────────────────────────────────────────────────

function extractRevertReason(err: unknown): string {
  if (!(err instanceof Error)) return 'Transaction failed';
  const msg = err.message;

  // Wagmi/viem wraps revert reasons in the message
  const match =
    msg.match(/reverted with reason string ['"](.*?)['"]/i) ??
    msg.match(/execution reverted: (.*?)(?:\n|$)/i) ??
    msg.match(/Vault: (.*?)(?:\n|$)/i);

  if (match) return match[1];
  if (msg.includes('user rejected') || msg.includes('User denied'))
    return 'Transaction rejected in wallet';
  if (msg.includes('insufficient funds'))
    return 'Insufficient ETH for gas';
  return msg.slice(0, 120);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useVault = () => {
  const { address, isConnected } = useAccount();
  const publicClient             = usePublicClient();
  const { writeContractAsync }   = useWriteContract();

  const {
    setEthFree, setEthLocked,
    setUsdtFree, setUsdtLocked,
    setEthUsdPrice, setPriceStale,
    walletPanelOpen,
    ethUsdPrice,
  } = useVaultStore();

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Fetch all balances + price from contract ──────────────────────────────
  const refresh = useCallback(async () => {
    if (!VAULT_DEPLOYED || !address || !publicClient) return;

    try {
      const read = (functionName: string, args?: unknown[]) =>
        publicClient.readContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName, args } as any);

      const [
        ethFree, ethLocked,
        usdtFree, usdtLocked,
        price, stale,
      ] = await Promise.all([
        read('getFreeBalance',    [address, ETH_TOKEN])   as Promise<bigint>,
        read('getLockedBalance',  [address, ETH_TOKEN])   as Promise<bigint>,
        read('getFreeBalance',    [address, USDT_ADDRESS]) as Promise<bigint>,
        read('getLockedBalance',  [address, USDT_ADDRESS]) as Promise<bigint>,
        read('getEthUsdPrice')                            as Promise<bigint>,
        read('isPriceStale')                              as Promise<boolean>,
      ]);

      setEthFree(ethFree);
      setEthLocked(ethLocked);
      setUsdtFree(usdtFree);
      setUsdtLocked(usdtLocked);
      setEthUsdPrice(price);
      setPriceStale(stale);
    } catch {
      // Silently ignore if contract not yet deployed
    }
  }, [address, publicClient, setEthFree, setEthLocked, setUsdtFree, setUsdtLocked, setEthUsdPrice, setPriceStale]);

  // ─── Auto-poll every ~12s when panel is open ───────────────────────────────
  useEffect(() => {
    if (!isConnected || !walletPanelOpen) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    refresh();
    pollRef.current = setInterval(refresh, 12_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isConnected, walletPanelOpen, refresh]);

  // ─── Initial load on connect ───────────────────────────────────────────────
  useEffect(() => {
    if (isConnected) refresh();
  }, [isConnected, refresh]);

  // ─── depositETH ───────────────────────────────────────────────────────────
  const depositETH = useCallback(async (ethWei: bigint): Promise<string> => {
    if (!VAULT_DEPLOYED) throw new Error('Vault not deployed yet');
    try {
      const hash = await writeContractAsync({
        address:      VAULT_ADDRESS,
        abi:          VAULT_ABI,
        functionName: 'depositETH',
        value:        ethWei,
      } as any);
      await publicClient!.waitForTransactionReceipt({ hash });
      await refresh();
      return hash;
    } catch (err) {
      throw new Error(extractRevertReason(err));
    }
  }, [writeContractAsync, publicClient, refresh]);

  // ─── depositUSDT ──────────────────────────────────────────────────────────
  const depositUSDT = useCallback(async (usdtAmount: bigint): Promise<string> => {
    if (!VAULT_DEPLOYED) throw new Error('Vault not deployed yet');
    if (!address) throw new Error('Wallet not connected');
    try {
      // Step 1: check existing allowance
      const allowance = await publicClient!.readContract({
        address:      USDT_ADDRESS,
        abi:          ERC20_APPROVE_ABI,
        functionName: 'allowance',
        args:         [address, VAULT_ADDRESS],
      } as any) as bigint;

      // Step 2: approve if needed
      if (allowance < usdtAmount) {
        const approveHash = await writeContractAsync({
          address:      USDT_ADDRESS,
          abi:          ERC20_APPROVE_ABI,
          functionName: 'approve',
          args:         [VAULT_ADDRESS, usdtAmount],
        } as any);
        await publicClient!.waitForTransactionReceipt({ hash: approveHash });
      }

      // Step 3: deposit
      const hash = await writeContractAsync({
        address:      VAULT_ADDRESS,
        abi:          VAULT_ABI,
        functionName: 'depositUSDT',
        args:         [usdtAmount],
      } as any);
      await publicClient!.waitForTransactionReceipt({ hash });
      await refresh();
      return hash;
    } catch (err) {
      throw new Error(extractRevertReason(err));
    }
  }, [address, writeContractAsync, publicClient, refresh]);

  // ─── withdraw ─────────────────────────────────────────────────────────────
  const withdraw = useCallback(async (token: VaultToken, tokenAmount: bigint): Promise<string> => {
    if (!VAULT_DEPLOYED) throw new Error('Vault not deployed yet');
    try {
      const hash = await writeContractAsync({
        address:      VAULT_ADDRESS,
        abi:          VAULT_ABI,
        functionName: 'withdraw',
        args:         [token, tokenAmount],
      } as any);
      await publicClient!.waitForTransactionReceipt({ hash });
      await refresh();
      return hash;
    } catch (err) {
      throw new Error(extractRevertReason(err));
    }
  }, [writeContractAsync, publicClient, refresh]);

  // ─── Convenience: deposit by USD amount ───────────────────────────────────
  const depositByUsd = useCallback(async (usdWei: bigint, token: VaultToken): Promise<string> => {
    if (token === ETH_TOKEN) {
      const ethWei = usdToEthWei(usdWei, ethUsdPrice);
      return depositETH(ethWei);
    } else {
      const usdtAmount = usdToUsdt(usdWei);
      return depositUSDT(usdtAmount);
    }
  }, [ethUsdPrice, depositETH, depositUSDT]);

  return {
    refresh,
    depositETH,
    depositUSDT,
    withdraw,
    depositByUsd,
  };
};
