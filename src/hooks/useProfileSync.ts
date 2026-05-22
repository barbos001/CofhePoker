/**
 * useProfileSync — bidirectional sync between useProfileStore (local) and Supabase (backend).
 *
 * On wallet connect:  load profile from Supabase → merge into local store
 * On profile change:  debounce 1s → upsert to Supabase
 *
 * Safely no-ops when Supabase is not configured.
 */
import { useEffect, useRef, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { useProfileStore } from '@/store/useProfileStore';
import { useGameStore } from '@/store/useGameStore';
import { getPlayer, upsertPlayer, syncBalance, getPlayerHandHistory, getChallengeProgress } from '@/lib/db';
import { isSupabaseEnabled } from '@/config/supabase';
import type { HandHistory } from '@/store/useGameStore';

export const useProfileSync = () => {
  const { address, isConnected } = useAccount();
  const { username, avatarId, xp, achievements, setUsername, setAvatarId, addXP, unlockAchievement } = useProfileStore();
  const balance    = useGameStore(s => s.balance);
  const setBalance = useGameStore(s => s.setBalance);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const balDebRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef   = useRef<string | null>(null);

  // ── Load from Supabase on wallet connect ─────────────────────────────────
  const loadProfile = useCallback(async (addr: string) => {
    if (!isSupabaseEnabled || loadedRef.current === addr) return;
    loadedRef.current = addr;

    try {
      const row = await getPlayer(addr);
      if (!row) {
        // New player — seed initial row with starting balance
        await upsertPlayer(addr, { username: '', avatar_id: 'ace-spades', xp: 0, achievements: '[]', balance: 1000 });
        return;
      }

      // Merge remote into local (take the max XP — never regress)
      if (row.username && !useProfileStore.getState().username) {
        setUsername(row.username);
      }
      if (row.avatar_id) {
        setAvatarId(row.avatar_id as any);
      }
      if (row.xp > useProfileStore.getState().xp) {
        addXP(row.xp - useProfileStore.getState().xp);
      }
      // Balance: server is authoritative — always load from Supabase
      if (typeof row.balance === 'number' && row.balance >= 0) {
        setBalance(row.balance);
      }

      // Unlock any achievements that Supabase has but local doesn't
      try {
        const remoteAch: { id: string; unlockedAt?: number }[] = JSON.parse(row.achievements || '[]');
        const localAch = useProfileStore.getState().achievements;
        for (const ra of remoteAch) {
          if (ra.unlockedAt && !localAch.find(a => a.id === ra.id && a.unlockedAt)) {
            unlockAchievement(ra.id);
          }
        }
      } catch { /* ignore parse errors */ }

      // Load full hand history from Supabase → set in game store
      try {
        const rows = await getPlayerHandHistory(addr, 200);
        const history: HandHistory[] = rows.map(r => ({
          id:          r.id,
          result:      r.result as HandHistory['result'],
          desc:        r.player_eval ?? r.eval_name ?? r.result,
          delta:       r.delta,
          txHash:      r.tx_hash,
          playerCards: r.player_cards ? JSON.parse(r.player_cards) : [],
          botCards:    r.bot_cards    ? JSON.parse(r.bot_cards)    : [],
          payout:      r.payout       ? JSON.parse(r.payout)       : undefined,
          playerEval:  r.player_eval  ? { name: r.player_eval, score: 0, cards: [] } : undefined,
          botEval:     r.bot_eval     ? { name: r.bot_eval,    score: 0, cards: [] } : undefined,
          gameMode:    r.mode as HandHistory['gameMode'],
          timestamp:   new Date(r.played_at).getTime(),
        }));
        if (history.length > 0) {
          useGameStore.setState({ history });
        }
      } catch { /* ignore */ }

      // Load challenge progress from Supabase
      try {
        const progress = await getChallengeProgress(addr);
        if (Object.keys(progress).length > 0) {
          const { useChallengesStore } = await import('@/store/useChallengesStore');
          useChallengesStore.setState(s => ({
            challenges: s.challenges.map(c => ({
              ...c,
              progress: Math.min(c.goal, progress[c.id] ?? c.progress),
            })),
          }));
        }
      } catch { /* ignore */ }

    } catch { /* Supabase offline */ }
  }, [setUsername, setAvatarId, addXP, unlockAchievement, setBalance]);

  useEffect(() => {
    if (isConnected && address) loadProfile(address);
  }, [isConnected, address, loadProfile]);

  // ── Push profile changes to Supabase (debounced 1.5s) ───────────────────
  const pushProfile = useCallback(() => {
    if (!isSupabaseEnabled || !address) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      upsertPlayer(address, {
        username:     username,
        avatar_id:    avatarId,
        xp:           xp,
        achievements: JSON.stringify(achievements.filter(a => a.unlockedAt).map(a => ({ id: a.id, unlockedAt: a.unlockedAt }))),
      }).catch(() => {});
    }, 1500);
  }, [address, username, avatarId, xp, achievements]);

  useEffect(() => {
    if (isConnected && address) pushProfile();
  }, [username, avatarId, xp, achievements, isConnected, address, pushProfile]);

  // ── Push balance to Supabase (debounced 2s) ──────────────────────────────
  useEffect(() => {
    if (!isConnected || !address || !isSupabaseEnabled) return;
    if (balDebRef.current) clearTimeout(balDebRef.current);
    balDebRef.current = setTimeout(() => {
      syncBalance(address, balance).catch(() => {});
    }, 2000);
  }, [balance, isConnected, address]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (balDebRef.current)   clearTimeout(balDebRef.current);
  }, []);
};
