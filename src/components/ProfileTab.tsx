import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount } from 'wagmi';
import { useProfileStore, AvatarId, xpToLevel, LEVEL_PERKS, ALL_ACHIEVEMENTS } from '@/store/useProfileStore';
import { useGameStore } from '@/store/useGameStore';

const cp = (weight: number, size: number | string, spacing = '0.03em') => ({
  fontFamily: "'Chakra Petch', sans-serif",
  fontWeight: weight,
  fontSize: size,
  letterSpacing: spacing,
});

// ── Avatar options ────────────────────────────────────────────────────────────
const AVATAR_OPTIONS: { id: AvatarId; label: string; glyph: string; color: string }[] = [
  { id: 'ace-spades',    label: 'Ace of Spades',    glyph: '🂡', color: '#fff' },
  { id: 'ace-hearts',    label: 'Ace of Hearts',    glyph: '🂱', color: '#FF4444' },
  { id: 'king-clubs',    label: 'King of Clubs',    glyph: '🃞', color: '#fff' },
  { id: 'queen-diamonds',label: 'Queen of Diamonds',glyph: '🃍', color: '#FF4444' },
  { id: 'joker',         label: 'Joker',             glyph: '🃏', color: '#B366FF' },
  { id: 'chip-stack',    label: 'Chip Stack',        glyph: '🪙', color: '#FFE03D' },
  { id: 'dice',          label: 'Dice',              glyph: '🎲', color: '#00BFFF' },
  { id: 'crown',         label: 'Crown',             glyph: '👑', color: '#FFE03D' },
];

const AVATAR_GLYPHS: Record<AvatarId, string> = Object.fromEntries(
  AVATAR_OPTIONS.map(a => [a.id, a.glyph]),
) as Record<AvatarId, string>;

const AVATAR_COLORS: Record<AvatarId, string> = Object.fromEntries(
  AVATAR_OPTIONS.map(a => [a.id, a.color]),
) as Record<AvatarId, string>;

// ── Avatar display ────────────────────────────────────────────────────────────
const AvatarDisplay = ({
  avatarId, size = 80, border = true,
}: { avatarId: AvatarId; size?: number; border?: boolean }) => {
  const color = AVATAR_COLORS[avatarId] ?? '#fff';
  return (
    <div
      className="flex items-center justify-center rounded-full shrink-0"
      style={{
        width: size, height: size,
        background: `radial-gradient(circle, ${color}15 0%, rgba(0,0,0,0.4) 100%)`,
        border: border ? `2px solid ${color}40` : 'none',
        fontSize: size * 0.52,
        lineHeight: 1,
      }}
    >
      {AVATAR_GLYPHS[avatarId]}
    </div>
  );
};

