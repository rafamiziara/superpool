import { autorun } from 'mobx'
import { useCallback, useEffect, useMemo } from 'react'
import { useAccount, useDisconnect, useSignMessage, useSignTypedData } from 'wagmi'
import { AuthenticationContext, AuthenticationOrchestrator } from '../services/authenticationOrchestrator'
import { useAuthenticationStore, useWalletConnectionStore } from '../stores'
import { createAppError, ErrorType } from '../utils/errorHandling'
import { useAuthenticationState } from './useAuthenticationState'
import { useAuthProgress } from './useAuthProgress'
import { useFirebaseAuth } from './useFirebaseAuth'
import { getGlobalLogoutState } from './useLogoutState'
import { useWalletConnectionTrigger } from './useWalletConnectionTrigger'

export const useAuthentication = () => {
  const { chain, connector } = useAccount()
  const { signTypedDataAsync } = useSignTypedData()
  const { signMessageAsync } = useSignMessage()
  const { disconnect } = useDisconnect()

  // Use Firebase auth state for persistence across app refreshes
  const firebaseAuth = useFirebaseAuth()
  // Use the new modular state management
  const authState = useAuthenticationState()
  const authProgress = useAuthProgress()

  // Use MobX stores directly for enhanced reactivity
  const authStore = useAuthenticationStore()
  const walletStore = useWalletConnectionStore()

  // Create the authentication orchestrator with MobX stores (memoized to prevent recreation)
  const orchestrator = useMemo(() => new AuthenticationOrchestrator(authStore, walletStore), [authStore, walletStore])

  const handleAuthentication = useCallback(
    async (walletAddress: string) => {
      // Check if we're in the middle of a logout process
      try {
        const { isLoggingOut } = getGlobalLogoutState()
        if (isLoggingOut) {
          console.log('⏸️ Skipping authentication: logout in progress')
          return
        }
      } catch (error) {
        // Global logout state not initialized, continue...
      }

      // Check if user is already authenticated with Firebase before starting authentication
      if (firebaseAuth.isAuthenticated && firebaseAuth.walletAddress === walletAddress) {
        console.log('✅ User already Firebase authenticated for this wallet, skipping authentication:', walletAddress)
        return
      }

      // Clear any previous errors and reset progress
      authState.setAuthError(null)
      authProgress.resetProgress()

      // Create adapter functions that wrap wagmi hooks to match our SignatureFunctions interface
      const adaptedSignatureFunctions = {
        signTypedDataAsync: async (data: {
          domain?: any
          types: Record<string, any[]>
          primaryType: string
          message: Record<string, unknown>
          account: `0x${string}`
        }) => {
          // Wagmi requires the parameters to be wrapped in a variables object
          const signature = await signTypedDataAsync({
            ...data,
            account: data.account, // account is now required
          })
          return signature
        },
        signMessageAsync: async (params: { message: string; account: `0x${string}`; connector?: any }) => {
          // Wagmi requires the parameters to be wrapped in a variables object
          const signature = await signMessageAsync({
            message: params.message,
            account: params.account, // account is now required
            connector: params.connector,
          })
          return signature
        },
      }

      // Create the authentication context with progress callbacks
      const context: AuthenticationContext = {
        walletAddress,
        connector,
        chainId: chain?.id,
        signatureFunctions: adaptedSignatureFunctions,
        disconnect,
        progressCallbacks: {
          onStepStart: authProgress.startStep,
          onStepComplete: authProgress.completeStep,
          onStepFail: authProgress.failStep,
        },
      }

      try {
        // Delegate to the orchestrator
        await orchestrator.authenticate(context)
      } catch (error) {
        // Error handling is already done by the orchestrator and recovery service
        // Just set the error state for the UI
        if (error instanceof Error) {
          authState.setAuthError(createAppError(ErrorType.UNKNOWN_ERROR, error.message, error))
        }
      }
    },
    [
      authState,
      authProgress,
      orchestrator,
      connector,
      chain?.id,
      signTypedDataAsync,
      signMessageAsync,
      disconnect,
      firebaseAuth.isAuthenticated,
      firebaseAuth.walletAddress,
    ]
  )

  const handleDisconnection = useCallback(() => {
    authState.setAuthError(null)
    authProgress.resetProgress()
    orchestrator.cleanup()
  }, [authState, authProgress, orchestrator])

  // Use the connection trigger to only authenticate on new connections
  useWalletConnectionTrigger({
    onNewConnection: handleAuthentication,
    onDisconnection: handleDisconnection,
  })

  // MobX autorun: Start authentication immediately if wallet is already connected BUT not already authenticated
  // This replaces the complex useEffect with 8+ dependencies with automatic MobX reactivity
  useEffect(() => {
    const disposer = autorun(() => {
      // Check if we're in a logout process
      try {
        const { isLoggingOut } = getGlobalLogoutState()
        if (isLoggingOut) {
          console.log('⏸️ Skipping immediate authentication: logout in progress')
          return
        }
      } catch (error) {
        // Global logout state not initialized, continue...
      }

      // Use reactive MobX state - automatically tracks dependencies!
      const { isConnected: storeConnected, address: storeAddress } = walletStore
      const { isAuthenticating: storeAuthenticating, authWalletAddress: storeAuthWallet } = authStore

      // Use MobX store values for reactivity, but prefer Wagmi for the actual address to authenticate
      if (storeConnected && storeAddress && !storeAuthenticating && !storeAuthWallet && !firebaseAuth.isAuthenticated) {
        console.log('🚀 Wallet already connected, starting authentication immediately:', storeAddress)
        handleAuthentication(storeAddress)
      } else if (storeAuthWallet || firebaseAuth.isAuthenticated) {
        console.log('✅ Wallet already authenticated, skipping re-authentication:', storeAuthWallet || firebaseAuth.walletAddress)
      }
    })

    // Cleanup autorun when component unmounts
    return disposer
  }, []) // No dependencies needed! MobX tracks everything automatically

  return useMemo(
    () => ({
      // Authentication state - now includes MobX reactive state
      authError: authState.authError || authStore.authError,
      isAuthenticating: authState.isAuthenticating || authStore.isAuthenticating || firebaseAuth.isLoading,
      // Use Firebase wallet address if available (persistent), otherwise fall back to store or auth lock address
      authWalletAddress: firebaseAuth.walletAddress || authStore.authWalletAddress || authState.authWalletAddress,
      // Expose Firebase auth state for navigation logic
      isFirebaseAuthenticated: firebaseAuth.isAuthenticated,
      isFirebaseLoading: firebaseAuth.isLoading,
      // Progress state
      ...authProgress,
      // Expose MobX stores for advanced usage
      _mobx: {
        authStore: authStore,
        walletStore: walletStore,
      },
    }),
    [
      authState.authError,
      authState.isAuthenticating,
      authState.authWalletAddress,
      authStore.authError,
      authStore.isAuthenticating,
      authStore.authWalletAddress,
      firebaseAuth.isLoading,
      firebaseAuth.walletAddress,
      firebaseAuth.isAuthenticated,
      authProgress,
      authStore,
      walletStore,
    ]
  )
}
