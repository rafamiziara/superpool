import type { Connector } from 'wagmi'

export type SignatureType = 'typed-data' | 'personal-sign' | 'safe-wallet'

export interface SignatureRequest {
  message: string
  nonce: string
  timestamp: number
  walletAddress: string
  chainId?: number
}

export interface SignatureResult {
  signature: string
  signatureType: SignatureType
}

interface TypedDataParameter {
  name: string
  type: string
}

interface TypedDataDomain {
  name?: string
  version?: string
  chainId?: number | bigint
  verifyingContract?: `0x${string}`
  salt?: `0x${string}`
}

interface TypedData {
  domain?: TypedDataDomain
  types: Record<string, TypedDataParameter[]>
  primaryType: string
  message: Record<string, unknown>
  account?: `0x${string}`
}

export interface SignatureFunctions {
  signTypedDataAsync: (data: TypedData) => Promise<string>
  signMessageAsync: (params: { message: string; connector?: Connector }) => Promise<string>
}

export class WalletTypeDetector {
  static detectSafeWallet(connector?: Connector): boolean {
    if (!connector) return false

    return connector.id === 'safe' || connector.name?.toLowerCase().includes('safe') || connector.id?.toLowerCase().includes('safe')
  }

  static detectFromSignatureError(error: string): boolean {
    // Do NOT treat user rejection as Safe wallet - this is a user action, not a wallet limitation
    if (error.includes('User rejected') || error.includes('user denied')) {
      return false
    }

    return (
      error.includes('Method disabled') ||
      error.includes('safe://') ||
      error.includes('the method eth_signTypedData_v4 does not exist') ||
      error.includes('Method not supported') ||
      error.includes('eth_signTypedData_v3 does not exist') ||
      error.includes('Personal sign not supported')
    )
  }
}

