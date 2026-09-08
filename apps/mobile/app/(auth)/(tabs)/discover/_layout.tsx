import { Stack } from 'expo-router'
import { brandHeader } from '../../../../src/constants/navigation'

export default function DiscoverStackLayout() {
  return (
    <Stack screenOptions={brandHeader}>
      <Stack.Screen name="index" />
    </Stack>
  )
}
