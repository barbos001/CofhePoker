// ── Deployed address (updated by scripts/deployHoldem.cts automatically) ──
export const HOLDEM_CONTRACT_ADDRESS = (
  import.meta.env.VITE_HOLDEM_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000'
) as `0x${string}`;

// ── Game states (mirrors Solidity GameState enum) ──
export const HoldemState = {
  WAITING:            0,
  PREFLOP:            1,
  AWAITING_BOT_PF:    2,
  FLOP:               3,
  AWAITING_BOT_FLOP:  4,
  TURN:               5,
  AWAITING_BOT_TURN:  6,
  RIVER:              7,
  AWAITING_BOT_RIVER: 8,
  AWAITING_SHOWDOWN:  9,
  COMPLETE:           10,
} as const;
export type HoldemStateValue = (typeof HoldemState)[keyof typeof HoldemState];

// ── ABI ─────────────────────────────────────────────────────────────
export const CIPHER_HOLDEM_ABI = [
  // ── Constants ──
  { name: 'SB',   type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'BB',   type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'BET_SIZE', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'INITIAL_BALANCE', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },

  // ── View functions ──
  { name: 'getBalance',    type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'getBalanceOf',  type: 'function', stateMutability: 'view', inputs: [{ name: 'addr', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'getMyTableId',  type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  {
    name: 'getTableInfo', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [
      { name: 'player',         type: 'address' },
      { name: 'state',          type: 'uint8' },
      { name: 'pot',            type: 'uint256' },
      { name: 'handCount',      type: 'uint256' },
      { name: 'waitingForCall', type: 'bool' },
      { name: 'playerBet',      type: 'bool' },
    ],
  },
  {
    name: 'getHandResult', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [
      { name: 'winner', type: 'address' },
      { name: 'pot',    type: 'uint256' },
    ],
  },
  {
    name: 'getMyCards', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [
      { name: 'c0', type: 'uint256' },
      { name: 'c1', type: 'uint256' },
    ],
  },
  {
    name: 'getCommunityCards', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [
      { name: 'c0', type: 'uint256' },
      { name: 'c1', type: 'uint256' },
      { name: 'c2', type: 'uint256' },
      { name: 'c3', type: 'uint256' },
      { name: 'c4', type: 'uint256' },
    ],
  },
  {
    name: 'getBotCards', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [
      { name: 'c0', type: 'uint256' },
      { name: 'c1', type: 'uint256' },
    ],
  },

  // ── Poll functions ──
  { name: 'isBotPfReady',    type: 'function', stateMutability: 'view', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'isBotFlopReady',  type: 'function', stateMutability: 'view', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'isBotTurnReady',  type: 'function', stateMutability: 'view', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'isBotRiverReady', type: 'function', stateMutability: 'view', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'isShowdownReady', type: 'function', stateMutability: 'view', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'tableOf', type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },

  // ── State-mutating functions ──
  { name: 'createTable',   type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [{ name: 'tableId', type: 'uint256' }] },
  { name: 'startHand',     type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  { name: 'actPreflop',    type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }, { name: 'action', type: 'uint8' }], outputs: [] },
  { name: 'actFlop',       type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }, { name: 'action', type: 'uint8' }], outputs: [] },
  { name: 'actTurn',       type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }, { name: 'action', type: 'uint8' }], outputs: [] },
  { name: 'actRiver',      type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }, { name: 'action', type: 'uint8' }], outputs: [] },
  { name: 'callBot',       type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  { name: 'fold',          type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  { name: 'resolveBotPreFlop', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  { name: 'resolveBotFlop',    type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  { name: 'resolveBotTurn',    type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  { name: 'resolveBotRiver',   type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  { name: 'computeShowdownP1', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  { name: 'computeShowdownP2', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  { name: 'resolveShowdown',   type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },

  // ── Events ──
  { name: 'TableCreated',     type: 'event', inputs: [{ name: 'tableId', type: 'uint256', indexed: true }, { name: 'player', type: 'address', indexed: false }] },
  { name: 'HandStarted',      type: 'event', inputs: [{ name: 'tableId', type: 'uint256', indexed: true }, { name: 'handId', type: 'uint256', indexed: false }] },
  { name: 'PlayerAction',     type: 'event', inputs: [{ name: 'tableId', type: 'uint256', indexed: true }, { name: 'action', type: 'string', indexed: false }] },
  { name: 'BotAction',        type: 'event', inputs: [{ name: 'tableId', type: 'uint256', indexed: true }, { name: 'action', type: 'string', indexed: false }] },
  { name: 'CommunityRevealed', type: 'event', inputs: [{ name: 'tableId', type: 'uint256', indexed: true }, { name: 'count', type: 'uint8', indexed: false }] },
  { name: 'HandComplete',     type: 'event', inputs: [{ name: 'tableId', type: 'uint256', indexed: true }, { name: 'winner', type: 'address', indexed: false }, { name: 'pot', type: 'uint256', indexed: false }] },
] as const;
