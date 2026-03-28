# Cofhe Poker ♠

**700 FHE operations per hand. 35 million gas per showdown. Zero plaintext cards on-chain. Ever.**

Cofhe Poker is a fully on-chain poker platform where every card is dealt, evaluated, and compared as ciphertext using Fully Homomorphic Encryption. Four game modes, four deployed contracts, and the most computationally intensive FHE application on Ethereum Sepolia today.

---

## What it does

I built a complete poker engine that runs entirely inside FHE. Not "cards generated off-chain and committed as hashes" — actual encrypted card dealing, hand evaluation, and showdown comparison, all computed on encrypted values that nobody can read.

The platform supports 4 game modes:

| Mode | Description |
|------|-------------|
| **3-Card Poker vs Bot** | Casino-style: 3 encrypted cards each, play or fold, FHE showdown |
| **3-Card PvP** | Player vs player with private rooms, invite codes, and on-chain friend system |
| **Texas Hold'em vs Bot** | Full 4-round game with pre-flop/flop/turn/river and FHE bot evaluation per street |
| **Hold'em PvP** | Heads-up Hold'em with dealer rotation, blinds, all-in, side pots, block-based timeouts, and EIP-712 signed action batching |

When two players sit at a Hold'em PvP table:
- Cards are generated via `FHE.randomEuint64()` — encrypted random seeds that even the contract can't read
- Each card is `(seed + offset) % 52`, computed entirely in ciphertext
- `FHE.allow(card, playerAddress)` gates decryption — only YOU can see your hole cards
- Community cards are revealed round-by-round via `FHE.allowPublic()`
- At showdown, `FHE.gt(playerScore, opponentScore)` determines the winner without decrypting the scores
- `FHE.eq()` catches ties for split pots

Nobody — not validators, not your opponent, not MEV bots — sees any card until the contract explicitly permits it.

## The problem it solves

Online poker has a trust problem. Every major platform runs a centralized server that knows every hand. "Provably fair" usually means a hash commitment — the server still generates the cards, you just verify after the fact.

Blockchain poker projects aren't much better. Most move card logic off-chain to a trusted oracle or MPC ceremony, then post results on-chain. The chain becomes an expensive settlement layer, not a game engine.

Cofhe Poker makes the chain the game engine. Card generation, hand evaluation, bot decisions, showdown comparison — all of it runs as encrypted computation through the Fhenix CoFHE threshold network. There is no trusted party. The contract processes `euint64` values it cannot read, and the CoFHE network reconstructs plaintext only for addresses with explicit `FHE.allow` permission.

## Challenges I ran into

**The 7-card evaluation problem.** Evaluating a Texas Hold'em hand means finding the best 5-card combination out of 7 cards. That's C(7,5) = 21 combinations. Evaluating all 21 in FHE would cost millions of gas and hundreds of operations per combination.

Instead, I wrote a direct algorithm:
- 21 pairwise rank comparisons for pair/trips/quads detection
- 4 suits x 7 cards = 28 equality checks for flush detection
- Bubble sort on encrypted ranks + sliding window for straight detection
- Nested `FHE.select()` chains for hand type classification

The result: `_evalHand7()` runs ~350 FHE operations and produces an encrypted score that encodes hand type, kicker hierarchy, and tiebreakers — all without ever decrypting a single card.

**Showdown gas limits.** A full PvP showdown evaluates both players' 7-card hands and compares them. That's ~700 FHE operations consuming ~35M gas — dangerously close to Sepolia's 36M block gas limit. I split it into `computeShowdownP1()` and `computeShowdownP2()` as separate transactions.

**FHE decrypt latency.** The CoFHE threshold network takes 15-30 seconds to reconstruct a decrypted value from key shares. Every card reveal, every showdown result, every bot decision involves this wait. I built the entire UI around async polling with `FHE.getDecryptResultSafe()` and visual feedback for each decrypt stage.

**Card collision across groups.** Hole cards and community cards use separate random seeds. There's a small probability of duplicate cards between groups. Intra-group uniqueness is enforced via rejection, but cross-group collision remains a known limitation of the current FHE random approach.

