import { useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { FIREBASE_AUTH } from '../config/firebase'
import { authStore } from '../stores/AuthStore'

/**
 * Firebase initialization component.
 * Handles Firebase auth state listening and initialization tracking.
 * Should be mounted once at the root level.
 */
export function FirebaseInitializer() {
  useEffect(() => {
    // Wait for Firebase to determine initial auth state before marking as initialized
    FIREBASE_AUTH.authStateReady().then(() => {
      console.log('🔥 Firebase auth state ready - marking as initialized')
      authStore.initializeFirebaseState()
    })

    // Set up listener for ongoing auth state changes
    const unsubscribe = onAuthStateChanged(FIREBASE_AUTH, (firebaseUser) => {
      if (firebaseUser) {
        console.log('🔥 Firebase auth state: User authenticated', firebaseUser.uid)

        // Check if we already have user data in AuthStore
        const existingUser = authStore.user
        if (existingUser && existingUser.walletAddress === firebaseUser.uid) {
          // User data already exists and matches - keep existing data
          console.log('🔥 Using existing user data from AuthStore')
        } else {
          // Create basic user from Firebase uid (wallet address)
          const basicUser = {
            walletAddress: firebaseUser.uid,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            deviceId: '',
          }
          authStore.setUser(basicUser)
          console.log('🔥 Set basic user from Firebase:', firebaseUser.uid)
        }
      } else {
        // No Firebase user - clear user state
        authStore.setUser(null)
        console.log('🔥 Firebase auth state: User not authenticated')
      }
    })

    return unsubscribe
  }, [])

  // This component renders nothing - it's just for side effects
  return null
}
