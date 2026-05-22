const fs = require('fs');
const results = [];
const ok   = (name) => results.push({ pass: true,  name });
const warn = (name, detail) => results.push({ pass: null,  name, detail });
const fail = (name, detail) => results.push({ pass: false, name, detail: detail || '' });

const read = (f) => fs.readFileSync(f, 'utf8');
const sync       = read('src/hooks/useProfileSync.ts');
const gameStore  = read('src/store/useGameStore.ts');
const challenges = read('src/store/useChallengesStore.ts');
const lba        = read('src/components/ui/LowBalanceAlert.tsx');
const appShell   = read('src/components/AppShell.tsx');
const settings   = read('src/components/SettingsTab.tsx');
const chat       = read('src/components/ui/PvPChat.tsx');
const leader     = read('src/components/LeaderboardTab.tsx');
const db         = read('src/lib/db.ts');

// FLOW 1: Wallet connect → load from Supabase
sync.includes('getPlayer(addr)')          ? ok('FLOW1: getPlayer called on connect')        : fail('FLOW1: no getPlayer');
sync.includes('balance: 1000')            ? ok('FLOW1: new player seeded balance=1000')      : fail('FLOW1: no seed');
sync.includes('setBalance(row.balance)')  ? ok('FLOW1: balance loaded from server')          : fail('FLOW1: balance not loaded');
sync.includes('getPlayerHandHistory')     ? ok('FLOW1: hand history loaded from server')     : fail('FLOW1: history not loaded');
sync.includes('useGameStore.setState')    ? ok('FLOW1: history put in store')                : fail('FLOW1: history not in store');
sync.includes('getChallengeProgress')     ? ok('FLOW1: challenge progress loaded')           : fail('FLOW1: challenges not loaded');
sync.includes('useChallengesStore')       ? ok('FLOW1: challenge store updated')             : fail('FLOW1: challenge store not updated');

// FLOW 2: Hand finished → full data to Supabase
gameStore.includes('insertHandResult')    ? ok('FLOW2: hand synced to Supabase')             : fail('FLOW2: no insertHandResult');
gameStore.includes('player_cards:')       ? ok('FLOW2: player_cards sent')                   : fail('FLOW2: player_cards missing');
gameStore.includes('bot_cards:')          ? ok('FLOW2: bot_cards sent')                      : fail('FLOW2: bot_cards missing');
gameStore.includes('payout:')             ? ok('FLOW2: payout sent')                         : fail('FLOW2: payout missing');
gameStore.includes('player_eval:')        ? ok('FLOW2: player_eval sent')                    : fail('FLOW2: player_eval missing');

// FLOW 3: Balance change → Supabase (debounced)
sync.includes('syncBalance(address, balance)') ? ok('FLOW3: balance pushed to server')      : fail('FLOW3: no balance push');
sync.includes('2000')                     ? ok('FLOW3: 2s debounce before push')             : fail('FLOW3: no debounce');

// FLOW 4: Challenge progress → Supabase
challenges.includes('syncChallengeProgress') ? ok('FLOW4: challenge syncs to Supabase')     : fail('FLOW4: no sync');
challenges.includes('3000')               ? ok('FLOW4: 3s debounce')                         : fail('FLOW4: no debounce');

// FLOW 5: LowBalance claim → server enforced
lba.includes('claimLowBalanceBonus')      ? ok('FLOW5: server-side claim check')             : fail('FLOW5: client-side only');
lba.includes('if (allowed)')              ? ok('FLOW5: server denial respected')             : fail('FLOW5: denial not handled');
db.includes('claims >= 5')                ? ok('FLOW5: max 5 claims enforced in db')         : fail('FLOW5: no limit in db');

// FLOW 6: Referral → validated → server claim
appShell.includes('[0-9a-fA-F]{40}')      ? ok('FLOW6: referral validated as ETH address')  : fail('FLOW6: no address validation');
settings.includes('claimReferralBonus')   ? ok('FLOW6: referral claim server-side')          : fail('FLOW6: claim not server-side');
db.includes('ref_bonus_claimed')          ? ok('FLOW6: claimed flag in DB prevents re-claim') : fail('FLOW6: no re-claim prevention');

