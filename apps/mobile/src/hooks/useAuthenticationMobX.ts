import { useMemo } from 'react'
import { useAuthenticationStore } from '../stores'
import { useFirebaseAuth } from './useFirebaseAuth'

/**
 * Pure MobX authentication hook for future use
 *
 * This hook provides authentication state management using only MobX stores,
 * without the legacy hook compatibility layer. Use this for new components
 * that don't need backward compatibility.
 *
 * Features:
 * - Direct MobX store integration (fully reactive)
 * - Clean, simple interface
 * - No legacy compatibility overhead
 * - Optimized performance
 * - Future-ready architecture
 *
 * Usage:
 * ```typescript
 * import { observer } from 'mobx-react-lite'
 * import { useAuthenticationMobX } from '../hooks/useAuthenticationMobX'
 *
 * const MyComponent = observer(() => {
 *   const { authError, isAuthenticating, acquireAuthLock } = useAuthenticationMobX()
 *
 *   // Component logic using reactive MobX state
 * })
 * ```
 */
export const useAuthenticationMobX = () => {
  const authStore = useAuthenticationStore()
  const firebaseAuth = useFirebaseAuth()

  // Memoized return object for stable references
  return useMemo(
    () => ({
      // Core authentication state (reactive from MobX store)
      authError: authStore.authError,
      isAuthenticating: authStore.isAuthenticating,
      authWalletAddress: authStore.authWalletAddress,

      // Firebase integration (persistent auth state)
      isFirebaseAuthenticated: firebaseAuth.isAuthenticated,
      isFirebaseLoading: firebaseAuth.isLoading,
      firebaseWalletAddress: firebaseAuth.walletAddress,

      // Computed derived state
      isFullyAuthenticated: authStore.authWalletAddress !== null && firebaseAuth.isAuthenticated,
      effectiveWalletAddress: firebaseAuth.walletAddress || authStore.authWalletAddress,
      isLoading: authStore.isAuthenticating || firebaseAuth.isLoading,

      // Store actions (direct MobX store methods)
      setAuthError: authStore.setAuthError,
      acquireAuthLock: authStore.acquireAuthLock,
      releaseAuthLock: authStore.releaseAuthLock,
      reset: authStore.reset,

      // Utility methods
      isAuthenticatingForWallet: authStore.isAuthenticatingForWallet,

      // Store instance for advanced usage
      authStore,

      // Debug information
      _mobxDebug: {
        storeState: {
          authError: authStore.authError,
          isAuthenticating: authStore.isAuthenticating,
          authWalletAddress: authStore.authWalletAddress,
        },
        firebaseState: {
          isAuthenticated: firebaseAuth.isAuthenticated,
          isLoading: firebaseAuth.isLoading,
          walletAddress: firebaseAuth.walletAddress,
        },
      },
    }),
    [
      // MobX store observables (automatically tracked)
      authStore.authError,
      authStore.isAuthenticating,
      authStore.authWalletAddress,

      // Firebase state
      firebaseAuth.isAuthenticated,
      firebaseAuth.isLoading,
      firebaseAuth.walletAddress,

      // Store reference for actions
      authStore,
    ]
  )
}

/**
 * Type definition for the pure MobX authentication hook
 */
export type AuthenticationMobX = ReturnType<typeof useAuthenticationMobX>

/**
 * Helper hook for readonly authentication state (lightweight version)
 *
 * Use this when you only need to read authentication state without actions.
 * Perfect for navigation components or display-only components.
 */
export const useAuthenticationMobXReadonly = () => {
  const authStore = useAuthenticationStore()
  const firebaseAuth = useFirebaseAuth()

  return useMemo(
    () => ({
      // Readonly state only
      authError: authStore.authError,
      isAuthenticating: authStore.isAuthenticating,
      authWalletAddress: authStore.authWalletAddress,
      isFirebaseAuthenticated: firebaseAuth.isAuthenticated,
      isFirebaseLoading: firebaseAuth.isLoading,
      firebaseWalletAddress: firebaseAuth.walletAddress,

      // Computed readonly state
      isFullyAuthenticated: authStore.authWalletAddress !== null && firebaseAuth.isAuthenticated,
      effectiveWalletAddress: firebaseAuth.walletAddress || authStore.authWalletAddress,
      isLoading: authStore.isAuthenticating || firebaseAuth.isLoading,
    }),
    [
      authStore.authError,
      authStore.isAuthenticating,
      authStore.authWalletAddress,
      firebaseAuth.isAuthenticated,
      firebaseAuth.isLoading,
      firebaseAuth.walletAddress,
    ]
  )
}

/**
 * Type definition for the readonly version
 */
export type AuthenticationMobXReadonly = ReturnType<typeof useAuthenticationMobXReadonly>
