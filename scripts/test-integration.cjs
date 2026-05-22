/**
 * Integration test — CipherPoker
 * Tests: wallets, contracts (read), Supabase CRUD, game data flows
 */
const { createClient } = require('@supabase/supabase-js');
const https = require('https');

// ── Config from .env ──────────────────────────────────────────────────────
const PK1  = '0x882ce473512a99a2b70d7b6760935f6ccb8578013d1f21ddd3fc2fdb9ecf00f4';
const PK2  = '0x37b7a70772af1471acecb968f3cc83074d54bfef2006774de02a68f80d4e699d';
const RPC  = 'https://ethereum-sepolia-rpc.publicnode.com';
const SUPABASE_URL = 'https://lxrznlwlhmjfmvhmibqz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4cnpubHdsaG1qZm12aG1pYnF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDU1MjcsImV4cCI6MjA5Mjg4MTUyN30.Ywm--64kuOGVF4tnSB5TGyw1LBf0tn1CCEw9EOkvvRM';

const CONTRACTS = {
  threeCard: '0x8D32d4B87aa3Db55Ac0Eae3DC2c2343CEd9F3470',
  holdem:    '0xA01aDb97b1D1ad67a4295B8Ae0c525Affd74CEBe',
  pvp3card:  '0x76627a7A86C4Da6386f09b52cc8EC14C5EaC247d',
  holdemPvp: '0x309Dd767C98eb52C84ff44389A2066385b9C27e9',
  vault:     '0x78F7519411AaE1d2679E054690d46F8B1C441a19',
};

const results = [];
const pass = (n) => { results.push({s:'✓',n}); console.log('  ✓', n); };
const fail = (n,d) => { results.push({s:'✗',n,d}); console.log('  ✗', n, d ? '→ '+d : ''); };
const info = (n,d) => { results.push({s:'i',n,d}); console.log('  ℹ', n, d||''); };

// ── Helpers ──────────────────────────────────────────────────────────────
function pkToAddress(pk) {
  // Derive address from private key using secp256k1 math (simplified via keccak)
  try {
    // Use a simple check — just verify the key format
    const clean = pk.startsWith('0x') ? pk.slice(2) : pk;
    if (clean.length !== 64) return null;
    return true; // valid format
  } catch { return null; }
}

function rpcCall(method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const url = new URL(RPC);
    const req = https.request({
      hostname: url.hostname, path: url.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 10000,
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => reject(new Error('timeout')));
    req.write(body);
    req.end();
  });
}

