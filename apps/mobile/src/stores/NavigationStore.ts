import type { User } from '@superpool/types'
import { router } from 'expo-router'
import { signOut } from 'firebase/auth'
import { shallow } from 'zustand/shallow'
import { FIREBASE_AUTH } from '../config/firebase'
import { logger } from '../utils/logger'
import { type AuthState, authStore, selectIsAuthenticating, selectIsFullyInitialized, useAuthStore } from './AuthStore'

export type AppRoute = '/onboarding' | '/connecting' | '/(auth)/dashboard'

interface NavigationState {
  user: User | null
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

/** The slice of auth state navigation depends on, and nothing more. */
const selectNavigationState = (state: AuthState): NavigationState => ({
  user: state.user,
  isAuthenticating: selectIsAuthenticating(state),
  isWalletConnected: state.isWalletConnected,
  walletAddress: state.walletAddress,
  isFullyInitialized: selectIsFullyInitialized(state),
})

/**
 * The route the current auth state calls for, or null while it cannot be
 * decided.
 *
 * This is a selector rather than a getter on the store because that is the only
 * way a component can subscribe to it. MobX used to trace the reads inside the
 * getter and subscribe the `observer` to each one; Zustand subscribes to what
 * the selector returns, so the dependency has to be written down.
 */
export const selectTargetRoute = (state: AuthState): AppRoute | null => resolveRoute(selectNavigationState(state)).route

/** `selectTargetRoute`, bound to the singleton, for components. */
export const useTargetRoute = (): AppRoute | null => useAuthStore(selectTargetRoute)

export class NavigationStore {
  // Current state tracking
  private hasInitialized = false

  /**
   * The last route this store sent the user to.
   *
   * Not "where the user is" — expo-router only exposes that through hooks, and
   * this is a store. It is enough for the one thing it guards: not replacing a
   * route with itself. `index.tsx` redirects declaratively without going
   * through here, so this can be stale after a deep link; the cost of that is
   * one redundant replace, never a missed navigation.
   */
  private lastRoute: AppRoute | null = null

  private unsubscribe: (() => void) | null = null

  private disposed = false

  constructor() {
    // Set up reactive navigation after stores are ready
    setTimeout(() => this.initializeReactiveNavigation(), 100)
  }

  private initializeReactiveNavigation() {
    // The constructor's timer can outlive a `dispose()`, and subscribing then
    // would leave a listener nothing holds a handle to.
    if (this.disposed) return

    /*
      MobX's `reaction` passed `undefined` as the previous value on the
      `fireImmediately` call; Zustand passes the current value as its own
      previous. Both `handleAuthTransition` and `handleWalletStateChanges` test
      `!previousState` to recognise that first call, so the distinction is
      preserved here rather than in each of them.
    */
    let isFirstFire = true

    this.unsubscribe = authStore.subscribe(
      selectNavigationState,
      (currentState, previousState) => {
        const previous = isFirstFire ? undefined : previousState
        isFirstFire = false

        logger.debug('🧭 NavigationStore: State changed', {
          hasUser: !!currentState.user,
          userWallet: currentState.user?.walletAddress,
          isAuthenticating: currentState.isAuthenticating,
          wasAuthenticating: previous?.isAuthenticating,
          walletConnected: currentState.isWalletConnected,
          walletAddress: currentState.walletAddress,
          isFullyInitialized: currentState.isFullyInitialized,
        })

        // Navigate based on current state
        this.navigateBasedOnCurrentState(currentState)

        // Note the authentication transition (logged, never toasted)
        this.handleAuthTransition(currentState, previous)

        // Handle wallet disconnection if needed
        this.handleWalletStateChanges(currentState, previous)
      },
      // Without this the selector's fresh object would differ every time and
      // the listener would run on changes it does not care about, such as
      // `chainId`.
      { equalityFn: shallow, fireImmediately: true }
    )

    logger.debug('🧭 NavigationStore: Reactive navigation initialized')
  }

  /** Stop reacting. Exists for tests and for symmetry with the subscription. */
  dispose() {
    this.disposed = true
    this.unsubscribe?.()
    this.unsubscribe = null
  }

  /**
   * The route the current state calls for, or null while it cannot be decided.
   *
   * Exposed because a screen change is not always preceded by a state change:
   * the wallet returns to the app through a bare `superpool://` deep link,
   * which lands on `/` with the wallet still connected and the user still
   * authenticated. The subscription below only fires on change, so the index
   * screen would sit there forever unless it can ask where it should be.
   *
   * Components should use `useTargetRoute`, which subscribes; this reads once.
   */
  get targetRoute(): AppRoute | null {
    return selectTargetRoute(authStore.getState())
  }

