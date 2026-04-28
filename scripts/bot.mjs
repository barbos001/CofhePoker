/**
 * CipherPoker headless bot — for testing PvP flow without a UI.
 *
 * Usage:
 *   PRIVATE_KEY=0x... TABLE_ID=123 node scripts/bot.mjs     # join existing table
 *   PRIVATE_KEY=0x... CREATE=1      node scripts/bot.mjs     # create a new table
 *
 * The bot always calls/checks. At showdown it calls computeShowdown.
 * Requires: node >= 18, viem installed (npm i viem)
 */

import { createWalletClient, createPublicClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

// ── Config ────────────────────────────────────────────────────────────────────

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL     = process.env.RPC_URL     || 'https://rpc.sepolia.org';
const CONTRACT    = process.env.PVP_CONTRACT || process.env.VITE_HOLDEM_PVP_CONTRACT_ADDRESS;
const TABLE_ID    = process.env.TABLE_ID ? Number(process.env.TABLE_ID) : null;
const DO_CREATE   = !!process.env.CREATE;
const BUY_IN      = Number(process.env.BUY_IN || 25);

if (!PRIVATE_KEY) { console.error('Missing PRIVATE_KEY env var'); process.exit(1); }
if (!CONTRACT || CONTRACT === '0x0000000000000000000000000000000000000000') {
  console.error('Missing PVP_CONTRACT or VITE_HOLDEM_PVP_CONTRACT_ADDRESS env var');
  process.exit(1);
}

const LOG = (...a) => console.log(`[BOT ${new Date().toISOString().slice(11,19)}]`, ...a);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── ABI (minimal) ─────────────────────────────────────────────────────────────

const ABI = parseAbi([
  'function createTable(uint256 buyIn, bool isPrivate) returns (uint256)',
  'function joinTable(uint256 tableId)',
  'function leaveTable(uint256 tableId)',
  'function startHand(uint256 tableId)',
  'function act(uint256 tableId, uint8 action)',
  'function fold(uint256 tableId)',
  'function computeShowdown(uint256 tableId)',
  'function resolveShowdown(uint256 tableId)',
  'function checkTimeout(uint256 tableId)',
  'function getMySeat() view returns (uint256)',
  'function getBalance() view returns (uint256)',
  'function getBalanceOf(address a) view returns (uint256)',
  'function getTableInfo(uint256 tableId) view returns (address player1, address player2, uint8 state, uint256 pot, uint256 handCount, uint256 buyIn, bool isPrivate, address nextToAct)',
  'function getBettingState(uint256 tid) view returns (uint256 p1Bet, uint256 p2Bet, uint256 curBet, uint256 minRaise, bool p1AllIn, bool p2AllIn, uint8 actions, uint256 turnBlock)',
  'function isShowdownReady(uint256 tableId) view returns (bool)',
  'function getResult(uint256 tableId) view returns (address winner, uint256 pot)',
]);

const STATE = { OPEN: 0, BOTH_SEATED: 1, PREFLOP: 2, FLOP: 3, TURN: 4, RIVER: 5, AWAITING_SHOWDOWN: 6, COMPLETE: 7 };
const STATE_NAMES = { 0: 'OPEN', 1: 'BOTH_SEATED', 2: 'PREFLOP', 3: 'FLOP', 4: 'TURN', 5: 'RIVER', 6: 'AWAITING_SHOWDOWN', 7: 'COMPLETE' };
const ACTION = { CHECK: 0, BET: 1, RAISE: 2, FOLD: 3, CALL: 4, ALLIN: 5 };

// ── Clients ───────────────────────────────────────────────────────────────────

const account = privateKeyToAccount(PRIVATE_KEY);
const transport = http(RPC_URL);

const publicClient = createPublicClient({ chain: sepolia, transport });
const walletClient = createWalletClient({ chain: sepolia, account, transport });

const read  = (fn, args = []) => publicClient.readContract({ address: CONTRACT, abi: ABI, functionName: fn, args, account: account.address });
const write = async (fn, args = []) => {
  const hash = await walletClient.writeContract({ address: CONTRACT, abi: ABI, functionName: fn, args });
  LOG(`TX ${fn}: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (receipt.status !== 'success') throw new Error(`${fn} reverted`);
  return receipt;
};

// ── Bot logic ─────────────────────────────────────────────────────────────────

async function getTableState(tableId) {
  const info = await read('getTableInfo', [BigInt(tableId)]);
  return {
    player1:   info[0],
    player2:   info[1],
    state:     info[2],
    pot:       Number(info[3]),
    handCount: Number(info[4]),
    buyIn:     Number(info[5]),
    isPrivate: info[6],
    nextToAct: info[7],
  };
}

async function actInTurn(tableId, myAddr) {
  const bs = await read('getBettingState', [BigInt(tableId)]).catch(() => null);
  if (!bs) { LOG('getBettingState unavailable — checking'); await write('act', [BigInt(tableId), ACTION.CHECK]); return; }

  const tableInfo = await getTableState(tableId);
  const isP1 = tableInfo.player1.toLowerCase() === myAddr.toLowerCase();
  const myBet = Number(isP1 ? bs[0] : bs[1]);
  const oppBet = Number(isP1 ? bs[1] : bs[0]);

  if (oppBet > myBet) {
    LOG(`Call ${oppBet - myBet} chips`);
    await write('act', [BigInt(tableId), ACTION.CALL]);
  } else {
    LOG('Check');
    await write('act', [BigInt(tableId), ACTION.CHECK]);
  }
}

async function runBot() {
  LOG(`Bot address: ${account.address}`);

  const balance = await read('getBalance').catch(() => null);
  if (balance !== null) LOG(`Chip balance: ${Number(balance)}`);

  let tableId = TABLE_ID;

  // ── Create or join ──────────────────────────────────────────────────────────
  if (DO_CREATE) {
    LOG(`Creating table (buy-in: ${BUY_IN})...`);
    await write('createTable', [BigInt(BUY_IN), false]);
    const seat = Number(await read('getMySeat'));
    if (seat === 0) { LOG('Failed to get seat'); process.exit(1); }
    tableId = seat;
    LOG(`Created table #${tableId}. Waiting for opponent...`);
  } else if (tableId) {
    const info = await getTableState(tableId);
    if (info.state !== STATE.OPEN) {
      LOG(`Table #${tableId} state=${STATE_NAMES[info.state]} — checking existing seat`);
      const mySeate = Number(await read('getMySeat'));
      if (mySeate !== tableId) { LOG('Not seated at this table'); process.exit(1); }
    } else {
      LOG(`Joining table #${tableId}...`);
      await write('joinTable', [BigInt(tableId)]);
      LOG('Joined');
    }
  } else {
    // Find any open table
    const openCount = Number(await read('getOpenTableCount'));
    if (openCount === 0) {
      LOG('No open tables. Set CREATE=1 to create one.');
      process.exit(0);
    }
    const ids = await read('getOpenTables', [0n, BigInt(Math.min(openCount, 5))]);
    const tid = Number(ids[0]);
    LOG(`Joining first open table #${tid}...`);
    await write('joinTable', [BigInt(tid)]);
    tableId = tid;
    LOG('Joined');
  }

  // ── Main game loop ──────────────────────────────────────────────────────────
  let handsPlayed = 0;
  const MAX_HANDS = Number(process.env.MAX_HANDS || 3);

  while (handsPlayed < MAX_HANDS) {
    LOG(`Polling table #${tableId}...`);
    const info = await getTableState(tableId);
    LOG(`State: ${STATE_NAMES[info.state]}, Pot: ${info.pot}, NextToAct: ${info.nextToAct}`);

    const myAddr = account.address.toLowerCase();
    const isMyTurn = info.nextToAct.toLowerCase() === myAddr;

    if (info.state === STATE.OPEN) {
      LOG('Waiting for opponent to join...');
      await sleep(8000);
      continue;
    }

    if (info.state === STATE.BOTH_SEATED) {
      const isP1 = info.player1.toLowerCase() === myAddr;
      if (isP1) {
        LOG('Both seated. Starting hand...');
        await write('startHand', [BigInt(tableId)]);
      } else {
        LOG('Both seated. Waiting for P1 to start hand...');
        await sleep(5000);
      }
      continue;
    }

    if (info.state >= STATE.PREFLOP && info.state <= STATE.RIVER) {
      if (isMyTurn) {
        LOG(`My turn (${STATE_NAMES[info.state]})`);
        await actInTurn(tableId, myAddr);
      } else {
        LOG(`Waiting for opponent (${STATE_NAMES[info.state]})...`);
        // Check if opponent timed out (>50 blocks since their turn)
        try {
          const bs = await read('getBettingState', [BigInt(tableId)]);
          const turnBlock = Number(bs[7]);
          const currentBlock = Number(await publicClient.getBlockNumber());
          if (currentBlock - turnBlock >= 50) {
            LOG('Opponent timed out! Claiming...');
            await write('checkTimeout', [BigInt(tableId)]);
          }
        } catch { /* ignore */ }
      }
      await sleep(6000);
      continue;
    }

    if (info.state === STATE.AWAITING_SHOWDOWN) {
      LOG('Computing showdown...');
      await write('computeShowdown', [BigInt(tableId)]);

      LOG('Waiting for FHE decrypt...');
      for (let i = 0; i < 30; i++) {
        const ready = await read('isShowdownReady', [BigInt(tableId)]);
        if (ready) break;
        await sleep(5000);
      }

      LOG('Resolving showdown...');
      await write('resolveShowdown', [BigInt(tableId)]);
      await sleep(3000);
      continue;
    }

    if (info.state === STATE.COMPLETE) {
      const [winner, pot] = await read('getResult', [BigInt(tableId)]);
      const ZERO = '0x0000000000000000000000000000000000000000';
      if (winner === ZERO) {
        LOG(`Hand ${handsPlayed + 1}: PUSH (pot returned)`);
      } else if (winner.toLowerCase() === myAddr) {
        LOG(`Hand ${handsPlayed + 1}: WON pot=${pot}`);
      } else {
        LOG(`Hand ${handsPlayed + 1}: LOST pot=${pot}`);
      }
      handsPlayed++;

      if (handsPlayed < MAX_HANDS) {
        LOG('Starting next hand...');
        const isP1 = info.player1.toLowerCase() === myAddr;
        if (isP1) {
          await sleep(2000);
          await write('startHand', [BigInt(tableId)]);
        } else {
          await sleep(5000); // wait for P1 to start
        }
      }
      continue;
    }

    await sleep(4000);
  }

  LOG(`Bot finished after ${handsPlayed} hand(s)`);
  const finalBalance = await read('getBalance').catch(() => null);
  if (finalBalance !== null) LOG(`Final chip balance: ${Number(finalBalance)}`);
  process.exit(0);
}

runBot().catch(e => { console.error('[BOT ERROR]', e); process.exit(1); });
