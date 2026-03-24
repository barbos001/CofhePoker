import { create } from 'zustand';

export interface GameInvite {
  from:      string;
  tableId:   number;
  buyIn:     number;
  timestamp: number;
}

export interface OutgoingInvite {
  to:      string;
  tableId: number;
}

interface InvitesStore {
  incoming: GameInvite[];
  outgoing: OutgoingInvite[];

  setIncoming:    (i: GameInvite[]) => void;
  addIncoming:    (i: GameInvite) => void;
  removeIncoming: (from: string) => void;
  setOutgoing:    (o: OutgoingInvite[]) => void;
  addOutgoing:    (o: OutgoingInvite) => void;
  removeOutgoing: (to: string) => void;
  clearAll:       () => void;
}

export const useInvitesStore = create<InvitesStore>((set) => ({
  incoming: [],
  outgoing: [],

  setIncoming:    (incoming)  => set({ incoming }),
  addIncoming:    (i)         => set(s => ({ incoming: [...s.incoming, i] })),
  removeIncoming: (from)      => set(s => ({ incoming: s.incoming.filter(i => i.from !== from) })),
  setOutgoing:    (outgoing)  => set({ outgoing }),
  addOutgoing:    (o)         => set(s => ({ outgoing: [...s.outgoing, o] })),
  removeOutgoing: (to)        => set(s => ({ outgoing: s.outgoing.filter(o => o.to !== to) })),
  clearAll:       ()          => set({ incoming: [], outgoing: [] }),
}));
