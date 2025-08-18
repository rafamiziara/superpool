import { jest } from '@jest/globals'
import { isAddress, verifyMessage } from 'ethers'
import { AUTH_NONCES_COLLECTION, USERS_COLLECTION } from '../../constants'

// Mock the delete method specifically for the nonce document
const mockDelete = jest.fn<DeleteFunctionFirestore>()
const mockUpdate = jest.fn<UpdateFunctionFirestore>()
const mockSet = jest.fn<SetFunctionFirestore>()

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
}))

// Mock the createAuthMessage utility
const mockCreateAuthMessage = jest.fn()
jest.mock('../../utils', () => ({
  createAuthMessage: mockCreateAuthMessage,
}))

// Mock the DeviceVerificationService  
const mockApproveDevice = jest.fn() as jest.MockedFunction<(deviceId: string, walletAddress: string, platform: 'android' | 'ios' | 'web') => Promise<void>>
jest.mock('../../services/deviceVerification', () => ({
  DeviceVerificationService: {
    approveDevice: mockApproveDevice,
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

  // Test Case: Invalid Argument - Invalid signature format
  it('should throw an invalid-argument error if the signature format is incorrect', async () => {
    // Arrange
    const request = { data: { walletAddress, signature: 'invalid-signature' } }

    // Act & Assert
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow(
      'Invalid signature format. It must be a 132-character hex string prefixed with "0x".'
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
    await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow('Signature verification failed. The signature is invalid.')
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

    // Spy on console.error to verify it's called
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    // Act
    const result = await verifySignatureAndLoginHandler(request)

    // Assert
    expect(mockApproveDevice).toHaveBeenCalledWith(deviceId, walletAddress, platform)
    expect(consoleSpy).toHaveBeenCalledWith('Failed to approve device:', expect.any(Error))
    expect(result).toEqual({ firebaseToken })

    consoleSpy.mockRestore()
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
})
