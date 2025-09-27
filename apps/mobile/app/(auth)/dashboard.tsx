import { AppKitButton } from '@reown/appkit-wagmi-react-native'
import { StatusBar } from 'expo-status-bar'
import { observer } from 'mobx-react-lite'
import React from 'react'
import { Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

function DashboardScreen() {
  const insets = useSafeAreaInsets()

  return (
    <View className="flex-1 bg-white" testID="dashboard-screen">
      <StatusBar style="auto" />

      {/* Top Bar */}
      <View
        className="flex-row items-center justify-between px-6 py-4 bg-white"
        style={{ paddingTop: insets.top + 16 }}
        testID="dashboard-top-bar"
      >
        <Text className="text-xl font-bold text-primary" testID="app-logo">
          SUPERPOOL
        </Text>
        <AppKitButton size="sm" />
      </View>

      {/* Empty Content Area */}
      <View className="flex-1" testID="dashboard-content">
        {/* Content will be added later */}
      </View>
    </View>
  )
}

export default observer(DashboardScreen)
