/**
 * db.ts — All Supabase database operations.
 * Every function is safe to call even if Supabase is not configured
 * (isSupabaseEnabled guard — operations silently no-op when disabled).
 */
import { supabase, isSupabaseEnabled, PlayerRow, HandResultRow, ChatMessageRow } from '@/config/supabase';

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

export interface LeaderEntry {
  player_address: string;
  username:       string;
  total_hands:    number;
  wins:           number;
  total_delta:    number;
  win_rate:       number;
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

  // Fetch usernames
  const addresses = [...map.keys()];
  const { data: players } = await supabase!
    .from('players')
    .select('address, username')
    .in('address', addresses);

  const nameMap = new Map<string, string>(
    (players ?? []).map(p => [p.address, p.username || p.address.slice(0, 10)]),
  );

  return [...map.entries()]
    .map(([addr, s]) => ({
      player_address: addr,
      username:       nameMap.get(addr) ?? `${addr.slice(0, 6)}…${addr.slice(-4)}`,
      total_hands:    s.total,
      wins:           s.wins,
      total_delta:    s.delta,
      win_rate:       s.total > 0 ? Math.round((s.wins / s.total) * 100) : 0,
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
