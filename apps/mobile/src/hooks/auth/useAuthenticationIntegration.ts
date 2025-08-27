import { AuthenticationContext } from '@superpool/types'
import { useCallback, useRef } from 'react'
import { useAccount, useDisconnect, useSignMessage, useSignTypedData } from 'wagmi'
import { AuthenticationOrchestrator } from '../../services/authentication'
import { useStores } from '../../stores'
import { devOnly } from '../../utils'
import { useAuthProgress } from './useAuthProgress'

/**
 * Integration hook that connects wallet events to authentication orchestrator
 * This is the missing piece that bridges wallet connections to authentication execution
 */
export const useAuthenticationIntegration = () => {
  const { authenticationStore, walletStore } = useStores()
  const { isConnected, address, chain } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const { signTypedDataAsync } = useSignTypedData()
  const { disconnect } = useDisconnect()
  const authProgress = useAuthProgress()
  
  // Store wagmi functions in refs to prevent dependency changes
  const signMessageAsyncRef = useRef(signMessageAsync)
  const signTypedDataAsyncRef = useRef(signTypedDataAsync)
  const disconnectRef = useRef(disconnect)
  
  // Update refs when functions change
  signMessageAsyncRef.current = signMessageAsync
  signTypedDataAsyncRef.current = signTypedDataAsync
  disconnectRef.current = disconnect

  // Create orchestrator instance with MobX stores
  const orchestratorRef = useRef<AuthenticationOrchestrator | null>(null)

  // Initialize orchestrator if not already created
  const getOrchestrator = useCallback((): AuthenticationOrchestrator => {
    if (!orchestratorRef.current) {
      orchestratorRef.current = new AuthenticationOrchestrator(authenticationStore, walletStore)
      console.log('🎭 Authentication orchestrator initialized')
    }
    return orchestratorRef.current
  }, [authenticationStore, walletStore])

  /**
   * Handle new wallet connection - triggers authentication
   */
  const handleNewConnection = useCallback(
    async (walletAddress: string, chainId?: number) => {
      try {
        console.log('🚀 Handling new wallet connection:', { walletAddress, chainId })

        // Ensure wallet state is properly updated
        walletStore.connect(walletAddress, chainId || chain?.id || 1)

        // Reset any previous authentication progress
        authProgress.resetProgress()

        // Create authentication context
        const authContext: AuthenticationContext = {
          walletAddress,
          chainId: chainId || chain?.id || 1,
          connector: 'appkit', // We're using AppKit for wallet connections
          signatureFunctions: {
            signTypedDataAsync: signTypedDataAsyncRef.current,
            signMessageAsync: (params: { message: string; account: `0x${string}`; connector?: any }) =>
              signMessageAsyncRef.current({ message: params.message, account: params.account }),
          },
          disconnect: disconnectRef.current,
          progressCallbacks: {
            onStepStart: authProgress.startStep,
            onStepComplete: authProgress.completeStep,
            onStepFail: authProgress.failStep,
          },
        }

        // Get orchestrator and start authentication
        const orchestrator = getOrchestrator()
        await orchestrator.authenticate(authContext)

        console.log('✅ Authentication completed successfully')
      } catch (error) {
        console.error('❌ Authentication failed:', error)

        // Update authentication progress with error
        if (error instanceof Error) {
          authProgress.failStep(authProgress.currentStep || 'connect-wallet', error.message)
        }
      }
    },
    [walletStore, chain?.id, authProgress, getOrchestrator]
  )

  /**
   * Handle wallet disconnection - cleanup authentication state
   */
  const handleDisconnection = useCallback(() => {
    console.log('👋 Handling wallet disconnection')

    // Reset authentication progress
    authProgress.resetProgress()

    // Clear authentication state in stores
    authenticationStore.reset()
    walletStore.disconnect()

    console.log('🧹 Authentication state cleared on disconnection')
  }, [authProgress, authenticationStore, walletStore])

  /**
   * Manual authentication trigger (for retry scenarios)
   */
  const triggerAuthentication = useCallback(async () => {
    if (!isConnected || !address) {
      console.warn('⚠️ Cannot trigger authentication: wallet not connected')
      return
    }

    await handleNewConnection(address, chain?.id)
  }, [isConnected, address, chain?.id, handleNewConnection])

  /**
   * Check if authentication is needed
   */
  const needsAuthentication = useCallback((): boolean => {
    return isConnected && !!address && !authenticationStore.authWalletAddress
  }, [isConnected, address, authenticationStore.authWalletAddress])

  return {
    // Connection event handlers for useWalletConnectionTrigger
    onNewConnection: handleNewConnection,
    onDisconnection: handleDisconnection,

    // Manual authentication control
    triggerAuthentication,
    needsAuthentication,

    // Orchestrator access (for advanced use cases)
    getOrchestrator,
  }
}

/**
 * Type definition for the authentication integration hook
 */
export type AuthenticationIntegration = ReturnType<typeof useAuthenticationIntegration>
