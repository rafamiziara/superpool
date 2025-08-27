import '@walletconnect/react-native-compat'
import { EventEmitter } from 'events'

// Increase max listeners to prevent memory leak warnings from multiple WalletConnect sessions
EventEmitter.defaultMaxListeners = 20

import { AppKit, createAppKit, defaultWagmiConfig } from '@reown/appkit-wagmi-react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { arbitrum, base, bsc, mainnet, polygon, polygonAmoy } from '@wagmi/core/chains'
import { Stack } from 'expo-router'
import { useEffect } from 'react'
import Toast from 'react-native-toast-message'
import { WagmiProvider } from 'wagmi'
import { localhost } from '../config/chains'
import { useAuthenticationIntegration } from '../hooks/auth/useAuthenticationIntegration'
import { useAuthSessionRecovery } from '../hooks/auth/useAuthSessionRecovery'
import { useAuthStateSynchronization } from '../hooks/auth/useAuthStateSynchronization'
import { useGlobalErrorHandler } from '../hooks/ui/useGlobalErrorHandler'
import { useWalletConnectionTrigger } from '../hooks/wallet/useWalletConnectionTrigger'
import { useWalletToasts } from '../hooks/wallet/useWalletToasts'
import { StoreProvider } from '../stores'
import { SessionManager } from '../utils/sessionManager'

const queryClient = new QueryClient()

const projectId = process.env.EXPO_PUBLIC_REOWN_PROJECT_ID

if (!projectId) {
  throw new Error('EXPO_PUBLIC_REOWN_PROJECT_ID is required!')
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
}

const chains = [mainnet, polygon, polygonAmoy, arbitrum, base, bsc, ...(__DEV__ ? [localhost] : [])] as const

const wagmiConfig = defaultWagmiConfig({ chains, projectId, metadata })

createAppKit({
  projectId,
  metadata,
  wagmiConfig,
  defaultChain: polygon,
  enableAnalytics: true,
})

function AppContent() {
  // Global hooks for app-wide functionality
  useWalletToasts({ showConnectionToasts: false, showDisconnectionToasts: true }) // Global wallet toast notifications
  useGlobalErrorHandler() // Global session corruption error handler

  // Authentication integration - connects wallet events to authentication
  const authIntegration = useAuthenticationIntegration()

  // Wallet connection trigger - detects wallet connect/disconnect events
  useWalletConnectionTrigger({
    onNewConnection: authIntegration.onNewConnection,
    onDisconnection: authIntegration.onDisconnection,
  })

  // Auth state synchronization - keeps Firebase and wallet state in sync
  useAuthStateSynchronization()

  // Session recovery - validates and recovers authentication on app startup
  useAuthSessionRecovery()

  // Debug session state on app start (no aggressive cleanup)
  useEffect(() => {
    if (__DEV__) {
      SessionManager.getSessionDebugInfo()
        .then((debugInfo) => {
          console.log('🚀 App startup - Session debug info:', {
            totalKeys: debugInfo.totalKeys,
            walletConnectKeysCount: debugInfo.walletConnectKeys.length,
            walletConnectKeys: debugInfo.walletConnectKeys.slice(0, 5), // Show first 5
          })
          console.log('✅ Session state preserved - no aggressive cleanup on startup')
        })
        .catch((error) => {
          console.warn('⚠️ Failed to get session debug info on startup:', error)
        })
    }
  }, [])

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="connecting" />
        <Stack.Screen name="dashboard" />
      </Stack>
      <AppKit />
      <Toast />
    </>
  )
}

export default function RootLayout() {
  return (
    <StoreProvider>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <AppContent />
        </QueryClientProvider>
      </WagmiProvider>
    </StoreProvider>
  )
}
