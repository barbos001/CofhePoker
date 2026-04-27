import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { HandEvaluation, PayoutResult } from '@/lib/poker';
import { insertHandResult } from '@/lib/db';

export type AppState    = 'landing' | 'connecting' | 'app';
export type Tab         = 'play' | 'history' | 'profile' | 'leaderboard' | 'help' | 'settings';
export type GameMode    = 'three-card' | 'holdem';
export type PlayState   = 'lobby' | 'dealing' | 'decrypting' | 'playerTurn' | 'folding' | 'botThinking' | 'showdown' | 'result' | 'confirmAction';
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
  playerEval?: HandEvaluation;
  botEval?:    HandEvaluation;
  gameMode?:   GameMode | 'pvp';
  timestamp:   number;
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
  gameMode?:   GameMode | 'pvp';
}

interface GameStore {
  appState:    AppState;
  activeTab:   Tab;
  setAppState: (state: AppState) => void;
  setActiveTab:(tab: Tab) => void;

  address:    string | null;
  setAddress: (addr: string | null) => void;

  sessionStartedAt: number | null;
  lastDecryptAt:    number | null;
  setSessionStartedAt: (t: number | null) => void;
  setLastDecryptAt:    (t: number | null) => void;

  permitStatus:           PermitState;
  permitError:            string | null;
  permitExpiresAt:        number | null;
  hasSeenPermitExplainer: boolean;
  setPermitStatus:           (s: PermitState) => void;
  setPermitError:            (e: string | null) => void;
  setPermitExpiry:           (t: number | null) => void;
  setHasSeenPermitExplainer: (v: boolean) => void;

  tableId:    number | null;
  setTableId: (id: number | null) => void;

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

function computeStreak(history: HandHistory[]): number {
  if (history.length === 0) return 0;
  const first = history[0].result;
  if (first !== 'WON' && first !== 'LOST') return 0;
  let n = 0;
  for (const h of history) {
    if (h.result === first) n++; else break;
  }
  return n;
}

export const useGameStore = create<GameStore>()(persist((set, get) => ({
  appState:  'landing',
  activeTab: 'play',
  setAppState:  (state) => set({ appState: state }),
  setActiveTab: (tab)   => set({ activeTab: tab }),

  address:    null,
  setAddress: (addr) => set({ address: addr }),

  sessionStartedAt: null,
  lastDecryptAt:    null,
  setSessionStartedAt: (t) => set({ sessionStartedAt: t }),
  setLastDecryptAt:    (t) => set({ lastDecryptAt: t }),

  permitStatus:           'none',
  permitError:            null,
  permitExpiresAt:        null,
  hasSeenPermitExplainer: false,
  setPermitStatus:           (s) => set({ permitStatus: s, permitError: s === 'error' ? get().permitError : null }),
  setPermitError:            (e) => set({ permitError: e, permitStatus: e ? 'error' : get().permitStatus }),
  setPermitExpiry:           (t) => set({ permitExpiresAt: t }),
  setHasSeenPermitExplainer: (v) => set({ hasSeenPermitExplainer: v }),

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

  setPlayState:   (s)           => set({ playState: s }),
  setStatus:      (text, color) => set({ statusMsg: { text, color } }),
  setBalance:     (n)           => set({ balance: n }),
  setPairPlusBet: (n)           => set({ pairPlusBet: n }),
  setGameMode:    (m)           => set({ gameMode: m }),
  setHoldemRound: (r)           => set({ holdemRound: r }),

  revealPlayerCard:    (cardId) => set((s) => ({ playerCards:    [...s.playerCards, cardId] })),
  clearPlayerCards:    ()       => set({ playerCards: [] }),
  revealCommunityCard: (cardId) => set((s) => ({ communityCards: [...s.communityCards, cardId] })),
  clearCommunityCards: ()       => set({ communityCards: [] }),
  setPlayerEval: (e) => set({ playerEval: e }),
  setBotEval:    (e) => set({ botEval: e }),

  finishHand: ({ result, delta, desc, pot, balance, txHash, playerCards, botCards, payout, gameMode }) => {
    const { history, playerCards: pc, botCards: bc, playerEval: pe, botEval: be } = get();
    const id = crypto.randomUUID();

    let statusText  = '';
    let statusColor = '#FFF';
    if (result === 'WON') {
      statusText  = `You Won! +${delta} chips`;
      statusColor = '#FFE03D';
      if (payout?.anteBonus > 0) statusText += ` (Ante Bonus +${payout.anteBonus})`;
      if (payout?.pairPlus  > 0) statusText += ` (Pair+ +${payout.pairPlus})`;
      if (payout && !payout.qualified) statusText = `Dealer didn't qualify! +${delta} chips`;
    } else if (result === 'PUSH') {
      statusText  = 'Push - bets returned';
      statusColor = '#888';
    } else if (result === 'FOLD') {
      statusText  = 'You folded.';
      statusColor = '#FF3B3B';
    } else {
      statusText  = `You Lost. ${delta} chips`;
      statusColor = '#FF3B3B';
    }

    const newHand: HandHistory = {
      id, result, desc, delta, txHash,
      playerCards: playerCards ?? pc,
      botCards:    botCards    ?? bc,
      payout,
      playerEval:  pe ?? undefined,
      botEval:     be ?? undefined,
      gameMode,
      timestamp: Date.now(),
    };
    const newHistory = [newHand, ...history];

    set({
      playState:  'result',
      handResult: result,
      lastPayout: payout ?? null,
      pot,
      balance,
      statusMsg: { text: statusText, color: statusColor },
      history:   newHistory,
    });

    // Side effects: profile / challenges / notifications / Supabase sync
    // Deferred so they run outside the current synchronous Zustand dispatch
    const playerAddress = get().address ?? 'anonymous';
    queueMicrotask(() => _sideEffects(newHistory, result, delta, balance, gameMode, pe?.name, playerAddress));
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
    tableId:        null,
  }),
}), {
  name: 'cofhe-poker-game',
  partialize: (state) => ({
    appState:               state.appState === 'connecting' ? 'app' : state.appState,
    tableId:                state.tableId,
    gameMode:               state.gameMode,
    activeTab:              state.activeTab,
    hasSeenPermitExplainer: state.hasSeenPermitExplainer,
    sessionStartedAt:       state.sessionStartedAt,
    // history and balance NOT persisted — loaded from Supabase on wallet connect
  }),
}));

