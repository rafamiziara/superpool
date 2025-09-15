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
