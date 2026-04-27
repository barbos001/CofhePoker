import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NotifType = 'win' | 'loss' | 'pvp' | 'challenge' | 'friend' | 'system';

export interface Notification {
  id:        string;
  type:      NotifType;
  title:     string;
  body:      string;
  icon:      string;
  timestamp: number;
  read:      boolean;
  link?:     string;
}

interface NotificationsStore {
  notifications:    Notification[];
  webPushEnabled:   boolean;
  prefs: {
    wins:       boolean;
    losses:     boolean;
    pvp:        boolean;
    challenges: boolean;
    friends:    boolean;
  };
  add:            (n: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markAllRead:    () => void;
  markRead:       (id: string) => void;
  dismiss:        (id: string) => void;
  clearAll:       () => void;
  setWebPush:     (v: boolean) => void;
  setPref:        (key: keyof NotificationsStore['prefs'], v: boolean) => void;
  unreadCount:    () => number;
}

export const useNotificationsStore = create<NotificationsStore>()(persist(
  (set, get) => ({
    notifications:  [],
    webPushEnabled: false,
    prefs: { wins: true, losses: true, pvp: true, challenges: true, friends: true },

    add: (n) => {
      const { prefs } = get();
      const prefKey = n.type === 'win' ? 'wins' : n.type === 'loss' ? 'losses' :
                      n.type === 'pvp' ? 'pvp'  : n.type === 'challenge' ? 'challenges' :
                      n.type === 'friend' ? 'friends' : null;
      if (prefKey && !prefs[prefKey as keyof typeof prefs]) return;

      const notification: Notification = { ...n, id: Date.now().toString(), timestamp: Date.now(), read: false };
      set(s => ({ notifications: [notification, ...s.notifications].slice(0, 50) }));
    },

    markAllRead: () => set(s => ({ notifications: s.notifications.map(n => ({ ...n, read: true })) })),
    markRead:    (id) => set(s => ({ notifications: s.notifications.map(n => n.id === id ? { ...n, read: true } : n) })),
    dismiss:     (id) => set(s => ({ notifications: s.notifications.filter(n => n.id !== id) })),
    clearAll:    () => set({ notifications: [] }),
    setWebPush:  (v) => set({ webPushEnabled: v }),
    setPref:     (k, v) => set(s => ({ prefs: { ...s.prefs, [k]: v } })),
    unreadCount: () => get().notifications.filter(n => !n.read).length,
  }),
  {
    name: 'cofhe-notifications',
    partialize: s => ({
      notifications:  s.notifications.slice(0, 30), // persist last 30
      prefs:          s.prefs,
      webPushEnabled: s.webPushEnabled,
    }),
  },
));
