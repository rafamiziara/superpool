import { Redirect } from 'expo-router'
import { Image, View } from 'react-native'
import { useTargetRoute } from '../src/stores/NavigationStore'

export default function NavigationController() {
  // Redirect rather than wait to be redirected. NavigationStore's subscription
  // only fires when auth state changes, and this screen is also reached without
  // one: the wallet's return deep link is a bare `superpool://`, which lands
  // here with nothing about the session having changed.
  //
  // A selector rather than a read, so the screen is subscribed to the auth
  // state the route is derived from — MobX used to trace that through the
  // store's getter, and Zustand needs it named.
  const targetRoute = useTargetRoute()

  if (targetRoute) {
    return <Redirect href={targetRoute} />
  }

  // Shown only while the state is still settling.
  return (
    <View className="flex-1 bg-abyss items-center justify-center" testID="splash-screen">
      <Image
        source={require('../assets/images/logos/no_bg_white.png')}
        className="h-12 w-64"
        resizeMode="contain"
        accessibilityLabel="SuperPool"
        testID="splash-logo"
      />
    </View>
  )
}
