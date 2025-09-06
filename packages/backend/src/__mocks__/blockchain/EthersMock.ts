/**
 * Comprehensive Ethers.js Mock System
 *
 * This mock provides complete ethers.js simulation for testing blockchain
 * interactions, contract calls, and Web3 functionality in Cloud Functions.
 */

import { jest } from '@jest/globals'
import type {
  Block,
  Contract,
  FeeData,
  JsonRpcProvider,
  Network,
  TransactionReceipt,
  TransactionRequest,
  TransactionResponse,
  Wallet,
} from 'ethers'

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
  wait: jest.MockedFunction<any>
}

export interface MockTransactionReceipt {
  transactionHash: string
  blockNumber: number
  blockHash: string
  transactionIndex: number
  gasUsed: bigint
  effectiveGasPrice: bigint
  status: number
  logs: any[]
  events?: any[]
}

export class EthersMock {
  private static instance: EthersMock

  // Mock instances
  public provider: jest.Mocked<JsonRpcProvider>
  public wallet: jest.Mocked<Wallet>
  public contract: jest.Mocked<Contract>

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
      getNetwork: jest.fn().mockImplementation(
        async () =>
          ({
            chainId: this.networkChainId,
            name: this.networkName,
            ensAddress: null,
          }) as Network
      ),

