import { router } from 'expo-router'
import { signInWithCustomToken } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { useCallback, useState } from 'react'
import { useAccount, useDisconnect, useSignMessage } from 'wagmi'
import { FIREBASE_AUTH, FIREBASE_FUNCTIONS } from '../firebase.config'
import { AppError, categorizeError, isUserInitiatedError } from '../utils/errorHandling'
import { SessionManager } from '../utils/sessionManager'
import { authToasts, showErrorFromAppError } from '../utils/toast'
import { getGlobalLogoutState } from './useLogoutState'
import { useWalletConnectionTrigger } from './useWalletConnectionTrigger'

const verifySignatureAndLogin = httpsCallable(FIREBASE_FUNCTIONS, 'verifySignatureAndLogin')
const generateAuthMessage = httpsCallable(FIREBASE_FUNCTIONS, 'generateAuthMessage')

export const useAuthentication = () => {
  const { address, isConnected, chain } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const { disconnect } = useDisconnect()
  const [authError, setAuthError] = useState<AppError | null>(null)

  const handleAuthentication = useCallback(
    async (walletAddress: string) => {
      console.log('🔐 Starting authentication flow for address:', walletAddress)
      console.log('🔐 Current account state:', { isConnected, address, chainId: chain?.id })

      // Check if we're in the middle of a logout process
      try {
        const { isLoggingOut } = getGlobalLogoutState()
        if (isLoggingOut) {
          console.log('⏸️ Skipping authentication: logout in progress')
          return
        }
      } catch (error) {
        // Global logout state not initialized yet, continue
        console.log('ℹ️ Global logout state not initialized, continuing...')
      }

      // Get session debug info for troubleshooting
      try {
        const sessionInfo = await SessionManager.getSessionDebugInfo()
        console.log('📊 Session debug info:', {
          totalKeys: sessionInfo.totalKeys,
          walletConnectKeysCount: sessionInfo.walletConnectKeys.length,
          walletConnectKeys: sessionInfo.walletConnectKeys.slice(0, 3), // Show first 3
        })
      } catch (error) {
        console.warn('⚠️ Failed to get session debug info:', error)
      }

      // Verify current connection state
      console.log('🔍 Current connection state:', {
        isConnected,
        address,
        chainId: chain?.id,
        chainName: chain?.name,
        addressMatches: address === walletAddress,
      })

      // Check if connected to supported chain
      if (!chain) {
        console.warn('❌ No chain detected')
        const chainError = categorizeError(new Error('ChainId not found'))
        setAuthError(chainError)
        showErrorFromAppError(chainError)
        return
      }

      setAuthError(null)

      try {
        // Show connecting toast and wallet app guidance
        console.log('📢 Showing connection toast...')
        authToasts.connecting()

        // Show guidance for wallet app switching after a brief delay
        setTimeout(() => {
          console.log('📱 Showing wallet app guidance...')
          authToasts.walletAppGuidance()
        }, 3000)

        // Step 1: Generate authentication message
        console.log('📝 Step 1: Generating authentication message...')
        const messageResponse = await generateAuthMessage({ walletAddress })
        const { message } = messageResponse.data as { message: string }
        console.log('✅ Authentication message generated:', message?.substring(0, 50) + '...')

        // Small delay to ensure session is fully established
        console.log('⏳ Waiting 1 second for session stabilization...')
        await new Promise((resolve) => setTimeout(resolve, 1000))

        // Check if still connected after delay
        if (!isConnected || address !== walletAddress) {
          console.log('❌ Connection lost during message generation:', { isConnected, address, walletAddress })
          return
        }

        // Step 2: Request signature
        console.log('✍️ Step 2: Requesting wallet signature...')
        authToasts.signingMessage()
        console.log('📱 Calling signMessageAsync with message:', message)

        let signature: string
        try {
          // Add timeout to signature request to prevent hanging
          const signaturePromise = signMessageAsync({ message })
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new Error('Signature request timed out after 30 seconds'))
            }, 30000) // 30 second timeout
          })

          signature = await Promise.race([signaturePromise, timeoutPromise])
          console.log('✅ Signature received:', signature?.substring(0, 20) + '...')
        } catch (signError: unknown) {
          console.log('❌ Signature error:', signError)
          const errorMessage = signError instanceof Error ? signError.message : String(signError)

          // Handle timeout specifically
          if (errorMessage.includes('timed out')) {
            console.log('⏰ Signature request timed out')
            const timeoutError = categorizeError(new Error('Signature request timed out. Please try connecting again.'))
            setAuthError(timeoutError)
            disconnect()
            return
          }

          // Handle ConnectorNotConnectedError specifically
          if (errorMessage.includes('ConnectorNotConnectedError') || errorMessage.includes('Connector not connected')) {
            console.log('📱 Wallet disconnected during signing, treating as user cancellation')
            // Treat as user-initiated cancellation
            const cancelError = categorizeError(new Error('User rejected the request.'))
            setAuthError(cancelError)
            return
          }
          // Re-throw other errors to be handled by outer catch
          throw signError
        }

        // Check if still connected after signature
        if (!isConnected || address !== walletAddress) return

        // Step 3: Verify signature and get Firebase token
        authToasts.verifying()
        console.log('Verifying signature...')
        const signatureResponse = await verifySignatureAndLogin({
          walletAddress,
          signature,
        })
        const { firebaseToken } = signatureResponse.data as { firebaseToken: string }

        // Check if still connected before Firebase auth
        if (!isConnected || address !== walletAddress) return

        // Step 4: Sign in with Firebase
        console.log('Signing in with Firebase...')
        await signInWithCustomToken(FIREBASE_AUTH, firebaseToken)

        // Success!
        console.log('User successfully signed in with Firebase!')
        authToasts.success()
        router.replace('/dashboard')
      } catch (error) {
        console.error('Authentication failed:', error)

        // Check if this is a WalletConnect session error
        const errorMessage = error instanceof Error ? error.message : String(error)
        const isSessionError =
          errorMessage.includes('No matching key') ||
          errorMessage.includes('session:') ||
          errorMessage.includes('pairing') ||
          errorMessage.includes('WalletConnect') ||
          errorMessage.includes('relayer')

        if (isSessionError) {
          console.log('🚨 Detected WalletConnect session error:', errorMessage)

          // Extract session ID from error message if present
          const sessionIdMatch = errorMessage.match(/session:\s*([a-f0-9]{64})/i)
          const sessionId = sessionIdMatch ? sessionIdMatch[1] : null

          try {
            if (sessionId) {
              console.log(`🎯 Attempting to clear specific session: ${sessionId}`)
              await SessionManager.clearSessionByErrorId(sessionId)
            }

            // Always perform comprehensive cleanup for session errors
            console.log('🧹 Performing comprehensive session cleanup...')
            await SessionManager.forceResetAllConnections()

            console.log('✅ Session cleanup completed, disconnecting wallet...')
            disconnect()

            // Show specific error message for session issues
            setTimeout(() => {
              authToasts.sessionError()
            }, 1500)
            return
          } catch (sessionError) {
            console.error('❌ Failed to clear sessions:', sessionError)
          }
        }

        const appError = categorizeError(error)
        setAuthError(appError)

        console.log('Authentication error details:', {
          errorType: appError.type,
          isUserInitiated: isUserInitiatedError(appError),
          message: appError.userFriendlyMessage,
          originalError: appError.originalError,
          isSessionError,
        })

        // Disconnect wallet on technical failures
        const shouldDisconnect = !isUserInitiatedError(appError) && isConnected

        if (shouldDisconnect) {
          console.log('Disconnecting wallet due to authentication failure')
          try {
            disconnect()
          } catch (disconnectError) {
            console.warn('Failed to disconnect wallet:', disconnectError)
          }
        }

        // Always show error feedback, but with different timing based on whether wallet was disconnected
        if (shouldDisconnect) {
          // For technical failures that cause disconnect, show error after disconnect toast
          console.log('Scheduling error toast after disconnect (2s delay)')
          setTimeout(() => {
            console.log('Showing error toast for disconnect scenario:', appError.userFriendlyMessage)
            showErrorFromAppError(appError)
          }, 2000)
        } else {
          // For user cancellations or non-disconnect errors, show immediately with delay for better UX
          const delay = isUserInitiatedError(appError) ? 1500 : 0
          console.log(`Scheduling error toast for non-disconnect scenario (${delay}ms delay)`)
          setTimeout(() => {
            console.log('Showing error toast for non-disconnect scenario:', appError.userFriendlyMessage)
            showErrorFromAppError(appError)
          }, delay)
        }
      } finally {
        // Cleanup handled by toasts
      }
    },
    [signMessageAsync, disconnect, isConnected, address, chain]
  )

  const handleDisconnection = useCallback(() => {
    setAuthError(null)
  }, [])

  // Use the connection trigger to only authenticate on new connections
  useWalletConnectionTrigger({
    onNewConnection: handleAuthentication,
    onDisconnection: handleDisconnection,
  })

  return {
    authError,
  }
}
