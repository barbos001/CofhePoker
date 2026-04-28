import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not set — backend sync disabled');
}

export const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null;

export const isSupabaseEnabled = !!supabase;

// ── Table row types (mirror schema in supabase/schema.sql) ────────────────────

export interface PlayerRow {
  address:             string;
  username:            string;
  avatar_id:           string;
  xp:                  number;
  achievements:        string;     // JSON array
  balance:             number;     // play-money chip balance (server authoritative)
  ref_bonus_claimed:   boolean;
  low_balance_claims:  number;
  challenge_progress:  string;     // JSON { [challengeId]: number }
  elo:                 number;     // PvP Elo rating, starts at 1200
  updated_at:          string;
}

export interface ActiveTableRow {
  table_id:   number;
  player1:    string;
  player2:    string;
  state:      number;
  pot:        number;
  buy_in:     number;
  is_private: boolean;
  round_name: string;
  updated_at: string;
}

export interface GameInviteRow {
  id:         string;
  from_addr:  string;
  to_addr:    string;
  table_id:   number;
  status:     'pending' | 'accepted' | 'declined';
  created_at: string;
}

export interface HandResultRow {
  id:             string;   // `${txHash}-${timestamp}`
  player_address: string;
  mode:           string;   // 'three-card' | 'holdem' | 'pvp'
  result:         string;   // 'WON' | 'LOST' | 'FOLD' | 'PUSH'
  delta:          number;
  pot:            number;
  eval_name:      string | null;
  tx_hash:        string;
  played_at:      string;
  player_cards:   string | null;  // JSON number[]
  bot_cards:      string | null;  // JSON number[]
  player_eval:    string | null;  // hand name string
  bot_eval:       string | null;  // hand name string
  payout:         string | null;  // JSON PayoutResult
}

export interface ChatMessageRow {
  id:          string;
  table_id:    number;
  sender:      string;      // wallet address or 'system'
  sender_name: string | null;
  text:        string;
  created_at:  string;
}
