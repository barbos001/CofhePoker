import { create } from 'zustand';
import { sleep } from '@/lib/utils';
import { HandEvaluation, PayoutResult } from '@/lib/poker';

export type AppState    = 'landing' | 'connecting' | 'app';
export type Tab         = 'play' | 'history' | 'help' | 'settings';
export type GameMode    = 'three-card' | 'holdem';
export type PlayState   = 'lobby' | 'dealing' | 'decrypting' | 'playerTurn' | 'folding' | 'botThinking' | 'showdown' | 'result';
export type PermitState = 'none' | 'signing' | 'active' | 'expiring' | 'expired' | 'error';

export interface HandHistory {
  id:          string;
  result:      'WON' | 'LOST' | 'FOLD' | 'PUSH';
  desc:        string;
  delta:       number;
  txHash:      string;
  playerCards: number[];
  botCards:    number[];
  payout?:     PayoutResult;
}

interface FinishHandPayload {
  result:  'WON' | 'LOST' | 'FOLD' | 'PUSH';
  delta:   number;
  desc:    string;
  pot:     number;
  balance: number;
  txHash:  string;
  playerCards?: number[];
  botCards?:    number[];
  payout?:     PayoutResult;
}

interface GameStore {
  // ── Global UI ──────────────────────────────────────────────────────
  appState:    AppState;
  activeTab:   Tab;
  setAppState: (state: AppState) => void;
  setActiveTab:(tab: Tab) => void;

  // ── Wallet ─────────────────────────────────────────────────────────
  address:       string | null;
  setAddress:    (addr: string | null) => void;
  connectWallet: () => Promise<void>;

  // ── FHE Permit ───────────────────────────────────────────────────
  permitStatus:    PermitState;
  permitError:     string | null;
  permitExpiresAt: number | null;
  setPermitStatus: (s: PermitState) => void;
  setPermitError:  (e: string | null) => void;
  setPermitExpiry: (t: number | null) => void;

  // ── Chain state ────────────────────────────────────────────────────
  tableId:    number | null;
  setTableId: (id: number | null) => void;

  // ── Game ───────────────────────────────────────────────────────────
  playState:       PlayState;
  statusMsg:       { text: string; color: string };
  ante:            number;
  pot:             number;
  balance:         number;
  pairPlusBet:     number;
  gameMode:        GameMode;
  holdemRound:     'preflop' | 'flop' | 'turn' | 'river' | null;
  playerCards:     number[];
  communityCards:  number[];
  botCards:        number[];
  playerEval:      HandEvaluation | null;
  botEval:         HandEvaluation | null;
  history:         HandHistory[];
  handResult:      'WON' | 'LOST' | 'FOLD' | 'PUSH' | null;
  lastPayout:      PayoutResult | null;

  // ── Setters ──────────────────────────────────────────────────────
  setPlayState:       (s: PlayState) => void;
  setStatus:          (text: string, color: string) => void;
  setBalance:         (n: number) => void;
  setPairPlusBet:     (n: number) => void;
  setGameMode:        (m: GameMode) => void;
  setHoldemRound:     (r: 'preflop' | 'flop' | 'turn' | 'river' | null) => void;
  revealPlayerCard:   (cardId: number) => void;
  clearPlayerCards:   () => void;
  revealCommunityCard:(cardId: number) => void;
  clearCommunityCards:() => void;
  setPlayerEval:   (e: HandEvaluation | null) => void;
  setBotEval:      (e: HandEvaluation | null) => void;
  finishHand:      (payload: FinishHandPayload) => void;
  resetToLobby:    () => void;
}

const ANTE = 10;

