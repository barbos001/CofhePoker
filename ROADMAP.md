# Cofhe Poker — Product Roadmap

> 5-wave development plan for building a production-grade, fully-featured FHE poker platform.
> Each wave represents one development sprint with roughly equal scope.

---

## Wave 1 ✅ COMPLETE — Foundation

**Goal:** Core gameplay working end-to-end with FHE encryption.

### Smart Contracts (4 deployed on Sepolia)
- [x] `CofhePoker.sol` — 3-Card vs Bot (FHE deal, evaluate, bot AI, showdown)
- [x] `CofhePokerPvP.sol` — 3-Card PvP with lobby + invite codes
- [x] `CofheHoldem.sol` — Texas Hold'em vs Bot (4 rounds, per-street eval)
- [x] `CofheHoldemPvP.sol` — Hold'em PvP (all-in, side pots, EIP-712 batch)
- [x] `Vault.sol` — Real-money settlement (ETH + USDT + Chainlink oracle)

### Frontend (React + TypeScript + Wagmi)
- [x] LandingPage — parallax, tilt cards, FHE explainer, comparison table, FAQ
- [x] PlayHub — unified game mode selector
- [x] PlayTab — 3-Card game UI with FHE activity feed, phase tracker, bot scan overlay
- [x] HoldemTab — Hold'em UI with 4 betting rounds, community cards
- [x] PvPTab + PvPTableView — multiplayer with lobby, invite system
- [x] HistoryTab — hand replay, basic stats
- [x] SettingsTab — full settings sidebar (10 sections, toggles, security)
- [x] Preloader — Venetian blinds exit, scramble text, ace cards animation
- [x] Navigation — TopBar + BottomTabBar, wallet badge, chip counter
- [x] Toast system — typed notifications with progress bar
- [x] Card component — split reveal, FHE decrypt shimmer, winner glow
- [x] Vault UI — deposit/withdraw ETH + USDT
- [x] Web Audio API sounds — deal, flip, win, lose, fold
- [x] Film grain overlay, keyboard shortcuts, XP bar, streak badge

---

## Wave 2 ✅ COMPLETE — Visual Excellence + UI/UX Overhaul

**Goal:** Make the product feel premium. First-second impression is jaw-dropping.

### Card Component Upgrade
- [x] Luxury face-up design — cream-ivory gradient, professional pip layout
- [x] SVG suit elements with proper glyphs and depth
- [x] Holographic shimmer sweep on winner cards
- [x] Suit-colored pips (red hearts/diamonds, dark clubs/spades)
- [x] Shine overlay effect with CSS mask

### CSS Animations + Effects
- [x] Confetti keyframe system (multicolor particles on win)
- [x] Chip toss / chip-fly animation
- [x] Custom thin scrollbar (dark theme)
- [x] `@keyframes card-shine` — glint sweep across face-up cards
- [x] `@keyframes confetti-fall` — win celebration particles
- [x] `@keyframes chip-bounce` — chip stack animation

### LandingPage Enhancements
- [x] Scroll progress indicator at top of page
- [x] Enhanced live player counter (session-persistent)
- [x] More detailed "recent wins" ticker with game mode info
- [x] Improved stats strip with animated counters

### App Transitions
- [x] AnimatePresence slide transition: landing → app
- [x] Fade/blur between game mode switches
- [x] Subtle page transition when navigating tabs

### PlayTab Game Table
- [x] Felt texture SVG pattern on table surface
- [x] Confetti explosion on win (canvas-based, 80 particles)
- [x] Chip fly animation when pot is won
- [x] Enhanced result overlay with hand rank display
- [x] Better bot "thinking" visual indicator

### Navigation Improvements
- [x] Notification dot on history tab (new unread hands)
- [x] Smoother tab indicator spring animation
- [x] Mobile bottom bar: swipe-to-switch gesture
- [x] Active game lock icon on blocked tabs

### Sound Improvements
- [x] Richer win fanfare (multi-note chord sequence)
- [x] Chip shuffle rhythm (clicking pattern)
- [x] Better deal sound (card swoosh with pitch variation)
- [x] Ambient success sound on streak (different from single win)

