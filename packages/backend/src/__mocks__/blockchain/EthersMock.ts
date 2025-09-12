/**
 * Comprehensive Ethers.js Mock System
 *
 * This mock provides complete ethers.js simulation for testing blockchain
 * interactions, contract calls, and Web3 functionality in Cloud Functions.
 * Completely updated with proper TypeScript support and Jest compatibility.
 */

import { jest } from '@jest/globals'

// Ethers Types Simulation (properly typed)
export interface MockLogEntry {
  address: string
  topics: string[]
  data: string
}

export interface MockEvent {
  event: string
  args: Record<string, unknown>
}

export interface MockTransactionResponse {
  hash: string
  from: string
  to?: string
  value: bigint
  gasLimit: bigint
  gasPrice?: bigint
  maxFeePerGas?: bigint
  maxPriorityFeePerGas?: bigint
  nonce: number
  blockNumber?: number
  blockHash?: string
  wait: jest.MockedFunction<(confirmations?: number) => Promise<MockTransactionReceipt>>
}

export interface MockTransactionReceipt {
  transactionHash: string
  blockNumber: number
  blockHash: string
  transactionIndex: number
  gasUsed: bigint
  effectiveGasPrice: bigint
  status: number
  logs: MockLogEntry[]
  events?: MockEvent[]
}

export interface MockBlock {
  number: number
  hash: string
  timestamp: number
  parentHash: string
  transactions: string[]
  gasLimit: bigint
  gasUsed: bigint
  baseFeePerGas: bigint
  miner: string
  difficulty: bigint
  extraData: string
}

export interface MockNetwork {
  chainId: number
  name: string
  ensAddress?: string | null
}

export interface MockFeeData {
  gasPrice: bigint
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
}

export interface MockTransactionRequest {
  to?: string
  value?: bigint | string
  gasLimit?: bigint | string
  gasPrice?: bigint | string
  data?: string
}

// Mock Provider Interface
export interface MockProvider {
  getNetwork: jest.MockedFunction<() => Promise<MockNetwork>>
  getBlock: jest.MockedFunction<(blockHashOrNumber?: string | number) => Promise<MockBlock>>
  getBlockNumber: jest.MockedFunction<() => Promise<number>>
  getTransaction: jest.MockedFunction<(hash: string) => Promise<MockTransactionResponse>>
  getTransactionReceipt: jest.MockedFunction<(hash: string) => Promise<MockTransactionReceipt>>
  waitForTransaction: jest.MockedFunction<(hash: string, confirmations?: number, timeout?: number) => Promise<MockTransactionReceipt>>
  getBalance: jest.MockedFunction<(address: string) => Promise<bigint>>
  getTransactionCount: jest.MockedFunction<(address: string) => Promise<number>>
  estimateGas: jest.MockedFunction<(transaction: MockTransactionRequest) => Promise<bigint>>
  getFeeData: jest.MockedFunction<() => Promise<MockFeeData>>
  getLogs: jest.MockedFunction<(filter: Record<string, unknown>) => Promise<MockLogEntry[]>>
  resolveName: jest.MockedFunction<(name: string) => Promise<string | null>>
  lookupAddress: jest.MockedFunction<(address: string) => Promise<string | null>>
  connection: {
    url: string
  }
  send: jest.MockedFunction<(method: string, params: unknown[]) => Promise<unknown>>
  getCode: jest.MockedFunction<(address: string) => Promise<string>>
}

// Mock Wallet Interface
export interface MockWallet {
  address: string
  privateKey: string
  provider: MockProvider
  signMessage: jest.MockedFunction<(message: string | Uint8Array) => Promise<string>>
  signTransaction: jest.MockedFunction<(transaction: MockTransactionRequest) => Promise<string>>
  signTypedData: jest.MockedFunction<
    (domain: Record<string, unknown>, types: Record<string, unknown>, value: Record<string, unknown>) => Promise<string>
  >
  sendTransaction: jest.MockedFunction<(transaction: MockTransactionRequest) => Promise<MockTransactionResponse>>
  connect: jest.MockedFunction<(provider: MockProvider) => MockWallet>
  encrypt: jest.MockedFunction<(password: string) => Promise<string>>
}

