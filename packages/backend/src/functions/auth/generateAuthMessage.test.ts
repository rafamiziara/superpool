import { isAddress } from 'ethers'
import { AUTH_NONCES_COLLECTION } from '../../constants'
import { createMockCollection } from '../../__tests__/mocks'

// Mock ethers module
jest.mock('ethers', () => ({
  isAddress: jest.fn(),
}))

// Mock the createAuthMessage utility function
const mockCreateAuthMessage = jest.fn()
jest.mock('../../utils', () => ({
  createAuthMessage: mockCreateAuthMessage,
}))

// Import mocked services (already mocked in setup.ts)
const { firestore } = require('../../services')

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
    jest.clearAllMocks()

    // Setup ethers mocks
    ;(isAddress as jest.MockedFunction<typeof isAddress>).mockReturnValue(true)
    mockCreateAuthMessage.mockReturnValue(mockMessage)

    // Setup firestore mock
    firestore.collection.mockReturnValue(createMockCollection())
  })

  afterAll(() => {
    Date.prototype.getTime = originalGetTime
  })

  // Test Case: Successful message generation (Happy Path)
  it('should generate and return a unique message for a valid wallet address', async () => {
    // Arrange
    const request = { data: { walletAddress } }

    // Act
    const result = await generateAuthMessageHandler(request)

    // Assert
    expect(isAddress).toHaveBeenCalledWith(walletAddress)
    expect(firestore.collection).toHaveBeenCalledWith(AUTH_NONCES_COLLECTION)
    expect(firestore.collection().doc).toHaveBeenCalledWith(walletAddress)
    expect(firestore.collection().doc().set).toHaveBeenCalledWith({
      nonce: 'test-nonce-uuid',
      timestamp: mockTimestamp,
      expiresAt: mockTimestamp + 10 * 60 * 1000,
    })
    expect(mockCreateAuthMessage).toHaveBeenCalledWith(walletAddress, 'test-nonce-uuid', mockTimestamp)
    expect(result).toEqual({ message: mockMessage, nonce: 'test-nonce-uuid', timestamp: mockTimestamp })
  })

  // Test Case: Invalid Argument - Missing walletAddress
  it('should throw an HttpsError for invalid-argument if walletAddress is missing', async () => {
    // Arrange
    const request = { data: {} }

    // Act & Assert
    await expect(generateAuthMessageHandler(request)).rejects.toThrow('The function must be called with one argument: walletAddress.')
    await expect(generateAuthMessageHandler(request)).rejects.toHaveProperty('code', 'invalid-argument')
    expect(isAddress).not.toHaveBeenCalled()
  })

  // Test Case: Invalid Argument - Invalid walletAddress format
  it('should throw an HttpsError for invalid-argument if walletAddress is an invalid format', async () => {
    // Arrange
    const invalidAddress = 'invalid-eth-address'
    const request = { data: { walletAddress: invalidAddress } }
    ;(isAddress as jest.MockedFunction<typeof isAddress>).mockReturnValue(false)

    // Act & Assert
    await expect(generateAuthMessageHandler(request)).rejects.toThrow('Invalid Ethereum wallet address format.')
    await expect(generateAuthMessageHandler(request)).rejects.toHaveProperty('code', 'invalid-argument')
    expect(isAddress).toHaveBeenCalledWith(invalidAddress)
  })

  // Test Case: Error during Firestore write operation
  it('should throw an HttpsError for internal error if Firestore write fails', async () => {
    // Arrange
    const request = { data: { walletAddress } }
    const firestoreError = new Error('Firestore write failed')

    // Make the `set` method throw an error to simulate a failure
    const mockCollection = createMockCollection()
    mockCollection.doc().set.mockRejectedValue(firestoreError)
    firestore.collection.mockReturnValue(mockCollection)

    // Act & Assert
    await expect(generateAuthMessageHandler(request)).rejects.toThrow('Failed to save authentication nonce.')
    await expect(generateAuthMessageHandler(request)).rejects.toHaveProperty('code', 'internal')
  })
})
