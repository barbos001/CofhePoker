import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, CheckCheck, Trash2 } from 'lucide-react';
import { useNotificationsStore, Notification } from '@/store/useNotificationsStore';

const cp = (w: number, s: number | string, sp = '0.03em') => ({
  fontFamily: "'Chakra Petch', sans-serif", fontWeight: w, fontSize: s, letterSpacing: sp,
});

const TYPE_COLORS: Record<string, string> = {
  win:       '#00E86C',
  loss:      '#FF4444',
  pvp:       '#B366FF',
  challenge: '#FFE03D',
  friend:    '#00BFFF',
  system:    'rgba(255,255,255,0.5)',
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// ── Single notification item ──────────────────────────────────────────────────
const NotifItem = ({ notif, onDismiss, onRead }: {
  notif: Notification;
  onDismiss: (id: string) => void;
  onRead: (id: string) => void;
}) => {
  const color = TYPE_COLORS[notif.type] ?? 'rgba(255,255,255,0.5)';
  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
      className="flex items-start gap-3 px-4 py-3 cursor-pointer"
      style={{
        background: notif.read ? 'transparent' : 'rgba(255,255,255,0.025)',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
      onClick={() => onRead(notif.id)}
    >
      <span style={{ fontSize: 18, lineHeight: 1 }}>{notif.icon}</span>
      <div className="flex-1 min-w-0">
        <div style={{ ...cp(600, 12, '0.04em'), color: notif.read ? 'rgba(255,255,255,0.5)' : 'white' }}>
          {notif.title}
        </div>
        <div style={{ ...cp(400, 11, '0.03em'), color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>
          {notif.body}
        </div>
        <div style={{ ...cp(400, 9, '0.06em'), color: 'rgba(255,255,255,0.2)', marginTop: 3 }}>
          {timeAgo(notif.timestamp)}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {!notif.read && (
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
        )}
        <button onClick={e => { e.stopPropagation(); onDismiss(notif.id); }}
          className="p-1 rounded transition-opacity opacity-0 hover:opacity-100 group-hover:opacity-100"
          style={{ color: 'rgba(255,255,255,0.3)' }}>
          <X size={10} />
        </button>
      </div>
    </motion.div>
  );
};

// ── Bell button + dropdown ────────────────────────────────────────────────────
export const NotificationBell = () => {
  const { notifications, markAllRead, markRead, dismiss, clearAll, unreadCount } = useNotificationsStore();
  const [open, setOpen]     = useState(false);
  const panelRef            = useRef<HTMLDivElement>(null);
  const count               = unreadCount();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleOpen = useCallback(() => {
    setOpen(o => !o);
  }, []);

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative flex items-center justify-center w-9 h-9 rounded-full transition-all"
        style={{
          background: open ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${open ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)'}`,
        }}
        title="Notifications"
      >
        <motion.div
          animate={count > 0 ? { rotate: [0, -10, 10, -5, 5, 0] } : {}}
          transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 4 }}
        >
          <Bell size={15} style={{ color: count > 0 ? '#FFE03D' : 'rgba(255,255,255,0.5)' }} />
        </motion.div>
        {count > 0 && (
          <motion.div
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full flex items-center justify-center font-mono font-bold px-0.5"
            style={{ background: 'var(--color-danger)', color: '#fff', fontSize: 9, boxShadow: '0 0 6px rgba(255,59,59,0.5)' }}
          >
            {count > 9 ? '9+' : count}
          </motion.div>
        )}
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ type: 'spring', damping: 24, stiffness: 300 }}
            className="absolute right-0 top-full mt-2 z-[200] rounded-2xl overflow-hidden"
            style={{
              width: 320,
              background: '#0A0D12',
              border: '1px solid rgba(255,255,255,0.09)',
              boxShadow: '0 16px 48px rgba(0,0,0,0.7)',
              maxHeight: 420,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ ...cp(700, 13, '0.08em'), color: 'white', textTransform: 'uppercase' }}>Notifications</span>
              <div className="flex items-center gap-2">
                {count > 0 && (
                  <button onClick={markAllRead} title="Mark all read" className="p-1 rounded" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    <CheckCheck size={13} />
                  </button>
                )}
                {notifications.length > 0 && (
                  <button onClick={clearAll} title="Clear all" className="p-1 rounded" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <Bell size={24} style={{ color: 'rgba(255,255,255,0.1)' }} />
                  <p style={{ ...cp(400, 12), color: 'rgba(255,255,255,0.25)' }}>No notifications</p>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {notifications.map(n => (
                    <NotifItem key={n.id} notif={n} onDismiss={dismiss} onRead={markRead} />
                  ))}
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
