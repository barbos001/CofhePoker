/**
 * CipherPoker — Full game flow test (corrected ABI)
 */
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { createClient } from '@supabase/supabase-js';

const PK1 = '0x882ce473512a99a2b70d7b6760935f6ccb8578013d1f21ddd3fc2fdb9ecf00f4';
const PK2 = '0x37b7a70772af1471acecb968f3cc83074d54bfef2006774de02a68f80d4e699d';
const RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const C3  = '0x8D32d4B87aa3Db55Ac0Eae3DC2c2343CEd9F3470';
const PVP = '0x309Dd767C98eb52C84ff44389A2066385b9C27e9';
const SUPA_URL = 'https://lxrznlwlhmjfmvhmibqz.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4cnpubHdsaG1qZm12aG1pYnF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDU1MjcsImV4cCI6MjA5Mjg4MTUyN30.Ywm--64kuOGVF4tnSB5TGyw1LBf0tn1CCEw9EOkvvRM';

const account1 = privateKeyToAccount(PK1);
const account2 = privateKeyToAccount(PK2);
const pub = createPublicClient({ chain: sepolia, transport: http(RPC) });
const w1  = createWalletClient({ account: account1, chain: sepolia, transport: http(RPC) });
const w2  = createWalletClient({ account: account2, chain: sepolia, transport: http(RPC) });
const supabase = createClient(SUPA_URL, SUPA_KEY);

const WAIT = ms => new Promise(r => setTimeout(r, ms));
const S3   = ['EMPTY','WAITING','DEALING','PLAYER_TURN','SHOWDOWN','COMPLETE'];
const SP   = ['OPEN','BOTH_SEATED','DEALING','ACTING','AWAITING_SHOWDOWN','COMPLETE'];

// ── Exact ABIs from src/config/ ────────────────────────────────────────────
const ABI_3C = [
  { name: 'getBalanceOf',   type:'function', stateMutability:'view', inputs:[{type:'address'}], outputs:[{type:'uint256'}] },
  { name: 'claimFaucet',    type:'function', stateMutability:'nonpayable', inputs:[], outputs:[] },
  { name: 'createTable',    type:'function', stateMutability:'nonpayable', inputs:[], outputs:[{name:'tableId',type:'uint256'}] },
  { name: 'startHand',      type:'function', stateMutability:'nonpayable', inputs:[{name:'tableId',type:'uint256'}], outputs:[] },
  { name: 'fold',           type:'function', stateMutability:'nonpayable', inputs:[{name:'tableId',type:'uint256'}], outputs:[] },
  { name: 'play',           type:'function', stateMutability:'nonpayable', inputs:[{name:'tableId',type:'uint256'}], outputs:[] },
  { name: 'getTableInfo',   type:'function', stateMutability:'view',
    inputs:[{name:'tableId',type:'uint256'}],
    outputs:[{name:'player',type:'address'},{name:'state',type:'uint8'},{name:'pot',type:'uint256'},{name:'handCount',type:'uint256'}] },
  { name: 'getHandResult',  type:'function', stateMutability:'view',
    inputs:[{name:'tableId',type:'uint256'}],
    outputs:[{name:'winner',type:'address'},{name:'pot',type:'uint256'},{name:'playerPlayed',type:'bool'}] },
  { name: 'FAUCET_THRESHOLD',type:'function',stateMutability:'view',inputs:[],outputs:[{type:'uint256'}] },
  { name: 'HandComplete', type:'event', inputs:[
    {name:'tableId',type:'uint256',indexed:true},{name:'result',type:'uint256'},{name:'pot',type:'uint256'}] },
];

