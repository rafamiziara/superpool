import { Stack } from 'expo-router'
import React from 'react'
import { darkHeader } from '../../../../src/constants/navigation'

export default function PoolsStackLayout() {
  return (
    <Stack screenOptions={darkHeader}>
      <Stack.Screen name="index" options={{ title: 'Pools', headerLargeTitle: true }} />
    </Stack>
  )
}
