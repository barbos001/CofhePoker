import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/useGameStore';
import { useVaultStore } from '@/store/useVaultStore';
import { VAULT_DEPLOYED } from '@/config/vault';
import { HoldemTab } from './HoldemTab';
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
    whileHover={{ scale: 1.02, y: -6 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className="flex-1 min-w-[280px] max-w-[360px] rounded-xl p-8 text-left transition-all group relative overflow-hidden flex flex-col"
    style={{
      background: `linear-gradient(145deg, ${accent}0C 0%, rgba(255,255,255,0.04) 100%)`,
      border: `1.5px solid ${accent}35`,
      minHeight: 320,
    }}
  >
    {/* Hover glow */}
    <div
      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
      style={{ background: `radial-gradient(ellipse at 50% 100%, ${accent}14 0%, transparent 65%)` }}
    />
    {/* Top accent line */}
    <div
      className="absolute top-0 left-8 right-8 h-[1px]"
      style={{ background: `linear-gradient(90deg, transparent, ${accent}60, transparent)` }}
    />
    <div className="relative z-10 flex flex-col flex-1">
      <h3
        className="uppercase mb-1"
        style={{
          fontFamily: "'Chakra Petch', sans-serif",
          fontWeight: 700,
          fontSize: 28,
          letterSpacing: '0.08em',
          color: accent,
          lineHeight: 1.1,
        }}
      >
        {title}
      </h3>
      <p
        className="uppercase mb-6"
        style={{
          fontFamily: "'Chakra Petch', sans-serif",
          fontWeight: 400,
          fontSize: 11,
          letterSpacing: '0.14em',
          color: 'rgba(255,255,255,0.35)',
        }}
      >
        {subtitle}
      </p>
      <div className="space-y-2.5 mt-auto">
        {lines.filter(Boolean).map((line, i) => (
          <div
            key={i}
            className="flex items-center gap-2.5"
            style={{
              fontFamily: "'Chakra Petch', sans-serif",
              fontWeight: 400,
              fontSize: 13,
              letterSpacing: '0.03em',
              color: 'rgba(255,255,255,0.55)',
            }}
          >
            <span style={{ color: accent, fontSize: 8, opacity: 0.8 }}>◆</span>
            {line}
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
    <div
      className="flex flex-col items-center justify-center min-h-[calc(100vh-112px)] px-4 relative overflow-hidden"
      style={{ paddingTop: 48, paddingBottom: 48 }}
    >
      {/* Felt / dark-green ambient background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(0,40,20,0.45) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 flex flex-col items-center w-full">
        {/* Page title */}
        <motion.h1
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="uppercase text-center mb-2"
          style={{
            fontFamily: "'Chakra Petch', sans-serif",
            fontWeight: 700,
            fontSize: 'clamp(36px, 6vw, 60px)',
            letterSpacing: '0.08em',
            color: accent,
            textShadow: `0 0 40px ${accent}30`,
            lineHeight: 1,
          }}
        >
          {modeLabel}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }}
          className="uppercase mb-10"
          style={{
            fontFamily: "'Chakra Petch', sans-serif",
            fontWeight: 400,
            fontSize: 11,
            letterSpacing: '0.18em',
            color: 'rgba(255,255,255,0.3)',
          }}
        >
          Choose your opponent
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          className="flex flex-col md:flex-row gap-5 w-full max-w-[740px] justify-center"
        >
          <ModeCard
            title="VS BOT"
            subtitle="Play now"
            lines={['Instant start', 'FHE-encrypted bot', 'No waiting']}
            accent="#00E86C"
            onClick={() => onSelect('bot')}
          />
          <ModeCard
            title="VS PLAYER"
            subtitle="PvP"
            lines={['Create or join a room', 'Invite friends', 'Real opponent']}
            accent="#B366FF"
            onClick={() => onSelect('pvp')}
          />
        </motion.div>
      </div>
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
    <div
      className="flex flex-col items-center justify-center min-h-[calc(100vh-112px)] px-4 relative overflow-hidden"
      style={{ paddingTop: 48, paddingBottom: 48 }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(0,40,20,0.45) 0%, transparent 70%)' }}
      />
      <div className="relative z-10 flex flex-col items-center w-full">
        {/* Back breadcrumb */}
        <motion.button
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          onClick={onBack}
          className="flex items-center gap-2 mb-8 uppercase transition-colors hover:text-white"
          style={{
            fontFamily: "'Chakra Petch', sans-serif",
            fontWeight: 500,
            fontSize: 11,
            letterSpacing: '0.12em',
            color: 'rgba(255,255,255,0.35)',
          }}
        >
          <span>←</span> {modeLabel}
          <span style={{ color: 'rgba(255,255,255,0.15)' }}>/</span>
          <span style={{ color: 'rgba(255,255,255,0.6)' }}>{oppLabel}</span>
        </motion.button>

        <motion.h1
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="uppercase text-center mb-2"
          style={{
            fontFamily: "'Chakra Petch', sans-serif",
            fontWeight: 700,
            fontSize: 'clamp(36px, 6vw, 60px)',
            letterSpacing: '0.08em',
            color: 'white',
            lineHeight: 1,
          }}
        >
          Choose Stakes
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }}
          className="uppercase mb-10"
          style={{
            fontFamily: "'Chakra Petch', sans-serif",
            fontWeight: 400,
            fontSize: 11,
            letterSpacing: '0.18em',
            color: 'rgba(255,255,255,0.3)',
          }}
        >
          How do you want to play?
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          className="flex flex-col md:flex-row gap-5 w-full max-w-[740px] justify-center"
        >
          <ModeCard
            title="Virtual Chips"
            subtitle="Play for fun"
            lines={['1 000 chips to start', 'No real money at stake', 'Instant play']}
            accent="#FFE03D"
            onClick={() => onSelect('virtual')}
          />
          <ModeCard
            title="Real Money"
            subtitle={VAULT_DEPLOYED ? 'ETH / USDT via Vault' : 'Not available yet'}
            lines={
              VAULT_DEPLOYED
                ? ['Deposit ETH or USDT', 'Winnings go to your vault', 'Withdraw anytime']
                : ['Vault not deployed', 'Coming soon']
            }
            accent="#00E86C"
            onClick={() => VAULT_DEPLOYED && onSelect('real')}
          />
        </motion.div>

        {!VAULT_DEPLOYED && (
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
            className="mt-5"
            style={{
              fontFamily: "'Chakra Petch', sans-serif",
              fontWeight: 400,
              fontSize: 11,
              letterSpacing: '0.06em',
              color: 'rgba(255,59,59,0.55)',
            }}
          >
            Real-money vault not yet deployed — virtual chips only
          </motion.p>
        )}
      </div>
    </div>
  );
};

