import { useGameStore }            from '@/store/useGameStore';
import { TopBar, BottomTabBar, NetworkGuard } from './Navigation';
import { PlayHub }                 from './PlayHub';
import { HistoryTab }              from './HistoryTab';
import { HelpTab }                 from './HelpTab';
import { SettingsTab }             from './SettingsTab';
import { WalletOverlay }           from './WalletOverlay';
import { WalletPanel }             from './ui/WalletPanel';
import { PermitExpiryToast }       from './ui/PermitIndicator';
import { ToastContainer }          from './ui/Toast';
import { useSounds }               from '@/hooks/useSounds';
import { useVault }                from '@/hooks/useVault';
import { AnimatePresence, motion } from 'framer-motion';

export const AppShell = () => {
  const { activeTab } = useGameStore();
  useSounds();
  useVault(); // initializes vault balance polling

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

      <AnimatePresence>
        <WalletOverlay key="wallet-overlay" />
      </AnimatePresence>

      <PermitExpiryToast />
      <ToastContainer />

      {/* Real-money vault panel (global modal) */}
      <AnimatePresence>
        <WalletPanel key="wallet-panel" />
      </AnimatePresence>
    </div>
  );
};
