import { mockLogger } from '../__tests__/setup'

// ethers is mocked wholesale: these helpers are thin wiring around it, and the
// value under test is the branching (missing config, failed tx, error mapping).
jest.mock('ethers', () => ({
  JsonRpcProvider: jest.fn().mockImplementation((url: string, chainId: number) => ({ url, chainId })),
  Wallet: jest.fn().mockImplementation((key: string, provider: unknown) => ({ key, provider })),
  Contract: jest.fn(),
}))

jest.mock('../constants', () => ({
  getChainConfig: jest.fn(),
  PoolFactoryABI: ['function isWhitelistEnabled() view returns (bool)'],
}))

const {
  getProvider,
  getBackendWallet,
  getPoolFactoryContract,
  isWhitelistModeEnabled,
  isWalletWhitelisted,
  whitelistWallet,
} = require('./blockchain')
const { getChainConfig } = require('../constants')
const { Contract, JsonRpcProvider, Wallet } = require('ethers')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHAIN_ID = 80002
const WALLET = '0x7C3ed3a184BAAb1DaF35f5387bA23736C7CD18a6'
const FACTORY = '0x91bC24Da032F32d94F7A0AE55a3f11b8A85e0d31'
const TX_HASH = '0x' + 'c'.repeat(64)

const fullConfig = { rpcUrl: 'https://rpc.example', poolFactoryAddress: FACTORY }

/** Installs a PoolFactory contract double with the given method implementations. */
function mockFactory(methods: Record<string, unknown>) {
  Contract.mockImplementation(() => methods)
  return methods
}

function successfulReceipt(overrides: Record<string, unknown> = {}) {
  return { status: 1, hash: TX_HASH, gasUsed: 21000n, gasPrice: 2n, ...overrides }
}

