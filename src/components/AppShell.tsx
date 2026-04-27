import { lazy, Suspense, useEffect } from 'react';
import { useGameStore }             from '@/store/useGameStore';
import { TopBar, BottomTabBar, NetworkGuard } from './Navigation';
import { WalletOverlay }            from './WalletOverlay';
import { WalletPanel }              from './ui/WalletPanel';
import { PermitExpiryToast }        from './ui/PermitIndicator';
import { ToastContainer }           from './ui/Toast';
import { LowBalanceAlert }          from './ui/LowBalanceAlert';
import { OnboardingTour }           from './OnboardingTour';
import { useSounds }                from '@/hooks/useSounds';
import { useVault }                 from '@/hooks/useVault';
import { useProfileSync }           from '@/hooks/useProfileSync';
import { AnimatePresence, motion }  from 'framer-motion';

// Lazy-loaded tabs — each split into its own chunk
const PlayHub        = lazy(() => import('./PlayHub').then(m => ({ default: m.PlayHub })));
const HistoryTab     = lazy(() => import('./HistoryTab').then(m => ({ default: m.HistoryTab })));
const ProfileTab     = lazy(() => import('./ProfileTab').then(m => ({ default: m.ProfileTab })));
const LeaderboardTab = lazy(() => import('./LeaderboardTab').then(m => ({ default: m.LeaderboardTab })));
const HelpTab        = lazy(() => import('./HelpTab').then(m => ({ default: m.HelpTab })));
const SettingsTab    = lazy(() => import('./SettingsTab').then(m => ({ default: m.SettingsTab })));

const TabFallback = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="w-6 h-6 rounded-full border-2 border-[#FFE03D] border-t-transparent animate-spin" />
  </div>
);

export const AppShell = () => {
  const activeTab = useGameStore(s => s.activeTab);
  useSounds();
  useVault();
  useProfileSync(); // bidirectional profile sync with Supabase

  // Capture referral param from URL — validate it's an Ethereum address
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    const isValidAddress = ref && /^0x[0-9a-fA-F]{40}$/.test(ref);
    if (isValidAddress && !localStorage.getItem('cofhe-referred-by')) {
      localStorage.setItem('cofhe-referred-by', ref);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (ref) {
      // Clean invalid ref from URL silently
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Auto-refresh challenges on mount (handles expired daily/weekly resets)
  useEffect(() => {
    import('@/store/useChallengesStore').then(m => m.useChallengesStore.getState().refreshIfNeeded());
  }, []);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col relative">
      <TopBar />
      <NetworkGuard />

      <main className="flex-1 relative pb-20 md:pb-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="w-full h-full"
          >
            <Suspense fallback={<TabFallback />}>
              {activeTab === 'play'        && <PlayHub />}
              {activeTab === 'history'     && <HistoryTab />}
              {activeTab === 'profile'     && <ProfileTab />}
              {activeTab === 'leaderboard' && <LeaderboardTab />}
              {activeTab === 'help'        && <HelpTab />}
              {activeTab === 'settings'    && <SettingsTab />}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>

      <BottomTabBar />

      <AnimatePresence>
        <WalletOverlay key="wallet-overlay" />
      </AnimatePresence>

      <PermitExpiryToast />
      <ToastContainer />
      <LowBalanceAlert />
      <OnboardingTour />

      <AnimatePresence>
        <WalletPanel key="wallet-panel" />
      </AnimatePresence>
    </div>
  );
};
