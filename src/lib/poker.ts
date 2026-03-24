// ═══════════════════════════════════════════════════════════════════════
//  3-Card Poker Engine — Hand evaluation & display utilities
//  Card ID layout: 0–51  →  rank = floor(id/4)+2, suit = id%4
//  Mirrors on-chain FHE logic: FHE.div(card,4) / FHE.rem(card,4)
// ═══════════════════════════════════════════════════════════════════════

export type Suit = '♥' | '♦' | '♣' | '♠';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface CardData {
  id: number;   // 0-51
  suit: Suit;
  rank: Rank;
  rankString: string;
}

export interface HandEvaluation {
  name: string;
  score: number;
  cards: CardData[];
}

/** Full payout breakdown returned after showdown */
export interface PayoutResult {
  result:       'WON' | 'LOST' | 'PUSH' | 'FOLD';
  qualified:    boolean;
  antePayout:   number;
  playPayout:   number;
  anteBonus:    number;
  pairPlus:     number;
  totalDelta:   number;
  desc:         string;
}

// ── Constants ──────────────────────────────────────────────────────────
const SUITS: Suit[] = ['♥', '♦', '♣', '♠'];

const RANK_NAME: Record<number, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8',
  9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

const RANK_WORD: Record<number, string> = {
  2: 'Twos', 3: 'Threes', 4: 'Fours', 5: 'Fives', 6: 'Sixes',
  7: 'Sevens', 8: 'Eights', 9: 'Nines', 10: 'Tens',
  11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces',
};

// Hand category identifiers
export type HandRank =
  | 'miniRoyal' | 'straightFlush' | 'trips'
  | 'straight'  | 'flush'         | 'pair' | 'highCard';

// ── Card Data ──────────────────────────────────────────────────────────
export const getCardData = (id: number): CardData => {
  const rank = (Math.floor(id / 4) + 2) as Rank;
  return {
    id,
    suit: SUITS[id % 4],
    rank,
    rankString: RANK_NAME[rank],
  };
};

// ── Hand Evaluation ────────────────────────────────────────────────────
//  Score bands (higher = better):
//    6_xxx  Straight Flush / Mini Royal
//    5_xxx  Three of a Kind
//    4_xxx  Straight
//    3_xxx  Flush
//    2_xxx  Pair
//    0_xxx  High Card
// ───────────────────────────────────────────────────────────────────────

const score3 = (a: number, b: number, c: number) =>
  a * 10000 + b * 100 + c;

export const evaluateHand = (cardIds: number[]): HandEvaluation => {
  if (cardIds.length !== 3) {
    return { name: 'Invalid', score: 0, cards: [] };
  }

  const cards = cardIds.map(getCardData);
  const sorted = [...cards].sort((a, b) => b.rank - a.rank);
  const [hi, mid, lo] = sorted;

  const isFlush = hi.suit === mid.suit && mid.suit === lo.suit;

  let isStraight = false;
  let straightHigh = hi.rank;

  if (hi.rank === mid.rank + 1 && mid.rank === lo.rank + 1) {
    isStraight = true;
  } else if (hi.rank === 14 && mid.rank === 3 && lo.rank === 2) {
    isStraight = true;
    straightHigh = 3; // A plays low
  }

  const isTrips = hi.rank === mid.rank && mid.rank === lo.rank;

  let pairRank = 0;
  let kicker = 0;
  if (!isTrips) {
    if (hi.rank === mid.rank) {
      pairRank = hi.rank;
      kicker = lo.rank;
    } else if (mid.rank === lo.rank) {
      pairRank = mid.rank;
      kicker = hi.rank;
    }
  }

  let score: number;
  let name: string;

  if (isStraight && isFlush) {
    name = straightHigh === 14 ? 'Mini Royal' : `Straight Flush, ${RANK_NAME[straightHigh]}-high`;
    score = 6_000_000 + straightHigh;
  } else if (isTrips) {
    name = `Trip ${RANK_WORD[hi.rank]}`;
    score = 5_000_000 + hi.rank;
  } else if (isStraight) {
    name = `Straight, ${RANK_NAME[straightHigh]}-high`;
    score = 4_000_000 + straightHigh;
  } else if (isFlush) {
    name = `${RANK_NAME[hi.rank]}-high Flush`;
    score = 3_000_000 + score3(hi.rank, mid.rank, lo.rank);
  } else if (pairRank > 0) {
    name = `Pair of ${RANK_WORD[pairRank]}`;
    score = 2_000_000 + pairRank * 10000 + kicker;
  } else {
    name = `${RANK_NAME[hi.rank]}-high`;
    score = score3(hi.rank, mid.rank, lo.rank);
  }

  return { name, score, cards: sorted };
};

/** Returns the HandRank category for a given score */
export const getHandRank = (score: number): HandRank => {
  if (score >= 6_000_000) {
    return (score - 6_000_000) === 14 ? 'miniRoyal' : 'straightFlush';
  }
  if (score >= 5_000_000) return 'trips';
  if (score >= 4_000_000) return 'straight';
  if (score >= 3_000_000) return 'flush';
  if (score >= 2_000_000) return 'pair';
  return 'highCard';
};

// ── Q-6-4 Strategy (beginner hints) ──────────────────────────────────

export const Q64_SCORE = score3(12, 6, 4);

/** Optimal Q-6-4 strategy hint for beginner mode */
export const getOptimalAction = (cardIds: number[]): { action: 'PLAY' | 'FOLD'; reason: string } => {
  const ev = evaluateHand(cardIds);
  if (ev.score >= 2_000_000) return { action: 'PLAY', reason: `${ev.name} — always play pairs+` };
  if (ev.score >= Q64_SCORE) return { action: 'PLAY', reason: `${ev.name} — above Q-6-4 threshold` };
  return { action: 'FOLD', reason: `${ev.name} — below Q-6-4 threshold` };
};

// ── Utilities ──────────────────────────────────────────────────────────

export const compareHands = (a: HandEvaluation, b: HandEvaluation): number =>
  a.score - b.score;

export const describeHand = (cardIds: number[]): string => {
  const ev = evaluateHand(cardIds);
  const cardStr = ev.cards.map(c => `${c.rankString}${c.suit}`).join(' ');
  return `${cardStr} — ${ev.name}`;
};
