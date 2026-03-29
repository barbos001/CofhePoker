export const CONTRACT_ADDRESS = (
  import.meta.env.VITE_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000'
) as `0x${string}`;

export const CHAIN_ID = 11155111; // Ethereum Sepolia

export const CIPHER_POKER_ABI = [
  // View / pure
  {
    name: 'ANTE',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'INITIAL_BALANCE',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getBalance',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getBalanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'addr', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getMyTableId',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getTableInfo',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [
      { name: 'player',    type: 'address' },
      { name: 'state',     type: 'uint8' },
      { name: 'pot',       type: 'uint256' },
      { name: 'handCount', type: 'uint256' },
    ],
  },
  {
    name: 'getHandResult',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [
      { name: 'winner',       type: 'address' },
      { name: 'pot',          type: 'uint256' },
      { name: 'playerPlayed', type: 'bool' },
    ],
  },
  {
    name: 'getMyCards',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [
      { name: 'c0', type: 'uint256' },
      { name: 'c1', type: 'uint256' },
      { name: 'c2', type: 'uint256' },
    ],
  },
  {
    name: 'getBotCards',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [
      { name: 'c0', type: 'uint256' },
      { name: 'c1', type: 'uint256' },
      { name: 'c2', type: 'uint256' },
    ],
  },
  {
    name: 'isBotDecisionReady',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'isShowdownReady',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'tableOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // State-mutating
  {
    name: 'createTable',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [{ name: 'tableId', type: 'uint256' }],
  },
  {
    name: 'startHand',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'play',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'fold',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'resolveBotDecision',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'resolveShowdown',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [],
  },
  // Events
  {
    name: 'TableCreated',
    type: 'event',
    inputs: [
      { name: 'tableId', type: 'uint256', indexed: true },
      { name: 'player',  type: 'address', indexed: true },
    ],
  },
  {
    name: 'HandStarted',
    type: 'event',
    inputs: [
      { name: 'tableId', type: 'uint256', indexed: true },
      { name: 'handId',  type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'PlayerAction',
    type: 'event',
    inputs: [
      { name: 'tableId', type: 'uint256', indexed: true },
      { name: 'action',  type: 'string',  indexed: false },
    ],
  },
  {
    name: 'BotAction',
    type: 'event',
    inputs: [
      { name: 'tableId', type: 'uint256', indexed: true },
      { name: 'action',  type: 'string',  indexed: false },
    ],
  },
  {
    name: 'HandComplete',
    type: 'event',
    inputs: [
      { name: 'tableId', type: 'uint256', indexed: true },
      { name: 'winner',  type: 'address', indexed: false },
      { name: 'pot',     type: 'uint256', indexed: false },
    ],
  },
] as const;

export const GameState = {
  WAITING:           0,
  PLAYER_TURN:       1,
  AWAITING_BOT:      2,
  AWAITING_SHOWDOWN: 3,
  COMPLETE:          4,
} as const;
export type GameStateValue = (typeof GameState)[keyof typeof GameState];