  private navigateBasedOnCurrentState(currentState: NavigationState) {
    const { route: targetRoute, reason } = resolveRoute(currentState)

    if (!targetRoute) {
      // Wait for both wallet and Firebase to initialize before making navigation decisions
      if (!currentState.isFullyInitialized) {
        const { hasInitializedWallet, hasInitializedFirebase } = authStore.getState()
        logger.debug('🧭 NavigationStore: Waiting for initialization...', {
          walletInit: hasInitializedWallet,
          firebaseInit: hasInitializedFirebase,
        })
      } else {
        logger.debug('🧭 NavigationStore: Skipping navigation - auth in progress')
      }
      return
    }

    /*
      Never replace a route with itself.

      `router.replace` re-mounts the screen, so sending the user to where they
      already are is a visible flicker rather than a no-op — and the
      subscription fires more often than the route actually changes. Closing
      the AppKit modal is one such moment: it flips wagmi's `isConnecting`,
      which runs `WalletListener`'s effect and rewrites the wallet state this
      subscription watches.

      It also stops the store dragging someone off a sub-screen. Standing on
      `pool/[id]`, an unrelated state change still resolves to
      `/(auth)/dashboard` — which was correct as a *destination* and wrong as
      an instruction.
    */
    if (targetRoute === this.lastRoute) {
      logger.debug(`🧭 NavigationStore: Already at ${targetRoute}, not replacing it`)
      return
    }

    logger.debug(`🧭 NavigationStore: Navigating to ${targetRoute} - ${reason}`)

    // Claimed before the timer, so two fires in the same tick cannot both queue.
    this.lastRoute = targetRoute

    // Navigate with a small delay to ensure state updates complete
    setTimeout(() => {
      try {
        router.replace(targetRoute)
      } catch (error) {
        // Give the claim back, or a failed navigation is never retried.
        this.lastRoute = null
        logger.error('❌ NavigationStore: Navigation failed:', error)
      }
    }, 50)
  }

  /**
   * Notice the moment authentication succeeds, and log it.
   *
   * **No toast.** Connecting, authenticating and being logged out are all
   * announced by the screen the user lands on — `connecting` narrates itself
   * step by step, the dashboard is what being signed in looks like, and
   * `onboarding` is what being signed out looks like. A toast on top of any of
   * them restated a navigation the user was already watching.
   *
   * The transition is still worth a line in the log: it is the boundary
   * everything else in this store keys off, and it is the first thing to check
   * when a session ends up on the wrong screen.
   */
  private handleAuthTransition(
    currentState: { user: User | null; isAuthenticating: boolean },
    previousState: { user: User | null; isAuthenticating: boolean } | undefined
  ) {
    // The first fire is immediate, so it is not a transition.
    if (!previousState || !this.hasInitialized) {
      this.hasInitialized = true
      return
    }

    if (!previousState.user && currentState.user) {
      logger.debug('🎉 NavigationStore: Authentication successful')
    }
  }

  /**
   * Handle wallet state changes from the AuthStore subscription.
   *
   * **Connecting and disconnecting are announced by the screen change, not by a
   * toast.** Both are acts the user just performed, and both move them
   * immediately — connect lands on `connecting`, which says what is happening
   * step by step; disconnect lands on `onboarding`, which is what being logged
   * out looks like. A toast on top of either restated the navigation the user
   * was already watching.
   *
   * Authentication succeeding is silent for the same reason — see
   * `handleAuthTransition`. This store raises no toasts at all; the only ones
   * left in the app come from `NotificationListener`, where they carry news the
   * user could not otherwise have seen.
   */
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
    authStore.getState().reset()

    // Sign out from Firebase if user is signed in
    try {
      if (FIREBASE_AUTH.currentUser) {
        await signOut(FIREBASE_AUTH)
        logger.debug('✅ NavigationStore: Firebase user signed out')
      }
    } catch (error) {
      logger.error('❌ NavigationStore: Firebase signout failed:', error)
    }
  }

  private handleWalletConnection() {
    logger.debug('🔗 NavigationStore: Handling wallet connection')
  }
}

// Singleton instance
export const navigationStore = new NavigationStore()