// Mock Contract Interface
export interface MockContract {
  target: string
  interface: Record<string, unknown>
  provider: MockProvider
  runner: MockWallet
  getFunction: jest.MockedFunction<(nameOrSignature: string) => jest.MockedFunction<(...args: unknown[]) => Promise<unknown>>>
  queryFilter: jest.MockedFunction<(event: unknown, fromBlock?: unknown, toBlock?: unknown) => Promise<MockEvent[]>>
  on: jest.MockedFunction<(event: string, listener: (...args: unknown[]) => void) => void>
  off: jest.MockedFunction<(event: string, listener?: (...args: unknown[]) => void) => void>
  removeAllListeners: jest.MockedFunction<(event?: string) => void>
  estimateGas: Record<string, jest.MockedFunction<(...args: unknown[]) => Promise<bigint>>>
  staticCall: Record<string, jest.MockedFunction<(...args: unknown[]) => Promise<unknown>>>
  connect: jest.MockedFunction<(runner: MockWallet) => MockContract>
  deploymentTransaction: jest.MockedFunction<() => MockTransactionResponse | null>
}

export class EthersMock {
  private static instance: EthersMock

  // Mock instances
  public provider!: MockProvider
  public wallet!: MockWallet
  public contract!: MockContract

  // Internal state for realistic blockchain simulation
  private currentBlockNumber = 1234567
  private networkChainId = 80002 // Polygon Amoy default
  private networkName = 'polygon-amoy'
  private currentGasPrice = BigInt('20000000000') // 20 Gwei
  private accountBalances = new Map<string, bigint>()
  private transactionNonces = new Map<string, number>()
  private pendingTransactions = new Map<string, MockTransactionResponse>()

  private constructor() {
    this.initializeProviderMock()
    this.initializeWalletMock()
    this.initializeContractMock()
    this.seedDefaultData()
  }

  static getInstance(): EthersMock {
    if (!EthersMock.instance) {
      EthersMock.instance = new EthersMock()
    }
    return EthersMock.instance
  }

  private initializeProviderMock(): void {
    this.provider = {
      // Network information
      getNetwork: jest.fn(async () => ({
        chainId: this.networkChainId,
        name: this.networkName,
        ensAddress: null,
      })),

      // Block information
      getBlock: jest.fn(async (blockHashOrNumber?: string | number) => {
        const blockNumber =
          typeof blockHashOrNumber === 'number'
            ? blockHashOrNumber
            : blockHashOrNumber === 'latest'
              ? this.currentBlockNumber
              : this.currentBlockNumber

        return {
          number: blockNumber,
          hash: `0x${blockNumber.toString(16).padStart(64, '0')}`,
          timestamp: Math.floor(Date.now() / 1000) - (this.currentBlockNumber - blockNumber) * 2,
          parentHash: `0x${(blockNumber - 1).toString(16).padStart(64, '0')}`,
          transactions: [],
          gasLimit: BigInt('30000000'),
          gasUsed: BigInt('15000000'),
          baseFeePerGas: BigInt('20000000000'),
          miner: '0x0000000000000000000000000000000000000000',
          difficulty: BigInt('0'),
          extraData: '0x',
        }
      }),

      getBlockNumber: jest.fn(async () => this.currentBlockNumber),

      // Transaction operations
      getTransaction: jest.fn(async (hash: string) => {
        const pending = this.pendingTransactions.get(hash)
        if (pending) {
          return {
            ...pending,
            blockNumber: this.currentBlockNumber,
            blockHash: `0x${this.currentBlockNumber.toString(16).padStart(64, '0')}`,
          }
        }

        // Return mock transaction for any hash
        return {
          hash,
          from: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
          to: '0x1234567890123456789012345678901234567890',
          value: BigInt('1000000000000000000'), // 1 ETH
          gasLimit: BigInt('21000'),
          gasPrice: this.currentGasPrice,
          nonce: 42,
          blockNumber: this.currentBlockNumber,
          blockHash: `0x${this.currentBlockNumber.toString(16).padStart(64, '0')}`,
          wait: jest.fn(async () => this.createMockReceipt(hash)),
        }
      }),

      getTransactionReceipt: jest.fn(async (hash: string) => this.createMockReceipt(hash)),

      waitForTransaction: jest.fn(async (hash: string, confirmations: number = 1) => {
        // Simulate block confirmations
        await this.simulateBlockProgression(confirmations)
        return this.createMockReceipt(hash)
      }),

      // Account information
      getBalance: jest.fn(async (address: string) => {
        return this.accountBalances.get(address.toLowerCase()) || BigInt('1000000000000000000') // 1 ETH default
      }),

      getTransactionCount: jest.fn(async (address: string) => {
        return this.transactionNonces.get(address.toLowerCase()) || 0
      }),

      // Gas operations
      estimateGas: jest.fn(async (transaction: MockTransactionRequest) => {
        // Simulate realistic gas estimation based on transaction type
        if (transaction.data && transaction.data.length > 10) {
          // Contract interaction - higher gas
          return BigInt('500000')
        }
        // Simple transfer
        return BigInt('21000')
      }),

      getFeeData: jest.fn(async () => ({
        gasPrice: this.currentGasPrice,
        maxFeePerGas: this.currentGasPrice * BigInt(2),
        maxPriorityFeePerGas: BigInt('2000000000'), // 2 Gwei
      })),

      // Event filtering
      getLogs: jest.fn(async () => []),

      // Utility methods
      resolveName: jest.fn(async () => null),
      lookupAddress: jest.fn(async () => null),

      // Provider connection info
      connection: {
        url: 'http://127.0.0.1:8545',
      },

      // Provider utilities
      send: jest.fn(async (method: string) => {
        switch (method) {
          case 'eth_blockNumber':
            return `0x${this.currentBlockNumber.toString(16)}`
          case 'eth_chainId':
            return `0x${this.networkChainId.toString(16)}`
          case 'net_version':
            return this.networkChainId.toString()
          default:
            return null
        }
      }),

      getCode: jest.fn(async (address: string) => {
        // Return empty for non-contract addresses
        if (address === '0x0000000000000000000000000000000000000000') return '0x'
        // Return mock bytecode for contract addresses
        return '0x608060405234801561001057600080fd5b50...'
      }),
    }
  }

