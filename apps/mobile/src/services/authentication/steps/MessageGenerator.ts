import { AuthMessage } from '@superpool/types'
import { HttpsCallable, httpsCallable } from 'firebase/functions'
import { FIREBASE_FUNCTIONS } from '../../../firebase.config'

export type GeneratedAuthMessage = AuthMessage

/**
 * Handles authentication message generation from backend
 * Separates message generation concerns from orchestration
 */
export class MessageGenerator {
  private generateAuthMessage: HttpsCallable

  constructor(generateAuthMessageFn?: HttpsCallable) {
    this.generateAuthMessage = generateAuthMessageFn || httpsCallable(FIREBASE_FUNCTIONS, 'generateAuthMessage')
  }
  /**
   * Generates authentication message from backend with validation
   */
  async generateAuthenticationMessage(walletAddress: string): Promise<GeneratedAuthMessage> {
    console.log('📝 Generating authentication message for address:', walletAddress)

    const messageResponse = await this.generateAuthMessage({ walletAddress })
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
    // Reject non-primitive types (arrays, objects, functions)
    if (typeof rawTimestamp === 'object' && rawTimestamp !== null) {
      throw new Error('Invalid timestamp received from authentication message')
    }
    if (typeof rawTimestamp === 'function') {
      throw new Error('Invalid timestamp received from authentication message')
    }

    const timestamp = typeof rawTimestamp === 'number' ? rawTimestamp : parseInt(String(rawTimestamp), 10)

    if (isNaN(timestamp)) {
      throw new Error('Invalid timestamp received from authentication message')
    }

    return timestamp
  }
}
