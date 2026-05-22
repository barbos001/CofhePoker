/**
 * PvPChat — Real-time cross-device PvP chat via Supabase Realtime.
 * Falls back to localStorage when Supabase is not configured.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send } from 'lucide-react';
import { useAccount } from 'wagmi';
import { useProfileStore } from '@/store/useProfileStore';
import {
  sendChatMessage,
  getChatHistory,
  subscribeToChatMessages,
} from '@/lib/db';
import { isSupabaseEnabled } from '@/config/supabase';
import type { ChatMessageRow } from '@/config/supabase';

const cp = (w: number, s: number | string, sp = '0.03em') => ({
  fontFamily: "'Chakra Petch', sans-serif", fontWeight: w, fontSize: s, letterSpacing: sp,
});

const EMOTES = ['👍', '🃏', '💀', '🎰', '🔥', 'gg', '🤝', '😤', '🥶'];

// ── LocalStorage fallback (same browser, demo mode) ───────────────────────────
const LS_KEY = (tableId: number) => `pvp-chat-${tableId}`;

function lsRead(tableId: number): ChatMessageRow[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY(tableId)) ?? '[]'); }
  catch { return []; }
}
function lsWrite(tableId: number, msg: ChatMessageRow) {
  const msgs = [...lsRead(tableId), msg].slice(-100);
  localStorage.setItem(LS_KEY(tableId), JSON.stringify(msgs));
  window.dispatchEvent(new StorageEvent('storage', { key: LS_KEY(tableId) }));
}

// ── Single message bubble ─────────────────────────────────────────────────────
const Bubble = ({ msg, myAddress }: { msg: ChatMessageRow; myAddress: string }) => {
  const isMe     = msg.sender === myAddress;
  const isSystem = msg.sender === 'system';
  const time     = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (isSystem) return (
    <div className="text-center font-mono text-[9px] tracking-wider my-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
      {msg.text}
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-1`}
    >
      <div className="max-w-[80%]">
        {!isMe && (
          <div className="font-mono text-[9px] mb-0.5 ml-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {msg.sender_name ?? `${msg.sender.slice(0, 6)}…`}
          </div>
        )}
        <div
          className="px-3 py-1.5 rounded-xl font-mono text-[11px]"
          style={{
            background: isMe ? 'rgba(179,102,255,0.18)' : 'rgba(255,255,255,0.06)',
            border:     `1px solid ${isMe ? 'rgba(179,102,255,0.35)' : 'rgba(255,255,255,0.08)'}`,
            color:      isMe ? '#D4A6FF' : 'rgba(255,255,255,0.75)',
          }}
        >
          {msg.text}
        </div>
        <div className="font-mono text-[8px] mt-0.5 mx-1" style={{ color: 'rgba(255,255,255,0.2)', textAlign: isMe ? 'right' : 'left' }}>
          {time}
        </div>
      </div>
    </motion.div>
  );
};

// ── Main chat panel ───────────────────────────────────────────────────────────
interface PvPChatProps {
  tableId:         number | null;
  opponentAddress: string;
  isOpen:          boolean;
  onClose:         () => void;
}

export const PvPChat = ({ tableId, opponentAddress, isOpen, onClose }: PvPChatProps) => {
  const { address }  = useAccount();
  const { username } = useProfileStore();
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [input,    setInput]    = useState('');
  const [muted,    setMuted]    = useState(false);
  const [unread,   setUnread]   = useState(0);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const openRef    = useRef(isOpen);
  openRef.current  = isOpen;

  // ── Load history + subscribe ─────────────────────────────────────────────
  useEffect(() => {
    if (!tableId) return;
    setMessages([]);
    setUnread(0);

    if (isSupabaseEnabled) {
      // Load recent history
      getChatHistory(tableId, 50).then(msgs => setMessages(msgs));

      // Subscribe to new messages
      const unsub = subscribeToChatMessages(tableId, (msg) => {
        setMessages(prev => [...prev, msg]);
        if (!openRef.current) setUnread(n => n + 1);
      });
      return unsub;
    } else {
      // LocalStorage fallback
      setMessages(lsRead(tableId));
      const handler = (e: StorageEvent) => {
        if (e.key === LS_KEY(tableId)) setMessages(lsRead(tableId));
      };
      window.addEventListener('storage', handler);
      const poll = setInterval(() => setMessages(lsRead(tableId)), 3000);
      return () => { window.removeEventListener('storage', handler); clearInterval(poll); };
    }
  }, [tableId]);

  // Reset unread when panel opens
  useEffect(() => { if (isOpen) setUnread(0); }, [isOpen]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!tableId || !text.trim() || !address) return;
    const sender     = address;
    const senderName = username || `${address.slice(0, 6)}…${address.slice(-4)}`;
    setInput('');

    const optimistic: ChatMessageRow = {
      id:          `opt-${Date.now()}`,
      table_id:    tableId,
      sender,
      sender_name: senderName,
      text:        text.trim(),
      created_at:  new Date().toISOString(),
    };

    if (isSupabaseEnabled) {
      // Optimistic update
      setMessages(prev => [...prev, optimistic]);
      try {
        await sendChatMessage(tableId, sender, senderName, text.trim());
      } catch {
        setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      }
    } else {
      // LocalStorage fallback
      lsWrite(tableId, optimistic);
      setMessages(lsRead(tableId));
    }
  }, [tableId, address, username]);

  const short = (addr: string) => addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '???';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 20, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 20, scale: 0.96 }}
          transition={{ type: 'spring', damping: 24 }}
          className="fixed bottom-24 md:bottom-8 right-4 z-[100] flex flex-col"
          style={{
            width: 300, height: 400,
            background: '#0A0D12',
            border: '1px solid rgba(179,102,255,0.25)',
            borderRadius: 16,
            boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div>
              <div style={{ ...cp(600, 12, '0.06em'), color: 'white' }}>Table Chat</div>
              <div style={{ ...cp(400, 10, '0.04em'), color: 'rgba(255,255,255,0.3)' }}>
                vs {short(opponentAddress)}
                {!isSupabaseEnabled && (
                  <span style={{ color: 'rgba(255,140,66,0.7)', marginLeft: 4 }}>(local only)</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMuted(m => !m)}
                className="px-2 py-0.5 rounded font-mono text-[9px] uppercase"
                style={{ color: muted ? 'var(--color-danger)' : 'rgba(255,255,255,0.3)', border: `1px solid ${muted ? 'rgba(255,59,59,0.3)' : 'rgba(255,255,255,0.08)'}` }}
              >
                {muted ? 'UNMUTE' : 'MUTE'}
              </button>
              <button onClick={onClose}><X size={14} style={{ color: 'rgba(255,255,255,0.4)' }} /></button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {messages.length === 0 && (
              <p className="text-center font-mono text-[10px] py-6" style={{ color: 'rgba(255,255,255,0.2)' }}>
                {isSupabaseEnabled ? 'Connected — say hi!' : 'Local mode — open on same browser to chat'}
              </p>
            )}
            {messages
              .filter(m => m.sender !== opponentAddress || !muted)
              .map(msg => <Bubble key={msg.id} msg={msg} myAddress={address ?? ''} />)
            }
            <div ref={bottomRef} />
          </div>

          {/* Emote bar */}
          <div className="px-3 py-1.5 flex gap-1 flex-wrap shrink-0"
            style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            {EMOTES.map(e => (
              <button key={e} onClick={() => sendMessage(e)}
                className="h-7 min-w-[28px] px-1.5 rounded-lg font-mono text-xs transition-all hover:scale-110"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                {e}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="px-3 pb-3 flex gap-2 shrink-0">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
              maxLength={120}
              placeholder="Say something…"
              className="flex-1 px-3 py-2 rounded-xl font-mono text-[11px] outline-none"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'white' }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim()}
              className="w-9 h-9 rounded-xl flex items-center justify-center disabled:opacity-30"
              style={{ background: 'rgba(179,102,255,0.15)', border: '1px solid rgba(179,102,255,0.3)' }}>
              <Send size={13} style={{ color: '#B366FF' }} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ── Chat toggle button ────────────────────────────────────────────────────────
export const ChatButton = ({ unread, onClick }: { unread: number; onClick: () => void }) => (
  <motion.button
    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
    onClick={onClick}
    className="relative flex items-center gap-2 h-9 px-4 rounded-full font-mono text-[11px] tracking-widest uppercase"
    style={{ background: 'rgba(179,102,255,0.1)', border: '1px solid rgba(179,102,255,0.25)', color: '#B366FF' }}
  >
    <MessageCircle size={13} />
    CHAT
    {unread > 0 && (
      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center font-mono text-[9px] font-bold"
        style={{ background: 'var(--color-danger)', color: '#fff' }}>
        {unread}
      </span>
    )}
  </motion.button>
);
