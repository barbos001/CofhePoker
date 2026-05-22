import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Challenge {
  id:          string;
  title:       string;
  desc:        string;
  icon:        string;
  type:        'daily' | 'weekly';
  goal:        number;
  progress:    number;
  reward:      number;
  claimed:     boolean;
  expiresAt:   number;
}

interface ChallengesStore {
  challenges:    Challenge[];
  lastReset:     number;
  refreshIfNeeded: () => void;
  incrementProgress: (id: string, by?: number) => void;
  claimReward: (id: string, onReward: (chips: number) => void) => void;
}

function makeExpiresAt(type: 'daily' | 'weekly'): number {
  const now = new Date();
  if (type === 'daily') {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.getTime();
  } else {
    const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
    const monday = new Date(now);
    monday.setDate(monday.getDate() + daysUntilMonday);
    monday.setHours(0, 0, 0, 0);
    return monday.getTime();
  }
}

const DAILY_TEMPLATES = [
  { id: 'd1', title: 'Win 3 Hands',     desc: 'Win 3 hands today',           icon: '🏆', goal: 3,  reward: 50  },
  { id: 'd2', title: 'Play Hold\'em',   desc: 'Play 2 Hold\'em hands',       icon: '🃏', goal: 2,  reward: 40  },
  { id: 'd3', title: 'Fold Smart',      desc: 'Fold 2 hands strategically',  icon: '🤔', goal: 2,  reward: 30  },
];

const WEEKLY_TEMPLATES = [
  { id: 'w1', title: 'Win 10 Hands',    desc: 'Win 10 hands this week',      icon: '⚡', goal: 10, reward: 200 },
  { id: 'w2', title: 'Try PvP',         desc: 'Play 1 PvP match',            icon: '⚔️', goal: 1,  reward: 150 },
  { id: 'w3', title: 'All-Star Week',   desc: 'Play 20 hands this week',     icon: '🌟', goal: 20, reward: 300 },
];

// Reference for debounce timer
function incrementProgress(_id: string, _by?: number) {}

function buildChallenges(): Challenge[] {
  return [
    ...DAILY_TEMPLATES.map(t => ({ ...t, type: 'daily' as const, progress: 0, claimed: false, expiresAt: makeExpiresAt('daily') })),
    ...WEEKLY_TEMPLATES.map(t => ({ ...t, type: 'weekly' as const, progress: 0, claimed: false, expiresAt: makeExpiresAt('weekly') })),
  ];
}

export const useChallengesStore = create<ChallengesStore>()(persist(
  (set, get) => ({
    challenges: buildChallenges(),
    lastReset:  Date.now(),

    refreshIfNeeded: () => {
      const now = Date.now();
      const { challenges } = get();
      const needsReset = challenges.some(c => c.expiresAt <= now);
      if (!needsReset) return;
      set(s => ({
        lastReset: now,
        challenges: s.challenges.map(c =>
          c.expiresAt <= now
            ? { ...c, progress: 0, claimed: false, expiresAt: makeExpiresAt(c.type) }
            : c,
        ),
      }));
    },

    incrementProgress: (id, by = 1) => {
      set(s => ({
        challenges: s.challenges.map(c =>
          c.id === id && !c.claimed ? { ...c, progress: Math.min(c.goal, c.progress + by) } : c,
        ),
      }));
      // Debounced sync to Supabase
      clearTimeout((incrementProgress as any)._t);
      (incrementProgress as any)._t = setTimeout(async () => {
        try {
          const { syncChallengeProgress } = await import('@/lib/db');
          const { useGameStore } = await import('@/store/useGameStore');
          const addr = useGameStore.getState().address;
          if (!addr) return;
          const progress: Record<string, number> = {};
          useChallengesStore.getState().challenges.forEach(c => { progress[c.id] = c.progress; });
          await syncChallengeProgress(addr, progress);
        } catch { /* offline */ }
      }, 3000);
    },

    claimReward: (id, onReward) => {
      const c = get().challenges.find(c => c.id === id);
      if (!c || c.claimed || c.progress < c.goal) return;
      set(s => ({
        challenges: s.challenges.map(ch => ch.id === id ? { ...ch, claimed: true } : ch),
      }));
      onReward(c.reward);
    },
  }),
  { name: 'cofhe-challenges' },
));
