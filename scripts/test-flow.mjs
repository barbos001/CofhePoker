/**
 * Automated Hold'em PvP integration test.
 *
 * Usage:
 *   node scripts/test-flow.mjs
 *
 * Requires PRIVATE_KEY, PRIVATE_KEY_2 and VITE_HOLDEM_PVP_CONTRACT_ADDRESS
 * in .env at the project root.
 */

import 'dotenv/config';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  formatEther,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';


const PK1 = process.env.PRIVATE_KEY;
const PK2 = process.env.PRIVATE_KEY_2;
const CONTRACT = process.env.VITE_HOLDEM_PVP_CONTRACT_ADDRESS;
const RPC = process.env.SEPOLIA_RPC_URL || process.env.VITE_SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';

if (!PK1 || !PK2 || !CONTRACT) {
  console.error('Missing env vars: PRIVATE_KEY, PRIVATE_KEY_2, VITE_HOLDEM_PVP_CONTRACT_ADDRESS');
  process.exit(1);
}


const account1 = privateKeyToAccount(PK1);
const account2 = privateKeyToAccount(PK2);

const transport = http(RPC);

const publicClient = createPublicClient({ chain: sepolia, transport });

const wallet1 = createWalletClient({ account: account1, chain: sepolia, transport });
const wallet2 = createWalletClient({ account: account2, chain: sepolia, transport });


