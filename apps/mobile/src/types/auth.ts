import { AuthMessage } from '@superpool/types'

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
