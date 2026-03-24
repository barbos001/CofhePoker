// ── Deployed address (updated by scripts/deployPvP.cts automatically) ──
export const PVP_CONTRACT_ADDRESS = (
  import.meta.env.VITE_PVP_CONTRACT_ADDRESS || '0x76627a7A86C4Da6386f09b52cc8EC14C5EaC247d'
) as `0x${string}`;

// ── State enum (mirrors Solidity PvPState) ──
export const PvPState = {
  OPEN:               0,
  BOTH_SEATED:        1,
  DEALING:            2,
  ACTING:             3,
  AWAITING_SHOWDOWN:  4,
  COMPLETE:           5,
} as const;
export type PvPStateValue = (typeof PvPState)[keyof typeof PvPState];

// ── ABI ─────────────────────────────────────────────────────────────
export const CIPHER_POKER_PVP_ABI = [
  // ── Lobby ──
  {
    name: 'createPvPTable',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'buyIn', type: 'uint256' },
      { name: 'isPrivate', type: 'bool' },
    ],
    outputs: [{ name: 'tableId', type: 'uint256' }],
  },
  {
    name: 'joinTable',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'joinByInviteCode',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tableId', type: 'uint256' },
      { name: 'code', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'leaveTable',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'getOpenTableCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getOpenTables',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'offset', type: 'uint256' },
      { name: 'limit', type: 'uint256' },
    ],
    outputs: [{ name: 'ids', type: 'uint256[]' }],
  },

  // ── Friends ──
  {
    name: 'sendFriendRequest',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }],
    outputs: [],
  },
  {
    name: 'acceptFriendRequest',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'from', type: 'address' }],
    outputs: [],
  },
  {
    name: 'removeFriend',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'friend', type: 'address' }],
    outputs: [],
  },
  {
    name: 'getFriends',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'address[]' }],
  },
  {
    name: 'isFriend',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: '', type: 'address' },
      { name: '', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'pendingRequest',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: '', type: 'address' },
      { name: '', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },

  // ── Invites ──
  {
    name: 'sendGameInvite',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'tableId', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'acceptGameInvite',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'from', type: 'address' }],
    outputs: [],
  },
  {
    name: 'declineGameInvite',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'from', type: 'address' }],
    outputs: [],
  },
  {
    name: 'getInviteCode',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bytes32' }],
  },

  // ── PvP Game ──
  {
    name: 'startPvPHand',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'pvpAct',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tableId', type: 'uint256' },
      { name: 'plays', type: 'bool' },
    ],
    outputs: [],
  },
  {
    name: 'resolvePvPShowdown',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [],
  },

  // ── View ──
  {
    name: 'getPvPTableInfo',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [
      { name: 'player1',   type: 'address' },
      { name: 'player2',   type: 'address' },
      { name: 'state',     type: 'uint8' },
      { name: 'pot',       type: 'uint256' },
      { name: 'handCount', type: 'uint256' },
      { name: 'buyIn',     type: 'uint256' },
      { name: 'isPrivate', type: 'bool' },
      { name: 'createdAt', type: 'uint256' },
    ],
  },
  {
    name: 'getMyPvPCards',
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
    name: 'getOpponentCards',
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
    name: 'getPvPResult',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [
      { name: 'winner', type: 'address' },
      { name: 'pot',    type: 'uint256' },
    ],
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
    name: 'getMySeat',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'hasPlayerActed',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'tableId', type: 'uint256' },
      { name: 'player', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'isPvPShowdownReady',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balances',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'seatOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },

  // ── Events ──
  { name: 'PvPTableCreated', type: 'event', inputs: [
    { name: 'tableId', type: 'uint256', indexed: true },
    { name: 'creator', type: 'address', indexed: true },
    { name: 'buyIn',   type: 'uint256', indexed: false },
    { name: 'isPrivate', type: 'bool',  indexed: false },
  ]},
  { name: 'PlayerJoined', type: 'event', inputs: [
    { name: 'tableId', type: 'uint256', indexed: true },
    { name: 'player',  type: 'address', indexed: true },
  ]},
  { name: 'PlayerLeft', type: 'event', inputs: [
    { name: 'tableId', type: 'uint256', indexed: true },
    { name: 'player',  type: 'address', indexed: true },
  ]},
  { name: 'PvPHandStarted', type: 'event', inputs: [
    { name: 'tableId', type: 'uint256', indexed: true },
    { name: 'handId',  type: 'uint256', indexed: false },
  ]},
  { name: 'PvPAction', type: 'event', inputs: [
    { name: 'tableId', type: 'uint256', indexed: true },
    { name: 'player',  type: 'address', indexed: true },
    { name: 'action',  type: 'string',  indexed: false },
  ]},
  { name: 'PvPHandComplete', type: 'event', inputs: [
    { name: 'tableId', type: 'uint256', indexed: true },
    { name: 'winner',  type: 'address', indexed: false },
    { name: 'pot',     type: 'uint256', indexed: false },
  ]},
  { name: 'FriendRequestSent', type: 'event', inputs: [
    { name: 'from', type: 'address', indexed: true },
    { name: 'to',   type: 'address', indexed: true },
  ]},
  { name: 'FriendRequestAccepted', type: 'event', inputs: [
    { name: 'from', type: 'address', indexed: true },
    { name: 'to',   type: 'address', indexed: true },
  ]},
  { name: 'FriendRemoved', type: 'event', inputs: [
    { name: 'player',   type: 'address', indexed: true },
    { name: 'exFriend', type: 'address', indexed: true },
  ]},
  { name: 'GameInviteSent', type: 'event', inputs: [
    { name: 'from',    type: 'address', indexed: true },
    { name: 'to',      type: 'address', indexed: true },
    { name: 'tableId', type: 'uint256', indexed: true },
  ]},
  { name: 'GameInviteAccepted', type: 'event', inputs: [
    { name: 'from',    type: 'address', indexed: true },
    { name: 'to',      type: 'address', indexed: true },
    { name: 'tableId', type: 'uint256', indexed: true },
  ]},
  { name: 'GameInviteDeclined', type: 'event', inputs: [
    { name: 'from', type: 'address', indexed: true },
    { name: 'to',   type: 'address', indexed: true },
  ]},
] as const;