// ── Side effects helper (outside store to keep store lean) ────────────────────
async function _sideEffects(
  newHistory:     HandHistory[],
  result:         HandHistory['result'],
  delta:          number,
  balance:        number,
  gameMode:       GameMode | 'pvp' | undefined,
  evalName:       string | undefined,
  playerAddress:  string,
) {
  const wins       = newHistory.filter(h => h.result === 'WON').length;
  const handsTotal = newHistory.length;
  const streak     = computeStreak(newHistory);
  const oldBalance = balance - delta;
  const lastMode   = gameMode ?? 'three-card';

  // ── 1. Profile: XP + achievements ─────────────────────────────────────────
  try {
    const { useProfileStore } = await import('./useProfileStore');
    const prevUnlocked = useProfileStore.getState().achievements.filter(a => a.unlockedAt).length;

    const holdemHandsCount = newHistory.filter(h => h.gameMode === 'holdem').length;
    const pvpHandsCount    = newHistory.filter(h => h.gameMode === 'pvp').length;

    useProfileStore.getState().checkAchievements({
      handsTotal,
      wins,
      streak,
      balance,
      lastDelta:      delta,
      lastResult:     result,
      lastMode,
      hadLowBalance:  oldBalance < 500,
      playerEvalName: evalName,
      holdemHandsCount,
      pvpHandsCount,
    });

    // Notification for each new achievement
    const nowUnlocked = useProfileStore.getState().achievements.filter(a => a.unlockedAt).length;
    if (nowUnlocked > prevUnlocked) {
      const justUnlocked = useProfileStore
        .getState().achievements
        .filter(a => a.unlockedAt && (Date.now() - (a.unlockedAt ?? 0)) < 5000);

      const { useNotificationsStore } = await import('./useNotificationsStore');
      justUnlocked.forEach(a =>
        useNotificationsStore.getState().add({
          type:  'challenge',
          title: `Achievement: ${a.name}`,
          body:  a.desc,
          icon:  a.icon,
        }),
      );
    }
  } catch { /* profile store not yet loaded */ }

  // ── 2. Challenges: auto-increment progress ─────────────────────────────────
  try {
    const { useChallengesStore } = await import('./useChallengesStore');
    const cs = useChallengesStore.getState();
    cs.refreshIfNeeded();

    cs.incrementProgress('w3');                              // Any hand → All-Star Week
    if (result === 'WON')          { cs.incrementProgress('d1'); cs.incrementProgress('w1'); }
    if (result === 'FOLD')           cs.incrementProgress('d3'); // Fold Smart
    if (lastMode === 'holdem')       cs.incrementProgress('d2'); // Play Hold'em
    if (lastMode === 'pvp')          cs.incrementProgress('w2'); // Try PvP

    // Notify on first claimable challenge
    const claimable = useChallengesStore.getState().challenges
      .filter(c => c.progress >= c.goal && !c.claimed);
    if (claimable.length > 0) {
      const { useNotificationsStore } = await import('./useNotificationsStore');
      useNotificationsStore.getState().add({
        type:  'challenge',
        title: 'Challenge Complete!',
        body:  `"${claimable[0].title}" — claim +${claimable[0].reward} chips in Settings`,
        icon:  '🎯',
      });
    }
  } catch { /* challenges store not yet loaded */ }

  // ── 3. Win/loss notifications ──────────────────────────────────────────────
  try {
    const { useNotificationsStore } = await import('./useNotificationsStore');
    const ns = useNotificationsStore.getState();

    if (result === 'WON') {
      ns.add({
        type:  'win',
        title: `Won +${delta} chips`,
        body:  evalName ? `${evalName}` : 'Hand complete',
        icon:  '🏆',
      });
    } else if (result === 'LOST' && Math.abs(delta) >= 30) {
      ns.add({
        type:  'loss',
        title: `Lost ${delta} chips`,
        body:  'Better luck next hand',
        icon:  '💸',
      });
    }
  } catch { /* notifications store not yet loaded */ }

  // ── 4. Sync to Supabase backend (full hand data) ─────────────────────────
  try {
    const hand = newHistory[0];
    if (hand) {
      await insertHandResult({
        id:             `${hand.txHash || hand.id}-${hand.timestamp}`,
        player_address: playerAddress,
        mode:           lastMode,
        result,
        delta,
        pot:            0,
        eval_name:      evalName ?? null,
        tx_hash:        hand.txHash ?? '',
        played_at:      new Date(hand.timestamp).toISOString(),
        player_cards:   hand.playerCards?.length ? JSON.stringify(hand.playerCards) : null,
        bot_cards:      hand.botCards?.length    ? JSON.stringify(hand.botCards)    : null,
        player_eval:    hand.playerEval?.name    ?? null,
        bot_eval:       hand.botEval?.name       ?? null,
        payout:         hand.payout              ? JSON.stringify(hand.payout)      : null,
      });
    }
  } catch { /* Supabase not configured or offline */ }
}
