import { createConfig, http } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { injected, metaMask } from 'wagmi/connectors';

// Public RPC – replace with your own Alchemy/Infura key for production
const SEPOLIA_RPC = import.meta.env.VITE_SEPOLIA_RPC_URL
  || 'https://ethereum-sepolia-rpc.publicnode.com';

export const wagmiConfig = createConfig({
  chains: [sepolia],
  // Disable EIP-6963 multi-provider discovery to prevent Nightly (and other
  // wallets that announce themselves twice) from causing cascading React
  // re-renders (error #185).  Users still connect via window.ethereum which
  // every injected wallet provides.
  multiInjectedProviderDiscovery: false,
  connectors: [
    injected(),
    metaMask(),
  ],
  transports: {
    [sepolia.id]: http(SEPOLIA_RPC),
  },
});

export { sepolia };
