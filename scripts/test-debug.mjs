import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

const PK1 = '0x882ce473512a99a2b70d7b6760935f6ccb8578013d1f21ddd3fc2fdb9ecf00f4';
const PK2 = '0x37b7a70772af1471acecb968f3cc83074d54bfef2006774de02a68f80d4e699d';
const RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const C3  = '0x8D32d4B87aa3Db55Ac0Eae3DC2c2343CEd9F3470';
const PVP = '0x309Dd767C98eb52C84ff44389A2066385b9C27e9';

const account1 = privateKeyToAccount(PK1);
const account2 = privateKeyToAccount(PK2);
const pub = createPublicClient({ chain: sepolia, transport: http(RPC) });
const w1  = createWalletClient({ account: account1, chain: sepolia, transport: http(RPC) });
const w2  = createWalletClient({ account: account2, chain: sepolia, transport: http(RPC) });

const WAIT = (ms) => new Promise(r => setTimeout(r, ms));
const STATE3 = ['EMPTY','WAITING','DEALING','PLAYER_TURN','SHOWDOWN','COMPLETE'];
const STATEP = ['OPEN','BOTH_SEATED','DEALING','ACTING','AWAITING_SHOWDOWN','COMPLETE'];

const ABI_3C = [
  { name: 'getBalanceOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'createTable',  type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [{ name: 'tableId', type: 'uint256' }] },
  { name: 'startHand',    type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  { name: 'fold',         type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  { name: 'play',         type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  { name: 'getTableInfo', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [{ type: 'address' }, { type: 'uint8' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bool' }] },
  { name: 'HandComplete',  type: 'event',
    inputs: [{ name: 'tableId', type: 'uint256', indexed: true }, { name: 'result', type: 'uint256' }, { name: 'pot', type: 'uint256' }] },
];

const ABI_PVP = [
  { name: 'getBalanceOf',    type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'seatOf',          type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'getOpenTableCount',type:'function',  stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'getOpenTables',   type: 'function', stateMutability: 'view',
    inputs: [{ type: 'uint256' }, { type: 'uint256' }], outputs: [{ type: 'uint256[]' }] },
  { name: 'getPvPTableInfo', type: 'function', stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
    outputs: [{ type: 'address' }, { type: 'address' }, { type: 'uint8' }, { type: 'uint256' },
              { type: 'uint256' }, { type: 'uint256' }, { type: 'bool' }, { type: 'uint256' }] },
  { name: 'createPvPTable',  type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'buyIn', type: 'uint256' }, { name: 'isPrivate', type: 'bool' }],
    outputs: [{ name: 'tableId', type: 'uint256' }] },
  { name: 'joinTable',       type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  { name: 'startPvPHand',    type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
  { name: 'pvpAct',          type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'tableId', type: 'uint256' }, { name: 'plays', type: 'bool' }], outputs: [] },
  { name: 'leaveTable',      type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'tableId', type: 'uint256' }], outputs: [] },
];

async function step(label, fn) {
  process.stdout.write(`  ${label}... `);
  try { const r = await fn(); console.log('✓', r !== undefined ? String(r) : ''); return r; }
  catch(e) { console.log('✗', e.shortMessage?.slice(0,100) || e.message?.slice(0,100)); return null; }
}

async function simulate(fn, args, account, address, abi) {
  const { result, request } = await pub.simulateContract({ address, abi, functionName: fn, args, account });
  return { result, request };
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══ CIPHERPOKER FULL GAME TEST ═══');
console.log('P1:', account1.address);
console.log('P2:', account2.address);

// ── BALANCES ────────────────────────────────────────────────────────────────
console.log('\n── Balances ──');
const [b1_3c, b2_3c, b1_pvp, b2_pvp] = await Promise.all([
  pub.readContract({ address: C3,  abi: ABI_3C,  functionName: 'getBalanceOf', args: [account1.address] }),
  pub.readContract({ address: C3,  abi: ABI_3C,  functionName: 'getBalanceOf', args: [account2.address] }),
  pub.readContract({ address: PVP, abi: ABI_PVP, functionName: 'getBalanceOf', args: [account1.address] }),
  pub.readContract({ address: PVP, abi: ABI_PVP, functionName: 'getBalanceOf', args: [account2.address] }),
]);
console.log(`  3-Card: P1=${b1_3c} P2=${b2_3c}`);
console.log(`  PvP:    P1=${b1_pvp} P2=${b2_pvp}`);

// ── 3-CARD: TABLE 6 (already created in prev test) ───────────────────────────
console.log('\n── 3-Card: Table 6 (prev session) ──');
const tinfo6 = await pub.readContract({ address: C3, abi: ABI_3C, functionName: 'getTableInfo', args: [6n] });
const state6 = Number(tinfo6[1]);
console.log(`  State: ${STATE3[state6]} | pot: ${tinfo6[2]} | hands: ${tinfo6[3]} | played: ${tinfo6[4]}`);

// ── 3-CARD FULL HAND FLOW ────────────────────────────────────────────────────
console.log('\n── 3-Card: Full Hand Flow ──');
let tableId = 6n;

// Step 1: start hand if state allows
if (state6 === 0 || state6 === 5) {
  const r = await step('startHand (table 6)', async () => {
    const { request } = await simulate('startHand', [tableId], account1.address, C3, ABI_3C);
    const hash = await w1.writeContract(request);
    const rec = await pub.waitForTransactionReceipt({ hash, timeout: 30_000 });
    return `block=${rec.blockNumber} gas=${rec.gasUsed}`;
  });
}

await WAIT(2000);
const tA = await pub.readContract({ address: C3, abi: ABI_3C, functionName: 'getTableInfo', args: [tableId] });
console.log(`  After startHand: ${STATE3[Number(tA[1])]} pot=${tA[2]}`);

// Step 2: fold this hand, then start + play next hand
if ([1, 2, 3].includes(Number(tA[1]))) {
  await step('fold (hand 1)', async () => {
    const { request } = await simulate('fold', [tableId], account1.address, C3, ABI_3C);
    const hash = await w1.writeContract(request);
    const rec = await pub.waitForTransactionReceipt({ hash, timeout: 30_000 });
    const balAfter = await pub.readContract({ address: C3, abi: ABI_3C, functionName: 'getBalanceOf', args: [account1.address] });
    return `block=${rec.blockNumber} | balance now: ${balAfter}`;
  });

  await WAIT(2000);
  const tB = await pub.readContract({ address: C3, abi: ABI_3C, functionName: 'getTableInfo', args: [tableId] });
  console.log(`  After fold: ${STATE3[Number(tB[1])]} | hands played: ${tB[3]}`);

  // Start second hand and PLAY (not fold)
  await step('startHand (hand 2)', async () => {
    const { request } = await simulate('startHand', [tableId], account1.address, C3, ABI_3C);
    const hash = await w1.writeContract(request);
    const rec = await pub.waitForTransactionReceipt({ hash, timeout: 30_000 });
    return `block=${rec.blockNumber}`;
  });

  await WAIT(1500);
  const tC = await pub.readContract({ address: C3, abi: ABI_3C, functionName: 'getTableInfo', args: [tableId] });
  console.log(`  After startHand2: ${STATE3[Number(tC[1])]}`);

  await step('play (bet)', async () => {
    const { request } = await simulate('play', [tableId], account1.address, C3, ABI_3C);
    const hash = await w1.writeContract(request);
    const rec = await pub.waitForTransactionReceipt({ hash, timeout: 30_000 });
    const balAfter = await pub.readContract({ address: C3, abi: ABI_3C, functionName: 'getBalanceOf', args: [account1.address] });

    // Check for HandComplete event
    const logs = await pub.getLogs({
      address: C3,
      event: { name: 'HandComplete', type: 'event', inputs: [
        { name: 'tableId', type: 'uint256', indexed: true },
        { name: 'result',  type: 'uint256' },
        { name: 'pot',     type: 'uint256' },
      ]},
      fromBlock: rec.blockNumber - 2n,
      toBlock: rec.blockNumber,
    });
    const evt = logs.find(l => l.args.tableId === tableId);
    if (evt) return `HAND RESOLVED! result=${evt.args.result} pot=${evt.args.pot} balance=${balAfter}`;
    return `block=${rec.blockNumber} balance=${balAfter} (awaiting FHE resolution)`;
  });
}

// ── PVP HOLDEM FLOW ──────────────────────────────────────────────────────────
console.log('\n── PvP Holdem Flow ──');

// Check existing seats
const [seat1, seat2] = await Promise.all([
  pub.readContract({ address: PVP, abi: ABI_PVP, functionName: 'seatOf', args: [account1.address] }),
  pub.readContract({ address: PVP, abi: ABI_PVP, functionName: 'seatOf', args: [account2.address] }),
]);
console.log(`  P1 seat: ${seat1} | P2 seat: ${seat2}`);

// If seated in old table, leave first
if (seat1 > 0n) {
  console.log(`  P1 at table ${seat1}, checking state...`);
  const oldInfo = await pub.readContract({ address: PVP, abi: ABI_PVP, functionName: 'getPvPTableInfo', args: [seat1] });
  console.log(`  Old table state: ${STATEP[oldInfo[2]]}`);
  if (oldInfo[2] === 0 || oldInfo[2] === 1) {
    await step('P1 leaves old table', async () => {
      const { request } = await simulate('leaveTable', [seat1], account1.address, PVP, ABI_PVP);
      const hash = await w1.writeContract(request);
      const rec = await pub.waitForTransactionReceipt({ hash, timeout: 30_000 });
      return `block=${rec.blockNumber}`;
    });
    await WAIT(2000);
  }
}

if (seat2 > 0n) {
  console.log(`  P2 at table ${seat2}, checking state...`);
  const oldInfo = await pub.readContract({ address: PVP, abi: ABI_PVP, functionName: 'getPvPTableInfo', args: [seat2] });
  if (oldInfo[2] === 0 || oldInfo[2] === 1) {
    await step('P2 leaves old table', async () => {
      const { request } = await simulate('leaveTable', [seat2], account2.address, PVP, ABI_PVP);
      const hash = await w2.writeContract(request);
      const rec = await pub.waitForTransactionReceipt({ hash, timeout: 30_000 });
      return `block=${rec.blockNumber}`;
    });
    await WAIT(2000);
  }
}

// Create PvP table
let pvpTableId = null;
if (b1_pvp >= 50n && b2_pvp >= 50n) {
  pvpTableId = await step('P1 creates PvP table (buyIn=50)', async () => {
    const { result, request } = await simulate('createPvPTable', [50n, false], account1.address, PVP, ABI_PVP);
    const hash = await w1.writeContract(request);
    const rec = await pub.waitForTransactionReceipt({ hash, timeout: 30_000 });

    // Get actual tableId by reading P1's seat
    await WAIT(1000);
    const newSeat = await pub.readContract({ address: PVP, abi: ABI_PVP, functionName: 'seatOf', args: [account1.address] });
    return newSeat > 0n ? newSeat : result;
  });

  if (pvpTableId) {
    await WAIT(1000);
    const pvpInfo = await pub.readContract({ address: PVP, abi: ABI_PVP, functionName: 'getPvPTableInfo', args: [pvpTableId] });
    console.log(`  Table ${pvpTableId}: state=${STATEP[pvpInfo[2]]} buyIn=${pvpInfo[5]}`);

    // P2 joins
    await step('P2 joins table', async () => {
      const { request } = await simulate('joinTable', [pvpTableId], account2.address, PVP, ABI_PVP);
      const hash = await w2.writeContract(request);
      const rec = await pub.waitForTransactionReceipt({ hash, timeout: 30_000 });
      return `block=${rec.blockNumber}`;
    });

    await WAIT(1500);
    const pvpInfo2 = await pub.readContract({ address: PVP, abi: ABI_PVP, functionName: 'getPvPTableInfo', args: [pvpTableId] });
    console.log(`  After join: ${STATEP[pvpInfo2[2]]} | P1=${pvpInfo2[0].slice(0,8)} P2=${pvpInfo2[1].slice(0,8)}`);

    // Start hand
    if (pvpInfo2[2] === 1) {
      await step('startPvPHand', async () => {
        const { request } = await simulate('startPvPHand', [pvpTableId], account1.address, PVP, ABI_PVP);
        const hash = await w1.writeContract(request);
        const rec = await pub.waitForTransactionReceipt({ hash, timeout: 30_000 });
        return `block=${rec.blockNumber}`;
      });

      await WAIT(2000);
      const pvpInfo3 = await pub.readContract({ address: PVP, abi: ABI_PVP, functionName: 'getPvPTableInfo', args: [pvpTableId] });
      console.log(`  After startHand: ${STATEP[pvpInfo3[2]]} | pot=${pvpInfo3[3]}`);

      // Both players act (P1 plays, P2 folds — simple resolution)
      if (pvpInfo3[2] >= 1) {
        await step('P1 acts (play=true)', async () => {
          const { request } = await simulate('pvpAct', [pvpTableId, true], account1.address, PVP, ABI_PVP);
          const hash = await w1.writeContract(request);
          const rec = await pub.waitForTransactionReceipt({ hash, timeout: 30_000 });
          return `block=${rec.blockNumber}`;
        });

        await WAIT(1500);
        await step('P2 acts (play=false / fold)', async () => {
          const { request } = await simulate('pvpAct', [pvpTableId, false], account2.address, PVP, ABI_PVP);
          const hash = await w2.writeContract(request);
          const rec = await pub.waitForTransactionReceipt({ hash, timeout: 30_000 });
          return `block=${rec.blockNumber}`;
        });

        await WAIT(2000);
        const pvpFinal = await pub.readContract({ address: PVP, abi: ABI_PVP, functionName: 'getPvPTableInfo', args: [pvpTableId] });
        console.log(`  Final PvP state: ${STATEP[pvpFinal[2]]} | hands=${pvpFinal[4]} | pot=${pvpFinal[3]}`);

        const [finalB1, finalB2] = await Promise.all([
          pub.readContract({ address: PVP, abi: ABI_PVP, functionName: 'getBalanceOf', args: [account1.address] }),
          pub.readContract({ address: PVP, abi: ABI_PVP, functionName: 'getBalanceOf', args: [account2.address] }),
        ]);
        console.log(`  Final balances — P1: ${finalB1} (was ${b1_pvp}) | P2: ${finalB2} (was ${b2_pvp})`);
        const delta1 = Number(finalB1) - Number(b1_pvp);
        const delta2 = Number(finalB2) - Number(b2_pvp);
        console.log(`  P1 delta: ${delta1 >= 0 ? '+' : ''}${delta1} | P2 delta: ${delta2 >= 0 ? '+' : ''}${delta2}`);
        if (delta1 + delta2 === 0) console.log('  ✓ Zero-sum confirmed (chips conserved)');
      }
    }
  }
} else {
  console.log('  Not enough chips for PvP — skipping');
}

console.log('\n═══ DONE ═══');