const GameBreadcrumb = ({
  mode, opponent, onBack,
}: {
  mode: '3card' | 'holdem'; opponent: 'bot' | 'pvp'; onBack: () => void;
}) => {
  const playState = useGameStore(s => s.playState);
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
        className="flex items-center gap-2 uppercase transition-colors hover:text-white"
        style={{
          fontFamily: "'Chakra Petch', sans-serif",
          fontWeight: 500,
          fontSize: 11,
          letterSpacing: '0.12em',
          color: 'rgba(255,255,255,0.35)',
        }}
      >
        <span>←</span> PLAY
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
  const playState      = useGameStore(s => s.playState);
  const activeTab      = useGameStore(s => s.activeTab);
  const setRealMoneyMode = useVaultStore(s => s.setRealMoneyMode);
  // Always Texas Hold'em — 3-Card mode removed
  const mode: NonNullable<GameMode> = 'holdem';
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
      setOpponent(null);
      setMoneyMode(null);
    }
    prevTabRef.current = activeTab;
  }, [activeTab, isInGame]);

  useEffect(() => {
    const handler = (e: PopStateEvent) => {
      if (isInGame) {
        // During active game, re-push current state to prevent navigation
        pushPlayState(mode, opponent, moneyMode);
        return;
      }

      const s = e.state as { playStep?: Step; mode?: GameMode; opponent?: Opponent } | null;
      suppressPush.current = true;

      if (!s || !s.playStep || s.playStep === 'mode' || s.playStep === 'opponent') {
        setOpponent(null);
        setMoneyMode(null);
      } else if (s.playStep === 'money') {
        setOpponent(s.opponent ?? null);
        setMoneyMode(null);
      } else if (s.playStep === 'game') {
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
      // Auto-navigate to PvP with virtual chips for room links
      setOpponent('pvp');
      setMoneyMode('virtual');
      setRealMoneyMode(false);
      setRoomLink(parsed);
      history.replaceState(null, '', window.location.pathname);
    } else {
      history.replaceState({ playStep: 'opponent', mode: 'holdem', opponent: null, moneyMode: null }, '', '');
    }
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

  // Step 1: Opponent selection (Bot vs PvP)
  if (!opponent) {
    return <OpponentSelect mode={mode} onSelect={handleOpponentSelect} onBack={() => {}} />;
  }

  // Step 2: Money mode selection
  if (!moneyMode) {
    return <MoneyModeSelect mode={mode} opponent={opponent} onSelect={handleMoneyModeSelect} onBack={goBackToOpponent} />;
  }

  // Step 3: Game
  return (
    <>
      <GameBreadcrumb mode={mode} opponent={opponent} onBack={goBackToMoney} />
      <AnimatePresence mode="wait">
        {opponent === 'bot' && <HoldemTab key="holdem-bot" />}
        {opponent === 'pvp' && <HoldemPvPTab key="holdem-pvp" roomLink={roomLink?.gameType === 'holdem' ? roomLink : undefined} />}
      </AnimatePresence>
    </>
  );
};