### README + ROADMAP
- [x] README.md — comprehensive project documentation
- [x] ROADMAP.md — this file — 5-wave plan

---

## Wave 3 — Game Completeness + Stats + Profile

**Goal:** All 4 game modes fully polished, deep stats, profile system.

### Hold'em Full Integration
- [ ] HoldemTab — complete betting controls with size slider
- [ ] Preset bet buttons (min/half/pot/max/all-in)
- [ ] Community cards with individual deal animations
- [ ] Real-time hand strength meter (%) updates per street
- [ ] Hold'em PvP — full lobby parity with 3-Card PvP
- [ ] Pot odds display during betting

### Hand History Overhaul (HistoryTab.tsx)
- [ ] Session stats (profit/loss, VPIP%, win rate per mode)
- [ ] Hand replay — step-through with action timeline
- [ ] Filter by game mode, result, date range
- [ ] Export to CSV button
- [ ] Best hand badge (strongest hand ever recorded)
- [ ] Profit chart (line chart over last 20 hands)
- [ ] Win distribution bar chart (high card / pair / flush etc.)

### Profile System
- [ ] Username — set custom display name (localStorage + ENS resolution)
- [ ] Avatar — 8 poker-themed options OR blockies (Ethereum address icon)
- [ ] Level/XP deeper system — perks unlock at milestones (10, 25, 50 hands)
- [ ] Achievement badges: "First Win", "5-Win Streak", "Hold'em Player", "PvP Winner"
- [ ] Public profile URL `/profile/{address}` — shareable stats page

