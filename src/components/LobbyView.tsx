import { motion } from 'framer-motion';
import { useState } from 'react';
import { useLobby } from '@/hooks/useLobby';
import { useInvites } from '@/hooks/useInvites';
import { FriendsPanel } from './FriendsPanel';
import { CreateTableModal } from './CreateTableModal';
import { InviteModal } from './InviteModal';
import { useInvitesStore } from '@/store/useInvitesStore';

const truncAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const timeAgo = (ts: number) => {
  const s = Math.floor((Date.now() / 1000) - ts);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};

export const LobbyView = () => {
  const { tables, isLoading, deployed, refresh, createTable, joinTable } = useLobby();
  const { acceptInvite, declineInvite } = useInvites();
  const invites = useInvitesStore(s => s.incoming);

  const [showCreate, setShowCreate]     = useState(false);
  const [showInvite, setShowInvite]     = useState<string | null>(null); // fromAddr
  const [joining, setJoining]           = useState<number | null>(null);

  const handleJoin = async (tableId: number) => {
    setJoining(tableId);
    try { await joinTable(tableId); } catch { /* */ }
    setJoining(null);
  };

  const activeInvite = invites.find(i => i.from === showInvite);

  return (
    <div className="w-full max-w-[800px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-clash text-3xl tracking-tight" style={{ color: 'var(--color-primary)' }}>
            PvP Lobby
          </h2>
          <p className="font-mono text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {deployed ? `${tables.length} open table${tables.length !== 1 ? 's' : ''}` : 'Contract not deployed'}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={refresh}
            className="h-9 px-4 rounded-xl font-mono text-xs tracking-wider uppercase transition-all"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border:     '1px solid rgba(255,255,255,0.08)',
              color:      'rgba(255,255,255,0.5)',
            }}
          >
            ↻ Refresh
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="h-9 px-5 rounded-xl font-mono text-xs font-bold tracking-wider uppercase transition-all"
            style={{
              background: 'var(--color-primary)',
              color:      '#000',
            }}
          >
            + Create Table
          </button>
        </div>
      </div>

      {/* Incoming invites banner */}
      {invites.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 p-4 rounded-xl"
          style={{
            background: 'rgba(179,102,255,0.06)',
            border:     '1px solid rgba(179,102,255,0.15)',
          }}
        >
          <div className="font-mono text-xs font-bold mb-2" style={{ color: 'var(--color-fhe)' }}>
            📩 {invites.length} Game Invite{invites.length > 1 ? 's' : ''}
          </div>
          <div className="space-y-2">
            {invites.map(inv => (
              <div key={inv.from} className="flex items-center gap-3">
                <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  {truncAddr(inv.from)} · {inv.buyIn} chips
                </span>
                <button
                  onClick={() => setShowInvite(inv.from)}
                  className="px-3 py-1 rounded-lg font-mono text-[10px] font-bold"
                  style={{ background: 'rgba(0,232,108,0.1)', color: 'var(--color-success)' }}
                >
                  View
                </button>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Tables column */}
        <div className="lg:col-span-2 space-y-2">
          {isLoading && tables.length === 0 ? (
            <div className="text-center py-16 font-mono text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Loading tables…
            </div>
          ) : tables.length === 0 ? (
            <div
              className="text-center py-16 rounded-2xl"
              style={{
                background: 'rgba(255,255,255,0.02)',
                border:     '1px dashed rgba(255,255,255,0.08)',
              }}
            >
              <div className="font-clash text-xl mb-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
                No open tables
              </div>
              <p className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
                Create one or invite a friend
              </p>
            </div>
          ) : (
            tables.map((t, i) => (
              <motion.div
                key={t.tableId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-center gap-4 px-5 py-4 rounded-xl transition-all group"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border:     '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {/* Table ID */}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center font-mono text-sm font-bold shrink-0"
                  style={{
                    background: 'rgba(255,224,61,0.06)',
                    color:      'var(--color-primary)',
                  }}
                >
                  #{t.tableId}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
                    {truncAddr(t.creator)}
                  </div>
                  <div className="font-mono text-[10px] flex items-center gap-2 mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    <span>{t.buyIn} chips buy-in</span>
                    <span>·</span>
                    <span>{timeAgo(t.createdAt)}</span>
                  </div>
                </div>

                {/* Player count */}
                <div className="flex gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: 'var(--color-success)' }} />
                  <span className="w-2 h-2 rounded-full" style={{ background: t.playerCount > 1 ? 'var(--color-success)' : 'rgba(255,255,255,0.1)' }} />
                </div>

                {/* Join */}
                <button
                  onClick={() => handleJoin(t.tableId)}
                  disabled={joining === t.tableId}
                  className="h-9 px-5 rounded-xl font-mono text-xs font-bold tracking-wider uppercase transition-all disabled:opacity-50 shrink-0"
                  style={{
                    background: 'rgba(0,232,108,0.08)',
                    border:     '1px solid rgba(0,232,108,0.15)',
                    color:      'var(--color-success)',
                  }}
                >
                  {joining === t.tableId ? '…' : 'Join'}
                </button>
              </motion.div>
            ))
          )}
        </div>

        {/* Friends panel */}
        <div className="lg:col-span-1">
          <FriendsPanel />
        </div>
      </div>

      {/* Modals */}
      <CreateTableModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={createTable}
      />

      <InviteModal
        open={!!showInvite}
        onClose={() => setShowInvite(null)}
        fromAddress={activeInvite?.from}
        buyIn={activeInvite?.buyIn}
        onAccept={activeInvite ? () => acceptInvite(activeInvite.from) : undefined}
        onDecline={activeInvite ? () => declineInvite(activeInvite.from) : undefined}
      />
    </div>
  );
};
