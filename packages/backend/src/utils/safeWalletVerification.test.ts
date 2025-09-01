import { Contract } from 'ethers'
import { SafeWalletVerificationService } from './safeWalletVerification'
import {
  EIP1271_MAGIC_VALUE,
  SafeWalletVerificationError,
  SUPPORTED_SAFE_VERSIONS
} from '../types/safeWalletTypes'

// Mock ethers Contract
jest.mock('ethers', () => ({
  Contract: jest.fn(),
  isAddress: jest.fn(),
  keccak256: jest.fn(),
  toUtf8Bytes: jest.fn()
}))

// Mock Firebase Functions logger
jest.mock('firebase-functions/v2', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}))

// Mock createAuthMessage utility
jest.mock('.', () => ({
  createAuthMessage: jest.fn()
}))

const mockContract = Contract as jest.MockedClass<typeof Contract>
const { isAddress, keccak256, toUtf8Bytes } = jest.requireMock('ethers')
const { createAuthMessage } = jest.requireMock('.')

describe('SafeWalletVerificationService', () => {
  const mockProvider = {
    getNetwork: jest.fn(),
    getBlockNumber: jest.fn()
  }

  const validWalletAddress = '0x1234567890123456789012345678901234567890'
  const validNonce = 'test-nonce-123'
  const validTimestamp = Date.now()
  const validSignature = `safe-wallet:${validWalletAddress}:${validNonce}:${validTimestamp}:sig:0xvalidmocksignature`

  beforeEach(() => {
    jest.clearAllMocks()
    isAddress.mockReturnValue(true)
    keccak256.mockReturnValue('0xmockedhash')
    toUtf8Bytes.mockReturnValue(new Uint8Array())
    createAuthMessage.mockReturnValue('mocked auth message')
  })

  describe('verifySafeWalletSignature', () => {
    it('should reject invalid wallet addresses', async () => {
      isAddress.mockReturnValue(false)

      const result = await SafeWalletVerificationService.verifySafeWalletSignature(
        'invalid-address',
        validSignature,
        validNonce,
        validTimestamp,
        mockProvider
      )

      expect(result.isValid).toBe(false)
      expect(result.error).toBe(SafeWalletVerificationError.INVALID_CONTRACT_ADDRESS)
      expect(result.verification.signatureValidation).toBe(false)
    })

    it('should reject invalid signature formats', async () => {
      const result = await SafeWalletVerificationService.verifySafeWalletSignature(
        validWalletAddress,
        'invalid-signature-format',
        validNonce,
        validTimestamp,
        mockProvider
      )

      expect(result.isValid).toBe(false)
      expect(result.error).toBe(SafeWalletVerificationError.INVALID_SIGNATURE_FORMAT)
      expect(result.verification.verificationMethod).toBe('fallback')
    })

    it('should reject old format-only signatures for security', async () => {
      const oldFormatSignature = `safe-wallet:${validWalletAddress}:${validNonce}:${validTimestamp}`
      
      const result = await SafeWalletVerificationService.verifySafeWalletSignature(
        validWalletAddress,
        oldFormatSignature,
        validNonce,
        validTimestamp,
        mockProvider
      )

      expect(result.isValid).toBe(false)
      expect(result.error).toBe(SafeWalletVerificationError.INVALID_SIGNATURE_FORMAT)
      expect(result.warnings).toContain('Format-only signatures are no longer accepted for security reasons')
    })

    it('should perform secure fallback verification for unsupported Safe versions', async () => {
      const mockContractInstance = {
        VERSION: jest.fn().mockResolvedValue('0.5.0'), // Unsupported version
        isOwner: jest.fn(),
        getThreshold: jest.fn(),
        getOwners: jest.fn(),
        isValidSignature: jest.fn()
      }
      
      mockContract.mockImplementation(() => mockContractInstance as any)

      const result = await SafeWalletVerificationService.verifySafeWalletSignature(
        validWalletAddress,
        validSignature,
        validNonce,
        validTimestamp,
        mockProvider
      )

      expect(result.isValid).toBe(false) // Secure fallback should fail by default
      expect(result.verification.verificationMethod).toBe('fallback')
      expect(result.verification.safeVersionCompatibility).toBe(false)
      expect(result.verification.ownershipVerification).toBe(false)
      expect(result.verification.thresholdCheck).toBe(false)
      expect(result.warnings).toContain('Safe contract interaction failed - cannot verify ownership or threshold')
    })

    it('should perform full EIP-1271 verification with contract validation for supported Safe versions', async () => {
      const mockContractInstance = {
        VERSION: jest.fn().mockResolvedValue('1.4.1'), // Supported version
        isOwner: jest.fn().mockResolvedValue(true),
        getThreshold: jest.fn().mockResolvedValue(BigInt(2)),
        getOwners: jest.fn().mockResolvedValue([validWalletAddress, '0xother']),
        isValidSignature: jest.fn().mockResolvedValue(EIP1271_MAGIC_VALUE),
        target: validWalletAddress // Mock contract target property
      }
      
      mockContract.mockImplementation(() => mockContractInstance as any)

      const result = await SafeWalletVerificationService.verifySafeWalletSignature(
        validWalletAddress,
        validSignature,
        validNonce,
        validTimestamp,
        mockProvider
      )

      expect(result.isValid).toBe(true)
      expect(result.verification.verificationMethod).toBe('eip1271')
      expect(result.verification.signatureValidation).toBe(true)
      expect(result.verification.ownershipVerification).toBe(true)
      expect(result.verification.thresholdCheck).toBe(true)
      expect(result.verification.safeVersionCompatibility).toBe(true)
      
      // Verify contract validation was performed
      expect(mockContractInstance.VERSION).toHaveBeenCalled()
      expect(mockContractInstance.getThreshold).toHaveBeenCalled()
      expect(mockContractInstance.getOwners).toHaveBeenCalled()
    })

    it('should fail verification when EIP-1271 signature is invalid', async () => {
      const mockContractInstance = {
        VERSION: jest.fn().mockResolvedValue('1.4.1'),
        isOwner: jest.fn().mockResolvedValue(true),
        getThreshold: jest.fn().mockResolvedValue(BigInt(2)),
        getOwners: jest.fn().mockResolvedValue([validWalletAddress]),
        isValidSignature: jest.fn().mockResolvedValue('0xwrongvalue'), // Wrong magic value
        target: validWalletAddress
      }
      
      mockContract.mockImplementation(() => mockContractInstance as any)

      const result = await SafeWalletVerificationService.verifySafeWalletSignature(
        validWalletAddress,
        validSignature,
        validNonce,
        validTimestamp,
        mockProvider
      )

      expect(result.isValid).toBe(false)
      expect(result.verification.signatureValidation).toBe(false)
    })

    it('should fail verification when ownership check fails', async () => {
      const mockContractInstance = {
        VERSION: jest.fn().mockResolvedValue('1.4.1'),
        isOwner: jest.fn().mockResolvedValue(false), // Not an owner
        getThreshold: jest.fn().mockResolvedValue(BigInt(2)),
        getOwners: jest.fn().mockResolvedValue(['0xother1', '0xother2']),
        isValidSignature: jest.fn().mockResolvedValue(EIP1271_MAGIC_VALUE),
        target: validWalletAddress
      }
      
      mockContract.mockImplementation(() => mockContractInstance as any)

      const result = await SafeWalletVerificationService.verifySafeWalletSignature(
        validWalletAddress,
        validSignature,
        validNonce,
        validTimestamp,
        mockProvider
      )

      expect(result.isValid).toBe(false)
      expect(result.verification.ownershipVerification).toBe(false)
    })

    it('should generate appropriate warnings for single-sig Safe', async () => {
      const mockContractInstance = {
        VERSION: jest.fn().mockResolvedValue('1.4.1'),
        isOwner: jest.fn().mockResolvedValue(true),
        getThreshold: jest.fn().mockResolvedValue(BigInt(1)), // Single signature
        getOwners: jest.fn().mockResolvedValue([validWalletAddress]),
        isValidSignature: jest.fn().mockResolvedValue(EIP1271_MAGIC_VALUE),
        target: validWalletAddress
      }
      
      mockContract.mockImplementation(() => mockContractInstance as any)

      const result = await SafeWalletVerificationService.verifySafeWalletSignature(
        validWalletAddress,
        validSignature,
        validNonce,
        validTimestamp,
        mockProvider
      )

      expect(result.isValid).toBe(true)
      expect(result.warnings).toContain('Safe wallet has threshold of 1 - consider multi-sig setup for enhanced security')
    })

    it('should handle enhanced signature format with actual signature data', async () => {
      const enhancedSignature = `safe-wallet:${validWalletAddress}:${validNonce}:${validTimestamp}:sig:0xactualsignaturedata`
      
      const mockContractInstance = {
        VERSION: jest.fn().mockResolvedValue('1.4.1'),
        isOwner: jest.fn().mockResolvedValue(true),
        getThreshold: jest.fn().mockResolvedValue(BigInt(2)),
        getOwners: jest.fn().mockResolvedValue([validWalletAddress, '0xother']),
        isValidSignature: jest.fn().mockResolvedValue(EIP1271_MAGIC_VALUE),
        target: validWalletAddress
      }
      
      mockContract.mockImplementation(() => mockContractInstance as any)

      const result = await SafeWalletVerificationService.verifySafeWalletSignature(
        validWalletAddress,
        enhancedSignature,
        validNonce,
        validTimestamp,
        mockProvider
      )

      expect(result.isValid).toBe(true)
      expect(mockContractInstance.isValidSignature).toHaveBeenCalledWith(
        '0xmockedhash',
        '0xactualsignaturedata'
      )
    })

    it('should use secure fallback verification on contract interaction errors', async () => {
      const mockContractInstance = {
        VERSION: jest.fn().mockRejectedValue(new Error('Network error')),
        isOwner: jest.fn(),
        getThreshold: jest.fn(),
        getOwners: jest.fn(),
        isValidSignature: jest.fn()
      }
      
      mockContract.mockImplementation(() => mockContractInstance as any)

      const result = await SafeWalletVerificationService.verifySafeWalletSignature(
        validWalletAddress,
        validSignature,
        validNonce,
        validTimestamp,
        mockProvider
      )

      expect(result.isValid).toBe(false) // Secure fallback should fail by default
      expect(result.verification.verificationMethod).toBe('fallback')
      expect(result.warnings).toContain('Safe contract interaction failed - cannot verify ownership or threshold')
    })

    it('should reject malicious contracts that return EIP-1271 magic value without proper Safe validation', async () => {
      const mockMaliciousContract = {
        // Malicious contract that returns magic value but fails Safe validation
        VERSION: jest.fn().mockResolvedValue('1.0.0'), // Looks like valid version
        isOwner: jest.fn().mockResolvedValue(true),
        getThreshold: jest.fn().mockResolvedValue(BigInt(0)), // Invalid threshold (should be > 0)
        getOwners: jest.fn().mockResolvedValue([]), // Invalid empty owners array
        isValidSignature: jest.fn().mockResolvedValue(EIP1271_MAGIC_VALUE), // Returns magic value
        target: validWalletAddress
      }
      
      mockContract.mockImplementation(() => mockMaliciousContract as any)

      const result = await SafeWalletVerificationService.verifySafeWalletSignature(
        validWalletAddress,
        validSignature,
        validNonce,
        validTimestamp,
        mockProvider
      )

      // Should reject due to failed Safe contract validation
      expect(result.isValid).toBe(false) 
      expect(result.verification.signatureValidation).toBe(false) // EIP-1271 should fail due to contract validation
      
      // Verify that contract validation functions were called
      expect(mockMaliciousContract.getThreshold).toHaveBeenCalled()
      expect(mockMaliciousContract.getOwners).toHaveBeenCalled()
    })
  })

  describe('validateSafeWalletConfig', () => {
    it('should validate valid Safe wallet configuration', () => {
      const validConfig = {
        contractAddress: validWalletAddress,
        chainId: 80002,
        version: '1.4.1',
        threshold: 2,
        owners: [validWalletAddress, '0xother']
      }

      const result = SafeWalletVerificationService.validateSafeWalletConfig(validConfig)

      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject invalid contract address', () => {
      isAddress.mockReturnValue(false)

      const invalidConfig = {
        contractAddress: 'invalid-address',
        chainId: 80002
      }

      const result = SafeWalletVerificationService.validateSafeWalletConfig(invalidConfig)

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Invalid Safe contract address')
    })

    it('should reject invalid chain ID', () => {
      const invalidConfig = {
        contractAddress: validWalletAddress,
        chainId: -1 // Invalid chain ID
      }

      const result = SafeWalletVerificationService.validateSafeWalletConfig(invalidConfig)

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Invalid chain ID')
    })

    it('should reject invalid threshold', () => {
      const invalidConfig = {
        contractAddress: validWalletAddress,
        chainId: 80002,
        threshold: 0 // Invalid threshold
      }

      const result = SafeWalletVerificationService.validateSafeWalletConfig(invalidConfig)

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Invalid threshold value')
    })

    it('should reject empty owners array', () => {
      const invalidConfig = {
        contractAddress: validWalletAddress,
        chainId: 80002,
        owners: [] // Empty owners array
      }

      const result = SafeWalletVerificationService.validateSafeWalletConfig(invalidConfig)

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Safe must have at least one owner')
    })
  })

  describe('supported versions', () => {
    it('should include all expected Safe versions', () => {
      const expectedVersions = ['1.0.0', '1.1.0', '1.2.0', '1.3.0', '1.4.0', '1.4.1', '1.5.0']
      
      expect(SUPPORTED_SAFE_VERSIONS).toEqual(expectedVersions)
      expect(SUPPORTED_SAFE_VERSIONS.length).toBeGreaterThan(0)
    })

    it('should have correct EIP-1271 magic value', () => {
      expect(EIP1271_MAGIC_VALUE).toBe('0x1626ba7e')
    })
  })
})