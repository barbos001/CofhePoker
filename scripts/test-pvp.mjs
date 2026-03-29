/**
 * PvP Hold'em test script — two players, full hand flow.
 * Usage: node scripts/test-pvp.mjs
 */
import 'dotenv/config';
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const CONTRACT = '0x309Dd767C98eb52C84ff44389A2066385b9C27e9';
const RPC = 'https://ethereum-sepolia-rpc.publicnode.com';

const PK1 = process.env.PRIVATE_KEY;
const PK2 = process.env.PRIVATE_KEY_2;
if (!PK1 || !PK2) { console.error('Set PRIVATE_KEY and PRIVATE_KEY_2 in .env'); process.exit(1); }

const acct1 = privateKeyToAccount(PK1);
const acct2 = privateKeyToAccount(PK2);

const abi = parseAbi([
  'function getBalance() view returns (uint256)',
  'function getBalanceOf(address) view returns (uint256)',
  'function getMySeat() view returns (uint256)',
  'function getTableInfo(uint256) view returns (address,address,uint8,uint256,uint256,uint256,bool,address)',
  'function getBettingState(uint256) view returns (uint256,uint256,uint256,uint256,bool,bool,uint8,uint256)',
  'function getResult(uint256) view returns (address,uint256)',
  'function createTable(uint256,bool) returns (uint256)',
  'function joinTable(uint256)',
  'function leaveTable(uint256)',
  'function startHand(uint256)',
  'function act(uint256,uint8)',
  'function fold(uint256)',
  'function computeShowdown(uint256)',
  'function isShowdownReady(uint256) view returns (bool)',
  'function resolveShowdown(uint256)',
  'function checkTimeout(uint256)',
]);

const pub = createPublicClient({ chain: sepolia, transport: http(RPC) });
const w1 = createWalletClient({ account: acct1, chain: sepolia, transport: http(RPC) });
const w2 = createWalletClient({ account: acct2, chain: sepolia, transport: http(RPC) });

const log = (tag, ...args) => console.log(`\x1b[36m[${tag}]\x1b[0m`, ...args);
const err = (tag, ...args) => console.log(`\x1b[31m[${tag}]\x1b[0m`, ...args);

async function read(fn, args = [], account) {
  return pub.readContract({ address: CONTRACT, abi, functionName: fn, args, account });
}

async function write(wallet, fn, args = []) {
  log('TX', `${fn}(${args.join(',')}) from ${wallet.account.address.slice(0,8)}...`);
  const hash = await wallet.writeContract({ address: CONTRACT, abi, functionName: fn, args, gas: 2_500_000n });
  log('TX', `  hash: ${hash.slice(0,16)}... waiting...`);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status === 'reverted') {
    err('TX', `  REVERTED!`);
    throw new Error(`${fn} reverted`);
  }
  log('TX', `  confirmed ✓ (block ${receipt.blockNumber}, gas ${receipt.gasUsed})`);
  return receipt;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function printState(tableId) {
  const info = await read('getTableInfo', [BigInt(tableId)]);
  const stateNames = ['OPEN','BOTH_SEATED','PREFLOP','FLOP','TURN','RIVER','AWAIT_SHOWDOWN','COMPLETE'];
  const bal1 = await read('getBalanceOf', [acct1.address]);
  const bal2 = await read('getBalanceOf', [acct2.address]);
  log('STATE', `Table #${tableId}: ${stateNames[Number(info[2])]} | pot: ${info[3]} | nextToAct: ${String(info[7]).slice(0,8)}...`);
  log('STATE', `  P1(${acct1.address.slice(0,8)}): ${bal1} chips | P2(${acct2.address.slice(0,8)}): ${bal2} chips`);
  return info;
}