  private initializeWalletMock(): void {
    const testAddress = '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a'
    const testPrivateKey = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'

    this.wallet = {
      // Wallet properties
      address: testAddress,
      privateKey: testPrivateKey,
      provider: this.provider,

      // Signing methods
      signMessage: jest.fn(async (message: string | Uint8Array) => {
        // Create deterministic signature for testing
        const messageStr = typeof message === 'string' ? message : Buffer.from(message).toString()
        const hash = this.createDeterministicHash(messageStr)
        return `0x${hash}${'00'.repeat(65 - hash.length / 2)}`
      }),

      signTransaction: jest.fn(async (transaction: MockTransactionRequest) => {
        // Create mock signed transaction
        const txHash = this.createTransactionHash(transaction)
        return `0x${txHash}${'00'.repeat(100)}`
      }),

      signTypedData: jest.fn(async (domain: Record<string, unknown>, types: Record<string, unknown>, value: Record<string, unknown>) => {
        // Mock EIP-712 signature
        const dataHash = this.createDeterministicHash(JSON.stringify({ domain, types, value }))
        return `0x${dataHash}${'00'.repeat(65 - dataHash.length / 2)}`
      }),

      // Transaction sending
      sendTransaction: jest.fn(async (transaction: MockTransactionRequest) => {
        const hash = this.createTransactionHash(transaction)
        const from = this.wallet.address
        const nonce = this.transactionNonces.get(from.toLowerCase()) || 0

        const mockTx: MockTransactionResponse = {
          hash,
          from,
          to: transaction.to,
          value: BigInt(transaction.value?.toString() || '0'),
          gasLimit: BigInt(transaction.gasLimit?.toString() || '21000'),
          gasPrice: this.currentGasPrice,
          nonce,
          wait: jest.fn(async (confirmations?: number) => {
            await this.simulateBlockProgression(confirmations || 1)
            return this.createMockReceipt(hash)
          }),
        }

        // Update nonce
        this.transactionNonces.set(from.toLowerCase(), nonce + 1)

        // Store pending transaction
        this.pendingTransactions.set(hash, mockTx)

        return mockTx
      }),

      // Connection
      connect: jest.fn((provider: MockProvider) => {
        const connectedWallet: MockWallet = { ...this.wallet, provider }
        return connectedWallet
      }),

      // Utility methods
      encrypt: jest.fn(async () => '{"version":3,"id":"encrypted-wallet"}'),
    }
  }

