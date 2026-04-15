/**
 * useKeyboardShortcuts — keyboard bindings during player turn.
 *
 *  [P]  →  play()
 *  [F]  →  fold()
 *  [?]  →  toggle shortcut hint overlay
 *
 * Only active when playState === 'playerTurn'.
 * Ignores events fired inside <input> / <textarea> / <select>.
 */
import { useEffect, useCallback, useState } from 'react';
import { useGameStore } from '@/store/useGameStore';

type Actions = {
  play: () => void;
  fold: () => void;
};

export const useKeyboardShortcuts = ({ play, fold }: Actions) => {
  const { playState } = useGameStore();
  const [showHints, setShowHints] = useState(false);

  const handleKey = useCallback((e: KeyboardEvent) => {
    // Don't fire inside text inputs
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    // Ignore modifier combos
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const key = e.key.toLowerCase();

    if (key === '?') {
      e.preventDefault();
      setShowHints(h => !h);
      return;
    }

    if (playState !== 'playerTurn') return;

    if (key === 'p') {
      e.preventDefault();
      play();
    } else if (key === 'f') {
      e.preventDefault();
      fold();
    }
  }, [playState, play, fold]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  // Auto-hide hints after 4s of inactivity
  useEffect(() => {
    if (!showHints) return;
    const t = setTimeout(() => setShowHints(false), 4000);
    return () => clearTimeout(t);
  }, [showHints]);

  // Dismiss hints when game state changes away from playerTurn
  useEffect(() => {
    if (playState !== 'playerTurn') setShowHints(false);
  }, [playState]);

  return { showHints, setShowHints };
};