async function main() {
  log('INIT', `Player 1: ${acct1.address}`);
  log('INIT', `Player 2: ${acct2.address}`);

  // Check ETH balances
  const eth1 = await pub.getBalance({ address: acct1.address });
  const eth2 = await pub.getBalance({ address: acct2.address });
  log('INIT', `ETH P1: ${Number(eth1) / 1e18} | P2: ${Number(eth2) / 1e18}`);

  // Check if either player is already seated
  const seat1 = await read('getMySeat', [], acct1.address);
  const seat2 = await read('getMySeat', [], acct2.address);
  log('INIT', `Seats: P1=${seat1}, P2=${seat2}`);

  // Auto-leave stale tables
  if (Number(seat1) > 0) {
    log('CLEANUP', `P1 leaving table #${seat1}`);
    try { await write(w1, 'leaveTable', [seat1]); } catch(e) { err('CLEANUP', e.message); }
  }
  if (Number(seat2) > 0) {
    log('CLEANUP', `P2 leaving table #${seat2}`);
    try { await write(w2, 'leaveTable', [seat2]); } catch(e) { err('CLEANUP', e.message); }
  }

  // Step 1: Create table
  log('STEP', '1. Creating table (buyIn=10, public)...');
  await write(w1, 'createTable', [10n, false]);
  const newSeat = await read('getMySeat', [], acct1.address);
  const tableId = newSeat;
  log('STEP', `   Table #${tableId} created`);

  await printState(Number(tableId));

  // Step 2: Join table
  log('STEP', '2. P2 joining table...');
  await write(w2, 'joinTable', [tableId]);
  await printState(Number(tableId));

  // Step 3: Start hand
  log('STEP', '3. Starting hand...');
  await write(w1, 'startHand', [tableId]);
  const info = await printState(Number(tableId));

  // Step 4: Pre-flop
  // SB is first to act in preflop. SB posted 5, BB posted 10 → SB must CALL (action=4)
  log('STEP', '4. Pre-flop actions...');
  const nextToAct = String(info[7]).toLowerCase();
  const isP1Next = nextToAct === acct1.address.toLowerCase();
  const firstW = isP1Next ? w1 : w2;
  const secondW = isP1Next ? w2 : w1;

  // SB calls BB
  log('STEP', `   ${isP1Next ? 'P1' : 'P2'} calls (action=4)...`);
  await write(firstW, 'act', [tableId, 4]);

  // BB checks
  log('STEP', `   ${isP1Next ? 'P2' : 'P1'} checks (action=0)...`);
  await write(secondW, 'act', [tableId, 0]);

  await printState(Number(tableId));

  // Step 5: Flop — both check
  log('STEP', '5. Flop actions...');
  const info2 = await read('getTableInfo', [tableId]);
  const nextFlop = String(info2[7]).toLowerCase();
  const isP1Flop = nextFlop === acct1.address.toLowerCase();

  log('STEP', `   ${isP1Flop ? 'P1' : 'P2'} checks...`);
  await write(isP1Flop ? w1 : w2, 'act', [tableId, 0]);
  log('STEP', `   ${isP1Flop ? 'P2' : 'P1'} checks...`);
  await write(isP1Flop ? w2 : w1, 'act', [tableId, 0]);

  await printState(Number(tableId));

  // Step 6: Turn — both check
  log('STEP', '6. Turn actions...');
  const info3 = await read('getTableInfo', [tableId]);
  const nextTurn = String(info3[7]).toLowerCase();
  const isP1Turn = nextTurn === acct1.address.toLowerCase();

  log('STEP', `   ${isP1Turn ? 'P1' : 'P2'} checks...`);
  await write(isP1Turn ? w1 : w2, 'act', [tableId, 0]);
  log('STEP', `   ${isP1Turn ? 'P2' : 'P1'} checks...`);
  await write(isP1Turn ? w2 : w1, 'act', [tableId, 0]);

  await printState(Number(tableId));

  // Step 7: River — both check
  log('STEP', '7. River actions...');
  const info4 = await read('getTableInfo', [tableId]);
  const nextRiver = String(info4[7]).toLowerCase();
  const isP1River = nextRiver === acct1.address.toLowerCase();

  log('STEP', `   ${isP1River ? 'P1' : 'P2'} checks...`);
  await write(isP1River ? w1 : w2, 'act', [tableId, 0]);
  log('STEP', `   ${isP1River ? 'P2' : 'P1'} checks...`);
  await write(isP1River ? w2 : w1, 'act', [tableId, 0]);

  const infoSD = await printState(Number(tableId));

  // Step 8: Showdown
  log('STEP', '8. Computing showdown...');
  await write(w1, 'computeShowdown', [tableId]);

  log('STEP', '   Waiting for FHE decrypt (polling every 5s)...');
  for (let i = 0; i < 60; i++) {
    const ready = await read('isShowdownReady', [tableId]);
    if (ready) { log('STEP', `   Showdown ready after ${i * 5}s`); break; }
    if (i === 59) { err('STEP', '   TIMEOUT waiting for showdown'); return; }
    await sleep(5000);
  }

  // Step 9: Resolve
  log('STEP', '9. Resolving showdown...');
  await write(w1, 'resolveShowdown', [tableId]);

  await printState(Number(tableId));

  // Final result
  const result = await read('getResult', [tableId]);
  log('RESULT', `Winner: ${result[0]} | Pot: ${result[1]}`);
  if (result[0].toLowerCase() === acct1.address.toLowerCase()) {
    log('RESULT', '🏆 Player 1 WINS!');
  } else if (result[0].toLowerCase() === acct2.address.toLowerCase()) {
    log('RESULT', '🏆 Player 2 WINS!');
  } else {
    log('RESULT', '🤝 TIE');
  }
}

main().catch(e => { err('FATAL', e); process.exit(1); });
