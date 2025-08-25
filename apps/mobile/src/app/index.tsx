import { Redirect } from 'expo-router';
import { observer } from 'mobx-react-lite';
import { useAuthenticationStateReadonly } from '../hooks/useAuthenticationStateReadonly';
import { useStores } from '../stores';

const IndexScreen = observer(function IndexScreen() {
  const { walletConnectionStore } = useStores();
  const { isConnected } = walletConnectionStore; // Use MobX store for reactive connection state
  const { 
    authWalletAddress, 
    authError,
    isFirebaseAuthenticated,
    isFirebaseLoading 
  } = useAuthenticationStateReadonly();

  // Show loading while Firebase auth state is being determined
  if (isFirebaseLoading) {
    return null; // Let onboarding handle the loading UI
  }

  // Smart routing based on authentication state
  if (isConnected && isFirebaseAuthenticated && authWalletAddress && !authError) {
    // Fully authenticated - go directly to dashboard
    return <Redirect href="/dashboard" />;
  } else if (isFirebaseAuthenticated && authWalletAddress && !isConnected) {
    // Firebase authenticated but wallet disconnected - go to connecting screen to reconnect
    return <Redirect href="/connecting" />;
  } else if (isConnected && (!isFirebaseAuthenticated || authError)) {
    // Wallet connected but needs authentication - go to connecting screen
    return <Redirect href="/connecting" />;
  }
  
  // Default to onboarding screen for wallet connection
  return <Redirect href="/onboarding" />;
});

export default IndexScreen;

