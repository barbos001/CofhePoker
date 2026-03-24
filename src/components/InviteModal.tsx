import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

const truncAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

interface Props {
  open:      boolean;
  onClose:   () => void;
  // Share mode: show link to copy
  inviteLink?: string;
  // Receive mode: show accept/decline
  fromAddress?: string;
  buyIn?:       number;
  onAccept?:    () => Promise<void>;
  onDecline?:   () => Promise<void>;
}

export const InviteModal = ({ open, onClose, inviteLink, fromAddress, buyIn, onAccept, onDecline }: Props) => {
  const [copied, setCopied]   = useState(false);
  const [loading, setLoading] = useState(false);
  const isShare = !!inviteLink;

  const copyLink = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAccept = async () => {
    setLoading(true);
    try { await onAccept?.(); onClose(); } catch {}
    setLoading(false);
  };

  const handleDecline = async () => {
    setLoading(true);
    try { await onDecline?.(); onClose(); } catch {}
    setLoading(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            className="w-full max-w-[420px] rounded-2xl p-6"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border:     '1px solid rgba(255,255,255,0.08)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {isShare ? (
              <>
                <h2 className="font-clash text-xl mb-1" style={{ color: 'var(--color-primary)' }}>
                  Share Invite Link
                </h2>
                <p className="font-mono text-xs mb-5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Send this link to a friend to join your private table
                </p>

                <div
                  className="flex items-center gap-2 p-3 rounded-xl mb-5 font-mono text-xs break-all"
                  style={{
                    background: 'rgba(0,0,0,0.3)',
                    border:     '1px solid rgba(255,255,255,0.06)',
                    color:      'rgba(255,255,255,0.6)',
                  }}
                >
                  <span className="flex-1 truncate">{inviteLink}</span>
                </div>

                <button
                  onClick={copyLink}
                  className="w-full h-11 rounded-xl font-mono text-sm font-bold tracking-wider uppercase transition-all"
                  style={{
                    background: copied ? 'var(--color-success)' : 'var(--color-primary)',
                    color:      '#000',
                  }}
                >
                  {copied ? 'Copied ✓' : 'Copy Link'}
                </button>
              </>
            ) : (
              <>
                <h2 className="font-clash text-xl mb-1" style={{ color: 'var(--color-fhe)' }}>
                  Game Invite
                </h2>
                <p className="font-mono text-xs mb-5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <span style={{ color: 'var(--color-primary)' }}>{fromAddress ? truncAddr(fromAddress) : '???'}</span>
                  {' '}invited you to play
                  {buyIn ? ` · Buy-in: ${buyIn} chips` : ''}
                </p>

                <div className="flex gap-3">
                  <button
                    onClick={handleDecline}
                    disabled={loading}
                    className="flex-1 h-11 rounded-xl font-mono text-sm tracking-wider uppercase transition-all disabled:opacity-50"
                    style={{
                      background: 'rgba(255,59,59,0.08)',
                      border:     '1px solid rgba(255,59,59,0.2)',
                      color:      'var(--color-danger)',
                    }}
                  >
                    Decline
                  </button>
                  <button
                    onClick={handleAccept}
                    disabled={loading}
                    className="flex-1 h-11 rounded-xl font-mono text-sm font-bold tracking-wider uppercase transition-all disabled:opacity-50"
                    style={{
                      background: 'var(--color-success)',
                      color:      '#000',
                    }}
                  >
                    {loading ? 'Joining…' : 'Accept'}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
