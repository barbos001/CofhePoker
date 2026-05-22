-- CipherPoker — Supabase schema
-- Safe to re-run: drops existing policies before recreating them

-- ─── players ─────────────────────────────────────────────────────────────────
create table if not exists players (
  address              text primary key,
  username             text not null default '',
  avatar_id            text not null default 'ace-spades',
  xp                   integer not null default 0,
  achievements         text not null default '[]',
  balance              integer not null default 1000,
  ref_bonus_claimed    boolean not null default false,
  low_balance_claims   integer not null default 0,
  updated_at           timestamptz not null default now()
);

-- Add new columns to existing table (safe if already exist)
alter table players add column if not exists balance             integer not null default 1000;
alter table players add column if not exists ref_bonus_claimed   boolean not null default false;
alter table players add column if not exists low_balance_claims  integer not null default 0;
alter table players add column if not exists challenge_progress  text    not null default '{}';

alter table players enable row level security;

drop policy if exists "public read players"   on players;
drop policy if exists "owner upsert players"  on players;
drop policy if exists "owner update players"  on players;

create policy "public read players"   on players for select using (true);
create policy "owner upsert players"  on players for insert with check (true);
create policy "owner update players"  on players for update using (true);

-- ─── hand_results ─────────────────────────────────────────────────────────────
create table if not exists hand_results (
  id             text primary key,
  player_address text not null,
  mode           text not null check (mode in ('three-card', 'holdem', 'pvp')),
  result         text not null check (result in ('WON', 'LOST', 'FOLD', 'PUSH')),
  delta          integer not null,
  pot            integer not null default 0,
  eval_name      text,
  tx_hash        text not null default '',
  played_at      timestamptz not null default now(),
  player_cards   text,
  bot_cards      text,
  player_eval    text,
  bot_eval       text,
  payout         text
);

-- Add new columns to existing table (safe if already exist)
alter table hand_results add column if not exists player_cards text;
alter table hand_results add column if not exists bot_cards    text;
alter table hand_results add column if not exists player_eval  text;
alter table hand_results add column if not exists bot_eval     text;
alter table hand_results add column if not exists payout       text;

create index if not exists hand_results_player_idx on hand_results(player_address);
create index if not exists hand_results_mode_idx   on hand_results(mode);
create index if not exists hand_results_played_idx on hand_results(played_at desc);

alter table hand_results enable row level security;

drop policy if exists "public read hand_results" on hand_results;
drop policy if exists "insert hand_results"      on hand_results;

create policy "public read hand_results" on hand_results for select using (true);
create policy "insert hand_results"      on hand_results for insert with check (true);

-- ─── pvp_chat ─────────────────────────────────────────────────────────────────
create table if not exists pvp_chat (
  id          uuid primary key default gen_random_uuid(),
  table_id    integer not null,
  sender      text not null,
  sender_name text check (char_length(sender_name) <= 60),
  text        text not null check (char_length(text) <= 120),
  created_at  timestamptz not null default now()
);

create index if not exists pvp_chat_table_idx on pvp_chat(table_id, created_at desc);

create or replace function delete_old_chat_messages() returns trigger as $$
begin
  delete from pvp_chat where created_at < now() - interval '24 hours';
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_delete_old_chat on pvp_chat;
create trigger trg_delete_old_chat
  after insert on pvp_chat
  execute procedure delete_old_chat_messages();

alter table pvp_chat enable row level security;

drop policy if exists "public read pvp_chat" on pvp_chat;
drop policy if exists "insert pvp_chat"      on pvp_chat;

create policy "public read pvp_chat" on pvp_chat for select using (true);
create policy "insert pvp_chat"      on pvp_chat for insert with check (true);

-- ─── Elo rating ───────────────────────────────────────────────────────────────
alter table players add column if not exists elo integer not null default 1200;

-- ─── pvp_active_tables ────────────────────────────────────────────────────────
-- Tracks live PvP games for the spectator view. Rows inserted on table create,
-- updated on join/state changes, deleted when the hand completes.
create table if not exists pvp_active_tables (
  table_id    integer primary key,
  player1     text    not null,
  player2     text    not null default '',
  state       integer not null default 0,
  pot         integer not null default 0,
  buy_in      integer not null default 25,
  is_private  boolean not null default false,
  round_name  text    not null default '',
  updated_at  timestamptz not null default now()
);

alter table pvp_active_tables enable row level security;

drop policy if exists "public read pvp_active_tables" on pvp_active_tables;
drop policy if exists "upsert pvp_active_tables"      on pvp_active_tables;
drop policy if exists "update pvp_active_tables"      on pvp_active_tables;
drop policy if exists "delete pvp_active_tables"      on pvp_active_tables;

create policy "public read pvp_active_tables" on pvp_active_tables for select using (true);
create policy "upsert pvp_active_tables"      on pvp_active_tables for insert with check (true);
create policy "update pvp_active_tables"      on pvp_active_tables for update using (true);
create policy "delete pvp_active_tables"      on pvp_active_tables for delete using (true);

-- ─── game_invites ─────────────────────────────────────────────────────────────
-- Tracks friend game invitations so recipients see them cross-device.
create table if not exists game_invites (
  id          uuid    primary key default gen_random_uuid(),
  from_addr   text    not null,
  to_addr     text    not null,
  table_id    integer not null,
  status      text    not null default 'pending'
              check (status in ('pending', 'accepted', 'declined')),
  created_at  timestamptz not null default now()
);

create index if not exists game_invites_to_idx   on game_invites(to_addr,   status);
create index if not exists game_invites_from_idx on game_invites(from_addr, status);

alter table game_invites enable row level security;

drop policy if exists "public read game_invites" on game_invites;
drop policy if exists "insert game_invites"      on game_invites;
drop policy if exists "update game_invites"      on game_invites;

create policy "public read game_invites" on game_invites for select using (true);
create policy "insert game_invites"      on game_invites for insert with check (true);
create policy "update game_invites"      on game_invites for update using (true);

-- Auto-expire stale active tables (no update in 30 min = game abandoned)
create or replace function delete_stale_active_tables() returns trigger as $$
begin
  delete from pvp_active_tables where updated_at < now() - interval '30 minutes';
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_delete_stale_tables on pvp_active_tables;
create trigger trg_delete_stale_tables
  after insert or update on pvp_active_tables
  execute procedure delete_stale_active_tables();

-- ─── Realtime publication ─────────────────────────────────────────────────────
do $$ begin
  alter publication supabase_realtime add table pvp_chat;
exception when others then null; -- already a member, skip
end $$;

do $$ begin
  alter publication supabase_realtime add table pvp_active_tables;
exception when others then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table game_invites;
exception when others then null;
end $$;
