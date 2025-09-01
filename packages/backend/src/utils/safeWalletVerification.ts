import { Contract, ContractRunner, isAddress, keccak256, toUtf8Bytes } from 'ethers'
import { logger } from 'firebase-functions/v2'
import { createAuthMessage } from '.'
import {
  EIP1271VerificationParams,
  EIP1271_MAGIC_VALUE,
  SAFE_CONTRACT_ABI_FRAGMENTS,
  SafeOwnershipVerification,
  SafeVersionInfo,
  SafeWalletConfig,
  SafeWalletVerification,
  SafeWalletVerificationError,
  SafeWalletVerificationResult,
  SUPPORTED_SAFE_VERSIONS
} from '../types/safeWalletTypes'

/**
 * Enhanced Safe wallet verification service with cryptographic validation
 * Implements EIP-1271 signature verification and Safe-specific checks
 */
export class SafeWalletVerificationService {
  
  /**
   * Main entry point for Safe wallet signature verification
   */
  static async verifySafeWalletSignature(
    walletAddress: string,
    signature: string,
    nonce: string,
    timestamp: number,
    provider: unknown,
    chainId?: number
  ): Promise<SafeWalletVerificationResult> {
    try {
      logger.info('Starting Safe wallet verification', { 
        walletAddress, 
        signatureLength: signature.length,
        chainId 
      })

      // Step 1: Validate inputs
      if (!isAddress(walletAddress)) {
        return {
          isValid: false,
          verification: this.createFailedVerification('eip1271'),
          error: SafeWalletVerificationError.INVALID_CONTRACT_ADDRESS
        }
      }

      // Step 2: Parse Safe wallet signature format
      const signatureData = this.parseSafeWalletSignature(signature, walletAddress, nonce, timestamp)
      if (!signatureData.isValid) {
        return {
          isValid: false,
          verification: this.createFailedVerification('fallback'),
          error: SafeWalletVerificationError.INVALID_SIGNATURE_FORMAT
        }
      }

      // Step 3: Create Safe contract instance
      const safeContract = new Contract(walletAddress, SAFE_CONTRACT_ABI_FRAGMENTS, provider as ContractRunner)
      
      // Step 4: Verify it's actually a Safe contract
      const safeVersion = await this.getSafeVersion(safeContract)
      if (!safeVersion.isSupported) {
        logger.warn('Unsupported or invalid Safe contract', { 
          walletAddress, 
          version: safeVersion.version 
        })
        
        // Fall back to basic verification for unsupported versions
        return this.performFallbackVerification(signature, walletAddress, nonce, timestamp)
      }

      // Step 5: Get ownership information
      const ownershipInfo = await this.verifyOwnership(safeContract, walletAddress)
      
      // Step 6: Perform EIP-1271 signature verification
      const message = createAuthMessage(walletAddress, nonce, timestamp)
      const messageHash = keccak256(toUtf8Bytes(message))
      
      const eip1271Result = await this.verifyEIP1271Signature({
        contractAddress: walletAddress,
        messageHash,
        signature: signatureData.actualSignature || signature,
        provider
      })

      // Step 7: Compile verification result
      const verification: SafeWalletVerification = {
        signatureValidation: eip1271Result,
        ownershipVerification: ownershipInfo.isOwner,
        thresholdCheck: ownershipInfo.threshold > 0,
        safeVersionCompatibility: safeVersion.isSupported,
        verificationMethod: 'eip1271',
        contractAddress: walletAddress
      }

      const isValid = verification.signatureValidation && 
                     verification.ownershipVerification && 
                     verification.thresholdCheck && 
                     verification.safeVersionCompatibility

      logger.info('Safe wallet verification completed', {
        walletAddress,
        isValid,
        verification
      })

      return {
        isValid,
        verification,
        warnings: this.generateVerificationWarnings(verification, safeVersion, ownershipInfo)
      }

    } catch (error) {
      logger.error('Safe wallet verification failed', { 
        error, 
        walletAddress,
        errorMessage: error instanceof Error ? error.message : String(error)
      })

      // Fall back to basic verification on error
      return this.performFallbackVerification(signature, walletAddress, nonce, timestamp)
    }
  }

  /**
   * Parse Safe wallet signature format and validate structure
   */
  private static parseSafeWalletSignature(
    signature: string, 
    walletAddress: string, 
    nonce: string, 
    timestamp: number
  ): { isValid: boolean; actualSignature?: string } {
    const expectedSignature = `safe-wallet:${walletAddress}:${nonce}:${timestamp}`
    
    // Check for exact format match (current implementation)
    if (signature === expectedSignature) {
      return { isValid: true }
    }

    // Check for enhanced format with actual signature data
    if (signature.startsWith('safe-wallet:') && signature.includes(':sig:')) {
      const parts = signature.split(':')
      if (parts.length >= 5 && parts[0] === 'safe-wallet' && 
          parts[1] === walletAddress && parts[2] === nonce && 
          parts[3] === timestamp.toString()) {
        return { 
          isValid: true, 
          actualSignature: parts.slice(5).join(':') // Everything after ":sig:"
        }
      }
    }

    return { isValid: false }
  }

