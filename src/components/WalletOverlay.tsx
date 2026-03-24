import { motion } from 'framer-motion';
import { useConnect, useAccount, useSwitchChain } from 'wagmi';
import { useEffect } from 'react';
import { useGameStore } from '@/store/useGameStore';
import { Pill } from './ui/Pill';
import { sepolia } from '@/config/wagmi';

export const WalletOverlay = () => {
  const { appState, setAppState, setAddress } = useGameStore();
  const { connect, connectors, isPending }    = useConnect();
  const { address, isConnected, chainId }     = useAccount();
  const { switchChain }                       = useSwitchChain();

  // When connection succeeds, transition to app
  useEffect(() => {
    if (isConnected && address && appState === 'connecting') {
      setAddress(address);
      setAppState('app');
    }
  }, [isConnected, address, appState, setAddress, setAppState]);

  if (appState !== 'connecting') return null;

  const isWrongNetwork = isConnected && chainId !== sepolia.id;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 20 }}
        className="flex flex-col items-center gap-6 max-w-[360px] w-full px-6"
      >
        <div className="text-primary text-6xl">♠</div>
        <h2 className="font-clash text-5xl md:text-6xl uppercase tracking-tighter text-white">
          Connect
        </h2>

        {isWrongNetwork ? (
          <>
            <p className="font-satoshi text-sm text-danger text-center">
              Please switch to Ethereum Sepolia
            </p>
            <Pill
              size="lg"
              className="w-64 h-14 text-lg border-danger text-danger"
              onClick={() => switchChain({ chainId: sepolia.id })}
            >
              Switch Network
            </Pill>
          </>
        ) : isPending ? (
          <Pill size="lg" className="w-64 h-14 text-lg border-white/20">
            <motion.div
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              CONNECTING...
            </motion.div>
          </Pill>
        ) : (
          <>
            <p className="font-satoshi text-sm text-text-secondary text-center">
              Connect your MetaMask wallet to play on Sepolia testnet.
            </p>

            {/* Show available connectors */}
            {connectors.map((connector) => (
              <Pill
                key={connector.uid}
                size="lg"
                className="w-64 h-14 text-lg"
                onClick={() => connect({ connector })}
              >
                {connector.name === 'MetaMask' ? '🦊 ' : ''}{connector.name}
              </Pill>
            ))}

            <button
              onClick={() => setAppState('landing')}
              className="font-satoshi text-sm text-text-muted hover:text-white transition-colors mt-2"
            >
              Cancel
            </button>

            <p className="font-mono text-xs text-text-dark text-center">
              Connect your wallet to play on-chain with FHE encryption.
            </p>
          </>
        )}
      </motion.div>
    </motion.div>
  );
};
