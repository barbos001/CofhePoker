import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

const BUY_IN_OPTIONS = [10, 25, 50, 100];

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (buyIn: number, isPrivate: boolean) => Promise<number | void>;
}

export const CreateTableModal = ({ open, onClose, onCreate }: Props) => {
  const [buyIn, setBuyIn]       = useState(25);
  const [isPrivate, setPrivate] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleCreate = async () => {
    setLoading(true);
    setError('');
    try {
      await onCreate(buyIn, isPrivate);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create table');
    }
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
            className="w-full max-w-[400px] rounded-2xl p-6"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border:     '1px solid rgba(255,255,255,0.08)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h2 className="font-clash text-2xl tracking-tight mb-6" style={{ color: 'var(--color-primary)' }}>
              Create Table
            </h2>

            {/* Buy-in */}
            <div className="mb-5">
              <label className="font-mono text-xs tracking-widest uppercase mb-2 block" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Buy-in (chips)
              </label>
              <div className="flex gap-2">
                {BUY_IN_OPTIONS.map(v => (
                  <button
                    key={v}
                    onClick={() => setBuyIn(v)}
                    className="flex-1 h-10 rounded-xl font-mono text-sm font-bold transition-all"
                    style={{
                      background: buyIn === v ? 'var(--color-primary)' : 'rgba(255,255,255,0.04)',
                      color:      buyIn === v ? '#000' : 'rgba(255,255,255,0.6)',
                      border:     buyIn === v ? 'none' : '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Private toggle */}
            <div className="mb-8">
              <button
                onClick={() => setPrivate(!isPrivate)}
                className="flex items-center gap-3 w-full py-3 px-4 rounded-xl font-mono text-sm transition-all"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border:     '1px solid rgba(255,255,255,0.06)',
                  color:      'rgba(255,255,255,0.7)',
                }}
              >
                <div
                  className="w-10 h-5 rounded-full relative transition-all"
                  style={{
                    background: isPrivate ? 'var(--color-fhe)' : 'rgba(255,255,255,0.1)',
                  }}
                >
                  <div
                    className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                    style={{ left: isPrivate ? 20 : 2 }}
                  />
                </div>
                <span>Private (invite only)</span>
                {isPrivate && <span className="ml-auto text-xs" style={{ color: 'var(--color-fhe)' }}>🔒</span>}
              </button>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-4 px-4 py-2.5 rounded-xl font-mono text-xs"
                style={{ background: 'rgba(255,59,59,0.08)', border: '1px solid rgba(255,59,59,0.2)', color: 'var(--color-danger)' }}>
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 h-11 rounded-xl font-mono text-sm tracking-wider uppercase transition-all"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border:     '1px solid rgba(255,255,255,0.08)',
                  color:      'rgba(255,255,255,0.5)',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={loading}
                className="flex-1 h-11 rounded-xl font-mono text-sm font-bold tracking-wider uppercase transition-all disabled:opacity-50"
                style={{
                  background: 'var(--color-primary)',
                  color:      '#000',
                }}
              >
                {loading ? 'Creating…' : 'Create'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
