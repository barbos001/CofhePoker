import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, useDisconnect } from 'wagmi';
import { useGameStore } from '@/store/useGameStore';
import { CONTRACT_ADDRESS } from '@/config/contract';
import { useCofhe } from '@/hooks/useCofhe';

const ETHERSCAN = 'https://sepolia.etherscan.io';

// ── Toggle Switch ─────────────────────────────────────────────────────
const Toggle = ({ on, onToggle, label, desc }: { on: boolean; onToggle: () => void; label: string; desc?: string }) => (
  <button onClick={onToggle} className="flex items-center justify-between w-full py-4 group text-left">
    <div className="flex flex-col gap-1 pr-4">
      <span className="font-satoshi text-[15px] font-medium text-white">{label}</span>
      {desc && <span className="font-satoshi text-[12px] leading-snug" style={{ color: 'rgba(255,255,255,0.45)' }}>{desc}</span>}
    </div>
    <div
      className="w-11 h-6 rounded-full relative transition-colors shrink-0"
      style={{ background: on ? 'var(--color-primary)' : 'rgba(255,255,255,0.12)' }}
    >
      <motion.div
        className="w-5 h-5 rounded-full absolute top-0.5"
        style={{ background: on ? '#000' : 'rgba(255,255,255,0.6)' }}
        animate={{ left: on ? 22 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </div>
  </button>
);

// ── Select Dropdown ───────────────────────────────────────────────────
const Select = ({
  label,
  desc,
  value,
  options,
  onChange,
}: {
  label: string;
  desc?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) => (
  <div className="flex items-center justify-between py-4">
    <div className="flex flex-col gap-1 pr-4">
      <span className="font-satoshi text-[15px] font-medium text-white">{label}</span>
      {desc && <span className="font-satoshi text-[12px] leading-snug" style={{ color: 'rgba(255,255,255,0.45)' }}>{desc}</span>}
    </div>
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="font-mono text-[13px] tracking-wider px-3.5 py-2 rounded-lg appearance-none cursor-pointer transition-colors outline-none"
      style={{
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.12)',
        color: 'white',
      }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value} style={{ background: '#111', color: '#fff' }}>
          {o.label}
        </option>
      ))}
    </select>
  </div>
);

// ── Setting Row ───────────────────────────────────────────────────────
const Row = ({ label, value, mono, color }: { label: string; value: string; mono?: boolean; color?: string }) => (
  <div className="flex items-center justify-between py-4">
    <span className="font-satoshi text-[15px]" style={{ color: 'rgba(255,255,255,0.6)' }}>{label}</span>
    <span
      className={`text-[15px] text-right max-w-[60%] truncate ${mono ? 'font-mono' : 'font-satoshi font-medium'}`}
      style={{ color: color || 'white' }}
    >
      {value}
    </span>
  </div>
);

// ── Action Button Row ─────────────────────────────────────────────────
const ActionRow = ({
  label,
  desc,
  btnLabel,
  btnColor,
  onClick,
  disabled,
}: {
  label: string;
  desc?: string;
  btnLabel: string;
  btnColor: string;
  onClick: () => void;
  disabled?: boolean;
}) => (
  <div className="flex items-center justify-between py-4">
    <div className="flex flex-col gap-1 pr-4">
      <span className="font-satoshi text-[15px] font-medium text-white">{label}</span>
      {desc && <span className="font-satoshi text-[12px] leading-snug" style={{ color: 'rgba(255,255,255,0.45)' }}>{desc}</span>}
    </div>
    <button
      onClick={onClick}
      disabled={disabled}
      className="font-mono text-[11px] tracking-widest uppercase px-4 py-2 rounded-full transition-all hover:brightness-125 shrink-0 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:brightness-100"
      style={{
        color: btnColor,
        border: `1px solid ${btnColor}50`,
        background: `${btnColor}15`,
      }}
    >
      {btnLabel}
    </button>
  </div>
);

