import type { User } from '@superpool/types'
import { router } from 'expo-router'
import { signOut } from 'firebase/auth'
import { makeAutoObservable, reaction } from 'mobx'
import Toast from 'react-native-toast-message'
import { FIREBASE_AUTH } from '../config/firebase'
import { logger } from '../utils/logger'
import { authStore } from './AuthStore'

export type AppRoute = '/onboarding' | '/connecting' | '/(auth)/dashboard'

interface NavigationState {
  user: { walletAddress: string } | null
  isAuthenticating: boolean
  isWalletConnected: boolean
  walletAddress: string | null
  isFullyInitialized: boolean
}

/**
 * Where a given auth state belongs, with the reason for the log line. A null
 * route means the answer is not yet knowable — still initializing, or an
 * authentication in flight that will decide it shortly.
 *
 * Priority: no wallet → onboarding; wallet but no user → connecting; both →
 * dashboard.
 */
function resolveRoute(state: NavigationState): { route: AppRoute | null; reason: string } {
  if (!state.isFullyInitialized) return { route: null, reason: 'waiting for initialization' }

  if (state.isAuthenticating) return { route: null, reason: 'auth in progress' }

  if (!state.isWalletConnected) return { route: '/onboarding', reason: 'wallet disconnected' }

  if (!state.user) return { route: '/connecting', reason: 'wallet connected, needs authentication' }

  return { route: '/(auth)/dashboard', reason: `wallet connected and user authenticated: ${state.walletAddress}` }
}

export class NavigationStore {
  // Current state tracking
  private hasInitialized = false

  constructor() {
    makeAutoObservable(this)

    // Set up reactive navigation after stores are ready
    setTimeout(() => this.initializeReactiveNavigation(), 100)
  }

  private initializeReactiveNavigation() {
    // React to auth and wallet state changes from AuthStore
    reaction(
      () => ({
        user: authStore.user,
        isAuthenticating: authStore.isAuthenticating,
        isWalletConnected: authStore.isWalletConnected,
        walletAddress: authStore.walletAddress,
        isFullyInitialized: authStore.isFullyInitialized,
      }),
      (currentState, previousState) => {
        logger.debug('🧭 NavigationStore: State changed', {
          hasUser: !!currentState.user,
          userWallet: currentState.user?.walletAddress,
          isAuthenticating: currentState.isAuthenticating,
          wasAuthenticating: previousState?.isAuthenticating,
          walletConnected: currentState.isWalletConnected,
          walletAddress: currentState.walletAddress,
          isFullyInitialized: currentState.isFullyInitialized,
        })

        // Navigate based on current state
        this.navigateBasedOnCurrentState(currentState)

        // Handle toast notifications
        this.handleToastNotifications(currentState, previousState)

        // Handle wallet disconnection if needed
        this.handleWalletStateChanges(currentState, previousState)
      },
      { fireImmediately: true }
    )

    logger.debug('🧭 NavigationStore: Reactive navigation initialized')
  }

  /**
   * The route the current state calls for, or null while it cannot be decided.
   *
   * Exposed because a screen change is not always preceded by a state change:
   * the wallet returns to the app through a bare `superpool://` deep link,
   * which lands on `/` with the wallet still connected and the user still
   * authenticated. The reaction below only fires on change, so the index screen
   * would sit there forever unless it can ask where it should be.
   */
  get targetRoute(): AppRoute | null {
    return resolveRoute({
      user: authStore.user,
      isAuthenticating: authStore.isAuthenticating,
      isWalletConnected: authStore.isWalletConnected,
      walletAddress: authStore.walletAddress,
      isFullyInitialized: authStore.isFullyInitialized,
    }).route
  }

  private navigateBasedOnCurrentState(currentState: NavigationState) {
    const { route: targetRoute, reason } = resolveRoute(currentState)

    if (!targetRoute) {
      // Wait for both wallet and Firebase to initialize before making navigation decisions
      if (!currentState.isFullyInitialized) {
        logger.debug('🧭 NavigationStore: Waiting for initialization...', {
          walletInit: authStore.hasInitializedWallet,
          firebaseInit: authStore.hasInitializedFirebase,
        })
      } else {
        logger.debug('🧭 NavigationStore: Skipping navigation - auth in progress')
      }
      return
    }

    logger.debug(`🧭 NavigationStore: Navigating to ${targetRoute} - ${reason}`)

    // Navigate with a small delay to ensure state updates complete
    setTimeout(() => {
      try {
        router.replace(targetRoute)
      } catch (error) {
        logger.error('❌ NavigationStore: Navigation failed:', error)
      }
    }, 50)
  }

  private handleToastNotifications(
    currentState: { user: User | null; isAuthenticating: boolean },
    previousState: { user: User | null; isAuthenticating: boolean } | undefined
  ) {
    // Skip toasts on initial render
    if (!previousState || !this.hasInitialized) {
      this.hasInitialized = true
      return
    }

    // Toast: Authentication successful
    if (!previousState.user && currentState.user) {
      logger.debug('🎉 NavigationStore: Authentication successful')

      // Show toast notification
      Toast.show({
        type: 'info',
        text1: 'Authentication Successful!',
        text2: 'Welcome to SuperPool 🎉',
        topOffset: 60,
      })
    }
  }

  // Handle wallet state changes from AuthStore reaction
  private handleWalletStateChanges(
    currentState: { isWalletConnected: boolean; walletAddress: string | null },
    previousState: { isWalletConnected: boolean; walletAddress: string | null } | undefined
  ) {
    if (!previousState) return

    const wasConnected = previousState.isWalletConnected
    const isConnected = currentState.isWalletConnected

    // Handle wallet disconnection
    if (wasConnected && !isConnected) {
      this.handleWalletDisconnection()
    }
    // Handle wallet connection
    else if (!wasConnected && isConnected) {
      this.handleWalletConnection()
    }
  }

  private async handleWalletDisconnection() {
    logger.debug('🔌 NavigationStore: Handling wallet disconnection')

    // Reset auth store (but not wallet state - that's already updated)
    authStore.reset()

    // Sign out from Firebase if user is signed in
    try {
      if (FIREBASE_AUTH.currentUser) {
        await signOut(FIREBASE_AUTH)
        logger.debug('✅ NavigationStore: Firebase user signed out')
      }
    } catch (error) {
      logger.error('❌ NavigationStore: Firebase signout failed:', error)
    }

    // Show toast notification
    Toast.show({
      type: 'info',
      text1: 'Wallet Disconnected',
      text2: 'You have been logged out',
      topOffset: 60,
    })
  }

  private handleWalletConnection() {
    logger.debug('🔗 NavigationStore: Handling wallet connection')

    // Show toast notification
    Toast.show({
      type: 'success',
      text1: 'Wallet Connected!',
      text2: 'Starting authentication...',
      topOffset: 60,
    })
  }
}

// Singleton instance
export const navigationStore = new NavigationStore()
