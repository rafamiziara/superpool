import { Stack } from 'expo-router'
import React from 'react'
import { brandHeader } from '../../../../src/constants/navigation'

export default function PoolsStackLayout() {
  return (
    <Stack screenOptions={brandHeader}>
      <Stack.Screen name="index" />
    </Stack>
  )
}