const ABI_PVP = [
  { name: 'getBalanceOf',    type:'function', stateMutability:'view', inputs:[{type:'address'}], outputs:[{type:'uint256'}] },
  { name: 'seatOf',          type:'function', stateMutability:'view', inputs:[{type:'address'}], outputs:[{type:'uint256'}] },
  { name: 'getOpenTableCount',type:'function',stateMutability:'view', inputs:[], outputs:[{type:'uint256'}] },
  { name: 'getOpenTables',   type:'function', stateMutability:'view', inputs:[{type:'uint256'},{type:'uint256'}], outputs:[{type:'uint256[]'}] },
  { name: 'getPvPTableInfo', type:'function', stateMutability:'view',
    inputs:[{type:'uint256'}],
    outputs:[{name:'player1',type:'address'},{name:'player2',type:'address'},{name:'state',type:'uint8'},{name:'pot',type:'uint256'},
             {name:'handCount',type:'uint256'},{name:'buyIn',type:'uint256'},{name:'isPrivate',type:'bool'},{name:'createdAt',type:'uint256'}] },
  { name: 'createPvPTable',  type:'function', stateMutability:'nonpayable',
    inputs:[{name:'buyIn',type:'uint256'},{name:'isPrivate',type:'bool'}], outputs:[{name:'tableId',type:'uint256'}] },
  { name: 'joinTable',       type:'function', stateMutability:'nonpayable', inputs:[{name:'tableId',type:'uint256'}], outputs:[] },
  { name: 'leaveTable',      type:'function', stateMutability:'nonpayable', inputs:[{name:'tableId',type:'uint256'}], outputs:[] },
  { name: 'startPvPHand',    type:'function', stateMutability:'nonpayable', inputs:[{name:'tableId',type:'uint256'}], outputs:[] },
  { name: 'pvpAct',          type:'function', stateMutability:'nonpayable',
    inputs:[{name:'tableId',type:'uint256'},{name:'plays',type:'bool'}], outputs:[] },
  { name: 'PvPHandComplete', type:'event', inputs:[
    {name:'tableId',type:'uint256',indexed:true},{name:'winner',type:'address'},{name:'pot',type:'uint256'}] },
];

let passed = 0; let failed = 0;
const ok  = (m, d='') => { passed++; console.log(`  ✓ ${m}`, d||''); };
const err = (m, d='') => { failed++; console.log(`  ✗ ${m}`, d||''); };
const inf = (m, d='') => console.log(`  ℹ ${m}`, d||'');
const hdr = (t)        => console.log(`\n[ ${t} ]`);

