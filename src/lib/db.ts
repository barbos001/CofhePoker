/**
 * db.ts — All Supabase database operations.
 * Every function is safe to call even if Supabase is not configured
 * (isSupabaseEnabled guard — operations silently no-op when disabled).
 */
import { supabase, isSupabaseEnabled, PlayerRow, HandResultRow, ChatMessageRow, ActiveTableRow, GameInviteRow } from '@/config/supabase';

// ── Players ───────────────────────────────────────────────────────────────────

export async function upsertPlayer(
  address: string,
  data: Partial<Omit<PlayerRow, 'address' | 'updated_at'>>,
): Promise<void> {
  if (!isSupabaseEnabled || !address) return;
  await supabase!
    .from('players')
    .upsert({ address, ...data, updated_at: new Date().toISOString() }, { onConflict: 'address' });
}

export async function syncBalance(address: string, balance: number): Promise<void> {
  if (!isSupabaseEnabled || !address) return;
  await supabase!.from('players')
    .upsert({ address, balance, updated_at: new Date().toISOString() }, { onConflict: 'address' });
}

// Returns allowed=true and new balance (1000) if claim is within limit (max 5 per account)
export async function claimLowBalanceBonus(address: string): Promise<{ allowed: boolean; newBalance: number }> {
  if (!isSupabaseEnabled || !address) return { allowed: true, newBalance: 1000 };
  const { data } = await supabase!.from('players').select('low_balance_claims').eq('address', address).single();
  const claims = (data?.low_balance_claims ?? 0);
  if (claims >= 5) return { allowed: false, newBalance: 0 };
  await supabase!.from('players').upsert(
    { address, low_balance_claims: claims + 1, balance: 1000, updated_at: new Date().toISOString() },
    { onConflict: 'address' },
  );
  return { allowed: true, newBalance: 1000 };
}

export async function syncChallengeProgress(address: string, progress: Record<string, number>): Promise<void> {
  if (!isSupabaseEnabled || !address) return;
  await supabase!.from('players').upsert(
    { address, challenge_progress: JSON.stringify(progress), updated_at: new Date().toISOString() },
    { onConflict: 'address' },
  );
}

export async function getChallengeProgress(address: string): Promise<Record<string, number>> {
  if (!isSupabaseEnabled || !address) return {};
  const { data } = await supabase!.from('players').select('challenge_progress').eq('address', address).single();
  try { return JSON.parse(data?.challenge_progress ?? '{}'); } catch { return {}; }
}

export async function claimReferralBonus(address: string, referrer: string): Promise<boolean> {
  if (!isSupabaseEnabled || !address || !referrer) return false;
  if (address.toLowerCase() === referrer.toLowerCase()) return false;
  const { data } = await supabase!.from('players').select('ref_bonus_claimed, balance').eq('address', address).single();
  if (data?.ref_bonus_claimed) return false;
  const newBalance = (data?.balance ?? 1000) + 200;
  await supabase!.from('players').upsert(
    { address, ref_bonus_claimed: true, balance: newBalance, updated_at: new Date().toISOString() },
    { onConflict: 'address' },
  );
  return true;
}

export async function getPlayer(address: string): Promise<PlayerRow | null> {
  if (!isSupabaseEnabled || !address) return null;
  const { data } = await supabase!
    .from('players')
    .select('*')
    .eq('address', address)
    .single();
  return data ?? null;
}

export async function getTopPlayers(limit = 20): Promise<PlayerRow[]> {
  if (!isSupabaseEnabled) return [];
  const { data } = await supabase!
    .from('players')
    .select('*')
    .order('xp', { ascending: false })
    .limit(limit);
  return data ?? [];
}

// ── Hand results ──────────────────────────────────────────────────────────────

