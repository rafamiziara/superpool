import { useAuthenticationStore } from '../stores'
import { useAuthProgress } from './useAuthProgress'
import { useFirebaseAuth } from './useFirebaseAuth'

/**
 * Clean authentication hook with MobX stores and progress tracking
 *
 * Directly uses MobX stores - no bridge pattern needed!
 * Combines authentication state with progress management for connecting screen.
 */
export const useAuthenticationFullBridge = () => {
  const authStore = useAuthenticationStore()
  const authProgress = useAuthProgress()
  const firebaseAuth = useFirebaseAuth()

  // Clean direct return - MobX handles reactivity automatically
  return {
    // Authentication state from MobX store (reactive)
    authError: authStore.authError,
    isAuthenticating: authStore.isAuthenticating || firebaseAuth.isLoading,
    authWalletAddress: firebaseAuth.walletAddress || authStore.authWalletAddress,

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

    // Clean debug info
    _debug: {
      authStore: {
        authError: authStore.authError,
        isAuthenticating: authStore.isAuthenticating,
        authWalletAddress: authStore.authWalletAddress,
      },
    },
  }
}

/**
 * Type definition matching the full authentication hook
 */
export type AuthenticationFullBridge = ReturnType<typeof useAuthenticationFullBridge>
