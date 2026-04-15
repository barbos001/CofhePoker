import { motion }                    from 'framer-motion';
import { useAccount, useDisconnect } from 'wagmi';
import { useGameStore }              from '@/store/useGameStore';
import { useEffect, useState }      from 'react';
import { PermitBadge, PermitDot }   from '@/components/ui/PermitIndicator';
import { useVaultStore, formatEth, formatUsdt, ethWeiToUsd, usdtToUsd, formatUsd } from '@/store/useVaultStore';
import { ETH_TOKEN, VAULT_DEPLOYED } from '@/config/vault';

const truncateAddr = (addr: string) =>
  `${addr.slice(0, 6)}...${addr.slice(-4)}`;

const TABS = [
  { key: 'play',     label: 'PLAY',     icon: '♠' },
  { key: 'history',  label: 'HISTORY',  icon: '◈' },
  { key: 'help',     label: 'HELP',     icon: '?' },
  { key: 'settings', label: 'SETTINGS', icon: '⚙' },
] as const;

const AnimatedChips = ({ value }: { value: number }) => {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (value === display) return;
    const diff = value - display;
    const steps = 8;
    const inc = diff / steps;
    let step = 0;
    const id = setInterval(() => {
      step++;
      if (step >= steps) {
        setDisplay(value);
        clearInterval(id);
      } else {
        setDisplay(prev => Math.round(prev + inc));
      }
    }, 30);
    return () => clearInterval(id);
  }, [value, display]);

  return (
    <motion.span key={display} initial={{ y: -2 }} animate={{ y: 0 }}>
      {display.toLocaleString()}
    </motion.span>
  );
};

