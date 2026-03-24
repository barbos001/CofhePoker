/**
 * usePvPEvents — real-time contract event listener for PvP game.
 * Updates stores when opponents join, act, or when invites arrive.
 */
import { useEffect } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { PVP_CONTRACT_ADDRESS, CIPHER_POKER_PVP_ABI } from '@/config/contractPvP';
import { usePvPGameStore } from '@/store/usePvPGameStore';
import { useInvitesStore } from '@/store/useInvitesStore';
import { useFriendsStore } from '@/store/useFriendsStore';

const LOG = (...args: unknown[]) =>
  console.log('%c[EVENT]', 'color:#FF6B9D;font-weight:bold', ...args);

export const usePvPEvents = () => {
  const { address }  = useAccount();
  const publicClient = usePublicClient();
  const pvpStore     = usePvPGameStore();
  const inviteStore  = useInvitesStore();
  const friendStore  = useFriendsStore();

  const deployed = PVP_CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000';

  useEffect(() => {
    if (!publicClient || !deployed || !address) return;

    const unwatchers: (() => void)[] = [];

    // ── PlayerJoined — opponent joined my table ──
    try {
      const unwatch = publicClient.watchContractEvent({
        address: PVP_CONTRACT_ADDRESS,
        abi: CIPHER_POKER_PVP_ABI,
        eventName: 'PlayerJoined',
        onLogs: (logs) => {
          for (const log of logs) {
            const tableId = Number((log as { args: { tableId: bigint } }).args.tableId);
            const player  = ((log as { args: { player: string } }).args.player).toLowerCase();

            if (player !== address.toLowerCase() && tableId === pvpStore.tableId) {
              LOG(`Opponent joined table #${tableId}: ${player.slice(0, 10)}…`);
              pvpStore.setOpponent(player);
              pvpStore.setPvPState('seated');
              pvpStore.setStatus('Opponent joined — ready to play!', '#39FF14');
            }
          }
        },
      });
      unwatchers.push(unwatch);
    } catch { /* event watching not supported on all transports */ }

    // ── PlayerLeft — opponent left ──
    try {
      const unwatch = publicClient.watchContractEvent({
        address: PVP_CONTRACT_ADDRESS,
        abi: CIPHER_POKER_PVP_ABI,
        eventName: 'PlayerLeft',
        onLogs: (logs) => {
          for (const log of logs) {
            const player = ((log as { args: { player: string } }).args.player).toLowerCase();
            if (player !== address.toLowerCase() && player === pvpStore.opponentAddress?.toLowerCase()) {
              LOG('Opponent left the table');
              pvpStore.setOpponent(null);
              pvpStore.setPvPState('waiting');
              pvpStore.setStatus('Opponent left — waiting for new player…', '#FF3B3B');
            }
          }
        },
      });
      unwatchers.push(unwatch);
    } catch {}

    // ── GameInviteSent — someone invited me ──
    try {
      const unwatch = publicClient.watchContractEvent({
        address: PVP_CONTRACT_ADDRESS,
        abi: CIPHER_POKER_PVP_ABI,
        eventName: 'GameInviteSent',
        onLogs: (logs) => {
          for (const log of logs) {
            const args = (log as { args: { from: string; to: string; tableId: bigint } }).args;
            if (args.to.toLowerCase() === address.toLowerCase()) {
              LOG(`Game invite from ${args.from.slice(0, 10)}… for table #${Number(args.tableId)}`);
              inviteStore.addIncoming({
                from:      args.from,
                tableId:   Number(args.tableId),
                buyIn:     10,
                timestamp: Date.now(),
              });
            }
          }
        },
      });
      unwatchers.push(unwatch);
    } catch {}

    // ── FriendRequestSent — someone wants to be my friend ──
    try {
      const unwatch = publicClient.watchContractEvent({
        address: PVP_CONTRACT_ADDRESS,
        abi: CIPHER_POKER_PVP_ABI,
        eventName: 'FriendRequestSent',
        onLogs: (logs) => {
          for (const log of logs) {
            const args = (log as { args: { from: string; to: string } }).args;
            if (args.to.toLowerCase() === address.toLowerCase()) {
              LOG(`Friend request from ${args.from.slice(0, 10)}…`);
              friendStore.addIncomingRequest({ from: args.from, timestamp: Date.now() });
            }
          }
        },
      });
      unwatchers.push(unwatch);
    } catch {}

    // ── PvPHandComplete — hand finished (opponent triggered) ──
    try {
      const unwatch = publicClient.watchContractEvent({
        address: PVP_CONTRACT_ADDRESS,
        abi: CIPHER_POKER_PVP_ABI,
        eventName: 'PvPHandComplete',
        onLogs: (logs) => {
          for (const log of logs) {
            const args = (log as { args: { tableId: bigint; winner: string; pot: bigint } }).args;
            if (Number(args.tableId) === pvpStore.tableId) {
              LOG(`Hand complete! Winner: ${args.winner.slice(0, 10)}… Pot: ${Number(args.pot)}`);
            }
          }
        },
      });
      unwatchers.push(unwatch);
    } catch {}

    return () => { unwatchers.forEach(u => u()); };
  }, [publicClient, deployed, address, pvpStore.tableId]);
};
