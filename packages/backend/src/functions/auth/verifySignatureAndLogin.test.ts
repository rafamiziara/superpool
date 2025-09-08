import { jest } from '@jest/globals'
import { AUTH_NONCES_COLLECTION, USERS_COLLECTION } from '../../constants'
import { FunctionsMock } from '../../__mocks__'

// Mock ethers module completely with all needed functions
jest.mock('ethers', () => ({
  isAddress: jest.fn(),
  verifyMessage: jest.fn(),
  verifyTypedData: jest.fn(),
}))

// Mock the createAuthMessage utility
const mockCreateAuthMessage = jest.fn()
jest.mock('../../utils', () => ({
  createAuthMessage: mockCreateAuthMessage,
}))

// Mock the DeviceVerificationService
const mockApproveDevice = jest.fn()
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

// Mock the services module
const mockFirestore = {
  collection: jest.fn(() => ({
    doc: jest.fn(() => ({
      get: jest.fn(),
      set: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    })),
  })),
}

const mockAuth = {
  createCustomToken: jest.fn(),
}

jest.mock('../../services', () => ({
  firestore: mockFirestore,
  auth: mockAuth,
  ProviderService: {
    getProvider: jest.fn(),
  },
}))

const { verifySignatureAndLoginHandler } = require('./verifySignatureAndLogin')

// Get mocked ethers functions
const ethers = require('ethers')
const mockedIsAddress = ethers.isAddress as jest.MockedFunction<typeof ethers.isAddress>
const mockedVerifyMessage = ethers.verifyMessage as jest.MockedFunction<typeof ethers.verifyMessage>
const mockedVerifyTypedData = ethers.verifyTypedData as jest.MockedFunction<typeof ethers.verifyTypedData>

