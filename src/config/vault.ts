/**
 * Vault contract — ABI and address config.
 *
 * VAULT_ADDRESS   → set VITE_VAULT_ADDRESS in .env
 * USDT_ADDRESS    → set VITE_USDT_ADDRESS  in .env
 *
 * address(0) is used as the sentinel for ETH.
 *
 * Price oracle: Vault reads live from a Chainlink AggregatorV3Interface feed.
 *   Sepolia ETH/USD: 0x694AA1769357215DE4FAC081bf1f309aDC325306
 *   Mainnet ETH/USD: 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419
 */

export const VAULT_ADDRESS =
  (import.meta.env.VITE_VAULT_ADDRESS as `0x${string}` | undefined) ??
  '0x78F7519411AaE1d2679E054690d46F8B1C441a19';

export const USDT_ADDRESS =
  (import.meta.env.VITE_USDT_ADDRESS as `0x${string}` | undefined) ??
  '0x5da0E971D78ae43604073fB67887b440fE6CA19b';

export const ETH_TOKEN = '0x0000000000000000000000000000000000000000' as `0x${string}`;

export const VAULT_DEPLOYED =
  VAULT_ADDRESS !== '0x0000000000000000000000000000000000000000';

/** Chainlink ETH/USD feed on Sepolia (for reference / deployment scripts). */
export const CHAINLINK_ETH_USD_SEPOLIA = '0x694AA1769357215DE4FAC081bf1f309aDC325306' as `0x${string}`;

// ─── ABI ──────────────────────────────────────────────────────────────────────

export const VAULT_ABI = [
  // ── Constants / immutables ──────────────────────────────────────────────────
  {
    name: 'ETH_TOKEN', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'MAX_RAKE', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'USDT', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'priceFeed', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'address' }],
  },

  // ── State getters ────────────────────────────────────────────────────────────
  {
    name: 'getEthUsdPrice', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: 'price18', type: 'uint256' }],
  },
  {
    name: 'isPriceStale', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'paused', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'owner', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'authorizedPoker', type: 'function', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },

  // ── Balance mappings (auto-generated getters) ──────────────────────────────
  {
    name: 'balance', type: 'function', stateMutability: 'view',
    inputs: [
      { name: 'player', type: 'address' },
      { name: 'token',  type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'lockedBalance', type: 'function', stateMutability: 'view',
    inputs: [
      { name: 'player', type: 'address' },
      { name: 'token',  type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },

  // ── Named view helpers ────────────────────────────────────────────────────
  {
    name: 'getFreeBalance', type: 'function', stateMutability: 'view',
    inputs: [
      { name: 'player', type: 'address' },
      { name: 'token',  type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getLockedBalance', type: 'function', stateMutability: 'view',
    inputs: [
      { name: 'player', type: 'address' },
      { name: 'token',  type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'usdToEthWei', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'usdWei', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'usdToUsdt', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'usdWei', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },

  // ── Deposits ─────────────────────────────────────────────────────────────────
  {
    name: 'depositETH', type: 'function', stateMutability: 'payable',
    inputs: [], outputs: [],
  },
  {
    name: 'depositUSDT', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }], outputs: [],
  },

  // ── Withdraw ──────────────────────────────────────────────────────────────────
  {
    name: 'withdraw', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'token',  type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },

  // ── Game lock / settle (poker contract only) ──────────────────────────────────
  {
    name: 'lockForGame', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'player',      type: 'address' },
      { name: 'usdValueWei', type: 'uint256' },
      { name: 'token',       type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'settleGame', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'players',       type: 'address[]' },
      { name: 'deltaUSD',      type: 'int256[]'  },
      { name: 'token',         type: 'address'   },
      { name: 'rakeRecipient', type: 'address'   },
      { name: 'rakeBps',       type: 'uint256'   },
    ],
    outputs: [],
  },

  // ── Admin ────────────────────────────────────────────────────────────────────
  {
    name: 'setPokerAuthorized', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'poker',      type: 'address' },
      { name: 'authorized', type: 'bool'    },
    ],
    outputs: [],
  },

  // ── Events ────────────────────────────────────────────────────────────────────
  {
    name: 'Deposit', type: 'event',
    inputs: [
      { name: 'player', type: 'address', indexed: true },
      { name: 'token',  type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'Withdraw', type: 'event',
    inputs: [
      { name: 'player', type: 'address', indexed: true },
      { name: 'token',  type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'Locked', type: 'event',
    inputs: [
      { name: 'player',      type: 'address', indexed: true  },
      { name: 'token',       type: 'address', indexed: true  },
      { name: 'tokenAmount', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'Unlocked', type: 'event',
    inputs: [
      { name: 'player',      type: 'address', indexed: true  },
      { name: 'token',       type: 'address', indexed: true  },
      { name: 'tokenAmount', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'GameSettled', type: 'event',
    inputs: [
      { name: 'players',   type: 'address[]', indexed: false },
      { name: 'deltaUSD',  type: 'int256[]',  indexed: false },
      { name: 'token',     type: 'address',   indexed: true  },
      { name: 'rakeToken', type: 'uint256',   indexed: false },
    ],
  },
] as const;

// ─── ERC-20 minimal ABI (for USDT approve call) ───────────────────────────────

export const ERC20_APPROVE_ABI = [
  {
    name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount',  type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance', type: 'function', stateMutability: 'view',
    inputs: [
      { name: 'owner',   type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;
