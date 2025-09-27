import { AuthMessage } from '@superpool/types'
import type { AuthMessageResponse } from '@superpool/types'
import { httpsCallable } from 'firebase/functions'
import { useCallback, useState } from 'react'
import { FIREBASE_FUNCTIONS } from '../../config/firebase'
import { MessageGenerationHook, MessageGenerationState } from '../../types/auth'

export const useMessageGeneration = (): MessageGenerationHook => {
  const [state, setState] = useState<MessageGenerationState>({
    message: null,
    nonce: null,
    timestamp: null,
    isGenerating: false,
    error: null,
  })

  const generateMessage = useCallback(async (walletAddress: string): Promise<AuthMessage> => {
    try {
      if (!walletAddress) {
        throw new Error('Wallet address is required')
      }

      setState((s) => ({ ...s, isGenerating: true, error: null }))

      console.log('🔄 Generating auth message for:', walletAddress)

      const generateAuthMessage = httpsCallable(FIREBASE_FUNCTIONS, 'generateAuthMessage')
      const response = await generateAuthMessage({ walletAddress })

      if (!response.data) {
        throw new Error('Invalid response from generateAuthMessage function')
      }

      const { message, nonce, timestamp } = response.data as AuthMessageResponse

      if (!message || !nonce || timestamp === undefined || timestamp === null) {
        throw new Error('Incomplete auth message data received')
      }

      setState((s) => ({
        ...s,
        message,
        nonce,
        timestamp,
        isGenerating: false,
      }))

      console.log('✅ Auth message generated successfully')
      return { message, nonce, timestamp }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate message'
      console.error('❌ Message generation failed:', errorMessage)

      setState((s) => ({
        ...s,
        error: errorMessage,
        isGenerating: false,
      }))

      throw new Error(errorMessage)
    }
  }, [])

  const clearState = useCallback(() => {
    setState({
      message: null,
      nonce: null,
      timestamp: null,
      isGenerating: false,
      error: null,
    })
  }, [])

  return {
    ...state,
    generateMessage,
    clearState,
  }
}