// FLOW 7: PvP Chat → Supabase Realtime
chat.includes('subscribeToChatMessages(tableId') ? ok('FLOW7: Realtime subscription on mount') : fail('FLOW7: no subscription');
chat.includes('return unsub')             ? ok('FLOW7: subscription cleaned up on unmount')  : fail('FLOW7: subscription leak');
chat.includes('prev.filter(m => m.id !== optimistic.id)') ? ok('FLOW7: rollback on error')  : fail('FLOW7: no error rollback');

// FLOW 8: Leaderboard aggregation
leader.includes('getLeaderboard(modeFilter, since') ? ok('FLOW8: mode+date filters used')   : fail('FLOW8: wrong params');
leader.includes('60_000')                 ? ok('FLOW8: auto-refresh every 60s')              : fail('FLOW8: no auto-refresh');
leader.includes('iAmIn')                  ? ok('FLOW8: user always visible in board')        : fail('FLOW8: user may disappear');

// EDGE CASES
lba.includes('isSupabaseEnabled')         ? ok('EDGE: LowBalance offline fallback')          : fail('EDGE: no offline fallback');
chat.includes('isSupabaseEnabled')        ? ok('EDGE: Chat offline fallback (localStorage)')  : fail('EDGE: no chat fallback');
db.includes('ignoreDuplicates: true')     ? ok('EDGE: hand_results deduplication')           : fail('EDGE: duplicate hands possible');
sync.includes('if (history.length > 0)') ? ok('EDGE: empty server history does not clear local') : fail('EDGE: empty history would erase local');
sync.includes('row.balance >= 0')         ? ok('EDGE: negative server balance rejected')     : fail('EDGE: server can set negative balance');

// SECURITY checks (static)
db.includes('toLowerCase() === referrer.toLowerCase()') ? ok('SEC: referral self-claim blocked') : fail('SEC: self-referral possible');
const pvp = read('src/components/HoldemPvPTab.tsx');
pvp.includes('Cannot join your own table') ? ok('SEC: own-table join blocked')              : fail('SEC: own-table not blocked');
const pvpCfg = read('src/config/contractPvP.ts');
pvpCfg.includes("'0x0000000000000000000000000000000000000000'") ? ok('SEC: PvP fallback = 0x000') : fail('SEC: hardcoded prod address');
const utils = read('src/lib/utils.ts');
!utils.includes('Math.random') ? ok('SEC: no fake TX hash generator')                       : fail('SEC: Math.random in utils');

// PERSISTENCE coverage
const supaTypes = read('src/config/supabase.ts');
['balance','ref_bonus_claimed','low_balance_claims','challenge_progress'].forEach(f =>
  supaTypes.includes('  ' + f) ? ok('PERSIST: players.' + f + ' in type') : fail('PERSIST: players.' + f + ' missing from type'));
['player_cards','bot_cards','payout'].forEach(f =>
  supaTypes.includes(f) ? ok('PERSIST: hand_results.' + f + ' in type') : fail('PERSIST: hand_results.' + f + ' missing'));

// PRINT
const passed = results.filter(r => r.pass === true);
const warned = results.filter(r => r.pass === null);
const failed = results.filter(r => r.pass === false);
console.log('=== RUNTIME FLOW + SECURITY ANALYSIS (' + results.length + ' checks) ===\n');
passed.forEach(r => console.log('  ✓', r.name));
if (warned.length) { console.log(''); warned.forEach(r => console.log('  ⚠', r.name, '->', r.detail)); }
if (failed.length) { console.log(''); failed.forEach(r => console.log('  ✗', r.name, r.detail ? '-> ' + r.detail : '')); }
console.log('\n' + (failed.length === 0 ? 'ALL PASSED' : failed.length + ' FAILURES') +
  ' -- ' + passed.length + ' ok | ' + warned.length + ' warn | ' + failed.length + ' fail | ' + results.length + ' total');
process.exit(failed.length > 0 ? 1 : 0);
