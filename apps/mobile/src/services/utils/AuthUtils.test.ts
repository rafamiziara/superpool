import { AuthUtils } from './AuthUtils'
import { SignatureRequest } from '@superpool/types'

describe('AuthUtils', () => {
  const mockWalletAddress = '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8'
  const mockNonce = 'sp_auth_test_12345'
  const mockTimestamp = 1641024000000
  const mockChainId = 137

  describe('generateNonce', () => {
    it('should generate nonce with default length of 32', () => {
      const nonce = AuthUtils.generateNonce()

      expect(nonce).toHaveLength(32)
      expect(typeof nonce).toBe('string')
      expect(/^[A-Za-z0-9]+$/.test(nonce)).toBe(true)
    })

    it('should generate nonce with custom length', () => {
      const shortNonce = AuthUtils.generateNonce(16)
      const longNonce = AuthUtils.generateNonce(64)

      expect(shortNonce).toHaveLength(16)
      expect(longNonce).toHaveLength(64)
    })

    it('should generate unique nonces', () => {
      const nonce1 = AuthUtils.generateNonce()
      const nonce2 = AuthUtils.generateNonce()

      expect(nonce1).not.toBe(nonce2)
    })

    it('should handle zero length', () => {
      const nonce = AuthUtils.generateNonce(0)

      expect(nonce).toBe('')
    })

    it('should handle large lengths', () => {
      const nonce = AuthUtils.generateNonce(1000)

      expect(nonce).toHaveLength(1000)
      expect(/^[A-Za-z0-9]+$/.test(nonce)).toBe(true)
    })

    it('should only contain valid charset characters', () => {
      const nonce = AuthUtils.generateNonce(100)
      const validCharset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

      for (const char of nonce) {
        expect(validCharset.includes(char)).toBe(true)
      }
    })
  })

  describe('createSafeAuthToken', () => {
    it('should create properly formatted Safe auth token', () => {
      const token = AuthUtils.createSafeAuthToken(mockWalletAddress, mockNonce, mockTimestamp)

      expect(token).toBe(`safe-wallet:${mockWalletAddress}:${mockNonce}:${mockTimestamp}`)
    })

    it('should handle different wallet addresses', () => {
      const address1 = '0x1234567890123456789012345678901234567890'
      const address2 = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'

      const token1 = AuthUtils.createSafeAuthToken(address1, mockNonce, mockTimestamp)
      const token2 = AuthUtils.createSafeAuthToken(address2, mockNonce, mockTimestamp)

      expect(token1).toContain(address1)
      expect(token2).toContain(address2)
      expect(token1).not.toBe(token2)
    })

    it('should handle different nonces', () => {
      const nonce1 = 'nonce1'
      const nonce2 = 'nonce2'

      const token1 = AuthUtils.createSafeAuthToken(mockWalletAddress, nonce1, mockTimestamp)
      const token2 = AuthUtils.createSafeAuthToken(mockWalletAddress, nonce2, mockTimestamp)

      expect(token1).toContain(nonce1)
      expect(token2).toContain(nonce2)
      expect(token1).not.toBe(token2)
    })

    it('should handle different timestamps', () => {
      const timestamp1 = 1641024000000
      const timestamp2 = 1641024001000

      const token1 = AuthUtils.createSafeAuthToken(mockWalletAddress, mockNonce, timestamp1)
      const token2 = AuthUtils.createSafeAuthToken(mockWalletAddress, mockNonce, timestamp2)

      expect(token1).toContain(timestamp1.toString())
      expect(token2).toContain(timestamp2.toString())
      expect(token1).not.toBe(token2)
    })
  })

  describe('parseSafeAuthToken', () => {
    it('should parse valid Safe auth token', () => {
      const token = `safe-wallet:${mockWalletAddress}:${mockNonce}:${mockTimestamp}`

      const result = AuthUtils.parseSafeAuthToken(token)

      expect(result).toEqual({
        walletAddress: mockWalletAddress,
        nonce: mockNonce,
        timestamp: mockTimestamp,
      })
    })

    it('should return null for invalid prefix', () => {
      const token = `invalid-prefix:${mockWalletAddress}:${mockNonce}:${mockTimestamp}`

      const result = AuthUtils.parseSafeAuthToken(token)

      expect(result).toBeNull()
    })

    it('should return null for insufficient parts', () => {
      const incompleteToken = `safe-wallet:${mockWalletAddress}:${mockNonce}`

      const result = AuthUtils.parseSafeAuthToken(incompleteToken)

      expect(result).toBeNull()
    })

    it('should return null for too many parts', () => {
      const extraToken = `safe-wallet:${mockWalletAddress}:${mockNonce}:${mockTimestamp}:extra`

      const result = AuthUtils.parseSafeAuthToken(extraToken)

      expect(result).toBeNull()
    })

    it('should return null for invalid timestamp', () => {
      const invalidTimestampToken = `safe-wallet:${mockWalletAddress}:${mockNonce}:not-a-number`

      const result = AuthUtils.parseSafeAuthToken(invalidTimestampToken)

      expect(result).toBeNull()
    })

    it('should handle empty token', () => {
      const result = AuthUtils.parseSafeAuthToken('')

      expect(result).toBeNull()
    })

    it('should handle zero timestamp', () => {
      const token = `safe-wallet:${mockWalletAddress}:${mockNonce}:0`

      const result = AuthUtils.parseSafeAuthToken(token)

      expect(result).toEqual({
        walletAddress: mockWalletAddress,
        nonce: mockNonce,
        timestamp: 0,
      })
    })
  })

  describe('createAuthMessage', () => {
    it('should create properly formatted auth message', () => {
      const message = AuthUtils.createAuthMessage(mockWalletAddress, mockNonce, mockTimestamp)

      expect(message).toContain('Welcome to SuperPool!')
      expect(message).toContain('Please sign this message to authenticate your wallet.')
      expect(message).toContain('This will not trigger a blockchain transaction or cost any gas fees.')
      expect(message).toContain(`Wallet: ${mockWalletAddress}`)
      expect(message).toContain(`Nonce: ${mockNonce}`)
      expect(message).toContain(`Timestamp: ${mockTimestamp}`)
    })

    it('should use correct line separators', () => {
      const message = AuthUtils.createAuthMessage(mockWalletAddress, mockNonce, mockTimestamp)

      expect(message).toMatch(/Welcome to SuperPool!\\n\\nPlease sign this message/)
    })

    it('should include all required sections', () => {
      const message = AuthUtils.createAuthMessage(mockWalletAddress, mockNonce, mockTimestamp)
      const lines = message.split('\\n')

      expect(lines[0]).toBe('Welcome to SuperPool!')
      expect(lines[1]).toBe('')
      expect(lines[2]).toBe('Please sign this message to authenticate your wallet.')
      expect(lines[3]).toBe('This will not trigger a blockchain transaction or cost any gas fees.')
      expect(lines[4]).toBe('')
      expect(lines[5]).toBe(`Wallet: ${mockWalletAddress}`)
      expect(lines[6]).toBe(`Nonce: ${mockNonce}`)
      expect(lines[7]).toBe(`Timestamp: ${mockTimestamp}`)
    })

    it('should handle different wallet addresses', () => {
      const address1 = '0x1111111111111111111111111111111111111111'
      const address2 = '0x2222222222222222222222222222222222222222'

      const message1 = AuthUtils.createAuthMessage(address1, mockNonce, mockTimestamp)
      const message2 = AuthUtils.createAuthMessage(address2, mockNonce, mockTimestamp)

      expect(message1).toContain(`Wallet: ${address1}`)
      expect(message2).toContain(`Wallet: ${address2}`)
    })
  })

  describe('validateAuthMessageFormat', () => {
    const validMessage = AuthUtils.createAuthMessage(mockWalletAddress, mockNonce, mockTimestamp)

    it('should validate correct message format', () => {
      const isValid = AuthUtils.validateAuthMessageFormat(validMessage, mockWalletAddress)

      expect(isValid).toBe(true)
    })

    it('should reject message with wrong wallet address', () => {
      const wrongAddress = '0x1111111111111111111111111111111111111111'

      const isValid = AuthUtils.validateAuthMessageFormat(validMessage, wrongAddress)

      expect(isValid).toBe(false)
    })

    it('should reject message missing welcome text', () => {
      const invalidMessage = validMessage.replace('Welcome to SuperPool', 'Welcome to OtherApp')

      const isValid = AuthUtils.validateAuthMessageFormat(invalidMessage, mockWalletAddress)

      expect(isValid).toBe(false)
    })

    it('should reject message missing nonce', () => {
      const invalidMessage = validMessage.replace(/Nonce: .+/, 'No nonce here')

      const isValid = AuthUtils.validateAuthMessageFormat(invalidMessage, mockWalletAddress)

      expect(isValid).toBe(false)
    })

    it('should reject message missing timestamp', () => {
      const invalidMessage = validMessage.replace(/Timestamp: .+/, 'No timestamp here')

      const isValid = AuthUtils.validateAuthMessageFormat(invalidMessage, mockWalletAddress)

      expect(isValid).toBe(false)
    })

    it('should reject empty message', () => {
      const isValid = AuthUtils.validateAuthMessageFormat('', mockWalletAddress)

      expect(isValid).toBe(false)
    })

    it('should reject empty wallet address', () => {
      const isValid = AuthUtils.validateAuthMessageFormat(validMessage, '')

      expect(isValid).toBe(false)
    })

    it('should handle null/undefined inputs', () => {
      expect(AuthUtils.validateAuthMessageFormat(null as unknown as string, mockWalletAddress)).toBe(false)
      expect(AuthUtils.validateAuthMessageFormat(validMessage, null as unknown as string)).toBe(false)
      expect(AuthUtils.validateAuthMessageFormat(undefined as unknown as string, mockWalletAddress)).toBe(false)
      expect(AuthUtils.validateAuthMessageFormat(validMessage, undefined as unknown as string)).toBe(false)
    })
  })

  describe('extractNonceFromMessage', () => {
    it('should extract nonce from valid message', () => {
      const message = AuthUtils.createAuthMessage(mockWalletAddress, mockNonce, mockTimestamp)

      const extractedNonce = AuthUtils.extractNonceFromMessage(message)

      expect(extractedNonce).toBe(mockNonce)
    })

    it('should return null for message without nonce', () => {
      const message = 'This message has no nonce information'

      const extractedNonce = AuthUtils.extractNonceFromMessage(message)

      expect(extractedNonce).toBeNull()
    })

    it('should handle different nonce formats', () => {
      const alphanumericNonce = 'abc123XYZ'
      const numericNonce = '123456789'
      const shortNonce = 'a1'

      const message1 = `Some text\nNonce: ${alphanumericNonce}\nMore text`
      const message2 = `Some text\nNonce: ${numericNonce}\nMore text`
      const message3 = `Some text\nNonce: ${shortNonce}\nMore text`

      expect(AuthUtils.extractNonceFromMessage(message1)).toBe(alphanumericNonce)
      expect(AuthUtils.extractNonceFromMessage(message2)).toBe(numericNonce)
      expect(AuthUtils.extractNonceFromMessage(message3)).toBe(shortNonce)
    })

    it('should handle nonce with extra whitespace', () => {
      const message = `Some text\nNonce:   ${mockNonce}   \nMore text`

      const extractedNonce = AuthUtils.extractNonceFromMessage(message)

      expect(extractedNonce).toBe(mockNonce)
    })

    it('should return first nonce if multiple found', () => {
      const firstNonce = 'first123'
      const secondNonce = 'second456'
      const message = `Nonce: ${firstNonce}\\nSome text\\nNonce: ${secondNonce}`

      const extractedNonce = AuthUtils.extractNonceFromMessage(message)

      expect(extractedNonce).toBe(firstNonce)
    })
  })

  describe('extractTimestampFromMessage', () => {
    it('should extract timestamp from valid message', () => {
      const message = AuthUtils.createAuthMessage(mockWalletAddress, mockNonce, mockTimestamp)

      const extractedTimestamp = AuthUtils.extractTimestampFromMessage(message)

      expect(extractedTimestamp).toBe(mockTimestamp)
    })

    it('should return null for message without timestamp', () => {
      const message = 'This message has no timestamp information'

      const extractedTimestamp = AuthUtils.extractTimestampFromMessage(message)

      expect(extractedTimestamp).toBeNull()
    })

    it('should handle different timestamp formats', () => {
      const message1 = `Some text\\nTimestamp: 1641024000000\\nMore text`
      const message2 = `Some text\\nTimestamp: 0\\nMore text`
      const message3 = `Some text\\nTimestamp: 9999999999999\\nMore text`

      expect(AuthUtils.extractTimestampFromMessage(message1)).toBe(1641024000000)
      expect(AuthUtils.extractTimestampFromMessage(message2)).toBe(0)
      expect(AuthUtils.extractTimestampFromMessage(message3)).toBe(9999999999999)
    })

    it('should handle timestamp with extra whitespace', () => {
      const message = `Some text\\nTimestamp:   ${mockTimestamp}   \\nMore text`

      const extractedTimestamp = AuthUtils.extractTimestampFromMessage(message)

      expect(extractedTimestamp).toBe(mockTimestamp)
    })

    it('should return first timestamp if multiple found', () => {
      const firstTimestamp = 1641024000000
      const secondTimestamp = 1641024001000
      const message = `Timestamp: ${firstTimestamp}\\nSome text\\nTimestamp: ${secondTimestamp}`

      const extractedTimestamp = AuthUtils.extractTimestampFromMessage(message)

      expect(extractedTimestamp).toBe(firstTimestamp)
    })

    it('should reject non-numeric timestamps', () => {
      const message = 'Timestamp: not-a-number'

      const extractedTimestamp = AuthUtils.extractTimestampFromMessage(message)

      expect(extractedTimestamp).toBe(null)
    })
  })

  describe('createEip712TypedData', () => {
    const mockRequest: SignatureRequest = {
      walletAddress: mockWalletAddress,
      chainId: mockChainId,
      message: 'test message',
      nonce: mockNonce,
      timestamp: mockTimestamp,
    }

    it('should create valid EIP-712 typed data structure', () => {
      const typedData = AuthUtils.createEip712TypedData(mockRequest)

      expect(typedData).toHaveProperty('domain')
      expect(typedData).toHaveProperty('types')
      expect(typedData).toHaveProperty('primaryType')
      expect(typedData).toHaveProperty('message')
    })

    it('should have correct domain configuration', () => {
      const typedData = AuthUtils.createEip712TypedData(mockRequest)

      expect(typedData.domain).toEqual({
        name: 'SuperPool Authentication',
        version: '1',
        chainId: mockChainId,
      })
    })

    it('should use default chainId when not provided', () => {
      const requestWithoutChainId = { ...mockRequest, chainId: undefined }

      const typedData = AuthUtils.createEip712TypedData(requestWithoutChainId)

      expect(typedData.domain.chainId).toBe(1)
    })

    it('should have correct types definition', () => {
      const typedData = AuthUtils.createEip712TypedData(mockRequest)

      expect(typedData.types).toEqual({
        Authentication: [
          { name: 'wallet', type: 'address' },
          { name: 'nonce', type: 'string' },
          { name: 'timestamp', type: 'uint256' },
        ],
      })
    })

    it('should have correct primary type', () => {
      const typedData = AuthUtils.createEip712TypedData(mockRequest)

      expect(typedData.primaryType).toBe('Authentication')
    })

    it('should have correct message structure', () => {
      const typedData = AuthUtils.createEip712TypedData(mockRequest)

      expect(typedData.message).toEqual({
        wallet: mockWalletAddress,
        nonce: mockNonce,
        timestamp: BigInt(mockTimestamp),
      })
    })

    it('should handle different chain IDs', () => {
      const polygonRequest = { ...mockRequest, chainId: 137 }
      const ethereumRequest = { ...mockRequest, chainId: 1 }

      const polygonTypedData = AuthUtils.createEip712TypedData(polygonRequest)
      const ethereumTypedData = AuthUtils.createEip712TypedData(ethereumRequest)

      expect(polygonTypedData.domain.chainId).toBe(137)
      expect(ethereumTypedData.domain.chainId).toBe(1)
    })
  })

  describe('isSafeWalletSignature', () => {
    it('should identify valid Safe wallet signature', () => {
      const safeSignature = `safe-wallet:${mockWalletAddress}:${mockNonce}:${mockTimestamp}`

      const result = AuthUtils.isSafeWalletSignature(safeSignature)

      expect(result).toBe(true)
    })

    it('should reject non-Safe wallet signatures', () => {
      const hexSignature = '0x1234567890abcdef'
      const plainText = 'regular text'
      const emptyString = ''

      expect(AuthUtils.isSafeWalletSignature(hexSignature)).toBe(false)
      expect(AuthUtils.isSafeWalletSignature(plainText)).toBe(false)
      expect(AuthUtils.isSafeWalletSignature(emptyString)).toBe(false)
    })

    it('should reject Safe wallet signature with wrong part count', () => {
      const tooFewParts = 'safe-wallet:address:nonce'
      const tooManyParts = 'safe-wallet:address:nonce:timestamp:extra'

      expect(AuthUtils.isSafeWalletSignature(tooFewParts)).toBe(false)
      expect(AuthUtils.isSafeWalletSignature(tooManyParts)).toBe(false)
    })

    it('should reject signature with wrong prefix', () => {
      const wrongPrefix = `other-wallet:${mockWalletAddress}:${mockNonce}:${mockTimestamp}`

      expect(AuthUtils.isSafeWalletSignature(wrongPrefix)).toBe(false)
    })
  })

  describe('isHexSignature', () => {
    it('should identify valid hex signatures', () => {
      const shortHex = '0x1234567890'
      const longHex =
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b'
      const mixedCase = '0x1234ABCDef567890'

      expect(AuthUtils.isHexSignature(shortHex)).toBe(true)
      expect(AuthUtils.isHexSignature(longHex)).toBe(true)
      expect(AuthUtils.isHexSignature(mixedCase)).toBe(true)
    })

    it('should reject non-hex signatures', () => {
      const noPrefix = '1234567890abcdef'
      const tooShort = '0x123'
      const invalidChars = '0x123xyz789'
      const safeWallet = 'safe-wallet:address:nonce:timestamp'
      const empty = ''

      expect(AuthUtils.isHexSignature(noPrefix)).toBe(false)
      expect(AuthUtils.isHexSignature(tooShort)).toBe(false)
      expect(AuthUtils.isHexSignature(invalidChars)).toBe(false)
      expect(AuthUtils.isHexSignature(safeWallet)).toBe(false)
      expect(AuthUtils.isHexSignature(empty)).toBe(false)
    })

    it('should handle edge cases', () => {
      const exactMinLength = '0x1234567890' // 10 chars after 0x
      const justBelowMinLength = '0x12345678' // 8 chars after 0x, total 10 - should be true since >= 10 total
      const tooShortTotal = '0x1234567' // 7 chars after 0x, total 9 - should be false
      const upperCasePrefix = '0X1234567890abcdef'

      expect(AuthUtils.isHexSignature(exactMinLength)).toBe(true)
      expect(AuthUtils.isHexSignature(justBelowMinLength)).toBe(true) // Total length is 10
      expect(AuthUtils.isHexSignature(tooShortTotal)).toBe(false) // Total length is 9
      expect(AuthUtils.isHexSignature(upperCasePrefix)).toBe(false)
    })
  })

  describe('determineSignatureType', () => {
    it('should identify Safe wallet signatures', () => {
      const safeSignature = `safe-wallet:${mockWalletAddress}:${mockNonce}:${mockTimestamp}`

      const result = AuthUtils.determineSignatureType(safeSignature)

      expect(result).toBe('safe-wallet')
    })

    it('should identify hex signatures', () => {
      const hexSignature =
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b'

      const result = AuthUtils.determineSignatureType(hexSignature)

      expect(result).toBe('hex')
    })

    it('should identify unknown signatures', () => {
      const unknownSignature1 = 'random text'
      const unknownSignature2 = '12345'
      const unknownSignature3 = 'safe-wallet:incomplete'
      const unknownSignature4 = '0x123'

      expect(AuthUtils.determineSignatureType(unknownSignature1)).toBe('unknown')
      expect(AuthUtils.determineSignatureType(unknownSignature2)).toBe('unknown')
      expect(AuthUtils.determineSignatureType(unknownSignature3)).toBe('unknown')
      expect(AuthUtils.determineSignatureType(unknownSignature4)).toBe('unknown')
    })

    it('should prioritize Safe wallet over hex when both patterns match', () => {
      // This tests the order of checks in the method
      const safeSignature = `safe-wallet:0x1234:nonce123:1641024000`

      const result = AuthUtils.determineSignatureType(safeSignature)

      expect(result).toBe('safe-wallet')
    })
  })

  describe('createAuthRequest', () => {
    beforeEach(() => {
      jest.spyOn(Date, 'now').mockReturnValue(mockTimestamp)
      jest.spyOn(AuthUtils, 'generateNonce').mockReturnValue(mockNonce)
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('should create auth request with all required fields', () => {
      const request = AuthUtils.createAuthRequest(mockWalletAddress, mockChainId)

      expect(request).toEqual({
        walletAddress: mockWalletAddress,
        chainId: mockChainId,
        message: expect.any(String),
        nonce: mockNonce,
        timestamp: mockTimestamp,
      })
    })

    it('should create auth request without chain ID', () => {
      const request = AuthUtils.createAuthRequest(mockWalletAddress)

      expect(request.walletAddress).toBe(mockWalletAddress)
      expect(request.chainId).toBeUndefined()
      expect(request.nonce).toBe(mockNonce)
      expect(request.timestamp).toBe(mockTimestamp)
    })

    it('should use custom nonce when provided', () => {
      const customNonce = 'custom_nonce_123'

      const request = AuthUtils.createAuthRequest(mockWalletAddress, mockChainId, customNonce)

      expect(request.nonce).toBe(customNonce)
    })

    it('should generate nonce when custom nonce not provided', () => {
      const request = AuthUtils.createAuthRequest(mockWalletAddress, mockChainId)

      expect(request.nonce).toBe(mockNonce)
      expect(AuthUtils.generateNonce).toHaveBeenCalled()
    })

    it('should create proper message content', () => {
      const request = AuthUtils.createAuthRequest(mockWalletAddress, mockChainId)

      expect(request.message).toContain('Welcome to SuperPool!')
      expect(request.message).toContain(mockWalletAddress)
      expect(request.message).toContain(mockNonce)
      expect(request.message).toContain(mockTimestamp.toString())
    })

    it('should use current timestamp', () => {
      const request = AuthUtils.createAuthRequest(mockWalletAddress, mockChainId)

      expect(request.timestamp).toBe(mockTimestamp)
      expect(Date.now).toHaveBeenCalled()
    })
  })

  describe('getAuthAge', () => {
    beforeEach(() => {
      jest.spyOn(Date, 'now').mockReturnValue(mockTimestamp + 300000) // 5 minutes later
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('should calculate auth age correctly', () => {
      const result = AuthUtils.getAuthAge(mockTimestamp)

      expect(result.ageMs).toBe(300000) // 5 minutes in ms
      expect(result.ageSeconds).toBe(300) // 5 minutes in seconds
      expect(result.isExpired).toBe(false) // Not expired (< 10 minutes)
    })

    it('should identify expired authentication', () => {
      jest.spyOn(Date, 'now').mockReturnValue(mockTimestamp + 700000) // 11.67 minutes later

      const result = AuthUtils.getAuthAge(mockTimestamp)

      expect(result.ageMs).toBe(700000)
      expect(result.ageSeconds).toBe(700)
      expect(result.isExpired).toBe(true)
    })

    it('should handle edge case at expiration boundary', () => {
      jest.spyOn(Date, 'now').mockReturnValue(mockTimestamp + 600000) // Exactly 10 minutes later

      const result = AuthUtils.getAuthAge(mockTimestamp)

      expect(result.ageMs).toBe(600000)
      expect(result.ageSeconds).toBe(600)
      expect(result.isExpired).toBe(false) // Exactly at boundary, not expired
    })

    it('should handle zero age', () => {
      jest.spyOn(Date, 'now').mockReturnValue(mockTimestamp)

      const result = AuthUtils.getAuthAge(mockTimestamp)

      expect(result.ageMs).toBe(0)
      expect(result.ageSeconds).toBe(0)
      expect(result.isExpired).toBe(false)
    })

    it('should handle negative age (future timestamp)', () => {
      jest.spyOn(Date, 'now').mockReturnValue(mockTimestamp - 100000)

      const result = AuthUtils.getAuthAge(mockTimestamp)

      expect(result.ageMs).toBe(-100000)
      expect(result.ageSeconds).toBe(-100)
      expect(result.isExpired).toBe(false)
    })
  })

  describe('formatAuthContext', () => {
    const mockRequest: SignatureRequest = {
      walletAddress: mockWalletAddress,
      chainId: mockChainId,
      message: 'This is a test message for authentication that is longer than 50 characters to test truncation',
      nonce: mockNonce,
      timestamp: mockTimestamp,
    }

    beforeEach(() => {
      jest.spyOn(Date, 'now').mockReturnValue(mockTimestamp + 300000) // 5 minutes later
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('should format auth context correctly', () => {
      const context = AuthUtils.formatAuthContext(mockRequest)

      expect(context).toEqual({
        walletPreview: '0x742d...C5b8',
        messageLength: mockRequest.message.length,
        messagePreview: mockRequest.message.substring(0, 50) + '...',
        chainId: mockChainId,
        nonceLength: mockNonce.length,
        timestamp: mockTimestamp,
        ageSeconds: 300,
      })
    })

    it('should use default chainId when not provided', () => {
      const requestWithoutChainId = { ...mockRequest, chainId: undefined }

      const context = AuthUtils.formatAuthContext(requestWithoutChainId)

      expect(context.chainId).toBe(1)
    })

    it('should handle short wallet address', () => {
      const shortAddress = '0x1234567890'
      const requestWithShortAddress = {
        ...mockRequest,
        walletAddress: shortAddress,
      }

      const context = AuthUtils.formatAuthContext(requestWithShortAddress)

      expect(context.walletPreview).toBe('0x1234...7890')
    })

    it('should handle short message', () => {
      const shortMessage = 'Short message'
      const requestWithShortMessage = { ...mockRequest, message: shortMessage }

      const context = AuthUtils.formatAuthContext(requestWithShortMessage)

      expect(context.messagePreview).toBe(shortMessage + '...')
      expect(context.messageLength).toBe(shortMessage.length)
    })

    it('should truncate long message', () => {
      const context = AuthUtils.formatAuthContext(mockRequest)

      expect(context.messagePreview).toHaveLength(53) // 50 chars + '...'
      expect(String(context.messagePreview).endsWith('...')).toBe(true)
    })

    it('should include correct age calculation', () => {
      const context = AuthUtils.formatAuthContext(mockRequest)

      expect(context.ageSeconds).toBe(300)
    })

    it('should handle different nonce lengths', () => {
      const longNonce = 'very_long_nonce_with_many_characters_12345'
      const requestWithLongNonce = { ...mockRequest, nonce: longNonce }

      const context = AuthUtils.formatAuthContext(requestWithLongNonce)

      expect(context.nonceLength).toBe(longNonce.length)
    })
  })
})