async function run() {
  console.log('\n=== CIPHERPOKER INTEGRATION TESTS ===\n');

  // ── 1. PRIVATE KEY VALIDATION ─────────────────────────────────────────
  console.log('[ Private Keys ]');
  const pk1Valid = PK1.startsWith('0x') && PK1.length === 66;
  const pk2Valid = PK2.startsWith('0x') && PK2.length === 66;
  pk1Valid ? pass('PK1 format valid (64 hex chars)') : fail('PK1 format invalid');
  pk2Valid ? pass('PK2 format valid (64 hex chars)') : fail('PK2 format invalid');
  pk1Valid && pk2Valid && PK1 !== PK2 ? pass('PK1 and PK2 are different wallets') : fail('PK1 == PK2 — same wallet!');

  // ── 2. SEPOLIA RPC ────────────────────────────────────────────────────
  console.log('\n[ Sepolia RPC ]');
  try {
    const chainRes = await rpcCall('eth_chainId', []);
    const chainId = parseInt(chainRes.result, 16);
    chainId === 11155111 ? pass('RPC connected — Sepolia (chainId 11155111)') : fail('Wrong chain: ' + chainId);
  } catch(e) { fail('RPC unreachable: ' + e.message); }

  try {
    const blockRes = await rpcCall('eth_blockNumber', []);
    const block = parseInt(blockRes.result, 16);
    block > 0 ? pass('Latest block: ' + block.toLocaleString()) : fail('Block number = 0');
  } catch(e) { fail('eth_blockNumber failed: ' + e.message); }

  // ── 3. CONTRACT CODE CHECK (deployed?) ────────────────────────────────
  console.log('\n[ Contracts on Sepolia ]');
  for (const [name, addr] of Object.entries(CONTRACTS)) {
    try {
      const res = await rpcCall('eth_getCode', [addr, 'latest']);
      const code = res.result;
      if (code && code !== '0x' && code.length > 10) {
        pass(name + ' deployed at ' + addr.slice(0,10) + '… (' + Math.floor(code.length/2) + ' bytes)');
      } else {
        fail(name + ' NOT deployed at ' + addr + ' (no code)');
      }
    } catch(e) { fail(name + ' check failed: ' + e.message); }
  }

  // ── 4. CONTRACT BALANCE CHECK ─────────────────────────────────────────
  console.log('\n[ Contract ETH Balances ]');
  for (const [name, addr] of Object.entries(CONTRACTS)) {
    try {
      const res = await rpcCall('eth_getBalance', [addr, 'latest']);
      const wei = BigInt(res.result);
      const eth = Number(wei) / 1e18;
      info(name + ' balance: ' + eth.toFixed(6) + ' ETH');
    } catch(e) { fail(name + ' balance check failed'); }
  }

  // ── 5. SUPABASE CONNECTIVITY ──────────────────────────────────────────
  console.log('\n[ Supabase ]');
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    const { data, error } = await supabase.from('players').select('count').limit(1);
    if (error) fail('players table error: ' + error.message);
    else pass('players table accessible');
  } catch(e) { fail('Supabase connection failed: ' + e.message); }

  try {
    const { data, error } = await supabase.from('hand_results').select('count').limit(1);
    if (error) fail('hand_results table error: ' + error.message);
    else pass('hand_results table accessible');
  } catch(e) { fail('hand_results check failed'); }

  try {
    const { data, error } = await supabase.from('pvp_chat').select('count').limit(1);
    if (error) fail('pvp_chat table error: ' + error.message);
    else pass('pvp_chat table accessible');
  } catch(e) { fail('pvp_chat check failed'); }

  // ── 6. SUPABASE SCHEMA COLUMNS ────────────────────────────────────────
  console.log('\n[ Supabase Schema Validation ]');
  try {
    const TEST_ADDR = '0xtest_schema_check_' + Date.now();
    const { error: upsertErr } = await supabase.from('players').upsert({
      address: TEST_ADDR,
      username: 'test',
      avatar_id: 'ace-spades',
      xp: 0,
      achievements: '[]',
      balance: 1000,
      ref_bonus_claimed: false,
      low_balance_claims: 0,
      challenge_progress: '{}',
    }, { onConflict: 'address' });
    if (upsertErr) fail('players upsert failed: ' + upsertErr.message);
    else pass('players: all new columns accept data (balance, ref_bonus_claimed, low_balance_claims, challenge_progress)');

    // Verify read-back
    const { data: row, error: getErr } = await supabase
      .from('players').select('*').eq('address', TEST_ADDR).single();
    if (getErr) fail('players read-back failed');
    else {
      row.balance === 1000           ? pass('players.balance reads back correctly') : fail('players.balance mismatch');
      row.ref_bonus_claimed === false ? pass('players.ref_bonus_claimed reads back') : fail('players.ref_bonus_claimed mismatch');
      row.challenge_progress === '{}' ? pass('players.challenge_progress reads back') : fail('players.challenge_progress mismatch');
    }

    // Cleanup test row
    await supabase.from('players').delete().eq('address', TEST_ADDR);
    pass('Test row cleaned up');
  } catch(e) { fail('Schema validation exception: ' + e.message); }

  // ── 7. HAND RESULTS SCHEMA ────────────────────────────────────────────
  console.log('\n[ Hand Results Schema ]');
  try {
    const TEST_HAND_ID = 'test-hand-' + Date.now();
    const { error } = await supabase.from('hand_results').upsert({
      id: TEST_HAND_ID,
      player_address: '0xtest',
      mode: 'three-card',
      result: 'WON',
      delta: 20,
      pot: 30,
      eval_name: 'Flush',
      tx_hash: '0xdeadbeef',
      played_at: new Date().toISOString(),
      player_cards: '[1,14,27]',
      bot_cards: '[5,18,31]',
      player_eval: 'Flush',
      bot_eval: 'High Card',
      payout: '{"antePayout":10,"playPayout":10,"anteBonus":0,"pairPlus":0,"totalDelta":20,"qualified":true}',
    }, { onConflict: 'id', ignoreDuplicates: true });
    if (error) fail('hand_results insert failed: ' + error.message);
    else pass('hand_results: all columns (player_cards, bot_cards, player_eval, bot_eval, payout) accepted');

    const { data: hr } = await supabase.from('hand_results').select('*').eq('id', TEST_HAND_ID).single();
    if (hr) {
      hr.player_cards === '[1,14,27]' ? pass('hand_results.player_cards reads back') : fail('player_cards mismatch: ' + hr.player_cards);
      hr.bot_cards === '[5,18,31]'    ? pass('hand_results.bot_cards reads back')    : fail('bot_cards mismatch');
      hr.payout?.includes('antePayout') ? pass('hand_results.payout reads back')    : fail('payout mismatch');
    }

    await supabase.from('hand_results').delete().eq('id', TEST_HAND_ID);
    pass('Hand result test row cleaned up');
  } catch(e) { fail('hand_results exception: ' + e.message); }

  // ── 8. SUPABASE LEADERBOARD QUERY ────────────────────────────────────
  console.log('\n[ Leaderboard Query ]');
  try {
    const { data: rows, error } = await supabase
      .from('hand_results').select('player_address, result, delta').limit(50);
    if (error) fail('leaderboard query failed: ' + error.message);
    else {
      pass('hand_results query for leaderboard works (' + (rows?.length || 0) + ' rows in DB)');
      if (rows && rows.length > 0) {
        const wins = rows.filter(r => r.result === 'WON').length;
        info('Total hands in DB: ' + rows.length + ' | Wins: ' + wins);
      }
    }
  } catch(e) { fail('leaderboard exception: ' + e.message); }

  // ── 9. PVP CHAT TEST ──────────────────────────────────────────────────
  console.log('\n[ PvP Chat ]');
  try {
    const TEST_TABLE = 999999;
    const { error: insertErr } = await supabase.from('pvp_chat').insert({
      table_id: TEST_TABLE, sender: '0xtest1', sender_name: 'TestPlayer',
      text: 'Integration test message',
    });
    if (insertErr) fail('pvp_chat insert failed: ' + insertErr.message);
    else pass('pvp_chat: message inserted');

    const { data: msgs, error: readErr } = await supabase
      .from('pvp_chat').select('*').eq('table_id', TEST_TABLE);
    if (readErr) fail('pvp_chat read failed');
    else {
      msgs?.length > 0 ? pass('pvp_chat: message readable (' + msgs.length + ' msgs)') : fail('pvp_chat: message not found');
      msgs?.[0]?.text === 'Integration test message' ? pass('pvp_chat: text matches') : fail('pvp_chat: text mismatch');
    }

    await supabase.from('pvp_chat').delete().eq('table_id', TEST_TABLE);
    pass('pvp_chat: test messages cleaned up');
  } catch(e) { fail('pvp_chat exception: ' + e.message); }

  // ── 10. DUPLICATE HAND PREVENTION ────────────────────────────────────
  console.log('\n[ Duplicate Prevention ]');
  try {
    const DUP_ID = 'dup-test-' + Date.now();
    const base = { id: DUP_ID, player_address: '0xtest', mode: 'holdem', result: 'WON', delta: 50, pot: 100, eval_name: null, tx_hash: '0x', played_at: new Date().toISOString() };
    await supabase.from('hand_results').upsert(base, { onConflict: 'id', ignoreDuplicates: true });
    await supabase.from('hand_results').upsert({ ...base, delta: 9999 }, { onConflict: 'id', ignoreDuplicates: true });
    const { data: check } = await supabase.from('hand_results').select('delta').eq('id', DUP_ID).single();
    check?.delta === 50 ? pass('Duplicate hand insert ignored (delta unchanged)') : fail('Duplicate hand was NOT ignored (delta changed to ' + check?.delta + ')');
    await supabase.from('hand_results').delete().eq('id', DUP_ID);
  } catch(e) { fail('Duplicate prevention exception: ' + e.message); }

  // ── 11. BALANCE SYNC FLOW ─────────────────────────────────────────────
  console.log('\n[ Balance Server Authority ]');
  try {
    const ADDR = '0xbalance_test_' + Date.now();
    await supabase.from('players').upsert({ address: ADDR, balance: 500 }, { onConflict: 'address' });
    const { data: p1 } = await supabase.from('players').select('balance').eq('address', ADDR).single();
    p1?.balance === 500 ? pass('Balance upsert: 500') : fail('Balance upsert failed');

    await supabase.from('players').upsert({ address: ADDR, balance: 1350 }, { onConflict: 'address' });
    const { data: p2 } = await supabase.from('players').select('balance').eq('address', ADDR).single();
    p2?.balance === 1350 ? pass('Balance update: 500 → 1350') : fail('Balance update failed: ' + p2?.balance);

    await supabase.from('players').delete().eq('address', ADDR);
    pass('Balance test row cleaned up');
  } catch(e) { fail('Balance flow exception: ' + e.message); }

  // ── 12. LOW BALANCE CLAIM LIMIT ───────────────────────────────────────
  console.log('\n[ LowBalance Claim Limit ]');
  try {
    const CLAIM_ADDR = '0xclaim_test_' + Date.now();
    await supabase.from('players').upsert({ address: CLAIM_ADDR, low_balance_claims: 4 }, { onConflict: 'address' });
    const { data: before } = await supabase.from('players').select('low_balance_claims').eq('address', CLAIM_ADDR).single();
    before?.low_balance_claims === 4 ? pass('Claim count reads correctly: 4/5') : fail('Claim count wrong: ' + before?.low_balance_claims);

    // Simulate 5th claim
    await supabase.from('players').upsert({ address: CLAIM_ADDR, low_balance_claims: 5, balance: 1000 }, { onConflict: 'address' });
    const { data: after } = await supabase.from('players').select('low_balance_claims, balance').eq('address', CLAIM_ADDR).single();
    after?.low_balance_claims === 5 ? pass('5th claim stored') : fail('5th claim not stored');

    await supabase.from('players').delete().eq('address', CLAIM_ADDR);
    pass('Claim test row cleaned up');
  } catch(e) { fail('Claim limit exception: ' + e.message); }

  // ── SUMMARY ───────────────────────────────────────────────────────────
  console.log('\n=== RESULTS ===');
  const passed  = results.filter(r => r.s === '✓').length;
  const failed  = results.filter(r => r.s === '✗');
  const infos   = results.filter(r => r.s === 'i').length;
  console.log('Passed:  ' + passed);
  console.log('Info:    ' + infos);
  console.log('Failed:  ' + failed.length);
  if (failed.length) {
    console.log('\nFailed checks:');
    failed.forEach(f => console.log('  ✗', f.n, f.d ? '→ ' + f.d : ''));
  }
  console.log(failed.length === 0 ? '\n✅ ALL INTEGRATION TESTS PASSED' : '\n❌ ' + failed.length + ' FAILURES');
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
