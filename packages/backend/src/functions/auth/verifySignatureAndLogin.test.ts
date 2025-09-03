import { jest } from '@jest/globals'
import { isAddress, verifyMessage } from 'ethers'
import { AUTH_NONCES_COLLECTION, USERS_COLLECTION } from '../../constants'

// Type definitions for Firebase Firestore mock functions
type DeleteFunction = () => Promise<void>
type UpdateFunction = () => Promise<void>
type SetFunction = () => Promise<void>
type CreateCustomTokenFunction = () => Promise<string>

// Mock the delete method specifically for the nonce document
const mockDelete = jest.fn<DeleteFunction>()
const mockUpdate = jest.fn<UpdateFunction>()
const mockSet = jest.fn<SetFunction>()

const mockNonceDoc = {
  get: jest.fn(() =>
    createMockDocumentSnapshot(true, { nonce: 'test-nonce', timestamp: 1234567890, expiresAt: 1678886400000 + 10 * 60 * 1000 })
  ),
  delete: mockDelete,
}

const mockUserDoc = {
  get: jest.fn(() => Promise.resolve(createMockDocumentSnapshot(true, { walletAddress: '0x1234', createdAt: 1234567890 }))),
  update: mockUpdate,
  set: mockSet,
}

const mockCollection = jest.fn((collectionName) => {
  if (collectionName === AUTH_NONCES_COLLECTION) {
    return { doc: () => mockNonceDoc }
  }

  if (collectionName === USERS_COLLECTION) {
    return { doc: () => mockUserDoc }
  }

  return { doc: jest.fn() }
})

const mockFirestore = { collection: mockCollection }

jest.mock('firebase-admin/firestore', () => {
  const actualFirestore = jest.requireActual('firebase-admin/firestore') as any

  return {
    getFirestore: () => mockFirestore,
    Timestamp: actualFirestore.Timestamp,
  }
})

const mockCreateCustomToken = jest.fn<CreateCustomTokenFunction>()
const mockAuth = jest.fn(() => ({ createCustomToken: mockCreateCustomToken }))

jest.mock('firebase-admin/auth', () => ({
  getAuth: mockAuth,
}))

// Mock the ethers library
jest.mock('ethers', () => ({
  isAddress: jest.fn<typeof isAddress>(),
  verifyMessage: jest.fn<typeof verifyMessage>(),
  verifyTypedData: jest.fn(),
}))

// Mock the createAuthMessage utility
const mockCreateAuthMessage = jest.fn()
jest.mock('../../utils', () => ({
  createAuthMessage: mockCreateAuthMessage,
}))

// Mock the DeviceVerificationService
const mockApproveDevice = jest.fn() as jest.MockedFunction<
  (deviceId: string, walletAddress: string, platform: 'android' | 'ios' | 'web') => Promise<void>
>
jest.mock('../../services/deviceVerification', () => ({
  DeviceVerificationService: {
    approveDevice: mockApproveDevice,
  },
}))

// Mock the SafeWalletVerificationService
const mockSafeWalletVerification = jest.fn()
jest.mock('../../utils/safeWalletVerification', () => ({
  SafeWalletVerificationService: {
    verifySafeWalletSignature: mockSafeWalletVerification,
  },
}))

// Mock the ProviderService
const mockGetProvider = jest.fn()
jest.mock('../../services/providerService', () => ({
  ProviderService: {
    getProvider: mockGetProvider,
  },
}))

const { verifySignatureAndLoginHandler } = require('./verifySignatureAndLogin')
const { createMockDocumentSnapshot } = require('../../utils/firestore-mock')

