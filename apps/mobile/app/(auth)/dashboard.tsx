import { AppKitButton } from '@reown/appkit-wagmi-react-native'
import { StatusBar } from 'expo-status-bar'
import { observer } from 'mobx-react-lite'
import React from 'react'
import { Image, View } from 'react-native'
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
        <Image
          source={require('@superpool/assets/images/logos/no_bg_color.png')}
          className="h-10 w-40"
          resizeMode="contain"
          testID="app-logo"
          accessibilityLabel="SuperPool Logo"
        />
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
