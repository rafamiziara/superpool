import { createAuthMessage } from './index'

describe('createAuthMessage', () => {
  it('should create a correctly formatted authentication message', () => {
    // Arrange
    const walletAddress = '0x1234567890123456789012345678901234567890'
    const nonce = 'mock-nonce-123'
    const timestamp = 1678886400000

    const expectedMessage =
      `Welcome to SuperPool!\n\n` +
      `This request will not trigger a blockchain transaction.\n\n` +
      `Wallet address:\n${walletAddress}\n\n` +
      `Nonce:\n${nonce}\n` +
      `Timestamp:\n${timestamp}`

    // Act
    const result = createAuthMessage(walletAddress, nonce, timestamp)

    // Assert
    expect(result).toBe(expectedMessage)
  })
})
