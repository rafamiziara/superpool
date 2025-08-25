import { useMemo } from 'react'
import { useAuthentication } from './useAuthentication'
import { useAuthenticationBridge } from './useAuthenticationBridge'
import { useAuthProgress } from './useAuthProgress'
import { useFirebaseAuth } from './useFirebaseAuth'

/**
 * Full authentication bridge that provides complete useAuthentication functionality
 * while integrating with MobX stores.
 *
 * This bridge extends the basic authentication bridge to include:
 * - Progress tracking (currentStep, completedSteps, etc.)
 * - All authentication orchestration functions
 * - Complete compatibility with useAuthentication interface
 *
 * Migration Strategy:
 * - Drop-in replacement for useAuthentication
 * - Maintains all existing functionality
 * - Uses MobX stores for authentication state
 * - Keeps progress management unchanged (for now)
 */
export const useAuthenticationFullBridge = () => {
  const authBridge = useAuthenticationBridge()
  const authProgress = useAuthProgress()
  const firebaseAuth = useFirebaseAuth()
  const originalAuth = useAuthentication() // Keep for comparison

  return useMemo(
    () => ({
      // Authentication state from MobX bridge (reactive)
      authError: authBridge.authError,
      isAuthenticating: authBridge.isAuthenticating || firebaseAuth.isLoading,
      authWalletAddress: firebaseAuth.walletAddress || authBridge.authWalletAddress,

      // Firebase auth state (unchanged)
      isFirebaseAuthenticated: firebaseAuth.isAuthenticated,
      isFirebaseLoading: firebaseAuth.isLoading,

      // Progress state from useAuthProgress (unchanged for now)
      currentStep: authProgress.currentStep,
      completedSteps: authProgress.completedSteps,
      failedStep: authProgress.failedStep,
      isComplete: authProgress.isComplete,
      error: authProgress.error,

      // Progress management functions (unchanged for now)
      startStep: authProgress.startStep,
      completeStep: authProgress.completeStep,
      failStep: authProgress.failStep,
      resetProgress: authProgress.resetProgress,
      getStepStatus: authProgress.getStepStatus,
      getStepInfo: authProgress.getStepInfo,
      getAllSteps: authProgress.getAllSteps,

      // Debug info for migration comparison
      _debug: {
        authBridge: authBridge._debug,
        originalValues: {
          authError: originalAuth.authError,
          isAuthenticating: originalAuth.isAuthenticating,
          authWalletAddress: originalAuth.authWalletAddress,
          currentStep: originalAuth.currentStep,
          completedSteps: Array.from(originalAuth.completedSteps),
          failedStep: originalAuth.failedStep,
          isComplete: originalAuth.isComplete,
          error: originalAuth.error,
        },
        bridgeValues: {
          authError: authBridge.authError,
          isAuthenticating: authBridge.isAuthenticating,
          authWalletAddress: authBridge.authWalletAddress,
          currentStep: authProgress.currentStep,
          completedSteps: Array.from(authProgress.completedSteps),
          failedStep: authProgress.failedStep,
          isComplete: authProgress.isComplete,
          error: authProgress.error,
        },
      },
    }),
    [
      authBridge,
      authProgress,
      firebaseAuth.isLoading,
      firebaseAuth.walletAddress,
      firebaseAuth.isAuthenticated,
      originalAuth, // Include for debugging
    ]
  )
}

/**
 * Type definition matching the full authentication hook
 */
export type AuthenticationFullBridge = ReturnType<typeof useAuthenticationFullBridge>
