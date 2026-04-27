import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AvatarId =
  | 'ace-spades' | 'ace-hearts' | 'king-clubs' | 'queen-diamonds'
  | 'joker' | 'chip-stack' | 'dice' | 'crown';

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  icon: string;
  unlockedAt?: number;
}

export const ALL_ACHIEVEMENTS: Achievement[] = [
  { id: 'first_win',      name: 'First Blood',      desc: 'Win your first hand',                    icon: '🏆' },
  { id: 'win_streak_3',   name: 'On Fire',           desc: 'Win 3 hands in a row',                   icon: '🔥' },
  { id: 'win_streak_5',   name: 'Unstoppable',       desc: 'Win 5 hands in a row',                   icon: '⚡' },
  { id: 'holdem_player',  name: "Hold'em Player",    desc: "Play 5 Hold'em hands",                   icon: '🃏' },
  { id: 'pvp_winner',     name: 'PvP Victor',        desc: 'Win a PvP match',                        icon: '⚔️' },
  { id: 'hands_10',       name: 'Getting Started',   desc: 'Play 10 hands',                          icon: '🎯' },
  { id: 'hands_25',       name: 'Regular',           desc: 'Play 25 hands',                          icon: '🎰' },
  { id: 'hands_50',       name: 'Veteran',           desc: 'Play 50 hands',                          icon: '💎' },
  { id: 'big_win',        name: 'High Roller',       desc: 'Win a hand worth 100+ chips',            icon: '💰' },
  { id: 'straight_flush', name: 'Royal Treatment',   desc: 'Hit a Straight Flush',                   icon: '👑' },
  { id: 'comeback',       name: 'Comeback Kid',      desc: 'Win after dropping below 500 chips',     icon: '🔄' },
  { id: 'all_modes',      name: 'Versatile',         desc: 'Play all 4 game modes',                  icon: '🌐' },
];

export const XP_PER_HAND = 10;
export const XP_WIN_BONUS = 15;
export const XP_LEVEL_THRESHOLDS = [0, 50, 125, 250, 450, 700, 1000, 1400, 1900, 2500, 9999];

export function xpToLevel(xp: number): { level: number; currentXP: number; nextXP: number; pct: number } {
  let level = 1;
  for (let i = 0; i < XP_LEVEL_THRESHOLDS.length - 1; i++) {
    if (xp >= XP_LEVEL_THRESHOLDS[i + 1]) level = i + 2;
    else break;
  }
  const lo = XP_LEVEL_THRESHOLDS[level - 1] ?? 0;
  const hi = XP_LEVEL_THRESHOLDS[level] ?? XP_LEVEL_THRESHOLDS[XP_LEVEL_THRESHOLDS.length - 1];
  return {
    level,
    currentXP: xp - lo,
    nextXP: hi - lo,
    pct: Math.min(100, ((xp - lo) / (hi - lo)) * 100),
  };
}

export const LEVEL_PERKS: Record<number, string> = {
  2: 'Unlock streak badge',
  3: 'Unlock profile border',
  5: 'Unlock "Pro" title',
  7: 'Unlock chip multiplier display',
  10: 'Unlock "Legend" title',
};

interface ProfileStore {
  username:         string;
  avatarId:         AvatarId;
  xp:               number;
  achievements:     Achievement[];
  modesPlayed:      Set<string>;

  setUsername:      (name: string) => void;
  setAvatarId:      (id: AvatarId) => void;
  addXP:            (amount: number) => void;
  unlockAchievement:(id: string) => void;
  trackMode:        (mode: string) => void;
  checkAchievements:(opts: {
    handsTotal: number;
    wins: number;
    streak: number;
    balance: number;
    lastDelta: number;
    lastResult: string;
    lastMode: string;
    hadLowBalance: boolean;
    playerEvalName?: string;
    holdemHandsCount?: number;
    pvpHandsCount?: number;
  }) => void;
}

export const useProfileStore = create<ProfileStore>()(persist(
  (set, get) => ({
    username:     '',
    avatarId:     'ace-spades',
    xp:           0,
    achievements: ALL_ACHIEVEMENTS.map(a => ({ ...a })),
    modesPlayed:  new Set<string>(),

    setUsername: (name) => set({ username: name.slice(0, 20) }),
    setAvatarId: (id)   => set({ avatarId: id }),

    addXP: (amount) => set(s => ({ xp: s.xp + amount })),

    unlockAchievement: (id) => set(s => ({
      achievements: s.achievements.map(a =>
        a.id === id && !a.unlockedAt ? { ...a, unlockedAt: Date.now() } : a,
      ),
    })),

    trackMode: (mode) => set(s => ({ modesPlayed: new Set([...s.modesPlayed, mode]) })),

    checkAchievements: ({ handsTotal, wins, streak, balance, lastDelta, lastResult, lastMode, hadLowBalance, playerEvalName, holdemHandsCount = 0, pvpHandsCount = 0 }) => {
      const { unlockAchievement, addXP, trackMode, achievements, modesPlayed } = get();

      // XP for playing + win bonus
      addXP(XP_PER_HAND + (lastResult === 'WON' ? XP_WIN_BONUS : 0));

      if (lastMode) trackMode(lastMode);

      const unlocked = (id: string) => achievements.some(a => a.id === id && a.unlockedAt);

      if (!unlocked('first_win')      && wins >= 1)                                         unlockAchievement('first_win');
      if (!unlocked('win_streak_3')   && streak >= 3)                                       unlockAchievement('win_streak_3');
      if (!unlocked('win_streak_5')   && streak >= 5)                                       unlockAchievement('win_streak_5');
      if (!unlocked('hands_10')       && handsTotal >= 10)                                  unlockAchievement('hands_10');
      if (!unlocked('hands_25')       && handsTotal >= 25)                                  unlockAchievement('hands_25');
      if (!unlocked('hands_50')       && handsTotal >= 50)                                  unlockAchievement('hands_50');
      if (!unlocked('big_win')        && lastDelta >= 100)                                  unlockAchievement('big_win');
      if (!unlocked('comeback')       && hadLowBalance && lastResult === 'WON')             unlockAchievement('comeback');
      if (!unlocked('straight_flush') && playerEvalName === 'Straight Flush')               unlockAchievement('straight_flush');
      if (!unlocked('pvp_winner')     && lastResult === 'WON' && lastMode === 'pvp')        unlockAchievement('pvp_winner');
      if (!unlocked('holdem_player')  && (holdemHandsCount >= 5 || (lastMode === 'holdem' && holdemHandsCount >= 5))) unlockAchievement('holdem_player');

      // Versatile: played all 4 game modes
      const allModes = new Set([...modesPlayed, lastMode]);
      if (!unlocked('all_modes')      && allModes.size >= 4)                                unlockAchievement('all_modes');
    },
  }),
  {
    name: 'cofhe-profile',
    partialize: (s) => ({
      username:     s.username,
      avatarId:     s.avatarId,
      xp:           s.xp,
      achievements: s.achievements,
      modesPlayed:  [...s.modesPlayed],
    }),
    merge: (persisted: any, current) => ({
      ...current,
      ...persisted,
      modesPlayed: new Set(persisted.modesPlayed ?? []),
    }),
  },
));
