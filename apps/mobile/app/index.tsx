import { Text, View } from 'react-native'
import { useNavigationController } from '../src/hooks/navigation/useNavigationController'

export default function NavigationController() {
  const { isNavigating } = useNavigationController()

  // Show loading screen while navigation logic determines destination
  if (isNavigating) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <Text className="text-3xl font-extrabold text-primary">SUPERPOOL</Text>
        <Text className="text-sm text-muted-foreground mt-2">Loading...</Text>
      </View>
    )
  }

  // Show logo while navigation transition happens
  return (
    <View className="flex-1 bg-white items-center justify-center">
      <Text className="text-3xl font-extrabold text-primary">SUPERPOOL</Text>
    </View>
  )
}
