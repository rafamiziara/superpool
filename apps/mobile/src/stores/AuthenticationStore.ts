import { makeAutoObservable } from 'mobx'
import { AuthenticationLock } from '../services/authenticationOrchestrator'
import { AppError } from '../utils/errorHandling'

/**
 * MobX store for managing authentication state
 * Replaces the useAuthenticationState hook with reactive store pattern
 */
export class AuthenticationStore {
  // Observable state
  authError: AppError | null = null
  authLock: AuthenticationLock = {
    isLocked: false,
    startTime: 0,
    walletAddress: null,
    abortController: null,
  }

  constructor() {
    makeAutoObservable(this)
  }

  // Computed getters
  get isAuthenticating(): boolean {
    return this.authLock.isLocked
  }

  get authWalletAddress(): string | null {
    return this.authLock.walletAddress
  }

  // Actions
  setAuthError = (error: AppError | null): void => {
    this.authError = error
  }

  setAuthLock = (lock: Partial<AuthenticationLock>): void => {
    this.authLock = {
      ...this.authLock,
      ...lock,
    }
  }

  acquireAuthLock = (walletAddress: string): boolean => {
    if (this.authLock.isLocked) {
      return false
    }

    this.authLock = {
      isLocked: true,
      startTime: Date.now(),
      walletAddress,
      abortController: new AbortController(),
    }

    console.log('🔒 Authentication lock acquired for:', walletAddress)
    return true
  }

  releaseAuthLock = (): void => {
    if (this.authLock.abortController) {
      this.authLock.abortController.abort('Authentication completed')
    }

    this.authLock = {
      isLocked: false,
      startTime: 0,
      walletAddress: null,
      abortController: null,
    }

    console.log('🔓 Authentication lock released')
  }

  // Helper method to check if authentication is in progress for a specific wallet
  isAuthenticatingForWallet = (walletAddress: string): boolean => {
    return this.isAuthenticating && this.authWalletAddress?.toLowerCase() === walletAddress.toLowerCase()
  }

  // Reset all authentication state
  reset = (): void => {
    this.releaseAuthLock()
    this.authError = null
  }
}
