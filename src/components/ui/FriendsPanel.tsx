/**
 * FriendsPanel — friends list, send/accept requests, and game invites.
 * Reads friends from the HoldemPvP contract; game invites stored in Supabase
 * so recipients see them cross-device without querying on-chain events.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, UserPlus, Check, X, Send, Swords, Bell, ChevronDown, ChevronUp } from 'lucide-react';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { HOLDEM_PVP_CONTRACT_ADDRESS, CIPHER_HOLDEM_PVP_ABI } from '@/config/contractHoldemPvP';
import {
  sendGameInviteDB, getMyGameInvites, respondToGameInvite,
  subscribeToGameInvites,
} from '@/lib/db';
import { GameInviteRow } from '@/config/supabase';

const cp = (weight: number, size: number | string, spacing = '0.03em') => ({
  fontFamily: "'Chakra Petch', sans-serif",
  fontWeight: weight,
  fontSize:   size,
  letterSpacing: spacing,
});
const truncAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const isAddr = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s);

interface FriendsPanelProps {
  /** If set, a game-invite button appears next to each friend */
  activeTableId?: number | null;
  /** Called when user accepts a game invite — parent should navigate to that table */
  onAcceptInvite?: (tableId: number, fromAddr: string) => void;
}

export const FriendsPanel = ({ activeTableId, onAcceptInvite }: FriendsPanelProps) => {
  const { address, isConnected } = useAccount();
  const publicClient  = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [open,        setOpen]        = useState(false);
  const [friends,     setFriends]     = useState<string[]>([]);
  const [invites,     setInvites]     = useState<GameInviteRow[]>([]);
  const [reqInput,    setReqInput]    = useState('');
  const [loading,     setLoading]     = useState(false);
  const [msg,         setMsg]         = useState('');
  const deployed = HOLDEM_PVP_CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000';

  const readContract = useCallback(async (functionName: string, args?: unknown[]) => {
    return publicClient!.readContract({
      address: HOLDEM_PVP_CONTRACT_ADDRESS, abi: CIPHER_HOLDEM_PVP_ABI,
      functionName, args, account: address,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  }, [publicClient, address]);

  const writeAndWait = useCallback(async (functionName: string, args?: unknown[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hash = await writeContractAsync({ address: HOLDEM_PVP_CONTRACT_ADDRESS, abi: CIPHER_HOLDEM_PVP_ABI, functionName, args } as any);
    await publicClient!.waitForTransactionReceipt({ hash });
  }, [writeContractAsync, publicClient]);

  // Load friends from contract
  const loadFriends = useCallback(async () => {
    if (!deployed || !publicClient || !address) return;
    try {
      const list = await readContract('getFriends', [address]) as string[];
      setFriends(list.filter(a => a !== '0x0000000000000000000000000000000000000000'));
    } catch { /* contract offline */ }
  }, [deployed, publicClient, address, readContract]);

  // Load game invites from Supabase
  const loadInvites = useCallback(async () => {
    if (!address) return;
    try {
      const rows = await getMyGameInvites(address);
      setInvites(rows);
    } catch { /* offline */ }
  }, [address]);

  useEffect(() => {
    if (!open || !isConnected) return;
    loadFriends();
    loadInvites();
  }, [open, isConnected, loadFriends, loadInvites]);

  // Realtime invite subscription
  const unsubRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!address) return;
    unsubRef.current = subscribeToGameInvites(address, (invite) => {
      setInvites(prev => [invite, ...prev.filter(i => i.id !== invite.id)]);
    });
    return () => { unsubRef.current?.(); };
  }, [address]);

  const flashMsg = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 3000);
  };

  // ── Send friend request ────────────────────────────────────────────────────
  const handleSendRequest = async () => {
    if (!isAddr(reqInput)) { flashMsg('Invalid address'); return; }
    if (reqInput.toLowerCase() === address?.toLowerCase()) { flashMsg('Cannot add yourself'); return; }
    setLoading(true);
    try {
      await writeAndWait('sendFriendRequest', [reqInput as `0x${string}`]);
      flashMsg(`Request sent to ${truncAddr(reqInput)}`);
      setReqInput('');
      await loadFriends();
    } catch (e) { flashMsg(e instanceof Error ? e.message.slice(0, 60) : 'Failed'); }
    setLoading(false);
  };

  // ── Accept pending friend request ──────────────────────────────────────────
  const handleAccept = async (fromAddr: string) => {
    setLoading(true);
    try {
      await writeAndWait('acceptFriendRequest', [fromAddr as `0x${string}`]);
      flashMsg('Friend added!');
      await loadFriends();
    } catch (e) { flashMsg(e instanceof Error ? e.message.slice(0, 60) : 'Failed'); }
    setLoading(false);
  };

  // ── Remove friend ──────────────────────────────────────────────────────────
  const handleRemove = async (friendAddr: string) => {
    setLoading(true);
    try {
      await writeAndWait('removeFriend', [friendAddr as `0x${string}`]);
      setFriends(prev => prev.filter(a => a.toLowerCase() !== friendAddr.toLowerCase()));
      flashMsg('Friend removed');
    } catch (e) { flashMsg(e instanceof Error ? e.message.slice(0, 60) : 'Failed'); }
    setLoading(false);
  };

  // ── Send game invite ───────────────────────────────────────────────────────
  const handleGameInvite = async (toAddr: string) => {
    if (!activeTableId || !address) return;
    setLoading(true);
    try {
      await writeAndWait('sendGameInvite', [toAddr as `0x${string}`, BigInt(activeTableId)]);
      await sendGameInviteDB(address, toAddr, activeTableId);
      flashMsg(`Invite sent to ${truncAddr(toAddr)}`);
    } catch (e) { flashMsg(e instanceof Error ? e.message.slice(0, 60) : 'Failed'); }
    setLoading(false);
  };

  // ── Accept game invite ─────────────────────────────────────────────────────
  const handleAcceptGameInvite = async (invite: GameInviteRow) => {
    setLoading(true);
    try {
      await writeAndWait('acceptGameInvite', [invite.from_addr as `0x${string}`]);
      await respondToGameInvite(invite.id, 'accepted');
      setInvites(prev => prev.filter(i => i.id !== invite.id));
      onAcceptInvite?.(invite.table_id, invite.from_addr);
    } catch (e) { flashMsg(e instanceof Error ? e.message.slice(0, 60) : 'Failed'); }
    setLoading(false);
  };

  // ── Decline game invite ────────────────────────────────────────────────────
  const handleDeclineGameInvite = async (invite: GameInviteRow) => {
    try {
      await writeAndWait('declineGameInvite', [invite.from_addr as `0x${string}`]);
      await respondToGameInvite(invite.id, 'declined');
      setInvites(prev => prev.filter(i => i.id !== invite.id));
    } catch { /* ignore */ }
  };

  if (!isConnected || !deployed) return null;

  const pendingInviteCount = invites.length;

  return (
    <div className="relative">
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all"
        style={{
          background: open ? 'rgba(0,191,255,0.12)' : 'rgba(255,255,255,0.05)',
          border:     open ? '1px solid rgba(0,191,255,0.3)' : '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <Users size={14} style={{ color: open ? '#00BFFF' : 'rgba(255,255,255,0.5)' }} />
        <span style={{ ...cp(600, 11, '0.06em'), color: open ? '#00BFFF' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
          Friends
        </span>
        {friends.length > 0 && (
          <span className="px-1.5 py-0.5 rounded-full font-mono text-[9px]"
            style={{ background: 'rgba(0,191,255,0.15)', color: '#00BFFF' }}>
            {friends.length}
          </span>
        )}
        {pendingInviteCount > 0 && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full font-mono text-[9px]"
            style={{ background: 'rgba(255,165,0,0.2)', color: '#FFA500', border: '1px solid rgba(255,165,0,0.3)' }}>
            <Bell size={8} />
            {pendingInviteCount}
          </span>
        )}
        {open ? <ChevronUp size={12} style={{ color: 'rgba(255,255,255,0.4)' }} /> : <ChevronDown size={12} style={{ color: 'rgba(255,255,255,0.4)' }} />}
      </button>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 z-50 w-80 rounded-2xl overflow-hidden"
            style={{ background: '#0F1318', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 16px 40px rgba(0,0,0,0.6)' }}
          >
            <div className="p-4 space-y-4 max-h-[480px] overflow-y-auto">

              {/* Flash message */}
              {msg && (
                <div className="px-3 py-2 rounded-lg font-mono text-[11px]"
                  style={{ background: 'rgba(0,191,255,0.08)', border: '1px solid rgba(0,191,255,0.2)', color: '#00BFFF' }}>
                  {msg}
                </div>
              )}

              {/* Game invites */}
              {invites.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Bell size={11} style={{ color: '#FFA500' }} />
                    <span style={{ ...cp(600, 10, '0.1em'), color: '#FFA500', textTransform: 'uppercase' }}>
                      Game Invites
                    </span>
                  </div>
                  <div className="space-y-2">
                    {invites.map(inv => (
                      <div key={inv.id} className="flex items-center gap-2 px-3 py-2 rounded-xl"
                        style={{ background: 'rgba(255,165,0,0.06)', border: '1px solid rgba(255,165,0,0.2)' }}>
                        <Swords size={12} style={{ color: '#FFA500', flexShrink: 0 }} />
                        <span style={{ ...cp(400, 11), color: 'rgba(255,255,255,0.7)', flex: 1 }}>
                          {truncAddr(inv.from_addr)} → Table #{inv.table_id}
                        </span>
                        <button onClick={() => handleAcceptGameInvite(inv)} disabled={loading}
                          className="p-1.5 rounded-lg transition-all disabled:opacity-40"
                          style={{ background: 'rgba(0,232,108,0.15)', border: '1px solid rgba(0,232,108,0.25)' }}>
                          <Check size={12} style={{ color: '#00E86C' }} />
                        </button>
                        <button onClick={() => handleDeclineGameInvite(inv)} disabled={loading}
                          className="p-1.5 rounded-lg transition-all disabled:opacity-40"
                          style={{ background: 'rgba(255,59,59,0.1)', border: '1px solid rgba(255,59,59,0.2)' }}>
                          <X size={12} style={{ color: '#FF3B3B' }} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add friend */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <UserPlus size={11} style={{ color: 'rgba(255,255,255,0.4)' }} />
                  <span style={{ ...cp(600, 10, '0.1em'), color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
                    Add Friend
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    value={reqInput}
                    onChange={e => setReqInput(e.target.value)}
                    placeholder="0x address..."
                    className="flex-1 px-3 py-2 rounded-xl font-mono text-[11px] outline-none"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
                    onKeyDown={e => e.key === 'Enter' && handleSendRequest()}
                  />
                  <button
                    onClick={handleSendRequest}
                    disabled={loading || !isAddr(reqInput)}
                    className="px-3 py-2 rounded-xl transition-all disabled:opacity-40"
                    style={{ background: 'rgba(0,191,255,0.15)', border: '1px solid rgba(0,191,255,0.3)' }}
                  >
                    <Send size={13} style={{ color: '#00BFFF' }} />
                  </button>
                </div>
              </div>

              {/* Friends list */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Users size={11} style={{ color: 'rgba(255,255,255,0.4)' }} />
                  <span style={{ ...cp(600, 10, '0.1em'), color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
                    Friends · {friends.length}
                  </span>
                </div>

                {friends.length === 0 ? (
                  <p style={{ ...cp(400, 11), color: 'rgba(255,255,255,0.2)' }}>
                    No friends yet — send a request above
                  </p>
                ) : (
                  <div className="space-y-1">
                    {friends.map(f => (
                      <div key={f} className="flex items-center gap-2 px-3 py-2 rounded-xl group"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                          style={{ background: 'rgba(0,191,255,0.15)', border: '1px solid rgba(0,191,255,0.2)' }}>
                          <span style={{ ...cp(700, 9), color: '#00BFFF' }}>{f.slice(2, 4).toUpperCase()}</span>
                        </div>
                        <span style={{ ...cp(400, 11), color: 'rgba(255,255,255,0.7)', flex: 1 }}>
                          {truncAddr(f)}
                        </span>
                        {/* Invite to active table */}
                        {activeTableId && (
                          <button
                            onClick={() => handleGameInvite(f)}
                            disabled={loading}
                            title="Invite to your table"
                            className="p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-all disabled:opacity-40"
                            style={{ background: 'rgba(255,165,0,0.12)', border: '1px solid rgba(255,165,0,0.25)' }}
                          >
                            <Swords size={11} style={{ color: '#FFA500' }} />
                          </button>
                        )}
                        <button
                          onClick={() => handleRemove(f)}
                          disabled={loading}
                          title="Remove friend"
                          className="p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-all disabled:opacity-40"
                          style={{ background: 'rgba(255,59,59,0.08)', border: '1px solid rgba(255,59,59,0.15)' }}
                        >
                          <X size={11} style={{ color: '#FF3B3B' }} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pending sent requests tip */}
              <p style={{ ...cp(400, 10, '0.06em'), color: 'rgba(255,255,255,0.15)' }}>
                Requests confirmed on-chain. Ask your friend to accept via the Friends panel.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