### Leaderboard
- [ ] On-chain event indexer (read HandComplete events via RPC)
- [ ] Top 10 by chips won — weekly / monthly / all-time
- [ ] Your position highlight
- [ ] Mode filter (3-Card / Hold'em / PvP only)

### Friends System (useFriends.ts completion)
- [ ] Add friend by wallet address
- [ ] Friend online/offline status (localStorage + timestamp polling)
- [ ] One-click "Invite to game" from friends list
- [ ] Friend list in PvP lobby sidebar

### UX Improvements
- [ ] Onboarding tour (first-run coach marks, 5 steps)
- [ ] Improved PermitExplainerModal — animated FHE diagram
- [ ] Keyboard shortcut overlay redesign
- [ ] "Low balance" smart alert with one-click chip claim
- [ ] PvP waiting room — animated "waiting for opponent" screen

---

## Wave 4 — Real Money + Social + Economy

**Goal:** Full real-money ecosystem, chat, spectators, daily challenges.

### Real Money Mode (Full Polish)
- [ ] Multi-step deposit wizard (choose token → amount → confirm → receipt)
- [ ] Transaction history feed (deposit / withdraw / game settlement)
- [ ] Lock/unlock balance indicators with animated progress bars
- [ ] Gas estimator before each transaction signature
- [ ] Real-time ETH/USDT price with 30s auto-refresh
- [ ] One-click ETH ↔ USDT swap suggestion
- [ ] Withdrawal cooldown timer display
- [ ] Rake tracker — total rake paid this session / lifetime

### In-Game Chat (PvP only)
- [ ] Chat sidebar in active PvP tables
- [ ] Preset emotes / reactions (👍 🃏 💀 🎰 🔥 gg 🤝)
- [ ] System messages (game events auto-logged)
- [ ] Mute opponent option
- [ ] Emoji reactions to cards on reveal

### Spectator Mode
- [ ] "Watch" button on public PvP tables in lobby
- [ ] Read-only game view (pot + community cards only, hole cards hidden)
- [ ] Live spectator count badge on tables
- [ ] Share "watch live" link

### Daily / Weekly Challenges
- [ ] "Win 3 hands today" / "Play Hold'em" / "Try PvP" challenges
- [ ] Progress bar per challenge
- [ ] Chip reward on completion
- [ ] Streak calendar (GitHub-style contribution graph)
- [ ] Weekly reset with leaderboard integration

### Referral System
- [ ] Referral link in Settings
- [ ] Bonus chips for referring new players
- [ ] "Referred by" banner on first visit via ref link
- [ ] Referral stats counter

### In-App Notifications
- [ ] Notification bell in navbar
- [ ] "Your friend joined a table", "New challenge", "You've been invited"
- [ ] Browser Web Push API opt-in
- [ ] Notification preferences in Settings

### Reusability / Adapter Layer
- [ ] `src/adapters/` — `GameAdapter` interface (`deal`, `play`, `fold`, `getResult`)
- [ ] `src/adapters/VaultAdapter` interface
- [ ] Environment-based contract config (`VITE_GAME_CONTRACT`)
- [ ] `CONTRACTS.md` — how to swap contracts and adapt frontend
- [ ] `THEMING.md` — color palette, fonts, brand swap guide

---

## Wave 5 — Production Polish + Platform

**Goal:** Production-ready, installable PWA, multi-table, SEO, admin.

### PWA (Progressive Web App)
- [ ] `manifest.json` — installable, themed to black/gold
- [ ] Service worker — offline play-money mode
- [ ] Full icon set (all sizes for iOS / Android / desktop)
- [ ] iOS splash screens
- [ ] "Install App" prompt in Settings

### Multi-Table Support
- [ ] Multiple active game tabs in header (like online poker clients)
- [ ] Mini-table corner overlay while another game is active
- [ ] Push notification when your action is needed in another table

### Performance Optimization
- [ ] Code splitting — lazy load each game mode component
- [ ] WASM preload at landing (CoFHE initializes before user clicks play)
- [ ] `React.memo` + `useMemo` audit
- [ ] Bundle size target: < 500kb (excluding WASM)
- [ ] Lighthouse score target: 90+ on mobile

### SEO + Social Sharing
- [ ] Dynamic OG images for room invite links (canvas-generated card preview)
- [ ] Meta tags per route
- [ ] Structured FAQ data (JSON-LD)
- [ ] Twitter/X card preview when sharing invite links
- [ ] Social sharing buttons on win result screen

### Admin Dashboard (`/admin` route, gated)
- [ ] Contract stats (total hands, total volume, rake)
- [ ] Live active table count
- [ ] Player metrics (DAU, hands/day)
- [ ] Emergency pause contract UI (owner-only)
- [ ] Contract upgrade orchestration

### Accessibility (WCAG 2.1 AA)
- [ ] ARIA labels on all interactive elements
- [ ] High contrast mode toggle
- [ ] Full keyboard navigation (all game actions)
- [ ] Focus-visible indicators
- [ ] Screen reader announcements for game events

### Final UI Audit
- [ ] Light / dark mode toggle (light = cream casino felt)
- [ ] Custom styled scrollbars across all panels
- [ ] Right-click context menu in game table
- [ ] Loading states for every async operation
- [ ] Error states with retry buttons everywhere
- [ ] Empty states with poker-themed illustrations
- [ ] 404 page with card theme

### Documentation Suite
- [ ] `CONTRACTS.md` — deploy + connect new contracts
- [ ] `ADAPTERS.md` — build a new game on this shell
- [ ] `THEMING.md` — rebrand guide (colors, fonts, logo)
- [ ] `.env.example` with all environment variables documented
- [ ] JSDoc on all public hooks and adapters
- [ ] Storybook for UI component library

---

## Timeline Overview

| Wave | Focus | Key Deliverable |
|------|-------|----------------|
| 1 ✅ | Foundation | All 4 game modes working on Sepolia |
| 2 ✅ | Visual Polish | Premium UI that looks like a real product |
| 3 | Features | Complete game suite + stats + profiles |
| 4 | Economy + Social | Real money, chat, challenges, referrals |
| 5 | Platform | PWA, multi-table, SEO, admin, docs |

---

## Reusability Principle

This codebase is designed as a **reusable game shell**. To build a new game:

1. Replace `src/config/contract.ts` with your contract ABI + address
2. Replace game actions in `src/hooks/useGameActions.ts`
3. Adjust the `PlayState` machine in `src/store/useGameStore.ts`
4. Keep: FHE permit system, Vault, navigation, history, settings, social features

Everything above the game logic layer is game-agnostic.
