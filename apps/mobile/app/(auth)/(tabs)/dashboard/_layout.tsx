import { AppKitButton } from '@reown/appkit-wagmi-react-native'
import { Stack } from 'expo-router'
import React from 'react'
import { Image } from 'react-native'
import { darkHeader } from '../../../../src/constants/navigation'

export default function DashboardStackLayout() {
  return (
    <Stack screenOptions={darkHeader}>
      <Stack.Screen
        name="index"
        options={{
          headerTitle: () => (
            <Image
              source={require('@superpool/assets/images/logos/no_bg_white.png')}
              className="h-7 w-32"
              resizeMode="contain"
              accessibilityLabel="SuperPool"
              testID="header-logo"
            />
          ),
          headerTitleAlign: 'left',
          headerRight: () => <AppKitButton size="sm" />,
        }}
      />
    </Stack>
  )
}