**The permit dance.** CoFHE requires an EIP-712 permit signature before decryption. This permit is per-contract, per-wallet, and expires. If the user switches wallets, changes contracts, or the permit expires mid-game, decryption silently fails. I built a singleton CoFHE client with automatic permit management, retry logic, and status indicators.

## Technologies I used

Solidity 0.8.25, Fhenix CoFHE (`@cofhe/sdk` v0.4, `@fhenixprotocol/cofhe-contracts`), React 18, TypeScript, Vite, Tailwind CSS 4, Framer Motion, wagmi v2 + viem, Zustand, Hardhat, Ethereum Sepolia

## How we built it

Started with 3-card poker vs bot — the simplest possible FHE poker. 3 cards, ~30 FHE operations for hand evaluation, one comparison for showdown. This proved the concept: encrypted card dealing and evaluation work on-chain.

Then PvP. Added a lobby system with public/private tables, invite codes, and an on-chain friend list. Both players submit sealed play/fold decisions — neither knows what the other chose until the contract processes both.

Then Texas Hold'em. The 7-card evaluation required a complete algorithmic redesign. `_evalHand5()` for flop (~120 ops), `_pairCount6()` for turn (~36 ops), `_pairCount7()` for river (~49 ops), and `_evalHand7()` for showdown (~200+ ops). The bot evaluates its hand strength at each street using progressively more complex FHE functions.

Finally Hold'em PvP. This is where things got serious: dealer button rotation, dynamic min-raise, all-in with call capping and chip return, `FHE.eq()` for pot splitting on ties, block-based timeouts (50 blocks = ~10 min) with permissionless forfeit triggers, and EIP-712 signed action batching to reduce transaction count during betting rounds.

## What we learned

FHE can absolutely power a complete poker engine on-chain, but gas is the hard constraint. The 7-card evaluation can't brute-force all 21 five-card combinations — you need a direct algorithm. `FHE.randomEuint64()` works for card generation but it's not VRF — there's no verifiable randomness proof. The CoFHE threshold network adds real latency (15-30s per decrypt), and you can't hide that from the user — the UI has to make the wait feel intentional.

Debugging encrypted cards is its own adventure. You can't log card values because they're ciphertext. You print `ctHash` values, track which handle maps to which card position, and hope the decrypt eventually comes back with a number between 0 and 51.

## What's next for Cofhe Poker

- Multi-player tables (3-9 seats) with `FHE.allow` per-seat privacy
- Tournament mode with encrypted blind escalation via `FHE.mul`
- Real token buy-ins (ERC-20) with encrypted chip conversion
- Chainlink VRF integration for verifiable card randomness alongside FHE encryption
- Spectator mode — watch live games, see community cards and pot, but never hole cards
- Gas optimization for L2 deployment
- Mobile-optimized responsive UI

## Smart Contracts (Deployed on Sepolia)

