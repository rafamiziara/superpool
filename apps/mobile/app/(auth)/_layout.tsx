import { Stack } from 'expo-router'
import React from 'react'
import { Text, View } from 'react-native'
import { useAutoAuth } from '../../src/hooks/auth/useAutoAuth'

export default function AuthLayout() {
  const { isFullyAuthenticated } = useAutoAuth()

  // Redirect protection - this should not happen due to navigation controller
  // but provides a fallback if someone tries to access auth routes directly
  if (!isFullyAuthenticated) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <Text className="text-muted-foreground">Redirecting to authentication...</Text>
      </View>
    )
  }

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="profile" />
    </Stack>
  )
}
