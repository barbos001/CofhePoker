import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/useGameStore';
import { useVaultStore } from '@/store/useVaultStore';
import { VAULT_DEPLOYED } from '@/config/vault';
import { PlayTab } from './PlayTab';
import { HoldemTab } from './HoldemTab';
import { PvPTab } from './PvPTab';
import { HoldemPvPTab } from './HoldemPvPTab';

type GameMode = '3card' | 'holdem' | null;
type Opponent = 'bot' | 'pvp' | null;
type MoneyMode = 'virtual' | 'real' | null;
type Step = 'mode' | 'opponent' | 'money' | 'game';

// Format: #/room/{gameType}/{tableId}          (public)
//         #/room/{gameType}/{tableId}:{code}   (private)
// Example: #/room/holdem/5
//          #/room/3card/3:0xabc123...

function parseRoomHash(): { gameType: '3card' | 'holdem'; tableId: string; code?: string } | null {
  const hash = window.location.hash;
  const match = hash.match(/^#\/room\/(3card|holdem)\/(.+)$/);
  if (!match) return null;
  const gameType = match[1] as '3card' | 'holdem';
  const rest = match[2];
  const colonIdx = rest.indexOf(':');
  if (colonIdx === -1) return { gameType, tableId: rest };
  return { gameType, tableId: rest.slice(0, colonIdx), code: rest.slice(colonIdx + 1) };
}

export function buildRoomUrl(gameType: '3card' | 'holdem', tableId: number, code?: string): string {
  const base = window.location.origin + window.location.pathname;
  const fragment = code ? `#/room/${gameType}/${tableId}:${code}` : `#/room/${gameType}/${tableId}`;
  return base + fragment;
}

const ModeCard = ({
  title, subtitle, lines, accent, onClick,
}: {
  title: string; subtitle: string; lines: string[]; accent: string; onClick: () => void;
}) => (
  <motion.button
    whileHover={{ scale: 1.03, y: -4 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className="flex-1 min-w-[240px] max-w-[340px] rounded-2xl p-6 text-left transition-all group relative overflow-hidden"
    style={{
      background: 'rgba(255,255,255,0.03)',
      border: `1.5px solid ${accent}25`,
    }}
  >
    <div
      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
      style={{ background: `radial-gradient(circle at 50% 80%, ${accent}08 0%, transparent 70%)` }}
    />
    <div className="relative z-10">
      <h3 className="font-clash text-2xl md:text-3xl tracking-tight uppercase mb-1" style={{ color: accent }}>
        {title}
      </h3>
      <p className="font-mono text-[10px] tracking-widest uppercase mb-4" style={{ color: 'var(--color-text-muted)' }}>
        {subtitle}
      </p>
      <div className="space-y-1.5">
        {lines.map((line, i) => (
          <div key={i} className="flex items-center gap-2 font-mono text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
            <span style={{ color: accent }}>-</span> {line}
          </div>
        ))}
      </div>
    </div>
  </motion.button>
);

const ModeSelect = ({ onSelect }: { onSelect: (m: '3card' | 'holdem') => void }) => (
  <div className="flex flex-col items-center justify-center min-h-[calc(100vh-112px)] py-12 px-4">
    <motion.h1
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="font-clash text-[48px] md:text-[72px] leading-[0.9] tracking-tighter uppercase text-center mb-3"
    >
      <span style={{ color: 'var(--color-primary)' }}>PLAY</span>
    </motion.h1>
    <motion.p
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
      className="font-mono text-xs tracking-widest uppercase mb-12" style={{ color: 'var(--color-text-muted)' }}
    >
      Choose your game
    </motion.p>

    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
      className="flex flex-col md:flex-row gap-4 md:gap-6 w-full max-w-[720px] justify-center"
    >
      <ModeCard
        title="3-Card Poker"
        subtitle="Fast game"
        lines={['3 cards dealt', '1 decision: Play or Fold', 'Quick rounds']}
        accent="#FFE03D"
        onClick={() => onSelect('3card')}
      />
      <ModeCard
        title="Texas Hold'em"
        subtitle="Full game"
        lines={['2 hole + 5 community', '4 rounds of betting', 'Check / Bet / Raise / Fold']}
        accent="#00BFFF"
        onClick={() => onSelect('holdem')}
      />
    </motion.div>
  </div>
);

const OpponentSelect = ({
  mode, onSelect, onBack,
}: {
  mode: '3card' | 'holdem'; onSelect: (o: 'bot' | 'pvp') => void; onBack: () => void;
}) => {
  const modeLabel = mode === '3card' ? '3-Card Poker' : "Texas Hold'em";
  const accent = mode === '3card' ? '#FFE03D' : '#00BFFF';

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-112px)] py-12 px-4">
      {/* Breadcrumb */}
      <motion.button
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        onClick={onBack}
        className="flex items-center gap-2 mb-8 font-mono text-xs tracking-wider transition-colors hover:text-white"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <span>&#8592;</span> PLAY
        <span style={{ color: 'rgba(255,255,255,0.2)' }}>/</span>
        <span style={{ color: accent }}>{modeLabel}</span>
      </motion.button>

      <motion.h2
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="font-clash text-[36px] md:text-[56px] leading-[0.9] tracking-tighter uppercase text-center mb-3"
        style={{ color: accent }}
      >
        {modeLabel}
      </motion.h2>
      <motion.p
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        className="font-mono text-xs tracking-widest uppercase mb-12" style={{ color: 'var(--color-text-muted)' }}
      >
        Choose your opponent
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="flex flex-col md:flex-row gap-4 md:gap-6 w-full max-w-[720px] justify-center"
      >
        <ModeCard
          title="vs Bot"
          subtitle="Play now"
          lines={['Instant start', 'FHE-encrypted bot', 'No waiting']}
          accent="var(--color-success)"
          onClick={() => onSelect('bot')}
        />
        <ModeCard
          title="vs Player"
          subtitle="PvP"
          lines={['Create or join a room', 'Invite friends', 'Real opponent']}
          accent="var(--color-fhe)"
          onClick={() => onSelect('pvp')}
        />
      </motion.div>
    </div>
  );
};

