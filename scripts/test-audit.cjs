const fs = require('fs');
const results = [];
const ok   = (name) => results.push({ pass: true,  name });
const fail = (name, detail) => results.push({ pass: false, name, detail: detail || '' });
const read = (f) => fs.readFileSync(f, 'utf8');

// ── SCHEMA ────────────────────────────────────────────────────────────────
const schema = read('supabase/schema.sql');
const checks_schema = [
  ['Schema: balance in players',         schema.includes('balance             integer')],
  ['Schema: ref_bonus_claimed',          schema.includes('ref_bonus_claimed')],
  ['Schema: low_balance_claims',         schema.includes('low_balance_claims')],
  ['Schema: challenge_progress',         schema.includes('challenge_progress')],
  ['Schema: player_cards in hand_results', schema.includes('player_cards')],
  ['Schema: bot_cards',                  schema.includes('bot_cards')],
  ['Schema: payout',                     schema.includes('payout')],
  ['Schema: idempotent drop policy',     schema.includes('drop policy if exists')],
  ['Schema: safe ALTER TABLE',           schema.includes('add column if not exists balance')],
  ['Schema: pvp_chat realtime',          schema.includes('supabase_realtime')],
];
checks_schema.forEach(([n,v]) => v ? ok(n) : fail(n));

// ── DB.TS ─────────────────────────────────────────────────────────────────
const db = read('src/lib/db.ts');
['syncBalance','claimLowBalanceBonus','claimReferralBonus','getPlayerHandHistory',
 'syncChallengeProgress','getChallengeProgress','getLeaderboard','getChatHistory',
 'subscribeToChatMessages','sendChatMessage','insertHandResult','upsertPlayer','getPlayer',
].forEach(fn => db.includes('function ' + fn) ? ok('db: ' + fn) : fail('db: missing ' + fn));
db.includes('toLowerCase() === referrer.toLowerCase()') ? ok('db: referral self-claim blocked') : fail('db: self-claim not blocked');
db.includes('claims >= 5') ? ok('db: LowBalance max claims = 5') : fail('db: no claim limit');
db.includes('ignoreDuplicates: true') ? ok('db: hand_results deduplication') : fail('db: no dedup on hand_results');

// ── SUPABASE TYPES ────────────────────────────────────────────────────────
const supaTypes = read('src/config/supabase.ts');
['balance','ref_bonus_claimed','low_balance_claims','challenge_progress'].forEach(f =>
  supaTypes.includes(f) ? ok('PlayerRow.' + f) : fail('PlayerRow: missing ' + f));
['player_cards','bot_cards','player_eval','bot_eval','payout'].forEach(f =>
  supaTypes.includes(f) ? ok('HandResultRow.' + f) : fail('HandResultRow: missing ' + f));

// ── GAME STORE ────────────────────────────────────────────────────────────
const gameStore = read('src/store/useGameStore.ts');
const partMatch = gameStore.match(/partialize[\s\S]*?\}\)/);
if (partMatch) {
  const p = partMatch[0];
  !p.includes('history') ? ok('GameStore: history NOT in localStorage') : fail('GameStore: history in localStorage!');
  !p.includes('balance') ? ok('GameStore: balance NOT in localStorage') : fail('GameStore: balance in localStorage!');
} else {
  fail('GameStore: partialize not found');
}
gameStore.includes('crypto.randomUUID()') ? ok('GameStore: UUID hand IDs') : fail('GameStore: Math.random IDs');
gameStore.includes("player_cards:") ? ok('GameStore: full card data synced to Supabase') : fail('GameStore: no card data in sync');
gameStore.includes("bot_cards:") ? ok('GameStore: bot_cards synced') : fail('GameStore: bot_cards missing');
gameStore.includes("payout:") ? ok('GameStore: payout synced') : fail('GameStore: payout missing');

