import { useAuthenticationStore } from '../../stores'
import { useFirebaseAuth } from './useFirebaseAuth'

/**
 * Lightweight readonly authentication state hook with MobX
 *
 * Provides ONLY authentication state for routing decisions.
 * Does NOT trigger authentication flows or connection monitoring.
 *
 * Perfect for navigation screens (index.tsx, onboarding.tsx) that only need to read state.
 */
export const useAuthenticationStateReadonly = () => {
  const authStore = useAuthenticationStore()
  const firebaseAuth = useFirebaseAuth()

  // Determine the final wallet address (Firebase takes priority)
  const finalWalletAddress = firebaseAuth.walletAddress || authStore.authWalletAddress

  // Clean direct return - MobX observer components handle reactivity automatically
  return {
    // Authentication state from MobX store (reactive)
    authError: authStore.authError?.userFriendlyMessage ?? authStore.authError?.message ?? authStore.authError,
    isAuthenticating: authStore.isAuthenticating || firebaseAuth.isLoading,

    // Use Firebase wallet address if available (persistent), otherwise fall back to MobX store
    authWalletAddress: finalWalletAddress,

    // Firebase auth state for navigation logic
    isFirebaseAuthenticated: firebaseAuth.isAuthenticated,
    isFirebaseLoading: firebaseAuth.isLoading,

    // Debug info based on final wallet address (not just store address)
    _debug: finalWalletAddress ? { hasWalletAddress: true } : null,
  }
}

/**
 * Type definition for the readonly authentication state hook
 */
export type AuthenticationStateReadonly = ReturnType<typeof useAuthenticationStateReadonly>
