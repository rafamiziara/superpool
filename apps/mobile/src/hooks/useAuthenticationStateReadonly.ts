import { useMemo } from 'react'
import { useAuthenticationState } from './useAuthenticationState'
import { useFirebaseAuth } from './useFirebaseAuth'

/**
 * Lightweight hook that provides ONLY authentication state for routing decisions.
 * Does NOT trigger any authentication flows or connection monitoring.
 *
 * Use this for screens that only need to read authentication state (index.tsx, onboarding.tsx)
 * Use useAuthentication() for screens that need active authentication (connecting.tsx)
 */
export const useAuthenticationStateReadonly = () => {
  // Use Firebase auth state for persistence across app refreshes
  const firebaseAuth = useFirebaseAuth()
  // Use the authentication state for active authentication processes
  const authState = useAuthenticationState()

  return useMemo(
    () => ({
      // Authentication state (read-only)
      authError: authState.authError,
      isAuthenticating: authState.isAuthenticating || firebaseAuth.isLoading,
      // Use Firebase wallet address if available (persistent), otherwise fall back to auth lock address
      authWalletAddress: firebaseAuth.walletAddress || authState.authWalletAddress,
      // Expose Firebase auth state for navigation logic
      isFirebaseAuthenticated: firebaseAuth.isAuthenticated,
      isFirebaseLoading: firebaseAuth.isLoading,
    }),
    [
      authState.authError,
      authState.isAuthenticating,
      authState.authWalletAddress,
      firebaseAuth.isLoading,
      firebaseAuth.walletAddress,
      firebaseAuth.isAuthenticated,
    ]
  )
}