export const TopBar = () => {
  const { activeTab, setActiveTab, balance, setAppState, history, playState } = useGameStore();
  const { address: walletAddr, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { ethFree, usdtFree, ethUsdPrice, selectedToken, walletPanelOpen, setWalletPanelOpen, realMoneyMode } = useVaultStore();

  const displayAddr = walletAddr ? truncateAddr(walletAddr) : 'Not connected';
  const wins = history.filter(h => h.result === 'WON').length;
  const winRate = history.length > 0 ? Math.round((wins / history.length) * 100) : 0;

  // Vault balance display (ETH or USDT depending on selected token)
  const vaultUsd = selectedToken === ETH_TOKEN
    ? ethWeiToUsd(ethFree, ethUsdPrice)
    : usdtToUsd(usdtFree);

  return (
    <header
      className="sticky top-0 z-40 w-full"
      style={{
        background:    'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(20px)',
        borderBottom:  '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="h-16 flex items-center justify-between px-4 md:px-8 max-w-[1400px] mx-auto w-full">
        {/* ── Left: Logo ── */}
        <button
          onClick={() => setAppState('landing')}
          className="flex items-center gap-2.5 shrink-0 group"
        >
          <img
            src="/logo.png"
            alt="Cofhe Poker"
            className="transition-all"
            style={{
              width: 30,
              height: 30,
              borderRadius: 7,
              filter: 'drop-shadow(0 0 6px rgba(57,255,20,0.25))',
            }}
          />
          <span className="font-mono text-sm font-bold tracking-widest uppercase hidden sm:block text-white group-hover:text-[#39FF14] transition-colors">
            Cofhe Poker
          </span>
        </button>

        {/* ── Center: Tabs ── */}
        <div
          className="hidden md:flex items-center gap-1 p-1 rounded-full relative"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border:     '1px solid rgba(255,255,255,0.06)',
          }}
        >
          {TABS.map(tab => {
            const isActive = activeTab === tab.key;
            const gameActive = !['lobby', 'result'].includes(playState) && activeTab === 'play';
            const blocked = gameActive && tab.key !== 'play';
            return (
              <button
                key={tab.key}
                onClick={() => {
                  if (blocked) return; // can't switch tabs during active game
                  setActiveTab(tab.key);
                }}
                title={blocked ? 'Finish or fold your hand first' : undefined}
                className="relative z-10 h-9 px-6 rounded-full font-mono text-xs font-bold tracking-widest uppercase transition-colors flex items-center gap-2"
                style={{
                  color: isActive ? '#000' : 'rgba(255,255,255,0.7)',
                  opacity: blocked ? 0.3 : 1,
                  cursor: blocked ? 'not-allowed' : 'pointer',
                }}
              >
                {isActive && (
                  <motion.div
                    layoutId="tab-pill"
                    className="absolute inset-0 rounded-full"
                    style={{ background: 'var(--color-primary)', zIndex: -1 }}
                    transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                  />
                )}
                <span className="text-[13px]">{tab.icon}</span>
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── Right: Permit + Stats + Balance + Wallet ── */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* FHE Permit status — always visible */}
          <PermitBadge className="hidden sm:flex" />

          {/* Win rate indicator */}
          {history.length >= 3 && (
            <div
              className="hidden lg:flex items-center gap-1.5 h-8 px-3 rounded-full font-mono text-[10px] tracking-wider"
              style={{
                background: winRate >= 50
                  ? 'rgba(0,232,108,0.06)'
                  : 'rgba(255,59,59,0.06)',
                border: winRate >= 50
                  ? '1px solid rgba(0,232,108,0.12)'
                  : '1px solid rgba(255,59,59,0.12)',
                color: winRate >= 50
                  ? 'var(--color-success)'
                  : 'var(--color-danger)',
              }}
            >
              {winRate}% WR
              <span className="opacity-50">·</span>
              {history.length} hands
            </div>
          )}

          {/* Vault balance button */}
          {isConnected && (
            <button
              onClick={() => setWalletPanelOpen(!walletPanelOpen)}
              className="hidden sm:flex items-center gap-2 h-9 px-4 rounded-full font-mono text-xs font-bold tracking-wider transition-all"
              style={{
                background: realMoneyMode ? 'rgba(0,232,108,0.08)' : 'rgba(255,255,255,0.04)',
                border:     realMoneyMode
                  ? '1px solid rgba(0,232,108,0.25)'
                  : '1px solid rgba(255,255,255,0.08)',
                color: realMoneyMode ? 'var(--color-success)' : 'var(--color-text-muted)',
              }}
              title="Open Vault — deposit / withdraw real funds"
            >
              <span className="text-[11px]">◈</span>
              {VAULT_DEPLOYED ? formatUsd(vaultUsd) : 'Vault'}
            </button>
          )}

          {/* Play-money chip balance */}
          {!realMoneyMode && (
          <div
            className="hidden sm:flex items-center gap-2 h-9 px-4 rounded-full font-mono text-sm font-bold"
            style={{
              background:  'rgba(255,224,61,0.08)',
              border:      '1px solid rgba(255,224,61,0.15)',
              color:       'var(--color-primary)',
            }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{
                background: 'var(--color-primary)',
                boxShadow: '0 0 6px rgba(255,224,61,0.5)',
                animation: 'ambient-breathe 2s ease-in-out infinite',
              }}
            />
            <AnimatedChips value={balance} />
            <span className="text-[10px] tracking-wider opacity-60 ml-0.5">CHIPS</span>
          </div>
          )}

          {/* Wallet */}
          <button
            onClick={() => isConnected ? disconnect() : setAppState('connecting')}
            className="flex items-center gap-2 h-9 px-4 rounded-full font-mono text-xs tracking-wider transition-all"
            title={isConnected ? 'Click to disconnect' : 'Click to connect wallet'}
            style={{
              background: isConnected ? 'rgba(255,255,255,0.05)' : 'rgba(255,224,61,0.06)',
              border:     isConnected ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(255,224,61,0.2)',
              color:      isConnected ? 'rgba(255,255,255,0.7)' : 'var(--color-primary)',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = isConnected ? 'rgba(255,255,255,0.2)' : 'rgba(255,224,61,0.4)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = isConnected ? 'rgba(255,255,255,0.08)' : 'rgba(255,224,61,0.2)')}
          >
            {isConnected ? displayAddr : 'Connect Wallet'}
            <span
              className="w-2 h-2 rounded-full"
              style={{
                background: isConnected ? 'var(--color-success)' : 'var(--color-text-muted)',
                boxShadow:  isConnected ? '0 0 6px rgba(0,232,108,0.4)' : 'none',
              }}
            />
          </button>
        </div>
      </div>
    </header>
  );
};

export const BottomTabBar = () => {
  const { activeTab, setActiveTab, balance, playState } = useGameStore();

  return (
    <div
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 px-3 pb-2 pt-1.5"
      style={{
        background:    'rgba(0,0,0,0.92)',
        backdropFilter: 'blur(20px)',
        borderTop:     '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Mobile balance + permit row */}
      <div
        className="flex items-center justify-center gap-2 mb-1.5 py-1 font-mono text-xs font-bold"
        style={{ color: 'var(--color-primary)' }}
      >
        <PermitDot />
        <span className="text-[10px] opacity-40">·</span>
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: 'var(--color-primary)', animation: 'ambient-breathe 2s ease-in-out infinite' }}
        />
        <AnimatedChips value={balance} /> CHIPS
      </div>

      {/* Tabs */}
      <div
        className="flex items-center gap-1 p-1 rounded-full relative"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border:     '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          const gameActive = !['lobby', 'result'].includes(playState) && activeTab === 'play';
          const blocked = gameActive && tab.key !== 'play';
          return (
            <button
              key={tab.key}
              onClick={() => { if (!blocked) setActiveTab(tab.key); }}
              className="relative flex-1 h-10 rounded-full font-mono text-[11px] font-bold tracking-widest uppercase flex items-center justify-center gap-1.5 transition-colors"
              style={{
                background: isActive ? 'var(--color-primary)' : 'transparent',
                color:      isActive ? '#000' : 'rgba(255,255,255,0.6)',
                opacity:    blocked ? 0.3 : 1,
                cursor:     blocked ? 'not-allowed' : 'pointer',
              }}
            >
              <span className="text-xs">{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const NetworkGuard = () => {
  const { isConnected, chainId } = useAccount();
  const SEPOLIA_ID = 11155111;
  const [switching, setSwitching] = useState(false);

  if (!isConnected || chainId === SEPOLIA_ID) return null;

  const switchToSepolia = async () => {
    setSwitching(true);
    const eth = (window as Window & { ethereum?: { request: (args: object) => Promise<unknown> } }).ethereum;
    if (!eth) { setSwitching(false); return; }

    try {
      // Try to switch first
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xaa36a7' }] });
    } catch (err: unknown) {
      // Error 4902 = chain not added to wallet, so add it
      if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 4902) {
        try {
          await eth.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0xaa36a7',
              chainName: 'Ethereum Sepolia Testnet',
              nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
              rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
              blockExplorerUrls: ['https://sepolia.etherscan.io'],
            }],
          });
        } catch { /* user rejected */ }
      }
    }
    setSwitching(false);
  };

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      className="w-full px-4 py-2.5 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:justify-between overflow-hidden"
      style={{
        background:   'rgba(255,59,59,0.08)',
        borderBottom: '1px solid rgba(255,59,59,0.15)',
      }}
    >
      <div>
        <span className="font-mono text-sm font-bold" style={{ color: 'var(--color-danger)' }}>
          Wrong network
        </span>
        <span className="font-mono text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>
          This app requires Ethereum Sepolia testnet
        </span>
      </div>
      <button
        className="font-mono text-xs tracking-wider px-5 py-2 rounded-full transition-all hover:brightness-110 disabled:opacity-50"
        style={{
          background: 'var(--color-danger)',
          color: '#fff',
          boxShadow: '0 0 12px rgba(255,59,59,0.3)',
        }}
        onClick={switchToSepolia}
        disabled={switching}
      >
        {switching ? 'SWITCHING...' : 'ADD & SWITCH TO SEPOLIA'}
      </button>
    </motion.div>
  );
};
