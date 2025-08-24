import { Redirect } from 'expo-router';
import { useAccount } from 'wagmi';
import { useAuthenticationStateReadonly } from '../hooks/useAuthenticationStateReadonly';

export default function IndexScreen() {
  const { isConnected } = useAccount();
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
}

