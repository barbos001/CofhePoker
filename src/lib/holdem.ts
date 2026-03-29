// ═══════════════════════════════════════════════════════════════════════
//  Texas Hold'em Engine — 5-card hand evaluation (display utility)
//  Card ID layout: 0–51  →  rank = floor(id/4)+2, suit = id%4
//  Mirrors on-chain FHE CofheHoldem._evalHand5()
// ═══════════════════════════════════════════════════════════════════════

import { type HandEvaluation, getCardData } from './poker';


export type HoldemHandRank =
  | 'straightFlush' | 'fourOfAKind' | 'fullHouse'
  | 'flush' | 'straight' | 'threeOfAKind'
  | 'twoPair' | 'onePair' | 'highCard';

const CAT = {
  HIGH_CARD:      0,
  ONE_PAIR:       1,
  TWO_PAIR:       2,
  THREE_OF_KIND:  3,
  STRAIGHT:       4,
  FLUSH:          5,
  FULL_HOUSE:     6,
  FOUR_OF_KIND:   7,
  STRAIGHT_FLUSH: 8,
} as const;

const RANK_NAME: Record<number, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8',
  9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

const RANK_PLURAL: Record<number, string> = {
  2: 'Twos', 3: 'Threes', 4: 'Fours', 5: 'Fives', 6: 'Sixes',
  7: 'Sevens', 8: 'Eights', 9: 'Nines', 10: 'Tens',
  11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces',
};


/**
 * Evaluate a 5-card hand.
 * Uses pair-count method matching the on-chain FHE logic:
 *   pc = number of rank-equal pairs among C(5,2)=10 comparisons
 *   pc=0 → high card / straight / flush / straight-flush
 *   pc=1 → one pair
 *   pc=2 → two pair
 *   pc=3 → three of a kind
 *   pc=4 → full house
 *   pc=6 → four of a kind
 */
export const evaluate5 = (cardIds: number[]): HandEvaluation => {
  if (cardIds.length !== 5) {
    return { name: 'Invalid', score: 0, cards: [] };
  }

  const cards = cardIds.map(getCardData);
  const ranks = cards.map(c => c.rank).sort((a, b) => a - b);
  const suits = cards.map(c => c.suit);

  let pairCount = 0;
  for (let i = 0; i < 5; i++) {
    for (let j = i + 1; j < 5; j++) {
      if (ranks[i] === ranks[j]) pairCount++;
    }
  }

  const isFlush = suits.every(s => s === suits[0]);

  let isStraight = false;
  let straightHigh = 0;

  if (
    ranks[4] - ranks[3] === 1 &&
    ranks[3] - ranks[2] === 1 &&
    ranks[2] - ranks[1] === 1 &&
    ranks[1] - ranks[0] === 1
  ) {
    isStraight = true;
    straightHigh = ranks[4];
  }

  // Ace-low straight (wheel): A-2-3-4-5
  if (!isStraight && ranks[0] === 2 && ranks[1] === 3 && ranks[2] === 4 && ranks[3] === 5 && ranks[4] === 14) {
    isStraight = true;
    straightHigh = 5;
  }

  if (pairCount > 0) isStraight = false;

  let category: number;

  if (isStraight && isFlush) {
    category = CAT.STRAIGHT_FLUSH;
  } else if (pairCount === 6) {
    category = CAT.FOUR_OF_KIND;
  } else if (pairCount === 4) {
    category = CAT.FULL_HOUSE;
  } else if (isFlush) {
    category = CAT.FLUSH;
  } else if (isStraight) {
    category = CAT.STRAIGHT;
  } else if (pairCount === 3) {
    category = CAT.THREE_OF_KIND;
  } else if (pairCount === 2) {
    category = CAT.TWO_PAIR;
  } else if (pairCount === 1) {
    category = CAT.ONE_PAIR;
  } else {
    category = CAT.HIGH_CARD;
  }

  const sortedForScore = getScoringOrder(ranks, category, straightHigh);
  const score =
    category * 1e10 +
    sortedForScore[4] * 1e8 +
    sortedForScore[3] * 1e6 +
    sortedForScore[2] * 1e4 +
    sortedForScore[1] * 100 +
    sortedForScore[0];

  const name = buildHandName(category, ranks, straightHigh);
  const sortedCards = [...cards].sort((a, b) => b.rank - a.rank);

  return { name, score, cards: sortedCards };
};

