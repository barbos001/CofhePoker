import { motion } from 'framer-motion';
import { usePvPGameStore } from '@/store/usePvPGameStore';
import { usePvPGame } from '@/hooks/usePvPGame';
import { usePvPEvents } from '@/hooks/usePvPEvents';
import { useLobby } from '@/hooks/useLobby';
import { useInvites } from '@/hooks/useInvites';
import { LobbyView } from './LobbyView';
import { PvPTableView } from './PvPTableView';
import { InviteModal } from './InviteModal';
import { useState } from 'react';

const truncAddr = (a: string) => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '???';

// ── Waiting View (created table, no opponent yet) ──
const WaitingView = () => {
  const { tableId, statusMsg, opponentAddress } = usePvPGameStore();
  const { leaveTable } = useLobby();
  const { generateInviteLink } = useInvites();

  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [showShare, setShowShare]   = useState(false);

  const handleGetLink = async () => {
    if (!tableId) return;
    const link = await generateInviteLink(tableId);
    setInviteLink(link);
    setShowShare(true);
  };

  // If opponent joined while we were waiting, transition should happen via events
  if (opponentAddress) return null;

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-112px)] py-12 relative overflow-hidden">
      <div
        className="absolute pointer-events-none"
        style={{
          width:      500, height:     500,
          top:        '40%', left:       '50%',
          transform:  'translate(-50%, -50%)',
          background: 'radial-gradient(circle, rgba(179,102,255,0.06) 0%, transparent 60%)',
          animation:  'ambient-breathe 4s ease-in-out infinite',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center z-10"
      >
        {/* Animated waiting indicator */}
        <div className="relative mb-8">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            className="w-20 h-20 rounded-full"
            style={{
              border:     '2px solid rgba(179,102,255,0.15)',
              borderTop:  '2px solid var(--color-fhe)',
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl">⚔</span>
          </div>
        </div>

        <h2 className="font-clash text-3xl tracking-tight mb-2" style={{ color: 'var(--color-primary)' }}>
          Waiting for Opponent
        </h2>

        <p className="font-mono text-xs tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Table #{tableId}
        </p>

        <p className="font-mono text-xs mb-8" style={{ color: statusMsg.color }}>
          {statusMsg.text}
        </p>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleGetLink}
            className="h-10 px-6 rounded-xl font-mono text-xs font-bold tracking-wider uppercase transition-all"
            style={{
              background: 'rgba(179,102,255,0.08)',
              border:     '1px solid rgba(179,102,255,0.2)',
              color:      'var(--color-fhe)',
            }}
          >
            🔗 Share Invite
          </button>

          <button
            onClick={leaveTable}
            className="h-10 px-6 rounded-xl font-mono text-xs tracking-wider uppercase transition-all"
            style={{
              background: 'rgba(255,59,59,0.06)',
              border:     '1px solid rgba(255,59,59,0.15)',
              color:      'var(--color-danger)',
            }}
          >
            Cancel
          </button>
        </div>

        {/* Pulsing dots */}
        <div className="flex gap-2 mt-10">
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full"
              style={{ background: 'var(--color-fhe)' }}
              animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.1, 0.8] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }}
            />
          ))}
        </div>
      </motion.div>

      <InviteModal
        open={showShare}
        onClose={() => setShowShare(false)}
        inviteLink={inviteLink ?? ''}
      />
    </div>
  );
};

// ── Seated View (both players, start hand) ──
const SeatedView = () => {
  const { opponentAddress } = usePvPGameStore();
  const { startPvPHand } = usePvPGame();
  const { leaveTable }   = useLobby();

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-112px)] py-12 relative overflow-hidden">
      <div
        className="absolute pointer-events-none"
        style={{
          width: 500, height: 500, top: '40%', left: '50%', transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(circle, rgba(0,232,108,0.05) 0%, transparent 60%)',
          animation: 'ambient-breathe 3s ease-in-out infinite',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center z-10"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', damping: 15 }}
          className="w-16 h-16 rounded-full flex items-center justify-center mb-6"
          style={{
            background: 'rgba(0,232,108,0.08)',
            border:     '2px solid rgba(0,232,108,0.2)',
          }}
        >
          <span className="text-xl" style={{ color: 'var(--color-success)' }}>✓</span>
        </motion.div>

        <h2 className="font-clash text-3xl tracking-tight mb-2" style={{ color: 'var(--color-success)' }}>
          Opponent Found
        </h2>

        <div
          className="flex items-center gap-2 mb-8 px-4 py-2 rounded-full font-mono text-sm"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border:     '1px solid rgba(255,255,255,0.08)',
            color:      'rgba(255,255,255,0.6)',
          }}
        >
          <span className="w-2 h-2 rounded-full" style={{ background: 'var(--color-danger)', boxShadow: '0 0 4px rgba(255,59,59,0.4)' }} />
          {truncAddr(opponentAddress ?? '')}
        </div>

        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={startPvPHand}
          className="font-clash text-xl tracking-widest uppercase px-14 py-4 rounded-full text-black font-bold mb-4"
          style={{
            background: 'var(--color-primary)',
            animation:  'glow-yellow 2.5s ease-in-out infinite',
          }}
        >
          ⚔ START HAND
        </motion.button>

        <button
          onClick={leaveTable}
          className="font-mono text-xs transition-colors hover:text-white mt-2"
          style={{ color: 'var(--color-text-dark)' }}
        >
          Leave Table
        </button>
      </motion.div>
    </div>
  );
};

// ── Main PvP Tab ──
export const PvPTab = () => {
  const { pvpState } = usePvPGameStore();

  // Start event listeners
  usePvPEvents();

  // Route to correct sub-view based on PvP state
  if (pvpState === 'idle') {
    return (
      <div className="py-8 px-4">
        <LobbyView />
      </div>
    );
  }

  if (pvpState === 'waiting') {
    return <WaitingView />;
  }

  if (pvpState === 'seated') {
    return <SeatedView />;
  }

  // Active game states: dealing, decrypting, acting, waitingOpponent, showdown, result
  return <PvPTableView />;
};
