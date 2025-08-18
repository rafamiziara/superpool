import { jest } from '@jest/globals'
import { isAddress } from 'ethers'
import { AUTH_NONCES_COLLECTION } from '../../constants'
import { createAuthMessage } from '../../utils'

// Mock the Firebase Admin SDK dependencies
const mockSet = jest.fn<SetFunctionFirestore>()
const mockDoc = jest.fn(() => ({ set: mockSet }))
const mockCollection = jest.fn(() => ({ doc: mockDoc }))
const mockFirestore = jest.fn(() => ({ collection: mockCollection }))

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: mockFirestore,
}))

// Mock the ethers `isAddress` function
jest.mock('ethers', () => ({
  isAddress: jest.fn(),
}))

// Mock the uuid `v4` function
const mockNonce = 'mock-uuid-nonce'
const mockV4 = jest.fn(() => mockNonce)
jest.mock('uuid', () => ({
  v4: mockV4,
}))

// Mock the createAuthMessage utility function
jest.mock('../../utils', () => ({
  createAuthMessage: jest.fn(),
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
    jest.clearAllMocks()
    jest.mocked(isAddress).mockReturnValue(true) // Default to a valid address
    jest.mocked(createAuthMessage).mockReturnValue(mockMessage)
  })

  afterAll(() => {
    Date.prototype.getTime = originalGetTime // Restore the original getTime()
  })

  // Test Case: Successful message generation (Happy Path)
  it('should generate and return a unique message for a valid wallet address', async () => {
    // Arrange
    const request = { data: { walletAddress } }

    // Act
    const result = await generateAuthMessageHandler(request)

    // Assert
    expect(isAddress).toHaveBeenCalledWith(walletAddress)
    expect(mockV4).toHaveBeenCalled()
    expect(mockCollection).toHaveBeenCalledWith(AUTH_NONCES_COLLECTION)
    expect(mockDoc).toHaveBeenCalledWith(walletAddress)
    expect(mockSet).toHaveBeenCalledWith({ nonce: mockNonce, timestamp: mockTimestamp, expiresAt: mockTimestamp + 10 * 60 * 1000 })
    expect(createAuthMessage).toHaveBeenCalledWith(walletAddress, mockNonce, mockTimestamp)
    expect(result).toEqual({ message: mockMessage })
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
    jest.mocked(isAddress).mockReturnValue(false)

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
    mockSet.mockRejectedValue(firestoreError)

    // Act & Assert
    await expect(generateAuthMessageHandler(request)).rejects.toThrow('Failed to save authentication nonce.')
    await expect(generateAuthMessageHandler(request)).rejects.toHaveProperty('code', 'internal')
  })
})
