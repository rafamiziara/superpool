import { Stack } from 'expo-router'
import { observer } from 'mobx-react-lite'
import React, { useEffect } from 'react'
import { Text, View } from 'react-native'
import { darkHeader } from '../../src/constants/navigation'
import { authStore } from '../../src/stores/AuthStore'
import { poolStore } from '../../src/stores/PoolStore'

export default observer(function AuthLayout() {
  const isAuthenticated = authStore.isWalletConnected && !!authStore.user

  /**
   * Reloads on a network switch as well as on sign-in.
   *
   * Every list in the app is one chain's: `PoolStore.requestPools` passes
   * `authStore.chainId`, and the backend keys every document by it. So the
   * chain the wallet is on is not a detail of the fetch — it decides which
   * pools exist at all.
   *
   * Without `chainId` here the store kept the *previous* chain's pools after a
   * switch, and went on showing them until some unrelated refresh replaced the
   * list wholesale. `fetchPools` rather than `refreshPools`: the pools on
   * screen belong to the chain being left, so keeping them visible while the
   * new ones load would show a list that is wrong rather than merely stale.
   */
  useEffect(() => {
    if (isAuthenticated) {
      poolStore.fetchPools()
    }
    /*
      eslint-disable-next-line react-hooks/exhaustive-deps --
      `authStore.chainId` is a MobX observable read inside an `observer`
      component, so the read subscribes and a change *does* re-render — which
      is the opposite of the rule's "outer scope values aren't valid
      dependencies". Dropping it is the documented bug: the store went on
      serving the chain the user had just left. See CLAUDE.md → Chains.
    */
  }, [isAuthenticated, authStore.chainId])

  // Redirect protection - this should not happen due to NavigationStore
  // but provides a fallback if someone tries to access auth routes directly
  if (!isAuthenticated) {
    return (
      <View className="flex-1 bg-abyss items-center justify-center">
        <Text className="text-fog">Redirecting to authentication...</Text>
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