// ── Status Badge ──────────────────────────────────────────────────────
const StatusBadge = ({ active, label }: { active: boolean; label: string }) => (
  <div className="flex items-center gap-1.5">
    <span
      className="w-1.5 h-1.5 rounded-full"
      style={{
        background: active ? 'var(--color-success)' : 'var(--color-text-muted)',
        boxShadow: active ? '0 0 6px rgba(0,232,108,0.5)' : 'none',
        animation: active ? 'ambient-breathe 2s ease-in-out infinite' : 'none',
      }}
    />
    <span className="font-mono text-[10px] tracking-wider uppercase" style={{ color: active ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
      {label}
    </span>
  </div>
);

// ── Section Card ──────────────────────────────────────────────────────
const Section = ({
  title,
  icon,
  badge,
  accentColor,
  children,
  delay = 0,
  collapsible = false,
  defaultOpen = true,
}: {
  title: string;
  icon: string;
  badge?: React.ReactNode;
  accentColor?: string;
  children: React.ReactNode;
  delay?: number;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="rounded-2xl mb-5 overflow-hidden relative"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* Accent top line */}
      {accentColor && (
        <div className="absolute top-0 left-6 right-6 h-[1px]" style={{ background: `linear-gradient(90deg, transparent, ${accentColor}50, transparent)` }} />
      )}

      <button
        onClick={collapsible ? () => setOpen(!open) : undefined}
        className={`w-full flex items-center justify-between p-5 pb-3 ${collapsible ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <div className="flex items-center gap-3">
          <span
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
            style={{
              background: accentColor ? `${accentColor}18` : 'rgba(255,255,255,0.06)',
              border: `1px solid ${accentColor ? `${accentColor}35` : 'rgba(255,255,255,0.1)'}`,
              color: accentColor || 'rgba(255,255,255,0.7)',
            }}
          >
            {icon}
          </span>
          <h3 className="font-mono text-[13px] tracking-widest uppercase font-bold" style={{ color: 'rgba(255,255,255,0.75)' }}>
            {title}
          </h3>
          {badge}
        </div>
        {collapsible && (
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-xs"
            style={{ color: 'var(--color-text-muted)' }}
          >
            ▾
          </motion.span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={collapsible ? { height: 0, opacity: 0 } : false}
            animate={{ height: 'auto', opacity: 1 }}
            exit={collapsible ? { height: 0, opacity: 0 } : undefined}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5">
              <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                {children}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ── SettingsTab ───────────────────────────────────────────────────────
export const SettingsTab = () => {
  const { balance, history, setAppState, permitStatus, permitError, setPermitStatus, setPermitError } = useGameStore();
  const { address, isConnected, chainId } = useAccount();
  const { disconnect } = useDisconnect();
  const { ensurePermit, removeActivePermit, isReady: cofheReady } = useCofhe();
  const deployed = CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000';

  // Permits
  const hasActivePermit = permitStatus === 'active';
  const permitNeedsAction = permitStatus === 'none' || permitStatus === 'expired' || permitStatus === 'error';

  const handleSignPermit = useCallback(async () => {
    if (!cofheReady || permitStatus === 'signing') return;
    try {
      await ensurePermit();
    } catch {
      // error handled inside ensurePermit
    }
  }, [cofheReady, permitStatus, ensurePermit]);

  // Helper to read persisted boolean setting
  const readBool = (key: string, defaultVal: boolean) => {
    const v = localStorage.getItem(key);
    return v === null ? defaultVal : v === 'true';
  };
  const readStr = (key: string, defaultVal: string) => localStorage.getItem(key) ?? defaultVal;

  // Wallet & Network
  const [autoSign, _setAutoSign] = useState(() => readBool('poker_autoSign', false));

  // Cards
  const [autoDecrypt, _setAutoDecrypt] = useState(() => readBool('poker_autoDecrypt', true));
  const [blurCards, _setBlurCards] = useState(() => readBool('poker_blurCards', false));

  // Gas
  const [showGasCost, _setShowGasCost] = useState(() => readBool('poker_showGasCost', true));
  const [autoEstimateGas, _setAutoEstimateGas] = useState(() => readBool('poker_autoEstimateGas', true));
  const [gasAlerts, _setGasAlerts] = useState(() => readBool('poker_gasAlerts', true));

  // Gameplay
  const [autoPostBlind, _setAutoPostBlind] = useState(() => readBool('poker_autoPostBlind', false));
  const [autoMuck, _setAutoMuck] = useState(() => readBool('poker_autoMuck', true));
  const [fourColorDeck, _setFourColorDeck] = useState(() => readBool('poker_fourColorDeck', false));
  const [runItTwice, _setRunItTwice] = useState(() => readBool('poker_runItTwice', false));
  const [turnTimer, _setTurnTimer] = useState(() => readStr('poker_turnTimer', '30'));

  // Sound & Visual
  const [soundOn, _setSoundOn] = useState(() => readBool('poker_soundOn', false));
  const [showAnimations, _setShowAnimations] = useState(() => readBool('poker_showAnimations', true));
  const [tableSkin, _setTableSkin] = useState(() => readStr('poker_tableSkin', 'classic'));

  // Security
  const [autoLogout, _setAutoLogout] = useState(() => readStr('poker_autoLogout', '30'));

  // Persisting wrappers
  const persist = (key: string, setter: (v: boolean) => void) => (v: boolean) => { setter(v); localStorage.setItem(key, String(v)); };
  const persistStr = (key: string, setter: (v: string) => void) => (v: string) => { setter(v); localStorage.setItem(key, v); };

  const setAutoSign = persist('poker_autoSign', _setAutoSign);
  const setAutoDecrypt = persist('poker_autoDecrypt', _setAutoDecrypt);
  const setBlurCards = persist('poker_blurCards', _setBlurCards);
  const setShowGasCost = persist('poker_showGasCost', _setShowGasCost);
  const setAutoEstimateGas = persist('poker_autoEstimateGas', _setAutoEstimateGas);
  const setGasAlerts = persist('poker_gasAlerts', _setGasAlerts);
  const setAutoPostBlind = persist('poker_autoPostBlind', _setAutoPostBlind);
  const setAutoMuck = persist('poker_autoMuck', _setAutoMuck);
  const setFourColorDeck = persist('poker_fourColorDeck', _setFourColorDeck);
  const setRunItTwice = persist('poker_runItTwice', _setRunItTwice);
  const setSoundOn = persist('poker_soundOn', _setSoundOn);
  const setShowAnimations = persist('poker_showAnimations', _setShowAnimations);
  const setTurnTimer = persistStr('poker_turnTimer', _setTurnTimer);
  const setTableSkin = persistStr('poker_tableSkin', _setTableSkin);
  const setAutoLogout = persistStr('poker_autoLogout', _setAutoLogout);

  // Stats
  const wins = history.filter(h => h.result === 'WON').length;
  const losses = history.filter(h => h.result === 'LOST').length;
  const folds = history.filter(h => h.result === 'FOLD').length;
  const winRate = history.length > 0 ? Math.round((wins / history.length) * 100) : 0;
  const totalDelta = history.reduce((acc, h) => acc + h.delta, 0);

  const copyAddress = () => { if (address) navigator.clipboard.writeText(address); };
  const copyContract = () => { navigator.clipboard.writeText(CONTRACT_ADDRESS); };

  return (
    <div className="w-full max-w-[700px] mx-auto py-10 px-4 min-h-[calc(100vh-112px)]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-end gap-4 mb-10"
      >
        <h1 className="font-clash text-[48px] uppercase tracking-tight leading-none">
          SETTINGS
        </h1>
        <span className="font-mono text-[10px] tracking-widest uppercase mb-2" style={{ color: 'var(--color-text-muted)' }}>
          v1.0.0
        </span>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════════
          🔑  FHE PERMITS
          ═══════════════════════════════════════════════════════════════════ */}
      <Section
        title="FHE Permits"
        icon="🔑"
        accentColor={permitNeedsAction ? '#FF3B3B' : '#B366FF'}
        delay={0.04}
        badge={
          <StatusBadge
            active={hasActivePermit}
            label={
              permitStatus === 'active'   ? 'Active' :
              permitStatus === 'signing'  ? 'Signing...' :
              permitStatus === 'expiring' ? 'Expiring' :
              permitStatus === 'expired'  ? 'Expired' :
              permitStatus === 'error'    ? 'Error' :
              'No permit'
            }
          />
        }
      >
        <Row
          label="Status"
          value={
            permitStatus === 'active'   ? 'Signed & Active' :
            permitStatus === 'signing'  ? 'Waiting for signature...' :
            permitStatus === 'expiring' ? 'Active — expiring soon' :
            permitStatus === 'expired'  ? 'Expired — re-sign needed' :
            permitStatus === 'error'    ? (permitError || 'Signature failed') :
            'Not signed'
          }
          color={
            hasActivePermit              ? 'var(--color-success)' :
            permitStatus === 'expiring'  ? 'var(--color-deco-orange)' :
            permitStatus === 'signing'   ? 'var(--color-fhe)' :
            'var(--color-danger)'
          }
        />
        {permitNeedsAction && (
          <div className="py-3">
            <div
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg"
              style={{
                background: 'rgba(255,59,59,0.05)',
                border: '1px solid rgba(255,59,59,0.15)',
              }}
            >
              <span className="text-sm">⚠</span>
              <span className="font-satoshi text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                Without an active permit you cannot decrypt your cards.
              </span>
            </div>
          </div>
        )}
        <Row label="Duration" value="Session (until tab close)" mono />
        <Row label="Scope" value="Poker Table Contract" mono />
        <ActionRow
          label="Sign New Permit"
          desc={!isConnected ? 'Connect wallet first' : !cofheReady ? 'Waiting for CoFHE to initialize...' : 'Opens your wallet to sign an EIP-712 permit'}
          btnLabel={permitStatus === 'signing' ? 'SIGNING...' : !isConnected ? 'NO WALLET' : !cofheReady ? 'LOADING...' : 'SIGN'}
          btnColor="var(--color-fhe)"
          onClick={handleSignPermit}
          disabled={!isConnected || !cofheReady || permitStatus === 'signing'}
        />
        <ActionRow
          label="Revoke Permit"
          desc="Immediately revoke current permit"
          btnLabel="REVOKE"
          btnColor="var(--color-danger)"
          onClick={() => {
            setPermitStatus('none');
            setPermitError(null);
          }}
        />
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
          🌐  WALLET & NETWORK
          ═══════════════════════════════════════════════════════════════════ */}
      <Section
        title="Wallet & Network"
        icon="◈"
        accentColor="#4D7CFF"
        delay={0.08}
        badge={<StatusBadge active={isConnected} label={isConnected ? 'Connected' : 'Offline'} />}
      >
        <Row
          label="Status"
          value={isConnected ? 'Connected' : 'Not Connected'}
          color={isConnected ? 'var(--color-success)' : 'var(--color-text-muted)'}
        />
        {isConnected && address && (
          <div className="flex items-center justify-between py-3.5">
            <span className="font-satoshi text-sm" style={{ color: 'var(--color-text-secondary)' }}>Address</span>
            <button
              onClick={copyAddress}
              className="font-mono text-xs transition-colors hover:text-primary flex items-center gap-1.5"
              title="Copy address"
            >
              {address.slice(0, 6)}...{address.slice(-4)}
              <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>⧉</span>
            </button>
          </div>
        )}
        <Row
          label="Network"
          value={chainId === 11155111 ? 'Sepolia Testnet' : isConnected ? `Chain ${chainId}` : 'N/A'}
          mono
        />
        <Row label="Balance" value={`${balance.toLocaleString()} chips`} />
        <Toggle
          on={autoSign}
          onToggle={() => setAutoSign(!autoSign)}
          label="Auto-Sign Transactions"
          desc="Skip manual confirmation within session"
        />
        {isConnected && (
          <div className="pt-3">
            <a
              href={address ? `${ETHERSCAN}/address/${address}` : '#'}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs tracking-wider transition-colors hover:text-white"
              style={{ color: 'var(--color-info)' }}
            >
              View on Etherscan ↗
            </a>
          </div>
        )}
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
          👁  MY CARDS — Decryption
          ═══════════════════════════════════════════════════════════════════ */}
      <Section
        title="My Cards"
        icon="👁"
        accentColor="#FFE03D"
        delay={0.12}
      >
        <Toggle
          on={autoDecrypt}
          onToggle={() => setAutoDecrypt(!autoDecrypt)}
          label="Auto-Decrypt Cards"
          desc="Automatically reveal your cards when dealt"
        />
        <Toggle
          on={blurCards}
          onToggle={() => setBlurCards(!blurCards)}
          label="Privacy Blur"
          desc="Blur cards unless you hold the mouse/tap"
        />
        <Row label="Decrypt Method" value="Threshold Network" mono />
        <Row label="Last Decrypt" value="~5s ago" color="var(--color-text-muted)" />
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
          ⛽  GAS & TRANSACTIONS
          ═══════════════════════════════════════════════════════════════════ */}
      <Section
        title="Gas & Transactions"
        icon="⛽"
        accentColor="#FF8C42"
        delay={0.16}
        collapsible
        defaultOpen={false}
      >
        <Toggle
          on={showGasCost}
          onToggle={() => setShowGasCost(!showGasCost)}
          label="Show Gas Before Confirm"
          desc="Display estimated cost for each move"
        />
        <Toggle
          on={autoEstimateGas}
          onToggle={() => setAutoEstimateGas(!autoEstimateGas)}
          label="Auto-Estimate FHE Gas"
          desc="FHE ops cost more — auto-adjust limits"
        />
        <Toggle
          on={gasAlerts}
          onToggle={() => setGasAlerts(!gasAlerts)}
          label="High Gas Alerts"
          desc="Warn if gas is abnormally high"
        />
        <Row label="Avg. FHE Gas" value="~280,000 gwei" mono />
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
          🎮  GAMEPLAY
          ═══════════════════════════════════════════════════════════════════ */}
      <Section
        title="Gameplay"
        icon="♠"
        accentColor="#39FF14"
        delay={0.2}
      >
        <Select
          label="Turn Timer"
          desc="Time to act before auto-fold"
          value={turnTimer}
          options={[
            { value: '15', label: '15 sec' },
            { value: '30', label: '30 sec' },
            { value: '60', label: '60 sec' },
            { value: '90', label: '90 sec' },
          ]}
          onChange={setTurnTimer}
        />
        <Toggle
          on={autoPostBlind}
          onToggle={() => setAutoPostBlind(!autoPostBlind)}
          label="Auto-Post Blind"
          desc="Automatically post ante when new hand starts"
        />
        <Toggle
          on={autoMuck}
          onToggle={() => setAutoMuck(!autoMuck)}
          label="Auto-Muck Losing Hand"
          desc="Don't reveal your cards when you lose"
        />
        <Toggle
          on={fourColorDeck}
          onToggle={() => setFourColorDeck(!fourColorDeck)}
          label="Four-Color Deck"
          desc="Each suit gets a unique color"
        />
        <Toggle
          on={runItTwice}
          onToggle={() => setRunItTwice(!runItTwice)}
          label="Run It Twice"
          desc="Deal two boards on all-in (if opponent agrees)"
        />
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
          🔊  SOUND & VISUALS
          ═══════════════════════════════════════════════════════════════════ */}
      <Section
        title="Sound & Visuals"
        icon="🔊"
        delay={0.24}
        collapsible
        defaultOpen={false}
      >
        <Toggle
          on={soundOn}
          onToggle={() => setSoundOn(!soundOn)}
          label="Sound Effects"
          desc="Cards, chips, win/loss sounds"
        />
        <Toggle
          on={showAnimations}
          onToggle={() => setShowAnimations(!showAnimations)}
          label="Animations"
          desc="Card flips, chip movements, transitions"
        />
        <Select
          label="Table Theme"
          value={tableSkin}
          options={[
            { value: 'classic', label: 'Classic Green' },
            { value: 'midnight', label: 'Midnight' },
            { value: 'neon', label: 'Neon Cyber' },
            { value: 'royal', label: 'Royal Purple' },
          ]}
          onChange={setTableSkin}
        />
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
          🔐  SESSION SECURITY
          ═══════════════════════════════════════════════════════════════════ */}
      <Section
        title="Session Security"
        icon="🔐"
        accentColor="#FF3B3B"
        delay={0.28}
        collapsible
        defaultOpen={false}
      >
        <Select
          label="Auto-Logout"
          desc="Disconnect wallet after inactivity"
          value={autoLogout}
          options={[
            { value: '15', label: '15 min' },
            { value: '30', label: '30 min' },
            { value: '60', label: '60 min' },
            { value: 'never', label: 'Never' },
          ]}
          onChange={setAutoLogout}
        />
        <Row label="Session Started" value="12 min ago" color="var(--color-text-muted)" />
        <ActionRow
          label="Revoke All Access"
          desc="Remove all contract permissions"
          btnLabel="REVOKE ALL"
          btnColor="var(--color-danger)"
          onClick={async () => {
            try { await removeActivePermit(); } catch {}
            setPermitStatus('none');
            setPermitError(null);
          }}
        />
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
          ◆  STATISTICS
          ═══════════════════════════════════════════════════════════════════ */}
      <Section
        title="Statistics"
        icon="◆"
        delay={0.32}
        collapsible
      >
        {/* Mini stat cards */}
        <div className="grid grid-cols-3 gap-3 py-4">
          {[
            { label: 'WINS', value: String(wins), color: 'var(--color-success)' },
            { label: 'LOSSES', value: String(losses), color: 'var(--color-danger)' },
            { label: 'FOLDS', value: String(folds), color: 'var(--color-text-muted)' },
          ].map(s => (
            <div
              key={s.label}
              className="rounded-xl p-3 text-center"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
            >
              <div className="font-clash text-2xl mb-0.5" style={{ color: s.color }}>{s.value}</div>
              <div className="font-mono text-[9px] tracking-widest" style={{ color: 'var(--color-text-muted)' }}>{s.label}</div>
            </div>
          ))}
        </div>
        <Row label="Hands Played" value={String(history.length)} />
        <Row
          label="Win Rate"
          value={`${winRate}%`}
          color={winRate >= 50 ? 'var(--color-success)' : winRate > 0 ? 'var(--color-danger)' : undefined}
        />
        <Row
          label="Net Profit"
          value={`${totalDelta >= 0 ? '+' : ''}${totalDelta} chips`}
          color={totalDelta >= 0 ? 'var(--color-success)' : 'var(--color-danger)'}
        />
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
          ⛓  SMART CONTRACT
          ═══════════════════════════════════════════════════════════════════ */}
      <Section
        title="Smart Contract"
        icon="⛓"
        delay={0.36}
        collapsible
        defaultOpen={false}
      >
        <Row
          label="Status"
          value={deployed ? 'Deployed' : 'Not Deployed'}
          color={deployed ? 'var(--color-success)' : 'var(--color-danger)'}
        />
        {deployed && (
          <>
            <div className="flex items-center justify-between py-3.5">
              <span className="font-satoshi text-sm" style={{ color: 'var(--color-text-secondary)' }}>Address</span>
              <button
                onClick={copyContract}
                className="font-mono text-xs transition-colors hover:text-primary flex items-center gap-1.5"
                title="Copy contract address"
              >
                {CONTRACT_ADDRESS.slice(0, 6)}...{CONTRACT_ADDRESS.slice(-4)}
                <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>⧉</span>
              </button>
            </div>
            <Row label="Ante" value="10 chips" mono />
            <Row label="Starting Balance" value="1,000 chips" mono />
            <Row label="Engine" value="Fhenix CoFHE" mono />
            <div className="pt-3">
              <a
                href={`${ETHERSCAN}/address/${CONTRACT_ADDRESS}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs tracking-wider transition-colors hover:text-white"
                style={{ color: 'var(--color-info)' }}
              >
                View Contract ↗
              </a>
            </div>
          </>
        )}
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
          ♠  ABOUT
          ═══════════════════════════════════════════════════════════════════ */}
      <Section
        title="About"
        icon="♠"
        delay={0.4}
        collapsible
        defaultOpen={false}
      >
        <Row label="Project" value="Cofhe Poker" />
        <Row label="Built for" value="Fhenix Buildathon 2026" />
        <Row label="Chain" value="Ethereum Sepolia" />
        <Row label="FHE Engine" value="Fhenix CoFHE" mono />
        <div className="flex flex-wrap gap-2 pt-4">
          {[
            { label: 'GitHub', href: 'https://github.com/leonid-cofhe/cofhe-poker' },
            { label: 'Fhenix Docs', href: 'https://cofhe-docs.fhenix.zone' },
            { label: 'CoFHE SDK', href: 'https://www.npmjs.com/package/@cofhe/sdk' },
          ].map(link => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[10px] tracking-widest px-3 py-1.5 rounded-full transition-colors hover:text-white"
              style={{
                color: 'var(--color-info)',
                border: '1px solid rgba(77,124,255,0.2)',
              }}
            >
              {link.label} ↗
            </a>
          ))}
        </div>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
          ACTIONS
          ═══════════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.45 }}
        className="flex flex-col gap-3 mt-6 mb-10"
      >
        {isConnected && (
          <button
            onClick={() => disconnect()}
            className="w-full h-12 rounded-full font-mono text-xs tracking-widest uppercase transition-all group relative overflow-hidden"
            style={{
              color: 'var(--color-danger)',
              border: '1px solid rgba(255,59,59,0.25)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,59,59,0.06)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            DISCONNECT WALLET
          </button>
        )}
        <button
          onClick={() => setAppState('landing')}
          className="w-full h-12 rounded-full font-mono text-xs tracking-widest uppercase transition-all"
          style={{
            color: 'var(--color-text-muted)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          BACK TO LANDING PAGE
        </button>
      </motion.div>
    </div>
  );
};
