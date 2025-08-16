import '@walletconnect/react-native-compat';

import {
  AppKit,
  createAppKit,
  defaultWagmiConfig,
} from '@reown/appkit-wagmi-react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mainnet, polygon, polygonAmoy } from '@wagmi/core/chains';
import { Stack } from 'expo-router';
import { WagmiProvider } from 'wagmi';

const queryClient = new QueryClient();

const projectId = process.env.EXPO_PUBLIC_REOWN_PROJECT_ID;

if (!projectId) {
  throw new Error('EXPO_PUBLIC_REOWN_PROJECT_ID is required!');
}

const metadata = {
  name: 'SuperPool',
  description: 'Decentralized Micro-Lending Pools',
  url: 'https://reown.com/appkit',
  icons: ['https://avatars.githubusercontent.com/u/179229932'],
  redirect: {
    native: 'superpool://',
    universal: 'YOUR_APP_UNIVERSAL_LINK.com',
  },
};

const chains = [mainnet, polygon, polygonAmoy] as const;

const wagmiConfig = defaultWagmiConfig({ chains, projectId, metadata });

createAppKit({
  projectId,
  metadata,
  wagmiConfig,
  defaultChain: polygon,
  enableAnalytics: true,
});

export default function RootLayout() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="dashboard" />
        </Stack>
        <AppKit />
      </QueryClientProvider>
    </WagmiProvider>
  );
}