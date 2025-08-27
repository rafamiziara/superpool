import { AuthStep, AuthStepInfo } from '@superpool/types'
import { action, makeAutoObservable, observable } from 'mobx'
import { AuthenticationLock } from '../services/authentication/AuthenticationOrchestrator'
import { AppError } from '../utils/errorHandling'

const AUTH_STEPS: Record<AuthStep, AuthStepInfo> = {
  'connect-wallet': {
    step: 'connect-wallet',
    title: 'Connect Wallet',
    description: 'Wallet connection established',
  },
  'acquire-lock': {
    step: 'acquire-lock',
    title: 'Acquire Lock & Validate State',
    description: 'Securing authentication process',
  },
  'generate-message': {
    step: 'generate-message',
    title: 'Generate Auth Message',
    description: 'Creating authentication challenge',
  },
  'request-signature': {
    step: 'request-signature',
    title: 'Request Signature',
    description: 'Sign message in your wallet app',
  },
  'verify-signature': {
    step: 'verify-signature',
    title: 'Verify Signature',
    description: 'Validating your signature',
  },
  'firebase-auth': {
    step: 'firebase-auth',
    title: 'Firebase Authentication',
    description: 'Completing authentication',
  },
}

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
    requestId: null,
  }

  // Auth progress state (reactive)
  currentStep: AuthStep | null = null
  completedSteps = observable.set<AuthStep>()
  failedStep: AuthStep | null = null
  isProgressComplete = false
  progressError: string | null = null

  constructor() {
    makeAutoObservable(this, {
      // Explicitly mark actions
      setAuthError: action,
      setAuthLock: action,
      acquireAuthLock: action,
      releaseAuthLock: action,
      reset: action,
      // Auth progress actions
      startStep: action,
      completeStep: action,
      failStep: action,
      resetProgress: action,
    })
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

  acquireAuthLock = (walletAddress: string, requestId?: string): boolean => {
    if (this.authLock.isLocked) {
      return false
    }

    this.authLock = {
      isLocked: true,
      startTime: Date.now(),
      walletAddress,
      abortController: new AbortController(),
      requestId: requestId || null,
    }

    console.log('🔒 Authentication lock acquired for:', walletAddress, requestId ? `(Request: ${requestId})` : '')
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
      requestId: null,
    }

    console.log('🔓 Authentication lock released')
  }

  // Helper method to check if authentication is in progress for a specific wallet
  isAuthenticatingForWallet = (walletAddress: string): boolean => {
    return this.isAuthenticating && this.authWalletAddress?.toLowerCase() === walletAddress.toLowerCase()
  }

  // Reset all authentication state
  // Added protection against infinite loops
  private isResetting = false
  reset = (): void => {
    if (this.isResetting) {
      console.log('🔄 Reset already in progress, skipping to prevent infinite loop')
      return
    }
    
    this.isResetting = true
    try {
      this.releaseAuthLock()
      this.authError = null
      this.resetProgress()
    } finally {
      this.isResetting = false
    }
  }

  // Auth Progress Management Actions
  startStep = (step: AuthStep): void => {
    console.log(`📍 AuthenticationStore.startStep called: ${step}`)
    this.currentStep = step
    this.failedStep = null
    this.progressError = null
  }

  completeStep = (step: AuthStep): void => {
    console.log(`✅ AuthenticationStore.completeStep called: ${step}`)
    this.completedSteps.add(step)
    this.currentStep = step === 'firebase-auth' ? null : this.currentStep
    this.isProgressComplete = step === 'firebase-auth'
    this.failedStep = null
    this.progressError = null
  }

  failStep = (step: AuthStep, error: string): void => {
    console.log(`❌ AuthenticationStore.failStep called: ${step} - ${error}`)
    this.currentStep = null
    this.failedStep = step
    this.progressError = error
    this.isProgressComplete = false
  }

  private isResettingProgress = false
  resetProgress = (): void => {
    if (this.isResettingProgress) {
      console.log('🔄 Progress reset already in progress, skipping to prevent infinite loop')
      return
    }
    
    this.isResettingProgress = true
    try {
      console.log('🔄 AuthenticationStore.resetProgress called')
      this.currentStep = null
      this.completedSteps.clear()
      this.completedSteps.add('connect-wallet') // Wallet is already connected when we start
      this.failedStep = null
      this.isProgressComplete = false
      this.progressError = null
    } finally {
      this.isResettingProgress = false
    }
  }

  // Progress helper methods
  getStepStatus = (step: AuthStep): 'failed' | 'completed' | 'current' | 'pending' => {
    if (this.failedStep === step) return 'failed'
    if (this.completedSteps.has(step)) return 'completed'
    if (this.currentStep === step) return 'current'
    return 'pending'
  }

  getStepInfo = (step: AuthStep): AuthStepInfo => AUTH_STEPS[step]

  getAllSteps = (): AuthStepInfo[] => Object.values(AUTH_STEPS)
}
