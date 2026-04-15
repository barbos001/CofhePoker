import { useCallback, useRef, useEffect } from 'react';
import { useGameStore } from '@/store/useGameStore';

const AudioCtx = typeof window !== 'undefined' ? (window.AudioContext || (window as any).webkitAudioContext) : null;

let _ctx: AudioContext | null = null;
const getCtx = (): AudioContext | null => {
  if (!AudioCtx) return null;
  if (!_ctx || _ctx.state === 'closed') _ctx = new AudioCtx();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
};

const playTone = (freq: number, duration: number, type: OscillatorType = 'sine', vol = 0.08) => {
  try { if (localStorage.getItem('poker_soundOn') === 'false') return; } catch {}
  const ctx = getCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
};

export const SFX = {
  deal: () => {
    playTone(800, 0.08, 'triangle', 0.06);
    setTimeout(() => playTone(1000, 0.06, 'triangle', 0.04), 60);
  },
  cardFlip: () => {
    playTone(1200, 0.05, 'sine', 0.05);
    setTimeout(() => playTone(1600, 0.04, 'sine', 0.03), 40);
  },
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => playTone(f, 0.15, 'triangle', 0.06), i * 100)
    );
  },
  lose: () => {
    playTone(300, 0.3, 'sawtooth', 0.04);
    setTimeout(() => playTone(250, 0.4, 'sawtooth', 0.03), 200);
  },
  fold: () => {
    playTone(400, 0.12, 'sine', 0.04);
  },
  chipMove: () => {
    playTone(2000, 0.03, 'square', 0.03);
    setTimeout(() => playTone(2400, 0.02, 'square', 0.02), 30);
  },
  click: () => {
    playTone(1800, 0.02, 'square', 0.03);
  },
  decrypt: () => {
    playTone(600, 0.15, 'sine', 0.04);
    setTimeout(() => playTone(800, 0.12, 'sine', 0.03), 100);
    setTimeout(() => playTone(1200, 0.1, 'sine', 0.02), 200);
  },
  notify: () => {
    playTone(880, 0.08, 'triangle', 0.05);
    setTimeout(() => playTone(1100, 0.06, 'triangle', 0.04), 80);
  },
};

export const useSounds = () => {
  const prevState = useRef('');
  const { playState } = useGameStore();

  useEffect(() => {
    if (prevState.current === playState) return;
    const prev = prevState.current;
    prevState.current = playState;

    if (playState === 'dealing') SFX.deal();
    if (playState === 'decrypting' && prev === 'dealing') SFX.decrypt();
    if (playState === 'playerTurn' && prev === 'decrypting') SFX.cardFlip();
    if (playState === 'result') {
      setTimeout(() => {
        const { handResult } = useGameStore.getState();
        if (handResult === 'WON') SFX.win();
        else if (handResult === 'LOST') SFX.lose();
        else SFX.fold();
      }, 300);
    }
    if (playState === 'folding') SFX.fold();
  }, [playState]);

  return SFX;
};
