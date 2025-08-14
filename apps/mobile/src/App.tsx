import '@walletconnect/react-native-compat';

import {
  AppKit,
  createAppKit,
  defaultWagmiConfig,
} from '@reown/appkit-wagmi-react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mainnet, polygon, polygonAmoy } from '@wagmi/core/chains';
import { WagmiProvider } from 'wagmi';
import AppContainer from './AppContainer';

// Setup queryClient
const queryClient = new QueryClient();

// Get projectId at https://dashboard.reown.com
const projectId = process.env.EXPO_PUBLIC_REOWN_PROJECT_ID;

// Create config
const metadata = {
  name: 'SuperPool',
  description: 'Decentralized Micro-Lending Pools',
  url: 'https://reown.com/appkit',
  icons: ['https://avatars.githubusercontent.com/u/179229932'],
  redirect: {
    native: 'YOUR_APP_SCHEME://',
    universal: 'YOUR_APP_UNIVERSAL_LINK.com',
  },
};

const chains = [mainnet, polygon, polygonAmoy] as const;

const wagmiConfig = defaultWagmiConfig({ chains, projectId, metadata });

// Create modal
createAppKit({
  projectId,
  metadata,
  wagmiConfig,
  defaultChain: polygon,
  enableAnalytics: true,
});

export default function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <AppContainer />
        <AppKit />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
