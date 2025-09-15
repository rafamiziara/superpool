// Authentication and user management types

// Unified User type (backend and frontend use same structure)
export interface User {
  walletAddress: string
  createdAt: number // timestamp in milliseconds
  updatedAt: number // timestamp in milliseconds
  deviceId?: string // optional since mobile doesn't always have it
}

// Backend AuthNonce (stored in Firestore with number timestamps)
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
  deviceInfo?: DeviceInfo
}

export interface DeviceInfo {
  platform: string
  userAgent?: string
  appVersion?: string
}

export interface AuthMessage {
  message: string
  nonce: string
  timestamp: number
}

// Shared authentication data type (replaces mobile-specific AuthData)
export interface AuthenticationData {
  message: string
  nonce: string
  timestamp: number
  signature: string
  walletAddress: string
  deviceId?: string
  platform?: 'android' | 'ios' | 'web'
  chainId?: number
  signatureType?: 'typed-data' | 'personal-sign' | 'safe-wallet'
}

// Backend Cloud Function Request/Response Types

export interface CustomAppCheckMinterRequest {
  deviceId: string
}

export interface CustomAppCheckMinterResponse {
  appCheckToken: string
  expireTimeMillis: number
}

export interface AuthMessageRequest {
  walletAddress: string
}

export interface AuthMessageResponse {
  message: string
  nonce: string
  timestamp: number
}

export interface VerifySignatureAndLoginRequest {
  walletAddress: string
  signature: string
  deviceId?: string
  platform?: 'android' | 'ios' | 'web'
  chainId?: number
  signatureType?: 'typed-data' | 'personal-sign' | 'safe-wallet'
}

export interface VerifySignatureAndLoginResponse {
  firebaseToken: string
  user: User // Return the actual user data from backend
}