const MoneyModeSelect = ({
  mode, opponent, onSelect, onBack,
}: {
  mode: '3card' | 'holdem';
  opponent: 'bot' | 'pvp';
  onSelect: (m: 'virtual' | 'real') => void;
  onBack: () => void;
}) => {
  const modeLabel = mode === '3card' ? '3-Card Poker' : "Texas Hold'em";
  const oppLabel  = opponent === 'bot' ? 'vs Bot' : 'vs Player';
  const accent    = mode === '3card' ? '#FFE03D' : '#00BFFF';

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-112px)] py-12 px-4">
      {/* Breadcrumb */}
      <motion.button
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        onClick={onBack}
        className="flex items-center gap-2 mb-8 font-mono text-xs tracking-wider transition-colors hover:text-white"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <span>&#8592;</span> PLAY
        <span style={{ color: 'rgba(255,255,255,0.2)' }}>/</span>
        <span style={{ color: accent }}>{modeLabel}</span>
        <span style={{ color: 'rgba(255,255,255,0.2)' }}>/</span>
        <span>{oppLabel}</span>
      </motion.button>

      <motion.h2
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="font-clash text-[36px] md:text-[52px] leading-[0.9] tracking-tighter uppercase text-center mb-3"
        style={{ color: 'white' }}
      >
        Choose Stakes
      </motion.h2>
      <motion.p
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        className="font-mono text-xs tracking-widest uppercase mb-12" style={{ color: 'var(--color-text-muted)' }}
      >
        How do you want to play?
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="flex flex-col md:flex-row gap-4 md:gap-6 w-full max-w-[720px] justify-center"
      >
        {/* Virtual chips */}
        <ModeCard
          title="Virtual Chips"
          subtitle="Play for fun"
          lines={['1 000 chips to start', 'No real money at stake', 'Instant play']}
          accent="#FFE03D"
          onClick={() => onSelect('virtual')}
        />

        {/* Real money */}
        <ModeCard
          title="Real Money"
          subtitle={VAULT_DEPLOYED ? 'ETH / USDT via Vault' : 'Not available yet'}
          lines={
            VAULT_DEPLOYED
              ? ['Deposit ETH or USDT', 'Winnings go to your vault', 'Withdraw anytime']
              : ['Vault contract not deployed', 'Coming soon', '']
          }
          accent="var(--color-success)"
          onClick={() => VAULT_DEPLOYED && onSelect('real')}
        />
      </motion.div>

      {!VAULT_DEPLOYED && (
        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          className="mt-6 font-mono text-[10px] tracking-wider"
          style={{ color: 'rgba(255,59,59,0.6)' }}
        >
          Real-money vault not yet deployed — virtual chips only
        </motion.p>
      )}
    </div>
  );
};

