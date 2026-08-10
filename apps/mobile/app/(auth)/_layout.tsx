import { Stack } from 'expo-router'
import { observer } from 'mobx-react-lite'
import React, { useEffect } from 'react'
import { Text, View } from 'react-native'
import { darkHeader } from '../../src/constants/navigation'
import { authStore } from '../../src/stores/AuthStore'
import { poolStore } from '../../src/stores/PoolStore'

export default observer(function AuthLayout() {
  const isAuthenticated = authStore.isWalletConnected && !!authStore.user

  useEffect(() => {
    if (isAuthenticated) {
      poolStore.loadPools()
    }
  }, [isAuthenticated])

  // Redirect protection - this should not happen due to NavigationStore
  // but provides a fallback if someone tries to access auth routes directly
  if (!isAuthenticated) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <Text className="text-muted-foreground">Redirecting to authentication...</Text>
      </View>
    )
  }

  return (
    <Stack
      screenOptions={{
        ...darkHeader,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="pool/[id]" options={{ headerLargeTitle: true, headerBackButtonDisplayMode: 'minimal', title: '' }} />
      <Stack.Screen name="pool/create" options={{ headerBackButtonDisplayMode: 'minimal', title: 'New pool' }} />
    </Stack>
  )
})