// ── PROFILE SYNC ──────────────────────────────────────────────────────────
const profileSync = read('src/hooks/useProfileSync.ts');
profileSync.includes('row.balance') ? ok('ProfileSync: balance loaded from Supabase') : fail('ProfileSync: no balance load');
profileSync.includes('getPlayerHandHistory') ? ok('ProfileSync: history loaded from Supabase') : fail('ProfileSync: no history load');
profileSync.includes('getChallengeProgress') ? ok('ProfileSync: challenges loaded from Supabase') : fail('ProfileSync: no challenge load');
profileSync.includes('syncBalance(address, balance)') ? ok('ProfileSync: balance pushed to Supabase') : fail('ProfileSync: no balance push');
profileSync.includes('useGameStore.setState({ history })') ? ok('ProfileSync: history set in store') : fail('ProfileSync: history not set');
profileSync.includes('useChallengesStore') ? ok('ProfileSync: challenge progress restored') : fail('ProfileSync: challenges not restored');
profileSync.includes('balance: 1000') ? ok('ProfileSync: new player seeded with 1000 balance') : fail('ProfileSync: new player not seeded');

// ── CHALLENGES ────────────────────────────────────────────────────────────
const challenges = read('src/store/useChallengesStore.ts');
challenges.includes('syncChallengeProgress') ? ok('Challenges: syncs to Supabase on increment') : fail('Challenges: no Supabase sync');
challenges.includes('useGameStore') ? ok('Challenges: uses wallet address for sync') : fail('Challenges: no address lookup');

// ── APP SHELL ─────────────────────────────────────────────────────────────
const appShell = read('src/components/AppShell.tsx');
appShell.includes('0x[0-9a-fA-F]{40}') ? ok('AppShell: ETH address validation on referral') : fail('AppShell: no ETH validation');
appShell.includes('refreshIfNeeded') ? ok('AppShell: challenges auto-refresh on mount') : fail('AppShell: no challenge refresh');
appShell.includes('useProfileSync') ? ok('AppShell: useProfileSync mounted') : fail('AppShell: useProfileSync missing');

// ── CONTRACT PVP ──────────────────────────────────────────────────────────
const pvpCfg = read('src/config/contractPvP.ts');
pvpCfg.includes("'0x0000000000000000000000000000000000000000'") ? ok('contractPvP: safe fallback') : fail('contractPvP: hardcoded prod address!');

// ── PVP JOIN GUARD ────────────────────────────────────────────────────────
const pvpTab = read('src/components/HoldemPvPTab.tsx');
pvpTab.includes('Cannot join your own table') ? ok('PvPTab: own-table join blocked') : fail('PvPTab: own-table not blocked');
pvpTab.includes("state !== HoldemPvPState.OPEN") ? ok('PvPTab: state check before join') : fail('PvPTab: no state check');

// ── LOW BALANCE ALERT ─────────────────────────────────────────────────────
const lba = read('src/components/ui/LowBalanceAlert.tsx');
lba.includes('claimLowBalanceBonus') ? ok('LowBalance: Supabase claim') : fail('LowBalance: no Supabase');
lba.includes('isConnected') ? ok('LowBalance: requires connected wallet') : fail('LowBalance: no wallet guard');
lba.includes('allowed: false') ? ok('LowBalance: handles server denial') : fail('LowBalance: no denial handling');

// ── SETTINGS REFERRAL ─────────────────────────────────────────────────────
const settings = read('src/components/SettingsTab.tsx');
settings.includes('claimReferralBonus') ? ok('Settings: referral via Supabase') : fail('Settings: localStorage referral');
settings.includes('setLoading') ? ok('Settings: referral has loading state') : fail('Settings: no loading state');
settings.includes('denied') ? ok('Settings: shows denied when already claimed') : fail('Settings: no denied state');

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────
const notifs = read('src/store/useNotificationsStore.ts');
notifs.includes('notifications:  s.notifications.slice(0, 30)') ? ok('Notifications: 30 persisted in localStorage') : fail('Notifications: not persisted');
notifs.includes('slice(0, 50)') ? ok('Notifications: capped at 50 in memory') : fail('Notifications: no in-memory cap');

