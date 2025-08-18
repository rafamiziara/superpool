import { useCallback } from 'react'
import { useAccount, useDisconnect, useSignMessage, useSignTypedData } from 'wagmi'
import { AuthenticationContext, AuthenticationOrchestrator } from '../services/authenticationOrchestrator'
import { createAppError, ErrorType } from '../utils/errorHandling'
import { useAuthenticationState } from './useAuthenticationState'
import { useWalletConnectionTrigger } from './useWalletConnectionTrigger'

export const useAuthentication = () => {
  const { chain, connector } = useAccount()
  const { signTypedDataAsync } = useSignTypedData()
  const { signMessageAsync } = useSignMessage()
  const { disconnect } = useDisconnect()

  // Use the new modular state management
  const authState = useAuthenticationState()

  // Create the authentication orchestrator
  const orchestrator = new AuthenticationOrchestrator(authState.getAuthLock())

  const handleAuthentication = useCallback(
    async (walletAddress: string) => {
      // Clear any previous errors
      authState.setAuthError(null)

      // Create the authentication context
      const context: AuthenticationContext = {
        walletAddress,
        connector,
        chainId: chain?.id,
        signatureFunctions: {
          signTypedDataAsync,
          signMessageAsync,
        },
        disconnect,
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
    [authState, orchestrator, connector, chain?.id, signTypedDataAsync, signMessageAsync, disconnect]
  )

  const handleDisconnection = useCallback(() => {
    authState.setAuthError(null)
    orchestrator.cleanup()
  }, [authState, orchestrator])

  // Use the connection trigger to only authenticate on new connections
  useWalletConnectionTrigger({
    onNewConnection: handleAuthentication,
    onDisconnection: handleDisconnection,
  })

  return {
    authError: authState.authError,
    isAuthenticating: authState.isAuthenticating,
    authWalletAddress: authState.authWalletAddress,
  }
}
