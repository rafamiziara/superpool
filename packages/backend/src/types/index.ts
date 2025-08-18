/* istanbul ignore file */

/**
 * Interface for a user's profile document stored in Firestore.
 */
export interface UserProfile {
  walletAddress: string
  createdAt: number
  updatedAt: number
}

/**
 * Interface for the nonce object stored in Firestore.
 */
export interface AuthNonce {
  nonce: string
  timestamp: number
  expiresAt: number
}

export interface ApprovedDevice {
  deviceId: string
  walletAddress: string
  approvedAt: number
  platform: 'android' | 'ios' | 'web'
  lastUsed: number
}
