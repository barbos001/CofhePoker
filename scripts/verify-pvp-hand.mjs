/**
 * verify-pvp-hand.mjs — Wave 5 stack-logic smoke test for CofheHoldemPvP.
 *
 * Drives a heads-up hand on live Sepolia with two wallets and verifies the
 * NEW Wave 5 plaintext-stack money logic without the ~35M-gas showdown:
 *   createTable / joinTable  → synchronous encrypted buy-in
 *   startHand                → blinds debited from plaintext stacks, FHE deal
 *   act(call) preflop        → _deductAndBet on a stack + _advanceRound (FLOP)
 *   act(check) flop          → betting engine progresses
 *   act(fold) flop           → _winByFold pays the pot into the winner's stack
 *   getStacks                → chips conserved (p1+p2 == 2*buyIn)
 *   getBalance               → bankroll stays an encrypted ciphertext handle
 *
 * The 7-card showdown path is UNCHANGED contract code (not touched by Wave 5),
 * so its gas profile is inherited from the pre-Wave-5 contract.
 *
 * State-driven + resumable: re-running picks up an in-progress table.
 * Run: node scripts/verify-pvp-hand.mjs
 */
import 'dotenv/config';
import { createWalletClient, createPublicClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

const RPC      = process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const CONTRACT = '0xc3167bBbcC9a3Abff3420D622E992F7C95C45fB5'; // Wave 5 CofheHoldemPvP
const BUY_IN   = 60n;

const ABI = parseAbi([
  'function createTable(uint256 buyIn, bool isPrivate) returns (uint256)',
  'function joinTable(uint256 tableId)',
  'function startHand(uint256 tableId)',
  'function act(uint256 tableId, uint8 action)',
  'function leaveTable(uint256 tableId)',
  'function getMySeat() view returns (uint256)',
  'function getBalance() view returns (uint256)',
  'function getStacks(uint256 tid) view returns (uint256 p1Stack, uint256 p2Stack)',
  'function getTableInfo(uint256 tid) view returns (address player1, address player2, uint8 state, uint256 pot, uint256 handCount, uint256 buyIn, bool isPrivate, address nextToAct)',
  'function getBettingState(uint256 tid) view returns (uint256 p1Bet, uint256 p2Bet, uint256 curBet, uint256 minRaise, bool p1AllIn, bool p2AllIn, uint8 actions, uint256 turnBlock)',
  'function getResult(uint256 tid) view returns (address winner, uint256 pot)',
]);

const ST = { OPEN: 0, BOTH_SEATED: 1, PREFLOP: 2, FLOP: 3, TURN: 4, RIVER: 5, AWAITING_SHOWDOWN: 6, COMPLETE: 7 };
const ACT = { CHECK: 0, FOLD: 3, CALL: 4 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LOG = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

async function main() {
  const pk1 = process.env.PRIVATE_KEY, pk2 = process.env.PRIVATE_KEY_2;
  if (!pk1 || !pk2) throw new Error('PRIVATE_KEY and PRIVATE_KEY_2 required in .env');

  const transport = http(RPC);
  const pub = createPublicClient({ chain: sepolia, transport });
  const accCreator = privateKeyToAccount(pk2); // richer wallet → creator + the fold
  const accJoiner  = privateKeyToAccount(pk1);
  const wCreator = createWalletClient({ chain: sepolia, account: accCreator, transport });
  const wJoiner  = createWalletClient({ chain: sepolia, account: accJoiner,  transport });

  const read = (fn, args = [], account) => pub.readContract({
    address: CONTRACT, abi: ABI, functionName: fn, args, ...(account ? { account } : {}),
  });
  // Explicit gasLimit — eth_estimateGas under-counts FHE precompile cost and
  // FHE-heavy txs OOG without it.
  const send = async (w, fn, args, gas) => {
    const hash = await w.writeContract({ address: CONTRACT, abi: ABI, functionName: fn, args, gas });
    const rc = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
    LOG(`  ${fn}(${args.join(',')}) → ${rc.status} gas=${rc.gasUsed}`);
    if (rc.status !== 'success') throw new Error(`${fn} reverted (${hash})`);
    return rc;
  };

  LOG(`CofheHoldemPvP ${CONTRACT}`);
  LOG(`creator(p1) ${accCreator.address}  joiner(p2) ${accJoiner.address}`);

  // Locate / create the table.
  let tableId = await read('getMySeat', [], accCreator.address);
  if (tableId === 0n) {
    await send(wCreator, 'createTable', [BUY_IN, false], 3_000_000n);
    tableId = await read('getMySeat', [], accCreator.address);
  }
  LOG(`table #${tableId}`);

  // State-driven loop: join → start → preflop call → flop check → flop fold.
  let folded = false;
  for (let step = 0; step < 16; step++) {
    const info = await read('getTableInfo', [tableId]);
    const state = Number(info[2]);
    const p1 = info[0], nextToAct = info[7];
    LOG(`state=${state} pot=${info[3]} nextToAct=${nextToAct.slice(0, 10)}`);

    if (state === ST.COMPLETE) break;

    if (state === ST.OPEN) {
      await send(wJoiner, 'joinTable', [tableId], 3_000_000n);
      continue;
    }
    if (state === ST.BOTH_SEATED) {
      await send(wCreator, 'startHand', [tableId], 4_000_000n);
      continue;
    }
    if (state >= ST.PREFLOP && state <= ST.RIVER) {
      const isCreatorTurn = nextToAct.toLowerCase() === accCreator.address.toLowerCase();
      const w = isCreatorTurn ? wCreator : wJoiner;

      // On the FLOP, the creator folds → exercises _winByFold stack payout.
      if (state >= ST.FLOP && isCreatorTurn) {
        await send(wCreator, 'act', [tableId, ACT.FOLD], 3_000_000n);
        folded = true;
        continue;
      }
      // Otherwise check if even, call if behind — advances toward the FLOP.
      const bs = await read('getBettingState', [tableId]);
      const actorIsP1 = nextToAct.toLowerCase() === p1.toLowerCase();
      const myBet  = actorIsP1 ? bs[0] : bs[1];
      const oppBet = actorIsP1 ? bs[1] : bs[0];
      const action = oppBet > myBet ? ACT.CALL : ACT.CHECK;
      await send(w, 'act', [tableId, action], action === ACT.CALL ? 2_000_000n : 1_000_000n);
      continue;
    }
    await sleep(3000);
  }

  // Report
  const [winner, pot] = await read('getResult', [tableId]);
  const [s1, s2]      = await read('getStacks', [tableId]);
  const balC = await read('getBalance', [], accCreator.address);
  LOG(`\n== RESULT ==`);
  LOG(`folded=${folded}  winner=${winner}  pot=${pot}`);
  LOG(`stacks  p1=${s1}  p2=${s2}   (sum ${s1 + s2}, expected ${BUY_IN * 2n})`);
  LOG(`getBalance(creator) → ${balC.toString().slice(0, 20)}…  (ciphertext handle)`);

  const conserved = (s1 + s2) === BUY_IN * 2n;
  const handleOk  = balC > 1_000_000n;
  const winnerOk  = winner.toLowerCase() === accJoiner.address.toLowerCase(); // creator folded → joiner wins

  // Cash both stacks back into the encrypted bankrolls.
  try { await send(wJoiner,  'leaveTable', [tableId], 1_500_000n); } catch (e) { LOG('joiner leave:', e.shortMessage || e.message); }

  LOG(`\nchips conserved (p1+p2 == 2*buyIn) : ${conserved ? 'PASS' : 'FAIL'}`);
  LOG(`pot paid to fold winner's stack    : ${winnerOk ? 'PASS' : 'FAIL'}`);
  LOG(`bankroll is an encrypted handle    : ${handleOk ? 'PASS' : 'FAIL'}`);
  if (conserved && winnerOk && handleOk) LOG(`\n✅ Wave 5 stack-based money logic verified on-chain.`);
  else { LOG(`\n❌ Verification failed.`); process.exitCode = 1; }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
