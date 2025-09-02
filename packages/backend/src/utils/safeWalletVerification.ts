import { Contract, ContractRunner, isAddress, keccak256, toUtf8Bytes } from 'ethers'
import { logger } from 'firebase-functions/v2'
import { createAuthMessage } from '.'
import {
  EIP1271_MAGIC_VALUE,
  EIP1271VerificationParams,
  SAFE_CONTRACT_ABI_FRAGMENTS,
  SafeOwnershipVerification,
  SafeVersionInfo,
  SafeWalletConfig,
  SafeWalletVerification,
  SafeWalletVerificationError,
  SafeWalletVerificationResult,
  SUPPORTED_SAFE_VERSIONS,
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
        chainId,
      })

      // Step 1: Validate inputs
      if (!isAddress(walletAddress)) {
        return {
          isValid: false,
          verification: this.createFailedVerification('eip1271'),
          error: SafeWalletVerificationError.INVALID_CONTRACT_ADDRESS,
        }
      }

      // Step 2: Parse Safe wallet signature format
      const signatureData = this.parseSafeWalletSignature(signature, walletAddress, nonce, timestamp)
      if (!signatureData.isValid) {
        // Check if this looks like an old format-only signature for better error messaging
        const oldFormatSignature = `safe-wallet:${walletAddress}:${nonce}:${timestamp}`
        const isOldFormat = signature === oldFormatSignature

        return {
          isValid: false,
          verification: this.createFailedVerification('fallback'),
          error: SafeWalletVerificationError.INVALID_SIGNATURE_FORMAT,
          warnings: isOldFormat
            ? [
                'Format-only signatures are no longer accepted for security reasons',
                'Please use enhanced signature format with actual cryptographic signature data',
              ]
            : ['Invalid signature format - expected safe-wallet:address:nonce:timestamp:sig:signaturedata'],
        }
      }

      // Step 3: Create Safe contract instance
      const safeContract = new Contract(walletAddress, SAFE_CONTRACT_ABI_FRAGMENTS, provider as ContractRunner)

      // Step 4: Verify it's actually a Safe contract
      const safeVersion = await this.getSafeVersion(safeContract)
      if (!safeVersion.isSupported) {
        logger.warn('Unsupported or invalid Safe contract', {
          walletAddress,
          version: safeVersion.version,
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
        provider,
      })

      // Step 7: Compile verification result
      const verification: SafeWalletVerification = {
        signatureValidation: eip1271Result,
        ownershipVerification: ownershipInfo.isOwner,
        thresholdCheck: ownershipInfo.threshold > 0,
        safeVersionCompatibility: safeVersion.isSupported,
        verificationMethod: 'eip1271',
        contractAddress: walletAddress,
      }

      const isValid =
        verification.signatureValidation &&
        verification.ownershipVerification &&
        verification.thresholdCheck &&
        verification.safeVersionCompatibility

      logger.info('Safe wallet verification completed', {
        walletAddress,
        isValid,
        verification,
      })

      return {
        isValid,
        verification,
        warnings: this.generateVerificationWarnings(verification, safeVersion, ownershipInfo),
      }
    } catch (error) {
      logger.error('Safe wallet verification failed', {
        error,
        walletAddress,
        errorMessage: error instanceof Error ? error.message : String(error),
      })

      // Fall back to basic verification on error
      return this.performFallbackVerification(signature, walletAddress, nonce, timestamp)
    }
  }

  /**
   * Parse Safe wallet signature format and validate structure
   * SECURITY: Only accepts enhanced format with actual signature data
   */
  private static parseSafeWalletSignature(
    signature: string,
    walletAddress: string,
    nonce: string,
    timestamp: number
  ): { isValid: boolean; actualSignature?: string } {
    // SECURITY FIX: Remove vulnerable fallback string comparison
    // Only accept enhanced format with actual cryptographic signature data

    if (signature.startsWith('safe-wallet:') && signature.includes(':sig:')) {
      const parts = signature.split(':')
      if (
        parts.length >= 6 &&
        parts[0] === 'safe-wallet' &&
        parts[1] === walletAddress &&
        parts[2] === nonce &&
        parts[3] === timestamp.toString() &&
        parts[4] === 'sig'
      ) {
        const actualSignature = parts.slice(5).join(':')

        // Ensure we have actual signature data, not empty
        if (actualSignature && actualSignature.length > 0) {
          return {
            isValid: true,
            actualSignature,
          }
        }
      }
    }

    return { isValid: false }
  }

  /**
   * Verify signature using EIP-1271 standard with contract validation
   * SECURITY: Validates contract is actually a Safe before trusting response
   */
  private static async verifyEIP1271Signature(params: EIP1271VerificationParams): Promise<boolean> {
    try {
      const contract = new Contract(params.contractAddress, SAFE_CONTRACT_ABI_FRAGMENTS, params.provider as ContractRunner)

      // SECURITY FIX: Validate this is actually a Safe contract before trusting EIP-1271 response
      const isValidSafeContract = await this.validateSafeContract(contract)
      if (!isValidSafeContract) {
        logger.warn('EIP-1271 verification rejected - not a valid Safe contract', {
          contractAddress: params.contractAddress,
        })
        return false
      }

      // Call isValidSignature function from EIP-1271
      const result = await contract.isValidSignature(params.messageHash, params.signature)

      // Check if returned magic value matches EIP-1271 standard
      const isValid = result === EIP1271_MAGIC_VALUE

      logger.info('EIP-1271 signature verification', {
        contractAddress: params.contractAddress,
        isValid,
        returnedValue: result,
        expectedValue: EIP1271_MAGIC_VALUE,
        contractValidated: true,
      })

      return isValid
    } catch (error) {
      logger.warn('EIP-1271 verification failed', {
        error: error instanceof Error ? error.message : String(error),
        contractAddress: params.contractAddress,
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
      const isSupported = SUPPORTED_SAFE_VERSIONS.some((supportedVersion) => version.startsWith(supportedVersion))

      return {
        version,
        isSupported,
        features: {
          eip1271Support: isSupported,
          messageSigningSupport: isSupported,
          fallbackVerificationRequired: !isSupported,
        },
      }
    } catch (error) {
      logger.warn('Failed to get Safe version', {
        error: error instanceof Error ? error.message : String(error),
      })

      return {
        version: 'unknown',
        isSupported: false,
        features: {
          eip1271Support: false,
          messageSigningSupport: false,
          fallbackVerificationRequired: true,
        },
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
        safeContract.getOwners(),
      ])

      return {
        isOwner,
        threshold: Number(threshold),
        currentOwners: owners,
        requiredSignatures: Number(threshold),
      }
    } catch (error) {
      logger.warn('Failed to verify Safe ownership', {
        error: error instanceof Error ? error.message : String(error),
        expectedOwner,
      })

      // Return conservative defaults on error
      return {
        isOwner: false,
        threshold: 0,
        currentOwners: [],
        requiredSignatures: 0,
      }
    }
  }

  /**
   * Secure fallback verification for unsupported Safe versions or errors
   * SECURITY: No longer accepts format-only validation
   */
  private static performFallbackVerification(
    signature: string,
    walletAddress: string,
    nonce: string,
    timestamp: number
  ): SafeWalletVerificationResult {
    // SECURITY FIX: Remove unsafe format-only validation
    // Fallback now requires actual signature data and minimal verification

    const signatureData = this.parseSafeWalletSignature(signature, walletAddress, nonce, timestamp)

    logger.warn('Performing secure fallback Safe wallet verification', {
      walletAddress,
      hasActualSignature: !!signatureData.actualSignature,
      signatureFormat: signatureData.isValid ? 'valid' : 'invalid',
    })

    // Only proceed if we have actual signature data, not just format match
    if (!signatureData.isValid || !signatureData.actualSignature) {
      const verification: SafeWalletVerification = {
        signatureValidation: false,
        ownershipVerification: false,
        thresholdCheck: false,
        safeVersionCompatibility: false,
        verificationMethod: 'fallback',
        contractAddress: walletAddress,
      }

      return {
        isValid: false,
        verification,
        error: SafeWalletVerificationError.INVALID_SIGNATURE_FORMAT,
        warnings: [
          'Secure fallback verification failed - no cryptographic signature data provided',
          'Format-only signatures are no longer accepted for security reasons',
        ],
      }
    }

    // Even in fallback, we require some signature data
    const verification: SafeWalletVerification = {
      signatureValidation: true, // We have signature data but can't fully verify
      ownershipVerification: false, // Cannot verify ownership without Safe contract interaction
      thresholdCheck: false, // Cannot verify threshold without Safe contract interaction
      safeVersionCompatibility: false,
      verificationMethod: 'fallback',
      contractAddress: walletAddress,
    }

    return {
      isValid: false, // Fallback verification should fail by default for security
      verification,
      warnings: [
        'Fallback verification has limited security guarantees',
        'Safe contract interaction failed - cannot verify ownership or threshold',
        'Consider checking network connectivity and Safe contract deployment',
      ],
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
      verificationMethod: method,
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
   * Validate that a contract is actually a Safe contract
   * SECURITY: Prevents malicious contracts from returning EIP-1271 magic values
   */
  private static async validateSafeContract(contract: Contract): Promise<boolean> {
    try {
      // Check 1: Contract must have Safe-specific functions
      const requiredFunctions = ['getOwners', 'getThreshold', 'isOwner', 'VERSION']

      for (const functionName of requiredFunctions) {
        try {
          // Try to call each function to ensure it exists and behaves like Safe
          if (functionName === 'VERSION') {
            const version = await contract.VERSION()
            if (typeof version !== 'string') {
              logger.warn('Safe validation failed - VERSION function returned non-string', {
                returnedType: typeof version,
              })
              return false
            }
          } else if (functionName === 'getThreshold') {
            const threshold = await contract.getThreshold()
            // Should return a number/BigInt
            if (!threshold || Number(threshold) <= 0) {
              logger.warn('Safe validation failed - invalid threshold', { threshold })
              return false
            }
          } else if (functionName === 'getOwners') {
            const owners = await contract.getOwners()
            // Should return an array
            if (!Array.isArray(owners) || owners.length === 0) {
              logger.warn('Safe validation failed - invalid owners array', { owners })
              return false
            }
          }
        } catch (functionError) {
          logger.warn(`Safe validation failed - missing function ${functionName}`, {
            error: functionError instanceof Error ? functionError.message : String(functionError),
          })
          return false
        }
      }

      // Check 2: Verify the contract version is supported
      const version = await contract.VERSION()
      const isSupported = SUPPORTED_SAFE_VERSIONS.some((supportedVersion) => version.startsWith(supportedVersion))

      if (!isSupported) {
        logger.warn('Safe validation failed - unsupported version', { version })
        return false
      }

      logger.info('Safe contract validation successful', {
        contractAddress: contract.target,
        version,
      })

      return true
    } catch (error) {
      logger.warn('Safe contract validation failed', {
        error: error instanceof Error ? error.message : String(error),
        contractAddress: contract.target,
      })
      return false
    }
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
      errors,
    }
  }
}