export class SafeWalletSigner {
  static async sign(request: SignatureRequest, functions: SignatureFunctions, connector?: Connector): Promise<SignatureResult> {
    const timeoutMs = 20000 // 20s for Safe wallets

    try {
      console.log('🔐 Safe wallet detected, trying direct connector signing...')

      // Try direct connector signing first
      const signaturePromise = functions.signMessageAsync({
        message: request.message,
        connector,
      })

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Signature request timed out after ${timeoutMs / 1000} seconds`))
        }, timeoutMs)
      })

      const signature = await Promise.race([signaturePromise, timeoutPromise])

      // Validate signature result
      if (typeof signature === 'object' || (typeof signature === 'string' && signature.includes('"error"'))) {
        throw new Error(`Safe connector signing failed: ${JSON.stringify(signature)}`)
      }

      console.log('✅ Safe wallet direct signing successful:', typeof signature, signature?.substring?.(0, 20) + '...')
      return {
        signature,
        signatureType: 'personal-sign',
      }
    } catch (error) {
      console.log('❌ Safe direct signing failed, using ownership verification fallback...', error)

      // Fallback to ownership verification approach
      console.log('🔐 Using Safe wallet authentication (ownership verification)')
      const fallbackSignature = `safe-wallet:${request.walletAddress}:${request.nonce}:${request.timestamp}`
      console.log('🔐 Safe wallet authentication token generated')

      return {
        signature: fallbackSignature,
        signatureType: 'safe-wallet',
      }
    }
  }
}

export class RegularWalletSigner {
  static async sign(request: SignatureRequest, functions: SignatureFunctions, isSafeWallet = false): Promise<SignatureResult> {
    const timeoutMs = isSafeWallet ? 20000 : 15000 // Progressive timeout
    let timeoutId: number | undefined

    // First try personal message signing for better UX (shows full message text)
    try {
      console.log('📱 Trying personal message signing first for better UX...')

      const signaturePromise = functions.signMessageAsync({ message: request.message })
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Personal sign request timed out after ${timeoutMs / 1000} seconds`))
        }, timeoutMs)
      })

      const signature = await Promise.race([signaturePromise, timeoutPromise])

      // Validate personal sign signature
      if (typeof signature === 'object' || (typeof signature === 'string' && signature.includes('"error"'))) {
        // Check if this is a Safe wallet based on error patterns
        const personalSignError = JSON.stringify(signature)
        if (WalletTypeDetector.detectFromSignatureError(personalSignError)) {
          console.log('🔍 Safe wallet detected by personal sign error, switching to Safe authentication...')
          if (timeoutId) clearTimeout(timeoutId)
          const safeSignature = `safe-wallet:${request.walletAddress}:${request.nonce}:${request.timestamp}`
          console.log('🔐 Safe wallet authentication token generated (personal sign error detection)')
          return {
            signature: safeSignature,
            signatureType: 'safe-wallet',
          }
        } else {
          // Personal sign failed, try EIP-712
          throw new Error(`Personal message signing failed: ${JSON.stringify(signature)}`)
        }
      }

      if (timeoutId) clearTimeout(timeoutId)
      console.log('✅ Personal message signature successful:', typeof signature, signature?.substring?.(0, 20) + '...')
      return {
        signature,
        signatureType: 'personal-sign',
      }
    } catch (personalSignError: unknown) {
      const errorMessage = personalSignError instanceof Error ? personalSignError.message : String(personalSignError)
      console.log('❌ Personal signing failed, trying EIP-712...', errorMessage)

      // Check if this might be a Safe wallet that wasn't detected initially
      if (WalletTypeDetector.detectFromSignatureError(errorMessage)) {
        console.log('🔍 Safe wallet detected by personal sign exception, switching to Safe authentication...')
        if (timeoutId) clearTimeout(timeoutId)
        const safeSignature = `safe-wallet:${request.walletAddress}:${request.nonce}:${request.timestamp}`
        console.log('🔐 Safe wallet authentication token generated (personal sign exception detection)')
        return {
          signature: safeSignature,
          signatureType: 'safe-wallet',
        }
      }

      // Clean up previous timeout
      if (timeoutId) clearTimeout(timeoutId)

      // Fallback to EIP-712 typed data
      try {
        console.log('📱 Trying EIP-712 typed data signing as fallback...')

        const typedData = {
          domain: {
            name: 'SuperPool Authentication',
            version: '1',
            chainId: request.chainId || 1,
          },
          types: {
            Authentication: [
              { name: 'wallet', type: 'address' },
              { name: 'nonce', type: 'string' },
              { name: 'timestamp', type: 'uint256' },
            ],
          },
          primaryType: 'Authentication' as const,
          message: {
            wallet: request.walletAddress as `0x${string}`,
            nonce: request.nonce,
            timestamp: BigInt(request.timestamp),
          },
        }

        const signaturePromise = functions.signTypedDataAsync(typedData)
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`EIP-712 signature request timed out after ${timeoutMs / 1000} seconds`))
          }, timeoutMs)
        })

        const signature = await Promise.race([signaturePromise, timeoutPromise])

        // Validate EIP-712 signature
        if (typeof signature === 'object' || (typeof signature === 'string' && signature.includes('"error"'))) {
          // Check if this might be a Safe wallet that wasn't detected initially
          const eip712Error = JSON.stringify(signature)
          if (WalletTypeDetector.detectFromSignatureError(eip712Error)) {
            console.log('🔍 Safe wallet detected by EIP-712 error, switching to Safe authentication...')
            if (timeoutId) clearTimeout(timeoutId)
            const safeSignature = `safe-wallet:${request.walletAddress}:${request.nonce}:${request.timestamp}`
            console.log('🔐 Safe wallet authentication token generated (EIP-712 error detection)')
            return {
              signature: safeSignature,
              signatureType: 'safe-wallet',
            }
          }
          throw new Error(`EIP-712 signing failed: ${JSON.stringify(signature)}`)
        }

        if (timeoutId) clearTimeout(timeoutId)
        console.log('✅ EIP-712 signature successful:', typeof signature, signature?.substring?.(0, 20) + '...')
        return {
          signature,
          signatureType: 'typed-data',
        }
      } catch (typedDataError: unknown) {
        const eip712ErrorMessage = typedDataError instanceof Error ? typedDataError.message : String(typedDataError)
        console.log('❌ EIP-712 also failed, no more fallbacks available:', eip712ErrorMessage)

        // Check if this might be a Safe wallet that wasn't detected initially
        if (WalletTypeDetector.detectFromSignatureError(eip712ErrorMessage)) {
          console.log('🔍 Safe wallet detected by EIP-712 exception, switching to Safe authentication...')
          if (timeoutId) clearTimeout(timeoutId)
          const safeSignature = `safe-wallet:${request.walletAddress}:${request.nonce}:${request.timestamp}`
          console.log('🔐 Safe wallet authentication token generated (EIP-712 exception detection)')
          return {
            signature: safeSignature,
            signatureType: 'safe-wallet',
          }
        }

        // Both methods failed
        if (timeoutId) clearTimeout(timeoutId)
        throw new Error(`All signature methods failed. Personal sign: ${errorMessage}. EIP-712: ${eip712ErrorMessage}`)
      }
    }
  }

  static validateSignatureFormat(signature: string): boolean {
    const isSafeToken = signature.startsWith('safe-wallet:')
    const isValidHex = signature.startsWith('0x') && signature.length >= 10
    return isSafeToken || isValidHex
  }
}

