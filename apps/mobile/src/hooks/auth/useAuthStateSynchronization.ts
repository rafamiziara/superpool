import { autorun, runInAction } from 'mobx'
import { useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'
import { FIREBASE_AUTH } from '../../firebase.config'
import { useStores } from '../../stores'
import { devOnly } from '../../utils'
import { useFirebaseAuth } from './useFirebaseAuth'

/**
 * Synchronization hook that ensures Firebase auth and wallet state stay consistent
 * Handles edge cases where states can become out of sync
 */
export const useAuthStateSynchronization = () => {
  const { authenticationStore, walletStore } = useStores()
  const firebaseAuth = useFirebaseAuth()
  const { isConnected, address } = useAccount()

  // Ref to track if sync is in progress to prevent loops
  const isSyncInProgressRef = useRef(false)

  // Synchronization logic using MobX autorun for reactive state management
  useEffect(() => {
    const disposer = autorun(() => {
      // Skip if reset is in progress to prevent infinite loops
      if (('isResetting' in authenticationStore && authenticationStore.isResetting) || isSyncInProgressRef.current) {
        return
      }
      const { isAuthenticated: isFirebaseAuth, walletAddress: firebaseWalletAddress, isLoading: isFirebaseLoading } = firebaseAuth

      const { isConnected: walletConnected, address: walletAddress } = walletStore.currentState
      const { authWalletAddress: authStoreAddress, authError } = authenticationStore

      // Skip synchronization if Firebase is still loading
      if (isFirebaseLoading) {
        return
      }

      devOnly('🔄 Auth state sync check:', {
        firebase: { isAuth: isFirebaseAuth, address: firebaseWalletAddress },
        wallet: { connected: walletConnected, address: walletAddress },
        authStore: { address: authStoreAddress, hasError: !!authError },
      })

      // Case 1: Firebase authenticated but wallet disconnected
      if (isFirebaseAuth && firebaseWalletAddress && !walletConnected) {
        devOnly('⚠️  Firebase authenticated but wallet disconnected - clearing Firebase auth')

        isSyncInProgressRef.current = true

        // Clear Firebase authentication to maintain consistency
        FIREBASE_AUTH.signOut()
          .then(() => {
            devOnly('✅ Firebase auth cleared due to wallet disconnection')
            runInAction(() => {
              authenticationStore.reset()
              isSyncInProgressRef.current = false
            })
          })
          .catch((error) => {
            console.warn('❌ Failed to clear Firebase auth:', error)
            isSyncInProgressRef.current = false
          })
        return
      }

      // Case 2: Wallet connected but Firebase auth address doesn't match
      if (walletConnected && walletAddress && isFirebaseAuth && firebaseWalletAddress) {
        const walletAddressLower = walletAddress.toLowerCase()
        const firebaseAddressLower = firebaseWalletAddress.toLowerCase()

        if (walletAddressLower !== firebaseAddressLower) {
          devOnly('⚠️  Wallet address mismatch with Firebase auth - clearing Firebase auth')

          isSyncInProgressRef.current = true

          // Clear Firebase authentication to maintain consistency
          FIREBASE_AUTH.signOut()
            .then(() => {
              devOnly('✅ Firebase auth cleared due to address mismatch')
              runInAction(() => {
                authenticationStore.reset()
                isSyncInProgressRef.current = false
              })
            })
            .catch((error) => {
              console.warn('❌ Failed to clear Firebase auth:', error)
              isSyncInProgressRef.current = false
            })
          return
        }
      }

      // Case 3: Firebase authenticated and wallet connected - sync authentication store
      if (isFirebaseAuth && firebaseWalletAddress && walletConnected && walletAddress) {
        const walletAddressLower = walletAddress.toLowerCase()
        const firebaseAddressLower = firebaseWalletAddress.toLowerCase()

        if (walletAddressLower === firebaseAddressLower && !authStoreAddress) {
          devOnly('✅ Syncing authentication store with Firebase auth')

          // Update authentication store to reflect successful authentication
          authenticationStore.setAuthLock({
            isLocked: false,
            startTime: 0,
            walletAddress: firebaseWalletAddress,
            abortController: null,
          })

          // Clear any auth errors since we have successful authentication
          authenticationStore.setAuthError(null)
        }
      }

      // Case 4: No Firebase auth but wallet connected and no ongoing authentication
      if (!isFirebaseAuth && walletConnected && walletAddress && !authenticationStore.isAuthenticating && !authError) {
        devOnly('ℹ️  Wallet connected but not Firebase authenticated - authentication may be needed')
        // This is handled by the authentication integration hook when wallet connects
      }

      // Case 5: Firebase auth exists but wallet not connected (should rarely happen)
      if (isFirebaseAuth && firebaseWalletAddress && !walletConnected && !isConnected) {
        devOnly('⚠️  Firebase authenticated but no wallet connection detected')
        // Keep Firebase auth but ensure consistency when wallet reconnects
      }
    })

    return disposer
  }, [firebaseAuth, walletStore, authenticationStore, isConnected, address])
}

/**
 * Validation hook to check authentication state consistency
 * Returns validation results for debugging or error handling
 */
export const useAuthStateValidation = () => {
  const { authenticationStore } = useStores()
  const firebaseAuth = useFirebaseAuth()
  const { isConnected, address } = useAccount()

  return {
    /**
     * Check if current authentication state is consistent
     */
    validateConsistency: (): {
      isConsistent: boolean
      issues: string[]
      walletState: { connected: boolean; address: string | undefined }
      firebaseState: { authenticated: boolean; address: string | null }
      authStoreState: { authenticating: boolean; address: string | null; hasError: boolean }
    } => {
      const issues: string[] = []

      const walletState = {
        connected: isConnected,
        address: address,
      }

      const firebaseState = {
        authenticated: firebaseAuth.isAuthenticated,
        address: firebaseAuth.walletAddress,
      }

      const authStoreState = {
        authenticating: authenticationStore.isAuthenticating,
        address: authenticationStore.authWalletAddress,
        hasError: !!authenticationStore.authError,
      }

      // Check for inconsistencies
      if (firebaseState.authenticated && !walletState.connected) {
        issues.push('Firebase authenticated but wallet not connected')
      }

      if (walletState.connected && firebaseState.authenticated) {
        if (walletState.address?.toLowerCase() !== firebaseState.address?.toLowerCase()) {
          issues.push('Wallet address does not match Firebase auth address')
        }
      }

      if (authStoreState.authenticating && firebaseState.authenticated) {
        issues.push('Authentication in progress but already Firebase authenticated')
      }

      return {
        isConsistent: issues.length === 0,
        issues,
        walletState,
        firebaseState,
        authStoreState,
      }
    },
  }
}
