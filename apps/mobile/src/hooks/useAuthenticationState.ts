import { useRef, useState } from 'react'
import { AuthenticationLock } from '../services/authenticationOrchestrator'
import { AppError } from '../utils/errorHandling'

export interface AuthenticationState {
  authError: AppError | null
  isAuthenticating: boolean
  authWalletAddress: string | null
}

export interface AuthenticationStateActions {
  setAuthError: (error: AppError | null) => void
  getAuthLock: () => React.MutableRefObject<AuthenticationLock>
  releaseAuthLock: () => void
}

/**
 * Custom hook for managing authentication state
 * Extracts state management concerns from the main authentication hook
 */
export const useAuthenticationState = () => {
  // Authentication error state
  const [authError, setAuthError] = useState<AppError | null>(null)

  // Authentication lock to prevent concurrent attempts
  const authLock = useRef<AuthenticationLock>({
    isLocked: false,
    startTime: 0,
    walletAddress: null,
    abortController: null,
  })

  /**
   * Releases authentication lock and cleans up abort controller
   */
  const releaseAuthLock = () => {
    if (authLock.current.abortController) {
      authLock.current.abortController.abort('Authentication completed')
    }

    authLock.current = {
      isLocked: false,
      startTime: 0,
      walletAddress: null,
      abortController: null,
    }

    console.log('🔓 Authentication lock released')
  }

  // Derived state
  const authenticationState: AuthenticationState = {
    authError,
    isAuthenticating: authLock.current.isLocked,
    authWalletAddress: authLock.current.walletAddress,
  }

  // Actions
  const authenticationActions: AuthenticationStateActions = {
    setAuthError,
    getAuthLock: () => authLock,
    releaseAuthLock,
  }

  return {
    ...authenticationState,
    ...authenticationActions,
  }
}
