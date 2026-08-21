import { Redirect } from 'expo-router'
import { observer } from 'mobx-react-lite'
import { Image, View } from 'react-native'
import { navigationStore } from '../src/stores/NavigationStore'

export default observer(function NavigationController() {
  // Redirect rather than wait to be redirected. NavigationStore's reaction only
  // fires when auth state changes, and this screen is also reached without one:
  // the wallet's return deep link is a bare `superpool://`, which lands here
  // with nothing about the session having changed.
  const targetRoute = navigationStore.targetRoute

  if (targetRoute) {
    return <Redirect href={targetRoute} />
  }

  // Shown only while the state is still settling.
  return (
    <View className="flex-1 bg-abyss items-center justify-center" testID="splash-screen">
      <Image
        source={require('@superpool/assets/images/logos/no_bg_white.png')}
        className="h-12 w-64"
        resizeMode="contain"
        accessibilityLabel="SuperPool"
        testID="splash-logo"
      />
    </View>
  )
})
