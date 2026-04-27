# Adapters — Build a New Game on This Shell

This codebase is a **reusable game shell**. To add a new poker variant (Omaha, Stud, etc.):

## 1. Implement `GameAdapter`

```typescript
// src/adapters/MyGameAdapter.ts
import { GameAdapter, ActionCode, HandResult } from './GameAdapter';

export class MyGameAdapter implements GameAdapter {
  readonly id          = 'my-game';
  readonly displayName = 'My Game';
  readonly isDeployed  = true;

  async startHand() { /* call your contract */ }
  async act(action: ActionCode) { /* map actions to your contract */ }
  async fold(): Promise<HandResult> { /* return result */ }
  async getBalance() { return 1000; }
  async getPlayerCards() { return []; }
}
```

## 2. Wire the adapter into the store

In `src/store/useGameStore.ts`, `GameMode` can be extended:
```typescript
export type GameMode = 'three-card' | 'holdem' | 'my-game';
```

## 3. Create a Tab component

Copy `HoldemTab.tsx` as a starting point. The shell provides:
- `useGameStore` — balance, cards, history, status
- `useGameGuards` — preflight checks, turn timer, auto-fold
- `useCofhe` — permit, decrypt
- Card, Toast, StatsBar, HandReplayModal UI components

## 4. Add to navigation

In `Navigation.tsx`:
```typescript
const TABS = [
  ...
  { key: 'my-game', label: 'MY GAME', Icon: Spade, showDot: false },
];
```

In `AppShell.tsx`:
```tsx
{activeTab === 'my-game' && <MyGameTab />}
```

## 5. Implement `VaultAdapter` (optional)

If your game uses a different vault/token, implement `VaultAdapter`:
```typescript
import { VaultAdapter } from './VaultAdapter';
// See src/adapters/VaultAdapter.ts for the interface
```

## What the shell provides for free

| Feature | File |
|---|---|
| FHE permit flow | `useCofhe.ts` |
| Wallet connection | `WalletOverlay.tsx` |
| Hand history + replay | `HistoryTab.tsx`, `HandReplayModal.tsx` |
| Profile + XP + achievements | `ProfileTab.tsx`, `useProfileStore.ts` |
| Leaderboard | `LeaderboardTab.tsx` |
| Vault deposit/withdraw | `WalletPanel.tsx` |
| Daily/weekly challenges | `ChallengesPanel.tsx` |
| Notifications | `NotificationBell.tsx` |
| Toast system | `Toast.tsx` |
| Sound effects | `useSounds.ts` |
| Onboarding tour | `OnboardingTour.tsx` |
| Low balance alert | `LowBalanceAlert.tsx` |
| PWA manifest + SW | `public/manifest.json`, `public/sw.js` |
