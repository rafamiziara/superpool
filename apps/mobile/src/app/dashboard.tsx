import { AppKitButton } from '@reown/appkit-wagmi-react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { signOut } from 'firebase/auth';
import { observer } from 'mobx-react-lite';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useAccount } from 'wagmi';
import { FIREBASE_AUTH } from '../firebase.config';
import { getGlobalLogoutState } from '../hooks/auth/useLogoutState';
import { useStores } from '../stores';

const DashboardScreen = observer(function DashboardScreen() {
  const { walletStore } = useStores();
  const { chain } = useAccount(); // Keep for chain info since store doesn't track this yet
  const { address, isConnected } = walletStore; // Use MobX store for core connection state

  useEffect(() => {
    if (!isConnected) {
      // Use proper logout state management for automatic signout
      const { startLogout, finishLogout } = getGlobalLogoutState()
      
      const handleAutoLogout = async () => {
        try {
          console.log('🔌 Wallet disconnected, automatically signing out from Firebase...')
          startLogout()
          await signOut(FIREBASE_AUTH)
          router.replace('/')
        } catch (error) {
          console.error('Auto logout error:', error)
        } finally {
          finishLogout()
        }
      }
      
      handleAutoLogout()
    }
  }, [isConnected]);


  if (!isConnected) {
    return null;
  }

  return (
    <View className="flex-1 bg-white items-center justify-center p-8">
      <Text className="text-3xl mb-8 font-extrabold text-primary">Dashboard</Text>
      
      <View className="items-center mb-8 bg-muted/10 p-5 rounded-xl w-full">
        <Text className="text-xl font-semibold mb-6 text-primary">Welcome to SuperPool!</Text>
        <Text className="text-sm font-semibold text-muted-foreground mt-4 mb-1">Connected Wallet:</Text>
        <Text className="text-sm font-mono text-foreground text-center bg-muted/20 p-2 rounded-md w-full">{address}</Text>
        
        {chain && (
          <>
            <Text className="text-sm font-semibold text-muted-foreground mt-4 mb-1">Network:</Text>
            <Text className="text-base font-medium text-blue-600 text-center">{chain.name}</Text>
          </>
        )}
      </View>

      <View className="items-center gap-4 mb-8 w-full">
        <AppKitButton balance='show' />
      </View>

      <View className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
        <Text className="text-sm text-yellow-800 text-center">
          🚧 Coming Soon: Lending Pools, Loan Management, and More!
        </Text>
      </View>

      <StatusBar style="auto" />
    </View>
  );
});

export default DashboardScreen;

