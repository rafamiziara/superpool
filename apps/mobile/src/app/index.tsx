import { AppKitButton } from '@reown/appkit-wagmi-react-native';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { useAccount } from 'wagmi';
import { useAuthentication } from '../hooks/useAuthentication';

export default function WalletConnectionScreen() {
  const { isConnected, chain, address } = useAccount()
  const { authError } = useAuthentication()

  return (
    <View style={styles.container}>
      <Text style={styles.title}>SuperPool</Text>
      <AppKitButton balance='show' connectStyle={{ alignSelf: 'stretch' }} />
      
      {isConnected ? (
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>✅ Connected</Text>
          {chain && (
            <Text style={styles.infoText}>
              You are on the {chain.name} network.
            </Text>
          )}
          {address && (
            <Text style={styles.addressText}>
              {address.slice(0, 6)}...{address.slice(-4)}
            </Text>
          )}
          {authError ? (
            <Text style={styles.errorText}>
              Authentication failed: {authError.userFriendlyMessage}
            </Text>
          ) : (
            <Text style={styles.subText}>
              Authentication in progress... Please check your wallet app for signature requests and follow the toast notifications.
            </Text>
          )}
        </View>
      ) : (
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>Please connect your wallet to continue.</Text>
        </View>
      )}
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
  infoContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  subText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  title: {
    fontSize: 32,
    marginBottom: 32,
    fontWeight: '800'
  },
  infoText: {
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center',
  },
  addressText: {
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
    color: '#666',
    fontFamily: 'monospace',
  },
  errorText: {
    fontSize: 14,
    color: '#ff4444',
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '500',
  },
});