import { Stack } from 'expo-router'
import { observer } from 'mobx-react-lite'
import React from 'react'
import { Text, View } from 'react-native'
import { authStore } from '../../src/stores/AuthStore'

export default observer(function AuthLayout() {
  // Redirect protection - this should not happen due to NavigationStore
  // but provides a fallback if someone tries to access auth routes directly
  if (!authStore.isWalletConnected || !authStore.user) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <Text className="text-muted-foreground">Redirecting to authentication...</Text>
      </View>
    )
  }

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="dashboard" />
    </Stack>
  )
})
