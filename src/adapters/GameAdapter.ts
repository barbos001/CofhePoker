/**
 * GameAdapter — interface for plugging a new poker variant into the UI shell.
 *
 * To build a new game on this shell:
 *   1. Implement GameAdapter for your contract.
 *   2. Replace the import in src/hooks/useGameActions.ts.
 *   3. Keep the store shape (PlayState, HandHistory) unchanged.
 */

export type ActionCode = 'check' | 'bet' | 'raise' | 'call' | 'fold' | 'deal';

export interface HandResult {
  result:   'WON' | 'LOST' | 'FOLD' | 'PUSH';
  delta:    number;
  desc:     string;
  pot:      number;
  txHash:   string;
  playerCards: number[];
  botCards?:   number[];
}

export interface GameAdapter {
  /** Unique identifier for this game mode. */
  readonly id: string;
  /** Display name shown in the UI. */
  readonly displayName: string;
  /** Whether the adapter is connected to a deployed contract. */
  readonly isDeployed: boolean;

  /** Initialise a new hand / table. */
  startHand(): Promise<void>;

  /** Execute a player action. Returns the new table state. */
  act(action: ActionCode, betSize?: number): Promise<void>;

  /** Fold the current hand. */
  fold(): Promise<HandResult>;

  /** Get the current on-chain balance of the player (in chips). */
  getBalance(): Promise<number>;

  /** Decrypt and return card IDs for the player's hole cards. */
  getPlayerCards(): Promise<number[]>;

  /** Decrypt and return the community cards (Hold'em only). */
  getCommunityCards?(): Promise<number[]>;

  /** Subscribe to table state updates. Returns unsubscribe fn. */
  subscribe?(onUpdate: (state: unknown) => void): () => void;
}

/** Null adapter — used when no contract is deployed (mock/demo mode). */
export class NullGameAdapter implements GameAdapter {
  readonly id          = 'null';
  readonly displayName = 'Demo';
  readonly isDeployed  = false;

  async startHand()                 { throw new Error('No contract deployed'); }
  async act(_: ActionCode)          { throw new Error('No contract deployed'); }
  async fold(): Promise<HandResult> { throw new Error('No contract deployed'); }
  async getBalance()                { return 1000; }
  async getPlayerCards()            { return []; }
}
