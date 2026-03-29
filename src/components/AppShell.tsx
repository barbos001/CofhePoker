import { useGameStore }            from '@/store/useGameStore';
import { TopBar, BottomTabBar, NetworkGuard } from './Navigation';
import { PlayHub }                 from './PlayHub';
import { HistoryTab }              from './HistoryTab';
import { HelpTab }                 from './HelpTab';
import { SettingsTab }             from './SettingsTab';
import { WalletOverlay }           from './WalletOverlay';
import { PermitExpiryToast }       from './ui/PermitIndicator';
import { AnimatePresence, motion } from 'framer-motion';

const FHE_ACTIVE_STATES = new Set(['dealing', 'decrypting', 'botThinking', 'showdown']);

const FheScanline = ({ active }: { active: boolean }) => (
  <AnimatePresence>
    {active && (
      <motion.div
        key="fhe-scanline"
        className="fixed inset-0 pointer-events-none overflow-hidden"
        style={{ zIndex: 50 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div
          style={{
            position:   'absolute',
            left:       0,
            right:      0,
            height:     2,
            background: 'linear-gradient(90deg, transparent 0%, rgba(179,102,255,0.0) 10%, rgba(179,102,255,0.7) 50%, rgba(179,102,255,0.0) 90%, transparent 100%)',
            animation:  'scanline-drift 3.5s linear infinite',
            boxShadow:  '0 0 12px rgba(179,102,255,0.5)',
          }}
        />
        <div
          style={{
            position:   'absolute',
            inset:      0,
            background: 'radial-gradient(ellipse 80% 60% at 50% 50%, transparent 40%, rgba(179,102,255,0.04) 100%)',
          }}
        />
      </motion.div>
    )}
  </AnimatePresence>
);

export const AppShell = () => {
  const { activeTab, playState } = useGameStore();
  const fheActive = FHE_ACTIVE_STATES.has(playState);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col relative">
      <TopBar />
      <NetworkGuard />

      <main className="flex-1 relative pb-20 md:pb-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="w-full h-full"
          >
            {activeTab === 'play'     && <PlayHub />}
            {activeTab === 'history'  && <HistoryTab />}
            {activeTab === 'help'     && <HelpTab />}
            {activeTab === 'settings' && <SettingsTab />}
          </motion.div>
        </AnimatePresence>
      </main>

      <BottomTabBar />
      <FheScanline active={fheActive} />

      <AnimatePresence>
        <WalletOverlay key="wallet-overlay" />
      </AnimatePresence>

      <PermitExpiryToast />
    </div>
  );
};
