import { useCallback } from 'react'
import { useAccount, useDisconnect, useSignMessage, useSignTypedData } from 'wagmi'
import { AuthenticationContext, AuthenticationOrchestrator } from '../services/authenticationOrchestrator'
import { createAppError, ErrorType } from '../utils/errorHandling'
import { useAuthenticationState } from './useAuthenticationState'
import { useWalletConnectionTrigger } from './useWalletConnectionTrigger'
import { useAuthProgress } from './useAuthProgress'

export const useAuthenticationWithProgress = () => {
  const { chain, connector } = useAccount()
  const { signTypedDataAsync } = useSignTypedData()
  const { signMessageAsync } = useSignMessage()
  const { disconnect } = useDisconnect()

  // Use the new modular state management
  const authState = useAuthenticationState()
  const authProgress = useAuthProgress()

  // Create the authentication orchestrator
  const orchestrator = new AuthenticationOrchestrator(authState.getAuthLock())

  const handleAuthentication = useCallback(
    async (walletAddress: string) => {
      // Clear any previous errors and reset progress
      authState.setAuthError(null)
      authProgress.resetProgress()

      // Create the authentication context with progress callbacks
      const context: AuthenticationContext = {
        walletAddress,
        connector,
        chainId: chain?.id,
        signatureFunctions: {
          signTypedDataAsync,
          signMessageAsync,
        },
        disconnect,
        progressCallbacks: {
          onStepStart: authProgress.startStep,
          onStepComplete: authProgress.completeStep,
          onStepFail: authProgress.failStep,
        }
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
    [authState, authProgress, orchestrator, connector, chain?.id, signTypedDataAsync, signMessageAsync, disconnect]
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

  return {
    // Authentication state
    authError: authState.authError,
    isAuthenticating: authState.isAuthenticating,
    authWalletAddress: authState.authWalletAddress,
    // Progress state
    ...authProgress,
  }
}