const GameBreadcrumb = ({
  mode, opponent, onBack,
}: {
  mode: '3card' | 'holdem'; opponent: 'bot' | 'pvp'; onBack: () => void;
}) => {
  const { playState } = useGameStore();
  const isInGame = !['lobby', 'result'].includes(playState);

  // Don't show breadcrumb during active game — it's distracting
  if (isInGame) return null;

  const modeLabel = mode === '3card' ? '3-Card' : "Hold'em";
  const oppLabel = opponent === 'bot' ? 'vs Bot' : 'PvP';
  const accent = mode === '3card' ? '#FFE03D' : '#00BFFF';

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="w-full max-w-[960px] mx-auto px-4 pt-4"
    >
      <button
        onClick={onBack}
        className="flex items-center gap-2 font-mono text-xs tracking-wider transition-colors hover:text-white"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <span>&#8592;</span> PLAY
        <span style={{ color: 'rgba(255,255,255,0.2)' }}>/</span>
        <span style={{ color: accent }}>{modeLabel}</span>
        <span style={{ color: 'rgba(255,255,255,0.2)' }}>/</span>
        <span>{oppLabel}</span>
      </button>
    </motion.div>
  );
};

function getStep(mode: GameMode, opponent: Opponent, moneyMode: MoneyMode): Step {
  if (!mode) return 'mode';
  if (!opponent) return 'opponent';
  if (!moneyMode) return 'money';
  return 'game';
}

function pushPlayState(mode: GameMode, opponent: Opponent, moneyMode: MoneyMode) {
  const step = getStep(mode, opponent, moneyMode);
  const state = { playStep: step, mode, opponent, moneyMode };
  history.pushState(state, '', '');
}