  private initializeContractMock(): void {
    this.contract = {
      // Contract properties
      target: '0x1234567890123456789012345678901234567890',
      interface: {},
      provider: this.provider,
      runner: this.wallet,

      // Contract method calls
      getFunction: jest.fn((nameOrSignature: string) => {
        return jest.fn(async () => `mock-result-${nameOrSignature}`)
      }),

      // Event filtering
      queryFilter: jest.fn(async () => []),

      on: jest.fn(),
      off: jest.fn(),
      removeAllListeners: jest.fn(),

      // Gas estimation for contract methods
      estimateGas: {},

      // Static calls (view functions)
      staticCall: {},

      // Connection
      connect: jest.fn((runner: MockWallet) => {
        return { ...this.contract, runner }
      }),

      // Contract deployment
      deploymentTransaction: jest.fn(() => null),
    }
  }

  private seedDefaultData(): void {
    // Seed default account balances
    const testAddresses = [
      '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
      '0x1234567890123456789012345678901234567890',
      '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    ]

    testAddresses.forEach((address, index) => {
      this.accountBalances.set(address.toLowerCase(), BigInt(`${1000 + index * 500}000000000000000000`))
      this.transactionNonces.set(address.toLowerCase(), index * 5)
    })
  }

  // Test utilities
  resetAllMocks(): void {
    jest.clearAllMocks()

    // Reset internal state
    this.currentBlockNumber = 1234567
    this.networkChainId = 80002
    this.networkName = 'polygon-amoy'
    this.currentGasPrice = BigInt('20000000000')
    this.accountBalances.clear()
    this.transactionNonces.clear()
    this.pendingTransactions.clear()

    // Reinitialize mocks
    this.initializeProviderMock()
    this.initializeWalletMock()
    this.initializeContractMock()
    this.seedDefaultData()
  }

  // Network configuration
  setNetwork(chainId: number, name: string): void {
    this.networkChainId = chainId
    this.networkName = name
  }

  setBlockNumber(blockNumber: number): void {
    this.currentBlockNumber = blockNumber
  }

  setGasPrice(gasPrice: bigint): void {
    this.currentGasPrice = gasPrice
  }

  // Account management
  setAccountBalance(address: string, balance: bigint): void {
    this.accountBalances.set(address.toLowerCase(), balance)
  }

  setAccountNonce(address: string, nonce: number): void {
    this.transactionNonces.set(address.toLowerCase(), nonce)
  }

  // Error simulation
  simulateNetworkError(errorMessage: string = 'Network error'): void {
    const error = new Error(errorMessage) as Error & { code: string }
    error.code = 'NETWORK_ERROR'

    this.provider.getNetwork = jest.fn(async () => {
      throw error
    })
    this.provider.getBlock = jest.fn(async () => {
      throw error
    })
    this.provider.getTransaction = jest.fn(async () => {
      throw error
    })
  }

  simulateTransactionFailure(): void {
    this.wallet.sendTransaction = jest.fn(async (transaction: MockTransactionRequest) => {
      const hash = this.createTransactionHash(transaction)
      return {
        hash,
        from: this.wallet.address,
        to: transaction.to,
        value: BigInt(transaction.value?.toString() || '0'),
        gasLimit: BigInt(transaction.gasLimit?.toString() || '21000'),
        gasPrice: this.currentGasPrice,
        nonce: 0,
        wait: jest.fn(async () => ({
          ...this.createMockReceipt(hash),
          status: 0, // Failed
        })),
      }
    })
  }

  simulateContractRevert(reason: string = 'execution reverted'): void {
    const revertError = new Error(`execution reverted: ${reason}`) as Error & { code: string; reason: string }
    revertError.code = 'CALL_EXCEPTION'
    revertError.reason = reason

    // Override contract method calls to throw revert error
    this.contract.getFunction = jest.fn(() =>
      jest.fn(async () => {
        throw revertError
      })
    )
  }

  // Restore normal operation
  restoreNormalOperation(): void {
    this.resetAllMocks()
  }

  // Helper methods
  private createTransactionHash(transaction: MockTransactionRequest): string {
    const data = JSON.stringify({
      to: transaction.to,
      value: transaction.value?.toString(),
      data: transaction.data,
      timestamp: Date.now(),
    })
    return this.createDeterministicHash(data)
  }

  private createDeterministicHash(input: string): string {
    // Simple deterministic hash for testing
    let hash = 0
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).padStart(64, '0')
  }