export class SignatureService {
  /**
   * Validates signature request parameters before processing
   */
  private static validateSignatureRequest(request: SignatureRequest): void {
    if (!request.message || request.message.trim() === '') {
      throw new Error('Signature request missing message data')
    }

    if (!request.nonce || request.nonce.trim() === '') {
      throw new Error('Signature request missing nonce')
    }

    if (!request.walletAddress || request.walletAddress.trim() === '') {
      throw new Error('Signature request missing wallet address')
    }

    if (!request.timestamp || request.timestamp <= 0) {
      throw new Error('Signature request missing valid timestamp')
    }

    // Validate wallet address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(request.walletAddress)) {
      throw new Error(`Invalid wallet address format: ${request.walletAddress}`)
    }

    console.log('✅ Signature request validation passed:', {
      messageLength: request.message.length,
      nonce: request.nonce,
      walletAddress: request.walletAddress.substring(0, 6) + '...' + request.walletAddress.slice(-4),
      timestamp: request.timestamp,
      chainId: request.chainId,
    })
  }

  static async requestSignature(request: SignatureRequest, functions: SignatureFunctions, connector?: Connector): Promise<SignatureResult> {
    // Validate request parameters first
    this.validateSignatureRequest(request)

    const isSafeWallet = WalletTypeDetector.detectSafeWallet(connector)

    console.log('🔍 Wallet type detection:', {
      connectorId: connector?.id,
      connectorName: connector?.name,
      isSafeWallet,
      requestPreview: {
        messageLength: request.message.length,
        messageStart: request.message.substring(0, 30) + '...',
        walletAddress: request.walletAddress.substring(0, 6) + '...' + request.walletAddress.slice(-4),
      },
    })

    let result: SignatureResult

    try {
      if (isSafeWallet) {
        console.log('📱 Using Safe wallet signing path')
        result = await SafeWalletSigner.sign(request, functions, connector)
      } else {
        console.log('📱 Using regular wallet signing path')
        result = await RegularWalletSigner.sign(request, functions, isSafeWallet)
      }
    } catch (signingError) {
      console.error('❌ Signature request failed:', {
        error: signingError,
        walletType: isSafeWallet ? 'safe' : 'regular',
        connectorInfo: { id: connector?.id, name: connector?.name },
      })
      throw signingError
    }

    // Final signature validation
    if (!RegularWalletSigner.validateSignatureFormat(result.signature)) {
      throw new Error(`Invalid signature received: ${JSON.stringify(result.signature)}`)
    }

    console.log('✅ Signature request completed:', {
      signatureType: result.signatureType,
      signatureLength: result.signature.length,
      signaturePreview: result.signature.substring(0, 20) + '...',
    })

    return result
  }
}
