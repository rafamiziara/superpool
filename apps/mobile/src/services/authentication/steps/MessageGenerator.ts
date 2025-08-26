import { AuthMessage } from '@superpool/types'
import { httpsCallable } from 'firebase/functions'
import { FIREBASE_FUNCTIONS } from '../../../firebase.config'

const generateAuthMessage = httpsCallable(FIREBASE_FUNCTIONS, 'generateAuthMessage')

export interface GeneratedAuthMessage extends AuthMessage {
  // AuthMessage already has message, nonce, timestamp
}

/**
 * Handles authentication message generation from backend
 * Separates message generation concerns from orchestration
 */
export class MessageGenerator {
  /**
   * Generates authentication message from backend with validation
   */
  async generateAuthenticationMessage(walletAddress: string): Promise<GeneratedAuthMessage> {
    console.log('📝 Generating authentication message for address:', walletAddress)

    const messageResponse = await generateAuthMessage({ walletAddress })
    const {
      message,
      nonce,
      timestamp: rawTimestamp,
    } = messageResponse.data as {
      message: string
      nonce: string
      timestamp: number
    }

    const timestamp = this.validateAndParseTimestamp(rawTimestamp)

    console.log('✅ Authentication message generated:', message?.substring(0, 50) + '...')
    console.log('📊 Timestamp debug:', { rawTimestamp, timestamp, type: typeof timestamp })

    return { message, nonce, timestamp }
  }

  /**
   * Validates and parses timestamp from backend response
   */
  private validateAndParseTimestamp(rawTimestamp: unknown): number {
    const timestamp = typeof rawTimestamp === 'number' 
      ? rawTimestamp 
      : parseInt(String(rawTimestamp), 10)

    if (isNaN(timestamp)) {
      throw new Error('Invalid timestamp received from authentication message')
    }

    return timestamp
  }
}