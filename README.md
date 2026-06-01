<div align="center">

# 🂡 CipherPoker

### Fully on-chain poker where the cards stay encrypted — even from the chain itself.

*The blockchain is the dealer. No server. No trusted RNG. Cards and chip balances live as Fully Homomorphic Encryption ciphertext — generated, evaluated and compared on-chain without ever being decrypted.*

[![Live Demo](https://img.shields.io/badge/▶_Live_Demo-cofhe--poker.vercel.app-7C3AED?style=for-the-badge)](https://cofhe-poker.vercel.app)

![Network](https://img.shields.io/badge/Network-Ethereum_Sepolia-627EEA?style=flat-square)
![FHE](https://img.shields.io/badge/FHE-Fhenix_CoFHE_v0.5-B366FF?style=flat-square)
![Contracts](https://img.shields.io/badge/Contracts-6_deployed-00E86C?style=flat-square)
![Solidity](https://img.shields.io/badge/Solidity-0.8.25-363636?style=flat-square)
![Frontend](https://img.shields.io/badge/Frontend-React_18_·_TypeScript-3178C6?style=flat-square)

**Privacy-by-Design dApp Buildathon** · Track: **Encrypted Gaming**

</div>

---

## 📋 At a glance

| | |
|---|---|
| **What** | A complete, fully on-chain poker platform — 3-Card Poker & Texas Hold'em, vs-Bot and PvP |
| **The hard part** | Hidden information (cards) and private wealth (chips) — solved with FHE, not a trusted server |
| **FHE stack** | Fhenix **CoFHE v0.5** — `@fhenixprotocol/cofhe-contracts` + `@cofhe/sdk` |
| **On-chain** | 6 smart contracts (~3,400 lines of Solidity) live on Ethereum Sepolia |
| **Wave 5 highlight** | **Confidential bankroll** — chip balances are now FHE-encrypted `euint64`, verified on-chain |
| **Status** | Live demo · contracts deployed & verified · reproducible on-chain test scripts |

---

## Table of Contents

1. [The Problem](#-the-problem)
2. [What is CipherPoker](#-what-is-cipherpoker)
3. [Key Features](#-key-features)
4. [FHE Integration — Deep Dive](#-fhe-integration--deep-dive)
5. [How a Hand Works](#-how-a-hand-works)
6. [Game Modes](#-game-modes)
7. [Deployed Contracts](#-deployed-contracts)
8. [Verified On-Chain](#-verified-on-chain)
9. [Privacy & Security Model](#-privacy--security-model)
10. [Architecture](#-architecture)
11. [Tech Stack](#-tech-stack)
12. [Project Structure](#-project-structure)
13. [Getting Started](#-getting-started)
14. [Buildathon Progress](#-buildathon-progress)
15. [Roadmap](#-roadmap)
16. [Known Limitations](#-known-limitations)
17. [Why CipherPoker Wins](#-why-cipherpoker-wins)

---

## 🎯 The Problem

Public blockchains are **transparent by default** — and that transparency makes poker impossible.

Poker is a game of *hidden information*. If a hand is readable on-chain, the game is broken in two ways:

- **Anyone can see your hole cards.** A spectator, your opponent, or a validator reading state knows exactly what you hold.
- **The dealer cannot be trusted.** Every "on-chain poker" before FHE pushed card shuffling and dealing onto a centralized server, then asked players to *believe* the RNG was fair.

This is the same architectural wall that blocks sealed-bid auctions, private DeFi positions and confidential governance: **you cannot build hidden-information applications on rails that publish everything.**

CipherPoker removes the wall. With Fully Homomorphic Encryption, the smart contract computes **directly on encrypted data** — it shuffles, deals, evaluates 7-card hands and decides the winner without ever seeing a card. There is no server and no trusted dealer. The chain itself is the dealer, and even the chain cannot read the hand.

---

## 🂡 What is CipherPoker

CipherPoker is a **production-grade, fully on-chain poker platform** built FHE-first on Fhenix CoFHE.

Every card is born encrypted, lives encrypted, and is evaluated encrypted. Only *you* can decrypt *your* cards — through an EIP-712 permit. The opponent, spectators, validators and the contract operator see nothing but ciphertext until showdown.

It is not a tech demo. CipherPoker ships **four complete game modes**, real betting with blinds and side pots, a confidential chip economy, a social layer (on-chain friends, invites, spectator mode), a leaderboard and a real backend — all on encrypted foundations.

---

## ⚡ Key Features

### 🃏 A real poker engine that runs on ciphertext
Not "encrypt a number, decrypt it later." The contract performs **genuine poker logic on encrypted values** — pair / trips / quads detection, flush detection, straight detection and full 7-card hand ranking — entirely homomorphically. A Texas Hold'em showdown is **~700 FHE operations**; the only thing ever decrypted is a single bit: *who won*.

### 🔒 Confidential bankroll *(Wave 5)*
A player's chip balance is an **FHE-encrypted `euint64`**. On-chain, nobody can read your wealth — not opponents, not validators, not spectators. Only the owner decrypts it via permit. Sitting at a table commits a public buy-in; everything behind the table stays private. *Verified live on Sepolia.*

### 🎲 Provably fair — zero trusted RNG
The deck is generated with **on-chain encrypted randomness** (`FHE.randomEuint64`). There is no server, no operator, no oracle that could rig a deal. Fairness is a property of the cryptography, not a promise.

### 🎮 Four complete game modes
3-Card Poker and Texas Hold'em, each in **vs-Bot** and **PvP** — four full games with their own betting logic, not one game reskinned four times.

### 🤝 Social & competitive layer
On-chain friend system, private-table invite codes, **spectator mode** (watch live tables — card backs only, FHE keeps values hidden), leaderboard, Elo, daily/weekly challenges, achievements, XP and levels.

### 🏦 Non-custodial vault
Real-money mode backed by a `Vault` contract — ETH & USDT deposits, Chainlink price feed, lock/settle for games, reentrancy-guarded, no admin withdrawal path.

### 📱 Production polish
Progressive Web App (installable, offline shell), Web Audio sound design, Web Share, onboarding tour, hand-history replay with CSV export, optional Supabase backend with graceful degradation.

---

## 🔐 FHE Integration — Deep Dive

CipherPoker is built on **Fhenix CoFHE v0.5**. FHE is the storage layout and the execution model, not a feature bolted on top.

### What is encrypted

| Data | On-chain type | Who can ever decrypt it |
|---|---|---|
| Hole cards | `euint64` | **Only the owning player** — via EIP-712 permit + ACL |
| Community cards | `euint64` | Public — but **only** after the betting round completes |
| Hand scores | `euint64` | **Never** — only the `FHE.gt` comparison *result* is revealed |
| **Chip bankroll** *(Wave 5)* | `euint64` | **Only the owner** — encrypted in contract storage |
| Shuffle seeds | `euint64` | **Never** |

No card value is ever written to chain in plaintext. The contract holds only ciphertext handles.

### The encrypted poker engine

The 7-card showdown evaluator (`_evalHand7`) never decrypts a card. Every step is homomorphic:

```solidity
// Pair / trips / quads — 21 pairwise encrypted rank comparisons
for (uint i = 0; i < 7; i++)
  for (uint j = i + 1; j < 7; j++) {
    euint64 eq_ = FHE.select(FHE.eq(r[i], r[j]), one, zero);
    mc[i] = FHE.add(mc[i], eq_);          // match counts, all encrypted
  }

// Flush — encrypted suit counting
ebool isFlush = FHE.gte(maxSuit, FHE.asEuint64(5));

// Straight — encrypted bubble sort + windowed range checks
// Hand ranking — nested FHE.select branching

// Showdown — the ONLY value ever decrypted is this single bit:
ebool p1Wins = FHE.gt(p1Score, p2Score);
```

The losing hand is revealed only at showdown, deliberately, via `FHE.allowPublic`.

### Wave 5 — the confidential bankroll

Before Wave 5, chip balances were a plaintext mapping. Now:

```solidity
mapping(address => euint64) private encBalance;   // your wealth — encrypted on-chain
```

A buy-in debits the bankroll **homomorphically**, clamped so it can never underflow or leak:

```solidity
euint64 debit  = FHE.min(encBalance[p], FHE.asEuint64(buyIn));  // clamp — no underflow
encBalance[p]  = FHE.sub(encBalance[p], debit);                 // bankroll never revealed
```

`getBalance()` returns a ciphertext handle — an opponent who calls it sees only an opaque number. This mirrors a confidential-token model: your total wealth is private, while the chips you commit to a specific table are public (a poker round cannot progress on ciphertext, so in-hand stacks are intentionally plaintext).

### Access control — least privilege by design

| Call | Purpose |
|---|---|
| `FHE.allow(card, player)` | Grants **exactly one** player decrypt rights to their own cards — cross-player access is never granted |
| `FHE.allowThis(ct)` | Lets the contract itself compute on the ciphertext between transactions |
| `FHE.allowPublic(ct)` | Called **only** at hand completion to reveal community / losing cards |

`allowGlobal` is intentionally never used.

### FHE operations catalogue

CipherPoker exercises a broad surface of the CoFHE library — real, non-trivial usage:

`randomEuint64` · `add` · `sub` · `mul` · `div` · `rem` · `min` · `max` · `eq` · `ne` · `gt` · `gte` · `lte` · `and` · `or` · `not` · `select` · `asEuint64` · `allow` · `allowThis` · `allowPublic` · threshold decrypt tasks · EIP-712 decryption permits.

---

## 🃏 How a Hand Works

A Texas Hold'em PvP hand — and where FHE acts at every step:

| Step | What happens | FHE |
|---|---|---|
| **1. Sit down** | `createTable` / `joinTable` — buy-in is debited from your **encrypted bankroll** | `FHE.min` clamp + `FHE.sub` |
| **2. Deal** | `startHand` generates 9 cards from encrypted randomness; 2 hole cards each are ACL-locked to their owner, 5 community cards stay encrypted | `FHE.randomEuint64`, `FHE.allow` |
| **3. Bet** | 4 streets (pre-flop → river): check / bet / raise / call / fold / all-in. Community cards are revealed street by street | `FHE.allowPublic` per street |
| **4. Showdown** | `computeShowdown` evaluates both 7-card hands and compares them — ~700 FHE ops | full `_evalHand7` on ciphertext |
| **5. Resolve** | The CoFHE threshold network decrypts **one bit** (winner); the pot is paid into the winner's stack; both hands revealed | `FHE.gt` result + `FHE.allowPublic` |
| **6. Cash out** | `leaveTable` folds your remaining stack back into your **encrypted bankroll** | `FHE.add` |

At no point between deal and showdown is a hole card readable by anyone but its owner.

---

## 🎮 Game Modes

| Mode | Players | FHE workload | Highlights |
|---|---|---|---|
| **Texas Hold'em — PvP** | 2 (heads-up) | ~700 FHE ops / showdown | Blinds, 4 betting rounds, all-in + side pots, dealer rotation, block-based timeouts, **encrypted bankroll** |
| **Texas Hold'em — vs Bot** | 1 + AI | per-street FHE evaluation | Full 4-round game against an on-chain bot |
| **3-Card Poker — PvP** | 2 | ~80 FHE ops / hand | Sealed play/fold, lobby + invite codes, **encrypted bankroll** |
| **3-Card Poker — vs Bot** | 1 + AI | instant FHE showdown | Fast casino-style hand |

---

## 📜 Deployed Contracts

All live on **Ethereum Sepolia** — click any address for its on-chain transaction history.

| Contract | Role | Address |
|---|---|---|
| `CofheHoldemPvP` | Texas Hold'em PvP — **encrypted bankroll** | [`0xc3167bBb…C45fB5`](https://sepolia.etherscan.io/address/0xc3167bBbcC9a3Abff3420D622E992F7C95C45fB5) |
| `CofhePokerPvP` | 3-Card Poker PvP — **encrypted bankroll** | [`0x7f29231D…952923`](https://sepolia.etherscan.io/address/0x7f29231Dfb9Ea271B3C39A494D3274f311952923) |
| `CofheHoldem` | Texas Hold'em vs Bot | [`0xb9c4e4F4…21E845`](https://sepolia.etherscan.io/address/0xb9c4e4F4DF97b7B5c43294fE98f3585f5D21E845) |
| `CofhePoker` | 3-Card Poker vs Bot | [`0x17688010…F28FE3`](https://sepolia.etherscan.io/address/0x176880100C010eA6f5e5c0daeAe521d9EBF28FE3) |
| `Vault` | Non-custodial ETH / USDT deposits | [`0x78F75194…C441a19`](https://sepolia.etherscan.io/address/0x78F7519411AaE1d2679E054690d46F8B1C441a19) |
| `MockUSDT` | Test stablecoin (Sepolia has no canonical USDT) | [`0x5da0E971…6CA19b`](https://sepolia.etherscan.io/address/0x5da0E971D78ae43604073fB67887b440fE6CA19b) |

~3,400 lines of Solidity across 6 contracts.

---

## ✅ Verified On-Chain

Wave 5's confidential-bankroll logic is proven on live Sepolia by two on-chain verification runs. Their outputs:

**Encrypted buy-in**
```
createPvPTable(buyIn=100)  → status=1
getStackOf  → 100                   table stack == buy-in                  PASS
getBalance  → 426947284539845347…   bankroll is an encrypted handle        PASS
leaveTable  → stack cashed back into the encrypted bankroll                PASS
```

**Full PvP hand, two wallets**
```
act(call) preflop → act(check) flop → act(fold) flop
winner paid · stacks p1=50 p2=70 · sum 120 == 2 × buy-in   chips conserved  PASS
getBalance → encrypted ciphertext handle                                    PASS
```

These exercise the real money path end to end: `_deductAndBet` on a plaintext stack, `_advanceRound`, `_winByFold` payout, chip conservation, encrypted-bankroll debit/credit, and cash-out.

---

## 🛡 Privacy & Security Model

**Guaranteed**
- No card value is ever stored on-chain in plaintext.
- Hole cards are decryptable by exactly one player (ACL + EIP-712 permit) — never the opponent.
- The chip **bankroll** is an encrypted `euint64`; `getBalance()` exposes only a ciphertext handle.
- No trusted dealer or RNG — the deck comes from on-chain encrypted randomness.
- Showdown decrypts a single bit (the winner), nothing more.
- Timeouts are **permissionless** — anyone can claim an opponent's forfeit after a block-based deadline, so no admin is ever required to keep a game moving.
- The `Vault` is non-custodial — there is no owner withdrawal path.

**Honest scope** *(see also [Known Limitations](#-known-limitations))*
- Bet amounts and the in-hand pot are plaintext — a poker round cannot progress on ciphertext. What is private is the **cards** and the **bankroll behind the table**.
- Deployed to **testnet**; contracts are not yet professionally audited.

---

## 🏗 Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Browser  —  React 18 + Vite + TypeScript                 │
│  wagmi / viem · Zustand stores · @cofhe/sdk                │
│  (client-side encryption, EIP-712 permits, decryption)     │
└───────────────┬──────────────────────────────────────────┘
                │ JSON-RPC
                ▼
┌──────────────────────────────────────────────────────────┐
│  Ethereum Sepolia  —  6 FHE smart contracts                │
│  cards & bankroll stored as euint64 ciphertext             │
└───────────────┬──────────────────────────────────────────┘
                │ encrypted compute · threshold decryption
                ▼
┌──────────────────────────────────────────────────────────┐
│  Fhenix CoFHE  —  coprocessor + threshold-decryption net   │
└──────────────────────────────────────────────────────────┘

  Supabase  ──  leaderboard · chat · hand history · spectator
                feed   (optional — graceful degradation)
```

Card values and bankrolls live as `euint64` ciphertext in contract storage. The CoFHE coprocessor performs the homomorphic computation; a threshold-decryption network reveals only what the ACL permits. Supabase is an **optional** convenience layer for social/history data — the game is fully playable without it.

---

## 🧱 Tech Stack

| Layer | Technology |
|---|---|
| **Smart contracts** | Solidity 0.8.25 · Fhenix CoFHE v0.5 (`@fhenixprotocol/cofhe-contracts`) · Hardhat |
| **FHE client** | `@cofhe/sdk` · `@cofhe/react` — client encryption, permits, threshold decryption |
| **Frontend** | React 18 · TypeScript · Vite · Tailwind CSS 4 · Framer Motion |
| **Web3** | wagmi v2 · viem · EIP-6963 wallet detection |
| **State** | Zustand (game, vault, profile, challenges, notifications, lobby) |
| **Backend** | Supabase — PostgreSQL + Realtime + Row-Level Security *(optional)* |
| **Platform** | PWA — service worker, Web Audio API, Web Share API |

---

## 📂 Project Structure

```
contracts/        6 FHE smart contracts (Solidity)
  CofheHoldemPvP.sol   CofhePokerPvP.sol     ← PvP, encrypted bankroll
  CofheHoldem.sol      CofhePoker.sol        ← vs-Bot
  Vault.sol            MockUSDT.sol
scripts/          deploy scripts
src/
  components/     game tables, lobby, spectator, admin, UI
  hooks/          useCofhe, useGameActions, useHoldemActions, usePvPGame, useLobby…
  store/          Zustand stores
  config/         contract ABIs + addresses
  lib/            poker hand evaluation, Supabase client, utils
  adapters/       GameAdapter / VaultAdapter
supabase/         schema.sql — tables, RLS policies, realtime publication
```

---

## 🚀 Getting Started

```bash
# 1. Install
npm install

# 2. Configure — copy the template and fill in values
cp .env.example .env
#   SEPOLIA_RPC_URL, contract addresses, (optional) Supabase keys

# 3. Run the app
npm run dev                       # → http://localhost:3000

# 4. Contracts
npm run compile                   # compile with Hardhat

```

Connect any Sepolia wallet — a new player is granted a starting encrypted bankroll on first interaction. You will sign an EIP-712 **permit** once, so the CoFHE network can decrypt *your* cards for *you*.

---

## 📈 Buildathon Progress

CipherPoker is a **progress-driven** submission — each wave is a meaningful, compounding step.

| Wave | Delivered |
|---|---|
| **1–2** | Foundation · the FHE encrypted-card engine · visual design system |
| **3** | Full Texas Hold'em (4 betting rounds) · stats · player profiles |
| **4** | Real-money `Vault` (ETH/USDT, Chainlink oracle) · social layer — on-chain friends, invites, spectator mode · economy |
| **5** | **Confidential bankroll** — `balances` migrated to encrypted `euint64`; homomorphic buy-in / cash-out; live on-chain verification scripts; real on-chain activity metrics |

Each wave's work is committed and traceable in git history.

---

## 🗺 Roadmap

- **Encrypted bet sizing** — make raise amounts ciphertext, not just the bankroll
- **Multi-table tournaments** — sit-and-go format on encrypted stacks
- **3-max / 6-max tables** — beyond heads-up
- **Mainnet path** — professional audit, deploy to a CoFHE-enabled mainnet

---

## ⚖️ Known Limitations

Stated honestly — these are deliberate scope boundaries, not hidden gaps:

- **Testnet only.** Contracts are deployed to Sepolia and are not yet professionally audited.
- **FHE decryption latency.** Threshold decryption on the public CoFHE testnet takes ~15–30 s; the UI is built around this with explicit "FHE network" status indicators.
- **Bet amounts are plaintext.** Cards and the bankroll are encrypted; in-hand bet/pot amounts are public, because a poker round must know them to progress. Encrypted bet sizing is on the roadmap.
- **PvP is heads-up (2 players).** Multi-seat tables are roadmap.
- **Showdown gas.** A full Hold'em showdown is FHE-heavy (~36M gas budget) — fits a Sepolia block, but the player wallet needs headroom for that transaction.

---

## 🏆 Why CipherPoker Wins

Transparent blockchains made on-chain poker a contradiction in terms. CipherPoker resolves it — not with a workaround, but by treating **privacy as the architecture**:

- It is a **complete product**, not a proof of concept — four game modes, real betting, a confidential economy, a social layer and a backend.
- It demonstrates **deep, real FHE integration** — a genuine poker engine computing on ciphertext, exercising the full breadth of the CoFHE library, with ~700 homomorphic operations per showdown.
- It shows **clear, compounding progress** across waves, culminating in the Wave 5 confidential bankroll that closes the last privacy leak: not just the cards, but a player's wealth is now private on-chain.
- It is **verifiable** — contracts are live, transactions are on Etherscan, and the privacy guarantees are proven by reproducible on-chain scripts.

This is what a protocol *designed* for privacy looks like — built in from the contract storage layout up, never retrofitted.

---

<div align="center">

### 🃏 Built on [Fhenix](https://fhenix.io) — encrypted compute for everyone.

[🎮 Play the Live Demo](https://cofhe-poker.vercel.app) · [📖 Fhenix Docs](https://docs.fhenix.io) · ⛓ Ethereum Sepolia

</div>
