import { EIP1271_MAGIC_VALUE, SafeWalletVerificationError, SUPPORTED_SAFE_VERSIONS } from '../types/safeWalletTypes'
import { SafeWalletVerificationService } from './safeWalletVerification'
import { ContractMock, ethersMock, firebaseAdminMock } from '../__mocks__'
import { Contract, isAddress, keccak256, toUtf8Bytes } from 'ethers'

// Mock ethers utilities
jest.mock('ethers', () => ({
  ...jest.requireActual('ethers'),
  Contract: jest.fn(),
  isAddress: jest.fn(),
  keccak256: jest.fn(),
  toUtf8Bytes: jest.fn(),
}))

// Mock createAuthMessage utility
jest.mock('.', () => ({
  createAuthMessage: jest.fn(),
}))

const { createAuthMessage } = jest.requireMock('.')
const MockedContract = jest.mocked(Contract)
const mockIsAddress = jest.mocked(isAddress)
const mockKeccak256 = jest.mocked(keccak256)
const mockToUtf8Bytes = jest.mocked(toUtf8Bytes)

// Define mock contract interface to avoid 'any' types
interface MockSafeContract {
  VERSION: jest.MockedFunction<() => Promise<string>>
  isOwner: jest.MockedFunction<(address: string) => Promise<boolean>>
  getThreshold: jest.MockedFunction<() => Promise<bigint>>
  getOwners: jest.MockedFunction<() => Promise<string[]>>
  isValidSignature: jest.MockedFunction<(hash: string, signature: string) => Promise<string>>
}

