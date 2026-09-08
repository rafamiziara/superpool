import type { AuthMessageRequest } from '@superpool/types'
import * as ethersMock from 'ethers'
import type { CollectionReference, DocumentData } from 'firebase-admin/firestore'
import type { CallableRequest } from 'firebase-functions/v2/https'
import type { MockedFunction } from 'vitest'
import { createMockCollection } from '../../__tests__/mocks'
import { AUTH_NONCES_COLLECTION } from '../../constants'

// Hoisted so the vi.mock factories below can close over them: vi.mock runs before
// any module-level const is initialised.
const { mockCreateAuthMessage } = vi.hoisted(() => ({
  mockCreateAuthMessage: vi.fn(),
}))

// Mock ethers module
vi.mock('ethers', () => ({
  isAddress: vi.fn(),
}))

// Mock the createAuthMessage utility function
vi.mock('../../utils', () => ({
  createAuthMessage: mockCreateAuthMessage,
}))

// Import mocked services (already mocked in setup.ts)
import { firestore as realFirestore } from '../../services'

// Get the actual function handler to test
import { generateAuthMessageHandler } from './generateAuthMessage'

const firestore = vi.mocked(realFirestore, true)
// These modules are mocked above; vi.mocked restores the mock types that the
// real signatures would otherwise hide.
const { isAddress } = vi.mocked(ethersMock)
describe('generateAuthMessage', () => {
  const walletAddress = '0x1234567890123456789012345678901234567890'
  const mockMessage = 'mock-message-to-sign'
  const mockTimestamp = 1678886400000

  // Mock the `new Date().getTime()` call to return a predictable value
  const originalGetTime = Date.prototype.getTime
  Date.prototype.getTime = () => mockTimestamp

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup ethers mocks
    ;(isAddress as unknown as MockedFunction<typeof isAddress>).mockReturnValue(true)
    mockCreateAuthMessage.mockReturnValue(mockMessage)

    // Setup firestore mock
    vi.mocked(firestore.collection).mockReturnValue(createMockCollection() as unknown as CollectionReference<DocumentData, DocumentData>)
  })

  afterAll(() => {
    Date.prototype.getTime = originalGetTime
  })

  // Test Case: Successful message generation (Happy Path)
  it('should generate and return a unique message for a valid wallet address', async () => {
    // Arrange
    const request = { data: { walletAddress } }

    // Act
    const result = await generateAuthMessageHandler(request as unknown as CallableRequest<AuthMessageRequest>)

    // Assert
    expect(isAddress).toHaveBeenCalledWith(walletAddress)
    expect(firestore.collection).toHaveBeenCalledWith(AUTH_NONCES_COLLECTION)
    expect(firestore.collection(AUTH_NONCES_COLLECTION).doc).toHaveBeenCalledWith(walletAddress)
    expect(firestore.collection(AUTH_NONCES_COLLECTION).doc(walletAddress).set).toHaveBeenCalledWith({
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
    await expect(generateAuthMessageHandler(request as unknown as CallableRequest<AuthMessageRequest>)).rejects.toThrow(/walletAddress/)
    await expect(generateAuthMessageHandler(request as unknown as CallableRequest<AuthMessageRequest>)).rejects.toHaveProperty(
      'code',
      'invalid-argument'
    )
    expect(isAddress).not.toHaveBeenCalled()
  })

  // Test Case: Invalid Argument - Invalid walletAddress format
  it('should throw an HttpsError for invalid-argument if walletAddress is an invalid format', async () => {
    // Arrange
    const invalidAddress = 'invalid-eth-address'
    const request = { data: { walletAddress: invalidAddress } }
    ;(isAddress as unknown as MockedFunction<typeof isAddress>).mockReturnValue(false)

    // Act & Assert
    await expect(generateAuthMessageHandler(request as unknown as CallableRequest<AuthMessageRequest>)).rejects.toThrow(
      /walletAddress: must be an Ethereum address/
    )
    await expect(generateAuthMessageHandler(request as unknown as CallableRequest<AuthMessageRequest>)).rejects.toHaveProperty(
      'code',
      'invalid-argument'
    )
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
    vi.mocked(firestore.collection).mockReturnValue(mockCollection as unknown as CollectionReference<DocumentData, DocumentData>)

    // Act & Assert
    await expect(generateAuthMessageHandler(request as unknown as CallableRequest<AuthMessageRequest>)).rejects.toThrow(
      'Failed to save authentication nonce.'
    )
    await expect(generateAuthMessageHandler(request as unknown as CallableRequest<AuthMessageRequest>)).rejects.toHaveProperty(
      'code',
      'internal'
    )
  })
})
