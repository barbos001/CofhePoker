/**
 * VaultAdapter — interface for swapping the real-money vault implementation.
 *
 * The default implementation targets Vault.sol on Sepolia with ETH + USDT.
 * To use a different token / chain / contract, implement this interface.
 */

export type TokenSymbol = 'ETH' | 'USDT' | string;

export interface TokenBalance {
  free:    bigint;
  locked:  bigint;
  usdWei:  bigint;
}

export interface DepositReceipt {
  txHash:    string;
  amount:    bigint;
  token:     TokenSymbol;
  timestamp: number;
}

export interface VaultAdapter {
  /** Unique identifier. */
  readonly id: string;
  /** Whether vault contract is deployed. */
  readonly isDeployed: boolean;

  /** Supported tokens (e.g. ['ETH', 'USDT']). */
  readonly supportedTokens: readonly TokenSymbol[];

  /** Fetch free + locked balance for a given token. */
  getBalance(token: TokenSymbol): Promise<TokenBalance>;

  /** Deposit `amount` of `token` into the vault. */
  deposit(token: TokenSymbol, amount: bigint): Promise<DepositReceipt>;

  /** Withdraw `amount` of `token` from the vault. */
  withdraw(token: TokenSymbol, amount: bigint): Promise<DepositReceipt>;

  /** Get current price of ETH in USD (18-decimal). */
  getEthPrice(): Promise<bigint>;

  /** Lock funds for a game table (called before deal). */
  lockFunds?(tableId: number, amount: bigint, token: TokenSymbol): Promise<string>;

  /** Unlock funds after hand settles. */
  unlockFunds?(tableId: number): Promise<string>;
}
