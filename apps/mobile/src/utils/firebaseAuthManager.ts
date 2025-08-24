import { User, onAuthStateChanged } from 'firebase/auth'
import { FIREBASE_AUTH } from '../firebase.config'

export interface FirebaseAuthState {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  walletAddress: string | null
}

type Listener = (state: FirebaseAuthState) => void

/**
 * Singleton Firebase authentication manager
 * Ensures only one Firebase auth listener exists globally
 */
class FirebaseAuthManager {
  private listeners: Set<Listener> = new Set()
  private currentState: FirebaseAuthState = {
    user: null,
    isLoading: true,
    isAuthenticated: false,
    walletAddress: null,
  }
  private unsubscribe: (() => void) | null = null
  private isInitialized = false

  /**
   * Initialize the Firebase auth listener (only once globally)
   */
  private initialize(): void {
    if (this.isInitialized) {
      return
    }

    console.log('🔥 Initializing global Firebase auth manager...')

    this.unsubscribe = onAuthStateChanged(FIREBASE_AUTH, (user) => {
      console.log('🔥 Firebase auth state changed:', {
        uid: user?.uid,
        isAuthenticated: !!user,
      })

      this.currentState = {
        user,
        isLoading: false,
        isAuthenticated: !!user,
        walletAddress: user?.uid.startsWith('0x') ? user.uid : null,
      }

      // Notify all listeners
      this.listeners.forEach((listener) => {
        listener(this.currentState)
      })
    })

    this.isInitialized = true
  }

  /**
   * Add a listener for auth state changes
   */
  addListener(listener: Listener): () => void {
    this.initialize() // Ensure initialized when first listener is added

    this.listeners.add(listener)

    // Immediately call with current state
    listener(this.currentState)

    // Return cleanup function
    return () => {
      this.listeners.delete(listener)

      // If no more listeners, we could clean up, but keeping it running
      // for stability across component mounts/unmounts
    }
  }

  /**
   * Get current auth state synchronously
   */
  getCurrentState(): FirebaseAuthState {
    return this.currentState
  }

  /**
   * Clean up (only call on app termination)
   */
  cleanup(): void {
    if (this.unsubscribe) {
      console.log('🧹 Cleaning up global Firebase auth manager')
      this.unsubscribe()
      this.unsubscribe = null
      this.isInitialized = false
      this.listeners.clear()
    }
  }
}

// Export singleton instance
export const firebaseAuthManager = new FirebaseAuthManager()