  private createMockReceipt(transactionHash: string): MockTransactionReceipt {
    return {
      transactionHash,
      blockNumber: this.currentBlockNumber,
      blockHash: `0x${this.currentBlockNumber.toString(16).padStart(64, '0')}`,
      transactionIndex: 0,
      gasUsed: BigInt('21000'),
      effectiveGasPrice: this.currentGasPrice,
      status: 1, // Success
      logs: [],
    }
  }

  private async simulateBlockProgression(blocks: number): Promise<void> {
    // Simulate block mining time
    const blockTime = 2000 // 2 seconds per block
    await new Promise((resolve) => setTimeout(resolve, Math.min((blocks * blockTime) / 10, 100)))
    this.currentBlockNumber += blocks
  }
}

// Helper function for deterministic hash generation
function createDeterministicHash(input: string): string {
  // Simple deterministic hash for testing
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).padStart(64, '0')
}

// Ethers utility functions (exported for proper mocking)
export const mockEthersUtils = {
  // Utilities
  parseEther: jest.fn((value: string) => {
    return BigInt(Math.floor(parseFloat(value) * 1e18))
  }),

  formatEther: jest.fn((value: bigint) => {
    return (Number(value) / 1e18).toString()
  }),

  parseUnits: jest.fn((value: string, decimals: string | number) => {
    // Handle gwei specifically
    if (decimals === 'gwei' || decimals === 9) {
      return BigInt(Math.floor(parseFloat(value) * 1e9))
    }
    const decimalsNum = typeof decimals === 'string' ? 18 : decimals
    return BigInt(Math.floor(parseFloat(value) * Math.pow(10, decimalsNum)))
  }),

  formatUnits: jest.fn((value: bigint, decimals: number) => {
    return (Number(value) / Math.pow(10, decimals)).toString()
  }),

  // Address utilities
  isAddress: jest.fn((address: string) => {
    return /^0x[a-fA-F0-9]{40}$/.test(address)
  }),

  getAddress: jest.fn((address: string) => {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new Error('Invalid address')
    }
    return address.toLowerCase()
  }),

  // Hashing
  keccak256: jest.fn((data: string | Uint8Array) => {
    const input = typeof data === 'string' ? data : Buffer.from(data).toString()
    const hash = createDeterministicHash(input)
    return `0x${hash}`
  }),

  solidityPackedKeccak256: jest.fn((types: string[], values: unknown[]) => {
    const packed = types.map((type, i) => `${type}:${values[i]}`).join('|')
    const hash = createDeterministicHash(packed)
    return `0x${hash}`
  }),

  // Encoding
  AbiCoder: jest.fn(() => ({
    encode: jest.fn(() => '0x1234567890abcdef'),
    decode: jest.fn(() => ['decoded', 'values']),
  })),

  // Bytes utilities
  getBytes: jest.fn((value: string) => {
    if (value.startsWith('0x')) {
      return Uint8Array.from(Buffer.from(value.slice(2), 'hex'))
    }
    return Uint8Array.from(Buffer.from(value, 'utf8'))
  }),

  hexlify: jest.fn((value: Uint8Array | string) => {
    if (typeof value === 'string') {
      return `0x${Buffer.from(value, 'utf8').toString('hex')}`
    }
    return `0x${Buffer.from(value).toString('hex')}`
  }),

  // String conversion utilities
  toUtf8Bytes: jest.fn((str: string) => {
    return Uint8Array.from(Buffer.from(str, 'utf8'))
  }),

  toUtf8String: jest.fn((bytes: Uint8Array) => {
    return Buffer.from(bytes).toString('utf8')
  }),
}

// Global mock instance
export const ethersMock = EthersMock.getInstance()

export default ethersMock
