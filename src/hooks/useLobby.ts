import { useCallback, useEffect, useRef } from 'react';
import { useAccount, useWriteContract, usePublicClient } from 'wagmi';
import { PVP_CONTRACT_ADDRESS, CIPHER_POKER_PVP_ABI } from '@/config/contractPvP';
import { useLobbyStore, LobbyTable } from '@/store/useLobbyStore';
import { usePvPGameStore } from '@/store/usePvPGameStore';

const LOG = (...args: unknown[]) =>
  console.log('%c[LOBBY]', 'color:#39FF14;font-weight:bold', ...args);

export const useLobby = () => {
  const store        = useLobbyStore();
  const pvpStore     = usePvPGameStore();
  const { address }  = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const pollRef = useRef<ReturnType<typeof setInterval>>(null);

  const deployed = PVP_CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000';

  const refresh = useCallback(async () => {
    if (!publicClient || !deployed) return;
    store.setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const count = await publicClient.readContract({
        address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
        functionName: 'getOpenTableCount',
      } as any) as bigint;

      if (count === 0n) { store.setTables([]); store.setLoading(false); return; }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ids = await publicClient.readContract({
        address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
        functionName: 'getOpenTables', args: [0n, count],
      } as any) as bigint[];

      const tables: LobbyTable[] = await Promise.all(ids.map(async (id) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const info = await publicClient.readContract({
          address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
          functionName: 'getPvPTableInfo', args: [id],
        } as any) as [string, string, number, bigint, bigint, bigint, boolean, bigint];

        return {
          tableId:     Number(id),
          creator:     info[0],
          buyIn:       Number(info[5]),
          playerCount: info[1] === '0x0000000000000000000000000000000000000000' ? 1 : 2,
          createdAt:   Number(info[7]),
          isPrivate:   info[6],
        } as LobbyTable;
      }));

      LOG(`Fetched ${tables.length} open tables`);
      store.setTables(tables);
    } catch (err) {
      LOG('Fetch failed:', err);
      store.setError(err instanceof Error ? err.message : 'Failed to load lobby');
    }
    store.setLoading(false);
  }, [publicClient, deployed, store]);

  // Poll every 10s
  useEffect(() => {
    if (!deployed) return;
    refresh();
    pollRef.current = setInterval(refresh, 10_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [deployed, refresh]);

  const createTable = useCallback(async (buyIn: number, isPrivate: boolean) => {
    if (!deployed) throw new Error('PvP contract not deployed');
    LOG(`Creating table — buyIn: ${buyIn}, private: ${isPrivate}`);
    const hash = await writeContractAsync({
      address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
      functionName: 'createPvPTable', args: [BigInt(buyIn), isPrivate],
    } as any);
    await publicClient!.waitForTransactionReceipt({ hash });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seatId = await publicClient!.readContract({
      address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
      functionName: 'getMySeat', account: address,
    } as any) as bigint;

    const tableId = Number(seatId);
    LOG(`Table #${tableId} created ✓`);

    pvpStore.setTableId(tableId);
    pvpStore.setPvPState('waiting');
    pvpStore.setStatus(isPrivate ? 'Waiting — share invite link' : 'Waiting for opponent…', '#B366FF');

    await refresh();
    return tableId;
  }, [deployed, writeContractAsync, publicClient, address, pvpStore, refresh]);

  const joinTable = useCallback(async (tableId: number) => {
    if (!deployed) throw new Error('PvP contract not deployed');
    LOG(`Joining table #${tableId}`);
    const hash = await writeContractAsync({
      address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
      functionName: 'joinTable', args: [BigInt(tableId)],
    } as any);
    await publicClient!.waitForTransactionReceipt({ hash });
    LOG(`Joined table #${tableId} ✓`);

    pvpStore.setTableId(tableId);
    pvpStore.setPvPState('seated');
    pvpStore.setStatus('Both seated — ready to play!', '#39FF14');
    await refresh();
  }, [deployed, writeContractAsync, publicClient, pvpStore, refresh]);

  const joinByInvite = useCallback(async (tableId: number, code: `0x${string}`) => {
    if (!deployed) throw new Error('PvP contract not deployed');
    LOG(`Joining table #${tableId} by invite`);
    const hash = await writeContractAsync({
      address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
      functionName: 'joinByInviteCode', args: [BigInt(tableId), code],
    } as any);
    await publicClient!.waitForTransactionReceipt({ hash });

    pvpStore.setTableId(tableId);
    pvpStore.setPvPState('seated');
    await refresh();
  }, [deployed, writeContractAsync, publicClient, pvpStore, refresh]);

  const leaveTable = useCallback(async () => {
    if (!deployed || !pvpStore.tableId) return;
    LOG(`Leaving table #${pvpStore.tableId}`);
    const hash = await writeContractAsync({
      address: PVP_CONTRACT_ADDRESS, abi: CIPHER_POKER_PVP_ABI,
      functionName: 'leaveTable', args: [BigInt(pvpStore.tableId)],
    } as any);
    await publicClient!.waitForTransactionReceipt({ hash });
    pvpStore.resetToIdle();
    await refresh();
  }, [deployed, writeContractAsync, publicClient, pvpStore, refresh]);

  return {
    tables: store.tables,
    isLoading: store.isLoading,
    error: store.error,
    filter: store.filter,
    setFilter: store.setFilter,
    deployed,
    refresh,
    createTable,
    joinTable,
    joinByInvite,
    leaveTable,
  };
};
