<div align="center">

# 🂡 CipherPoker

### Fully on-chain poker where the cards stay encrypted — even from the chain itself.

**The blockchain is the dealer. No server. No trusted RNG. Cards are generated, evaluated and compared as Fully Homomorphic Encryption ciphertext — validators never see a hand.**

[🎮 Live Demo](https://cofhe-poker.vercel.app) · [🔐 Built on Fhenix CoFHE](https://docs.fhenix.io) · ⛓ Ethereum Sepolia

`Privacy-by-Design dApp Buildathon` · Track: **Encrypted Gaming**

</div>

---

## The problem

Public blockchains are transparent by default — and that kills poker. If a hand is readable on-chain, the game is unplayable: anyone can see your hole cards, and a validator can fold-or-call with perfect information. Every "on-chain poker" before FHE had to put the dealer on a trusted server and ask players to believe the RNG was fair.

**CipherPoker removes the trusted dealer entirely.** Cards live as encrypted values for their whole lifecycle. The smart contract shuffles, deals, evaluates 7-card hands and decides the winner — all on ciphertext. Only *you* can decrypt *your* cards, via an EIP-712 permit. Nobody — opponent, validator, spectator, or the contract operator — can see a hand before showdown.

---

## ⚡ What makes it stand out

- 🃏 **A real poker engine runs on encrypted data.** Not "encrypt a number, decrypt it later" — the contract computes pair/trips/flush/straight detection and full 7-card hand ranking entirely on FHE ciphertext (~700 FHE operations per Texas Hold'em showdown).
- 🔒 **Confidential bankroll (Wave 5).** A player's chip balance is an FHE-encrypted `euint64`. On-chain, nobody can read your wealth — only the owner decrypts it. Sitting at a table commits a public buy-in; everything behind the table stays private. *(Verified live on Sepolia — see [Verified on-chain](#-verified-on-chain).)*
- 🎲 **Provably fair, no trusted RNG.** The deck is generated with on-chain encrypted randomness (`FHE.randomEuint64`). There is no server and no operator who could rig a deal.
- 🎮 **Four complete game modes** — 3-Card Poker and Texas Hold'em, each vs-Bot and PvP — not one game reskinned four times.
- 🏗 **Production-grade.** 6 deployed contracts (~3,400 lines of Solidity), Supabase backend, PWA, spectator mode, on-chain friends, headless test bots.

---

## 🔐 FHE integration — the depth

CipherPoker is built on **Fhenix CoFHE v0.5**. FHE is the architecture, not a feature bolted on.

### What is encrypted

| Data | Type | Who can decrypt |
|---|---|---|
| Hole cards | `euint64` | Only the owning player (EIP-712 permit) |
| Community cards | `euint64` | Public — only after the round completes |
| Hand scores | `euint64` | Never — only the `FHE.gt` *result* is revealed |
| **Chip bankroll** (Wave 5) | `euint64` | **Only the owner — encrypted on-chain** |
| Shuffle seeds | `euint64` | Never |

### A poker engine on ciphertext

The 7-card showdown evaluator (`_evalHand7`) never decrypts a card. It runs, homomorphically:

- **Pairs / trips / quads** — 21 pairwise `FHE.eq` rank comparisons
- **Flush** — 28 encrypted suit-count checks
- **Straight** — an encrypted bubble sort + windowed range checks
- **Hand ranking** — nested `FHE.select` branching, then `FHE.gt` to pick the winner

The contract decrypts exactly one bit: *who won*. The losing hand is revealed only at showdown via `FHE.allowPublic`.

### Access control — least privilege

`FHE.allow(card, player)` grants exactly one player decrypt rights to their own cards. Cross-player access is **never** granted. `FHE.allowThis` lets the contract compute; `FHE.allowPublic` is called only at hand completion. No `allowGlobal`.

### Wave 5 — the confidential bankroll

`balances` was a plaintext mapping. It is now `mapping(address => euint64)` — an encrypted bankroll, born encrypted on first touch. Buy-in debits it homomorphically (`FHE.sub` clamped by `FHE.min` so it can never underflow or leak). `getBalance()` returns a ciphertext handle; an opponent calling it sees only an opaque number. This is the same confidentiality model as a Tongo-style confidential token — your wealth is private, the chips you commit to a specific table are public (a poker round cannot progress on ciphertext).

---

## 🎮 Game modes

| Mode | Players | FHE work | Status |
|---|---|---|---|
| **Texas Hold'em — PvP** | 2 (heads-up) | ~700 FHE ops / showdown · encrypted bankroll | ✅ Verified on-chain |
| **Texas Hold'em — vs Bot** | 1 + AI | per-street FHE hand evaluation | ✅ Live |
| **3-Card Poker — PvP** | 2 | ~80 FHE ops / hand · encrypted bankroll | ✅ Live |
| **3-Card Poker — vs Bot** | 1 + AI | instant FHE showdown | ✅ Live |

Full Hold'em: blinds, 4 betting rounds, check/bet/raise/call/fold, all-in with side pots, dealer rotation, block-based timeouts.

---

## 📜 Deployed contracts — Ethereum Sepolia

| Contract | Role | Address |
|---|---|---|
| `CofheHoldemPvP` | Texas Hold'em PvP — **encrypted bankroll** | [`0xc3167bBbcC9a3Abff3420D622E992F7C95C45fB5`](https://sepolia.etherscan.io/address/0xc3167bBbcC9a3Abff3420D622E992F7C95C45fB5) |
| `CofhePokerPvP` | 3-Card PvP — **encrypted bankroll** | [`0x7f29231Dfb9Ea271B3C39A494D3274f311952923`](https://sepolia.etherscan.io/address/0x7f29231Dfb9Ea271B3C39A494D3274f311952923) |
| `CofheHoldem` | Texas Hold'em vs Bot | [`0xb9c4e4F4DF97b7B5c43294fE98f3585f5D21E845`](https://sepolia.etherscan.io/address/0xb9c4e4F4DF97b7B5c43294fE98f3585f5D21E845) |
| `CofhePoker` | 3-Card Poker vs Bot | [`0x176880100C010eA6f5e5c0daeAe521d9EBF28FE3`](https://sepolia.etherscan.io/address/0x176880100C010eA6f5e5c0daeAe521d9EBF28FE3) |
| `Vault` | Non-custodial ETH/USDT deposits | [`0x78F7519411AaE1d2679E054690d46F8B1C441a19`](https://sepolia.etherscan.io/address/0x78F7519411AaE1d2679E054690d46F8B1C441a19) |
| `MockUSDT` | Test stablecoin | [`0x5da0E971D78ae43604073fB67887b440fE6CA19b`](https://sepolia.etherscan.io/address/0x5da0E971D78ae43604073fB67887b440fE6CA19b) |

---

## ✅ Verified on-chain

Wave 5's confidential-bankroll logic is proven on live Sepolia by two reproducible scripts (`scripts/verify-*.mjs`):

**Encrypted buy-in** — `node scripts/verify-funding.mjs`
```
createPvPTable(buyIn=100) → status=1
getStackOf  → 100                  (table stack = buy-in)        PASS
getBalance  → 426947284539845347…  (encrypted ciphertext handle) PASS
leaveTable  → stack cashed back into the encrypted bankroll      PASS
```

**Full PvP hand, two wallets** — `node scripts/verify-pvp-hand.mjs`
```
act(call) preflop → act(check) flop → act(fold) flop
winner paid · stacks p1=50 p2=70 · sum 120 == 2 × buy-in   chips conserved  PASS
getBalance → encrypted ciphertext handle                                    PASS
```

Every contract address above links to its live transaction history on Etherscan.

---

## 🏗 Architecture

```
Browser (React + Vite)
   │  wagmi / viem            @cofhe/sdk — client encryption,
   │  Zustand stores          EIP-712 permits, threshold decrypt
   ▼
Ethereum Sepolia ──────────────► CoFHE coprocessor
   6 FHE smart contracts          encrypted compute + threshold
   (cards & bankroll = euint64)   decryption network
   │
   ▼
Supabase  — leaderboard, chat, hand history, spectator feed (graceful-optional)
```

Card values and bankrolls live as `euint64` ciphertext in contract storage. The CoFHE coprocessor performs the homomorphic computation; a threshold network decrypts only what ACL permits.

---

## 🛠 Tech stack

**Contracts** — Solidity 0.8.25 · Fhenix CoFHE v0.5 (`@fhenixprotocol/cofhe-contracts`) · Hardhat
**Frontend** — React 18 · TypeScript · Vite · Tailwind 4 · Framer Motion · Zustand · wagmi v2 / viem · `@cofhe/sdk`
**Backend** — Supabase (PostgreSQL + Realtime, optional) · PWA (service worker, Web Audio, Web Share)

---

## 🚀 Run locally

```bash
npm install
cp .env.example .env          # add SEPOLIA_RPC_URL, contract addresses, (optional) Supabase
npm run dev                   # http://localhost:3000

npm run compile               # compile contracts
node scripts/verify-funding.mjs   # reproduce the on-chain buy-in proof
```

Connect any Sepolia wallet — a fresh player is granted a starting encrypted bankroll on first interaction.

---

## 🗺 Wave progress

- **Waves 1–2** — foundation, FHE card engine, visual design
- **Wave 3** — full Texas Hold'em, stats, profiles
- **Wave 4** — real-money vault, social layer (friends, invites, spectator), economy
- **Wave 5** — **confidential bankroll**: `balances` → encrypted `euint64`; buy-in / cash-out flow; live on-chain verification; on-chain activity metrics

**Next** — encrypted bet sizing · multi-table tournaments · mainnet audit path.

---

## Why CipherPoker wins on a privacy-first chain

Transparent chains made on-chain poker a contradiction. CipherPoker resolves it: a complete poker product — four game modes, real betting, a real backend — where the hardest part of the game (hidden information) is solved by **computing on encrypted state**, not by trusting a server. The Wave 5 confidential bankroll closes the last leak: not just the cards, but a player's wealth is now private on-chain. This is what a protocol *designed* for privacy looks like — built in from the contract storage layout up, not retrofitted.

<div align="center">

**Built on [Fhenix](https://fhenix.io) · Encrypted compute for everyone.**

</div>