describe('verifySignatureAndLoginHandler', () => {
  const walletAddress = '0x1234567890123456789012345678901234567890'
  const mockMessage = 'test-message'
  const timestamp = 1234567890
  const signature = '0x' + 'a'.repeat(130)
  const nonce = 'test-nonce'
  const firebaseToken = 'test-firebase-token'

  // Mock the date to have a predictable 'now'
  const mockNow = 1678886400000
  const originalGetTime = Date.prototype.getTime

  beforeAll(() => {
    Date.prototype.getTime = () => mockNow
  })

  beforeEach(() => {
    jest.clearAllMocks()

    // Mock functions for a successful run
    jest.mocked(isAddress).mockReturnValue(true)
    jest.mocked(verifyMessage).mockReturnValue(walletAddress)
    const { verifyTypedData } = require('ethers')
    jest.mocked(verifyTypedData).mockReturnValue(walletAddress)
    mockCreateAuthMessage.mockReturnValue(mockMessage)
    mockCreateCustomToken.mockResolvedValue(firebaseToken)

    // Explicitly mock the Firestore calls for the happy path (nonce exists, user exists)
    mockNonceDoc.get.mockResolvedValue(createMockDocumentSnapshot(true, { nonce, timestamp, expiresAt: mockNow + 10 * 60 * 1000 }))
    mockUserDoc.get.mockResolvedValue(createMockDocumentSnapshot(true, { walletAddress, createdAt: timestamp }))

    // Set up the mocks for the other calls
    mockSet.mockResolvedValue(null as any)
    mockUpdate.mockResolvedValue(null as any)
    mockDelete.mockResolvedValue(null as any)

    mockCreateAuthMessage.mockReturnValue(mockMessage)
    mockCreateCustomToken.mockResolvedValue(firebaseToken)

    // Mock SafeWalletVerificationService with conditional behavior
    mockSafeWalletVerification.mockImplementation(async (walletAddr, signature) => {
      // Check if signature format is invalid (for the specific test case)
      if (signature === `safe-wallet:${walletAddr}:invalid:format`) {
        return {
          isValid: false,
          verification: {
            signatureValidation: false,
            ownershipVerification: false,
            thresholdCheck: false,
            safeVersionCompatibility: false,
            verificationMethod: 'fallback',
            contractAddress: walletAddr,
          },
          error: 'INVALID_SIGNATURE_FORMAT',
        }
      }

      // Default successful verification for other cases
      return {
        isValid: true,
        verification: {
          signatureValidation: true,
          ownershipVerification: true,
          thresholdCheck: true,
          safeVersionCompatibility: true,
          verificationMethod: 'eip1271',
          contractAddress: walletAddr,
        },
        warnings: [],
      }
    })

    // Mock ProviderService
    mockGetProvider.mockReturnValue({
      getNetwork: jest.fn(),
      getBlockNumber: jest.fn(),
    })
  })

  afterAll(() => {
    Date.prototype.getTime = originalGetTime // Restore the original getTime()
  })

  // Test Case: Successful login and token issuance (Happy Path)
  it('should successfully verify the signature and issue a Firebase token', async () => {
    // Arrange
    const request = { data: { walletAddress, signature } }

    // Act
    const result = await verifySignatureAndLoginHandler(request)

    // Assert
    expect(isAddress).toHaveBeenCalledWith(walletAddress)
    expect(mockCollection).toHaveBeenCalledWith(AUTH_NONCES_COLLECTION)
    expect(mockCollection).toHaveBeenCalledWith(USERS_COLLECTION)
    expect(mockNonceDoc.get).toHaveBeenCalledTimes(1)
    expect(mockUserDoc.get).toHaveBeenCalledTimes(1)
    expect(mockCreateAuthMessage).toHaveBeenCalledWith(walletAddress, nonce, timestamp)
    expect(verifyMessage).toHaveBeenCalledWith(mockMessage, signature)
    expect(mockCollection).toHaveBeenCalledWith(USERS_COLLECTION)
    expect(mockUpdate).toHaveBeenCalledWith({ updatedAt: mockNow })
    expect(mockDelete).toHaveBeenCalled()
    expect(mockCreateCustomToken).toHaveBeenCalledWith(walletAddress)
    expect(result).toEqual({ firebaseToken })
  })

  // Test Case: User Profile Does Not Exist
  it('should create a new user profile if one does not exist', async () => {
    // Arrange
    const request = { data: { walletAddress, signature } }
    mockNonceDoc.get.mockResolvedValue(createMockDocumentSnapshot(true, { nonce, timestamp, expiresAt: mockNow + 10 * 60 * 1000 }))
    mockUserDoc.get.mockResolvedValue(createMockDocumentSnapshot(false))

    // Act
    await verifySignatureAndLoginHandler(request)

    // Assert
    expect(mockSet).toHaveBeenCalledWith({ walletAddress, createdAt: mockNow, updatedAt: mockNow })
  })

  // Test Case: Invalid Argument - Missing walletAddress or signature
  it('should throw an invalid-argument error if walletAddress or signature is missing', async () => {
    // Arrange
    const request = { data: { walletAddress: '', signature } }

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow(
      'The function must be called with a valid walletAddress and signature.'
    )
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'invalid-argument')
  })

  // Test Case: Invalid Argument - Invalid signature format (missing 0x prefix)
  it('should throw an invalid-argument error if the signature format is incorrect', async () => {
    // Arrange
    const request = { data: { walletAddress, signature: 'invalid-signature' } }

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow(
      'Invalid signature format. It must be a hex string prefixed with "0x".'
    )
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'invalid-argument')
  })

  // Test Case: Invalid Argument - Invalid hex characters in signature
  it('should throw an invalid-argument error if signature contains invalid hex characters', async () => {
    // Arrange - signature with invalid characters (G, H not valid hex)
    const invalidHexSignature = '0x' + 'G'.repeat(10)
    const request = { data: { walletAddress, signature: invalidHexSignature } }

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow(
      'Invalid signature format. Signature must contain only hexadecimal characters.'
    )
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'invalid-argument')
  })

  // Test Case: Not Found - Nonce does not exist
  it('should throw a not-found error if the nonce document does not exist', async () => {
    // Arrange
    const request = { data: { walletAddress, signature } }
    mockNonceDoc.get.mockResolvedValue(createMockDocumentSnapshot(false))

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow(
      'No authentication message found for this wallet address. Please generate a new message.'
    )
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'not-found')
  })

  // Test Case: Deadline Exceeded - Nonce has expired
  it('should throw a deadline-exceeded error if the nonce has expired and clean up the expired nonce', async () => {
    // Arrange
    const request = { data: { walletAddress, signature } }
    const expiredTimestamp = mockNow - 20 * 60 * 1000 // 20 minutes ago
    const expiredExpiresAt = expiredTimestamp + 10 * 60 * 1000 // Expired 10 minutes ago
    mockNonceDoc.get.mockResolvedValue(
      createMockDocumentSnapshot(true, {
        nonce,
        timestamp: expiredTimestamp,
        expiresAt: expiredExpiresAt,
      })
    )

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow(
      'Authentication message has expired. Please generate a new message.'
    )
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'deadline-exceeded')

    // Verify that the expired nonce was cleaned up
    expect(mockDelete).toHaveBeenCalled()
  })

  // Test Case: Unauthenticated - Signature verification fails
  it('should throw an unauthenticated error if the signature verification fails', async () => {
    // Arrange
    const request = { data: { walletAddress, signature } }
    jest.mocked(verifyMessage).mockImplementation(() => {
      throw new Error('Ethers verify failed')
    })

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow('Signature verification failed: Ethers verify failed')
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'unauthenticated')
  })

  // Test Case: Unauthenticated - Recovered address does not match
  it('should throw an unauthenticated error if the recovered address does not match', async () => {
    // Arrange
    const request = { data: { walletAddress, signature } }
    jest.mocked(verifyMessage).mockReturnValue('0xDifferentAddress')

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow('The signature does not match the provided wallet address.')
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'unauthenticated')
  })

  // Test Case: Internal - User profile creation/update fails
  it('should throw an internal error if user profile creation/update fails', async () => {
    // Arrange
    const request = { data: { walletAddress, signature } }
    mockUserDoc.get.mockResolvedValue(createMockDocumentSnapshot(false))
    mockSet.mockRejectedValue(new Error('Firestore write error'))

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow('Failed to create or update user profile. Please try again.')
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'internal')
  })

  // Test Case: Nonce deletion fails (acceptable error)
  it('should not fail if the nonce deletion operation fails', async () => {
    // Arrange
    const request = { data: { walletAddress, signature } }
    mockDelete.mockRejectedValue(new Error('Nonce deletion failed'))

    // Act
    const result = await verifySignatureAndLoginHandler(request)

    // Assert
    expect(mockDelete).toHaveBeenCalled()
    expect(mockCreateCustomToken).toHaveBeenCalledWith(walletAddress)
    expect(result).toEqual({ firebaseToken })
  })

  // Test Case: Unauthenticated - Custom token creation fails
  it('should throw an unauthenticated error if custom token creation fails', async () => {
    // Arrange
    const request = { data: { walletAddress, signature } }
    mockCreateCustomToken.mockRejectedValue(new Error('Firebase auth error'))

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow('Failed to generate a valid session token.')
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'unauthenticated')
  })

  // Test Case: Device approval on successful authentication
  it('should approve device when deviceId and platform are provided', async () => {
    // Arrange
    const deviceId = 'test-device-123'
    const platform = 'android'
    const request = {
      data: {
        walletAddress,
        signature,
        deviceId,
        platform,
      },
    }
    mockApproveDevice.mockResolvedValue(undefined)

    // Act
    const result = await verifySignatureAndLoginHandler(request)

    // Assert
    expect(mockApproveDevice).toHaveBeenCalledWith(deviceId, walletAddress, platform)
    expect(result).toEqual({ firebaseToken })
  })

  // Test Case: Authentication succeeds even if device approval fails
  it('should continue authentication even if device approval fails', async () => {
    // Arrange
    const deviceId = 'test-device-456'
    const platform = 'ios'
    const request = {
      data: {
        walletAddress,
        signature,
        deviceId,
        platform,
      },
    }
    mockApproveDevice.mockRejectedValue(new Error('Device approval failed'))

    // Spy on logger.error to verify it's called (logger is used instead of console in actual code)
    const loggerSpy = jest.spyOn(require('firebase-functions/v2').logger, 'error').mockImplementation(() => {})

    // Act
    const result = await verifySignatureAndLoginHandler(request)

    // Assert
    expect(mockApproveDevice).toHaveBeenCalledWith(deviceId, walletAddress, platform)
    expect(loggerSpy).toHaveBeenCalledWith(
      'Failed to approve device',
      expect.objectContaining({
        error: expect.any(Error),
        deviceId,
        walletAddress,
        signatureType: 'personal-sign',
      })
    )
    expect(result).toEqual({ firebaseToken })

    loggerSpy.mockRestore()
  })

  // Test Case: No device approval when deviceId not provided
  it('should not attempt device approval when deviceId is not provided', async () => {
    // Arrange
    const request = { data: { walletAddress, signature } }

    // Act
    await verifySignatureAndLoginHandler(request)

    // Assert
    expect(mockApproveDevice).not.toHaveBeenCalled()
  })

  // Test Case: No device approval when platform not provided
  it('should not attempt device approval when platform is not provided', async () => {
    // Arrange
    const request = {
      data: {
        walletAddress,
        signature,
        deviceId: 'test-device-789',
      },
    }

    // Act
    await verifySignatureAndLoginHandler(request)

    // Assert
    expect(mockApproveDevice).not.toHaveBeenCalled()
  })

  // Test Case: Safe wallet authentication
  it('should successfully verify Safe wallet signature', async () => {
    // Arrange
    const safeWalletSignature = `safe-wallet:${walletAddress}:${nonce}:${timestamp}`
    const request = {
      data: {
        walletAddress,
        signature: safeWalletSignature,
        signatureType: 'safe-wallet',
      },
    }

    // Act
    const result = await verifySignatureAndLoginHandler(request)

    // Assert
    expect(isAddress).toHaveBeenCalledWith(walletAddress)
    expect(verifyMessage).not.toHaveBeenCalled() // Safe wallet doesn't use verifyMessage
    expect(mockCreateCustomToken).toHaveBeenCalledWith(walletAddress)
    expect(result).toEqual({ firebaseToken })
  })

  // Test Case: Safe wallet with device approval
  it('should approve device with Safe wallet specific deviceId', async () => {
    // Arrange
    const safeWalletSignature = `safe-wallet:${walletAddress}:${nonce}:${timestamp}`
    const deviceId = 'safe-wallet-device'
    const platform = 'web'
    const request = {
      data: {
        walletAddress,
        signature: safeWalletSignature,
        signatureType: 'safe-wallet',
        deviceId,
        platform,
      },
    }

    // Act
    const result = await verifySignatureAndLoginHandler(request)

    // Assert
    const expectedDeviceId = `safe-wallet-${walletAddress.toLowerCase()}`
    expect(mockApproveDevice).toHaveBeenCalledWith(expectedDeviceId, walletAddress, platform)
    expect(result).toEqual({ firebaseToken })
  })

  // Test Case: Safe wallet invalid signature format
  it('should throw an error for invalid Safe wallet signature format', async () => {
    // Arrange
    const invalidSafeSignature = `safe-wallet:${walletAddress}:invalid:format`
    const request = {
      data: {
        walletAddress,
        signature: invalidSafeSignature,
        signatureType: 'safe-wallet',
      },
    }

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow(
      'Signature verification failed: Safe wallet authentication failed: Safe wallet verification failed: INVALID_SIGNATURE_FORMAT'
    )
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'unauthenticated')
  })

  // Test Case: EIP-712 typed data signature verification
  it('should successfully verify EIP-712 typed data signature', async () => {
    // Arrange
    const { verifyTypedData } = require('ethers')
    const typedDataSignature = '0x' + 'b'.repeat(130)
    const chainId = 137
    const request = {
      data: {
        walletAddress,
        signature: typedDataSignature,
        signatureType: 'typed-data',
        chainId,
      },
    }

    jest.mocked(verifyTypedData).mockReturnValue(walletAddress)

    // Act
    const result = await verifySignatureAndLoginHandler(request)

    // Assert
    expect(verifyTypedData).toHaveBeenCalledWith(
      {
        name: 'SuperPool Authentication',
        version: '1',
        chainId,
      },
      {
        Authentication: [
          { name: 'wallet', type: 'address' },
          { name: 'nonce', type: 'string' },
          { name: 'timestamp', type: 'uint256' },
        ],
      },
      {
        wallet: walletAddress,
        nonce,
        timestamp: BigInt(Math.floor(timestamp)),
      },
      typedDataSignature
    )
    expect(verifyMessage).not.toHaveBeenCalled() // Should not fallback to personal sign
    expect(result).toEqual({ firebaseToken })
  })

  // Test Case: EIP-712 signature verification failure
  it('should throw an error when EIP-712 signature verification fails', async () => {
    // Arrange
    const { verifyTypedData } = require('ethers')
    const typedDataSignature = '0x' + 'c'.repeat(130)
    const request = {
      data: {
        walletAddress,
        signature: typedDataSignature,
        signatureType: 'typed-data',
        chainId: 1,
      },
    }

    jest.mocked(verifyTypedData).mockImplementation(() => {
      throw new Error('EIP-712 verification failed')
    })

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow('Signature verification failed: EIP-712 verification failed')
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'unauthenticated')
  })

  // Test Case: EIP-712 with default chainId when not provided
  it('should use default chainId when not provided for EIP-712', async () => {
    // Arrange
    const { verifyTypedData } = require('ethers')
    const typedDataSignature = '0x' + 'd'.repeat(130)
    const request = {
      data: {
        walletAddress,
        signature: typedDataSignature,
        signatureType: 'typed-data',
        // chainId not provided
      },
    }

    jest.mocked(verifyTypedData).mockReturnValue(walletAddress)

    // Act
    const result = await verifySignatureAndLoginHandler(request)

    // Assert
    expect(verifyTypedData).toHaveBeenCalledWith(
      {
        name: 'SuperPool Authentication',
        version: '1',
        chainId: 1, // Should default to 1
      },
      expect.any(Object),
      expect.any(Object),
      typedDataSignature
    )
    expect(result).toEqual({ firebaseToken })
  })

  // Test Case: Non-Error object thrown during signature verification
  it('should handle non-Error objects thrown during signature verification', async () => {
    // Arrange
    const request = { data: { walletAddress, signature } }
    const nonErrorObject = { code: 'CUSTOM_ERROR', details: 'Some custom error' }

    jest.mocked(verifyMessage).mockImplementation(() => {
      throw nonErrorObject // Throw non-Error object
    })

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow('Signature verification failed: Invalid signature')
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'unauthenticated')
  })

  // Test Case: String thrown during signature verification
  it('should handle string thrown during signature verification', async () => {
    // Arrange
    const request = { data: { walletAddress, signature } }
    const stringError = 'Custom string error'

    jest.mocked(verifyMessage).mockImplementation(() => {
      throw stringError // Throw string
    })

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow('Signature verification failed: Invalid signature')
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'unauthenticated')
  })

  // Test Case: Null thrown during signature verification
  it('should handle null thrown during signature verification', async () => {
    // Arrange
    const request = { data: { walletAddress, signature } }

    jest.mocked(verifyMessage).mockImplementation(() => {
      throw null // Throw null
    })

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow('Signature verification failed: Invalid signature')
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'unauthenticated')
  })
})
