/**
 * Tests for 5-card and 7-card hand evaluation.
 * Run: npx tsx tests/holdem-eval.test.ts
 */
import { evaluate5, evaluate7, getHoldemHandRank } from '../src/lib/holdem.js';
import { evaluateHand, getCardData } from '../src/lib/poker.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}

function cardStr(ids: number[]): string {
  return ids.map(id => { const d = getCardData(id); return d.rankString + d.suit; }).join(' ');
}

// Card IDs: rank = floor(id/4)+2, suit = id%4 (0=♥,1=♦,2=♣,3=♠)
// Ace=14 → id 48-51, King=13 → 44-47, Queen=12 → 40-43
// 2=rank2 → id 0-3

console.log('\n=== 5-Card Evaluation ===\n');

// Royal Flush: A♠ K♠ Q♠ J♠ 10♠
const royalFlush = [51, 47, 43, 39, 35];
const rf = evaluate5(royalFlush);
assert(rf.name === 'Royal Flush', `Royal Flush: ${rf.name}`);
assert(getHoldemHandRank(rf.score) === 'straightFlush', `Category: straightFlush`);

// Straight Flush: 5♥ 6♥ 7♥ 8♥ 9♥
const straightFlush = [12, 16, 20, 24, 28];
const sf = evaluate5(straightFlush);
assert(sf.name.includes('Straight Flush'), `Straight Flush: ${sf.name}`);

// Four of a Kind: A♥ A♦ A♣ A♠ 2♥
const quads = [48, 49, 50, 51, 0];
const q = evaluate5(quads);
assert(q.name.includes('Four'), `Quads: ${q.name}`);

// Full House: K♥ K♦ K♣ 2♥ 2♦
const fullHouse = [44, 45, 46, 0, 1];
const fh = evaluate5(fullHouse);
assert(fh.name.includes('Full House'), `Full House: ${fh.name}`);

// Flush: A♥ Q♥ 7♥ 4♥ 2♥
const flush = [48, 40, 20, 8, 0];
const fl = evaluate5(flush);
assert(fl.name.includes('Flush'), `Flush: ${fl.name}`);

// Straight: 5♥ 6♦ 7♥ 8♦ 9♥
const straight = [12, 17, 20, 25, 28];
const st = evaluate5(straight);
assert(st.name.includes('Straight'), `Straight: ${st.name}`);

// Wheel: A♥ 2♥ 3♦ 4♥ 5♦
const wheel = [48, 0, 5, 8, 13];
const wh = evaluate5(wheel);
assert(wh.name.includes('Straight') && wh.name.includes('5'), `Wheel: ${wh.name}`);

// Three of a Kind: A♥ A♦ A♣ 3♥ 4♥
const trips = [48, 49, 50, 4, 8];
const tr = evaluate5(trips);
assert(tr.name.includes('Three'), `Trips: ${tr.name}`);

// Two Pair: A♥ A♦ K♥ K♦ 4♥
const twoPair = [48, 49, 44, 45, 8];
const tp = evaluate5(twoPair);
assert(tp.name.includes('Two Pair'), `Two Pair: ${tp.name}`);

// One Pair: A♥ A♦ 2♥ 3♥ 4♥
const onePair = [48, 49, 0, 4, 8];
const op = evaluate5(onePair);
assert(op.name.includes('Pair'), `One Pair: ${op.name}`);

// High Card: A♥ Q♦ 7♥ 4♦ 2♦
const highCard = [48, 41, 20, 9, 1];
const hc = evaluate5(highCard);
assert(hc.name.includes('high'), `High Card: ${hc.name}`);

// Score ordering
console.log('\n=== Score Ordering ===\n');
assert(rf.score > sf.score, 'Royal Flush > Straight Flush');
assert(sf.score > q.score, 'Straight Flush > Quads');
assert(q.score > fh.score, 'Quads > Full House');
assert(fh.score > fl.score, 'Full House > Flush');
assert(fl.score > st.score, 'Flush > Straight');
assert(st.score > tr.score, 'Straight > Trips');
assert(tr.score > tp.score, 'Trips > Two Pair');
assert(tp.score > op.score, 'Two Pair > Pair');
assert(op.score > hc.score, 'Pair > High Card');
assert(st.score > wh.score, 'Normal straight > Wheel');

console.log('\n=== 7-Card Best-of-7 Evaluation ===\n');

// 7 cards with full house: K♥ K♦ K♣ 2♥ 2♦ 7♠ 9♣
const fh7 = [44, 45, 46, 0, 1, 23, 30];
const fh7r = evaluate7(fh7);
assert(fh7r.name.includes('Full House'), `7-card FH: ${fh7r.name}`);
assert(fh7r.score > evaluate5([44, 45, 0, 23, 30]).score, 'Best 5 of 7 > any 5');

// 7 cards with flush: A♥ K♥ Q♥ 7♥ 4♥ 2♠ 9♣
const fl7 = [48, 44, 40, 20, 8, 3, 30];
const fl7r = evaluate7(fl7);
assert(fl7r.name.includes('Flush'), `7-card Flush: ${fl7r.name}`);

// 7 cards with straight: 5♥ 6♦ 7♣ 8♠ 9♥ K♦ 2♣
const st7 = [12, 17, 22, 27, 28, 45, 2];
const st7r = evaluate7(st7);
assert(st7r.name.includes('Straight'), `7-card Straight: ${st7r.name}`);

// 7 cards with just a pair: A♥ A♦ K♣ Q♠ 10♥ 7♦ 3♣
const pair7 = [48, 49, 46, 43, 32, 21, 6];
const pair7r = evaluate7(pair7);
assert(pair7r.name.includes('Pair'), `7-card Pair: ${pair7r.name}`);

console.log('\n=== 3-Card Evaluation ===\n');

// Mini Royal: A♥ K♥ Q♥
const miniRoyal = [48, 44, 40];
const mr = evaluateHand(miniRoyal);
assert(mr.name === 'Mini Royal', `Mini Royal: ${mr.name}`);

// Trip Aces: A♥ A♦ A♣
const tripA = [48, 49, 50];
const ta = evaluateHand(tripA);
assert(ta.name.includes('Trip'), `3-Card Trips: ${ta.name}`);

// Pair of Kings: K♥ K♦ 2♣
const pairK = [44, 45, 2];
const pk = evaluateHand(pairK);
assert(pk.name.includes('Pair') && pk.name.includes('Kings'), `3-Card Pair: ${pk.name}`);

console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(40)}\n`);

if (failed > 0) process.exit(1);