// ── TOAST ─────────────────────────────────────────────────────────────────
const toast = read('src/components/ui/Toast.tsx');
toast.includes("'pending'") ? ok('Toast: pending type exists') : fail('Toast: no pending type');
toast.includes('animate-spin') ? ok('Toast: pending spinner') : fail('Toast: no spinner');
toast.includes('999_999') ? ok('Toast: pending does not auto-close') : fail('Toast: pending auto-closes');

// ── HISTORY TAB ────────────────────────────────────────────────────────────
const histTab = read('src/components/HistoryTab.tsx');
histTab.includes('getPlayerHandHistory') ? ok('HistoryTab: loads from Supabase') : fail('HistoryTab: no Supabase load');
histTab.includes('allHistory') ? ok('HistoryTab: uses merged history') : fail('HistoryTab: not using merged');
histTab.includes('serverLoading') ? ok('HistoryTab: shows loading state') : fail('HistoryTab: no loading state');
histTab.includes('aria-label') ? ok('HistoryTab: accessibility labels') : fail('HistoryTab: no aria-labels');

// ── LEADERBOARD ────────────────────────────────────────────────────────────
const leader = read('src/components/LeaderboardTab.tsx');
leader.includes('getLeaderboard') ? ok('Leaderboard: fetches from Supabase') : fail('Leaderboard: no Supabase fetch');
leader.includes('isSupabaseEnabled') ? ok('Leaderboard: Supabase guard') : fail('Leaderboard: no guard');
leader.includes('setLoading') ? ok('Leaderboard: loading state') : fail('Leaderboard: no loading state');
leader.includes('fetchLeaderboard') ? ok('Leaderboard: auto-refresh') : fail('Leaderboard: no refresh');

// ── PVP CHAT ──────────────────────────────────────────────────────────────
const chat = read('src/components/ui/PvPChat.tsx');
chat.includes('subscribeToChatMessages') ? ok('PvPChat: Supabase Realtime subscription') : fail('PvPChat: no Realtime');
chat.includes('getChatHistory') ? ok('PvPChat: loads history from Supabase') : fail('PvPChat: no history load');
chat.includes('sendChatMessage') ? ok('PvPChat: sends via Supabase') : fail('PvPChat: not sending to Supabase');
chat.includes('local only') ? ok('PvPChat: shows local-only indicator') : fail('PvPChat: no fallback indicator');

// ── UTILS ─────────────────────────────────────────────────────────────────
const utils = read('src/lib/utils.ts');
!utils.includes('Math.random') ? ok('utils: generateTxHash removed') : fail('utils: Math.random still in utils');

// ── ENV VARS ──────────────────────────────────────────────────────────────
const env = read('.env');
env.includes('VITE_SUPABASE_URL=https://') ? ok('.env: Supabase URL configured') : fail('.env: Supabase URL missing');
env.includes('VITE_SUPABASE_ANON_KEY=eyJ') ? ok('.env: Supabase key configured') : fail('.env: Supabase key missing');
env.includes('VITE_CONTRACT_ADDRESS=0x') ? ok('.env: Contract address set') : fail('.env: Contract address missing');

// ── SERVICE WORKER ────────────────────────────────────────────────────────
const sw = read('public/sw.js');
sw.includes("request.method !== 'GET'") ? ok('SW: only caches GET requests') : fail('SW: caches POST requests (bug!)');

// ── PRINT RESULTS ─────────────────────────────────────────────────────────
const passed = results.filter(r => r.pass);
const failed = results.filter(r => !r.pass);
console.log('\n=== FULL TEST REPORT (' + results.length + ' checks) ===\n');
console.log('PASSED (' + passed.length + '):');
passed.forEach(r => console.log('  ✓', r.name));
if (failed.length) {
  console.log('\nFAILED (' + failed.length + '):');
  failed.forEach(r => console.log('  ✗', r.name, r.detail ? '→ ' + r.detail : ''));
}
console.log('\n' + (failed.length === 0 ? '✅ ALL PASSED' : '❌ ' + failed.length + ' FAILURES') + ' — ' + passed.length + '/' + results.length);
process.exit(failed.length > 0 ? 1 : 0);
