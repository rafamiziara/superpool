import { AuthenticationContext } from '@superpool/types'
import { useCallback, useRef } from 'react'
import { useAccount } from 'wagmi'
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
  const authProgress = useAuthProgress()

  // Create orchestrator instance with MobX stores
  const orchestratorRef = useRef<AuthenticationOrchestrator | null>(null)

  // Initialize orchestrator if not already created
  const getOrchestrator = useCallback((): AuthenticationOrchestrator => {
    if (!orchestratorRef.current) {
      orchestratorRef.current = new AuthenticationOrchestrator(authenticationStore, walletStore)
      devOnly('🎭 Authentication orchestrator initialized')
    }
    return orchestratorRef.current
  }, [authenticationStore, walletStore])

  /**
   * Handle new wallet connection - triggers authentication
   */
  const handleNewConnection = useCallback(
    async (walletAddress: string, chainId?: number) => {
      try {
        devOnly('🚀 Handling new wallet connection:', { walletAddress, chainId })

        // Ensure wallet state is properly updated
        walletStore.connect(walletAddress, chainId || chain?.id || 1)

        // Reset any previous authentication progress
        authProgress.resetProgress()

        // Create authentication context
        const authContext: AuthenticationContext = {
          walletAddress,
          chainId: chainId || chain?.id || 1,
          connector: 'appkit', // We're using AppKit for wallet connections
          progressCallbacks: {
            onStepStart: authProgress.startStep,
            onStepComplete: authProgress.completeStep,
            onStepFail: authProgress.failStep,
          },
        }

        // Get orchestrator and start authentication
        const orchestrator = getOrchestrator()
        await orchestrator.authenticate(authContext)

        devOnly('✅ Authentication completed successfully')
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
    devOnly('👋 Handling wallet disconnection')

    // Reset authentication progress
    authProgress.resetProgress()

    // Clear authentication state in stores
    authenticationStore.reset()
    walletStore.disconnect()

    devOnly('🧹 Authentication state cleared on disconnection')
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