export const useGameStore = create<GameStore>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────
  appState:  'landing',
  activeTab: 'play',
  setAppState:  (state) => set({ appState: state }),
  setActiveTab: (tab)   => set({ activeTab: tab }),

  address:    null,
  setAddress: (addr) => set({ address: addr }),

  permitStatus:    'none',
  permitError:     null,
  permitExpiresAt: null,
  setPermitStatus: (s) => set({ permitStatus: s, permitError: s === 'error' ? get().permitError : null }),
  setPermitError:  (e) => set({ permitError: e, permitStatus: e ? 'error' : get().permitStatus }),
  setPermitExpiry: (t) => set({ permitExpiresAt: t }),

  connectWallet: async () => {
    set({ appState: 'connecting' });
    await sleep(1500);
    set({ address: '0x3f8a...9b2c', appState: 'app', activeTab: 'play' });
  },

  tableId:    null,
  setTableId: (id) => set({ tableId: id }),

  playState:      'lobby',
  statusMsg:      { text: '', color: '#FFF' },
  ante:           ANTE,
  pot:            0,
  balance:        1000,
  pairPlusBet:    0,
  gameMode:       'three-card' as GameMode,
  holdemRound:    null,
  playerCards:    [],
  communityCards: [],
  botCards:       [],
  playerEval:   null,
  botEval:      null,
  history:      [],
  handResult:   null,
  lastPayout:   null,

  // ── Setters ────────────────────────────────────────────────────────
  setPlayState:   (s)          => set({ playState: s }),
  setStatus:      (text, color) => set({ statusMsg: { text, color } }),
  setBalance:     (n)          => set({ balance: n }),
  setPairPlusBet: (n)          => set({ pairPlusBet: n }),
  setGameMode:    (m)          => set({ gameMode: m }),
  setHoldemRound: (r)          => set({ holdemRound: r }),

  revealPlayerCard: (cardId) => set((s) => ({
    playerCards: [...s.playerCards, cardId],
  })),
  clearPlayerCards: () => set({ playerCards: [] }),

  revealCommunityCard: (cardId) => set((s) => ({
    communityCards: [...s.communityCards, cardId],
  })),
  clearCommunityCards: () => set({ communityCards: [] }),

  setPlayerEval: (e) => set({ playerEval: e }),
  setBotEval:    (e) => set({ botEval: e }),

  finishHand: ({ result, delta, desc, pot, balance, txHash, playerCards, botCards, payout }) => {
    const { history, playerCards: pc, botCards: bc } = get();
    const id = Math.floor(Math.random() * 100000).toString();

    let statusText: string;
    let statusColor: string;

    if (result === 'WON') {
      statusText = `You Won! +${delta} chips`;
      statusColor = '#FFE03D';
    } else if (result === 'PUSH') {
      statusText = 'Push - bets returned';
      statusColor = '#888';
    } else if (result === 'FOLD') {
      statusText = 'You folded.';
      statusColor = '#FF3B3B';
    } else {
      statusText = `You Lost. ${delta} chips`;
      statusColor = '#FF3B3B';
    }

    if (payout) {
      if (payout.anteBonus > 0) statusText += ` (Ante Bonus +${payout.anteBonus})`;
      if (payout.pairPlus > 0)  statusText += ` (Pair+ +${payout.pairPlus})`;
      if (!payout.qualified && result === 'WON') statusText = `Dealer didn't qualify! +${delta} chips`;
    }

    set({
      playState:  'result',
      handResult: result,
      lastPayout: payout ?? null,
      pot,
      balance,
      statusMsg: { text: statusText, color: statusColor },
      history: [{
        id,
        result,
        desc,
        delta,
        txHash,
        playerCards: playerCards ?? pc,
        botCards:    botCards    ?? bc,
        payout,
      }, ...history],
    });
  },

  resetToLobby: () => set({
    playState:      'lobby',
    pot:            0,
    playerCards:    [],
    botCards:       [],
    communityCards: [],
    playerEval:     null,
    botEval:        null,
    handResult:     null,
    lastPayout:     null,
    holdemRound:    null,
    statusMsg:      { text: '', color: '#FFF' },
  }),
}));
