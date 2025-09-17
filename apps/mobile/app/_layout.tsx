import { AppKit } from '@reown/appkit-wagmi-react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import Toast from 'react-native-toast-message'
import { WagmiProvider } from 'wagmi'
import { toastConfig, wagmiConfig } from '../src/config'

const queryClient = new QueryClient()

export default function RootLayout() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <Stack screenOptions={{ headerShown: false }}>
          {/* Navigation screens */}
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="connecting" />

          {/* Auth-protected screens */}
          <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />

          {/* Toast notification system */}
          <Toast config={toastConfig} />
        </Stack>
        <StatusBar style="auto" />
        <AppKit />
      </QueryClientProvider>
    </WagmiProvider>
  )
}
