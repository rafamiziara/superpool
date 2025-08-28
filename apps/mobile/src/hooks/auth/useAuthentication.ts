import { useAuthenticationStore } from '../../stores'
import { useFirebaseAuth } from './useFirebaseAuth'

/**
 * Main authentication hook with MobX stores and progress tracking
 *
 * Combines authentication state with progress management.
 * Perfect for screens that need full authentication functionality like connecting.tsx.
 */
export const useAuthentication = () => {
  const authStore = useAuthenticationStore()
  const firebaseAuth = useFirebaseAuth()

  // Clean direct return - MobX handles reactivity automatically
  return {
    // Authentication state from MobX store (reactive)
    authError: authStore.authError?.userFriendlyMessage || null,
    isAuthenticating: authStore.isAuthenticating || firebaseAuth.isLoading,
    authWalletAddress: firebaseAuth.walletAddress || authStore.authWalletAddress,

    // Firebase auth state
    isFirebaseAuthenticated: firebaseAuth.isAuthenticated,
    isFirebaseLoading: firebaseAuth.isLoading,

    // Progress state from MobX store (reactive)
    currentStep: authStore.currentStep,
    completedSteps: authStore.completedSteps,
    failedStep: authStore.failedStep,
    isComplete: authStore.isProgressComplete,
    error: authStore.progressError,

    // Progress management functions from MobX store
    startStep: authStore.startStep,
    completeStep: authStore.completeStep,
    failStep: authStore.failStep,
    resetProgress: authStore.resetProgress,
    getStepStatus: authStore.getStepStatus,
    getStepInfo: authStore.getStepInfo,
    getAllSteps: authStore.getAllSteps,

    // Clean debug info
    _debug: {
      authStore: {
        authError: authStore.authError,
        isAuthenticating: authStore.isAuthenticating,
        authWalletAddress: authStore.authWalletAddress,
        currentStep: authStore.currentStep,
        completedSteps: Array.from(authStore.completedSteps),
        failedStep: authStore.failedStep,
      },
    },
  }
}

/**
 * Type definition for the main authentication hook
 */
export type Authentication = ReturnType<typeof useAuthentication>
