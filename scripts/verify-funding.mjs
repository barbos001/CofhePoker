/**
 * verify-funding.mjs — Wave 5 smoke test for the confidential encrypted bankroll.
 *
 * Exercises the NEW risky path on live Sepolia with a single wallet:
 *   createPvPTable  → encrypted buy-in (FHE.min grant + CoFHE decrypt task)
 *   confirmFunding  → materialise the grant into the plaintext table stack
 *   getStackOf      → assert the stack equals the requested buy-in
 *   getBalance      → assert the bankroll is an encrypted handle (not plaintext)
 *   leaveTable      → cash the stack back into the encrypted bankroll
 *
 * Run: node scripts/verify-funding.mjs
 */
import 'dotenv/config';
import { ethers } from 'ethers';

const RPC  = process.env.SEPOLIA_RPC_URL;
const PK   = process.env.PRIVATE_KEY;
// Wave 5 CofhePokerPvP (encrypted bankroll). Hardcoded — .env still points
// VITE_PVP_CONTRACT_ADDRESS at the pre-Wave-5 contract on purpose.
const ADDR = '0x7f29231Dfb9Ea271B3C39A494D3274f311952923';
const BUY_IN = 100n;

const ABI = [
  'function createPvPTable(uint256 buyIn, bool isPrivate) returns (uint256)',
  'function getMySeat() view returns (uint256)',
  'function confirmFunding(uint256 tableId)',
  'function isFundingReady(uint256 tableId) view returns (bool)',
  'function getFundingStatus(uint256 tableId) view returns (bool, bool)',
  'function getStackOf(uint256 tableId, address player) view returns (uint256)',
  'function getBalance() view returns (uint256)',
  'function leaveTable(uint256 tableId)',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!RPC || !PK) throw new Error('SEPOLIA_RPC_URL / PRIVATE_KEY missing in .env');

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet   = new ethers.Wallet(PK, provider);
  const c        = new ethers.Contract(ADDR, ABI, wallet);

  console.log(`\n== Wave 5 funding smoke test ==`);
  console.log(`Contract : ${ADDR}`);
  console.log(`Wallet   : ${wallet.address}`);
  console.log(`ETH      : ${ethers.formatEther(await provider.getBalance(wallet.address))}\n`);

  // 1. Create a private table (no opponent needed) → triggers encrypted buy-in
  // Explicit gasLimit: FHE-heavy functions are unreliable to gas-estimate.
  console.log(`createPvPTable(buyIn=${BUY_IN}, private=true) …`);
  let tx = await c.createPvPTable(BUY_IN, true, { gasLimit: 2_500_000n });
  const rc = await tx.wait();
  console.log(`  tx ${rc.hash} status=${rc.status} gasUsed=${rc.gasUsed}`);
  const tableId = await c.getMySeat();
  console.log(`  table #${tableId} created, encrypted buy-in requested ✓`);

  // 2. Poll confirmFunding until the CoFHE decrypt task resolves
  let funded = false;
  for (let i = 0; i < 12; i++) {
    const [p1Funded] = await c.getFundingStatus(tableId);
    if (p1Funded) { funded = true; break; }
    console.log(`  [${i + 1}/12] funding pending — calling confirmFunding…`);
    try { tx = await c.confirmFunding(tableId, { gasLimit: 1_500_000n }); await tx.wait(); } catch (e) {
      console.log(`     confirmFunding revert (decrypt not ready yet) — retrying`);
    }
    if (await c.isFundingReady(tableId)) { funded = true; break; }
    await sleep(10_000);
  }

  if (!funded) {
    console.log(`\n❌ FAIL: funding did not resolve within timeout`);
    process.exitCode = 1;
    return;
  }

  // 3. Assert the stack equals the buy-in, bankroll is an encrypted handle
  const stack    = await c.getStackOf(tableId, wallet.address);
  const balHandle = await c.getBalance();
  console.log(`\n  getStackOf  → ${stack}   (expected ${BUY_IN})`);
  console.log(`  getBalance  → ${balHandle.toString().slice(0, 18)}…  (ciphertext handle)`);

  const stackOk  = stack === BUY_IN;
  const handleOk = balHandle > 1000n; // a real ciphertext handle is a huge number, not a plaintext balance

  // 4. Clean up — leave the table (cashes the stack back into the bankroll)
  console.log(`\nleaveTable(#${tableId}) — cashing stack back to encrypted bankroll…`);
  try { tx = await c.leaveTable(tableId, { gasLimit: 1_500_000n }); await tx.wait(); console.log(`  left ✓`); }
  catch (e) { console.log(`  leaveTable failed: ${e.shortMessage || e.message}`); }

  console.log(`\n== RESULT ==`);
  console.log(`  stack == buyIn         : ${stackOk ? 'PASS ✓' : 'FAIL ✗'}`);
  console.log(`  bankroll is encrypted  : ${handleOk ? 'PASS ✓' : 'FAIL ✗'}`);
  if (stackOk && handleOk) {
    console.log(`\n✅ Confidential encrypted-bankroll buy-in works on-chain.`);
  } else {
    console.log(`\n❌ Verification failed.`);
    process.exitCode = 1;
  }
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
