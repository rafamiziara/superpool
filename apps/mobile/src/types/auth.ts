import { AuthenticationData, AuthMessage, User } from '@superpool/types'

export interface MessageGenerationState {
  message: string | null
  nonce: string | null
  timestamp: number | null
  isGenerating: boolean
  error: string | null
}

export interface MessageGenerationHook extends MessageGenerationState {
  generateMessage: (walletAddress: string) => Promise<AuthMessage>
  clearState: () => void
}

export interface SignatureHandlingState {
  signature: string | null
  error: string | null
  isSigning: boolean
}

export interface SignatureHandlingHook extends SignatureHandlingState {
  requestSignature: (message: string) => Promise<string>
  clearSignature: () => void
}

export interface FirebaseAuthState {
  user: User | null
  isAuthenticating: boolean
  error: string | null
}

export interface FirebaseAuthHook extends FirebaseAuthState {
  authenticateWithSignature: (authData: AuthenticationData) => Promise<User>
  logout: () => Promise<void>
  clearError: () => void
}

export interface AutoAuthState {
  isAuthenticating: boolean
  error: string | null
  progress: number // 0-100
}

export interface AutoAuthHook extends AutoAuthState {
  // Wallet state
  isConnected: boolean
  address: string | null
  chainId: number | null

  // User state
  user: User | null

  // Computed states
  isFullyAuthenticated: boolean
  needsAuthentication: boolean

  // Actions
  retryAuthentication: () => Promise<void>
}