/**
 * Order ranks for scoring so matched cards sort above kickers.
 * adjustedRank = rank + (matchCount-1) * 14
 */
function getScoringOrder(ranks: number[], category: number, straightHigh: number): number[] {
  if (category === CAT.STRAIGHT || category === CAT.STRAIGHT_FLUSH) {
    if (straightHigh === 5) return [1, 2, 3, 4, 5];
    return [
      straightHigh - 4, straightHigh - 3, straightHigh - 2,
      straightHigh - 1, straightHigh,
    ];
  }

  const countMap = new Map<number, number>();
  for (const r of ranks) countMap.set(r, (countMap.get(r) ?? 0) + 1);

  const adjusted = ranks.map(r => r + (countMap.get(r)! - 1) * 14);
  return [...adjusted].sort((a, b) => a - b);
}

function buildHandName(category: number, ranks: number[], straightHigh: number): string {
  const sorted = [...ranks].sort((a, b) => b - a);

  switch (category) {
    case CAT.STRAIGHT_FLUSH:
      return straightHigh === 14 ? 'Royal Flush' : `Straight Flush, ${RANK_NAME[straightHigh]}-high`;
    case CAT.FOUR_OF_KIND:
      return `Four ${RANK_PLURAL[findRankWithCount(ranks, 4)]}`;
    case CAT.FULL_HOUSE:
      return `Full House, ${RANK_PLURAL[findRankWithCount(ranks, 3)]} over ${RANK_PLURAL[findRankWithCount(ranks, 2)]}`;
    case CAT.FLUSH:
      return `${RANK_NAME[sorted[0]]}-high Flush`;
    case CAT.STRAIGHT:
      return `Straight, ${RANK_NAME[straightHigh]}-high`;
    case CAT.THREE_OF_KIND:
      return `Three ${RANK_PLURAL[findRankWithCount(ranks, 3)]}`;
    case CAT.TWO_PAIR: {
      const pairs = findAllRanksWithCount(ranks, 2).sort((a, b) => b - a);
      return `Two Pair, ${RANK_PLURAL[pairs[0]]} and ${RANK_PLURAL[pairs[1]]}`;
    }
    case CAT.ONE_PAIR:
      return `Pair of ${RANK_PLURAL[findRankWithCount(ranks, 2)]}`;
    default:
      return `${RANK_NAME[sorted[0]]}-high`;
  }
}

function findRankWithCount(ranks: number[], count: number): number {
  const freq = new Map<number, number>();
  for (const r of ranks) freq.set(r, (freq.get(r) ?? 0) + 1);
  for (const [r, c] of freq) if (c === count) return r;
  return 0;
}

function findAllRanksWithCount(ranks: number[], count: number): number[] {
  const freq = new Map<number, number>();
  for (const r of ranks) freq.set(r, (freq.get(r) ?? 0) + 1);
  const result: number[] = [];
  for (const [r, c] of freq) if (c === count) result.push(r);
  return result;
}



/**
 * Evaluate best 5-card hand from 7 cards.
 * Uses C(7,5)=21 brute-force on the client (cheap in JS, only FHE needs the direct approach).
 */
export const evaluate7 = (cardIds: number[]): HandEvaluation => {
  if (cardIds.length < 5) return { name: 'Incomplete', score: 0, cards: [] };
  if (cardIds.length === 5) return evaluate5(cardIds);

  let best: HandEvaluation = { name: '', score: -1, cards: [] };

  // Generate all C(n,5) combinations
  const n = cardIds.length;
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            const ev = evaluate5([cardIds[a], cardIds[b], cardIds[c], cardIds[d], cardIds[e]]);
            if (ev.score > best.score) best = ev;
          }

  return best;
};


export const getHoldemHandRank = (score: number): HoldemHandRank => {
  const cat = Math.floor(score / 1e10);
  switch (cat) {
    case CAT.STRAIGHT_FLUSH: return 'straightFlush';
    case CAT.FOUR_OF_KIND:   return 'fourOfAKind';
    case CAT.FULL_HOUSE:     return 'fullHouse';
    case CAT.FLUSH:          return 'flush';
    case CAT.STRAIGHT:       return 'straight';
    case CAT.THREE_OF_KIND:  return 'threeOfAKind';
    case CAT.TWO_PAIR:       return 'twoPair';
    case CAT.ONE_PAIR:       return 'onePair';
    default:                 return 'highCard';
  }
};
