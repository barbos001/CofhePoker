# CoFHE Poker

**Fully on-chain Texas Hold'em and 3-Card Poker with FHE-encrypted cards.**

Built on [Fhenix](https://fhenix.io) using the CoFHE SDK for Fully Homomorphic Encryption. Every card is generated, evaluated, and compared entirely in encrypted form. No trusted dealer, no server, no one can see your hand.

> Fhenix Buildathon 2026 submission

---

## The Problem

Online poker requires trust: a central server deals cards, knows every hand, and determines winners. Players must trust that the operator is not cheating, not colluding, and not leaking data. Even blockchain-based poker projects typically move card logic off-chain, defeating the purpose of decentralization.

## Our Approach

CoFHE Poker solves this by running the **entire poker engine on-chain using Fully Homomorphic Encryption (FHE)**. Cards are encrypted random numbers that can be compared, sorted, and evaluated without ever being decrypted on-chain. Only the card owner can decrypt their own cards via the CoFHE threshold network, and only after the smart contract grants permission through FHE ACL (`FHE.allow`).

This means:
- **Validators** see only ciphertext — they process encrypted operations without knowing the cards
- **Opponents** cannot access each other's cards until showdown
- **MEV bots** cannot front-run based on card values
- **The contract itself** never handles plaintext card data

---

## Game Modes

| Mode | Players | Description |
|------|---------|-------------|
| **3-Card Poker vs Bot** | 1 | Casino-style: 3 encrypted cards, play or fold, instant FHE showdown |
| **Texas Hold'em vs Bot** | 1 | Full 4-round game: pre-flop, flop, turn, river with check/bet/raise/fold |
| **3-Card PvP** | 2 | Player vs player with rooms, friends, invite codes |
| **Hold'em PvP** | 2 | Heads-up Hold'em: dealer rotation, all-in, side pots, on-chain timeouts |

---

## How FHE Works in This Game

```
1. Card dealing    → FHE.randomEuint64() generates encrypted random seeds
                     card = (seed + offset) % 52 — all in ciphertext

2. ACL gating      → FHE.allow(card, playerAddress) — only YOU can decrypt
                     FHE.allowPublic(card) — community cards become visible

3. Hand evaluation → _evalHand7() computes pair count, flush, straight
                     entirely on encrypted values (~350 FHE operations)

4. Showdown        → FHE.gt(playerScore, botScore) — encrypted comparison
                     FHE.eq() for tie detection

5. Decryption      → CoFHE threshold network reconstructs plaintext
                     from key shares — only for permitted addresses
```

### Privacy Guarantees

| Data | Visibility |
|------|-----------|
| Your hole cards | Only you (after FHE.allow + permit) |
| Opponent's cards | Hidden until showdown |
| Community cards | Public after each round (FHE.allowPublic) |
| Pot, bets, game state | Public (not sensitive) |
| Hand scores | Never decrypted — only comparison result is revealed |

---

## Technical Stack

- **Blockchain**: Ethereum Sepolia testnet
- **FHE**: Fhenix CoFHE SDK (`@cofhe/sdk` v0.4) — threshold FHE network
- **Smart Contracts**: Solidity 0.8.25 + `@fhenixprotocol/cofhe-contracts`
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Wallet**: wagmi v2 + viem (MetaMask, injected wallets)
- **Animations**: Framer Motion
- **State Management**: Zustand
- **Deployment**: Vercel (frontend) + Hardhat (contracts)

---

## Smart Contracts

| Contract | Purpose | FHE Operations |
|----------|---------|---------------|
| `CofhePoker` | 3-Card Poker vs Bot | ~80 ops/hand |
| `CofhePokerPvP` | 3-Card PvP (rooms, friends) | ~80 ops/hand |
| `CofheHoldem` | Texas Hold'em vs Bot | ~500 ops/hand |
| `CofheHoldemPvP` | Hold'em PvP (all-in, timeouts) | ~700 ops/hand |

### Key Contract Features
- **7-card best-of-7 evaluation**: direct FHE algorithm (no brute-force C(7,5))
- **Dealer button rotation**: alternates each hand via `handCount % 2`
- **All-in with side pot logic**: call capping, excess chip return
- **On-chain timeout**: block-number based auto-forfeit (~10 min)
- **Pot split on tie**: FHE.eq() detection
- **3 independent random seeds**: prevents deduction of opponent cards
- **EIP-712 signed batch actions**: `submitRound()` for reduced TX count

---

## Getting Started

### Prerequisites
- Node.js 18+
- MetaMask wallet
- Sepolia ETH ([faucet](https://sepoliafaucet.com))

### Install and Run
```bash
git clone <repo>
cd poker
npm install
cp .env.example .env   # configure your keys
npm run dev             # http://localhost:3000
```

### Deploy Contracts
```bash
npm run compile
npx hardhat run scripts/deploy.cts --network eth-sepolia
npx hardhat run scripts/deployHoldem.cts --network eth-sepolia
npx hardhat run scripts/deployPvP.cts --network eth-sepolia
npx hardhat run scripts/deployHoldemPvP.cts --network eth-sepolia
```

### Environment Variables
```env
PRIVATE_KEY=0x...                        # deployer key (never committed)
SEPOLIA_RPC_URL=https://...              # Sepolia RPC endpoint
VITE_CONTRACT_ADDRESS=0x...              # 3-Card Poker contract
VITE_PVP_CONTRACT_ADDRESS=0x...          # 3-Card PvP contract
VITE_HOLDEM_CONTRACT_ADDRESS=0x...       # Hold'em contract
VITE_HOLDEM_PVP_CONTRACT_ADDRESS=0x...   # Hold'em PvP contract
```

---

## Project Structure

```
contracts/
  CofhePoker.sol           3-Card Poker vs Bot
  CofhePokerPvP.sol        3-Card PvP (rooms, friends, invites)
  CofheHoldem.sol          Texas Hold'em vs Bot (4 rounds, check/bet/raise)
  CofheHoldemPvP.sol       Texas Hold'em PvP (all-in, timeouts, EIP-712)

src/
  components/
    PlayHub.tsx             Unified game selector (mode + opponent + room links)
    PlayTab.tsx             3-Card Poker game UI
    HoldemTab.tsx           Hold'em game UI (5 community cards, 4 rounds)
    HoldemPvPTab.tsx        Hold'em PvP (lobby, narrator, activity log)
    PvPTab.tsx              3-Card PvP (lobby, friends, invites)
    LandingPage.tsx         Landing page
  hooks/
    useGameActions.ts       3-Card on-chain game flow
    useHoldemActions.ts     Hold'em on-chain game flow (4 rounds)
    useCofhe.ts             CoFHE SDK initialization, permits, decryption
    useGameGuards.ts        Pre-flight checks, turn timer, disconnect guard
  lib/
    poker.ts                3-card hand evaluation + display utilities
    holdem.ts               5-card and 7-card (best of 7) evaluation
  config/
    contract.ts             3-Card ABI + address
    contractHoldem.ts       Hold'em ABI + address
    contractHoldemPvP.ts    Hold'em PvP ABI + address
```

---

## PvP Room Links

Each room generates a shareable URL:

| Type | URL Format |
|------|-----------|
| Public | `https://app.example.com/#/room/holdem/5` |
| Private | `https://app.example.com/#/room/holdem/5:0xinvitecode` |

Opening a room link auto-navigates to the game and joins the table. Private links include the invite code — only holders can join.

---

## Expected User Experience

1. Connect MetaMask on Sepolia
2. Choose game mode (3-Card or Hold'em) and opponent (Bot or PvP)
3. For PvP: create a room (public or private), share the link
4. Cards are dealt via FHE — 15-30s for encrypted generation + decryption
5. Make betting decisions (check, bet, raise, call, fold, all-in)
6. Showdown computed entirely in FHE — winner determined on-chain
7. Chips transferred automatically to the winner

---

## Known Limitations

- **FHE latency**: 15-30s per decrypt on testnet (CoFHE threshold network processing time)
- **Gas costs**: Showdown evaluation ~17-35M gas (within Sepolia limits)
- **Card collisions**: Small probability between card groups (intra-group always unique)
- **No multi-table**: One active table per player
- **Heads-up only**: PvP is 2-player (no multi-player tables)

---

## Future Improvements

- Multi-player tables (3-9 players)
- Tournament mode with blind schedule
- Verifiable Random Function (VRF) for card dealing
- Off-chain action relay for gasless betting rounds
- Mobile-optimized UI
- Hand history with replay

---

## License

MIT