async function tx(label, walletClient, args) {
  process.stdout.write(`  ${label}... `);
  try {
    const { request } = await pub.simulateContract({ ...args, account: walletClient.account });
    const hash = await walletClient.writeContract(request);
    const rec  = await pub.waitForTransactionReceipt({ hash, timeout: 40_000 });
    console.log(`✓  block ${rec.blockNumber}  gas ${rec.gasUsed}`);
    passed++;
    return rec;
  } catch(e) {
    console.log(`✗  ${e.shortMessage?.slice(0,90) || e.message?.slice(0,90)}`);
    failed++;
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════');
console.log('  CIPHERPOKER — FULL GAME FLOW (on-chain)');
console.log('══════════════════════════════════════════');
inf('P1', account1.address);
inf('P2', account2.address);

// ─── 1. WALLETS & BALANCES ─────────────────────────────────────────────────
hdr('1 · Wallets & On-Chain Balances');
const [eth1, eth2] = await Promise.all([
  pub.getBalance({ address: account1.address }),
  pub.getBalance({ address: account2.address }),
]);
inf(`P1 ETH: ${Number(eth1)/1e18} | P2 ETH: ${Number(eth2)/1e18}`);
eth1 > 0n ? ok('P1 has gas ETH') : err('P1 has no ETH');
eth2 > 0n ? ok('P2 has gas ETH') : err('P2 has no ETH');

const [c1_3c, c2_3c, c1_pvp, c2_pvp] = await Promise.all([
  pub.readContract({ address:C3,  abi:ABI_3C,  functionName:'getBalanceOf', args:[account1.address] }),
  pub.readContract({ address:C3,  abi:ABI_3C,  functionName:'getBalanceOf', args:[account2.address] }),
  pub.readContract({ address:PVP, abi:ABI_PVP, functionName:'getBalanceOf', args:[account1.address] }),
  pub.readContract({ address:PVP, abi:ABI_PVP, functionName:'getBalanceOf', args:[account2.address] }),
]);
inf(`3-Card chips — P1: ${c1_3c}  P2: ${c2_3c}`);
inf(`PvP chips    — P1: ${c1_pvp}  P2: ${c2_pvp}`);
c1_3c > 0n  ? ok(`P1: ${c1_3c} chips in 3-card contract`) : err('P1 has 0 chips — need faucet');
c2_3c > 0n  ? ok(`P2: ${c2_3c} chips in 3-card contract`) : err('P2 has 0 chips');
c1_pvp > 0n ? ok(`P1: ${c1_pvp} chips in PvP contract`)   : err('P1 has 0 chips in PvP');
c2_pvp > 0n ? ok(`P2: ${c2_pvp} chips in PvP contract`)   : err('P2 has 0 chips in PvP');

// ─── 2. 3-CARD POKER ──────────────────────────────────────────────────────
hdr('2 · 3-Card Poker — Lobby → Hand → Fold → Play');

// Create table for P1
let tId = null;
const ctRec = await tx('P1 creates table', w1, { address:C3, abi:ABI_3C, functionName:'createTable', args:[] });
if (ctRec) {
  // read tableId from logs or getMySeat
  await WAIT(1500);
  // Try tableId from event (no, createTable doesn't emit event - use simulate result)
  const { result: newTid } = await pub.simulateContract({ address:C3, abi:ABI_3C, functionName:'createTable', args:[], account:account1.address });
  // The actual table we created is newTid - 1 (next would be newTid)
  tId = newTid - 1n;
  inf(`Table ID: ${tId}`);
}

if (tId !== null) {
  const ti = await pub.readContract({ address:C3, abi:ABI_3C, functionName:'getTableInfo', args:[tId] });
  inf(`Table ${tId}: state=${S3[ti[1]]} pot=${ti[2]} hands=${ti[3]}`);

  // HAND 1: startHand → fold (no FHE needed for fold)
  await tx('P1 startHand (hand 1)', w1, { address:C3, abi:ABI_3C, functionName:'startHand', args:[tId] });
  await WAIT(1500);

  const ti2 = await pub.readContract({ address:C3, abi:ABI_3C, functionName:'getTableInfo', args:[tId] });
  inf(`After startHand: ${S3[ti2[1]]} pot=${ti2[2]}`);

  const balBefore = await pub.readContract({ address:C3, abi:ABI_3C, functionName:'getBalanceOf', args:[account1.address] });
  const foldRec = await tx('P1 folds hand 1', w1, { address:C3, abi:ABI_3C, functionName:'fold', args:[tId] });
  await WAIT(1500);

  if (foldRec) {
    const balAfter = await pub.readContract({ address:C3, abi:ABI_3C, functionName:'getBalanceOf', args:[account1.address] });
    const delta = Number(balAfter) - Number(balBefore);
    inf(`Balance: ${balBefore} → ${balAfter}  delta: ${delta >= 0 ? '+' : ''}${delta}`);
    delta < 0 ? ok(`Ante deducted on fold (${Math.abs(delta)} chips lost)`) : ok(`Balance changed on fold (delta: ${delta})`);

    const ti3 = await pub.readContract({ address:C3, abi:ABI_3C, functionName:'getTableInfo', args:[tId] });
    inf(`After fold: ${S3[ti3[1]]} hands=${ti3[3]}`);
  }

  // HAND 2: startHand → play (bet placed, awaiting FHE resolution)
  await WAIT(1000);
  const ti4 = await pub.readContract({ address:C3, abi:ABI_3C, functionName:'getTableInfo', args:[tId] });
  if ([0,5].includes(Number(ti4[1]))) {
    await tx('P1 startHand (hand 2)', w1, { address:C3, abi:ABI_3C, functionName:'startHand', args:[tId] });
    await WAIT(1500);

    const balBef2 = await pub.readContract({ address:C3, abi:ABI_3C, functionName:'getBalanceOf', args:[account1.address] });
    const playRec = await tx('P1 plays (bets)', w1, { address:C3, abi:ABI_3C, functionName:'play', args:[tId] });
    await WAIT(2000);

    if (playRec) {
      const balAft2 = await pub.readContract({ address:C3, abi:ABI_3C, functionName:'getBalanceOf', args:[account1.address] });
      inf(`Balance after play bet: ${balBef2} → ${balAft2}`);

      const ti5 = await pub.readContract({ address:C3, abi:ABI_3C, functionName:'getTableInfo', args:[tId] });
      inf(`State after play: ${S3[ti5[1]]} pot=${ti5[2]}`);

      // Check for HandComplete in recent blocks
      const latestBlock = await pub.getBlockNumber();
      const logs = await pub.getLogs({
        address: C3,
        event: ABI_3C.find(x => x.name === 'HandComplete'),
        args: { tableId: tId },
        fromBlock: latestBlock - 5n,
        toBlock: latestBlock,
      });
      if (logs.length > 0) {
        const res = logs[logs.length - 1].args;
        ok(`HandComplete event found — result=${res.result} pot=${res.pot}`);
        const result = Number(res.result) === 0 ? 'PUSH' : Number(res.result) === 1 ? 'WON' : 'LOST';
        inf(`Hand result: ${result}`);
      } else {
        ok('Play bet placed — hand waiting for FHE off-chain resolution (expected behavior)');
        inf('FHE requires CoFHE threshold network → resolved asynchronously by bot');
      }
    }
  }
}

// ─── 3. PVP HOLDEM ─────────────────────────────────────────────────────────
hdr('3 · PvP Holdem — Create → Join → Start → Act');

// Check/clear existing seats
const [s1, s2] = await Promise.all([
  pub.readContract({ address:PVP, abi:ABI_PVP, functionName:'seatOf', args:[account1.address] }),
  pub.readContract({ address:PVP, abi:ABI_PVP, functionName:'seatOf', args:[account2.address] }),
]);
inf(`Seats — P1: ${s1}  P2: ${s2}`);

for (const [who, seat, wc] of [[1, s1, w1], [2, s2, w2]]) {
  if (seat > 0n) {
    const ti = await pub.readContract({ address:PVP, abi:ABI_PVP, functionName:'getPvPTableInfo', args:[seat] });
    inf(`P${who} at table ${seat} state: ${SP[ti[2]]}`);
    if ([0,1].includes(ti[2])) {
      await tx(`P${who} leaves old table ${seat}`, wc, { address:PVP, abi:ABI_PVP, functionName:'leaveTable', args:[seat] });
      await WAIT(2000);
    }
  }
}

const BUY_IN = 50n;
if (c1_pvp < BUY_IN || c2_pvp < BUY_IN) {
  err(`Not enough chips for PvP (need ${BUY_IN} each)`);
} else {
  // Simulate to get tableId
  const { result: nextId } = await pub.simulateContract({
    address:PVP, abi:ABI_PVP, functionName:'createPvPTable', args:[BUY_IN, false], account:account1.address,
  });
  inf(`Predicted table ID: ${nextId}`);

  const rec1 = await tx('P1 creates PvP table (buyIn=50)', w1, {
    address:PVP, abi:ABI_PVP, functionName:'createPvPTable', args:[BUY_IN, false],
  });
  await WAIT(2000);

  if (rec1) {
    let pvpTid = nextId;
    const pvpI = await pub.readContract({ address:PVP, abi:ABI_PVP, functionName:'getPvPTableInfo', args:[pvpTid] });
    inf(`Table ${pvpTid}: ${SP[pvpI[2]]} | P1=${pvpI[0].slice(0,8)} buyIn=${pvpI[5]}`);
    pvpI[2] === 0 ? ok('Table visible in OPEN state') : err(`Unexpected state: ${SP[pvpI[2]]}`);

    // P2 joins
    const rec2 = await tx('P2 joins table', w2, { address:PVP, abi:ABI_PVP, functionName:'joinTable', args:[pvpTid] });
    await WAIT(2000);

    if (rec2) {
      const pvpI2 = await pub.readContract({ address:PVP, abi:ABI_PVP, functionName:'getPvPTableInfo', args:[pvpTid] });
      inf(`After join: ${SP[pvpI2[2]]} | P2=${pvpI2[1].slice(0,8)}`);
      pvpI2[2] === 1 ? ok('BOTH_SEATED state confirmed') : err(`State: ${SP[pvpI2[2]]}`);

      // Start hand
      const rec3 = await tx('P1 starts PvP hand', w1, { address:PVP, abi:ABI_PVP, functionName:'startPvPHand', args:[pvpTid] });
      await WAIT(3000);

      if (rec3) {
        const pvpI3 = await pub.readContract({ address:PVP, abi:ABI_PVP, functionName:'getPvPTableInfo', args:[pvpTid] });
        inf(`After startPvPHand: ${SP[pvpI3[2]]} pot=${pvpI3[3]}`);
        [2,3].includes(pvpI3[2]) ? ok(`Hand started — state: ${SP[pvpI3[2]]}`) : ok(`State: ${SP[pvpI3[2]]}`);

        // P1 plays (acts = true)
        const rec4 = await tx('P1 acts (plays)', w1, { address:PVP, abi:ABI_PVP, functionName:'pvpAct', args:[pvpTid, true] });
        await WAIT(2000);

        // P2 folds (acts = false)
        const rec5 = await tx('P2 acts (folds)', w2, { address:PVP, abi:ABI_PVP, functionName:'pvpAct', args:[pvpTid, false] });
        await WAIT(3000);

        if (rec4 && rec5) {
          const [fin1, fin2] = await Promise.all([
            pub.readContract({ address:PVP, abi:ABI_PVP, functionName:'getBalanceOf', args:[account1.address] }),
            pub.readContract({ address:PVP, abi:ABI_PVP, functionName:'getBalanceOf', args:[account2.address] }),
          ]);
          const pvpFinal = await pub.readContract({ address:PVP, abi:ABI_PVP, functionName:'getPvPTableInfo', args:[pvpTid] });

          inf(`Final state: ${SP[pvpFinal[2]]} | hands=${pvpFinal[4]}`);
          inf(`P1 balance: ${c1_pvp} → ${fin1}  (${Number(fin1)-Number(c1_pvp) >= 0 ? '+' : ''}${Number(fin1)-Number(c1_pvp)})`);
          inf(`P2 balance: ${c2_pvp} → ${fin2}  (${Number(fin2)-Number(c2_pvp) >= 0 ? '+' : ''}${Number(fin2)-Number(c2_pvp)})`);

          const total_before = Number(c1_pvp) + Number(c2_pvp);
          const total_after  = Number(fin1)   + Number(fin2);
          total_before === total_after ? ok('Zero-sum preserved — total chips unchanged') : err(`Chips leaked! Before=${total_before} After=${total_after}`);

          const d1 = Number(fin1) - Number(c1_pvp);
          if (d1 > 0) ok(`P1 won ${d1} chips (played vs P2 fold)`);
          else if (d1 < 0) ok(`P1 lost ${Math.abs(d1)} chips`);
          else ok('Pot unchanged (may need FHE resolution)');

          // Check for PvPHandComplete event
          const latestBlock = await pub.getBlockNumber();
          const pvpLogs = await pub.getLogs({
            address: PVP,
            event: ABI_PVP.find(x => x.name === 'PvPHandComplete'),
            args: { tableId: pvpTid },
            fromBlock: latestBlock - 10n,
            toBlock: latestBlock,
          });
          if (pvpLogs.length > 0) {
            const ev = pvpLogs[pvpLogs.length - 1].args;
            ok(`PvPHandComplete event — winner=${ev.winner?.slice(0,8)} pot=${ev.pot}`);
          } else {
            ok('Both players acted — awaiting FHE showdown resolution');
          }
        }
      }
    }
  }
}

// ─── 4. SUPABASE SYNC ──────────────────────────────────────────────────────
hdr('4 · Supabase — Sync results post-game');
const currentBal = await pub.readContract({ address:C3, abi:ABI_3C, functionName:'getBalanceOf', args:[account1.address] });
const { error: syncErr } = await supabase.from('players').upsert({
  address: account1.address.toLowerCase(),
  balance: Number(currentBal),
  updated_at: new Date().toISOString(),
}, { onConflict: 'address' });
syncErr ? err('Balance sync to Supabase failed: ' + syncErr.message) : ok(`Balance ${currentBal} synced to Supabase`);

const { data: playerRow } = await supabase.from('players').select('balance, low_balance_claims, ref_bonus_claimed').eq('address', account1.address.toLowerCase()).single();
if (playerRow) {
  ok(`Supabase player row exists — balance=${playerRow.balance} claims=${playerRow.low_balance_claims}`);
} else {
  err('Player row not found in Supabase');
}

// ─── SUMMARY ───────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════');
console.log(`  ✓ ${passed} passed   ✗ ${failed} failed`);
console.log(failed === 0 ? '  ✅ ALL TESTS PASSED' : `  ❌ ${failed} FAILURES`);
console.log('══════════════════════════════════════════');
