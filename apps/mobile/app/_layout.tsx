import { AppKit } from '@reown/appkit-wagmi-react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import Toast from 'react-native-toast-message'
import { WagmiProvider } from 'wagmi'
import { toastConfig, wagmiConfig } from '../src/config'
import { FirebaseInitializer } from '../src/components/FirebaseInitializer'
import { WalletListener } from '../src/components/WalletListener'
import '../src/stores/NavigationStore' // Initialize NavigationStore

const queryClient = new QueryClient()

function AppContent() {
  return (
    <>
      {/* Global state initialization */}
      <FirebaseInitializer />
      <WalletListener />

      <Stack screenOptions={{ headerShown: false }}>
        {/* Navigation screens */}
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="connecting" />

        {/* Auth-protected screens */}
        <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
      </Stack>

      {/* Toast notification system - at root level for proper display */}
      <Toast config={toastConfig} />
    </>
  )
}

export default function RootLayout() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <AppContent />
        <StatusBar style="auto" />
        <AppKit />
      </QueryClientProvider>
    </WagmiProvider>
  )
}
