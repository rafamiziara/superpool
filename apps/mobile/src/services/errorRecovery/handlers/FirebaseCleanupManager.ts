import { signOut } from 'firebase/auth'
import { FIREBASE_AUTH } from '../../../firebase.config'

/**
 * Manages Firebase authentication cleanup operations
 * Handles sign-out operations triggered by authentication state changes
 */
export class FirebaseCleanupManager {
  /**
   * Handles Firebase authentication cleanup on state changes
   */
  static async handleFirebaseCleanup(reason: string): Promise<void> {
    try {
      console.log(`🔄 Initiating Firebase cleanup due to: ${reason}`)
      await signOut(FIREBASE_AUTH)
      console.log(`🚪 Signed out from Firebase due to ${reason}`)
    } catch (signOutError) {
      console.error('❌ Failed to sign out from Firebase:', signOutError)
      throw new Error(`Firebase cleanup failed: ${signOutError instanceof Error ? signOutError.message : String(signOutError)}`)
    }
  }

  /**
   * Checks if user is currently signed in to Firebase
   */
  static isUserSignedIn(): boolean {
    return FIREBASE_AUTH.currentUser !== null
  }

  /**
   * Gets current Firebase user ID for logging purposes
   */
  static getCurrentUserId(): string | null {
    return FIREBASE_AUTH.currentUser?.uid || null
  }
}