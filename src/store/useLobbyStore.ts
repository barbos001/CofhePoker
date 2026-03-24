import { create } from 'zustand';

export interface LobbyTable {
  tableId:     number;
  creator:     string;
  buyIn:       number;
  playerCount: 1 | 2;
  createdAt:   number;
  isPrivate:   boolean;
}

interface LobbyStore {
  tables:    LobbyTable[];
  isLoading: boolean;
  error:     string | null;
  filter:    'all' | 'friends' | 'open';

  setTables:  (t: LobbyTable[]) => void;
  setLoading: (b: boolean) => void;
  setError:   (e: string | null) => void;
  setFilter:  (f: 'all' | 'friends' | 'open') => void;
}

export const useLobbyStore = create<LobbyStore>((set) => ({
  tables:    [],
  isLoading: false,
  error:     null,
  filter:    'all',

  setTables:  (tables) => set({ tables }),
  setLoading: (isLoading) => set({ isLoading }),
  setError:   (error) => set({ error }),
  setFilter:  (filter) => set({ filter }),
}));
