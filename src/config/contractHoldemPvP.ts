export const HOLDEM_PVP_CONTRACT_ADDRESS = (
  import.meta.env.VITE_HOLDEM_PVP_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000'
) as `0x${string}`;

export const HoldemPvPState = {
  OPEN:              0,
  BOTH_SEATED:       1,
  PREFLOP:           2,
  FLOP:              3,
  TURN:              4,
  RIVER:             5,
  AWAITING_SHOWDOWN: 6,
  COMPLETE:          7,
} as const;

export const CIPHER_HOLDEM_PVP_ABI = [
  // Constants
  { name: 'SB', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'BB', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'BET_SIZE', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'MIN_BUY_IN', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'MAX_BUY_IN', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'INITIAL_BALANCE', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },

  // View
  { name: 'getBalance', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'getBalanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'getMySeat', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'getOpenTableCount', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  {
    name: 'getOpenTables', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
  {
    name: 'getTableInfo', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [
      { name: 'player1', type: 'address' }, { name: 'player2', type: 'address' },
      { name: 'state', type: 'uint8' }, { name: 'pot', type: 'uint256' },
      { name: 'handCount', type: 'uint256' }, { name: 'buyIn', type: 'uint256' },
      { name: 'isPrivate', type: 'bool' }, { name: 'nextToAct', type: 'address' },
    ],
  },
  {
    name: 'getMyCards', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [{ name: 'c0', type: 'uint256' }, { name: 'c1', type: 'uint256' }],
  },
  {
    name: 'getOpponentCards', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [{ name: 'c0', type: 'uint256' }, { name: 'c1', type: 'uint256' }],
  },
  {
    name: 'getCommunityCards', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [
      { name: 'c0', type: 'uint256' }, { name: 'c1', type: 'uint256' },
      { name: 'c2', type: 'uint256' }, { name: 'c3', type: 'uint256' },
      { name: 'c4', type: 'uint256' },
    ],
  },
  {
    name: 'getResult', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [{ name: 'winner', type: 'address' }, { name: 'pot', type: 'uint256' }],
  },
  {
    name: 'getRoundBets', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [{ name: 'p1Bet', type: 'uint256' }, { name: 'p2Bet', type: 'uint256' }],
  },
  { name: 'getInviteCode', type: 'function', stateMutability: 'view', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [{ name: '', type: 'bytes32' }] },
  { name: 'isShowdownReady', type: 'function', stateMutability: 'view', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },

  // View - betting state
  {
    name: 'getBettingState', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tid', type: 'uint256' }],
    outputs: [
      { name: 'p1Bet', type: 'uint256' }, { name: 'p2Bet', type: 'uint256' },
      { name: 'curBet', type: 'uint256' }, { name: 'minRaise', type: 'uint256' },
      { name: 'p1AllIn', type: 'bool' }, { name: 'p2AllIn', type: 'bool' },
      { name: 'actions', type: 'uint8' }, { name: 'turnBlock', type: 'uint256' },
    ],
  },

  // Mutating
  { name: 'createTable', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'buyIn', type: 'uint256' }, { name: 'isPrivate', type: 'bool' }], outputs: [{ name: 'tableId', type: 'uint256' }] },
  { name: 'joinTable', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  { name: 'joinByInviteCode', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }, { name: 'code', type: 'bytes32' }], outputs: [] },
  { name: 'leaveTable', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  { name: 'startHand', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  { name: 'act', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }, { name: 'action', type: 'uint8' }], outputs: [] },
  {
    name: 'submitRound', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'tableId', type: 'uint256' },
      { name: 'actions', type: 'uint8[]' },
      { name: 'signatures', type: 'bytes[]' },
      { name: 'signers', type: 'address[]' },
    ],
    outputs: [],
  },
  { name: 'postSignedAction', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }, { name: 'action', type: 'uint8' }, { name: 'signature', type: 'bytes' }], outputs: [] },
  { name: 'getDomainSeparator', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'bytes32' }] },
  { name: 'getActionTypeHash', type: 'function', stateMutability: 'pure', inputs: [], outputs: [{ name: '', type: 'bytes32' }] },
  { name: 'fold', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  { name: 'unseat', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  { name: 'claimAbandoned', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  { name: 'checkTimeout', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  { name: 'computeShowdown', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  { name: 'computeShowdownP1', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  { name: 'computeShowdownP2', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  { name: 'resolveShowdown', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },

  // Events
  { name: 'TableCreated', type: 'event', inputs: [{ name: 'tableId', type: 'uint256', indexed: true }, { name: 'creator', type: 'address', indexed: false }, { name: 'buyIn', type: 'uint256', indexed: false }, { name: 'isPrivate', type: 'bool', indexed: false }] },
  { name: 'PlayerJoined', type: 'event', inputs: [{ name: 'tableId', type: 'uint256', indexed: true }, { name: 'player', type: 'address', indexed: false }] },
  { name: 'PlayerLeft', type: 'event', inputs: [{ name: 'tableId', type: 'uint256', indexed: true }, { name: 'player', type: 'address', indexed: false }] },
  { name: 'HandStarted', type: 'event', inputs: [{ name: 'tableId', type: 'uint256', indexed: true }, { name: 'handId', type: 'uint256', indexed: false }] },
  { name: 'PlayerAction', type: 'event', inputs: [{ name: 'tableId', type: 'uint256', indexed: true }, { name: 'player', type: 'address', indexed: false }, { name: 'action', type: 'string', indexed: false }] },
  { name: 'CommunityRevealed', type: 'event', inputs: [{ name: 'tableId', type: 'uint256', indexed: true }, { name: 'count', type: 'uint8', indexed: false }] },
  { name: 'HandComplete', type: 'event', inputs: [{ name: 'tableId', type: 'uint256', indexed: true }, { name: 'winner', type: 'address', indexed: false }, { name: 'pot', type: 'uint256', indexed: false }] },
  { name: 'PlayerTimedOut', type: 'event', inputs: [{ name: 'tableId', type: 'uint256', indexed: true }, { name: 'player', type: 'address', indexed: false }] },
  { name: 'SignedActionPosted', type: 'event', inputs: [{ name: 'tableId', type: 'uint256', indexed: true }, { name: 'player', type: 'address', indexed: true }, { name: 'action', type: 'uint8', indexed: false }, { name: 'signature', type: 'bytes', indexed: false }] },
] as const;
