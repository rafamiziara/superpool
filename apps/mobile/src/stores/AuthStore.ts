import type { User } from '@superpool/types'
import { useStore } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { createStore, type Mutate, type StoreApi } from 'zustand/vanilla'
import { AUTH_STEPS } from '../constants/authSteps'
import type { AuthStep } from '../types/auth'
import { sameAddress } from '../utils/format'
import { logger } from '../utils/logger'

export interface AuthLock {
  isLocked: boolean
  walletAddress: string | null
  startTime: number
  requestId: string | null
}

export interface AuthState {
  // Lock mechanism
  authLock: AuthLock

  // Step-based progress tracking
  currentStep: AuthStep | null
  completedSteps: Set<AuthStep>
  failedStep: AuthStep | null

  // Auth state
  user: User | null
  error: string | null

  // Wallet state
  isWalletConnected: boolean
  walletAddress: string | null
  chainId: number | null
  isWalletConnecting: boolean

  // Initialization tracking
  hasInitializedWallet: boolean
  hasInitializedFirebase: boolean
}

export interface AuthActions {
  acquireAuthLock: (walletAddress: string, requestId?: string) => boolean
  releaseAuthLock: () => void
  startStep: (step: AuthStep) => void
  completeStep: (step: AuthStep) => void
  failStep: (step: AuthStep, error: string) => void
  setUser: (user: User | null) => void
  setError: (error: string | null) => void
  updateWalletState: (state: { isConnected: boolean; address?: string | null; chainId?: number | null; isConnecting?: boolean }) => void
  initializeWalletState: () => void
  initializeFirebaseState: () => void
  reset: () => void
  resetProgress: () => void
  resetWalletState: () => void
  resetInitialization: () => void
  isAuthenticatingForWallet: (walletAddress: string) => boolean
  getStepStatus: (step: AuthStep) => StepStatus
}

export type AuthStoreState = AuthState & AuthActions

const UNLOCKED: AuthLock = {
  isLocked: false,
  walletAddress: null,
  startTime: 0,
  requestId: null,
}

const initialState = (): AuthState => ({
  authLock: { ...UNLOCKED },
  currentStep: null,
  completedSteps: new Set<AuthStep>(),
  failedStep: null,
  user: null,
  error: null,
  isWalletConnected: false,
  walletAddress: null,
  chainId: null,
  isWalletConnecting: false,
  hasInitializedWallet: false,
  hasInitializedFirebase: false,
})

/*
  Derived values are selectors, not fields.

  Under MobX these were getters, and reading one inside an `observer` subscribed
  the component to everything the getter touched. Zustand has no such tracing —
  a component is subscribed to exactly what its selector returns — so each of
  these has to be applied explicitly at the point of use.
*/
export const selectIsAuthenticating = (state: AuthState): boolean => state.authLock.isLocked

export const selectProgress = (state: AuthState): number => {
  if (state.completedSteps.size === 0) return 0
  if (state.failedStep) return (state.completedSteps.size / AUTH_STEPS.length) * 100

  return Math.min((state.completedSteps.size / AUTH_STEPS.length) * 100, 100)
}

export const selectIsFullyInitialized = (state: AuthState): boolean => state.hasInitializedWallet && state.hasInitializedFirebase

export type StepStatus = 'completed' | 'current' | 'failed' | 'pending'

/** The three fields a step's status is made of, and nothing else. */
export type StepProgress = Pick<AuthState, 'currentStep' | 'failedStep' | 'completedSteps'>

export const selectStepStatus = (state: StepProgress, step: AuthStep): StepStatus => {
  if (state.failedStep === step) return 'failed'
  if (state.completedSteps.has(step)) return 'completed'
  if (state.currentStep === step) return 'current'
  return 'pending'
}

/**
 * The store's own type, carrying the selector-aware `subscribe` that
 * `subscribeWithSelector` adds. Annotating this as a plain `StoreApi` silently
 * erases that overload, and every `subscribe(selector, listener, options)` call
 * stops compiling.
 */
export type AuthStoreApi = Mutate<StoreApi<AuthStoreState>, [['zustand/subscribeWithSelector', never]]>

