import type { Connector } from 'wagmi'
import { RegularWalletSigner, SafeWalletSigner, SignatureService, WalletTypeDetector } from './signatureService'

// Mock connector
const mockConnector = {
  id: 'safe',
  name: 'Safe Wallet',
} as Connector

const mockRegularConnector = {
  id: 'metamask',
  name: 'MetaMask',
} as Connector

// Mock signature functions
const mockSignatureFunctions = {
  signTypedDataAsync: jest.fn(),
  signMessageAsync: jest.fn(),
}

describe('WalletTypeDetector', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('detectSafeWallet', () => {
    it('should detect Safe wallet by connector id', () => {
      expect(WalletTypeDetector.detectSafeWallet({ id: 'safe', name: 'Test' } as Connector)).toBe(true)
    })

    it('should detect Safe wallet by connector name', () => {
      expect(WalletTypeDetector.detectSafeWallet({ id: 'test', name: 'Safe Wallet' } as Connector)).toBe(true)
    })

    it('should not detect Safe wallet for regular connectors', () => {
      expect(WalletTypeDetector.detectSafeWallet(mockRegularConnector)).toBe(false)
    })

    it('should return false for undefined connector', () => {
      expect(WalletTypeDetector.detectSafeWallet(undefined)).toBe(false)
    })
  })

  describe('detectFromSignatureError', () => {
    it('should detect Safe wallet from error patterns', () => {
      expect(WalletTypeDetector.detectFromSignatureError('Method disabled')).toBe(true)
      expect(WalletTypeDetector.detectFromSignatureError('safe://wc?...')).toBe(true)
      expect(WalletTypeDetector.detectFromSignatureError('the method eth_signTypedData_v4 does not exist')).toBe(true)
    })

    it('should not detect Safe wallet from regular errors', () => {
      expect(WalletTypeDetector.detectFromSignatureError('User rejected')).toBe(false)
      expect(WalletTypeDetector.detectFromSignatureError('Network error')).toBe(false)
    })
  })
})

describe('SafeWalletSigner', () => {
  const mockRequest = {
    message: 'Test message',
    nonce: '123',
    timestamp: 1640995200000,
    walletAddress: '0x123',
    chainId: 1,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    jest.clearAllTimers()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should successfully sign with direct connector', async () => {
    mockSignatureFunctions.signMessageAsync.mockResolvedValue('0x1234567890abcdef')

    const result = await SafeWalletSigner.sign(mockRequest, mockSignatureFunctions, mockConnector)

    expect(result).toEqual({
      signature: '0x1234567890abcdef',
      signatureType: 'personal-sign',
    })
  })

  it('should fallback to ownership verification on connector failure', async () => {
    mockSignatureFunctions.signMessageAsync.mockRejectedValue(new Error('Connector failed'))

    const result = await SafeWalletSigner.sign(mockRequest, mockSignatureFunctions, mockConnector)

    expect(result).toEqual({
      signature: `safe-wallet:${mockRequest.walletAddress}:${mockRequest.nonce}:${mockRequest.timestamp}`,
      signatureType: 'safe-wallet',
    })
  })

  it('should handle timeout and fallback to ownership verification', async () => {
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => resolve('0x1234567890abcdef'), 25000) // Longer than 20s timeout
    })
    mockSignatureFunctions.signMessageAsync.mockReturnValue(timeoutPromise)

    const resultPromise = SafeWalletSigner.sign(mockRequest, mockSignatureFunctions, mockConnector)

    // Fast-forward time to trigger timeout
    jest.advanceTimersByTime(20000)

    const result = await resultPromise

    expect(result.signatureType).toBe('safe-wallet')
  })
})

describe('RegularWalletSigner', () => {
  const mockRequest = {
    message: 'Test message',
    nonce: '123',
    timestamp: 1640995200000,
    walletAddress: '0x123',
    chainId: 1,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    jest.clearAllTimers()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should successfully sign with EIP-712 typed data', async () => {
    mockSignatureFunctions.signTypedDataAsync.mockResolvedValue('0x1234567890abcdef')

    const result = await RegularWalletSigner.sign(mockRequest, mockSignatureFunctions)

    expect(result).toEqual({
      signature: '0x1234567890abcdef',
      signatureType: 'typed-data',
    })
  })

  it('should fallback to personal message signing when EIP-712 fails', async () => {
    mockSignatureFunctions.signTypedDataAsync.mockRejectedValue(new Error('EIP-712 not supported'))
    mockSignatureFunctions.signMessageAsync.mockResolvedValue('0xabcdef1234567890')

    const result = await RegularWalletSigner.sign(mockRequest, mockSignatureFunctions)

    expect(result).toEqual({
      signature: '0xabcdef1234567890',
      signatureType: 'personal-sign',
    })
  })

  it('should detect Safe wallet from personal sign error and switch to Safe authentication', async () => {
    mockSignatureFunctions.signTypedDataAsync.mockRejectedValue(new Error('EIP-712 not supported'))
    mockSignatureFunctions.signMessageAsync.mockResolvedValue('{"error": "Method disabled"}')

    const result = await RegularWalletSigner.sign(mockRequest, mockSignatureFunctions)

    expect(result.signatureType).toBe('safe-wallet')
    expect(result.signature).toBe(`safe-wallet:${mockRequest.walletAddress}:${mockRequest.nonce}:${mockRequest.timestamp}`)
  })

  describe('validateSignatureFormat', () => {
    it('should validate hex signatures', () => {
      expect(RegularWalletSigner.validateSignatureFormat('0x1234567890abcdef')).toBe(true)
    })

    it('should validate Safe wallet tokens', () => {
      expect(RegularWalletSigner.validateSignatureFormat('safe-wallet:0x123:nonce:timestamp')).toBe(true)
    })

    it('should reject invalid signatures', () => {
      expect(RegularWalletSigner.validateSignatureFormat('invalid')).toBe(false)
      expect(RegularWalletSigner.validateSignatureFormat('0x123')).toBe(false) // Too short
    })
  })
})

describe('SignatureService', () => {
  const mockRequest = {
    message: 'Test message',
    nonce: '123',
    timestamp: 1640995200000,
    walletAddress: '0x123',
    chainId: 1,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should use SafeWalletSigner for Safe wallets', async () => {
    mockSignatureFunctions.signMessageAsync.mockResolvedValue('0x1234567890abcdef')

    const result = await SignatureService.requestSignature(mockRequest, mockSignatureFunctions, mockConnector)

    expect(result.signatureType).toBe('personal-sign')
  })

  it('should use RegularWalletSigner for regular wallets', async () => {
    mockSignatureFunctions.signTypedDataAsync.mockResolvedValue('0x1234567890abcdef')

    const result = await SignatureService.requestSignature(mockRequest, mockSignatureFunctions, mockRegularConnector)

    expect(result.signatureType).toBe('typed-data')
  })

  it('should validate signature format and throw on invalid signatures', async () => {
    mockSignatureFunctions.signTypedDataAsync.mockResolvedValue('invalid-signature')

    await expect(SignatureService.requestSignature(mockRequest, mockSignatureFunctions, mockRegularConnector)).rejects.toThrow(
      'Invalid signature received'
    )
  })
})