| Contract | Address | FHE Ops/Hand |
|----------|---------|-------------|
| `CofhePoker` | [`0x8D32...3470`](https://sepolia.etherscan.io/address/0x8D32d4B87aa3Db55Ac0Eae3DC2c2343CEd9F3470) | ~80 |
| `CofhePokerPvP` | [`0x7662...247d`](https://sepolia.etherscan.io/address/0x76627a7A86C4Da6386f09b52cc8EC14C5EaC247d) | ~80 |
| `CofheHoldem` | [`0xA01a...CEBe`](https://sepolia.etherscan.io/address/0xA01aDb97b1D1ad67a4295B8Ae0c525Affd74CEBe) | ~500 |
| `CofheHoldemPvP` | [`0x309D...27e9`](https://sepolia.etherscan.io/address/0x309Dd767C98eb52C84ff44389A2066385b9C27e9) | ~700 |

## FHE Operations Used

| Operation | What it does in Cofhe Poker |
|-----------|---------------------------|
| `FHE.randomEuint64()` | Generate encrypted random seed for card dealing |
| `FHE.asEuint64()` | Create encrypted card values and hand scores |
| `FHE.add / sub / mul / div / rem` | Card ID mapping (`card/4` = rank, `card%4` = suit), score computation, pot math |
| `FHE.gt / gte / eq / ne` | Hand comparison at showdown, pair detection, tie detection |
| `FHE.min / max` | Clamp bets to stack size, resolve kickers |
| `FHE.select` | Encrypted conditional logic — pair vs trips, flush vs straight branching |
| `FHE.and / or / not` | Boolean hand type classification |
| `FHE.allow / allowThis / allowPublic` | ACL: player-only cards, contract access, community card reveal |
| `FHE.decrypt + getDecryptResultSafe` | Async threshold decryption for showdown results |

## Architecture

```
+--------------+     wagmi/viem      +-------------------+
|   React UI   | <-----------------> |  Sepolia Testnet   |
|  (Vite/TS)   |                     |                    |
|              |     EIP-712 sigs    |  CofhePoker        |
|  Zustand     | -----------------> |  CofhePokerPvP     |
|  state mgmt  |                     |  CofheHoldem       |
|              |                     |  CofheHoldemPvP    |
+------+-------+                     +--------+-----------+
       |                                      |
       |  @cofhe/sdk                          | FHE.random / FHE.allow
       |  (permits + decrypt)                 | FHE.gt / FHE.eq
       |                                      |
       +---------> +------------------+ <-----+
                   |  CoFHE Threshold  |
                   |  FHE Network      |
                   |  (key shares)     |
                   +------------------+
```

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
PRIVATE_KEY=0x...                        # deployer wallet (never commit)
SEPOLIA_RPC_URL=https://...              # Sepolia RPC

VITE_CONTRACT_ADDRESS=0x...              # CofhePoker
VITE_PVP_CONTRACT_ADDRESS=0x...          # CofhePokerPvP
VITE_HOLDEM_CONTRACT_ADDRESS=0x...       # CofheHoldem
VITE_HOLDEM_PVP_CONTRACT_ADDRESS=0x...   # CofheHoldemPvP
VITE_CHAIN_ID=11155111
VITE_SEPOLIA_RPC_URL=https://...
```

## Project Structure

```
contracts/
  CofhePoker.sol              3-Card Poker vs Bot
  CofhePokerPvP.sol           3-Card PvP (rooms, friends, invites)
  CofheHoldem.sol             Texas Hold'em vs Bot
  CofheHoldemPvP.sol          Hold'em PvP (all-in, timeouts, EIP-712)

scripts/
  deploy.cts                  Deploy CofhePoker
  deployPvP.cts               Deploy CofhePokerPvP
  deployHoldem.cts            Deploy CofheHoldem
  deployHoldemPvP.cts         Deploy CofheHoldemPvP
  test-flow.mjs               Automated PvP integration test

src/
  components/
    PlayHub.tsx               Game mode selector
    PlayTab.tsx               3-Card Poker UI
    HoldemTab.tsx             Hold'em UI
    HoldemPvPTab.tsx          Hold'em PvP (lobby, game, activity log)
    PvPTab.tsx                3-Card PvP (lobby, friends, invites)
    LandingPage.tsx           Landing page with animations
  hooks/
    useGameActions.ts         3-Card on-chain game flow
    useHoldemActions.ts       Hold'em on-chain game flow
    useCofhe.ts               CoFHE SDK singleton, permits, decryption
  config/
    contract.ts               ABI + address per contract
  store/
    useGameStore.ts           Zustand state management
```

## Security

- All card data encrypted at rest and in transit — no plaintext on-chain
- ACL-gated decryption via `FHE.allow` — only permitted addresses can decrypt
- Three independent random seeds prevent cross-group card deduction
- Block-based timeout enforcement prevents game stalling
- EIP-712 typed signatures prevent action replay and impersonation
- No private keys or secrets in source code — all loaded from `.env`

## Known Limitations

- FHE decrypt latency: 15-30 seconds on testnet
- Showdown gas: ~35M (near Sepolia block limit)
- Small probability of card collision between hole and community groups
- One active table per player
- Heads-up only (2 players max per table)
- Testnet only — not audited for mainnet

## Built For

[Fhenix Buildathon 2026](https://fhenix.io) — demonstrating that Fully Homomorphic Encryption can power trustless, privacy-preserving games entirely on-chain.

## License

MIT
