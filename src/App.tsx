import { useGameStore } from '@/store/useGameStore';
import { LandingPage } from '@/components/LandingPage';
import { AppShell } from '@/components/AppShell';
import { Preloader } from '@/components/Preloader';
import { WalletOverlay } from '@/components/WalletOverlay';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

// SVG noise grain texture (data URI, no external deps)
const GRAIN_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='200' height='200' filter='url(%23n)' opacity='0.045'/></svg>`;

export default function App() {
  const { appState, setAppState } = useGameStore();
  const [preloaderKey, setPreloaderKey] = useState(0);
  const prevAppStateRef = useRef(appState);
  const isFirstRender = useRef(true);

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

  return (
    <ErrorBoundary>
      <Preloader key={preloaderKey} forceShow={preloaderKey > 0} />

      {appState === 'landing' ? <LandingPage /> : <AppShell />}

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
