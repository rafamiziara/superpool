import { makeAutoObservable } from 'mobx'
import type { User } from '@superpool/types'
import type { AuthStep } from '../types/auth'
import { AUTH_STEPS } from '../constants/authSteps'

export class AuthStore {
  // Lock mechanism
  authLock = {
    isLocked: false,
    walletAddress: null as string | null,
    startTime: 0,
    requestId: null as string | null,
  }

  // Step-based progress tracking
  currentStep: AuthStep | null = null
  completedSteps = new Set<AuthStep>()
  failedStep: AuthStep | null = null

  // Auth state
  user: User | null = null
  error: string | null = null

  // Wallet state
  isWalletConnected: boolean = false
  walletAddress: string | null = null
  chainId: number | null = null
  isWalletConnecting: boolean = false

  // Initialization tracking
  hasInitializedWallet: boolean = false
  hasInitializedFirebase: boolean = false

  constructor() {
    makeAutoObservable(this)
  }

  // Computed properties
  get isAuthenticating(): boolean {
    return this.authLock.isLocked
  }

  get progress(): number {
    if (this.completedSteps.size === 0) return 0
    if (this.failedStep) return (this.completedSteps.size / AUTH_STEPS.length) * 100

    const progress = (this.completedSteps.size / AUTH_STEPS.length) * 100
    return Math.min(progress, 100)
  }

  get isFullyInitialized(): boolean {
    return this.hasInitializedWallet && this.hasInitializedFirebase
  }

  // Lock methods
  acquireAuthLock = (walletAddress: string, requestId?: string): boolean => {
    if (this.authLock.isLocked) {
      console.log('🔒 Auth lock already held, skipping authentication')
      return false
    }

    this.authLock = {
      isLocked: true,
      walletAddress,
      startTime: Date.now(),
      requestId: requestId || null,
    }

    console.log('🔒 Auth lock acquired for:', walletAddress, requestId ? `(Request: ${requestId})` : '')
    return true
  }

  releaseAuthLock = (): void => {
    this.authLock = {
      isLocked: false,
      walletAddress: null,
      startTime: 0,
      requestId: null,
    }
    console.log('🔓 Auth lock released')
  }

  // Step management
  startStep = (step: AuthStep): void => {
    console.log(`📍 Starting step: ${step}`)
    this.currentStep = step
    this.failedStep = null
    this.error = null
  }

  completeStep = (step: AuthStep): void => {
    console.log(`✅ Completed step: ${step}`)
    this.completedSteps.add(step)

    // If this is the last step, clear current step
    if (step === 'firebase-auth') {
      this.currentStep = null
    }
  }

  failStep = (step: AuthStep, error: string): void => {
    console.log(`❌ Failed step: ${step} - ${error}`)
    this.currentStep = null
    this.failedStep = step
    this.error = error
  }

  // State setters
  setUser = (user: User | null): void => {
    this.user = user
  }

  setError = (error: string | null): void => {
    this.error = error
  }

  // Wallet state methods
  updateWalletState = (state: { isConnected: boolean; address?: string | null; chainId?: number | null; isConnecting?: boolean }): void => {
    const prevConnected = this.isWalletConnected

    this.isWalletConnected = state.isConnected
    this.walletAddress = state.address || null
    this.chainId = state.chainId || null
    this.isWalletConnecting = state.isConnecting || false

    // Log wallet state changes
    if (prevConnected !== state.isConnected) {
      if (state.isConnected && state.address) {
        console.log('✅ Wallet connected:', state.address)
      } else {
        console.log('❌ Wallet disconnected')
      }
    }
  }

  // Initialization methods
  initializeWalletState = (): void => {
    if (!this.hasInitializedWallet) {
      this.hasInitializedWallet = true
      console.log('🔄 Wallet state initialized')
    }
  }

  initializeFirebaseState = (): void => {
    if (!this.hasInitializedFirebase) {
      this.hasInitializedFirebase = true
      console.log('🔥 Firebase state initialized')
    }
  }

  // Reset methods
  reset = (): void => {
    this.releaseAuthLock()
    this.currentStep = null
    this.completedSteps.clear()
    this.failedStep = null
    this.user = null
    this.error = null
    // Don't reset wallet state - it's independent
  }

  resetProgress = (): void => {
    this.currentStep = null
    this.completedSteps.clear()
    this.failedStep = null
    this.error = null
  }

  resetWalletState = (): void => {
    this.isWalletConnected = false
    this.walletAddress = null
    this.chainId = null
    this.isWalletConnecting = false
    this.hasInitializedWallet = false
  }

  resetInitialization = (): void => {
    this.hasInitializedWallet = false
    this.hasInitializedFirebase = false
    console.log('🔄 Initialization state reset')
  }

  // Helper methods
  isAuthenticatingForWallet = (walletAddress: string): boolean => {
    return this.isAuthenticating && this.authLock.walletAddress?.toLowerCase() === walletAddress.toLowerCase()
  }

  getStepStatus = (step: AuthStep): 'completed' | 'current' | 'failed' | 'pending' => {
    if (this.failedStep === step) return 'failed'
    if (this.completedSteps.has(step)) return 'completed'
    if (this.currentStep === step) return 'current'
    return 'pending'
  }
}

// Singleton instance
export const authStore = new AuthStore()
