import { AppKitButton } from '@reown/appkit-wagmi-react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { signOut } from 'firebase/auth';
import { useEffect } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useAccount, useDisconnect } from 'wagmi';
import { FIREBASE_AUTH } from '../firebase.config';
import { getGlobalLogoutState } from '../hooks/useLogoutState';

export default function DashboardScreen() {
  const { address, chain, isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  useEffect(() => {
    if (!isConnected) {
      signOut(FIREBASE_AUTH).catch(console.error);
      router.replace('/');
    }
  }, [isConnected]);

  const handleLogout = async () => {
    const { startLogout, finishLogout } = getGlobalLogoutState()
    
    try {
      // Set logout state to prevent authentication hook from processing
      startLogout()
      
      // Disconnect wallet first
      disconnect();
      
      // Then sign out of Firebase
      await signOut(FIREBASE_AUTH);
      
      router.replace('/');
    } catch (error) {
      console.error('Logout error:', error);
      Alert.alert('Error', 'Failed to logout. Please try again.');
    } finally {
      // Always clear logout state
      finishLogout()
    }
  };

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
        
        <TouchableOpacity className="bg-destructive px-6 py-3 rounded-lg self-stretch items-center" onPress={handleLogout}>
          <Text className="text-destructive-foreground text-base font-semibold">Logout</Text>
        </TouchableOpacity>
      </View>

      <View className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
        <Text className="text-sm text-yellow-800 text-center">
          🚧 Coming Soon: Lending Pools, Loan Management, and More!
        </Text>
      </View>

      <StatusBar style="auto" />
    </View>
  );
}

