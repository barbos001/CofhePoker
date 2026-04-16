import { useEffect, useRef } from 'react';
import { useGameStore } from '@/store/useGameStore';

const AudioCtx = typeof window !== 'undefined' ? (window.AudioContext || (window as any).webkitAudioContext) : null;

let _ctx: AudioContext | null = null;
const getCtx = (): AudioContext | null => {
  if (!AudioCtx) return null;
  if (!_ctx || _ctx.state === 'closed') _ctx = new AudioCtx();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
};

const isMuted = () => {
  try { return localStorage.getItem('poker_soundOn') === 'false'; } catch { return false; }
};

/* ── Tone primitive ─────────────────────────────────────────────── */
const tone = (
  freq: number,
  dur: number,
  type: OscillatorType = 'sine',
  vol = 0.08,
  startOffset = 0,
  attack = 0.01,
  release?: number,
) => {
  if (isMuted()) return;
  const ctx = getCtx();
  if (!ctx) return;

  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  const now  = ctx.currentTime + startOffset;
  const rel  = release ?? dur * 0.6;

  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(vol, now + attack);
  gain.gain.setValueAtTime(vol, now + dur - rel);
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + dur);
};

/* ── Noise burst (card shuffle) ─────────────────────────────────── */
const noise = (dur: number, vol = 0.03, startOffset = 0) => {
  if (isMuted()) return;
  const ctx = getCtx();
  if (!ctx) return;

  const bufSize = ctx.sampleRate * dur;
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

  const src  = ctx.createBufferSource();
  const gain = ctx.createGain();
  const filt = ctx.createBiquadFilter();

  src.buffer = buf;
  filt.type = 'bandpass';
  filt.frequency.value = 3500;
  filt.Q.value = 0.8;

  const now = ctx.currentTime + startOffset;
  gain.gain.setValueAtTime(vol, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

  src.connect(filt).connect(gain).connect(ctx.destination);
  src.start(now);
  src.stop(now + dur);
};

/* ── SFX library ─────────────────────────────────────────────────── */
export const SFX = {
  /** Card swoosh when dealing */
  deal: () => {
    noise(0.06, 0.04);
    tone(900,  0.08, 'triangle', 0.05, 0.01);
    tone(1100, 0.06, 'triangle', 0.03, 0.06);
    tone(1300, 0.05, 'triangle', 0.02, 0.10);
  },

  /** Card flip on reveal */
  cardFlip: () => {
    noise(0.04, 0.03);
    tone(1400, 0.05, 'sine', 0.04, 0);
    tone(1800, 0.04, 'sine', 0.025, 0.03);
  },

  /** Multi-note win fanfare — ascending major chord */
  win: () => {
    // Chord: C5–E5–G5–C6
    const notes = [523, 659, 784, 1047, 1318];
    notes.forEach((f, i) => {
      tone(f, 0.28, 'triangle', 0.065, i * 0.09, 0.01, 0.12);
    });
    // Sparkle shimmer on top
    setTimeout(() => {
      [2093, 2637, 3136].forEach((f, i) => {
        tone(f, 0.12, 'sine', 0.025, i * 0.04);
      });
    }, 450);
  },

  /** Streak win — brighter, longer fanfare */
  winStreak: () => {
    const notes = [523, 659, 784, 1047, 1318, 1568];
    notes.forEach((f, i) => {
      tone(f, 0.35, 'triangle', 0.07, i * 0.07, 0.01, 0.15);
    });
    setTimeout(() => {
      [2093, 2637, 3136, 4186].forEach((f, i) => {
        tone(f, 0.15, 'sine', 0.03, i * 0.04);
      });
    }, 420);
  },

  /** Descending lose sound */
  lose: () => {
    tone(400, 0.25, 'sawtooth', 0.04, 0,    0.02, 0.15);
    tone(320, 0.30, 'sawtooth', 0.035,0.18, 0.02, 0.20);
    tone(240, 0.35, 'sawtooth', 0.025,0.35, 0.02, 0.25);
  },

  /** Quick fold thud */
  fold: () => {
    tone(350, 0.10, 'sine',     0.04, 0);
    tone(280, 0.12, 'triangle', 0.025, 0.06);
  },

  /** Chip click rhythm */
  chipMove: () => {
    const clicks = [0, 0.04, 0.08];
    clicks.forEach(offset => {
      tone(2200 + Math.random() * 400, 0.025, 'square', 0.025, offset);
      noise(0.02, 0.015, offset);
    });
  },

  /** Single chip click */
  chipClick: () => {
    tone(2400, 0.025, 'square', 0.028, 0);
    noise(0.018, 0.012);
  },

  /** UI click */
  click: () => {
    tone(1800, 0.018, 'square', 0.028);
  },

  /** FHE decrypt rising arpeggio */
  decrypt: () => {
    [500, 650, 850, 1100].forEach((f, i) => {
      tone(f, 0.14, 'sine', 0.04, i * 0.07, 0.01, 0.08);
    });
  },

  /** Notification chime */
  notify: () => {
    tone(1100, 0.10, 'triangle', 0.05, 0,    0.01);
    tone(1480, 0.08, 'triangle', 0.04, 0.09, 0.01);
  },

  /** Pot won (chips flying) */
  potWon: () => {
    // Rising glide
    const ctx = getCtx();
    if (!ctx || isMuted()) return;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.4);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);

    // Chip shower
    [0.1, 0.18, 0.26].forEach(offset => SFX.chipClick());
  },
};

/* ── useSounds hook ─────────────────────────────────────────────── */
export const useSounds = () => {
  const prevState = useRef('');
  const playState = useGameStore(s => s.playState);

  useEffect(() => {
    if (prevState.current === playState) return;
    const prev = prevState.current;
    prevState.current = playState;

    if (playState === 'dealing')                         SFX.deal();
    if (playState === 'decrypting' && prev === 'dealing') SFX.decrypt();
    if (playState === 'playerTurn' && prev === 'decrypting') {
      setTimeout(() => SFX.cardFlip(), 80);
      setTimeout(() => SFX.cardFlip(), 200);
      setTimeout(() => SFX.cardFlip(), 320);
    }
    if (playState === 'result') {
      setTimeout(() => {
        const { handResult, history } = useGameStore.getState();
        if (handResult === 'WON') {
          // Check for win streak
          const recent = history.slice(-3);
          const isStreak = recent.length >= 2 && recent.every(h => h.result === 'WON');
          if (isStreak) SFX.winStreak();
          else SFX.win();
          setTimeout(() => SFX.potWon(), 600);
        } else if (handResult === 'LOST') {
          SFX.lose();
        } else {
          SFX.fold();
        }
      }, 300);
    }
    if (playState === 'folding') SFX.fold();
    if (playState === 'botThinking') {
      setTimeout(() => SFX.chipClick(), 200);
    }
  }, [playState]);

  return SFX;
};