      // Block information
      getBlock: jest.fn().mockImplementation(async (blockHashOrNumber?: string | number) => {
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
        } as Block
      }),

      getBlockNumber: jest.fn().mockImplementation(async () => {
        return this.currentBlockNumber
      }),

      // Transaction operations
      getTransaction: jest.fn().mockImplementation(async (hash: string) => {
        const pending = this.pendingTransactions.get(hash)
        if (pending) {
          return {
            ...pending,
            blockNumber: this.currentBlockNumber,
            blockHash: `0x${this.currentBlockNumber.toString(16).padStart(64, '0')}`,
          } as TransactionResponse
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
          wait: jest.fn().mockResolvedValue(this.createMockReceipt(hash)),
        } as TransactionResponse
      }),

      getTransactionReceipt: jest.fn().mockImplementation(async (hash: string) => {
        return this.createMockReceipt(hash)
      }),

      waitForTransaction: jest.fn().mockImplementation(async (hash: string, confirmations: number = 1) => {
        // Simulate block confirmations
        await this.simulateBlockProgression(confirmations)
        return this.createMockReceipt(hash)
      }),

      // Account information
      getBalance: jest.fn().mockImplementation(async (address: string) => {
        return this.accountBalances.get(address.toLowerCase()) || BigInt('1000000000000000000') // 1 ETH default
      }),

      getTransactionCount: jest.fn().mockImplementation(async (address: string) => {
        return this.transactionNonces.get(address.toLowerCase()) || 0
      }),

      // Gas operations
      estimateGas: jest.fn().mockImplementation(async (transaction: TransactionRequest) => {
        // Simulate realistic gas estimation based on transaction type
        if (transaction.data && transaction.data.length > 10) {
          // Contract interaction - higher gas
          return BigInt('500000')
        }
        // Simple transfer
        return BigInt('21000')
      }),

      getFeeData: jest.fn().mockImplementation(
        async () =>
          ({
            gasPrice: this.currentGasPrice,
            maxFeePerGas: this.currentGasPrice * BigInt(2),
            maxPriorityFeePerGas: BigInt('2000000000'), // 2 Gwei
          }) as FeeData
      ),

      // Event filtering
      getLogs: jest.fn().mockImplementation(async (filter: any) => {
        // Return mock logs based on filter
        return []
      }),

      // Utility methods
      resolveName: jest.fn().mockResolvedValue(null),
      lookupAddress: jest.fn().mockResolvedValue(null),

      // Provider connection info
      connection: {
        url: 'http://127.0.0.1:8545',
      },

      // Provider utilities
      send: jest.fn().mockImplementation(async (method: string, params: any[]) => {
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
    } as unknown as jest.Mocked<JsonRpcProvider>
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
      signMessage: jest.fn().mockImplementation(async (message: string | Uint8Array) => {
        // Create deterministic signature for testing
        const messageStr = typeof message === 'string' ? message : Buffer.from(message).toString()
        const hash = this.createDeterministicHash(messageStr)
        return `0x${hash}${'00'.repeat(65 - hash.length / 2)}`
      }),

      signTransaction: jest.fn().mockImplementation(async (transaction: TransactionRequest) => {
        // Create mock signed transaction
        const txHash = this.createTransactionHash(transaction)
        return `0x${txHash}${'00'.repeat(100)}`
      }),

      signTypedData: jest.fn().mockImplementation(async (domain: any, types: any, value: any) => {
        // Mock EIP-712 signature
        const dataHash = this.createDeterministicHash(JSON.stringify({ domain, types, value }))
        return `0x${dataHash}${'00'.repeat(65 - dataHash.length / 2)}`
      }),

      // Transaction sending
      sendTransaction: jest.fn().mockImplementation(async (transaction: TransactionRequest) => {
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
          wait: jest.fn().mockImplementation(async (confirmations?: number) => {
            await this.simulateBlockProgression(confirmations || 1)
            return this.createMockReceipt(hash)
          }),
        }

        // Update nonce
        this.transactionNonces.set(from.toLowerCase(), nonce + 1)

        // Store pending transaction
        this.pendingTransactions.set(hash, mockTx)

        return mockTx as TransactionResponse
      }),

      // Connection
      connect: jest.fn().mockImplementation((provider: JsonRpcProvider) => {
        const connectedWallet = { ...this.wallet, provider }
        return connectedWallet
      }),

      // Utility methods
      encrypt: jest.fn().mockResolvedValue('{"version":3,"id":"encrypted-wallet"}'),
    } as unknown as jest.Mocked<Wallet>
  }

  private initializeContractMock(): void {
    this.contract = {
      // Contract properties
      target: '0x1234567890123456789012345678901234567890',
      interface: {} as any,
      provider: this.provider,
      runner: this.wallet,

      // Contract method calls
      getFunction: jest.fn().mockImplementation((nameOrSignature: string) => {
        return jest.fn().mockResolvedValue('mock-result')
      }),

      // Event filtering
      queryFilter: jest.fn().mockImplementation(async (event: any, fromBlock?: any, toBlock?: any) => {
        // Return mock events
        return []
      }),

      on: jest.fn(),
      off: jest.fn(),
      removeAllListeners: jest.fn(),

      // Gas estimation for contract methods
      estimateGas: {} as any, // Will be populated by ContractMock

      // Static calls (view functions)
      staticCall: {} as any, // Will be populated by ContractMock

      // Connection
      connect: jest.fn().mockImplementation((runner: any) => {
        return { ...this.contract, runner }
      }),

      // Contract deployment
      deploymentTransaction: jest.fn().mockReturnValue(null),
    } as unknown as jest.Mocked<Contract>
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
    const error = new Error(errorMessage)
    ;(error as any).code = 'NETWORK_ERROR'

    this.provider.getNetwork = jest.fn().mockRejectedValue(error)
    this.provider.getBlock = jest.fn().mockRejectedValue(error)
    this.provider.getTransaction = jest.fn().mockRejectedValue(error)
  }

  simulateTransactionFailure(): void {
    this.wallet.sendTransaction = jest.fn().mockImplementation(async (transaction: TransactionRequest) => {
      const hash = this.createTransactionHash(transaction)
      return {
        hash,
        wait: jest.fn().mockResolvedValue({
          ...this.createMockReceipt(hash),
          status: 0, // Failed
        }),
      } as TransactionResponse
    })
  }

  simulateContractRevert(reason: string = 'execution reverted'): void {
    const revertError = new Error(`execution reverted: ${reason}`)
    ;(revertError as any).code = 'CALL_EXCEPTION'
    ;(revertError as any).reason = reason

    // Override contract method calls to throw revert error
    this.contract.getFunction = jest.fn().mockReturnValue(jest.fn().mockRejectedValue(revertError))
  }

  // Restore normal operation
  restoreNormalOperation(): void {
    this.resetAllMocks()
  }

  // Helper methods
  private createTransactionHash(transaction: TransactionRequest): string {
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

// Global mock instance
export const ethersMock = EthersMock.getInstance()

// Jest module mocks for ethers
jest.mock('ethers', () => ({
  // Provider
  JsonRpcProvider: jest.fn().mockImplementation(() => ethersMock.provider),

  // Wallet
  Wallet: jest.fn().mockImplementation(() => ethersMock.wallet),

  // Contract
  Contract: jest.fn().mockImplementation(() => ethersMock.contract),

  // Utilities
  parseEther: jest.fn().mockImplementation((value: string) => {
    return BigInt(Math.floor(parseFloat(value) * 1e18))
  }),

  formatEther: jest.fn().mockImplementation((value: bigint) => {
    return (Number(value) / 1e18).toString()
  }),

  parseUnits: jest.fn().mockImplementation((value: string, decimals: number) => {
    return BigInt(Math.floor(parseFloat(value) * Math.pow(10, decimals)))
  }),

  formatUnits: jest.fn().mockImplementation((value: bigint, decimals: number) => {
    return (Number(value) / Math.pow(10, decimals)).toString()
  }),

  // Address utilities
  isAddress: jest.fn().mockImplementation((address: string) => {
    return /^0x[a-fA-F0-9]{40}$/.test(address)
  }),

  getAddress: jest.fn().mockImplementation((address: string) => {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new Error('Invalid address')
    }
    return address.toLowerCase()
  }),

  // Hashing
  keccak256: jest.fn().mockImplementation((data: string | Uint8Array) => {
    const input = typeof data === 'string' ? data : Buffer.from(data).toString()
    const hash = ethersMock['createDeterministicHash'](input)
    return `0x${hash}`
  }),

  solidityPackedKeccak256: jest.fn().mockImplementation((types: string[], values: any[]) => {
    const packed = types.map((type, i) => `${type}:${values[i]}`).join('|')
    const hash = ethersMock['createDeterministicHash'](packed)
    return `0x${hash}`
  }),

  // Encoding
  AbiCoder: jest.fn().mockImplementation(() => ({
    encode: jest.fn().mockReturnValue('0x1234567890abcdef'),
    decode: jest.fn().mockReturnValue(['decoded', 'values']),
  })),

  // Constants
  ZeroAddress: '0x0000000000000000000000000000000000000000',
  MaxUint256: BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'),

  // Errors
  ErrorFragment: jest.fn(),
  ErrorDescription: jest.fn(),

  // Bytes utilities
  getBytes: jest.fn().mockImplementation((value: string) => {
    if (value.startsWith('0x')) {
      return Uint8Array.from(Buffer.from(value.slice(2), 'hex'))
    }
    return Uint8Array.from(Buffer.from(value, 'utf8'))
  }),

  hexlify: jest.fn().mockImplementation((value: Uint8Array | string) => {
    if (typeof value === 'string') {
      return `0x${Buffer.from(value, 'utf8').toString('hex')}`
    }
    return `0x${Buffer.from(value).toString('hex')}`
  }),
}))

export default ethersMock