describe('SafeWalletVerificationService', () => {
  const validWalletAddress = '0x1234567890123456789012345678901234567890'
  const validNonce = 'test-nonce-123'
  const validTimestamp = Date.now()
  const validSignature = `safe-wallet:${validWalletAddress}:${validNonce}:${validTimestamp}:sig:0xvalidmocksignature`

  beforeEach(() => {
    // Reset all centralized mocks
    ethersMock.resetAllMocks()
    ContractMock.reset()
    firebaseAdminMock.resetAllMocks()

    // Setup default mock behaviors
    mockIsAddress.mockReturnValue(true)
    mockKeccak256.mockReturnValue('0xmockedhash')
    mockToUtf8Bytes.mockReturnValue(new Uint8Array())
    createAuthMessage.mockReturnValue('mocked auth message')
  })

  describe('verifySafeWalletSignature', () => {
    it('should reject invalid wallet addresses', async () => {
      mockIsAddress.mockReturnValue(false)

      const result = await SafeWalletVerificationService.verifySafeWalletSignature(
        'invalid-address',
        validSignature,
        validNonce,
        validTimestamp,
        ethersMock.provider
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
        ethersMock.provider
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
        ethersMock.provider
      )

      expect(result.isValid).toBe(false)
      expect(result.error).toBe(SafeWalletVerificationError.INVALID_SIGNATURE_FORMAT)
      expect(result.warnings).toContain('Format-only signatures are no longer accepted for security reasons')
    })

    it('should perform secure fallback verification for unsupported Safe versions', async () => {
      const mockSafeContract = ContractMock.createSafeMock(validWalletAddress)
      mockSafeContract.VERSION = jest.fn().mockResolvedValue('0.5.0') // Unsupported version
      mockSafeContract.isOwner = jest.fn()
      mockSafeContract.getThreshold = jest.fn()
      mockSafeContract.getOwners = jest.fn()
      mockSafeContract.isValidSignature = jest.fn()

      MockedContract.mockImplementation(() => mockSafeContract as MockSafeContract)

      const result = await SafeWalletVerificationService.verifySafeWalletSignature(
        validWalletAddress,
        validSignature,
        validNonce,
        validTimestamp,
        ethersMock.provider
      )

      expect(result.isValid).toBe(false) // Secure fallback should fail by default
      expect(result.verification.verificationMethod).toBe('fallback')
      expect(result.verification.safeVersionCompatibility).toBe(false)
      expect(result.verification.ownershipVerification).toBe(false)
      expect(result.verification.thresholdCheck).toBe(false)
      expect(result.warnings).toContain('Safe contract interaction failed - cannot verify ownership or threshold')
    })

    it('should perform full EIP-1271 verification with contract validation for supported Safe versions', async () => {
      const mockSafeContract = ContractMock.createSafeMock(validWalletAddress)
      mockSafeContract.VERSION = jest.fn().mockResolvedValue('1.4.1') // Supported version
      mockSafeContract.isOwner = jest.fn().mockResolvedValue(true)
      mockSafeContract.getThreshold = jest.fn().mockResolvedValue(BigInt(2))
      mockSafeContract.getOwners = jest.fn().mockResolvedValue([validWalletAddress, '0xother'])
      mockSafeContract.isValidSignature = jest.fn().mockResolvedValue(EIP1271_MAGIC_VALUE)

      MockedContract.mockImplementation(() => mockSafeContract as MockSafeContract)

      const result = await SafeWalletVerificationService.verifySafeWalletSignature(
        validWalletAddress,
        validSignature,
        validNonce,
        validTimestamp,
        ethersMock.provider
      )

      expect(result.isValid).toBe(true)
      expect(result.verification.verificationMethod).toBe('eip1271')
      expect(result.verification.signatureValidation).toBe(true)
      expect(result.verification.ownershipVerification).toBe(true)
      expect(result.verification.thresholdCheck).toBe(true)
      expect(result.verification.safeVersionCompatibility).toBe(true)

      // Verify contract validation was performed
      expect(mockSafeContract.VERSION).toHaveBeenCalled()
      expect(mockSafeContract.getThreshold).toHaveBeenCalled()
      expect(mockSafeContract.getOwners).toHaveBeenCalled()
    })

    it('should fail verification when EIP-1271 signature is invalid', async () => {
      const mockSafeContract = ContractMock.createSafeMock(validWalletAddress)
      mockSafeContract.VERSION = jest.fn().mockResolvedValue('1.4.1')
      mockSafeContract.isOwner = jest.fn().mockResolvedValue(true)
      mockSafeContract.getThreshold = jest.fn().mockResolvedValue(BigInt(2))
      mockSafeContract.getOwners = jest.fn().mockResolvedValue([validWalletAddress])
      mockSafeContract.isValidSignature = jest.fn().mockResolvedValue('0xwrongvalue') // Wrong magic value

      MockedContract.mockImplementation(() => mockSafeContract as MockSafeContract)

      const result = await SafeWalletVerificationService.verifySafeWalletSignature(
        validWalletAddress,
        validSignature,
        validNonce,
        validTimestamp,
        ethersMock.provider
      )

      expect(result.isValid).toBe(false)
      expect(result.verification.signatureValidation).toBe(false)
    })

    it('should fail verification when ownership check fails', async () => {
      const mockSafeContract = ContractMock.createSafeMock(validWalletAddress)
      mockSafeContract.VERSION = jest.fn().mockResolvedValue('1.4.1')
      mockSafeContract.isOwner = jest.fn().mockResolvedValue(false) // Not an owner
      mockSafeContract.getThreshold = jest.fn().mockResolvedValue(BigInt(2))
      mockSafeContract.getOwners = jest.fn().mockResolvedValue(['0xother1', '0xother2'])
      mockSafeContract.isValidSignature = jest.fn().mockResolvedValue(EIP1271_MAGIC_VALUE)

      MockedContract.mockImplementation(() => mockSafeContract as MockSafeContract)

      const result = await SafeWalletVerificationService.verifySafeWalletSignature(
        validWalletAddress,
        validSignature,
        validNonce,
        validTimestamp,
        ethersMock.provider
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
        target: validWalletAddress,
      }

      MockedContract.mockImplementation(() => mockContractInstance as MockSafeContract)

      const result = await SafeWalletVerificationService.verifySafeWalletSignature(
        validWalletAddress,
        validSignature,
        validNonce,
        validTimestamp,
        ethersMock.provider
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
        target: validWalletAddress,
      }

      MockedContract.mockImplementation(() => mockContractInstance as MockSafeContract)

      const result = await SafeWalletVerificationService.verifySafeWalletSignature(
        validWalletAddress,
        enhancedSignature,
        validNonce,
        validTimestamp,
        ethersMock.provider
      )

      expect(result.isValid).toBe(true)
      expect(mockContractInstance.isValidSignature).toHaveBeenCalledWith('0xmockedhash', '0xactualsignaturedata')
    })

    it('should use secure fallback verification on contract interaction errors', async () => {
      const mockContractInstance = {
        VERSION: jest.fn().mockRejectedValue(new Error('Network error')),
        isOwner: jest.fn(),
        getThreshold: jest.fn(),
        getOwners: jest.fn(),
        isValidSignature: jest.fn(),
      }

      MockedContract.mockImplementation(() => mockContractInstance as MockSafeContract)

      const result = await SafeWalletVerificationService.verifySafeWalletSignature(
        validWalletAddress,
        validSignature,
        validNonce,
        validTimestamp,
        ethersMock.provider
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
        target: validWalletAddress,
      }

      MockedContract.mockImplementation(() => mockMaliciousContract as MockSafeContract)

      const result = await SafeWalletVerificationService.verifySafeWalletSignature(
        validWalletAddress,
        validSignature,
        validNonce,
        validTimestamp,
        ethersMock.provider
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
        owners: [validWalletAddress, '0xother'],
      }

      const result = SafeWalletVerificationService.validateSafeWalletConfig(validConfig)

      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject invalid contract address', () => {
      mockIsAddress.mockReturnValue(false)

      const invalidConfig = {
        contractAddress: 'invalid-address',
        chainId: 80002,
      }

      const result = SafeWalletVerificationService.validateSafeWalletConfig(invalidConfig)

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Invalid Safe contract address')
    })

    it('should reject invalid chain ID', () => {
      const invalidConfig = {
        contractAddress: validWalletAddress,
        chainId: -1, // Invalid chain ID
      }

      const result = SafeWalletVerificationService.validateSafeWalletConfig(invalidConfig)

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Invalid chain ID')
    })

    it('should reject invalid threshold', () => {
      const invalidConfig = {
        contractAddress: validWalletAddress,
        chainId: 80002,
        threshold: 0, // Invalid threshold
      }

      const result = SafeWalletVerificationService.validateSafeWalletConfig(invalidConfig)

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Invalid threshold value')
    })

    it('should reject empty owners array', () => {
      const invalidConfig = {
        contractAddress: validWalletAddress,
        chainId: 80002,
        owners: [], // Empty owners array
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
