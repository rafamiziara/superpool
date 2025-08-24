import { useEffect, useState } from 'react'
import { firebaseAuthManager, FirebaseAuthState } from '../utils/firebaseAuthManager'

/**
 * Hook to manage Firebase authentication state with proper persistence
 * Uses singleton auth manager to prevent multiple Firebase listeners
 */
export const useFirebaseAuth = (): FirebaseAuthState => {
  const [state, setState] = useState<FirebaseAuthState>(firebaseAuthManager.getCurrentState())

  useEffect(() => {
    // Subscribe to auth state changes through the manager
    const unsubscribe = firebaseAuthManager.addListener((newState) => {
      setState(newState)
    })

    // Cleanup subscription on unmount
    return unsubscribe
  }, [])

  return state
}

// Re-export the interface for convenience
export type { FirebaseAuthState }
