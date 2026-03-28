<div align="center">

# ♠ Cofhe Poker

**Fully on-chain poker with FHE-encrypted cards — powered by Fhenix CoFHE**

`4 contracts` · `700+ FHE ops per hand` · `4 game modes` · `35M gas showdowns` · `all deployed on Sepolia`

[![Ethereum Sepolia](https://img.shields.io/badge/Network-Ethereum_Sepolia-blue)](https://sepolia.etherscan.io)
[![CoFHE SDK](https://img.shields.io/badge/CoFHE_SDK-0.4.0-green)](https://www.npmjs.com/package/@cofhe/sdk)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

Every card is dealt, evaluated, and compared as ciphertext. The contract runs a complete poker engine — pair detection, flush checks, straight detection, hand scoring — on values it literally cannot read. Only the CoFHE threshold network can decrypt, and only for addresses the contract explicitly permits.

[Hold'em PvP Contract](https://sepolia.etherscan.io/address/0x309Dd767C98eb52C84ff44389A2066385b9C27e9) · [3-Card Contract](https://sepolia.etherscan.io/address/0x8D32d4B87aa3Db55Ac0Eae3DC2c2343CEd9F3470) · [Fhenix Docs](https://cofhe-docs.fhenix.zone)

</div>

---

## Why Cofhe Poker

Online poker has a trust problem. Every major platform runs a centralized server that knows every hand — it generates the cards, evaluates them, and determines winners. "Provably fair" usually means a hash commitment, but the server still generates plaintext cards. You verify after the fact; you trust during the game.

Blockchain poker projects aren't much better. Most move card logic off-chain to a trusted oracle or MPC ceremony, then post results on-chain. The chain becomes an expensive settlement layer, not a game engine.

Cofhe Poker makes the chain **the game engine**. Card generation, hand evaluation, bot decisions, showdown comparison — all of it runs as encrypted computation through the Fhenix CoFHE threshold network. The contract processes `euint64` values it cannot read. The CoFHE network reconstructs plaintext only for addresses with explicit `FHE.allow` permission.

**FHE vs commit-reveal:** Commit-reveal schemes hide cards temporarily but require eventual plaintext reveal on-chain. FHE keeps card values encrypted permanently — hand scores are compared via `FHE.gt()` on ciphertext, and only the boolean result (winner/loser) is ever decrypted.

### What Makes This Hard

Most FHE applications do simple operations — encrypted addition, comparison, a conditional select. Cofhe Poker pushes FHE to its limits:

| Challenge | Numbers |
|-----------|---------|
| 7-card hand evaluation | ~350 FHE operations per player |
| PvP showdown (both players) | ~700 FHE ops, ~35M gas |
| Pair detection (Hold'em) | 21 pairwise `FHE.eq()` comparisons |
| Flush detection | 28 `FHE.eq()` checks (4 suits × 7 cards) |
| Straight detection | Bubble sort on encrypted ranks + sliding window |
| Bot decision per street | Separate evaluation function (2/5/6/7 cards) |

This is not "store an encrypted number and decrypt it later." This is a full algorithmic computation graph running on ciphertext.

---

## Game Modes

| Mode | Players | FHE Ops | Description |
|------|---------|---------|-------------|
| **3-Card Poker vs Bot** | 1 | ~80 | Casino-style: 3 encrypted cards each, play or fold, instant FHE showdown |
| **3-Card PvP** | 2 | ~80 | Player vs player with rooms, invite codes, on-chain friend system |
| **Texas Hold'em vs Bot** | 1 | ~500 | Full 4-round game: pre-flop, flop, turn, river with FHE bot evaluation per street |
| **Hold'em PvP** | 2 | ~700 | Heads-up Hold'em: dealer rotation, blinds, all-in, side pots, timeouts, EIP-712 batch actions |

---

## How FHE Works in This Game — Fhenix Integration

### Architecture

```
User (Browser)                 Ethereum Sepolia              CoFHE (Fhenix)
┌─────────────┐                ┌──────────────┐              ┌──────────────┐
│ @cofhe/sdk  │──permits──────>│ CofhePoker   │──FHE ops────>│ FHEOS Server │
│ WASM init   │                │ CofheHoldem  │<─results─────│ (off-chain)  │
│ decrypt     │                │ FHE.add()    │              └──────────────┘
└──────┬──────┘                │ FHE.select() │              ┌──────────────┐
       │                       └──────────────┘              │  Threshold   │
       │──permit (EIP-712)──────────────────────────────────>│  Network     │
       │<─decrypted card value──────────────────────────────│ (key shares) │
       │                                                     └──────────────┘
```

1. **Card dealing** — Contract calls `FHE.randomEuint64()` to generate encrypted random seeds. Each card is `(seed + offset) % 52`, computed entirely in ciphertext via `FHE.add()` + `FHE.rem()`
2. **ACL gating** — `FHE.allow(card, playerAddress)` permits only that player to decrypt. `FHE.allowPublic(card)` reveals community cards each round
3. **Hand evaluation** — `_evalHand7()` runs ~350 FHE operations: pairwise comparisons, flush/straight detection, bubble sort, nested selects — all on encrypted values
4. **Showdown** — `FHE.gt(playerScore, botScore)` compares encrypted scores. `FHE.eq()` detects ties. Only the boolean result is decrypted
5. **Threshold decryption** — Authorized user signs EIP-712 permit → CoFHE Threshold Network reconstructs plaintext from key shares → card value returned only to that user

### Smart Contract — FHE Card Engine

```solidity
import {FHE, euint64, ebool, InEuint64}
  from "@fhenixprotocol/cofhe-contracts/FHE.sol";

// === CARD DEALING ===
// Generate encrypted random seed — even the contract can't read it
euint64 seed = FHE.randomEuint64();

// Map to card ID (0-51) entirely in ciphertext
euint64 cardId = FHE.rem(FHE.add(seed, FHE.asEuint64(offset)), FHE.asEuint64(52));

// Extract rank and suit — contract never sees the actual numbers
euint64 rank = FHE.div(cardId, FHE.asEuint64(4));   // 0-12 (2 through Ace)
euint64 suit = FHE.rem(cardId, FHE.asEuint64(4));   // 0-3 (♣♦♥♠)

// ACL: only this player can decrypt their cards
FHE.allow(cardId, playerAddress);
FHE.allowThis(cardId);  // contract needs access for evaluation

// === HAND EVALUATION (3-CARD) ===
// Pair detection — compare all 3 ranks pairwise
ebool pair01 = FHE.eq(rank0, rank1);
ebool pair02 = FHE.eq(rank0, rank2);
ebool pair12 = FHE.eq(rank1, rank2);
ebool hasPair = FHE.or(FHE.or(pair01, pair02), pair12);

// Three of a kind
ebool hasTrips = FHE.and(pair01, pair12);

// Flush detection — all 3 suits equal
ebool flush01 = FHE.eq(suit0, suit1);
ebool flush02 = FHE.eq(suit0, suit2);
ebool isFlush = FHE.and(flush01, flush02);

// Score calculation — nested FHE.select() for hand type
euint64 score = FHE.select(hasTrips,
    FHE.add(FHE.asEuint64(400), maxRank),           // trips: 400+rank
    FHE.select(isFlush,
        FHE.asEuint64(200),                          // flush: 200
        FHE.select(hasPair,
            FHE.add(FHE.asEuint64(100), pairRank),  // pair: 100+rank
            maxRank                                   // high card: rank
        )
    )
);

// === 7-CARD EVALUATION (TEXAS HOLD'EM) ===
// 21 pairwise rank comparisons for pair/trips/quads detection
for i in 0..6:
    for j in (i+1)..7:
        matches[i][j] = FHE.eq(ranks[i], ranks[j])

// Flush detection: 4 suits × 7 cards = 28 equality checks
for suit in 0..4:
    for card in 0..7:
        suitMatch[suit] += FHE.select(FHE.eq(suits[card], suit), ONE, ZERO)

// Bubble sort encrypted ranks for straight detection
// FHE.min + FHE.max per swap — contract sorts values it can't see
sorted[i] = FHE.min(a, b);
sorted[j] = FHE.max(a, b);

// Hand type scoring: 10B multiplier separates hand categories
// handType * 10_000_000_000 + kicker hierarchy
euint64 finalScore = FHE.add(
    FHE.mul(handType, FHE.asEuint64(10_000_000_000)),
    kickerScore
);

// === SHOWDOWN ===
// Compare encrypted scores — never decrypted
ebool p1Wins = FHE.gt(player1Score, player2Score);
ebool isTie = FHE.eq(player1Score, player2Score);

// Only decrypt the boolean result, not the scores
FHE.decrypt(p1Wins);
FHE.decrypt(isTie);

// Pot split on tie
euint64 halfPot = FHE.div(FHE.asEuint64(pot), FHE.asEuint64(2));
```

### Client SDK — Permit-Based Decryption

```typescript
// Initialize CoFHE SDK (singleton — one instance for entire app)
import { CofheClient, FheTypes } from '@cofhe/sdk';

const client = new CofheClient({ config, wallet });
await client.initFhe();  // Load WASM (~150ms)

// Sign EIP-712 permit — required before any decryption
await client.permits.getOrCreateSelfPermit();

// Read encrypted card handle from contract
const ctHash = await contract.getMyCards(tableId);  // returns bytes32 handle

// Decrypt via CoFHE Threshold Network
// Only works if FHE.allow(card, myAddress) was called in the contract
const cardValue = await client.decryptForView(ctHash, FheTypes.Uint64).execute();
// cardValue = 23 → rank = floor(23/4) = 5 (Seven), suit = 23%4 = 3 (Spades) → 7♠
```

### What's Visible vs Hidden on Etherscan

| Data | On Etherscan | With CoFHE Permit |
|------|-------------|-------------------|
| Your hole cards | Ciphertext handle (bytes32) | Decrypted card value (0-51) |
| Opponent's cards | Ciphertext handle | **Never** (no FHE.allow) |
| Community cards | Ciphertext → revealed per round | Decrypted after FHE.allowPublic |
| Hand scores | Ciphertext handle | **Never decrypted** — only gt/eq result |
| Pot, bets, game state | Visible (uint256) | Visible |
| Winner determination | `FHE.gt()` boolean result | true/false only |
| Card generation seed | `FHE.randomEuint64()` — encrypted | **Never visible to anyone** |

**Verify on Etherscan:** Open the [Hold'em PvP contract](https://sepolia.etherscan.io/address/0x309Dd767C98eb52C84ff44389A2066385b9C27e9) → click any `startHand` transaction → Input Data shows table ID, but card values are stored as encrypted handles in contract storage. Internal transactions show CoFHE coprocessor calls for `FHE.randomEuint64()`.

---

## Challenges I Ran Into

**The 7-card evaluation problem.** Evaluating a Texas Hold'em hand means finding the best 5-card combination out of 7. That's C(7,5) = 21 combinations — evaluating all 21 in FHE would cost millions of gas. I wrote a direct algorithm instead: 21 pairwise rank comparisons, 28 suit equality checks, bubble sort on encrypted ranks, and nested `FHE.select()` chains. The result: `_evalHand7()` produces an encrypted score encoding hand type + kicker hierarchy in ~350 FHE operations.

**Showdown gas limits.** A PvP showdown evaluates both players' 7-card hands = ~700 FHE ops = ~35M gas. Sepolia's block gas limit is 36M. I split it into two transactions: `computeShowdownP1()` and `computeShowdownP2()`.

**Progressive evaluation per street.** The bot can't afford to run full 7-card evaluation at every betting round. I wrote separate functions with increasing complexity:

| Street | Function | Cards | FHE Ops | What it evaluates |
|--------|----------|-------|---------|-------------------|
| Pre-flop | `_evalHand2()` | 2 | ~8 | High card or pocket pair |
| Flop | `_evalHand5()` | 5 | ~120 | Full hand ranking (pairs through straight flush) |
| Turn | `_pairCount6()` | 6 | ~36 | Pair count only (gas optimization) |
| River | `_pairCount7()` | 7 | ~49 | Pair count only (gas optimization) |
| Showdown | `_evalHand7()` | 7 | ~200+ | Complete hand ranking with kickers |

The bot on turn/river uses only pair count (not full evaluation) because full 6-card and 7-card evaluation would exceed gas limits at every street. This means the bot makes suboptimal decisions sometimes — a conscious trade-off for gas feasibility.

**FHE decrypt latency.** The CoFHE threshold network takes 15-30 seconds per decrypt. Every card reveal, every showdown result, every bot decision involves this wait. The entire UI is built around async polling with `FHE.getDecryptResultSafe()` and visual feedback for each stage.

**The permit problem.** CoFHE requires an EIP-712 permit before decryption. The permit is per-contract, per-wallet, and expires. Switch wallets mid-game? Permit invalid. Contract address changed? Permit invalid. Multiple components requesting permits simultaneously? Duplicate signature popups. I built a singleton CoFHE client with a permit lock to serialize requests and auto-renewal.

**Card collision.** Hole cards and community cards use separate `FHE.randomEuint64()` seeds. Intra-group uniqueness is enforced, but cross-group duplicates are possible (e.g., both players could theoretically get the same card). This is a known limitation of FHE random without global collision tracking (which would require O(n²) encrypted comparisons across all dealt cards).

---

## Technologies I Used

| Layer | Technology | Role |
|-------|-----------|------|
| FHE Coprocessor | Fhenix CoFHE | Encrypted computation on EVM |
| Client SDK | `@cofhe/sdk` 0.4.0 | Permit management + threshold decryption |
| Contracts | `@fhenixprotocol/cofhe-contracts` 0.1.0 | Solidity FHE library (euint64, FHE.add, FHE.allow) |
| Solidity | 0.8.25 (evmVersion: cancun, viaIR) | Smart contracts |
| Hardhat | `@cofhe/hardhat-plugin` 0.4.0 | Compilation + deployment |
| Frontend | React 18 + TypeScript + Vite | App interface |
| Wallet | wagmi v2 + viem | Wallet connection + contract calls |
| Styling | Tailwind CSS 4 + Framer Motion | UI + animations |
| State | Zustand | Client-side state management |
| Network | Ethereum Sepolia (11155111) | Testnet deployment |

---

## Smart Contracts — Deployed on Sepolia

| Contract | Address | FHE Ops/Hand | Key Features |
|----------|---------|-------------|--------------|
| `CofhePoker` | [`0x8D32...3470`](https://sepolia.etherscan.io/address/0x8D32d4B87aa3Db55Ac0Eae3DC2c2343CEd9F3470) | ~80 | 3-card eval, FHE bot decision, async showdown |
| `CofhePokerPvP` | [`0x7662...247d`](https://sepolia.etherscan.io/address/0x76627a7A86C4Da6386f09b52cc8EC14C5EaC247d) | ~80 | Lobby, private rooms, invite codes, friend system |
| `CofheHoldem` | [`0xA01a...CEBe`](https://sepolia.etherscan.io/address/0xA01aDb97b1D1ad67a4295B8Ae0c525Affd74CEBe) | ~500 | 4-round eval (2/5/6/7 cards), per-street bot AI |
| `CofheHoldemPvP` | [`0x309D...27e9`](https://sepolia.etherscan.io/address/0x309Dd767C98eb52C84ff44389A2066385b9C27e9) | ~700 | All-in, side pots, dealer rotation, timeouts, EIP-712 |

### FHE Operations Used

| Operation | Usage in Cofhe Poker | Count |
|-----------|---------------------|-------|
| `FHE.randomEuint64()` | Encrypted random seed for card dealing | 1-3 per deal |
| `FHE.asEuint64()` | Create encrypted card values, scores, constants | ~50-100 per hand |
| `FHE.add()` | Card offset math, score accumulation, pot totals | ~80-150 per hand |
| `FHE.sub()` | Chip deduction, rank difference calculation | ~20-40 per hand |
| `FHE.mul()` | Hand type scoring (type × 10B multiplier) | ~5-20 per hand |
| `FHE.div()` | Rank extraction (`card/4`), pot splitting | ~15-25 per hand |
| `FHE.rem()` | Suit extraction (`card%4`), card mapping (`seed%52`) | ~15-25 per hand |
| `FHE.eq()` | Pair detection (21 pairwise), flush check, tie detection | ~20-50 per hand |
| `FHE.gt() / FHE.gte()` | Showdown comparison, bot thresholds, straight detection | ~5-10 per hand |
| `FHE.ne()` | Inequality checks for hand classification | ~5-15 per hand |
| `FHE.min() / FHE.max()` | Bubble sort for straight detection, bet capping | ~10-30 per hand |
| `FHE.select()` | Conditional scoring — hand type branching, kicker selection | ~10-30 per hand |
| `FHE.and() / FHE.or() / FHE.not()` | Boolean hand type classification (flush AND straight = straight flush) | ~30-60 per hand |
| `FHE.allow()` | Per-player card access (hole cards) | ~6-10 per deal |
| `FHE.allowThis()` | Contract access for evaluation | ~10-20 per hand |
| `FHE.allowPublic()` | Community card reveal, bot cards at showdown | ~10-15 per hand |
| `FHE.decrypt()` | Queue async decryption (showdown result, bot decision) | 1-4 per round |
| `FHE.getDecryptResultSafe()` | Poll threshold decryption result | View function (free) |

**Total: 20+ distinct FHE operations across 4 contracts.**

---

## Key Contract Features

- **7-card best-of-7 evaluation** — Direct algorithm instead of brute-force C(7,5)=21 combinations. Pair counting via 21 pairwise `FHE.eq()`, flush via 28 suit checks, straight via encrypted bubble sort + sliding window
- **Dealer button rotation** — `handCount % 2` determines who posts small/big blind
- **All-in with side pot** — Call capping (`FHE.min(raiseAmount, remainingStack)`), excess chip return
- **Pot split on tie** — `FHE.eq(score1, score2)` → `FHE.div(pot, 2)` for each player
- **Block-based timeout** — 50 blocks (~10 min) for active games, 150 blocks (~30 min) for lobby. Anyone can trigger forfeit (permissionless `checkTimeout()`)
- **Sealed PvP actions** — Both players submit encrypted play/fold decisions. Neither knows the other's choice until both are in
- **EIP-712 signed batch actions** — Sign betting actions off-chain, `submitRound()` batches them into one TX. Reduces transaction count during betting rounds
- **3 independent random seeds** — Hole cards and community cards use separate `FHE.randomEuint64()` calls. Prevents deduction of opponent cards from shared seed

---

## Expected User Experience

1. **Connect wallet** on Sepolia → permit signs automatically
2. **Choose game mode** — 3-Card or Hold'em, Bot or PvP
3. **For PvP** — create a room (public or private), share the invite link
4. **Cards dealt** via FHE — 15-30s for encrypted generation + threshold decryption
5. **Bet** — check, bet, raise, call, fold, all-in (Hold'em PvP)
6. **Showdown** — hand scores compared via `FHE.gt()` on ciphertext
7. **Winner announced** — chips transferred on-chain, opponent cards revealed via `FHE.allowPublic()`

### PvP Room Links

| Type | URL Format |
|------|-----------|
| Public | `https://app.example.com/#/room/holdem/5` |
| Private | `https://app.example.com/#/room/holdem/5:0xinvitecode` |

Opening a room link auto-navigates to the game and joins the table. Private links include the invite code.

---

## Getting Started

### Prerequisites
- Node.js 18+
- MetaMask or Rabby wallet
- Sepolia ETH ([faucet](https://sepoliafaucet.com))

### Run Locally

```bash
git clone https://github.com/barbos001/CofhePoker.git
cd CofhePoker
npm install
cp .env.example .env   # add your keys and contract addresses
npm run dev             # http://localhost:3000
```

### Deploy Contracts

```bash
npm run compile
npx hardhat run scripts/deploy.cts --network eth-sepolia
npx hardhat run scripts/deployPvP.cts --network eth-sepolia
npx hardhat run scripts/deployHoldem.cts --network eth-sepolia
npx hardhat run scripts/deployHoldemPvP.cts --network eth-sepolia
```

### Environment Variables

```env
PRIVATE_KEY=0x...                        # deployer key (never committed)
SEPOLIA_RPC_URL=https://...              # Sepolia RPC endpoint

VITE_CONTRACT_ADDRESS=0x...              # CofhePoker (3-Card PvE)
VITE_PVP_CONTRACT_ADDRESS=0x...          # CofhePokerPvP (3-Card PvP)
VITE_HOLDEM_CONTRACT_ADDRESS=0x...       # CofheHoldem (Hold'em PvE)
VITE_HOLDEM_PVP_CONTRACT_ADDRESS=0x...   # CofheHoldemPvP (Hold'em PvP)
VITE_CHAIN_ID=11155111
VITE_SEPOLIA_RPC_URL=https://...
```

---

## Project Structure

```
contracts/
  CofhePoker.sol              3-Card Poker vs Bot (~80 FHE ops)
  CofhePokerPvP.sol           3-Card PvP — rooms, friends, invites (~80 FHE ops)
  CofheHoldem.sol             Texas Hold'em vs Bot — 4 rounds, per-street eval (~500 FHE ops)
  CofheHoldemPvP.sol          Hold'em PvP — all-in, timeouts, EIP-712 (~700 FHE ops)

scripts/
  deploy.cts                  Deploy CofhePoker
  deployPvP.cts               Deploy CofhePokerPvP
  deployHoldem.cts            Deploy CofheHoldem
  deployHoldemPvP.cts         Deploy CofheHoldemPvP
  test-flow.mjs               Automated PvP integration test (2 wallets)

src/
  components/
    PlayHub.tsx               Unified game selector (mode + opponent + room links)
    PlayTab.tsx               3-Card Poker game UI
    HoldemTab.tsx             Hold'em game UI (5 community cards, 4 rounds)
    HoldemPvPTab.tsx          Hold'em PvP (lobby, narrator, activity log)
    PvPTab.tsx                3-Card PvP (lobby, friends, invites)
    LandingPage.tsx           Landing page with scroll animations
  hooks/
    useGameActions.ts         3-Card on-chain game flow
    useHoldemActions.ts       Hold'em on-chain game flow (4 rounds)
    useCofhe.ts               CoFHE SDK singleton, permits, decryption
    useGameGuards.ts          Pre-flight checks, turn timer, disconnect guard
  lib/
    poker.ts                  3-card hand evaluation + display utilities
    holdem.ts                 5-card and 7-card (best of 7) evaluation
  config/
    contract.ts               ABI + address (per contract)
  store/
    useGameStore.ts           Zustand state management
    useLobbyStore.ts          Lobby state management
    usePvPGameStore.ts        PvP game state management
```

---

## Security

- **No plaintext cards on-chain** — all card data remains encrypted throughout the game lifecycle
- **ACL-gated decryption** — only addresses with `FHE.allow` can request decryption via threshold network
- **Three independent random seeds** — hole cards and community cards use separate `FHE.randomEuint64()` calls, preventing cross-group deduction
- **Block-based timeout enforcement** — permissionless `checkTimeout()` prevents game stalling
- **EIP-712 typed signatures** — signed actions verified on-chain, preventing replay and impersonation
- **No secrets in source** — all private keys loaded from `.env`, `.env` in `.gitignore`

---

## Known Limitations

| Limitation | Detail |
|-----------|--------|
| FHE decrypt latency | 15-30 seconds on testnet (CoFHE threshold network) |
| Showdown gas | ~35M gas (near Sepolia 36M block limit) |
| Card collision | Small probability between hole and community groups |
| Table size | Heads-up only (2 players max) |
| Single table | One active table per player |
| Bot accuracy | Turn/River bot uses pair count only (not full hand eval) due to gas |
| Testnet only | Not audited for mainnet deployment |

---

## Roadmap

### Wave 1 ✅ (Current)

**Smart Contracts (4 deployed on Sepolia):**
- [x] `CofhePoker.sol` — 3-Card Poker vs Bot: FHE card dealing, 3-card evaluation, async bot decision + showdown
- [x] `CofhePokerPvP.sol` — 3-Card PvP: lobby, private rooms, invite codes, on-chain friend system, sealed play/fold
- [x] `CofheHoldem.sol` — Texas Hold'em vs Bot: 4 betting rounds, per-street FHE evaluation (2/5/6/7 cards), check/bet/raise/fold
- [x] `CofheHoldemPvP.sol` — Hold'em PvP: dealer rotation, blinds, all-in with side pots, block-based timeouts, EIP-712 signed action batching, pot split via `FHE.eq()`

**FHE Operations (20+ distinct):**
- [x] `FHE.randomEuint64()` — encrypted random card seeds
- [x] `FHE.asEuint64()` — create encrypted values
- [x] `FHE.add / sub / mul / div / rem` — card mapping, score math, pot splitting
- [x] `FHE.eq / ne / gt / gte` — pair detection, showdown, bot thresholds
- [x] `FHE.min / max` — bubble sort, bet capping
- [x] `FHE.select` — conditional hand type scoring
- [x] `FHE.and / or / not` — boolean hand classification
- [x] `FHE.allow / allowThis / allowPublic` — per-player card ACL
- [x] `FHE.decrypt + getDecryptResultSafe` — async threshold decryption

**Client SDK:**
- [x] Singleton CoFHE client — one WASM instance shared across components
- [x] Permit management — auto-renewal, lock to prevent duplicate popups
- [x] `decryptForView()` — threshold decryption with retry + exponential backoff
- [x] Card value mapping: `ctHash → cardId → rank + suit → display name`

**App Features:**
- [x] 4 game modes via unified PlayHub selector
- [x] Private rooms with shareable invite links (`#/room/holdem/{tableId}:{code}`)
- [x] On-chain friend system (request/accept/remove)
- [x] Game invite system (send → opponent accepts)
- [x] Turn timer (120s) with auto-fold
- [x] Opponent timeout detection + on-chain forfeit claim (50 blocks)
- [x] `beforeunload` warning during active PvP
- [x] State recovery on page refresh (reads table state from contract)
- [x] Activity log + poker narrator for Hold'em PvP
- [x] Animated landing page with scroll-triggered reveals
- [x] Error boundary for crash recovery
- [x] E2E integration test (`scripts/test-flow.mjs`) — full PvP hand via viem

### Wave 2 — Multi-Table & Spectators (Planned)
- [ ] `CofheHoldemMulti.sol` — 3-9 player tables with `FHE.allow` per-seat privacy
- [ ] Spectator mode — watch games without card access (pot + community only)
- [ ] The Graph subgraph for `TableCreated`, `HandComplete`, `PlayerJoined` indexing
- [ ] Hand history replay from on-chain events
- [ ] Player profiles with encrypted lifetime stats via `FHE.add` aggregation

### Wave 3 — Tournaments & Staking (Planned)
- [ ] `CofheTournament.sol` — multi-table tournament with blind schedule
- [ ] `FHE.mul(blindLevel, multiplier)` — encrypted blind escalation
- [ ] `FHE.gte(stack, bigBlind)` — encrypted bust-out detection
- [ ] Sit-and-go format: auto-start when seats fill
- [ ] Chainlink Automation for blind advancement + table merging

### Wave 4 — Token Integration & Analytics (Planned)
- [ ] Real token buy-ins (ERC-20) with encrypted chip conversion
- [ ] Chainlink VRF v2.5 — verifiable randomness alongside FHE encryption
- [ ] Rake system — `FHE.mul(pot, rakeBps)` encrypted platform fee
- [ ] Analytics dashboard from on-chain events
- [ ] Gasless betting via ERC-2771 meta-transactions

### Wave 5 — Production (Planned)
- [ ] Multi-chain deployment (pending CoFHE L2 support)
- [ ] Mobile-optimized responsive UI
- [ ] Formal security audit
- [ ] `@cofhe-poker/sdk` — npm package for third-party integrations

---

## Links

- [Fhenix](https://fhenix.io)
- [CoFHE Documentation](https://cofhe-docs.fhenix.zone)
- [CoFHE SDK](https://www.npmjs.com/package/@cofhe/sdk)
- [Buildathon Telegram](https://t.me/+rA9gI3AsW8c3YzIx)

---

## Hackathon Submission — Wave 1

### TL;DR for Judges

Cofhe Poker is the most computationally intensive FHE application in this buildathon. A single Hold'em PvP showdown executes **~700 FHE operations** and consumes **~35M gas** — approaching the Sepolia block gas limit. The contract runs a complete poker engine (pair detection, flush checks, straight detection via bubble sort, hand type scoring with nested selects) entirely on encrypted values.

**What we built (all deployed and functional on Sepolia):**

| Metric | Value |
|--------|-------|
| Smart contracts | 4 (all deployed) |
| FHE operations used | 20+ distinct (`add`, `sub`, `mul`, `div`, `rem`, `eq`, `ne`, `gt`, `gte`, `min`, `max`, `select`, `and`, `or`, `not`, `decrypt`, `randomEuint64`, `allow`, `allowThis`, `allowPublic`, `asEuint64`) |
| FHE ops per hand | 80 (3-Card) to 700 (Hold'em PvP) |
| Gas per showdown | ~17M (3-Card) to ~35M (Hold'em PvP) |
| Game modes | 4 (3-Card PvE/PvP, Hold'em PvE/PvP) |
| Encrypted data types | `euint64`, `ebool` |
| Game features | All-in, side pots, dealer rotation, timeouts, invite codes, friend system, EIP-712 batch |

**What FHE encrypts in Cofhe Poker:**
- Every card value (0-51) — stored as `euint64`, never plaintext on-chain
- Hand scores — computed via ~350 FHE ops, never decrypted (only `FHE.gt` result)
- Random seeds — `FHE.randomEuint64()` generates encrypted randomness
- Bot decisions — `FHE.gte(handStrength, threshold)` evaluated on ciphertext
- Winner determination — `FHE.gt(score1, score2)` boolean, only result decrypted
- Tie detection — `FHE.eq(score1, score2)` for pot splitting

**Why this matters:** No other project in this wave runs a full game engine on FHE. This isn't "encrypt a number and decrypt it later" — the contract evaluates 7-card poker hands, detects pairs/flushes/straights, sorts ranks, and scores hands, all on ciphertext. The computation graph for a single `_evalHand7()` call spans ~350 FHE operations with nested conditional branches.

---

<div align="center">

Built with Fhenix CoFHE for the Fhenix Buildathon 2026

</div>
