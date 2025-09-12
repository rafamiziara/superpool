import { jest } from '@jest/globals'
import { isAddress } from 'ethers'
import { AUTH_NONCES_COLLECTION } from '../../constants'
import { ethersMock, firebaseAdminMock, FunctionsMock } from '../../__mocks__'
import { firestore } from '../../services'

// Mock the uuid `v4` function
const mockNonce = 'mock-uuid-nonce'
const mockV4 = jest.fn(() => mockNonce)
jest.mock('uuid', () => ({
  v4: mockV4,
}))

// Mock the createAuthMessage utility function
const mockCreateAuthMessage = jest.fn()
jest.mock('../../utils', () => ({
  createAuthMessage: mockCreateAuthMessage,
}))

// Mock ethers module with Jest mock functions
jest.mock('ethers', () => ({
  isAddress: jest.fn(),
}))

// Mock the services module to use the centralized firestore mock
jest.mock('../../services', () => ({
  firestore: {
    collection: jest.fn(),
  },
}))

// Get the actual function handler to test
const { generateAuthMessageHandler } = require('./generateAuthMessage')

describe('generateAuthMessage', () => {
  const walletAddress = '0x1234567890123456789012345678901234567890'
  const mockMessage = 'mock-message-to-sign'
  const mockTimestamp = 1678886400000

  // Mock the `new Date().getTime()` call to return a predictable value
  const originalGetTime = Date.prototype.getTime
  Date.prototype.getTime = () => mockTimestamp

  beforeEach(() => {
    firebaseAdminMock.resetAllMocks()
    ethersMock.resetAllMocks()
    jest.clearAllMocks()

    // Setup ethers mocks
    ;(isAddress as jest.MockedFunction<typeof isAddress>).mockReturnValue(true) // Default to a valid address
    mockCreateAuthMessage.mockReturnValue(mockMessage)

    // Setup services mock
    const mockFirestore = firestore as jest.Mocked<typeof firestore>
    mockFirestore.collection.mockReturnValue({
      doc: jest.fn().mockReturnValue({
        set: jest.fn().mockResolvedValue(undefined),
      }),
    } as unknown as ReturnType<typeof mockFirestore.collection>)
  })

  afterAll(() => {
    Date.prototype.getTime = originalGetTime // Restore the original getTime()
  })

  // Test Case: Successful message generation (Happy Path)
  it('should generate and return a unique message for a valid wallet address', async () => {
    // Arrange
    const request = FunctionsMock.createCallableRequest({ walletAddress })

    // Act
    const result = await generateAuthMessageHandler(request)

    // Assert
    expect(isAddress).toHaveBeenCalledWith(walletAddress)
    expect(mockV4).toHaveBeenCalled()
    expect(firestore.collection).toHaveBeenCalledWith(AUTH_NONCES_COLLECTION)
    expect(firestore.collection().doc).toHaveBeenCalledWith(walletAddress)
    expect(firestore.collection().doc().set).toHaveBeenCalledWith({
      nonce: mockNonce,
      timestamp: mockTimestamp,
      expiresAt: mockTimestamp + 10 * 60 * 1000,
    })
    expect(mockCreateAuthMessage).toHaveBeenCalledWith(walletAddress, mockNonce, mockTimestamp)
    expect(result).toEqual({ message: mockMessage, nonce: mockNonce, timestamp: mockTimestamp })
  })

  // Test Case: Invalid Argument - Missing walletAddress
  it('should throw an HttpsError for invalid-argument if walletAddress is missing', async () => {
    // Arrange
    const request = FunctionsMock.createCallableRequest({})

    // Act & Assert
    await expect(generateAuthMessageHandler(request)).rejects.toThrow('The function must be called with one argument: walletAddress.')
    await expect(generateAuthMessageHandler(request)).rejects.toHaveProperty('code', 'invalid-argument')
    expect(isAddress).not.toHaveBeenCalled()
  })

  // Test Case: Invalid Argument - Invalid walletAddress format
  it('should throw an HttpsError for invalid-argument if walletAddress is an invalid format', async () => {
    // Arrange
    const invalidAddress = 'invalid-eth-address'
    const request = FunctionsMock.createCallableRequest({ walletAddress: invalidAddress })
    ;(isAddress as jest.MockedFunction<typeof isAddress>).mockReturnValue(false)

    // Act & Assert
    await expect(generateAuthMessageHandler(request)).rejects.toThrow('Invalid Ethereum wallet address format.')
    await expect(generateAuthMessageHandler(request)).rejects.toHaveProperty('code', 'invalid-argument')
    expect(isAddress).toHaveBeenCalledWith(invalidAddress)
  })

  // Test Case: Error during Firestore write operation
  it('should throw an HttpsError for internal error if Firestore write fails', async () => {
    // Arrange
    const request = FunctionsMock.createCallableRequest({ walletAddress })
    const firestoreError = new Error('Firestore write failed')

    // Make the `set` method throw an error to simulate a failure
    const mockFirestore = firestore as jest.Mocked<typeof firestore>
    mockFirestore.collection.mockReturnValue({
      doc: jest.fn().mockReturnValue({
        set: jest.fn().mockRejectedValue(firestoreError),
      }),
    } as unknown as ReturnType<typeof mockFirestore.collection>)

    // Act & Assert
    await expect(generateAuthMessageHandler(request)).rejects.toThrow('Failed to save authentication nonce.')
    await expect(generateAuthMessageHandler(request)).rejects.toHaveProperty('code', 'internal')
  })
})
