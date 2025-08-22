import { AppKitButton } from '@reown/appkit-wagmi-react-native';
import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';
import { useAccount } from 'wagmi';
import { useAuthentication } from '../hooks/useAuthentication';

export default function WalletConnectionScreen() {
  const { isConnected, chain, address } = useAccount()
  const { authError } = useAuthentication()

  return (
    <View className="flex-1 bg-white items-center justify-center p-8">
      <Text className="text-3xl mb-8 font-extrabold text-primary">SuperPool</Text>
      <AppKitButton balance='show' connectStyle={{ alignSelf: 'stretch' }} />
      
      {isConnected ? (
        <View className="mt-5 items-center">
          <Text className="text-base mt-2 text-center text-foreground">✅ Connected</Text>
          {chain && (
            <Text className="text-base mt-2 text-center text-foreground">
              You are on the {chain.name} network.
            </Text>
          )}
          {address && (
            <Text className="text-sm mt-1 text-center text-muted-foreground font-mono">
              {address.slice(0, 6)}...{address.slice(-4)}
            </Text>
          )}
          {authError ? (
            <Text className="text-sm text-destructive text-center mt-2 font-medium">
              Authentication failed: {authError.userFriendlyMessage}
            </Text>
          ) : (
            <Text className="text-sm text-muted-foreground text-center mt-2 italic">
              Authentication in progress... Please check your wallet app for signature requests and follow the toast notifications.
            </Text>
          )}
        </View>
      ) : (
        <View className="mt-5 items-center">
          <Text className="text-base mt-2 text-center text-foreground">Please connect your wallet to continue.</Text>
        </View>
      )}
      <StatusBar style="auto" />
    </View>
  );
}

