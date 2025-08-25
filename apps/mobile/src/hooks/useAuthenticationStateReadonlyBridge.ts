import { useAuthenticationStore } from '../stores'
import { useFirebaseAuth } from './useFirebaseAuth'

/**
 * Clean readonly authentication state hook with MobX
 *
 * Directly uses MobX stores for readonly authentication state.
 * Perfect for navigation screens that don't need active authentication.
 */
export const useAuthenticationStateReadonlyBridge = () => {
  const authStore = useAuthenticationStore()
  const firebaseAuth = useFirebaseAuth()

  // Clean direct return - MobX observer components handle reactivity automatically
  return {
    // Authentication state from MobX store (reactive)
    authError: authStore.authError,
    isAuthenticating: authStore.isAuthenticating || firebaseAuth.isLoading,

    // Use Firebase wallet address if available (persistent), otherwise fall back to MobX store
    authWalletAddress: firebaseAuth.walletAddress || authStore.authWalletAddress,

    // Firebase auth state for navigation logic
    isFirebaseAuthenticated: firebaseAuth.isAuthenticated,
    isFirebaseLoading: firebaseAuth.isLoading,

    // Minimal debug info if needed
    _debug: authStore.authWalletAddress ? { hasWalletAddress: true } : null,
  }
}

/**
 * Type definition for the hook
 */
export type AuthenticationStateReadonlyBridge = ReturnType<typeof useAuthenticationStateReadonlyBridge>