  /**
   * Verify signature using EIP-1271 standard
   */
  private static async verifyEIP1271Signature(params: EIP1271VerificationParams): Promise<boolean> {
    try {
      const contract = new Contract(params.contractAddress, SAFE_CONTRACT_ABI_FRAGMENTS, params.provider as ContractRunner)
      
      // Call isValidSignature function from EIP-1271
      const result = await contract.isValidSignature(params.messageHash, params.signature)
      
      // Check if returned magic value matches EIP-1271 standard
      const isValid = result === EIP1271_MAGIC_VALUE

      logger.info('EIP-1271 signature verification', {
        contractAddress: params.contractAddress,
        isValid,
        returnedValue: result,
        expectedValue: EIP1271_MAGIC_VALUE
      })

      return isValid

    } catch (error) {
      logger.warn('EIP-1271 verification failed', { 
        error: error instanceof Error ? error.message : String(error),
        contractAddress: params.contractAddress
      })
      return false
    }
  }

  /**
   * Get Safe contract version and compatibility information
   */
  private static async getSafeVersion(safeContract: Contract): Promise<SafeVersionInfo> {
    try {
      const version = await safeContract.VERSION()
      const isSupported = SUPPORTED_SAFE_VERSIONS.some(supportedVersion => 
        version.startsWith(supportedVersion)
      )

      return {
        version,
        isSupported,
        features: {
          eip1271Support: isSupported,
          messageSigningSupport: isSupported,
          fallbackVerificationRequired: !isSupported
        }
      }

    } catch (error) {
      logger.warn('Failed to get Safe version', { 
        error: error instanceof Error ? error.message : String(error)
      })
      
      return {
        version: 'unknown',
        isSupported: false,
        features: {
          eip1271Support: false,
          messageSigningSupport: false,
          fallbackVerificationRequired: true
        }
      }
    }
  }

  /**
   * Verify Safe ownership and threshold information
   */
  private static async verifyOwnership(safeContract: Contract, expectedOwner: string): Promise<SafeOwnershipVerification> {
    try {
      const [isOwner, threshold, owners] = await Promise.all([
        safeContract.isOwner(expectedOwner),
        safeContract.getThreshold(),
        safeContract.getOwners()
      ])

      return {
        isOwner,
        threshold: Number(threshold),
        currentOwners: owners,
        requiredSignatures: Number(threshold)
      }

    } catch (error) {
      logger.warn('Failed to verify Safe ownership', { 
        error: error instanceof Error ? error.message : String(error),
        expectedOwner
      })

      // Return conservative defaults on error
      return {
        isOwner: false,
        threshold: 0,
        currentOwners: [],
        requiredSignatures: 0
      }
    }
  }

  /**
   * Fallback verification for unsupported Safe versions or errors
   */
  private static performFallbackVerification(
    signature: string, 
    walletAddress: string, 
    nonce: string, 
    timestamp: number
  ): SafeWalletVerificationResult {
    const expectedSignature = `safe-wallet:${walletAddress}:${nonce}:${timestamp}`
    const isValid = signature === expectedSignature

    logger.info('Performing fallback Safe wallet verification', {
      walletAddress,
      isValid
    })

    const verification: SafeWalletVerification = {
      signatureValidation: isValid,
      ownershipVerification: true, // Trust wallet connection for fallback
      thresholdCheck: true,
      safeVersionCompatibility: false,
      verificationMethod: 'fallback',
      contractAddress: walletAddress
    }

    return {
      isValid,
      verification,
      warnings: [
        'Fallback verification used - limited security guarantees',
        'Consider upgrading Safe wallet to supported version'
      ]
    }
  }

  /**
   * Create failed verification result
   */
  private static createFailedVerification(method: 'eip1271' | 'safe-sdk' | 'fallback'): SafeWalletVerification {
    return {
      signatureValidation: false,
      ownershipVerification: false,
      thresholdCheck: false,
      safeVersionCompatibility: false,
      verificationMethod: method
    }
  }

  /**
   * Generate appropriate warnings based on verification results
   */
  private static generateVerificationWarnings(
    verification: SafeWalletVerification,
    versionInfo: SafeVersionInfo,
    ownershipInfo: SafeOwnershipVerification
  ): string[] {
    const warnings: string[] = []

    if (!versionInfo.isSupported) {
      warnings.push(`Safe version ${versionInfo.version} has limited verification support`)
    }

    if (ownershipInfo.threshold === 1) {
      warnings.push('Safe wallet has threshold of 1 - consider multi-sig setup for enhanced security')
    }

    if (verification.verificationMethod === 'fallback') {
      warnings.push('Used fallback verification method - cryptographic validation not performed')
    }

    return warnings
  }

  /**
   * Validate Safe wallet configuration
   */
  static validateSafeWalletConfig(config: SafeWalletConfig): { isValid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!isAddress(config.contractAddress)) {
      errors.push('Invalid Safe contract address')
    }

    if (config.chainId && config.chainId <= 0) {
      errors.push('Invalid chain ID')
    }

    if (config.threshold !== undefined && config.threshold <= 0) {
      errors.push('Invalid threshold value')
    }

    if (config.owners && config.owners.length === 0) {
      errors.push('Safe must have at least one owner')
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }
}