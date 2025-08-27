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

// Mobile app authentication workflow types
export type AuthStep = 'connect-wallet' | 'acquire-lock' | 'generate-message' | 'request-signature' | 'verify-signature' | 'firebase-auth'

export interface AuthStepInfo {
  step: AuthStep
  title: string
  description: string
}

export interface AuthProgressState {
  currentStep: AuthStep | null
  completedSteps: Set<AuthStep>
  failedStep: AuthStep | null
  isComplete: boolean
  error: string | null
}

// Firebase authentication state for mobile apps
export interface FirebaseAuthState {
  user: any | null // Firebase User object
  isLoading: boolean
  isAuthenticated: boolean
  walletAddress: string | null
}

// Signature and wallet interaction types
export type SignatureType = 'typed-data' | 'personal-sign' | 'safe-wallet'

export interface SignatureRequest extends AuthMessage {
  walletAddress: string
  chainId?: number
}

export interface SignatureResult {
  signature: string
  signatureType: SignatureType
}

export interface SignatureFunctions {
  signTypedDataAsync: (data: any) => Promise<string>
  signMessageAsync: (params: { message: string; account: `0x${string}`; connector?: any }) => Promise<string>
}

// Authentication flow progress types
export interface AuthProgressCallbacks {
  onStepStart?: (step: AuthStep) => void
  onStepComplete?: (step: AuthStep) => void
  onStepFail?: (step: AuthStep, error: string) => void
}

export interface AuthenticationContext {
  walletAddress: string
  connector?: any
  chainId?: number
  signatureFunctions: SignatureFunctions
  disconnect: () => void
  progressCallbacks?: AuthProgressCallbacks
}

// Error recovery types
export type ErrorType = 'session' | 'timeout' | 'connector' | 'generic'

export interface ErrorRecoveryResult {
  shouldDisconnect: boolean
  shouldShowError: boolean
  errorDelay: number
  cleanupPerformed: boolean
}

export interface SessionErrorContext {
  errorMessage: string
  sessionId?: string
  isSessionError: boolean
}
