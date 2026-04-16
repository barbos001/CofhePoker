import { useGameStore } from '@/store/useGameStore';
import { LandingPage } from '@/components/LandingPage';
import { AppShell } from '@/components/AppShell';
import { Preloader } from '@/components/Preloader';
import { WalletOverlay } from '@/components/WalletOverlay';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';

// SVG noise grain texture (data URI, no external deps)
const GRAIN_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='200' height='200' filter='url(%23n)' opacity='0.045'/></svg>`;

/* ── Page transition variants ────────────────────────────────────── */
const PAGE_VARIANTS = {
  landing: {
    initial:  { opacity: 0, y: 16 },
    animate:  { opacity: 1, y: 0 },
    exit:     { opacity: 0, y: -20, scale: 0.98 },
  },
  app: {
    initial:  { opacity: 0, x: 40 },
    animate:  { opacity: 1, x: 0 },
    exit:     { opacity: 0, x: -40 },
  },
};

const PAGE_TRANSITION = { duration: 0.38, ease: [0.22, 1, 0.36, 1] };

export default function App() {
  const appState            = useGameStore(s => s.appState);
  const setAppState         = useGameStore(s => s.setAppState);
  const setAddress          = useGameStore(s => s.setAddress);
  const sessionStartedAt    = useGameStore(s => s.sessionStartedAt);
  const setSessionStartedAt = useGameStore(s => s.setSessionStartedAt);
  const [preloaderKey, setPreloaderKey] = useState(0);
  const prevAppStateRef = useRef(appState);
  const isFirstRender = useRef(true);
  const { address, isConnected } = useAccount();

  // Auto-advance to app when wagmi reconnects (e.g. page reload with wallet still connected)
  useEffect(() => {
    if (isConnected && address && appState !== 'app') {
      setAddress(address);
      setAppState('app');
      if (!sessionStartedAt) setSessionStartedAt(Date.now());
    }
  }, [isConnected, address, appState, setAppState, setAddress, sessionStartedAt, setSessionStartedAt]);

  // Auto-skip landing if room link in URL → go straight to wallet connect
  useEffect(() => {
    if (appState === 'landing' && window.location.hash.startsWith('#/room/')) {
      setAppState('connecting');
    }
  }, [appState, setAppState]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      prevAppStateRef.current = appState;
      return;
    }

    if (appState === 'landing' && prevAppStateRef.current !== 'landing') {
      setPreloaderKey(k => k + 1);
    }

    prevAppStateRef.current = appState;
  }, [appState]);

  const isLanding = appState === 'landing' || appState === 'connecting';

  return (
    <ErrorBoundary>
      <Preloader key={preloaderKey} forceShow={preloaderKey > 0} />

      <AnimatePresence mode="wait">
        {isLanding ? (
          <motion.div
            key="landing"
            variants={PAGE_VARIANTS.landing}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={PAGE_TRANSITION}
            style={{ width: '100%', minHeight: '100vh' }}
          >
            <LandingPage />
          </motion.div>
        ) : (
          <motion.div
            key="app"
            variants={PAGE_VARIANTS.app}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={PAGE_TRANSITION}
            style={{ width: '100%', minHeight: '100vh' }}
          >
            <AppShell />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {appState === 'connecting' && <WalletOverlay />}
      </AnimatePresence>

      {/* Global film-grain overlay */}
      <div
        aria-hidden
        style={{
          position:           'fixed',
          inset:              0,
          zIndex:             9999,
          pointerEvents:      'none',
          backgroundImage:    `url("data:image/svg+xml,${GRAIN_SVG}")`,
          backgroundRepeat:   'repeat',
          backgroundSize:     '200px 200px',
          animation:          'grain 0.4s steps(2) infinite',
          mixBlendMode:       'overlay',
          opacity:            1,
        }}
      />
    </ErrorBoundary>
  );
}
