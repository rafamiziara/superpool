import { AppKitButton } from '@reown/appkit-wagmi-react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { signOut } from 'firebase/auth';
import { useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert } from 'react-native';
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
    <View style={styles.container}>
      <Text style={styles.title}>Dashboard</Text>
      
      <View style={styles.infoContainer}>
        <Text style={styles.welcomeText}>Welcome to SuperPool!</Text>
        <Text style={styles.label}>Connected Wallet:</Text>
        <Text style={styles.addressText}>{address}</Text>
        
        {chain && (
          <>
            <Text style={styles.label}>Network:</Text>
            <Text style={styles.networkText}>{chain.name}</Text>
          </>
        )}
      </View>

      <View style={styles.buttonContainer}>
        <AppKitButton balance='show' />
        
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.placeholderContainer}>
        <Text style={styles.placeholderText}>
          🚧 Coming Soon: Lending Pools, Loan Management, and More!
        </Text>
      </View>

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32
  },
  title: {
    fontSize: 32,
    marginBottom: 32,
    fontWeight: '800',
    color: '#333'
  },
  welcomeText: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 24,
    color: '#333'
  },
  infoContainer: {
    alignItems: 'center',
    marginBottom: 32,
    backgroundColor: '#f8f9fa',
    padding: 20,
    borderRadius: 12,
    width: '100%'
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    marginBottom: 4
  },
  addressText: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#333',
    textAlign: 'center',
    backgroundColor: '#e9ecef',
    padding: 8,
    borderRadius: 6,
    width: '100%'
  },
  networkText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#007bff',
    textAlign: 'center'
  },
  buttonContainer: {
    alignItems: 'center',
    gap: 16,
    marginBottom: 32,
    width: '100%'
  },
  logoutButton: {
    backgroundColor: '#dc3545',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    alignSelf: 'stretch',
    alignItems: 'center'
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  },
  placeholderContainer: {
    backgroundColor: '#fff3cd',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffeaa7'
  },
  placeholderText: {
    fontSize: 14,
    color: '#856404',
    textAlign: 'center'
  }
});