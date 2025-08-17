import '@walletconnect/react-native-compat';

import {
  AppKit,
  createAppKit,
  defaultWagmiConfig,
} from '@reown/appkit-wagmi-react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mainnet, polygon, polygonAmoy, arbitrum, base, bsc } from '@wagmi/core/chains';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import Toast from 'react-native-toast-message';
import { WagmiProvider } from 'wagmi';
import { useWalletToasts } from '../hooks/useWalletToasts';
import { useGlobalLogoutState } from '../hooks/useLogoutState';
import { SessionManager } from '../utils/sessionManager';

const queryClient = new QueryClient();

const projectId = process.env.EXPO_PUBLIC_REOWN_PROJECT_ID;

if (!projectId) {
  throw new Error('EXPO_PUBLIC_REOWN_PROJECT_ID is required!');
}

const metadata = {
  name: 'SuperPool',
  description: 'Decentralized Micro-Lending Pools',
  url: 'https://superpool.app',
  icons: ['https://avatars.githubusercontent.com/u/179229932'],
  redirect: {
    native: 'superpool://',
    universal: 'https://superpool.app',
  },
};

const chains = [mainnet, polygon, polygonAmoy, arbitrum, base, bsc] as const;

const wagmiConfig = defaultWagmiConfig({ chains, projectId, metadata });

createAppKit({
  projectId,
  metadata,
  wagmiConfig,
  defaultChain: polygon,
  enableAnalytics: true,
});

function AppContent() {
  useWalletToasts() // Global wallet toast notifications
  useGlobalLogoutState() // Global logout state management
  
  // Debug session state on app start
  useEffect(() => {
    if (__DEV__) {
      SessionManager.getSessionDebugInfo()
        .then(debugInfo => {
          console.log('App startup - Session debug info:', {
            totalKeys: debugInfo.totalKeys,
            walletConnectKeysCount: debugInfo.walletConnectKeys.length,
            walletConnectKeys: debugInfo.walletConnectKeys.slice(0, 5) // Show first 5
          })
        })
        .catch(error => {
          console.warn('Failed to get session debug info on startup:', error)
        })
    }
  }, [])
  
  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="dashboard" />
      </Stack>
      <AppKit />
      <Toast />
    </>
  )
}

export default function RootLayout() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <AppContent />
      </QueryClientProvider>
    </WagmiProvider>
  );
}