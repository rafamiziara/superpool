import { useCallback, useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { FIREBASE_AUTH } from '../../firebase.config'
import { useStores } from '../../stores'
import { devOnly, ValidationUtils } from '../../utils'
import { useFirebaseAuth } from './useFirebaseAuth'

interface SessionRecoveryState {
  isRecovering: boolean
  recoveryAttempted: boolean
  recoverySuccess: boolean | null
  recoveryError: string | null
}

/**
 * Session recovery hook that handles authentication state restoration on app startup
 * Validates and recovers authentication sessions across app restarts
 */
export const useAuthSessionRecovery = () => {
  const { authenticationStore, walletStore } = useStores()
  const firebaseAuth = useFirebaseAuth()
  const { isConnected, address, chain } = useAccount()
  
  const [recoveryState, setRecoveryState] = useState<SessionRecoveryState>({
    isRecovering: false,
    recoveryAttempted: false,
    recoverySuccess: null,
    recoveryError: null,
  })

  /**
   * Validates current authentication session integrity
   */
  const validateSession = useCallback((): {
    isValid: boolean
    issues: string[]
    walletAddress: string | null
    firebaseAddress: string | null
  } => {
    const issues: string[] = []
    let isValid = true

    const walletAddress = address || null
    const firebaseAddress = firebaseAuth.walletAddress

    // Check if Firebase auth exists
    if (!firebaseAuth.isAuthenticated || !firebaseAddress) {
      issues.push('No Firebase authentication')
      isValid = false
    }

    // Check if wallet is connected
    if (!isConnected || !walletAddress) {
      issues.push('No wallet connection')
      isValid = false
    }

    // Check if addresses match (if both exist)
    if (walletAddress && firebaseAddress) {
      if (walletAddress.toLowerCase() !== firebaseAddress.toLowerCase()) {
        issues.push('Wallet address mismatch with Firebase auth')
        isValid = false
      }
    }

    // Validate wallet address format
    if (firebaseAddress && !ValidationUtils.isValidWalletAddress(firebaseAddress)) {
      issues.push('Invalid Firebase wallet address format')
      isValid = false
    }

    if (walletAddress && !ValidationUtils.isValidWalletAddress(walletAddress)) {
      issues.push('Invalid wallet address format')
      isValid = false
    }

    return {
      isValid,
      issues,
      walletAddress,
      firebaseAddress,
    }
  }, [firebaseAuth, isConnected, address])

  /**
   * Attempts to recover authentication session
   */
  const attemptSessionRecovery = useCallback(async (): Promise<{
    success: boolean
    error?: string
    action?: string
  }> => {
    try {
      devOnly('🔄 Attempting session recovery...')
      
      const validation = validateSession()
      
      if (validation.isValid) {
        devOnly('✅ Session is already valid, no recovery needed')
        
        // Ensure stores are synchronized with valid session
        if (validation.walletAddress && validation.firebaseAddress) {
          walletStore.updateConnectionState(true, validation.walletAddress, chain?.id)
          authenticationStore.setAuthLock({
            isLocked: false,
            startTime: 0,
            walletAddress: validation.firebaseAddress,
            abortController: null,
          })
          authenticationStore.setAuthError(null)
        }
        
        return { success: true, action: 'validated_existing_session' }
      }

      devOnly('⚠️ Session validation failed:', validation.issues)

      // Attempt different recovery strategies based on issues
      const issues = validation.issues

      // Case 1: Firebase auth exists but wallet not connected
      if (issues.includes('No wallet connection') && !issues.includes('No Firebase authentication')) {
        devOnly('🔄 Firebase auth exists but wallet not connected - waiting for wallet')
        return { 
          success: false, 
          error: 'Wallet connection required',
          action: 'await_wallet_connection'
        }
      }

      // Case 2: Wallet connected but no Firebase auth
      if (issues.includes('No Firebase authentication') && !issues.includes('No wallet connection')) {
        devOnly('🔄 Wallet connected but no Firebase auth - authentication required')
        return { 
          success: false, 
          error: 'Authentication required',
          action: 'authentication_required'
        }
      }

      // Case 3: Address mismatch - clear Firebase auth to force re-authentication
      if (issues.includes('Wallet address mismatch with Firebase auth')) {
        devOnly('🧹 Clearing Firebase auth due to address mismatch')
        await FIREBASE_AUTH.signOut()
        authenticationStore.reset()
        return { 
          success: false, 
          error: 'Address mismatch resolved - authentication required',
          action: 'cleared_mismatched_auth'
        }
      }

      // Case 4: Invalid address formats - clear everything
      if (issues.some(issue => issue.includes('Invalid') && issue.includes('address'))) {
        devOnly('🧹 Clearing invalid authentication data')
        await FIREBASE_AUTH.signOut()
        authenticationStore.reset()
        walletStore.disconnect()
        return { 
          success: false, 
          error: 'Invalid authentication data cleared',
          action: 'cleared_invalid_data'
        }
      }

      // Default case - no authentication available
      return { 
        success: false, 
        error: 'No valid authentication session found',
        action: 'no_session'
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('❌ Session recovery failed:', errorMessage)
      return { success: false, error: errorMessage, action: 'recovery_failed' }
    }
  }, [validateSession, walletStore, authenticationStore, chain?.id])

  /**
   * Manually trigger session recovery
   */
  const triggerRecovery = useCallback(async () => {
    if (recoveryState.isRecovering) {
      return
    }

    setRecoveryState(prev => ({
      ...prev,
      isRecovering: true,
      recoveryError: null,
    }))

    try {
      const result = await attemptSessionRecovery()
      
      setRecoveryState(prev => ({
        ...prev,
        isRecovering: false,
        recoveryAttempted: true,
        recoverySuccess: result.success,
        recoveryError: result.error || null,
      }))

      devOnly('📊 Session recovery result:', result)
      
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      
      setRecoveryState(prev => ({
        ...prev,
        isRecovering: false,
        recoveryAttempted: true,
        recoverySuccess: false,
        recoveryError: errorMessage,
      }))

      throw error
    }
  }, [attemptSessionRecovery, recoveryState.isRecovering])

  // Automatic session recovery on app startup
  useEffect(() => {
    // Only attempt recovery once when Firebase auth state is loaded
    if (firebaseAuth.isLoading || recoveryState.recoveryAttempted) {
      return
    }

    // Delay recovery slightly to allow all auth states to stabilize
    const recoveryTimeout = setTimeout(() => {
      triggerRecovery().catch((error) => {
        console.warn('⚠️ Automatic session recovery failed:', error)
      })
    }, 1000)

    return () => clearTimeout(recoveryTimeout)
  }, [firebaseAuth.isLoading, recoveryState.recoveryAttempted, triggerRecovery])

  return {
    // Recovery state
    ...recoveryState,
    
    // Manual recovery actions
    triggerRecovery,
    validateSession,
    
    // Helper methods
    isSessionValid: () => validateSession().isValid,
    hasValidSession: firebaseAuth.isAuthenticated && isConnected && 
                     address && firebaseAuth.walletAddress &&
                     address.toLowerCase() === firebaseAuth.walletAddress.toLowerCase(),
  }
}

/**
 * Type definition for the session recovery hook
 */
export type AuthSessionRecovery = ReturnType<typeof useAuthSessionRecovery>