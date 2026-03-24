import { create } from 'zustand';

export interface Friend {
  address:        string;
  isOnline:       boolean;
  inGame:         boolean;
  currentTableId?: number;
}

export interface FriendRequest {
  from:      string;
  timestamp: number;
}

interface FriendsStore {
  friends:          Friend[];
  incomingRequests: FriendRequest[];
  outgoingRequests: string[];
  isLoading:        boolean;

  setFriends:          (f: Friend[]) => void;
  addFriend:           (f: Friend) => void;
  removeFriend:        (addr: string) => void;
  setIncomingRequests: (r: FriendRequest[]) => void;
  addIncomingRequest:  (r: FriendRequest) => void;
  removeIncomingRequest: (from: string) => void;
  setOutgoingRequests: (r: string[]) => void;
  addOutgoingRequest:  (addr: string) => void;
  setLoading:          (b: boolean) => void;
}

export const useFriendsStore = create<FriendsStore>((set) => ({
  friends:          [],
  incomingRequests: [],
  outgoingRequests: [],
  isLoading:        false,

  setFriends:          (friends)  => set({ friends }),
  addFriend:           (f)        => set(s => ({ friends: [...s.friends, f] })),
  removeFriend:        (addr)     => set(s => ({ friends: s.friends.filter(f => f.address !== addr) })),
  setIncomingRequests: (r)        => set({ incomingRequests: r }),
  addIncomingRequest:  (r)        => set(s => ({ incomingRequests: [...s.incomingRequests, r] })),
  removeIncomingRequest: (from)   => set(s => ({ incomingRequests: s.incomingRequests.filter(r => r.from !== from) })),
  setOutgoingRequests: (r)        => set({ outgoingRequests: r }),
  addOutgoingRequest:  (addr)     => set(s => ({ outgoingRequests: [...s.outgoingRequests, addr] })),
  setLoading:          (isLoading) => set({ isLoading }),
}));
