import '@walletconnect/react-native-compat';
import { EventEmitter } from 'events';

// Increase max listeners to prevent memory leak warnings from multiple WalletConnect sessions
EventEmitter.defaultMaxListeners = 20;

import {
  AppKit,
  createAppKit,
  defaultWagmiConfig,
} from '@reown/appkit-wagmi-react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { arbitrum, base, bsc, mainnet, polygon, polygonAmoy } from '@wagmi/core/chains';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import Toast from 'react-native-toast-message';
import { WagmiProvider } from 'wagmi';
import { localhost } from '../config/chains';
import { useGlobalLogoutState } from '../hooks/useLogoutState';
import { useWalletToasts } from '../hooks/useWalletToasts';
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

const chains = [mainnet, polygon, polygonAmoy, arbitrum, base, bsc, ...(__DEV__ ? [localhost] : [])] as const;

const wagmiConfig = defaultWagmiConfig({ chains, projectId, metadata });

// Clear stale sessions before AppKit initialization to prevent "No matching key" errors
SessionManager.preventiveSessionCleanup().catch(console.warn);

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
  
  // Debug session state on app start (no aggressive cleanup)
  useEffect(() => {
    if (__DEV__) {
      SessionManager.getSessionDebugInfo()
        .then(debugInfo => {
          console.log('🚀 App startup - Session debug info:', {
            totalKeys: debugInfo.totalKeys,
            walletConnectKeysCount: debugInfo.walletConnectKeys.length,
            walletConnectKeys: debugInfo.walletConnectKeys.slice(0, 5) // Show first 5
          })
          console.log('✅ Session state preserved - no aggressive cleanup on startup')
        })
        .catch(error => {
          console.warn('⚠️ Failed to get session debug info on startup:', error)
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