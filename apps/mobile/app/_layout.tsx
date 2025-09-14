import { AppKit } from '@reown/appkit-wagmi-react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { WagmiProvider } from 'wagmi'
import { wagmiConfig } from '../src/config/wagmi'

const queryClient = new QueryClient()

export default function RootLayout() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
        </Stack>
        <AppKit />
      </QueryClientProvider>
    </WagmiProvider>
  )
}