describe('blockchain utils', () => {
  const ORIGINAL_KEY = process.env.BACKEND_WALLET_PRIVATE_KEY

  beforeEach(() => {
    jest.clearAllMocks()
    getChainConfig.mockReturnValue(fullConfig)
    process.env.BACKEND_WALLET_PRIVATE_KEY = '0xprivatekey'
  })

  afterAll(() => {
    process.env.BACKEND_WALLET_PRIVATE_KEY = ORIGINAL_KEY
  })

  // -------------------------------------------------------------------------
  // getProvider
  // -------------------------------------------------------------------------

  describe('getProvider', () => {
    it('should build a provider from the chain config', () => {
      getProvider(CHAIN_ID)

      expect(JsonRpcProvider).toHaveBeenCalledWith(fullConfig.rpcUrl, CHAIN_ID)
    })

    it('should reject an unsupported chain', () => {
      getChainConfig.mockReturnValue(undefined)

      expect(() => getProvider(CHAIN_ID)).toThrow(expect.objectContaining({ code: 'invalid-argument' }))
    })

    it('should reject a chain with no RPC URL configured', () => {
      getChainConfig.mockReturnValue({ poolFactoryAddress: FACTORY })

      expect(() => getProvider(CHAIN_ID)).toThrow(expect.objectContaining({ code: 'internal' }))
    })
  })

  // -------------------------------------------------------------------------
  // getBackendWallet
  // -------------------------------------------------------------------------

  describe('getBackendWallet', () => {
    it('should build a wallet from the configured private key', () => {
      getBackendWallet(CHAIN_ID)

      expect(Wallet).toHaveBeenCalledWith('0xprivatekey', expect.anything())
    })

    it('should fail when the private key is not configured', () => {
      delete process.env.BACKEND_WALLET_PRIVATE_KEY

      expect(() => getBackendWallet(CHAIN_ID)).toThrow(expect.objectContaining({ code: 'internal' }))
    })
  })

  // -------------------------------------------------------------------------
  // getPoolFactoryContract
  // -------------------------------------------------------------------------

  describe('getPoolFactoryContract', () => {
    it('should build the contract at the configured factory address', () => {
      getPoolFactoryContract(CHAIN_ID)

      expect(Contract).toHaveBeenCalledWith(FACTORY, expect.anything(), expect.anything())
    })

    it('should reject an unsupported chain', () => {
      getChainConfig.mockReturnValue(undefined)

      expect(() => getPoolFactoryContract(CHAIN_ID)).toThrow(expect.objectContaining({ code: 'invalid-argument' }))
    })

    it('should reject a chain with no factory address configured', () => {
      getChainConfig.mockReturnValue({ rpcUrl: fullConfig.rpcUrl })

      expect(() => getPoolFactoryContract(CHAIN_ID)).toThrow(expect.objectContaining({ code: 'internal' }))
    })
  })

  // -------------------------------------------------------------------------
  // Read helpers
  // -------------------------------------------------------------------------

  describe('isWhitelistModeEnabled', () => {
    it('should return the on-chain flag', async () => {
      mockFactory({ isWhitelistEnabled: jest.fn().mockResolvedValue(true) })

      await expect(isWhitelistModeEnabled(CHAIN_ID)).resolves.toBe(true)
    })

    it('should map a contract failure to internal', async () => {
      mockFactory({ isWhitelistEnabled: jest.fn().mockRejectedValue(new Error('rpc down')) })

      await expect(isWhitelistModeEnabled(CHAIN_ID)).rejects.toHaveProperty('code', 'internal')
      expect(mockLogger.error).toHaveBeenCalledWith('Error checking whitelist mode', expect.objectContaining({ error: 'rpc down' }))
    })
  })

  describe('isWalletWhitelisted', () => {
    it('should return the on-chain authorization', async () => {
      mockFactory({ isAuthorizedCreator: jest.fn().mockResolvedValue(true) })

      await expect(isWalletWhitelisted(WALLET, CHAIN_ID)).resolves.toBe(true)
    })

    it('should map a contract failure to internal', async () => {
      mockFactory({ isAuthorizedCreator: jest.fn().mockRejectedValue(new Error('rpc down')) })

      await expect(isWalletWhitelisted(WALLET, CHAIN_ID)).rejects.toHaveProperty('code', 'internal')
    })
  })

  // -------------------------------------------------------------------------
  // whitelistWallet
  // -------------------------------------------------------------------------

  describe('whitelistWallet', () => {
    it('should send the authorization tx and return hash plus gas cost', async () => {
      mockFactory({
        setCreatorAuthorization: jest.fn().mockResolvedValue({
          hash: TX_HASH,
          wait: jest.fn().mockResolvedValue(successfulReceipt()),
        }),
      })

      await expect(whitelistWallet(WALLET, CHAIN_ID)).resolves.toEqual({ transactionHash: TX_HASH, gasCost: '42000' })
    })

    it('should fall back to effectiveGasPrice when gasPrice is absent', async () => {
      mockFactory({
        setCreatorAuthorization: jest.fn().mockResolvedValue({
          hash: TX_HASH,
          wait: jest.fn().mockResolvedValue(successfulReceipt({ gasPrice: undefined, effectiveGasPrice: 3n })),
        }),
      })

      const result = await whitelistWallet(WALLET, CHAIN_ID)

      expect(result.gasCost).toBe('63000')
    })

    it('should report zero gas cost when no price is available', async () => {
      mockFactory({
        setCreatorAuthorization: jest.fn().mockResolvedValue({
          hash: TX_HASH,
          wait: jest.fn().mockResolvedValue(successfulReceipt({ gasPrice: undefined, effectiveGasPrice: undefined })),
        }),
      })

      const result = await whitelistWallet(WALLET, CHAIN_ID)

      expect(result.gasCost).toBe('0')
    })

    it('should fail when the node returns no transaction response', async () => {
      mockFactory({ setCreatorAuthorization: jest.fn().mockResolvedValue(null) })

      await expect(whitelistWallet(WALLET, CHAIN_ID)).rejects.toHaveProperty('code', 'internal')
    })

    it('should fail when the transaction reverts', async () => {
      mockFactory({
        setCreatorAuthorization: jest.fn().mockResolvedValue({
          hash: TX_HASH,
          wait: jest.fn().mockResolvedValue({ status: 0 }),
        }),
      })

      await expect(whitelistWallet(WALLET, CHAIN_ID)).rejects.toHaveProperty('code', 'internal')
    })

    it('should surface an insufficient-funds failure distinctly', async () => {
      mockFactory({ setCreatorAuthorization: jest.fn().mockRejectedValue(new Error('insufficient funds for gas')) })

      await expect(whitelistWallet(WALLET, CHAIN_ID)).rejects.toHaveProperty('message', expect.stringContaining('insufficient funds'))
    })

    it('should surface a nonce failure distinctly', async () => {
      mockFactory({ setCreatorAuthorization: jest.fn().mockRejectedValue(new Error('nonce too low')) })

      await expect(whitelistWallet(WALLET, CHAIN_ID)).rejects.toHaveProperty('message', expect.stringContaining('nonce'))
    })

    it('should handle non-Error rejections', async () => {
      mockFactory({ setCreatorAuthorization: jest.fn().mockRejectedValue('string failure') })

      await expect(whitelistWallet(WALLET, CHAIN_ID)).rejects.toHaveProperty('code', 'internal')
    })
  })
})