/**
 * A fresh, independent auth store.
 *
 * Exported because the tests want isolation per case, which `new AuthStore()`
 * used to give them for free.
 */
export const createAuthStore = (): AuthStoreApi =>
  createStore<AuthStoreState>()(
    subscribeWithSelector((set, get) => ({
      ...initialState(),

      // Lock methods
      acquireAuthLock: (walletAddress, requestId) => {
        if (get().authLock.isLocked) {
          logger.debug('🔒 Auth lock already held, skipping authentication')
          return false
        }

        set({
          authLock: {
            isLocked: true,
            walletAddress,
            startTime: Date.now(),
            requestId: requestId || null,
          },
        })

        logger.debug('🔒 Auth lock acquired for:', walletAddress, requestId ? `(Request: ${requestId})` : '')
        return true
      },

      releaseAuthLock: () => {
        set({ authLock: { ...UNLOCKED } })
        logger.debug('🔓 Auth lock released')
      },

      // Step management
      startStep: (step) => {
        logger.debug(`📍 Starting step: ${step}`)
        set({ currentStep: step, failedStep: null, error: null })
      },

      completeStep: (step) => {
        logger.debug(`✅ Completed step: ${step}`)

        // A new Set, not a mutated one: Zustand compares references.
        const completedSteps = new Set(get().completedSteps).add(step)

        // If this is the last step, clear current step
        set(step === 'firebase-auth' ? { completedSteps, currentStep: null } : { completedSteps })
      },

      failStep: (step, error) => {
        logger.debug(`❌ Failed step: ${step} - ${error}`)
        set({ currentStep: null, failedStep: step, error })
      },

      // State setters
      setUser: (user) => set({ user }),

      setError: (error) => set({ error }),

      // Wallet state methods
      updateWalletState: (state) => {
        const prevConnected = get().isWalletConnected

        set({
          isWalletConnected: state.isConnected,
          walletAddress: state.address || null,
          chainId: state.chainId || null,
          isWalletConnecting: state.isConnecting || false,
        })

        // Log wallet state changes
        if (prevConnected !== state.isConnected) {
          if (state.isConnected && state.address) {
            logger.debug('✅ Wallet connected:', state.address)
          } else {
            logger.debug('❌ Wallet disconnected')
          }
        }
      },

      // Initialization methods
      initializeWalletState: () => {
        if (!get().hasInitializedWallet) {
          set({ hasInitializedWallet: true })
          logger.debug('🔄 Wallet state initialized')
        }
      },

      initializeFirebaseState: () => {
        if (!get().hasInitializedFirebase) {
          set({ hasInitializedFirebase: true })
          logger.debug('🔥 Firebase state initialized')
        }
      },

      // Reset methods
      reset: () => {
        get().releaseAuthLock()
        set({
          currentStep: null,
          completedSteps: new Set<AuthStep>(),
          failedStep: null,
          user: null,
          error: null,
          // Don't reset wallet state - it's independent
        })
      },

      resetProgress: () => {
        set({
          currentStep: null,
          completedSteps: new Set<AuthStep>(),
          failedStep: null,
          error: null,
        })
      },

      resetWalletState: () => {
        set({
          isWalletConnected: false,
          walletAddress: null,
          chainId: null,
          isWalletConnecting: false,
          hasInitializedWallet: false,
        })
      },

      resetInitialization: () => {
        set({ hasInitializedWallet: false, hasInitializedFirebase: false })
        logger.debug('🔄 Initialization state reset')
      },

      // Helper methods
      isAuthenticatingForWallet: (walletAddress) => {
        const state = get()
        return selectIsAuthenticating(state) && sameAddress(state.authLock.walletAddress, walletAddress)
      },

      getStepStatus: (step) => selectStepStatus(get(), step),
    }))
  )

// Singleton instance
export const authStore = createAuthStore()

/** Subscribe a component to exactly what `selector` returns. */
export function useAuthStore<T>(selector: (state: AuthStoreState) => T): T {
  return useStore(authStore, selector)
}
