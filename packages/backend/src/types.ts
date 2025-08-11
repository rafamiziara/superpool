/**
 * Interface for a user's profile document stored in Firestore.
 */
export interface UserProfile {
  walletAddress: string
  createdAt: number
  updatedAt: number
}
