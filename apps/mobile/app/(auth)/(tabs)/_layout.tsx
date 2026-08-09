import { NativeTabs } from 'expo-router/unstable-native-tabs'
import React from 'react'
import { Platform } from 'react-native'
import { palette } from '../../../src/constants/palette'

export default function TabsLayout() {
  return (
    <NativeTabs
      tintColor={palette.mint}
      iconColor={palette.mist}
      labelStyle={{ color: palette.mist }}
      blurEffect="systemChromeMaterialDark"
      backgroundColor={Platform.OS === 'android' ? palette.raised : undefined}
    >
      <NativeTabs.Trigger name="dashboard">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="pools">
        <NativeTabs.Trigger.Icon sf={{ default: 'person.2', selected: 'person.2.fill' }} md="group" />
        <NativeTabs.Trigger.Label>Pools</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="activity">
        <NativeTabs.Trigger.Icon sf="clock.arrow.circlepath" md="history" />
        <NativeTabs.Trigger.Label>Activity</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
