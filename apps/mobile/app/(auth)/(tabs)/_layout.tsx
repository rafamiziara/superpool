import { NativeTabs } from 'expo-router/unstable-native-tabs'
import React from 'react'
import { Platform } from 'react-native'
import { palette } from '../../../src/constants/palette'

/**
 * Painted behind every tab so the screen has our background from the first
 * frame. Without it a freshly mounted tab shows the bare window for a beat,
 * which reads as a white flash against the dark UI.
 */
const contentStyle = { backgroundColor: palette.abyss } as const

export default function TabsLayout() {
  return (
    <NativeTabs
      tintColor={palette.mint}
      iconColor={palette.mist}
      labelStyle={{ color: palette.mist }}
      blurEffect="systemChromeMaterialDark"
      backgroundColor={Platform.OS === 'android' ? palette.raised : undefined}
      // iOS otherwise makes the tab bar transparent until content scrolls under
      // it, so an unscrolled screen shows the system bar instead of our chrome.
      disableTransparentOnScrollEdge
    >
      <NativeTabs.Trigger name="dashboard" contentStyle={contentStyle}>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="pools" contentStyle={contentStyle}>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.2', selected: 'person.2.fill' }} md="group" />
        <NativeTabs.Trigger.Label>Pools</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="discover" contentStyle={contentStyle}>
        <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
        <NativeTabs.Trigger.Label>Discover</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="activity" contentStyle={contentStyle}>
        <NativeTabs.Trigger.Icon sf="clock.arrow.circlepath" md="history" />
        <NativeTabs.Trigger.Label>Activity</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
