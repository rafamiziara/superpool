import { useAuthenticationBridge } from './useAuthenticationBridge'
import { useAuthProgress } from './useAuthProgress'
import { useFirebaseAuth } from './useFirebaseAuth'

/**
 * Simplified authentication bridge with MobX reactivity
 *
 * Combines authentication state from MobX stores with progress tracking.
 * No complex useMemo dependencies - MobX handles reactivity automatically.
 *
 * Key simplifications:
 * - Removed debug comparison code (migration is complete)
 * - Eliminated complex dependency arrays
 * - Direct property access instead of memoized object
 */
export const useAuthenticationFullBridge = () => {
  const authBridge = useAuthenticationBridge()
  const authProgress = useAuthProgress()
  const firebaseAuth = useFirebaseAuth()

  // Direct return - no complex useMemo needed!
  // MobX handles reactivity automatically through observer components
  return {
    // Authentication state from MobX bridge (reactive)
    authError: authBridge.authError,
    isAuthenticating: authBridge.isAuthenticating || firebaseAuth.isLoading,
    authWalletAddress: firebaseAuth.walletAddress || authBridge.authWalletAddress,

    // Firebase auth state
    isFirebaseAuthenticated: firebaseAuth.isAuthenticated,
    isFirebaseLoading: firebaseAuth.isLoading,

    // Progress state from useAuthProgress
    currentStep: authProgress.currentStep,
    completedSteps: authProgress.completedSteps,
    failedStep: authProgress.failedStep,
    isComplete: authProgress.isComplete,
    error: authProgress.error,

    // Progress management functions
    startStep: authProgress.startStep,
    completeStep: authProgress.completeStep,
    failStep: authProgress.failStep,
    resetProgress: authProgress.resetProgress,
    getStepStatus: authProgress.getStepStatus,
    getStepInfo: authProgress.getStepInfo,
    getAllSteps: authProgress.getAllSteps,

    // Simplified debug info (removed complex comparison)
    _debug: authBridge._debug,
  }
}

/**
 * Type definition matching the full authentication hook
 */
export type AuthenticationFullBridge = ReturnType<typeof useAuthenticationFullBridge>
