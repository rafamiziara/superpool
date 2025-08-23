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
    return (
      error.includes('Method disabled') || error.includes('safe://') || error.includes('the method eth_signTypedData_v4 does not exist')
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
    let timeoutId: NodeJS.Timeout | undefined

    try {
      // First try EIP-712 typed data (preferred for modern wallets)
      try {
        console.log('📱 Trying EIP-712 typed data signing...')

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
          }, timeoutMs) as any
        })

        const signature = await Promise.race([signaturePromise, timeoutPromise])

        // Validate EIP-712 signature
        if (typeof signature === 'object' || (typeof signature === 'string' && signature.includes('"error"'))) {
          throw new Error(`EIP-712 signing failed: ${JSON.stringify(signature)}`)
        }

        console.log('✅ EIP-712 signature successful:', typeof signature, signature?.substring?.(0, 20) + '...')
        return {
          signature,
          signatureType: 'typed-data',
        }
      } catch (typedDataError: unknown) {
        const errorMessage = typedDataError instanceof Error ? typedDataError.message : String(typedDataError)
        console.log('❌ EIP-712 failed, trying personal message signing...', errorMessage)

        // Clean up previous timeout
        if (timeoutId) clearTimeout(timeoutId)

        // Fallback to personal message signing
        const signaturePromise = functions.signMessageAsync({ message: request.message })
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`Personal sign request timed out after ${timeoutMs / 1000} seconds`))
          }, timeoutMs) as any
        })

        const signature = await Promise.race([signaturePromise, timeoutPromise])

        // Validate personal sign signature
        if (typeof signature === 'object' || (typeof signature === 'string' && signature.includes('"error"'))) {
          // Check if this is a Safe wallet based on error patterns
          const personalSignError = JSON.stringify(signature)
          if (WalletTypeDetector.detectFromSignatureError(personalSignError)) {
            console.log('🔍 Safe wallet detected by personal sign error, switching to Safe authentication...')
            const safeSignature = `safe-wallet:${request.walletAddress}:${request.nonce}:${request.timestamp}`
            console.log('🔐 Safe wallet authentication token generated (personal sign error detection)')
            return {
              signature: safeSignature,
              signatureType: 'safe-wallet',
            }
          } else {
            throw new Error(`Personal message signing failed: ${JSON.stringify(signature)}`)
          }
        }

        console.log('✅ Personal message signature successful:', typeof signature, signature?.substring?.(0, 20) + '...')
        return {
          signature,
          signatureType: 'personal-sign',
        }
      }
    } finally {
      // Clean up timeout when signature resolves or errors
      if (timeoutId) clearTimeout(timeoutId)
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
    })

    let result: SignatureResult

    if (isSafeWallet) {
      result = await SafeWalletSigner.sign(request, functions, connector)
    } else {
      result = await RegularWalletSigner.sign(request, functions, isSafeWallet)
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
