import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, useDisconnect } from 'wagmi';
import { useGameStore } from '@/store/useGameStore';
import { CONTRACT_ADDRESS } from '@/config/contract';
import { useCofhe } from '@/hooks/useCofhe';
import { useVaultStore } from '@/store/useVaultStore';
import { VAULT_DEPLOYED } from '@/config/vault';
import { Key, Wallet, CreditCard, Zap, Gamepad2, Volume2, Shield, BarChart2, FileCode, Info } from 'lucide-react';

const ETHERSCAN = 'https://sepolia.etherscan.io';

const Toggle = ({ on, onToggle, label, desc }: { on: boolean; onToggle: () => void; label: string; desc?: string }) => (
  <button onClick={onToggle} className="flex items-center justify-between w-full py-4 group text-left">
    <div className="flex flex-col gap-1 pr-4">
      <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 600, fontSize: 14, letterSpacing: '0.03em', color: 'white' }}>{label}</span>
      {desc && <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 400, fontSize: 12, letterSpacing: '0.03em', color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>{desc}</span>}
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
      <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 400, fontSize: 14, letterSpacing: '0.03em', color: 'white' }}>{label}</span>
      {desc && <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 400, fontSize: 12, letterSpacing: '0.03em', color: 'rgba(255,255,255,0.45)', lineHeight: 1.4 }}>{desc}</span>}
    </div>
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="px-3.5 py-2 rounded-lg appearance-none cursor-pointer transition-colors outline-none"
      style={{
        fontFamily: "'Chakra Petch', sans-serif",
        fontWeight: 500,
        fontSize: 13,
        letterSpacing: '0.05em',
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

const Row = ({ label, value, mono, color }: { label: string; value: string; mono?: boolean; color?: string }) => (
  <div className="flex items-center justify-between" style={{ padding: '16px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
    <span
      style={{
        fontFamily: "'Chakra Petch', sans-serif",
        fontWeight: 400,
        fontSize: 13,
        letterSpacing: '0.03em',
        color: 'rgba(255,255,255,0.4)',
      }}
    >{label}</span>
    <span
      className="text-right max-w-[60%] truncate"
      style={{
        fontFamily: "'Chakra Petch', sans-serif",
        fontWeight: 600,
        fontSize: 14,
        letterSpacing: mono ? '0.05em' : '0.03em',
        color: color || 'rgba(255,255,255,0.95)',
      }}
    >
      {value}
    </span>
  </div>
);

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
  <div className="flex items-center justify-between" style={{ padding: '16px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
    <div className="flex flex-col gap-0.5 pr-4">
      <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 600, fontSize: 14, letterSpacing: '0.03em', color: 'white' }}>{label}</span>
      {desc && <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 400, fontSize: 12, letterSpacing: '0.02em', color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>{desc}</span>}
    </div>
    <button
      onClick={onClick}
      disabled={disabled}
      className="uppercase shrink-0 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      style={{
        fontFamily: "'Chakra Petch', sans-serif",
        fontWeight: 600,
        fontSize: 12,
        letterSpacing: '0.1em',
        color: btnColor,
        border: `1px solid ${btnColor}`,
        borderRadius: 6,
        padding: '4px 14px',
        background: `color-mix(in srgb, ${btnColor} 7%, transparent)`,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `color-mix(in srgb, ${btnColor} 15%, transparent)`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = `color-mix(in srgb, ${btnColor} 7%, transparent)`; }}
    >
      {btnLabel}
    </button>
  </div>
);

const StatusBadge = ({ active, label }: { active: boolean; label: string }) => (
  <span
    className="uppercase"
    style={{
      fontFamily: "'Chakra Petch', sans-serif",
      fontWeight: 600,
      fontSize: 11,
      letterSpacing: '0.08em',
      borderRadius: 999,
      padding: '2px 10px',
      background: active ? 'rgba(0,255,120,0.10)' : 'rgba(255,60,60,0.12)',
      color: active ? '#00FF78' : '#FF4444',
      border: active ? '1px solid rgba(0,255,120,0.25)' : '1px solid rgba(255,60,60,0.25)',
    }}
  >
    {label}
  </span>
);

const Section = ({
  id,
  title,
  icon,
  badge,
  accentColor,
  children,
  delay = 0,
  collapsible = false,
  defaultOpen = true,
}: {
  id?: string;
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
      id={id}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="mb-4 overflow-hidden scroll-mt-24"
      style={{
        background: '#0F1318',
        border: '1px solid rgba(0,229,255,0.12)',
        borderRadius: 12,
        boxShadow: '0 0 32px rgba(0,229,255,0.03)',
      }}
    >
      {/* Card header */}
      <button
        onClick={collapsible ? () => setOpen(!open) : undefined}
        className={`w-full flex items-center justify-between px-5 py-4 ${collapsible ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <div className="flex items-center gap-3">
          {/* Icon container */}
          <span
            className="flex items-center justify-center shrink-0"
            style={{
              background: 'rgba(255,165,0,0.12)',
              borderRadius: 8,
              padding: 8,
              fontSize: 14,
              lineHeight: 1,
              color: accentColor || 'rgba(255,255,255,0.7)',
            }}
          >
            {icon}
          </span>
          <h3
            className="uppercase"
            style={{
              fontFamily: "'Chakra Petch', sans-serif",
              fontWeight: 700,
              fontSize: 16,
              letterSpacing: '0.08em',
              color: 'rgba(255,255,255,0.95)',
            }}
          >
            {title}
          </h3>
          {badge}
        </div>
        {collapsible && (
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}
          >
            ▾
          </motion.span>
        )}
      </button>

      {/* Divider under header */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '0 20px' }} />

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={collapsible ? { height: 0, opacity: 0 } : false}
            animate={{ height: 'auto', opacity: 1 }}
            exit={collapsible ? { height: 0, opacity: 0 } : undefined}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            {/* Remove border from last child row via CSS */}
            <div
              className="px-5 pb-1 last-row-no-border"
              style={{ paddingTop: 4 }}
            >
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const SIDEBAR_SECTIONS = [
  { id: 'permits',  Icon: Key,        label: 'FHE Permits' },
  { id: 'wallet',   Icon: Wallet,     label: 'Wallet' },
  { id: 'cards',    Icon: CreditCard, label: 'My Cards' },
  { id: 'gas',      Icon: Zap,        label: 'Gas & Tx' },
  { id: 'gameplay', Icon: Gamepad2,   label: 'Gameplay' },
  { id: 'sound',    Icon: Volume2,    label: 'Sound' },
  { id: 'security', Icon: Shield,     label: 'Security' },
  { id: 'stats',    Icon: BarChart2,  label: 'Statistics' },
  { id: 'contract', Icon: FileCode,   label: 'Contract' },
  { id: 'about',    Icon: Info,       label: 'About' },
];

/** Format a past timestamp as "Xs ago", "Xm ago", "Xh ago", or "Never" */
function toAgo(ts: number | null): string {
  if (!ts) return 'Never';
  const diff = Math.max(0, Date.now() - ts);
  const sec  = Math.floor(diff / 1000);
  const min  = Math.floor(sec  / 60);
  const hr   = Math.floor(min  / 60);
  if (hr  >= 1)  return `${hr}h ago`;
  if (min >= 1)  return `${min}m ago`;
  return `${sec}s ago`;
}

export const SettingsTab = () => {
  const { balance, history, setAppState, permitStatus, permitError, setPermitStatus, setPermitError,
          sessionStartedAt, lastDecryptAt } = useGameStore();
  const { address, isConnected, chainId } = useAccount();
  const { disconnect } = useDisconnect();
  const { ensurePermit, removeActivePermit, isReady: cofheReady } = useCofhe();
  const { setWalletPanelOpen } = useVaultStore();
  const [activeSection, setActiveSection] = useState<string>('permits');
  const deployed = CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000';

  // Tick every 30s to keep "X ago" labels fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

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

  // Auto-logout on inactivity
  const lastActivityRef = useRef(Date.now());
  useEffect(() => {
    const onActivity = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener('mousemove', onActivity, { passive: true });
    window.addEventListener('keydown',   onActivity, { passive: true });
    window.addEventListener('touchstart',onActivity, { passive: true });
    return () => {
      window.removeEventListener('mousemove',   onActivity);
      window.removeEventListener('keydown',     onActivity);
      window.removeEventListener('touchstart',  onActivity);
    };
  }, []);

  useEffect(() => {
    if (autoLogout === 'never' || !isConnected) return;
    const mins = parseInt(autoLogout, 10);
    const id = setInterval(() => {
      if (Date.now() - lastActivityRef.current > mins * 60_000) {
        disconnect();
        setAppState('landing');
      }
    }, 60_000); // check every minute
    return () => clearInterval(id);
  }, [autoLogout, isConnected, disconnect, setAppState]);

  // Stats
  const wins = history.filter(h => h.result === 'WON').length;
  const losses = history.filter(h => h.result === 'LOST').length;
  const folds = history.filter(h => h.result === 'FOLD').length;
  const winRate = history.length > 0 ? Math.round((wins / history.length) * 100) : 0;
  const totalDelta = history.reduce((acc, h) => acc + h.delta, 0);

  const copyAddress = () => { if (address) navigator.clipboard.writeText(address); };
  const copyContract = () => { navigator.clipboard.writeText(CONTRACT_ADDRESS); };

  return (
    <div className="w-full min-h-[calc(100vh-112px)] flex justify-center" style={{ background: '#0A0D12' }}>
      {/* ── Left Sidebar ── */}
      <div
        className="hidden lg:block w-[210px] shrink-0"
        style={{ background: '#0A0D12', borderRight: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="sticky top-[80px] pt-10 pb-6 flex flex-col px-2">
          {/* "SECTIONS" label */}
          <span
            className="uppercase block"
            style={{
              fontFamily: "'Chakra Petch', sans-serif",
              fontWeight: 400,
              fontSize: 10,
              letterSpacing: '0.2em',
              color: 'rgba(255,255,255,0.25)',
              padding: '0 16px',
              marginBottom: 4,
            }}
          >
            Sections
          </span>

          {/* Nav items */}
          {SIDEBAR_SECTIONS.map(s => {
            const isActive = activeSection === s.id;
            const iconColor = isActive ? '#00E5FF' : 'rgba(255,255,255,0.4)';
            return (
              <button
                key={s.id}
                onClick={() => scrollToSection(s.id)}
                className="w-full text-left transition-colors"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  height: 40,
                  gap: 10,
                  paddingLeft: isActive ? 13 : 16,
                  paddingRight: 12,
                  borderRadius: 8,
                  cursor: 'pointer',
                  borderLeft: isActive ? '3px solid #00E5FF' : '3px solid transparent',
                  background: isActive ? 'rgba(0,229,255,0.07)' : 'transparent',
                  color: isActive ? '#00E5FF' : 'rgba(255,255,255,0.45)',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLButtonElement;
                  if (!isActive) {
                    el.style.background = 'rgba(255,255,255,0.04)';
                    el.style.color = 'rgba(255,255,255,0.75)';
                    const svg = el.querySelector('svg') as SVGElement | null;
                    if (svg) svg.style.color = 'rgba(255,255,255,0.7)';
                  }
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLButtonElement;
                  if (!isActive) {
                    el.style.background = 'transparent';
                    el.style.color = 'rgba(255,255,255,0.45)';
                    const svg = el.querySelector('svg') as SVGElement | null;
                    if (svg) svg.style.color = 'rgba(255,255,255,0.4)';
                  }
                }}
              >
                <s.Icon
                  size={15}
                  strokeWidth={1.5}
                  style={{ color: iconColor, flexShrink: 0, transition: 'color 0.15s' }}
                />
                <span
                  className="uppercase truncate"
                  style={{
                    fontFamily: "'Chakra Petch', sans-serif",
                    fontWeight: 600,
                    fontSize: 13,
                    letterSpacing: '0.1em',
                  }}
                >
                  {s.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="w-full max-w-[700px] py-10 px-4 md:px-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 mb-8"
      >
        <h1
          className="uppercase leading-none"
          style={{
            fontFamily: "'Chakra Petch', sans-serif",
            fontWeight: 700,
            fontSize: 52,
            letterSpacing: '0.06em',
            color: 'white',
          }}
        >
          SETTINGS
        </h1>
        <span
          style={{
            fontFamily: "'Chakra Petch', sans-serif",
            fontWeight: 400,
            fontSize: 12,
            color: 'rgba(255,255,255,0.5)',
            background: 'rgba(255,255,255,0.06)',
            borderRadius: 6,
            padding: '3px 10px',
          }}
        >
          v1.0.0
        </span>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════════
          🔑  FHE PERMITS
          ═══════════════════════════════════════════════════════════════════ */}
      <Section
        id="permits"
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
          <div style={{ padding: '12px 0' }}>
            <div
              className="flex items-center gap-2.5 px-3 py-2.5"
              style={{
                background: 'rgba(255,149,0,0.07)',
                borderLeft: '3px solid #FF9500',
                borderRadius: '0 6px 6px 0',
              }}
            >
              <span style={{ color: '#FF9500', fontSize: 14, lineHeight: 1 }}>⚠</span>
              <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 400, fontSize: 13, letterSpacing: '0.02em', color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>
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
          btnColor="#00E5FF"
          onClick={handleSignPermit}
          disabled={!isConnected || !cofheReady || permitStatus === 'signing'}
        />
        <ActionRow
          label="Revoke Permit"
          desc="Immediately revoke current permit"
          btnLabel="REVOKE"
          btnColor="#FF4444"
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
        id="wallet"
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
          <div className="flex items-center justify-between" style={{ padding: '16px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 400, fontSize: 13, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.03em' }}>Address</span>
            <button
              onClick={copyAddress}
              className="flex items-center gap-1.5 transition-opacity hover:opacity-75"
              title="Copy address"
              style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 600, fontSize: 13, letterSpacing: '0.05em', color: 'rgba(255,255,255,0.95)' }}
            >
              {address.slice(0, 6)}...{address.slice(-4)}
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>⧉</span>
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
        <ActionRow
          label="Deposit / Withdraw"
          desc={!isConnected ? 'Connect wallet first' : 'Move real funds in or out of the vault'}
          btnLabel="OPEN VAULT"
          btnColor="var(--color-success)"
          onClick={() => setWalletPanelOpen(true)}
          disabled={!isConnected}
        />
        {isConnected && (
          <div style={{ padding: '12px 0' }}>
            <a
              href={address ? `${ETHERSCAN}/address/${address}` : '#'}
              target="_blank"
              rel="noreferrer"
              className="transition-opacity hover:opacity-75"
              style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 500, fontSize: 12, letterSpacing: '0.06em', color: '#00E5FF' }}
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
        id="cards"
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
        <Row label="Last Decrypt" value={toAgo(lastDecryptAt)} color="var(--color-text-muted)" />
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════
          ⛽  GAS & TRANSACTIONS
          ═══════════════════════════════════════════════════════════════════ */}
      <Section
        id="gas"
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
        id="gameplay"
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
        id="sound"
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
        id="security"
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
        <Row label="Session Started" value={toAgo(sessionStartedAt)} color="var(--color-text-muted)" />
        <ActionRow
          label="Revoke All Access"
          desc="Remove all contract permissions"
          btnLabel="REVOKE ALL"
          btnColor="#FF4444"
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
        id="stats"
        title="Statistics"
        icon="◆"
        delay={0.32}
        collapsible
      >
        {/* Mini stat cards */}
        <div className="grid grid-cols-3 gap-3 py-4">
          {[
            { label: 'WINS', value: String(wins), color: '#00FF78' },
            { label: 'LOSSES', value: String(losses), color: '#FF4444' },
            { label: 'FOLDS', value: String(folds), color: 'rgba(255,255,255,0.35)' },
          ].map(s => (
            <div
              key={s.label}
              className="p-3 text-center"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8 }}
            >
              <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700, fontSize: 26, color: s.color, lineHeight: 1.1 }}>{s.value}</div>
              <div style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 600, fontSize: 9, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>{s.label}</div>
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
        id="contract"
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
            <div className="flex items-center justify-between" style={{ padding: '16px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 400, fontSize: 13, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.03em' }}>Address</span>
              <button
                onClick={copyContract}
                className="flex items-center gap-1.5 transition-opacity hover:opacity-75"
                title="Copy contract address"
                style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 600, fontSize: 13, letterSpacing: '0.05em', color: 'rgba(255,255,255,0.95)' }}
              >
                {CONTRACT_ADDRESS.slice(0, 6)}...{CONTRACT_ADDRESS.slice(-4)}
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>⧉</span>
              </button>
            </div>
            <Row label="Ante" value="10 chips" mono />
            <Row label="Starting Balance" value="1,000 chips" mono />
            <Row label="Engine" value="Fhenix CoFHE" mono />
            <div style={{ padding: '12px 0' }}>
              <a
                href={`${ETHERSCAN}/address/${CONTRACT_ADDRESS}`}
                target="_blank"
                rel="noreferrer"
                className="transition-opacity hover:opacity-75"
                style={{ fontFamily: "'Chakra Petch', sans-serif", fontWeight: 500, fontSize: 12, letterSpacing: '0.06em', color: '#00E5FF' }}
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
        id="about"
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
              className="transition-opacity hover:opacity-75"
              style={{
                fontFamily: "'Chakra Petch', sans-serif",
                fontWeight: 500,
                fontSize: 11,
                letterSpacing: '0.08em',
                color: '#00E5FF',
                border: '1px solid rgba(0,229,255,0.2)',
                borderRadius: 6,
                padding: '4px 12px',
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
            className="w-full h-11 uppercase transition-colors"
            style={{
              fontFamily: "'Chakra Petch', sans-serif",
              fontWeight: 600,
              fontSize: 12,
              letterSpacing: '0.12em',
              color: '#FF4444',
              border: '1px solid rgba(255,68,68,0.3)',
              borderRadius: 8,
              background: 'transparent',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,68,68,0.07)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            DISCONNECT WALLET
          </button>
        )}
        <button
          onClick={() => setAppState('landing')}
          className="w-full h-11 uppercase transition-colors"
          style={{
            fontFamily: "'Chakra Petch', sans-serif",
            fontWeight: 600,
            fontSize: 12,
            letterSpacing: '0.12em',
            color: 'rgba(255,255,255,0.4)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            background: 'transparent',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
        >
          BACK TO LANDING PAGE
        </button>
      </motion.div>
      </div>{/* end main content */}
    </div>
  );
};