// ── XP + level bar ────────────────────────────────────────────────────────────
const XPPanel = ({ xp }: { xp: number }) => {
  const { level, currentXP, nextXP, pct } = xpToLevel(xp);
  const perk = LEVEL_PERKS[level + 1];

  return (
    <div className="w-full p-5 rounded-2xl"
      style={{ background: 'rgba(255,224,61,0.04)', border: '1px solid rgba(255,224,61,0.12)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full font-mono font-bold"
            style={{ background: 'rgba(255,224,61,0.12)', border: '1px solid rgba(255,224,61,0.25)', color: '#FFE03D', fontSize: 16 }}>
            {level}
          </div>
          <div>
            <div style={{ ...cp(700, 16, '0.04em'), color: '#FFE03D' }}>Level {level}</div>
            <div style={{ ...cp(400, 11, '0.06em'), color: 'rgba(255,255,255,0.4)' }}>{xp} total XP</div>
          </div>
        </div>
        <div className="text-right">
          <div style={{ ...cp(600, 12), color: 'rgba(255,255,255,0.5)' }}>{currentXP}/{nextXP} XP</div>
          <div style={{ ...cp(400, 10, '0.08em'), color: 'rgba(255,255,255,0.3)' }}>to next level</div>
        </div>
      </div>
      <div className="w-full h-2 rounded-full overflow-hidden mb-2"
        style={{ background: 'rgba(255,255,255,0.06)' }}>
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{ background: 'linear-gradient(90deg, #FFE03D, #FF8C42)', boxShadow: '0 0 8px rgba(255,224,61,0.4)' }}
        />
      </div>
      {perk && (
        <div style={{ ...cp(400, 11, '0.06em'), color: 'rgba(255,255,255,0.35)' }}>
          Next: <span style={{ color: 'rgba(255,224,61,0.7)' }}>{perk}</span>
        </div>
      )}
    </div>
  );
};

// ── Achievement badge ─────────────────────────────────────────────────────────
const AchievementBadge = ({
  achievement, unlocked,
}: { achievement: typeof ALL_ACHIEVEMENTS[0]; unlocked: boolean }) => (
  <motion.div
    whileHover={{ scale: 1.03 }}
    className="flex items-center gap-3 p-3 rounded-xl"
    style={{
      background: unlocked ? 'rgba(255,224,61,0.06)' : 'rgba(255,255,255,0.02)',
      border: `1px solid ${unlocked ? 'rgba(255,224,61,0.2)' : 'rgba(255,255,255,0.05)'}`,
      opacity: unlocked ? 1 : 0.45,
    }}
  >
    <div className="text-2xl shrink-0" style={{ filter: unlocked ? 'none' : 'grayscale(100%)' }}>
      {achievement.icon}
    </div>
    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
      <div style={{ ...cp(600, 12, '0.04em'), color: unlocked ? '#FFE03D' : 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {achievement.name}
      </div>
      <div style={{ ...cp(400, 10, '0.04em'), color: 'rgba(255,255,255,0.35)' }}>
        {achievement.desc}
      </div>
    </div>
    {unlocked && (
      <div className="shrink-0 text-[10px] font-mono" style={{ color: 'rgba(255,224,61,0.5)' }}>✓</div>
    )}
  </motion.div>
);

// ── Stats summary ─────────────────────────────────────────────────────────────
const ProfileStats = () => {
  const { history, balance } = useGameStore();
  const wins  = history.filter(h => h.result === 'WON').length;
  const total = history.length;
  const net   = history.reduce((s, h) => s + h.delta, 0);
  const rate  = total > 0 ? Math.round((wins / total) * 100) : 0;

  const items = [
    { label: 'Hands',    value: String(total),              color: 'white' },
    { label: 'Win Rate', value: `${rate}%`,                 color: rate >= 50 ? '#00E86C' : '#FF4444' },
    { label: 'Net P/L',  value: `${net >= 0 ? '+' : ''}${net}`, color: net >= 0 ? '#00E86C' : '#FF4444' },
    { label: 'Balance',  value: balance.toLocaleString(),   color: '#FFE03D' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {items.map(({ label, value, color }) => (
        <div key={label} className="flex flex-col items-center gap-1 py-4 px-3 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ ...cp(700, 22, '0.02em'), color }}>{value}</span>
          <span style={{ ...cp(400, 10, '0.14em'), color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>{label}</span>
        </div>
      ))}
    </div>
  );
};

// ── Avatar picker ─────────────────────────────────────────────────────────────
const AvatarPicker = ({
  current, onChange, onClose,
}: { current: AvatarId; onChange: (id: AvatarId) => void; onClose: () => void }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.95 }}
    className="fixed inset-0 z-50 flex items-center justify-center p-4"
    style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
    onClick={onClose}
  >
    <div
      className="w-full max-w-[400px] p-6 rounded-2xl"
      style={{ background: '#0F1318', border: '1px solid rgba(255,255,255,0.1)' }}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ ...cp(600, 14, '0.08em'), color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginBottom: 20 }}>
        Choose Avatar
      </div>
      <div className="grid grid-cols-4 gap-3">
        {AVATAR_OPTIONS.map(opt => (
          <button
            key={opt.id}
            onClick={() => { onChange(opt.id); onClose(); }}
            className="flex flex-col items-center gap-2 p-3 rounded-xl transition-all"
            style={{
              background: current === opt.id ? `${opt.color}18` : 'rgba(255,255,255,0.03)',
              border: current === opt.id ? `1px solid ${opt.color}50` : '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <span style={{ fontSize: 32 }}>{opt.glyph}</span>
            <span style={{ ...cp(400, 9, '0.06em'), color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
              {opt.label.split(' ')[0]}
            </span>
          </button>
        ))}
      </div>
    </div>
  </motion.div>
);

// ── Main ──────────────────────────────────────────────────────────────────────
export const ProfileTab = () => {
  const { address } = useAccount();
  const { username, avatarId, xp, achievements, setUsername, setAvatarId } = useProfileStore();
  const [editingName, setEditingName] = useState(false);
  const [nameInput,   setNameInput]   = useState(username);
  const [showPicker,  setShowPicker]  = useState(false);

  const { history } = useGameStore();
  const unlockedCount = achievements.filter(a => a.unlockedAt).length;

  const shortAddr = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Not connected';
  const displayName = username || shortAddr;

  const handleSaveName = () => {
    setUsername(nameInput.trim());
    setEditingName(false);
  };

  const sortedAchievements = useMemo(() => {
    return [...achievements].sort((a, b) => {
      if (a.unlockedAt && !b.unlockedAt) return -1;
      if (!a.unlockedAt && b.unlockedAt) return 1;
      return 0;
    });
  }, [achievements]);

  return (
    <div className="w-full max-w-[760px] mx-auto py-10 px-4 min-h-[calc(100vh-112px)]"
      style={{ background: '#0A0D12' }}>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="uppercase leading-none mb-1" style={{ ...cp(700, 52, '0.06em'), color: 'white' }}>PROFILE</h1>
        <p style={{ ...cp(400, 13), color: 'rgba(255,255,255,0.3)' }}>Your on-chain identity</p>
      </motion.div>

      {/* Identity card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="flex items-center gap-5 p-5 rounded-2xl mb-6"
        style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        {/* Avatar */}
        <button onClick={() => setShowPicker(true)} className="relative group shrink-0">
          <AvatarDisplay avatarId={avatarId} size={80} />
          <div className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: 'rgba(0,0,0,0.6)', fontSize: 13 }}>
            ✏️
          </div>
        </button>

        {/* Name + address */}
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-2 mb-1">
              <input
                autoFocus
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
                maxLength={20}
                className="flex-1 px-3 py-1.5 rounded-lg outline-none font-mono text-sm"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(0,191,255,0.3)', color: 'white', fontSize: 16 }}
                placeholder="Your name…"
              />
              <button onClick={handleSaveName}
                className="px-3 py-1.5 rounded-lg font-mono text-xs font-bold uppercase"
                style={{ background: '#00BFFF', color: '#000' }}>
                Save
              </button>
              <button onClick={() => setEditingName(false)}
                className="px-3 py-1.5 rounded-lg font-mono text-xs uppercase"
                style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)' }}>
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mb-1">
              <span style={{ ...cp(700, 20, '0.02em'), color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayName}
              </span>
              <button onClick={() => { setNameInput(username); setEditingName(true); }}
                className="shrink-0 font-mono text-[10px] uppercase px-2 py-0.5 rounded"
                style={{ color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.08)' }}>
                edit
              </button>
            </div>
          )}
          <div style={{ ...cp(400, 11, '0.06em'), color: 'rgba(255,255,255,0.3)' }}>{shortAddr}</div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span style={{ ...cp(500, 10, '0.1em'), color: 'rgba(255,224,61,0.8)', textTransform: 'uppercase' }}>
              {unlockedCount}/{achievements.length} Achievements
            </span>
          </div>
        </div>

        {/* XP level badge */}
        <div className="shrink-0 flex flex-col items-center gap-1">
          <div className="flex items-center justify-center w-14 h-14 rounded-full font-mono font-bold text-xl"
            style={{ background: 'rgba(255,224,61,0.1)', border: '2px solid rgba(255,224,61,0.3)', color: '#FFE03D' }}>
            {xpToLevel(xp).level}
          </div>
          <span style={{ ...cp(400, 9, '0.1em'), color: 'rgba(255,224,61,0.5)', textTransform: 'uppercase' }}>Level</span>
        </div>
      </motion.div>

      {/* XP bar */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-6">
        <XPPanel xp={xp} />
      </motion.div>

      {/* Stats */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <ProfileStats />
      </motion.div>

      {/* Achievements */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="uppercase" style={{ ...cp(600, 13, '0.14em'), color: 'rgba(255,255,255,0.5)' }}>
            Achievements
          </h2>
          <span style={{ ...cp(400, 11), color: 'rgba(255,255,255,0.3)' }}>
            {unlockedCount} / {achievements.length}
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1 rounded-full overflow-hidden mb-4"
          style={{ background: 'rgba(255,255,255,0.06)' }}>
          <motion.div
            className="h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${(unlockedCount / achievements.length) * 100}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            style={{ background: 'linear-gradient(90deg, #FFE03D, #FF8C42)' }}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {sortedAchievements.map(ach => (
            <AchievementBadge key={ach.id} achievement={ach} unlocked={!!ach.unlockedAt} />
          ))}
        </div>
      </motion.div>

      {/* Avatar picker modal */}
      <AnimatePresence>
        {showPicker && (
          <AvatarPicker current={avatarId} onChange={setAvatarId} onClose={() => setShowPicker(false)} />
        )}
      </AnimatePresence>
    </div>
  );
};
