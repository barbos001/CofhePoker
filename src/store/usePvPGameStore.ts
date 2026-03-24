import { create } from 'zustand';
import { HandEvaluation } from '@/lib/poker';

export type PvPPlayState =
  | 'idle'              // not in a PvP game
  | 'waiting'           // created table, waiting for opponent
  | 'seated'            // both players, ready to start hand
  | 'dealing'           // FHE card generation
  | 'decrypting'        // decrypting own cards
  | 'acting'            // making play/fold decision
  | 'waitingOpponent'   // I acted, waiting for opponent
  | 'showdown'          // FHE comparison in progress
  | 'result';           // hand complete

export interface PvPFinishPayload {
  result:  'WON' | 'LOST' | 'FOLD' | 'OPP_FOLD' | 'DRAW';
  delta:   number;
  desc:    string;
  pot:     number;
  balance: number;
  txHash:  string;
  opponentCards?: number[];
}

interface PvPGameStore {
  pvpState:         PvPPlayState;
  tableId:          number | null;
  opponentAddress:  string | null;
  isPlayer1:        boolean;
  myCards:          number[];
  opponentCards:    number[];
  myEval:           HandEvaluation | null;
  opponentEval:     HandEvaluation | null;
  pot:              number;
  balance:          number;
  handResult:       'WON' | 'LOST' | 'FOLD' | 'OPP_FOLD' | 'DRAW' | null;
  statusMsg:        { text: string; color: string };
  pvpHistory:       PvPHistoryEntry[];

  // Setters
  setPvPState:      (s: PvPPlayState) => void;
  setTableId:       (id: number | null) => void;
  setOpponent:      (addr: string | null) => void;
  setIsPlayer1:     (b: boolean) => void;
  revealMyCard:     (cardId: number) => void;
  setMyEval:        (e: HandEvaluation | null) => void;
  setOpponentEval:  (e: HandEvaluation | null) => void;
  setStatus:        (text: string, color: string) => void;
  setPot:           (n: number) => void;
  setBalance:       (n: number) => void;
  finishPvPHand:    (p: PvPFinishPayload) => void;
  resetToIdle:      () => void;
  resetForNextHand: () => void;
}

export interface PvPHistoryEntry {
  id:            string;
  result:        'WON' | 'LOST' | 'FOLD' | 'OPP_FOLD' | 'DRAW';
  desc:          string;
  delta:         number;
  txHash:        string;
  myCards:       number[];
  opponentCards: number[];
  opponent:      string;
}

export const usePvPGameStore = create<PvPGameStore>((set, get) => ({
  pvpState:        'idle',
  tableId:         null,
  opponentAddress: null,
  isPlayer1:       true,
  myCards:         [],
  opponentCards:   [],
  myEval:          null,
  opponentEval:    null,
  pot:             0,
  balance:         1000,
  handResult:      null,
  statusMsg:       { text: '', color: '#FFF' },
  pvpHistory:      [],

  setPvPState:     (s)    => set({ pvpState: s }),
  setTableId:      (id)   => set({ tableId: id }),
  setOpponent:     (addr) => set({ opponentAddress: addr }),
  setIsPlayer1:    (b)    => set({ isPlayer1: b }),
  revealMyCard:    (id)   => set(s => ({ myCards: [...s.myCards, id] })),
  setMyEval:       (e)    => set({ myEval: e }),
  setOpponentEval: (e)    => set({ opponentEval: e }),
  setStatus:       (text, color) => set({ statusMsg: { text, color } }),
  setPot:          (n)    => set({ pot: n }),
  setBalance:      (n)    => set({ balance: n }),

  finishPvPHand: (p) => {
    const { pvpHistory, myCards, opponentCards: bc, opponentAddress } = get();
    const id = Math.floor(Math.random() * 100000).toString();
    set({
      pvpState:   'result',
      handResult: p.result,
      pot:        p.pot,
      balance:    p.balance,
      opponentCards: p.opponentCards ?? bc,
      statusMsg: {
        text:  p.result === 'WON'      ? `You won! +${p.delta} chips` :
               p.result === 'OPP_FOLD' ? 'Opponent folded — you win!' :
               p.result === 'FOLD'     ? 'You folded.' :
               p.result === 'DRAW'     ? 'Draw — pot split.' :
               `You lost. ${p.delta} chips`,
        color: p.result === 'WON' || p.result === 'OPP_FOLD' ? '#FFE03D' : '#FF3B3B',
      },
      pvpHistory: [{
        id,
        result:        p.result,
        desc:          p.desc,
        delta:         p.delta,
        txHash:        p.txHash,
        myCards,
        opponentCards: p.opponentCards ?? bc,
        opponent:      opponentAddress ?? '',
      }, ...pvpHistory],
    });
  },

  resetToIdle: () => set({
    pvpState:        'idle',
    tableId:         null,
    opponentAddress: null,
    isPlayer1:       true,
    myCards:          [],
    opponentCards:   [],
    myEval:          null,
    opponentEval:    null,
    pot:             0,
    handResult:      null,
    statusMsg:       { text: '', color: '#FFF' },
  }),

  resetForNextHand: () => set({
    pvpState:      'seated',
    myCards:        [],
    opponentCards: [],
    myEval:        null,
    opponentEval:  null,
    pot:           0,
    handResult:    null,
    statusMsg:     { text: 'Ready for next hand', color: '#FFF' },
  }),
}));
