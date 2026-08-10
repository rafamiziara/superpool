import '../global.css'

import { AppKit } from '@reown/appkit-wagmi-react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaListener } from 'react-native-safe-area-context'
import Toast from 'react-native-toast-message'
import { Uniwind } from 'uniwind'
import { WagmiProvider } from 'wagmi'
import { FirebaseInitializer } from '../src/components/FirebaseInitializer'
import { PendingTransactionsInitializer } from '../src/components/PendingTransactionsInitializer'
import { WalletListener } from '../src/components/WalletListener'
import { wagmiConfig } from '../src/config'
import '../src/stores/NavigationStore'

const queryClient = new QueryClient()

function AppContent() {
  return (
    <>
      {/* Global state initialization */}
      <FirebaseInitializer />
      <WalletListener />
      <PendingTransactionsInitializer />

      <Stack screenOptions={{ headerShown: false }}>
        {/* Navigation screens */}
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="connecting" />

        {/* Auth-protected screens */}
        <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
      </Stack>

      {/* Toast notification system */}
      <Toast />
    </>
  )
}

export default function RootLayout() {
  return (
    <SafeAreaListener onChange={({ insets }) => Uniwind.updateInsets(insets)}>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <AppContent />
          <StatusBar style="auto" />
          <AppKit />
        </QueryClientProvider>
      </WagmiProvider>
    </SafeAreaListener>
  )
}
