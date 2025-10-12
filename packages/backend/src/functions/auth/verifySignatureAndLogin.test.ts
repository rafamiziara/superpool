import { AUTH_NONCES_COLLECTION, USERS_COLLECTION } from '../../constants'
import { mockLogger } from '../../__tests__/setup'

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

// Import mocked services and functions
const { firestore, auth } = require('../../services')
const ethers = require('ethers')
const { verifySignatureAndLoginHandler } = require('./verifySignatureAndLogin')

// Get mocked ethers functions
const mockedIsAddress = ethers.isAddress as jest.MockedFunction<typeof ethers.isAddress>
const mockedVerifyMessage = ethers.verifyMessage as jest.MockedFunction<typeof ethers.verifyMessage>
const mockedVerifyTypedData = ethers.verifyTypedData as jest.MockedFunction<typeof ethers.verifyTypedData>

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

    // Configure ethers mocks for successful verification
    mockedIsAddress.mockReturnValue(true)
    mockedVerifyMessage.mockReturnValue(walletAddress)
    mockedVerifyTypedData.mockReturnValue(walletAddress)

    // Configure Firebase Auth mock
    auth.createCustomToken.mockResolvedValue(firebaseToken)

    // Configure utility function mocks
    mockCreateAuthMessage.mockReturnValue(mockMessage)

    // Configure Firestore mocks for the happy path
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

    // Mock firestore collection/doc chain
    firestore.collection.mockImplementation((collectionName: string) => {
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
    })
  })

  afterAll(() => {
    Date.prototype.getTime = originalGetTime
  })

  // Test Case: Successful login and token issuance (Happy Path)
  it('should successfully verify the signature and issue a Firebase token', async () => {
    // Arrange
    const request = { data: { walletAddress, signature } }

    // Act
    const result = await verifySignatureAndLoginHandler(request)

    // Assert
    expect(mockedIsAddress).toHaveBeenCalledWith(walletAddress)
    expect(firestore.collection).toHaveBeenCalledWith(AUTH_NONCES_COLLECTION)
    expect(firestore.collection).toHaveBeenCalledWith(USERS_COLLECTION)
    expect(mockCreateAuthMessage).toHaveBeenCalledWith(walletAddress, nonce, timestamp)
    expect(mockedVerifyMessage).toHaveBeenCalledWith(mockMessage, signature)
    expect(auth.createCustomToken).toHaveBeenCalledWith(walletAddress)
    expect(result).toEqual({ firebaseToken, user: expect.objectContaining({ walletAddress }) })
  })

  // Test Case: User Profile Does Not Exist
  it('should create a new user profile if one does not exist', async () => {
    // Arrange
    const request = { data: { walletAddress, signature } }
    const mockSetFn = jest.fn().mockResolvedValue(undefined)

    firestore.collection.mockImplementation((collectionName: string) => {
      const docMock = jest.fn((_docId: string) => {
        if (collectionName === AUTH_NONCES_COLLECTION) {
          return {
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({ nonce, timestamp, expiresAt: mockNow + 10 * 60 * 1000 }),
            }),
            delete: jest.fn().mockResolvedValue(undefined),
          }
        } else {
          return {
            get: jest.fn().mockResolvedValue({ exists: false }),
            set: mockSetFn,
            update: jest.fn().mockResolvedValue(undefined),
          }
        }
      })
      return { doc: docMock }
    })

    // Act
    await verifySignatureAndLoginHandler(request)

    // Assert
    expect(mockSetFn).toHaveBeenCalledWith({
      walletAddress,
      createdAt: mockNow,
      updatedAt: mockNow,
    })
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
    // Arrange
    const invalidHexSignature = '0x' + 'G'.repeat(130) // 132 chars total, correct length but invalid hex
    const request = { data: { walletAddress, signature: invalidHexSignature } }

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow(
      'Invalid signature format. Signature must contain only hexadecimal characters.'
    )
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'invalid-argument')
  })

  // Test Case: Invalid Argument - Signature too short (< 132 chars)
  it('should throw an invalid-argument error if signature is too short', async () => {
    // Arrange
    const shortSignature = '0x' + 'a'.repeat(100) // 102 chars total
    const request = { data: { walletAddress, signature: shortSignature } }

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow(
      'Invalid signature format. It must be a hex string prefixed with "0x".'
    )
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'invalid-argument')
  })

  // Test Case: Invalid Argument - Signature too long (> 132 chars)
  it('should throw an invalid-argument error if signature is too long', async () => {
    // Arrange
    const longSignature = '0x' + 'a'.repeat(150) // 152 chars total
    const request = { data: { walletAddress, signature: longSignature } }

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow(
      'Invalid signature format. It must be a hex string prefixed with "0x".'
    )
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'invalid-argument')
  })

  // Test Case: Not Found - Nonce does not exist
  it('should throw a not-found error if the nonce document does not exist', async () => {
    // Arrange
    const request = { data: { walletAddress, signature } }

    firestore.collection.mockImplementation((collectionName: string) => {
      const docMock = jest.fn((_docId: string) => {
        if (collectionName === AUTH_NONCES_COLLECTION) {
          return {
            get: jest.fn().mockResolvedValue({ exists: false }),
            delete: jest.fn().mockResolvedValue(undefined),
          }
        } else {
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
    })

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
    const expiredTimestamp = mockNow - 20 * 60 * 1000
    const expiredExpiresAt = expiredTimestamp + 10 * 60 * 1000
    const mockDeleteFn = jest.fn().mockResolvedValue(undefined)

    firestore.collection.mockImplementation((collectionName: string) => {
      const docMock = jest.fn((_docId: string) => {
        if (collectionName === AUTH_NONCES_COLLECTION) {
          return {
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({ nonce, timestamp: expiredTimestamp, expiresAt: expiredExpiresAt }),
            }),
            delete: mockDeleteFn,
          }
        } else {
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
    })

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow(
      'Authentication message has expired. Please generate a new message.'
    )
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'deadline-exceeded')
    expect(mockDeleteFn).toHaveBeenCalled()
  })

  // Test Case: Unauthenticated - Signature verification fails
  it('should throw an unauthenticated error if the signature verification fails', async () => {
    // Arrange
    const request = { data: { walletAddress, signature } }
    mockedVerifyMessage.mockImplementation(() => {
      throw new Error('Ethers verify failed')
    })

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow('Invalid signature or expired nonce. Please try again.')
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'unauthenticated')
  })

  // Test Case: Unauthenticated - Recovered address does not match
  it('should throw an unauthenticated error if the recovered address does not match', async () => {
    // Arrange
    const request = { data: { walletAddress, signature } }
    mockedVerifyMessage.mockReturnValue('0xDifferentAddress')

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow('The signature does not match the provided wallet address.')
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'unauthenticated')
  })

  // Test Case: Internal - User profile creation/update fails
  it('should throw an internal error if user profile creation/update fails', async () => {
    // Arrange
    const request = { data: { walletAddress, signature } }

    firestore.collection.mockImplementation((collectionName: string) => {
      const docMock = jest.fn((_docId: string) => {
        if (collectionName === AUTH_NONCES_COLLECTION) {
          return {
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({ nonce, timestamp, expiresAt: mockNow + 10 * 60 * 1000 }),
            }),
            delete: jest.fn().mockResolvedValue(undefined),
          }
        } else {
          return {
            get: jest.fn().mockResolvedValue({ exists: false }),
            set: jest.fn().mockRejectedValue(new Error('Firestore write error')),
            update: jest.fn().mockResolvedValue(undefined),
          }
        }
      })
      return { doc: docMock }
    })

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow('Failed to create or update user profile. Please try again.')
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'internal')
  })

  // Test Case: SECURITY - Nonce deletion fails (must fail authentication to prevent replay attacks)
  it('should fail authentication if nonce deletion fails to prevent replay attacks', async () => {
    // Arrange
    const request = { data: { walletAddress, signature } }
    const mockDeleteFn = jest.fn().mockRejectedValue(new Error('Firestore delete error'))

    firestore.collection.mockImplementation((collectionName: string) => {
      const docMock = jest.fn((_docId: string) => {
        if (collectionName === AUTH_NONCES_COLLECTION) {
          return {
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({ nonce, timestamp, expiresAt: mockNow + 10 * 60 * 1000 }),
            }),
            delete: mockDeleteFn,
          }
        } else {
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
    })

    // Act & Assert
    // SECURITY - must fail authentication to prevent replay attacks
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow('Firestore delete error')
    expect(mockDeleteFn).toHaveBeenCalled()
    expect(auth.createCustomToken).not.toHaveBeenCalled()
  })

  // Test Case: Unauthenticated - Custom token creation fails
  it('should throw an unauthenticated error if custom token creation fails', async () => {
    // Arrange
    const request = { data: { walletAddress, signature } }
    auth.createCustomToken.mockRejectedValue(new Error('Firebase auth error'))

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow('Failed to generate a valid session token.')
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'unauthenticated')
  })

  // Test Case: Device approval on successful authentication
  it('should approve device when deviceId and platform are provided', async () => {
    // Arrange
    const deviceId = 'test-device-123'
    const platform = 'android'
    const request = { data: { walletAddress, signature, deviceId, platform } }
    mockApproveDevice.mockResolvedValue(undefined)

    // Act
    const result = await verifySignatureAndLoginHandler(request)

    // Assert
    expect(mockApproveDevice).toHaveBeenCalledWith(deviceId, walletAddress, platform)
    expect(result).toEqual({ firebaseToken, user: expect.objectContaining({ walletAddress }) })
  })

  // Test Case: Authentication succeeds even if device approval fails
  it('should continue authentication even if device approval fails', async () => {
    // Arrange
    const deviceId = 'test-device-456'
    const platform = 'ios'
    const request = { data: { walletAddress, signature, deviceId, platform } }
    mockApproveDevice.mockRejectedValue(new Error('Device approval failed'))

    // Act
    const result = await verifySignatureAndLoginHandler(request)

    // Assert
    expect(mockApproveDevice).toHaveBeenCalledWith(deviceId, walletAddress, platform)
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to approve device',
      expect.objectContaining({
        error: expect.any(Error),
        deviceId,
        walletAddress,
        signatureType: 'personal-sign',
      })
    )
    expect(result).toEqual({ firebaseToken, user: expect.objectContaining({ walletAddress }) })
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
    const request = { data: { walletAddress, signature, deviceId: 'test-device-789' } }

    // Act
    await verifySignatureAndLoginHandler(request)

    // Assert
    expect(mockApproveDevice).not.toHaveBeenCalled()
  })

  // Test Case: EIP-712 typed data signature verification
  it('should successfully verify EIP-712 typed data signature', async () => {
    // Arrange
    const typedDataSignature = '0x' + 'b'.repeat(130)
    const chainId = 137
    const request = { data: { walletAddress, signature: typedDataSignature, signatureType: 'typed-data', chainId } }

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
    expect(mockedVerifyMessage).not.toHaveBeenCalled()
    expect(result).toEqual({ firebaseToken, user: expect.objectContaining({ walletAddress }) })
  })

  // Test Case: EIP-712 signature verification failure
  it('should throw an error when EIP-712 signature verification fails', async () => {
    // Arrange
    const typedDataSignature = '0x' + 'c'.repeat(130)
    const request = { data: { walletAddress, signature: typedDataSignature, signatureType: 'typed-data', chainId: 1 } }

    mockedVerifyTypedData.mockImplementation(() => {
      throw new Error('EIP-712 verification failed')
    })

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow('Invalid signature or expired nonce. Please try again.')
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'unauthenticated')
  })

  // Test Case: EIP-712 with default chainId when not provided
  it('should use default chainId when not provided for EIP-712', async () => {
    // Arrange
    const typedDataSignature = '0x' + 'd'.repeat(130)
    const request = { data: { walletAddress, signature: typedDataSignature, signatureType: 'typed-data' } }

    mockedVerifyTypedData.mockReturnValue(walletAddress)

    // Act
    const result = await verifySignatureAndLoginHandler(request)

    // Assert
    expect(mockedVerifyTypedData).toHaveBeenCalledWith(
      {
        name: 'SuperPool Authentication',
        version: '1',
        chainId: 1,
      },
      expect.any(Object),
      expect.any(Object),
      typedDataSignature
    )
    expect(result).toEqual({ firebaseToken, user: expect.objectContaining({ walletAddress }) })
  })

  // Test Case: Non-Error object thrown during signature verification
  it('should handle non-Error objects thrown during signature verification', async () => {
    // Arrange
    const request = { data: { walletAddress, signature } }
    const nonErrorObject = { code: 'CUSTOM_ERROR', details: 'Some custom error' }

    mockedVerifyMessage.mockImplementation(() => {
      throw nonErrorObject
    })

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow('Invalid signature or expired nonce. Please try again.')
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'unauthenticated')
  })

  // Test Case: String thrown during signature verification
  it('should handle string thrown during signature verification', async () => {
    // Arrange
    const request = { data: { walletAddress, signature } }
    const stringError = 'Custom string error'

    mockedVerifyMessage.mockImplementation(() => {
      throw stringError
    })

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow('Invalid signature or expired nonce. Please try again.')
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'unauthenticated')
  })

  // Test Case: Null thrown during signature verification
  it('should handle null thrown during signature verification', async () => {
    // Arrange
    const request = { data: { walletAddress, signature } }

    mockedVerifyMessage.mockImplementation(() => {
      throw null
    })

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow('Invalid signature or expired nonce. Please try again.')
    await expect(verifySignatureAndLoginHandler(request)).rejects.toHaveProperty('code', 'unauthenticated')
  })
})
