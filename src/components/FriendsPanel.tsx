import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { useFriends } from '@/hooks/useFriends';
import { useInvites } from '@/hooks/useInvites';
import { usePvPGameStore } from '@/store/usePvPGameStore';

const truncAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export const FriendsPanel = () => {
  const { friends, incomingRequests, sendRequest, acceptRequest, removeFriend, isLoading } = useFriends();
  const { sendInvite } = useInvites();
  const { tableId, pvpState } = usePvPGameStore();

  const [addAddr, setAddAddr]   = useState('');
  const [sending, setSending]   = useState(false);
  const [error, setError]       = useState('');
  const [expanded, setExpanded] = useState(true);

  const canInvite = pvpState === 'waiting' && tableId;

  const handleAdd = async () => {
    if (!addAddr.startsWith('0x') || addAddr.length < 10) return;
    setSending(true);
    setError('');
    try {
      await sendRequest(addAddr);
      setAddAddr('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send request');
    }
    setSending(false);
  };

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.05)',
        border:     '1px solid rgba(255,255,255,0.12)',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">👥</span>
          <span className="font-mono text-sm font-bold tracking-wider uppercase" style={{ color: 'rgba(255,255,255,0.9)' }}>
            Friends
          </span>
          {friends.length > 0 && (
            <span
              className="px-2 py-0.5 rounded-full font-mono text-[10px]"
              style={{ background: 'rgba(0,232,108,0.08)', color: 'var(--color-success)' }}
            >
              {friends.length}
            </span>
          )}
          {incomingRequests.length > 0 && (
            <span
              className="px-2 py-0.5 rounded-full font-mono text-[10px] animate-pulse"
              style={{ background: 'rgba(255,140,66,0.12)', color: 'var(--color-deco-orange)' }}
            >
              {incomingRequests.length} new
            </span>
          )}
        </div>
        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-3">
              {/* Incoming requests */}
              {incomingRequests.length > 0 && (
                <div className="space-y-2">
                  <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    Pending Requests
                  </span>
                  {incomingRequests.map(r => (
                    <div key={r.from} className="flex items-center gap-2">
                      <span className="font-mono text-xs flex-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
                        {truncAddr(r.from)}
                      </span>
                      <button
                        onClick={() => acceptRequest(r.from)}
                        className="px-3 py-1 rounded-lg font-mono text-[10px] font-bold"
                        style={{ background: 'rgba(0,232,108,0.1)', color: 'var(--color-success)' }}
                      >
                        Accept
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Friends list */}
              {isLoading ? (
                <div className="font-mono text-xs text-center py-4" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  Loading…
                </div>
              ) : friends.length === 0 ? (
                <div className="font-mono text-xs text-center py-4" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  No friends yet — add someone below
                </div>
              ) : (
                <div className="space-y-1">
                  {friends.map(f => (
                    <div
                      key={f.address}
                      className="flex items-center gap-2 py-2 px-3 rounded-xl transition-colors"
                      style={{ background: 'rgba(255,255,255,0.02)' }}
                    >
                      {/* Online dot */}
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{
                          background: f.inGame ? 'var(--color-fhe)' : f.isOnline ? 'var(--color-success)' : 'rgba(255,255,255,0.2)',
                          boxShadow:  f.inGame ? '0 0 6px rgba(179,102,255,0.4)' : f.isOnline ? '0 0 4px rgba(0,232,108,0.3)' : 'none',
                        }}
                      />
                      <span className="font-mono text-xs flex-1" style={{ color: 'rgba(255,255,255,0.7)' }}>
                        {truncAddr(f.address)}
                      </span>
                      {f.inGame && (
                        <span className="font-mono text-[9px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(179,102,255,0.08)', color: 'var(--color-fhe)' }}>
                          IN GAME
                        </span>
                      )}
                      {canInvite && !f.inGame && (
                        <button
                          onClick={() => sendInvite(f.address, tableId!)}
                          className="px-2 py-1 rounded-lg font-mono text-[10px] font-bold transition-all hover:opacity-80"
                          style={{ background: 'rgba(255,224,61,0.08)', color: 'var(--color-primary)' }}
                        >
                          Invite
                        </button>
                      )}
                      <button
                        onClick={() => removeFriend(f.address)}
                        className="text-xs opacity-30 hover:opacity-70 transition-opacity"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add friend input */}
              <div className="flex gap-2 pt-2">
                <input
                  value={addAddr}
                  onChange={e => setAddAddr(e.target.value)}
                  placeholder="0x address…"
                  className="flex-1 h-10 px-3 rounded-xl font-mono text-xs"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border:  '1px solid rgba(255,255,255,0.15)',
                    color:   'rgba(255,255,255,0.8)',
                    outline: 'none',
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = 'rgba(0,232,108,0.4)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'}
                />
                <button
                  onClick={handleAdd}
                  disabled={sending || !addAddr}
                  className="h-10 px-5 rounded-xl font-mono text-xs font-bold tracking-wider uppercase disabled:opacity-40 transition-all"
                  style={{
                    background: 'var(--color-success)',
                    color:      '#000',
                    boxShadow:  '0 0 8px rgba(0,232,108,0.3)',
                  }}
                >
                  {sending ? '...' : 'ADD'}
                </button>
              </div>
              {error && (
                <div className="font-mono text-[10px] px-2 py-1.5 rounded-lg" style={{ background: 'rgba(255,59,59,0.08)', color: 'var(--color-danger)' }}>
                  {error}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
