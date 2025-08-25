import { useCallback, useEffect, useMemo } from 'react'
import { useAccount, useDisconnect, useSignMessage, useSignTypedData } from 'wagmi'
import { AuthenticationContext, AuthenticationOrchestrator } from '../services/authenticationOrchestrator'
import { createAppError, ErrorType } from '../utils/errorHandling'
import { useAuthenticationState } from './useAuthenticationState'
import { useAuthProgress } from './useAuthProgress'
import { useFirebaseAuth } from './useFirebaseAuth'
import { getGlobalLogoutState } from './useLogoutState'
import { useWalletConnectionTrigger } from './useWalletConnectionTrigger'

export const useAuthentication = () => {
  const { isConnected, address, chain, connector } = useAccount()
  const { signTypedDataAsync } = useSignTypedData()
  const { signMessageAsync } = useSignMessage()
  const { disconnect } = useDisconnect()

  // Use Firebase auth state for persistence across app refreshes
  const firebaseAuth = useFirebaseAuth()
  // Use the new modular state management
  const authState = useAuthenticationState()
  const authProgress = useAuthProgress()

  // Create the authentication orchestrator (memoized to prevent recreation)
  const orchestrator = useMemo(() => new AuthenticationOrchestrator(authState.getAuthLock()), [authState])

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
          domain?: any; 
          types: Record<string, any[]>; 
          primaryType: string; 
          message: Record<string, unknown>;
          account: `0x${string}`;
        }) => {
          // Wagmi requires the parameters to be wrapped in a variables object
          const signature = await signTypedDataAsync({
            ...data,
            account: data.account, // account is now required
          })
          return signature
        },
        signMessageAsync: async (params: { 
          message: string; 
          account: `0x${string}`; 
          connector?: any 
        }) => {
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

  // Start authentication immediately if wallet is already connected BUT not already authenticated
  useEffect(() => {
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

    if (isConnected && address && !authState.isAuthenticating && !authState.authWalletAddress && !firebaseAuth.isAuthenticated) {
      console.log('🚀 Wallet already connected, starting authentication immediately:', address)
      handleAuthentication(address)
    } else if (authState.authWalletAddress || firebaseAuth.isAuthenticated) {
      console.log('✅ Wallet already authenticated, skipping re-authentication:', authState.authWalletAddress || firebaseAuth.walletAddress)
    }
  }, [
    isConnected,
    address,
    authState.isAuthenticating,
    authState.authWalletAddress,
    firebaseAuth.isAuthenticated,
    firebaseAuth.walletAddress,
    handleAuthentication,
  ])

  return useMemo(
    () => ({
      // Authentication state
      authError: authState.authError,
      isAuthenticating: authState.isAuthenticating || firebaseAuth.isLoading,
      // Use Firebase wallet address if available (persistent), otherwise fall back to auth lock address
      authWalletAddress: firebaseAuth.walletAddress || authState.authWalletAddress,
      // Expose Firebase auth state for navigation logic
      isFirebaseAuthenticated: firebaseAuth.isAuthenticated,
      isFirebaseLoading: firebaseAuth.isLoading,
      // Progress state
      ...authProgress,
    }),
    [
      authState.authError,
      authState.isAuthenticating,
      authState.authWalletAddress,
      firebaseAuth.isLoading,
      firebaseAuth.walletAddress,
      firebaseAuth.isAuthenticated,
      authProgress,
    ]
  )
}
