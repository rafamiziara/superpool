import { AppKitButton } from '@reown/appkit-wagmi-react-native'
import { Text, View } from 'react-native'

export default function Index() {
  return (
    <View className="flex-1 items-center justify-center bg-black p-4">
      <Text className="text-white font-bold text-2xl mb-32">SUPERPOOL</Text>
      <AppKitButton
        balance="hide"
        label="Connect Wallet"
        connectStyle={{
          alignSelf: 'stretch',
          marginBottom: 0,
          marginHorizontal: 30,
          borderRadius: 10,
        }}
      />
    </View>
  )
}