export async function getPlayerHandHistory(address: string, limit = 100): Promise<HandResultRow[]> {
  if (!isSupabaseEnabled || !address) return [];
  const { data } = await supabase!
    .from('hand_results')
    .select('*')
    .eq('player_address', address)
    .order('played_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function insertHandResult(row: HandResultRow): Promise<void> {
  if (!isSupabaseEnabled) return;
  await supabase!
    .from('hand_results')
    .upsert(row, { onConflict: 'id', ignoreDuplicates: true });
}

export async function getLeaderboard(
  mode: 'all' | 'three-card' | 'holdem' | 'pvp' = 'all',
  since?: Date,
  limit = 20,
): Promise<LeaderEntry[]> {
  if (!isSupabaseEnabled) return [];

  let q = supabase!.from('hand_results').select('player_address, result, delta');
  if (mode !== 'all')  q = q.eq('mode', mode);
  if (since)           q = q.gte('played_at', since.toISOString());

  const { data: rows } = await q;
  if (!rows || rows.length === 0) return [];

  // Aggregate client-side
  const map = new Map<string, { wins: number; total: number; delta: number }>();
  for (const r of rows) {
    const e = map.get(r.player_address) ?? { wins: 0, total: 0, delta: 0 };
    e.total++;
    if (r.result === 'WON') e.wins++;
    e.delta += r.delta;
    map.set(r.player_address, e);
  }

  // Fetch usernames + elo
  const addresses = [...map.keys()];
  const { data: players } = await supabase!
    .from('players')
    .select('address, username, elo')
    .in('address', addresses);

  const nameMap = new Map<string, string>(
    (players ?? []).map(p => [p.address, p.username || p.address.slice(0, 10)]),
  );
  const eloMap = new Map<string, number>(
    (players ?? []).map(p => [p.address, p.elo ?? 1200]),
  );

  return [...map.entries()]
    .map(([addr, s]) => ({
      player_address: addr,
      username:       nameMap.get(addr) ?? `${addr.slice(0, 6)}…${addr.slice(-4)}`,
      total_hands:    s.total,
      wins:           s.wins,
      total_delta:    s.delta,
      win_rate:       s.total > 0 ? Math.round((s.wins / s.total) * 100) : 0,
      elo:            eloMap.get(addr) ?? 1200,
    }))
    .sort((a, b) => b.total_delta - a.total_delta)
    .slice(0, limit);
}

// ── PvP Chat ──────────────────────────────────────────────────────────────────

export async function sendChatMessage(
  tableId: number,
  sender: string,
  senderName: string | null,
  text: string,
): Promise<void> {
  if (!isSupabaseEnabled) return;
  await supabase!.from('pvp_chat').insert({
    table_id:    tableId,
    sender,
    sender_name: senderName,
    text,
  });
}

export async function getChatHistory(tableId: number, limit = 50): Promise<ChatMessageRow[]> {
  if (!isSupabaseEnabled) return [];
  const { data } = await supabase!
    .from('pvp_chat')
    .select('*')
    .eq('table_id', tableId)
    .order('created_at', { ascending: true })
    .limit(limit);
  return data ?? [];
}

export function subscribeToChatMessages(
  tableId: number,
  onMessage: (msg: ChatMessageRow) => void,
) {
  if (!isSupabaseEnabled) return () => {};
  const channel = supabase!
    .channel(`pvp_chat:${tableId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'pvp_chat', filter: `table_id=eq.${tableId}` },
      (payload) => onMessage(payload.new as ChatMessageRow),
    )
    .subscribe();

  return () => { supabase!.removeChannel(channel); };
}

// ── Elo ───────────────────────────────────────────────────────────────────────

const ELO_K = 32;

function eloChange(ratingA: number, ratingB: number, aWon: boolean): [number, number] {
  const expected = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const deltaA = Math.round(ELO_K * ((aWon ? 1 : 0) - expected));
  return [deltaA, -deltaA];
}

export async function updateElo(winner: string, loser: string): Promise<void> {
  if (!isSupabaseEnabled || !winner || !loser) return;
  try {
    const { data } = await supabase!
      .from('players')
      .select('address, elo')
      .in('address', [winner.toLowerCase(), loser.toLowerCase()]);
    if (!data) return;
    const byAddr = new Map(data.map(r => [r.address, r.elo ?? 1200]));
    const wElo = byAddr.get(winner.toLowerCase()) ?? 1200;
    const lElo = byAddr.get(loser.toLowerCase()) ?? 1200;
    const [dW, dL] = eloChange(wElo, lElo, true);
    await Promise.all([
      supabase!.from('players').upsert(
        { address: winner.toLowerCase(), elo: wElo + dW, updated_at: new Date().toISOString() },
        { onConflict: 'address' },
      ),
      supabase!.from('players').upsert(
        { address: loser.toLowerCase(), elo: lElo + dL, updated_at: new Date().toISOString() },
        { onConflict: 'address' },
      ),
    ]);
  } catch { /* offline */ }
}

export async function getPlayerElo(address: string): Promise<number> {
  if (!isSupabaseEnabled || !address) return 1200;
  const { data } = await supabase!
    .from('players')
    .select('elo')
    .eq('address', address.toLowerCase())
    .single();
  return data?.elo ?? 1200;
}

// ── Active tables (spectator) ──────────────────────────────────────────────────

export async function upsertActiveTable(row: Partial<ActiveTableRow> & { table_id: number }): Promise<void> {
  if (!isSupabaseEnabled) return;
  await supabase!
    .from('pvp_active_tables')
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'table_id' });
}

export async function removeActiveTable(tableId: number): Promise<void> {
  if (!isSupabaseEnabled) return;
  await supabase!.from('pvp_active_tables').delete().eq('table_id', tableId);
}

export async function getActiveTables(): Promise<ActiveTableRow[]> {
  if (!isSupabaseEnabled) return [];
  const { data } = await supabase!
    .from('pvp_active_tables')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(50);
  return (data ?? []) as ActiveTableRow[];
}

export function subscribeToActiveTables(onChange: () => void): () => void {
  if (!isSupabaseEnabled) return () => {};
  const channel = supabase!
    .channel('pvp_active_tables_watch')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pvp_active_tables' }, onChange)
    .subscribe();
  return () => { supabase!.removeChannel(channel); };
}

// ── Game invites ──────────────────────────────────────────────────────────────

export async function sendGameInviteDB(fromAddr: string, toAddr: string, tableId: number): Promise<void> {
  if (!isSupabaseEnabled) return;
  // Remove any previous pending invite from same sender to same recipient
  await supabase!.from('game_invites')
    .delete()
    .eq('from_addr', fromAddr.toLowerCase())
    .eq('to_addr', toAddr.toLowerCase())
    .eq('status', 'pending');
  await supabase!.from('game_invites').insert({
    from_addr: fromAddr.toLowerCase(),
    to_addr:   toAddr.toLowerCase(),
    table_id:  tableId,
    status:    'pending',
  });
}

export async function getMyGameInvites(address: string): Promise<GameInviteRow[]> {
  if (!isSupabaseEnabled || !address) return [];
  const { data } = await supabase!
    .from('game_invites')
    .select('*')
    .eq('to_addr', address.toLowerCase())
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(10);
  return (data ?? []) as GameInviteRow[];
}

export async function respondToGameInvite(id: string, status: 'accepted' | 'declined'): Promise<void> {
  if (!isSupabaseEnabled) return;
  await supabase!.from('game_invites').update({ status }).eq('id', id);
}

export function subscribeToGameInvites(address: string, onInvite: (invite: GameInviteRow) => void): () => void {
  if (!isSupabaseEnabled || !address) return () => {};
  const channel = supabase!
    .channel(`game_invites:${address.toLowerCase()}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'game_invites', filter: `to_addr=eq.${address.toLowerCase()}` },
      (payload) => onInvite(payload.new as GameInviteRow),
    )
    .subscribe();
  return () => { supabase!.removeChannel(channel); };
}

// Update LeaderEntry to include elo
export interface LeaderEntry {
  player_address: string;
  username:       string;
  total_hands:    number;
  wins:           number;
  total_delta:    number;
  win_rate:       number;
  elo:            number;
}
