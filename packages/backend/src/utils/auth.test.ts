import { createAuthMessage } from './auth'

describe('createAuthMessage', () => {
  const walletAddress = '0x1234567890123456789012345678901234567890'
  const nonce = 'test-nonce-123'
  const timestamp = 1678886400000

  // Test Case: Creates correct message format (Happy Path)
  it('should create a correctly formatted authentication message', () => {
    // Act
    const result = createAuthMessage(walletAddress, nonce, timestamp)

    // Assert
    expect(result).toBe(
      `Welcome to SuperPool!\n\n` +
        `This request will not trigger a blockchain transaction.\n\n` +
        `Wallet address:\n${walletAddress}\n\n` +
        `Nonce:\n${nonce}\n` +
        `Timestamp:\n${timestamp}`
    )
  })

  // Test Case: Message contains all required components
  it('should include all required components in the message', () => {
    // Act
    const result = createAuthMessage(walletAddress, nonce, timestamp)

    // Assert
    expect(result).toContain('Welcome to SuperPool!')
    expect(result).toContain('This request will not trigger a blockchain transaction.')
    expect(result).toContain('Wallet address:')
    expect(result).toContain(walletAddress)
    expect(result).toContain('Nonce:')
    expect(result).toContain(nonce)
    expect(result).toContain('Timestamp:')
    expect(result).toContain(timestamp.toString())
  })

  // Test Case: Message starts with welcome
  it('should start with the welcome message', () => {
    // Act
    const result = createAuthMessage(walletAddress, nonce, timestamp)

    // Assert
    expect(result.startsWith('Welcome to SuperPool!')).toBe(true)
  })

  // Test Case: Message ends with timestamp
  it('should end with the timestamp value', () => {
    // Act
    const result = createAuthMessage(walletAddress, nonce, timestamp)

    // Assert
    expect(result.endsWith(timestamp.toString())).toBe(true)
  })

  // Test Case: Different wallet addresses
  it('should handle different wallet addresses', () => {
    // Arrange
    const address1 = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa'
    const address2 = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB'

    // Act
    const result1 = createAuthMessage(address1, nonce, timestamp)
    const result2 = createAuthMessage(address2, nonce, timestamp)

    // Assert
    expect(result1).toContain(address1)
    expect(result2).toContain(address2)
    expect(result1).not.toBe(result2)
  })

  // Test Case: Different nonces
  it('should handle different nonces', () => {
    // Arrange
    const nonce1 = 'nonce-abc-123'
    const nonce2 = 'nonce-xyz-789'

    // Act
    const result1 = createAuthMessage(walletAddress, nonce1, timestamp)
    const result2 = createAuthMessage(walletAddress, nonce2, timestamp)

    // Assert
    expect(result1).toContain(nonce1)
    expect(result2).toContain(nonce2)
    expect(result1).not.toBe(result2)
  })

  // Test Case: Different timestamps
  it('should handle different timestamps', () => {
    // Arrange
    const timestamp1 = 1678886400000
    const timestamp2 = 1678886500000

    // Act
    const result1 = createAuthMessage(walletAddress, nonce, timestamp1)
    const result2 = createAuthMessage(walletAddress, nonce, timestamp2)

    // Assert
    expect(result1).toContain(timestamp1.toString())
    expect(result2).toContain(timestamp2.toString())
    expect(result1).not.toBe(result2)
  })

  // Test Case: Message is deterministic
  it('should create identical messages for identical inputs', () => {
    // Act
    const result1 = createAuthMessage(walletAddress, nonce, timestamp)
    const result2 = createAuthMessage(walletAddress, nonce, timestamp)

    // Assert
    expect(result1).toBe(result2)
    expect(result1).toEqual(result2)
  })

  // Test Case: Correct newline formatting
  it('should have correct newline formatting', () => {
    // Act
    const result = createAuthMessage(walletAddress, nonce, timestamp)

    // Assert - Count newlines
    const newlineCount = (result.match(/\n/g) || []).length
    expect(newlineCount).toBe(10) // 2 after title, 2 after notice, 2 after address, 2 after nonce (label + value), 2 for timestamp
  })

  // Test Case: UUID nonce format
  it('should handle UUID formatted nonces', () => {
    // Arrange
    const uuidNonce = '550e8400-e29b-41d4-a716-446655440000'

    // Act
    const result = createAuthMessage(walletAddress, uuidNonce, timestamp)

    // Assert
    expect(result).toContain(uuidNonce)
    expect(result).toContain('Nonce:\n' + uuidNonce)
  })

  // Test Case: Lowercase wallet address
  it('should preserve wallet address casing (lowercase)', () => {
    // Arrange
    const lowercaseAddress = '0xabcdef1234567890abcdef1234567890abcdef12'

    // Act
    const result = createAuthMessage(lowercaseAddress, nonce, timestamp)

    // Assert
    expect(result).toContain(lowercaseAddress)
  })

  // Test Case: Checksum wallet address
  it('should preserve wallet address casing (checksum)', () => {
    // Arrange
    const checksumAddress = '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B'

    // Act
    const result = createAuthMessage(checksumAddress, nonce, timestamp)

    // Assert
    expect(result).toContain(checksumAddress)
  })

  // Test Case: Very large timestamp
  it('should handle very large timestamps', () => {
    // Arrange
    const largeTimestamp = 9999999999999 // Year 2286

    // Act
    const result = createAuthMessage(walletAddress, nonce, largeTimestamp)

    // Assert
    expect(result).toContain(largeTimestamp.toString())
  })

  // Test Case: Zero timestamp
  it('should handle zero timestamp', () => {
    // Arrange
    const zeroTimestamp = 0

    // Act
    const result = createAuthMessage(walletAddress, nonce, zeroTimestamp)

    // Assert
    expect(result).toContain('Timestamp:\n0')
  })

  // Test Case: Message structure order
  it('should maintain correct component order', () => {
    // Act
    const result = createAuthMessage(walletAddress, nonce, timestamp)

    // Assert - Get positions of each component
    const welcomePos = result.indexOf('Welcome to SuperPool!')
    const noticePos = result.indexOf('This request will not trigger')
    const addressLabelPos = result.indexOf('Wallet address:')
    const addressPos = result.indexOf(walletAddress)
    const nonceLabelPos = result.indexOf('Nonce:')
    const noncePos = result.indexOf(nonce)
    const timestampLabelPos = result.indexOf('Timestamp:')
    const timestampPos = result.indexOf(timestamp.toString())

    expect(welcomePos).toBeLessThan(noticePos)
    expect(noticePos).toBeLessThan(addressLabelPos)
    expect(addressLabelPos).toBeLessThan(addressPos)
    expect(addressPos).toBeLessThan(nonceLabelPos)
    expect(nonceLabelPos).toBeLessThan(noncePos)
    expect(noncePos).toBeLessThan(timestampLabelPos)
    expect(timestampLabelPos).toBeLessThan(timestampPos)
  })

  // Test Case: Special characters in nonce
  it('should handle special characters in nonce', () => {
    // Arrange
    const specialNonce = 'nonce-with-special-chars!@#$%^&*()'

    // Act
    const result = createAuthMessage(walletAddress, specialNonce, timestamp)

    // Assert
    expect(result).toContain(specialNonce)
  })

  // Test Case: Empty string nonce (edge case)
  it('should handle empty string nonce', () => {
    // Arrange
    const emptyNonce = ''

    // Act
    const result = createAuthMessage(walletAddress, emptyNonce, timestamp)

    // Assert
    expect(result).toContain('Nonce:\n')
    expect(result).toContain('Timestamp:')
  })

  // Test Case: Message length is reasonable
  it('should create a message of reasonable length', () => {
    // Act
    const result = createAuthMessage(walletAddress, nonce, timestamp)

    // Assert
    expect(result.length).toBeGreaterThan(100)
    expect(result.length).toBeLessThan(500)
  })
})
