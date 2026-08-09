import { Stack } from 'expo-router'
import React from 'react'
import { darkHeader } from '../../../../src/constants/navigation'

export default function ActivityStackLayout() {
  return (
    <Stack screenOptions={darkHeader}>
      <Stack.Screen name="index" options={{ title: 'Activity', headerLargeTitle: true }} />
    </Stack>
  )
}
