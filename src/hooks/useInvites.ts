import { useCallback } from 'react';
import { useAccount, useWriteContract, usePublicClient } from 'wagmi';
import { PVP_CONTRACT_ADDRESS, CIPHER_POKER_PVP_ABI } from '@/config/contractPvP';
import { useInvitesStore } from '@/store/useInvitesStore';
import { usePvPGameStore } from '@/store/usePvPGameStore';

const LOG = (...args: unknown[]) =>
  console.log('%c[INVITE]', 'color:#FF8C42;font-weight:bold', ...args);

export const useInvites = () => {
  const store    = useInvitesStore();
  const pvpStore = usePvPGameStore();
  const { address }  = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const deployed = PVP_CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000';

  // ── Send game invite ──
  const sendInvite = useCallback(async (to: string, tableId: number) => {
    if (!deployed) return;
    LOG(`Inviting ${to.slice(0, 10)}… to table #${tableId}`);
    const hash = await writeContractAsync({
      address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
      functionName: 'sendGameInvite', args: [to as `0x${string}`, BigInt(tableId)],
    } as any);
    await publicClient!.waitForTransactionReceipt({ hash });
    store.addOutgoing({ to, tableId });
    LOG('Invite sent ✓');
  }, [deployed, writeContractAsync, publicClient, store]);

  // ── Accept game invite ──
  const acceptInvite = useCallback(async (from: string) => {
    if (!deployed) return;
    LOG(`Accepting invite from ${from.slice(0, 10)}…`);
    const hash = await writeContractAsync({
      address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
      functionName: 'acceptGameInvite', args: [from as `0x${string}`],
    } as any);
    await publicClient!.waitForTransactionReceipt({ hash });

    const invite = store.incoming.find(i => i.from === from);
    store.removeIncoming(from);

    if (invite) {
      pvpStore.setTableId(invite.tableId);
      pvpStore.setPvPState('seated');
      pvpStore.setStatus('Joined via invite — ready to play!', '#39FF14');
    }
    LOG('Invite accepted ✓');
  }, [deployed, writeContractAsync, publicClient, store, pvpStore]);

  // ── Decline game invite ──
  const declineInvite = useCallback(async (from: string) => {
    if (!deployed) return;
    LOG(`Declining invite from ${from.slice(0, 10)}…`);
    const hash = await writeContractAsync({
      address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
      functionName: 'declineGameInvite', args: [from as `0x${string}`],
    } as any);
    await publicClient!.waitForTransactionReceipt({ hash });
    store.removeIncoming(from);
    LOG('Invite declined');
  }, [deployed, writeContractAsync, publicClient, store]);

  // ── Generate invite link ──
  const generateInviteLink = useCallback(async (tableId: number): Promise<string> => {
    if (!publicClient || !deployed) return '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const code = await publicClient.readContract({
      address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
      functionName: 'getInviteCode', args: [BigInt(tableId)],
      account: address,
    } as any) as `0x${string}`;

    const url = `${window.location.origin}${window.location.pathname}?pvp=join&table=${tableId}&code=${code}`;
    LOG(`Invite link: ${url}`);
    return url;
  }, [publicClient, deployed, address]);

  return {
    incoming: store.incoming,
    outgoing: store.outgoing,
    sendInvite,
    acceptInvite,
    declineInvite,
    generateInviteLink,
  };
};