export const PlayHub = () => {
  const { playState, activeTab } = useGameStore();
  const { setRealMoneyMode } = useVaultStore();
  const [mode, setMode] = useState<GameMode>(null);
  const [opponent, setOpponent] = useState<Opponent>(null);
  const [moneyMode, setMoneyMode] = useState<MoneyMode>(null);
  const suppressPush = useRef(false);
  const prevTabRef = useRef(activeTab);

  const isInGame = !['lobby', 'result'].includes(playState);

  // Reset to mode selection when user clicks PLAY tab again (while already on play)
  useEffect(() => {
    if (activeTab === 'play' && prevTabRef.current === 'play' && !isInGame) {
      // Tab didn't change but might be a re-click — handled below
    }
    if (activeTab !== 'play' && prevTabRef.current === 'play') {
      // Switched away from play — reset on next visit
    }
    if (activeTab === 'play' && prevTabRef.current !== 'play' && !isInGame) {
      // Came back to play from another tab — reset
      setMode(null);
      setOpponent(null);
      setMoneyMode(null);
    }
    prevTabRef.current = activeTab;
  }, [activeTab, isInGame]);

  useEffect(() => {
    const handler = (e: PopStateEvent) => {
      if (isInGame) {
        // During active game, re-push current state to prevent navigation
        pushPlayState(mode, opponent);
        return;
      }

      const s = e.state as { playStep?: Step; mode?: GameMode; opponent?: Opponent } | null;
      suppressPush.current = true;

      if (!s || !s.playStep || s.playStep === 'mode') {
        setMode(null);
        setOpponent(null);
        setMoneyMode(null);
      } else if (s.playStep === 'opponent') {
        setMode(s.mode ?? null);
        setOpponent(null);
        setMoneyMode(null);
      } else if (s.playStep === 'money') {
        setMode(s.mode ?? null);
        setOpponent(s.opponent ?? null);
        setMoneyMode(null);
      } else if (s.playStep === 'game') {
        setMode(s.mode ?? null);
        setOpponent(s.opponent ?? null);
        setMoneyMode((s as { moneyMode?: MoneyMode }).moneyMode ?? null);
      }

      // Reset flag after React processes the update
      requestAnimationFrame(() => { suppressPush.current = false; });
    };

    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [isInGame, mode, opponent]);

  const [roomLink, setRoomLink] = useState<{ gameType: '3card' | 'holdem'; tableId: string; code?: string } | null>(null);

  useEffect(() => {
    const parsed = parseRoomHash();
    if (parsed) {
      // Auto-navigate to the right game mode + PvP (default virtual for room links)
      setMode(parsed.gameType);
      setOpponent('pvp');
      setMoneyMode('virtual');
      setRealMoneyMode(false);
      setRoomLink(parsed);
      // Clean hash so it doesn't re-trigger
      history.replaceState(null, '', window.location.pathname);
    } else {
      history.replaceState({ playStep: 'mode', mode: null, opponent: null, moneyMode: null }, '', '');
    }
  }, []);

  const handleModeSelect = useCallback((m: '3card' | 'holdem') => {
    setMode(m);
    setOpponent(null);
    setMoneyMode(null);
    pushPlayState(m, null, null);
  }, []);

  const handleOpponentSelect = useCallback((o: 'bot' | 'pvp') => {
    setOpponent(o);
    setMoneyMode(null);
    pushPlayState(mode, o, null);
  }, [mode]);

  const handleMoneyModeSelect = useCallback((mm: 'virtual' | 'real') => {
    setMoneyMode(mm);
    setRealMoneyMode(mm === 'real');
    pushPlayState(mode, opponent, mm);
  }, [mode, opponent, setRealMoneyMode]);

  const goBackToMode = useCallback(() => {
    if (isInGame) return;
    setMode(null);
    setOpponent(null);
    setMoneyMode(null);
    if (!suppressPush.current) history.back();
  }, [isInGame]);

  const goBackToOpponent = useCallback(() => {
    if (isInGame) return;
    setOpponent(null);
    setMoneyMode(null);
    if (!suppressPush.current) history.back();
  }, [isInGame]);

  const goBackToMoney = useCallback(() => {
    if (isInGame) return;
    setMoneyMode(null);
    if (!suppressPush.current) history.back();
  }, [isInGame]);

  // Step 1: Mode selection
  if (!mode) {
    return <ModeSelect onSelect={handleModeSelect} />;
  }

  // Step 2: Opponent selection
  if (!opponent) {
    return <OpponentSelect mode={mode} onSelect={handleOpponentSelect} onBack={goBackToMode} />;
  }

  // Step 3: Money mode selection
  if (!moneyMode) {
    return <MoneyModeSelect mode={mode} opponent={opponent} onSelect={handleMoneyModeSelect} onBack={goBackToOpponent} />;
  }

  // Step 4: Game
  return (
    <>
      <GameBreadcrumb mode={mode} opponent={opponent} onBack={goBackToMoney} />
      <AnimatePresence mode="wait">
        {mode === '3card' && opponent === 'bot' && <PlayTab key="3card-bot" />}
        {mode === '3card' && opponent === 'pvp' && <PvPTab key="3card-pvp" />}
        {mode === 'holdem' && opponent === 'bot' && <HoldemTab key="holdem-bot" />}
        {mode === 'holdem' && opponent === 'pvp' && <HoldemPvPTab key="holdem-pvp" roomLink={roomLink?.gameType === 'holdem' ? roomLink : undefined} />}
      </AnimatePresence>
    </>
  );
};
