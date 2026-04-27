/**
 * Admin Dashboard — gated by password.
 * Route: /admin (activated via ?admin=1 query param)
 *
 * Shows: local session stats, contract addresses, player metrics.
 * Emergency pause: requires manual Hardhat/Etherscan call (contracts may not have Pausable).
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAccount } from 'wagmi';
import { useGameStore } from '@/store/useGameStore';
import { useProfileStore } from '@/store/useProfileStore';
import { CONTRACT_ADDRESS } from '@/config/contract';
import { HOLDEM_CONTRACT_ADDRESS } from '@/config/contractHoldem';
import { PVP_CONTRACT_ADDRESS } from '@/config/contractPvP';
import { HOLDEM_PVP_CONTRACT_ADDRESS } from '@/config/contractHoldemPvP';
import { VAULT_ADDRESS } from '@/config/vault';

const cp = (w: number, s: number | string, sp = '0.03em') => ({
  fontFamily: "'Chakra Petch', sans-serif", fontWeight: w, fontSize: s, letterSpacing: sp,
});

const ETHERSCAN = 'https://sepolia.etherscan.io/address/';
const ADMIN_PASSWORD = 'fhe-admin';

const StatCard = ({ label, value, color, sub }: { label: string; value: string | number; color?: string; sub?: string }) => (
  <div className="flex flex-col gap-1 p-4 rounded-xl"
    style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
    <span style={{ ...cp(400, 10, '0.14em'), color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>{label}</span>
    <span style={{ ...cp(700, 28, '0.02em'), color: color ?? 'white' }}>{value}</span>
    {sub && <span style={{ ...cp(400, 10), color: 'rgba(255,255,255,0.3)' }}>{sub}</span>}
  </div>
);

const ContractRow = ({ label, address }: { label: string; address: string }) => {
  const deployed = address !== '0x0000000000000000000000000000000000000000';
  return (
    <div className="flex items-center justify-between py-3"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div>
        <div style={{ ...cp(600, 13, '0.04em'), color: 'white' }}>{label}</div>
        <div style={{ ...cp(400, 10, '0.04em'), color: 'rgba(255,255,255,0.3)', marginTop: 2, wordBreak: 'break-all' }}>
          {address}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-4">
        <span style={{ ...cp(600, 11), color: deployed ? 'var(--color-success)' : 'var(--color-danger)', textTransform: 'uppercase' }}>
          {deployed ? '● Live' : '○ Not deployed'}
        </span>
        {deployed && (
          <a href={`${ETHERSCAN}${address}`} target="_blank" rel="noopener noreferrer"
            style={{ ...cp(400, 10), color: '#00BFFF', textDecoration: 'underline' }}>
            Etherscan ↗
          </a>
        )}
      </div>
    </div>
  );
};

export const AdminDashboard = () => {
  const { address, isConnected } = useAccount();
  const history     = useGameStore(s => s.history);
  const balance     = useGameStore(s => s.balance);
  const { xp, achievements } = useProfileStore();

  const [authenticated, setAuthenticated] = useState(false);
  const [password,      setPassword]      = useState('');
  const [pwError,       setPwError]       = useState(false);

  const handleLogin = () => {
    if (password === ADMIN_PASSWORD) {
      setAuthenticated(true);
      setPwError(false);
    } else {
      setPwError(true);
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm p-8 rounded-2xl"
          style={{ background: '#0F1318', border: '1px solid rgba(255,59,59,0.25)' }}
        >
          <div className="text-center mb-8" style={{ ...cp(700, 18, '0.08em'), color: 'var(--color-danger)', textTransform: 'uppercase' }}>
            🔐 Admin Access
          </div>
          <input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setPwError(false); }}
            onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }}
            placeholder="Admin password"
            className="w-full px-4 py-3 rounded-xl font-mono text-sm outline-none mb-3"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${pwError ? 'rgba(255,59,59,0.5)' : 'rgba(255,255,255,0.1)'}`,
              color: 'white',
            }}
          />
          {pwError && (
            <p style={{ ...cp(400, 11), color: 'var(--color-danger)', marginBottom: 8 }}>
              Incorrect password
            </p>
          )}
          <button
            onClick={handleLogin}
            className="w-full py-3 rounded-xl font-mono text-sm font-bold tracking-widest uppercase"
            style={{ background: 'rgba(255,59,59,0.12)', border: '1px solid rgba(255,59,59,0.3)', color: 'var(--color-danger)' }}
          >
            Enter
          </button>
        </motion.div>
      </div>
    );
  }

  const wins   = history.filter(h => h.result === 'WON').length;
  const losses = history.filter(h => h.result === 'LOST').length;
  const folds  = history.filter(h => h.result === 'FOLD').length;
  const winRate = history.length > 0 ? Math.round((wins / history.length) * 100) : 0;
  const net    = history.reduce((s, h) => s + h.delta, 0);
  const unlockedAchievements = achievements.filter(a => a.unlockedAt).length;

  const byMode = {
    'three-card': history.filter(h => h.gameMode === 'three-card').length,
    holdem:       history.filter(h => h.gameMode === 'holdem').length,
    pvp:          history.filter(h => h.gameMode === 'pvp').length,
  };

  return (
    <div className="min-h-screen bg-black p-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-[960px] mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <h1 style={{ ...cp(700, 32, '0.06em'), color: 'var(--color-danger)', textTransform: 'uppercase' }}>Admin</h1>
          <span className="px-2 py-1 rounded font-mono text-[10px] uppercase"
            style={{ background: 'rgba(255,59,59,0.1)', border: '1px solid rgba(255,59,59,0.2)', color: 'var(--color-danger)' }}>
            Restricted
          </span>
          <span className="ml-auto font-mono text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {isConnected ? address : 'Not connected'}
          </span>
        </div>

        {/* Session stats */}
        <section className="mb-8">
          <h2 style={{ ...cp(600, 12, '0.14em'), color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 12 }}>
            Session Metrics
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <StatCard label="Total Hands" value={history.length} />
            <StatCard label="Win Rate"    value={`${winRate}%`}  color={winRate >= 50 ? '#00E86C' : '#FF4444'} />
            <StatCard label="Net P/L"     value={net >= 0 ? `+${net}` : String(net)} color={net >= 0 ? '#00E86C' : '#FF4444'} sub="chips" />
            <StatCard label="Balance"     value={balance.toLocaleString()} color="#FFE03D" sub="chips" />
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <StatCard label="Wins"         value={wins}  color="#00E86C" />
            <StatCard label="Losses"       value={losses} color="#FF4444" />
            <StatCard label="Folds"        value={folds} color="rgba(255,255,255,0.4)" />
            <StatCard label="3-Card"       value={byMode['three-card']} color="#FFE03D" />
            <StatCard label="Hold'em"      value={byMode.holdem} color="#00BFFF" />
            <StatCard label="PvP"          value={byMode.pvp}    color="#B366FF" />
          </div>
        </section>

        {/* Profile stats */}
        <section className="mb-8">
          <h2 style={{ ...cp(600, 12, '0.14em'), color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 12 }}>
            Profile
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label="Total XP"      value={xp} color="#FFE03D" />
            <StatCard label="Achievements"  value={`${unlockedAchievements}/${achievements.length}`} color="#B366FF" />
            <StatCard label="Level"         value={Math.floor(xp / 100) + 1} color="white" />
          </div>
        </section>

        {/* Contract addresses */}
        <section className="mb-8">
          <h2 style={{ ...cp(600, 12, '0.14em'), color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 12 }}>
            Deployed Contracts (Sepolia)
          </h2>
          <div className="p-4 rounded-xl" style={{ background: '#0F1318', border: '1px solid rgba(255,255,255,0.07)' }}>
            <ContractRow label="3-Card Poker Bot"  address={CONTRACT_ADDRESS} />
            <ContractRow label="Hold'em Bot"       address={HOLDEM_CONTRACT_ADDRESS} />
            <ContractRow label="3-Card PvP"        address={PVP_CONTRACT_ADDRESS} />
            <ContractRow label="Hold'em PvP"       address={HOLDEM_PVP_CONTRACT_ADDRESS} />
            <ContractRow label="Vault"             address={VAULT_ADDRESS} />
          </div>
        </section>

        {/* Emergency action note */}
        <section>
          <div className="px-4 py-4 rounded-xl"
            style={{ background: 'rgba(255,140,66,0.06)', border: '1px solid rgba(255,140,66,0.15)' }}>
            <div style={{ ...cp(600, 13), color: 'var(--color-deco-orange)', marginBottom: 6 }}>⚠ Emergency Pause</div>
            <p style={{ ...cp(400, 12), color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
              To pause contracts, use Etherscan's "Write Contract" tab with the owner wallet,
              or run: <code style={{ color: '#00BFFF', background: 'rgba(0,191,255,0.08)', padding: '1px 4px', borderRadius: 4 }}>npx hardhat run scripts/pause.cts --network eth-sepolia</code>
            </p>
          </div>
        </section>

      </motion.div>
    </div>
  );
};
