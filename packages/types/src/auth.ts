// Authentication and user management types

export interface User {
  walletAddress: string
  deviceId: string
  createdAt: Date
  lastLoginAt: Date
  profile?: UserProfile
}

export interface UserProfile {
  displayName?: string
  avatar?: string
  bio?: string
}

export interface AuthNonce {
  nonce: string
  walletAddress: string
  timestamp: Date
  expiresAt: Date
}

export interface ApprovedDevice {
  deviceId: string
  walletAddress: string
  approvedAt: Date
  lastActiveAt: Date
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

export interface SignatureVerification {
  signature: string
  message: string
  walletAddress: string
}
