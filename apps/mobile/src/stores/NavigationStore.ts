import { makeAutoObservable, reaction } from 'mobx'
import { router } from 'expo-router'
import { signOut } from 'firebase/auth'
import Toast from 'react-native-toast-message'
import { authStore } from './AuthStore'
import { FIREBASE_AUTH } from '../config/firebase'
import type { User } from '@superpool/types'

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
        console.log('🧭 NavigationStore: State changed', {
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

    console.log('🧭 NavigationStore: Reactive navigation initialized')
  }

  private navigateBasedOnCurrentState(currentState: {
    user: { walletAddress: string } | null
    isAuthenticating: boolean
    isWalletConnected: boolean
    walletAddress: string | null
    isFullyInitialized: boolean
  }) {
    // Wait for both wallet and Firebase to initialize before making navigation decisions
    if (!currentState.isFullyInitialized) {
      console.log('🧭 NavigationStore: Waiting for initialization...', {
        walletInit: authStore.hasInitializedWallet,
        firebaseInit: authStore.hasInitializedFirebase,
      })
      return
    }

    // Don't navigate while authentication is in progress
    if (currentState.isAuthenticating) {
      console.log('🧭 NavigationStore: Skipping navigation - auth in progress')
      return
    }

    // Navigation priority logic:
    // 1. No wallet connected → onboarding
    // 2. Wallet connected + no user → connecting
    // 3. Wallet connected + user exists → dashboard

    let targetRoute: string
    let reason: string

    if (!currentState.isWalletConnected) {
      // No wallet connected → onboarding
      targetRoute = '/onboarding'
      reason = 'wallet disconnected'
    } else if (!currentState.user) {
      // Wallet connected but no authenticated user → connecting
      targetRoute = '/connecting'
      reason = 'wallet connected, needs authentication'
    } else {
      // Wallet connected and user authenticated → dashboard
      targetRoute = '/(auth)/dashboard'
      reason = `wallet connected and user authenticated: ${currentState.walletAddress}`
    }

    console.log(`🧭 NavigationStore: Navigating to ${targetRoute} - ${reason}`)

    // Navigate with a small delay to ensure state updates complete
    setTimeout(() => {
      try {
        router.replace(targetRoute as '/onboarding' | '/connecting' | '/(auth)/dashboard')
      } catch (error) {
        console.error('❌ NavigationStore: Navigation failed:', error)
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
      console.log('🎉 NavigationStore: Authentication successful')
      Toast.show({
        type: 'success',
        text1: 'Authentication Successful!',
        text2: 'Welcome to SuperPool',
        position: 'top',
        visibilityTime: 3000,
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
    console.log('🔌 NavigationStore: Handling wallet disconnection')

    // Reset auth store (but not wallet state - that's already updated)
    authStore.reset()

    // Sign out from Firebase if user is signed in
    try {
      if (FIREBASE_AUTH.currentUser) {
        await signOut(FIREBASE_AUTH)
        console.log('✅ NavigationStore: Firebase user signed out')
      }
    } catch (error) {
      console.error('❌ NavigationStore: Firebase signout failed:', error)
    }

    // Show toast notification
    Toast.show({
      type: 'info',
      text1: 'Wallet Disconnected',
      text2: 'You have been logged out',
      position: 'top',
      visibilityTime: 3000,
      topOffset: 60,
    })
  }

  private handleWalletConnection() {
    console.log('🔗 NavigationStore: Handling wallet connection')

    // Show toast notification
    Toast.show({
      type: 'success',
      text1: 'Wallet Connected!',
      text2: 'Starting authentication...',
      position: 'top',
      visibilityTime: 3000,
      topOffset: 60,
    })
  }
}

// Singleton instance
export const navigationStore = new NavigationStore()
