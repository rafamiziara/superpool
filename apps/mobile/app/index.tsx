import { observer } from 'mobx-react-lite'
import { Text, View } from 'react-native'

export default observer(function NavigationController() {
  // NavigationStore handles all navigation logic reactively
  // This screen briefly shows while navigation transitions occur
  return (
    <View className="flex-1 bg-white items-center justify-center">
      <Text className="text-3xl font-extrabold text-primary">SUPERPOOL</Text>
    </View>
  )
})