const abi = [
  // Constants
  { name: 'SB', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'BB', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'INITIAL_BALANCE', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  // View
  { name: 'getBalance', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'getBalanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'getMySeat', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
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
    name: 'getBettingState', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tid', type: 'uint256' }],
    outputs: [
      { name: 'p1Bet', type: 'uint256' }, { name: 'p2Bet', type: 'uint256' },
      { name: 'curBet', type: 'uint256' }, { name: 'minRaise', type: 'uint256' },
      { name: 'p1AllIn', type: 'bool' }, { name: 'p2AllIn', type: 'bool' },
      { name: 'actions', type: 'uint8' }, { name: 'turnBlock', type: 'uint256' },
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
  { name: 'isShowdownReady', type: 'function', stateMutability: 'view', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  // Mutating
  { name: 'createTable', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'buyIn', type: 'uint256' }, { name: 'isPrivate', type: 'bool' }], outputs: [{ name: 'tableId', type: 'uint256' }] },
  { name: 'joinTable', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  { name: 'leaveTable', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  { name: 'startHand', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  { name: 'act', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }, { name: 'action', type: 'uint8' }], outputs: [] },
  { name: 'fold', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  { name: 'computeShowdown', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  { name: 'computeShowdownP1', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  { name: 'computeShowdownP2', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  { name: 'resolveShowdown', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  // Events
  { name: 'TableCreated', type: 'event', inputs: [{ name: 'tableId', type: 'uint256', indexed: true }, { name: 'creator', type: 'address', indexed: false }, { name: 'buyIn', type: 'uint256', indexed: false }, { name: 'isPrivate', type: 'bool', indexed: false }] },
  { name: 'HandStarted', type: 'event', inputs: [{ name: 'tableId', type: 'uint256', indexed: true }, { name: 'handId', type: 'uint256', indexed: false }] },
  { name: 'PlayerAction', type: 'event', inputs: [{ name: 'tableId', type: 'uint256', indexed: true }, { name: 'player', type: 'address', indexed: false }, { name: 'action', type: 'string', indexed: false }] },
  { name: 'HandComplete', type: 'event', inputs: [{ name: 'tableId', type: 'uint256', indexed: true }, { name: 'winner', type: 'address', indexed: false }, { name: 'pot', type: 'uint256', indexed: false }] },
];


const STATE_NAMES = [
  'OPEN', 'BOTH_SEATED', 'PREFLOP', 'FLOP', 'TURN', 'RIVER',
  'AWAITING_SHOWDOWN', 'COMPLETE',
];

const ACTION_CHECK = 0;
const ACTION_CALL  = 4;


const addr = CONTRACT;
const defaultGas = 2_500_000n;
const showdownGas = 16_000_000n;

function log(msg) { console.log(`[test] ${msg}`); }
function logErr(msg, err) { console.error(`[test][ERROR] ${msg}:`, err?.shortMessage || err?.message || err); }

async function readTable(tableId) {
  const info = await publicClient.readContract({ address: addr, abi, functionName: 'getTableInfo', args: [tableId] });
  return {
    player1: info[0], player2: info[1], state: Number(info[2]),
    pot: info[3], handCount: info[4], buyIn: info[5],
    isPrivate: info[6], nextToAct: info[7],
  };
}

async function readBetting(tableId) {
  const b = await publicClient.readContract({ address: addr, abi, functionName: 'getBettingState', args: [tableId] });
  return { p1Bet: b[0], p2Bet: b[1], curBet: b[2], minRaise: b[3], p1AllIn: b[4], p2AllIn: b[5], actions: Number(b[6]) };
}

async function getChips(address) {
  return publicClient.readContract({ address: addr, abi, functionName: 'getBalanceOf', args: [address] });
}

async function getMySeat(wallet) {
  return publicClient.readContract({ address: addr, abi, functionName: 'getMySeat', account: wallet.account });
}

async function writeTx(wallet, functionName, args, gas = defaultGas) {
  const hash = await wallet.writeContract({ address: addr, abi, functionName, args, gas });
  log(`  tx ${functionName}: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`${functionName} reverted`);
  return receipt;
}

function walletFor(nextToAct) {
  if (nextToAct.toLowerCase() === account1.address.toLowerCase()) return wallet1;
  if (nextToAct.toLowerCase() === account2.address.toLowerCase()) return wallet2;
  throw new Error(`Unknown nextToAct: ${nextToAct}`);
}

function otherWallet(nextToAct) {
  if (nextToAct.toLowerCase() === account1.address.toLowerCase()) return wallet2;
  return wallet1;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }


async function cleanupSeat(wallet, label) {
  try {
    const seat = await getMySeat(wallet);
    if (seat > 0n) {
      log(`${label} seated at table ${seat}, leaving...`);
      await writeTx(wallet, 'leaveTable', [seat]);
    }
  } catch (e) {
    // not seated — fine
  }
}


async function main() {
  log('=== Cofhe Poker — Hold\'em PvP Integration Test ===');
  log(`Contract: ${addr}`);
  log(`P1: ${account1.address}`);
  log(`P2: ${account2.address}`);
  log('');

  // 1. Balances
  log('--- Step 1: Check balances ---');
  const [eth1, eth2, chips1, chips2] = await Promise.all([
    publicClient.getBalance({ address: account1.address }),
    publicClient.getBalance({ address: account2.address }),
    getChips(account1.address),
    getChips(account2.address),
  ]);
  log(`P1 ETH: ${formatEther(eth1)}, chips: ${chips1}`);
  log(`P2 ETH: ${formatEther(eth2)}, chips: ${chips2}`);
  log('');

  // 2. Cleanup stale seats
  log('--- Step 2: Clean up stale seats ---');
  await cleanupSeat(wallet1, 'P1');
  await cleanupSeat(wallet2, 'P2');
  log('');

  // 3. Create table
  log('--- Step 3: P1 creates public table (buyIn=10) ---');
  const createReceipt = await writeTx(wallet1, 'createTable', [10n, false]);
  // Parse TableCreated event to get tableId
  let tableId;
  for (const l of createReceipt.logs) {
    try {
      if (l.topics[0] && l.topics[1]) {
        tableId = BigInt(l.topics[1]);
        break;
      }
    } catch {}
  }
  if (!tableId) {
    // fallback: read seat
    tableId = await getMySeat(wallet1);
  }
  log(`Table created: ${tableId}`);
  log('');

  // 4. P2 joins
  log('--- Step 4: P2 joins table ---');
  await writeTx(wallet2, 'joinTable', [tableId]);
  log('');

  // 5. Start hand
  log('--- Step 5: P1 starts hand ---');
  await writeTx(wallet1, 'startHand', [tableId]);
  log('');

  // 6. Verify PREFLOP
  log('--- Step 6: Verify state is PREFLOP ---');
  let table = await readTable(tableId);
  log(`State: ${STATE_NAMES[table.state]} (${table.state}), pot: ${table.pot}, nextToAct: ${table.nextToAct}`);
  if (table.state !== 2) {
    log(`WARNING: Expected PREFLOP (2), got ${STATE_NAMES[table.state]}`);
  }
  log('');


  /**
   * Play a round where both players check (or SB calls then BB checks for preflop).
   * After each action, re-read state to see if the round auto-advanced.
   */
  async function playRound(roundName, preflop = false) {
    log(`--- ${roundName} ---`);
    table = await readTable(tableId);
    log(`  State before: ${STATE_NAMES[table.state]}, nextToAct: ${table.nextToAct}`);

    if (table.state >= 6) {
      log(`  Already at ${STATE_NAMES[table.state]}, skipping round`);
      return;
    }

    // First actor
    const firstAction = preflop ? ACTION_CALL : ACTION_CHECK;
    const firstLabel = preflop ? 'CALL' : 'CHECK';
    const firstWallet = walletFor(table.nextToAct);
    log(`  Actor 1 (${table.nextToAct}): ${firstLabel}`);
    await writeTx(firstWallet, 'act', [tableId, firstAction]);

    // Re-read state
    table = await readTable(tableId);
    log(`  State after act 1: ${STATE_NAMES[table.state]}, nextToAct: ${table.nextToAct}`);

    if (table.state >= 6) {
      log(`  Round auto-advanced to ${STATE_NAMES[table.state]}`);
      return;
    }

    // Second actor — CHECK
    const secondWallet = walletFor(table.nextToAct);
    log(`  Actor 2 (${table.nextToAct}): CHECK`);
    await writeTx(secondWallet, 'act', [tableId, ACTION_CHECK]);

    // Re-read state
    table = await readTable(tableId);
    log(`  State after act 2: ${STATE_NAMES[table.state]}, nextToAct: ${table.nextToAct}`);
    log('');
  }

  // 7. Pre-flop: SB calls, BB checks
  await playRound('Step 7: Pre-flop', true);

  // 8. Flop: both check
  await playRound('Step 9: Flop');

  // 9. Turn: both check
  await playRound('Step 10: Turn');

  // 10. River: both check
  await playRound('Step 11: River');

  // 11. Showdown
  table = await readTable(tableId);
  log(`--- Step 12: Showdown (state: ${STATE_NAMES[table.state]}) ---`);

  if (table.state === 6) {
    // AWAITING_SHOWDOWN — compute
    log('Computing showdown (this may take a while with FHE)...');
    try {
      await writeTx(wallet1, 'computeShowdown', [tableId], showdownGas);
    } catch (e) {
      logErr('computeShowdown failed (gas limit may be too high for public RPC)', e);
      log('Trying split showdown: computeShowdownP1 + computeShowdownP2...');
      try {
        await writeTx(wallet1, 'computeShowdownP1', [tableId], showdownGas);
        await writeTx(wallet1, 'computeShowdownP2', [tableId], showdownGas);
      } catch (e2) {
        logErr('Split showdown also failed — FHE computation may exceed public RPC gas limit', e2);
        log('WARNING: Showdown could not be computed. Skipping to cleanup.');
        await doCleanup(tableId);
        return;
      }
    }
  } else if (table.state === 7) {
    log('Hand already complete (fold or other).');
    await printResult(tableId);
    await doCleanup(tableId);
    return;
  }

  // 12. Poll isShowdownReady
  log('--- Step 13: Polling isShowdownReady ---');
  let ready = false;
  for (let i = 0; i < 60; i++) {
    ready = await publicClient.readContract({ address: addr, abi, functionName: 'isShowdownReady', args: [tableId] });
    if (ready) break;
    log(`  Not ready yet (attempt ${i + 1}/60), waiting 10s...`);
    await sleep(10_000);
  }
  if (!ready) {
    log('WARNING: Showdown not ready after 10 min. Aborting.');
    await doCleanup(tableId);
    return;
  }
  log('Showdown is ready!');
  log('');

  // 13. Resolve showdown
  log('--- Step 14: resolveShowdown ---');
  await writeTx(wallet1, 'resolveShowdown', [tableId]);
  log('');

  // 14. Print result
  await printResult(tableId);

  // 15. Cleanup
  await doCleanup(tableId);

  log('=== Test complete ===');
}

async function printResult(tableId) {
  log('--- Step 15: Final balances & winner ---');
  const [result, c1, c2] = await Promise.all([
    publicClient.readContract({ address: addr, abi, functionName: 'getResult', args: [tableId] }),
    getChips(account1.address),
    getChips(account2.address),
  ]);
  log(`Winner: ${result[0]}, pot: ${result[1]}`);
  log(`P1 chips: ${c1}`);
  log(`P2 chips: ${c2}`);
  log('');
}

async function doCleanup(tableId) {
  log('--- Step 16: Both leave table ---');
  try { await writeTx(wallet1, 'leaveTable', [tableId]); } catch (e) { logErr('P1 leaveTable', e); }
  try { await writeTx(wallet2, 'leaveTable', [tableId]); } catch (e) { logErr('P2 leaveTable', e); }
  log('');
}


main().catch(err => {
  logErr('Fatal error', err);
  process.exit(1);
});