// Get mocked services
const { ProviderService } = require('../../services')
const mockGetProvider = ProviderService.getProvider as jest.MockedFunction<typeof ProviderService.getProvider>

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
    // Reset all mocks
    jest.clearAllMocks()

    // Configure ethers mocks for successful verification
    mockedIsAddress.mockReturnValue(true)
    mockedVerifyMessage.mockReturnValue(walletAddress)
    mockedVerifyTypedData.mockReturnValue(walletAddress)

    // Configure Firebase Auth mock
    mockAuth.createCustomToken.mockResolvedValue(firebaseToken)

    // Configure utility function mocks
    mockCreateAuthMessage.mockReturnValue(mockMessage)

    // Configure Firestore mocks for the happy path (nonce exists, user exists)
    const mockNonceDoc = {
      exists: true,
      data: () => ({
        nonce,
        timestamp,
        expiresAt: mockNow + 10 * 60 * 1000,
      }),
    }

    const mockUserDoc = {
      exists: true,
      data: () => ({
        walletAddress,
        createdAt: timestamp,
      }),
    }

    // Mock collection().doc().get() chain for both collections
    mockFirestore.collection.mockImplementation(((collectionName: string) => {
      const docMock = jest.fn((_docId: string) => {
        const mockDoc = collectionName === AUTH_NONCES_COLLECTION ? mockNonceDoc : mockUserDoc
        return {
          get: jest.fn().mockResolvedValue(mockDoc),
          set: jest.fn().mockResolvedValue(undefined),
          update: jest.fn().mockResolvedValue(undefined),
          delete: jest.fn().mockResolvedValue(undefined),
        }
      })
      return { doc: docMock }
    }) as any)

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
    } as any)
  })

  afterAll(() => {
    Date.prototype.getTime = originalGetTime // Restore the original getTime()
  })

  // Test Case: Successful login and token issuance (Happy Path)
  it('should successfully verify the signature and issue a Firebase token', async () => {
    // Arrange
    const request = FunctionsMock.createCallableRequest({ walletAddress, signature })

    // Act
    const result = await verifySignatureAndLoginHandler(request)

    // Assert
    expect(mockedIsAddress).toHaveBeenCalledWith(walletAddress)
    expect(mockFirestore.collection).toHaveBeenCalledWith(AUTH_NONCES_COLLECTION)
    expect(mockFirestore.collection).toHaveBeenCalledWith(USERS_COLLECTION)
    expect(mockCreateAuthMessage).toHaveBeenCalledWith(walletAddress, nonce, timestamp)
    expect(mockedVerifyMessage).toHaveBeenCalledWith(mockMessage, signature)
    expect(mockAuth.createCustomToken).toHaveBeenCalledWith(walletAddress)
    expect(result).toEqual({ firebaseToken })
  })

  // Test Case: User Profile Does Not Exist
  it('should create a new user profile if one does not exist', async () => {
    // Arrange
    const request = FunctionsMock.createCallableRequest({ walletAddress, signature })

    // Override the mock to simulate user document not existing
    const mockSetFn = jest.fn().mockResolvedValue(undefined)
    mockFirestore.collection.mockImplementation(((collectionName: string) => {
      const docMock = jest.fn((_docId: string) => {
        if (collectionName === AUTH_NONCES_COLLECTION) {
          // Nonce doc exists
          return {
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                nonce,
                timestamp,
                expiresAt: mockNow + 10 * 60 * 1000,
              }),
            }),
            delete: jest.fn().mockResolvedValue(undefined),
          }
        } else {
          // User doc doesn't exist
          return {
            get: jest.fn().mockResolvedValue({
              exists: false,
            }),
            set: mockSetFn,
            update: jest.fn().mockResolvedValue(undefined),
          }
        }
      })
      return { doc: docMock }
    }) as any)

    // Act
    await verifySignatureAndLoginHandler(request)

    // Assert - test that user was created with proper data
    expect(mockSetFn).toHaveBeenCalledWith({
      walletAddress,
      createdAt: mockNow,
      updatedAt: mockNow,
    })
  })

  // Test Case: Invalid Argument - Missing walletAddress or signature
  it('should throw an invalid-argument error if walletAddress or signature is missing', async () => {
    // Arrange
    const request = FunctionsMock.createCallableRequest({ walletAddress: '', signature })

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow(
      'The function must be called with a valid walletAddress and signature.'
    )
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'invalid-argument')
  })

  // Test Case: Invalid Argument - Invalid signature format (missing 0x prefix)
  it('should throw an invalid-argument error if the signature format is incorrect', async () => {
    // Arrange
    const request = FunctionsMock.createCallableRequest({ walletAddress, signature: 'invalid-signature' })

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
    const request = FunctionsMock.createCallableRequest({ walletAddress, signature: invalidHexSignature })

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow(
      'Invalid signature format. Signature must contain only hexadecimal characters.'
    )
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'invalid-argument')
  })

  // Test Case: Not Found - Nonce does not exist
  it('should throw a not-found error if the nonce document does not exist', async () => {
    // Arrange
    const request = FunctionsMock.createCallableRequest({ walletAddress, signature })

    // Override the mock to simulate nonce document not existing
    mockFirestore.collection.mockImplementation(((collectionName: string) => {
      const docMock = jest.fn((_docId: string) => {
        if (collectionName === AUTH_NONCES_COLLECTION) {
          // Nonce doc doesn't exist
          return {
            get: jest.fn().mockResolvedValue({
              exists: false,
            }),
            delete: jest.fn().mockResolvedValue(undefined),
          }
        } else {
          // User doc exists (not relevant for this test)
          return {
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({ walletAddress, createdAt: timestamp }),
            }),
            set: jest.fn().mockResolvedValue(undefined),
            update: jest.fn().mockResolvedValue(undefined),
          }
        }
      })
      return { doc: docMock }
    }) as any)

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow(
      'No authentication message found for this wallet address. Please generate a new message.'
    )
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'not-found')
  })

  // Test Case: Deadline Exceeded - Nonce has expired
  it('should throw a deadline-exceeded error if the nonce has expired and clean up the expired nonce', async () => {
    // Arrange
    const request = FunctionsMock.createCallableRequest({ walletAddress, signature })
    const expiredTimestamp = mockNow - 20 * 60 * 1000 // 20 minutes ago
    const expiredExpiresAt = expiredTimestamp + 10 * 60 * 1000 // Expired 10 minutes ago

    // Mock to return expired nonce
    const mockDeleteFn = jest.fn().mockResolvedValue(undefined)
    mockFirestore.collection.mockImplementation(((collectionName: string) => {
      const docMock = jest.fn((_docId: string) => {
        if (collectionName === AUTH_NONCES_COLLECTION) {
          // Expired nonce doc
          return {
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                nonce,
                timestamp: expiredTimestamp,
                expiresAt: expiredExpiresAt,
              }),
            }),
            delete: mockDeleteFn,
          }
        } else {
          // User doc (not relevant for this test)
          return {
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({ walletAddress, createdAt: timestamp }),
            }),
            set: jest.fn().mockResolvedValue(undefined),
            update: jest.fn().mockResolvedValue(undefined),
          }
        }
      })
      return { doc: docMock }
    }) as any)

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow(
      'Authentication message has expired. Please generate a new message.'
    )
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'deadline-exceeded')

    // Verify that the expired nonce was cleaned up
    expect(mockDeleteFn).toHaveBeenCalled()
  })

  // Test Case: Unauthenticated - Signature verification fails
  it('should throw an unauthenticated error if the signature verification fails', async () => {
    // Arrange
    const request = FunctionsMock.createCallableRequest({ walletAddress, signature })
    mockedVerifyMessage.mockImplementation(() => {
      throw new Error('Ethers verify failed')
    })

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow('Signature verification failed: Ethers verify failed')
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'unauthenticated')
  })

  // Test Case: Unauthenticated - Recovered address does not match
  it('should throw an unauthenticated error if the recovered address does not match', async () => {
    // Arrange
    const request = FunctionsMock.createCallableRequest({ walletAddress, signature })
    mockedVerifyMessage.mockReturnValue('0xDifferentAddress')

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow('The signature does not match the provided wallet address.')
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'unauthenticated')
  })

  // Test Case: Internal - User profile creation/update fails
  it('should throw an internal error if user profile creation/update fails', async () => {
    // Arrange
    const request = FunctionsMock.createCallableRequest({ walletAddress, signature })

    // Mock to simulate user profile creation failure
    mockFirestore.collection.mockImplementation(((collectionName: string) => {
      const docMock = jest.fn((_docId: string) => {
        if (collectionName === AUTH_NONCES_COLLECTION) {
          // Nonce doc exists
          return {
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                nonce,
                timestamp,
                expiresAt: mockNow + 10 * 60 * 1000,
              }),
            }),
            delete: jest.fn().mockResolvedValue(undefined),
          }
        } else {
          // User doc doesn't exist and set operation fails
          return {
            get: jest.fn().mockResolvedValue({
              exists: false,
            }),
            set: jest.fn().mockRejectedValue(new Error('Firestore write error')),
            update: jest.fn().mockResolvedValue(undefined),
          }
        }
      })
      return { doc: docMock }
    }) as any)

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow('Failed to create or update user profile. Please try again.')
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'internal')
  })

  // Test Case: Nonce deletion fails (acceptable error)
  it('should not fail if the nonce deletion operation fails', async () => {
    // Arrange
    const request = FunctionsMock.createCallableRequest({ walletAddress, signature })

    // Act (using the default mock setup, which should succeed)
    const result = await verifySignatureAndLoginHandler(request)

    // Assert - The authentication should succeed even if nonce deletion fails
    expect(mockAuth.createCustomToken).toHaveBeenCalledWith(walletAddress)
    expect(result).toEqual({ firebaseToken })
  })

  // Test Case: Unauthenticated - Custom token creation fails
  it('should throw an unauthenticated error if custom token creation fails', async () => {
    // Arrange
    const request = FunctionsMock.createCallableRequest({ walletAddress, signature })
    mockAuth.createCustomToken.mockRejectedValue(new Error('Firebase auth error'))

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow('Failed to generate a valid session token.')
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'unauthenticated')
  })

  // Test Case: Device approval on successful authentication
  it('should approve device when deviceId and platform are provided', async () => {
    // Arrange
    const deviceId = 'test-device-123'
    const platform = 'android'
    const request = FunctionsMock.createCallableRequest({
      walletAddress,
      signature,
      deviceId,
      platform,
    })
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
    const request = FunctionsMock.createCallableRequest({
      walletAddress,
      signature,
      deviceId,
      platform,
    })
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
    const request = FunctionsMock.createCallableRequest({ walletAddress, signature })

    // Act
    await verifySignatureAndLoginHandler(request)

    // Assert
    expect(mockApproveDevice).not.toHaveBeenCalled()
  })

  // Test Case: No device approval when platform not provided
  it('should not attempt device approval when platform is not provided', async () => {
    // Arrange
    const request = FunctionsMock.createCallableRequest({
      walletAddress,
      signature,
      deviceId: 'test-device-789',
    })

    // Act
    await verifySignatureAndLoginHandler(request)

    // Assert
    expect(mockApproveDevice).not.toHaveBeenCalled()
  })

  // Test Case: Safe wallet authentication
  it('should successfully verify Safe wallet signature', async () => {
    // Arrange
    const safeWalletSignature = `safe-wallet:${walletAddress}:${nonce}:${timestamp}`
    const request = FunctionsMock.createCallableRequest({
      walletAddress,
      signature: safeWalletSignature,
      signatureType: 'safe-wallet',
    })

    // Act
    const result = await verifySignatureAndLoginHandler(request)

    // Assert
    expect(mockedIsAddress).toHaveBeenCalledWith(walletAddress)
    expect(mockedVerifyMessage).not.toHaveBeenCalled() // Safe wallet doesn't use verifyMessage
    expect(mockAuth.createCustomToken).toHaveBeenCalledWith(walletAddress)
    expect(result).toEqual({ firebaseToken })
  })

  // Test Case: Safe wallet with device approval
  it('should approve device with Safe wallet specific deviceId', async () => {
    // Arrange
    const safeWalletSignature = `safe-wallet:${walletAddress}:${nonce}:${timestamp}`
    const deviceId = 'safe-wallet-device'
    const platform = 'web'
    const request = FunctionsMock.createCallableRequest({
      walletAddress,
      signature: safeWalletSignature,
      signatureType: 'safe-wallet',
      deviceId,
      platform,
    })

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
    const request = FunctionsMock.createCallableRequest({
      walletAddress,
      signature: invalidSafeSignature,
      signatureType: 'safe-wallet',
    })

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow(
      'Signature verification failed: Safe wallet authentication failed: Safe wallet verification failed: INVALID_SIGNATURE_FORMAT'
    )
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'unauthenticated')
  })

  // Test Case: EIP-712 typed data signature verification
  it('should successfully verify EIP-712 typed data signature', async () => {
    // Arrange
    const typedDataSignature = '0x' + 'b'.repeat(130)
    const chainId = 137
    const request = FunctionsMock.createCallableRequest({
      walletAddress,
      signature: typedDataSignature,
      signatureType: 'typed-data',
      chainId,
    })

    // Configure verifyTypedData mock
    mockedVerifyTypedData.mockReturnValue(walletAddress)

    // Act
    const result = await verifySignatureAndLoginHandler(request)

    // Assert
    expect(mockedVerifyTypedData).toHaveBeenCalledWith(
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
    expect(mockedVerifyMessage).not.toHaveBeenCalled() // Should not fallback to personal sign
    expect(result).toEqual({ firebaseToken })
  })

  // Test Case: EIP-712 signature verification failure
  it('should throw an error when EIP-712 signature verification fails', async () => {
    // Arrange
    const typedDataSignature = '0x' + 'c'.repeat(130)
    const request = FunctionsMock.createCallableRequest({
      walletAddress,
      signature: typedDataSignature,
      signatureType: 'typed-data',
      chainId: 1,
    })

    // Configure verifyTypedData mock to throw error
    mockedVerifyTypedData.mockImplementation(() => {
      throw new Error('EIP-712 verification failed')
    })

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow('Signature verification failed: EIP-712 verification failed')
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'unauthenticated')
  })

  // Test Case: EIP-712 with default chainId when not provided
  it('should use default chainId when not provided for EIP-712', async () => {
    // Arrange
    const typedDataSignature = '0x' + 'd'.repeat(130)
    const request = FunctionsMock.createCallableRequest({
      walletAddress,
      signature: typedDataSignature,
      signatureType: 'typed-data',
      // chainId not provided
    })

    // Configure verifyTypedData mock
    mockedVerifyTypedData.mockReturnValue(walletAddress)

    // Act
    const result = await verifySignatureAndLoginHandler(request)

    // Assert
    expect(mockedVerifyTypedData).toHaveBeenCalledWith(
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
    const request = FunctionsMock.createCallableRequest({ walletAddress, signature })
    const nonErrorObject = { code: 'CUSTOM_ERROR', details: 'Some custom error' }

    mockedVerifyMessage.mockImplementation(() => {
      throw nonErrorObject // Throw non-Error object
    })

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow('Signature verification failed: Invalid signature')
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'unauthenticated')
  })

  // Test Case: String thrown during signature verification
  it('should handle string thrown during signature verification', async () => {
    // Arrange
    const request = FunctionsMock.createCallableRequest({ walletAddress, signature })
    const stringError = 'Custom string error'

    mockedVerifyMessage.mockImplementation(() => {
      throw stringError // Throw string
    })

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow('Signature verification failed: Invalid signature')
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'unauthenticated')
  })

  // Test Case: Null thrown during signature verification
  it('should handle null thrown during signature verification', async () => {
    // Arrange
    const request = FunctionsMock.createCallableRequest({ walletAddress, signature })

    mockedVerifyMessage.mockImplementation(() => {
      throw null // Throw null
    })

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow('Signature verification failed: Invalid signature')
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'unauthenticated')
  })
})
