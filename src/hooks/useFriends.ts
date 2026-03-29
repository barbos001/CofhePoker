import { useCallback, useEffect } from 'react';
import { useAccount, useWriteContract, usePublicClient } from 'wagmi';
import { PVP_CONTRACT_ADDRESS, CIPHER_POKER_PVP_ABI } from '@/config/contractPvP';
import { useFriendsStore } from '@/store/useFriendsStore';

const LOG = (...args: unknown[]) =>
  console.log('%c[FRIENDS]', 'color:#00E86C;font-weight:bold', ...args);

export const useFriends = () => {
  const store        = useFriendsStore();
  const { address }  = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const deployed = PVP_CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000';

  // ── Load friends list ──
  const loadFriends = useCallback(async () => {
    if (!publicClient || !deployed || !address) return;
    store.setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const addrs = await publicClient.readContract({
        address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
        functionName: 'getFriends', args: [address],
      } as any) as string[];

      const friends = await Promise.all(addrs.map(async (addr) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const seat = await publicClient.readContract({
          address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
          functionName: 'seatOf', args: [addr],
        } as any) as bigint;

        return {
          address:        addr,
          isOnline:       true, // On-chain: no real online status, assume true
          inGame:         Number(seat) > 0,
          currentTableId: Number(seat) || undefined,
        };
      }));

      LOG(`Loaded ${friends.length} friends`);
      store.setFriends(friends);
    } catch (err) {
      LOG('Load failed:', err);
    }
    store.setLoading(false);
  }, [publicClient, deployed, address, store]);

  useEffect(() => { loadFriends(); }, [loadFriends]);

  // ── Send friend request ──
  const sendRequest = useCallback(async (to: string) => {
    if (!deployed) throw new Error('PvP contract not deployed');
    LOG(`Sending friend request to ${to.slice(0, 10)}…`);
    const hash = await writeContractAsync({
      address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
      functionName: 'sendFriendRequest', args: [to as `0x${string}`],
    } as any);
    await publicClient!.waitForTransactionReceipt({ hash });
    store.addOutgoingRequest(to);
    LOG('Friend request sent ✓');
  }, [deployed, writeContractAsync, publicClient, store]);

  // ── Accept friend request ──
  const acceptRequest = useCallback(async (from: string) => {
    if (!deployed) throw new Error('PvP contract not deployed');
    LOG(`Accepting request from ${from.slice(0, 10)}…`);
    const hash = await writeContractAsync({
      address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
      functionName: 'acceptFriendRequest', args: [from as `0x${string}`],
    } as any);
    await publicClient!.waitForTransactionReceipt({ hash });
    store.removeIncomingRequest(from);
    store.addFriend({ address: from, isOnline: true, inGame: false });
    LOG('Friend added ✓');
  }, [deployed, writeContractAsync, publicClient, store]);

  // ── Remove friend ──
  const removeFriendAction = useCallback(async (friend: string) => {
    if (!deployed) throw new Error('PvP contract not deployed');
    LOG(`Removing friend ${friend.slice(0, 10)}…`);
    const hash = await writeContractAsync({
      address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
      functionName: 'removeFriend', args: [friend as `0x${string}`],
    } as any);
    await publicClient!.waitForTransactionReceipt({ hash });
    store.removeFriend(friend);
    LOG('Friend removed ✓');
  }, [deployed, writeContractAsync, publicClient, store]);

  return {
    friends:          store.friends,
    incomingRequests: store.incomingRequests,
    outgoingRequests: store.outgoingRequests,
    isLoading:        store.isLoading,
    loadFriends,
    sendRequest,
    acceptRequest,
    removeFriend: removeFriendAction,
  };
};
