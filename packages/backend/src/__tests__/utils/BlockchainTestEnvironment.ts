/**
 * Blockchain Test Environment
 *
 * This utility provides comprehensive blockchain testing infrastructure
 * for contract integration tests, supporting multiple networks and
 * realistic blockchain interaction patterns.
 */

import { JsonRpcProvider, Wallet, Contract } from 'ethers'
import { jest } from '@jest/globals'
import { ethersMock } from '../../__mocks__/blockchain/EthersMock'
import { ContractMock } from '../../__mocks__/blockchain/ContractMock'

export interface ChainConfig {
  chainId: number
  name: string
  rpcUrl: string
  blockTime: number // Average block time in ms
  gasPrice: bigint
}

export interface ContractConfig {
  name: string
  address: string
  abi?: any[]
}

export interface TestWalletConfig {
  privateKey: string
  address: string
  balance: string // In ETH
  role: string
}

export interface BlockchainTestOptions {
  useRealProvider?: boolean
  chainName?: string
  autoMineBlocks?: boolean
  gasReporting?: boolean
  performanceMonitoring?: boolean
}

export const TEST_CHAINS: Record<string, ChainConfig> = {
  local: {
    chainId: 31337,
    name: 'localhost',
    rpcUrl: 'http://127.0.0.1:8545',
    blockTime: 1000, // 1 second
    gasPrice: BigInt('20000000000'), // 20 Gwei
  },
  amoy: {
    chainId: 80002,
    name: 'polygon-amoy',
    rpcUrl: process.env.POLYGON_AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology',
    blockTime: 2000, // 2 seconds
    gasPrice: BigInt('30000000000'), // 30 Gwei
  },
  polygon: {
    chainId: 137,
    name: 'polygon',
    rpcUrl: process.env.POLYGON_MAINNET_RPC_URL || 'https://polygon-rpc.com',
    blockTime: 2000, // 2 seconds
    gasPrice: BigInt('50000000000'), // 50 Gwei
  },
}

export const TEST_WALLETS: Record<string, TestWalletConfig> = {
  deployer: {
    privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    address: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
    balance: '100.0',
    role: 'deployer',
  },
  poolOwner1: {
    privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
    address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    balance: '50.0',
    role: 'pool_owner',
  },
  poolOwner2: {
    privateKey: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
    address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    balance: '50.0',
    role: 'pool_owner',
  },
  borrower1: {
    privateKey: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
    address: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
    balance: '25.0',
    role: 'borrower',
  },
  lender1: {
    privateKey: '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
    address: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
    balance: '75.0',
    role: 'lender',
  },
  safeOwner1: {
    privateKey: '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e',
    address: '0x976EA74026E726554dB657fA54763abd0C3a0aa9',
    balance: '30.0',
    role: 'safe_owner',
  },
  safeOwner2: {
    privateKey: '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356',
    address: '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955',
    balance: '30.0',
    role: 'safe_owner',
  },
  safeOwner3: {
    privateKey: '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97',
    address: '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f',
    balance: '30.0',
    role: 'safe_owner',
  },
}

export class BlockchainTestEnvironment {
  private static instance: BlockchainTestEnvironment

  public provider: JsonRpcProvider
  public wallets: Map<string, Wallet> = new Map()
  public contracts: Map<string, Contract> = new Map()
  public chainConfig: ChainConfig

  // Test state tracking
  private initialBlockNumber: number = 0
  private transactionHistory: any[] = []
  private gasUsageHistory: { method: string; gas: bigint; timestamp: number }[] = []
  private performanceMetrics: { operation: string; duration: number; timestamp: number }[] = []

  private constructor(private options: BlockchainTestOptions = {}) {
    this.chainConfig = TEST_CHAINS[options.chainName || 'local']
    this.initializeProvider()
    this.initializeWallets()
  }

  static getInstance(options: BlockchainTestOptions = {}): BlockchainTestEnvironment {
    if (!BlockchainTestEnvironment.instance) {
      BlockchainTestEnvironment.instance = new BlockchainTestEnvironment(options)
    }
    return BlockchainTestEnvironment.instance
  }

  private initializeProvider(): void {
    if (this.options.useRealProvider && this.chainConfig.rpcUrl.startsWith('http')) {
      // Use real provider for integration tests
      this.provider = new JsonRpcProvider(this.chainConfig.rpcUrl)
    } else {
      // Use mock provider for unit tests
      this.provider = ethersMock.provider

      // Configure mock for specific chain
      ethersMock.setNetwork(this.chainConfig.chainId, this.chainConfig.name)
      ethersMock.setGasPrice(this.chainConfig.gasPrice)
    }
  }

  private initializeWallets(): void {
    Object.entries(TEST_WALLETS).forEach(([name, config]) => {
      if (this.options.useRealProvider) {
        const wallet = new Wallet(config.privateKey, this.provider)
        this.wallets.set(name, wallet)
      } else {
        // Use mock wallet but set correct address
        this.wallets.set(name, ethersMock.wallet)

        // Set balance in mock
        ethersMock.setAccountBalance(config.address, BigInt(Math.floor(parseFloat(config.balance) * 1e18)))
      }
    })
  }

  async setupContracts(): Promise<void> {
    const contractConfigs: ContractConfig[] = [
      {
        name: 'PoolFactory',
        address: process.env.POOL_FACTORY_ADDRESS_AMOY || '0x1234567890123456789012345678901234567890',
      },
      {
        name: 'Safe',
        address: process.env.SAFE_ADDRESS_AMOY || '0x9876543210987654321098765432109876543210',
      },
    ]

    for (const config of contractConfigs) {
      await this.setupContract(config)
    }

    this.initialBlockNumber = await this.getCurrentBlockNumber()
  }

  async setupContract(config: ContractConfig): Promise<void> {
    let contract: Contract

    if (this.options.useRealProvider) {
      const abi = config.abi || (await this.loadContractABI(config.name))
      const deployer = this.getWallet('deployer')
      contract = new Contract(config.address, abi, deployer)
    } else {
      // Use appropriate mock contract
      switch (config.name) {
        case 'PoolFactory':
          contract = ContractMock.createPoolFactoryMock(config.address)
          break
        case 'Safe':
          contract = ContractMock.createSafeMock(config.address)
          break
        default:
          contract = ContractMock.createContractMock(config.address)
      }
    }

    this.contracts.set(config.name, contract)
  }

  private async loadContractABI(contractName: string): Promise<any[]> {
    // In a real implementation, this would load ABIs from artifacts
    // For now, return minimal ABIs for testing

    const minimalABIs: Record<string, string[]> = {
      PoolFactory: [
        'function createPool(address owner, uint256 maxLoanAmount, uint256 interestRate, uint256 duration, string name) returns (uint256)',
        'function pools(uint256 poolId) view returns (address owner, address poolAddress, string name, uint256 maxLoanAmount, uint256 interestRate, uint256 duration, bool isActive)',
        'function poolCount() view returns (uint256)',
        'function owner() view returns (address)',
        'event PoolCreated(uint256 indexed poolId, address indexed poolAddress, address indexed owner, string name, uint256 maxLoanAmount, uint256 interestRate, uint256 duration)',
      ],
      Safe: [
        'function getOwners() view returns (address[])',
        'function getThreshold() view returns (uint256)',
        'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) returns (bool)',
        'function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 nonce) view returns (bytes32)',
      ],
    }

    return minimalABIs[contractName] || []
  }

  // Wallet management
  getWallet(name: string): Wallet {
    const wallet = this.wallets.get(name)
    if (!wallet) {
      throw new Error(`Wallet ${name} not found`)
    }
    return wallet
  }

  getWalletAddress(name: string): string {
    return TEST_WALLETS[name]?.address || ''
  }

  async getWalletBalance(name: string): Promise<bigint> {
    const wallet = this.getWallet(name)
    const address = this.getWalletAddress(name)

    if (this.options.useRealProvider) {
      return await this.provider.getBalance(address)
    } else {
      return ethersMock.provider.getBalance(address)
    }
  }

  // Contract management
  getContract(name: string): Contract {
    const contract = this.contracts.get(name)
    if (!contract) {
      throw new Error(`Contract ${name} not found`)
    }
    return contract
  }

  // Blockchain operations
  async getCurrentBlockNumber(): Promise<number> {
    if (this.options.useRealProvider) {
      return await this.provider.getBlockNumber()
    } else {
      return await ethersMock.provider.getBlockNumber()
    }
  }

  async waitForBlocks(count: number): Promise<void> {
    if (this.options.useRealProvider) {
      const startBlock = await this.getCurrentBlockNumber()
      const targetBlock = startBlock + count

      while ((await this.getCurrentBlockNumber()) < targetBlock) {
        await new Promise((resolve) => setTimeout(resolve, this.chainConfig.blockTime))
      }
    } else {
      // Simulate block progression
      await new Promise((resolve) => setTimeout(resolve, (count * this.chainConfig.blockTime) / 10))
      ethersMock.setBlockNumber((await this.getCurrentBlockNumber()) + count)
    }
  }

  async mineBlock(): Promise<void> {
    if (this.options.autoMineBlocks === false) return

    if (this.options.useRealProvider && this.chainConfig.name === 'localhost') {
      // Mine block on local Hardhat network
      await this.provider.send('evm_mine', [])
    } else {
      await this.waitForBlocks(1)
    }
  }

  // Transaction helpers
  async executeTransaction(contractName: string, methodName: string, args: any[], walletName: string = 'deployer'): Promise<any> {
    const startTime = performance.now()

    const contract = this.getContract(contractName)
    const wallet = this.getWallet(walletName)

    // Connect contract to wallet
    const connectedContract = contract.connect(wallet)

    // Estimate gas if enabled
    let gasEstimate: bigint | undefined
    if (this.options.gasReporting) {
      try {
        gasEstimate = await connectedContract[methodName].estimateGas(...args)
        this.gasUsageHistory.push({
          method: `${contractName}.${methodName}`,
          gas: gasEstimate,
          timestamp: Date.now(),
        })
      } catch (error) {
        console.warn(`Gas estimation failed for ${contractName}.${methodName}:`, error)
      }
    }

    // Execute transaction
    const tx = await connectedContract[methodName](...args, gasEstimate ? { gasLimit: gasEstimate } : {})
    const receipt = await tx.wait()

    // Record transaction
    this.transactionHistory.push({
      contractName,
      methodName,
      args,
      walletName,
      transactionHash: tx.hash,
      gasUsed: receipt.gasUsed,
      timestamp: Date.now(),
    })

    // Record performance metrics
    if (this.options.performanceMonitoring) {
      const duration = performance.now() - startTime
      this.performanceMetrics.push({
        operation: `${contractName}.${methodName}`,
        duration,
        timestamp: Date.now(),
      })
    }

    return { tx, receipt }
  }

  // Test utilities
  async reset(): Promise<void> {
    if (this.options.useRealProvider && this.chainConfig.name === 'localhost') {
      try {
        await this.provider.send('hardhat_reset', [])
      } catch (error) {
        console.warn('Could not reset Hardhat network:', error)
      }
    } else {
      // Reset mocks
      ethersMock.resetAllMocks()
      ContractMock.resetAllState()
    }

    // Clear test state
    this.transactionHistory = []
    this.gasUsageHistory = []
    this.performanceMetrics = []
  }

  // Test reporting
  getTransactionHistory(): any[] {
    return [...this.transactionHistory]
  }

  getGasUsageReport(): { method: string; gas: bigint; timestamp: number }[] {
    return [...this.gasUsageHistory]
  }

  getPerformanceReport(): { operation: string; duration: number; timestamp: number }[] {
    return [...this.performanceMetrics]
  }

  getTotalGasUsed(): bigint {
    return this.transactionHistory.reduce((total, tx) => total + (tx.gasUsed || BigInt(0)), BigInt(0))
  }

  getAverageGasUsage(methodName?: string): bigint {
    const relevantTxs = methodName ? this.transactionHistory.filter((tx) => tx.methodName === methodName) : this.transactionHistory

    if (relevantTxs.length === 0) return BigInt(0)

    const totalGas = relevantTxs.reduce((total, tx) => total + (tx.gasUsed || BigInt(0)), BigInt(0))
    return totalGas / BigInt(relevantTxs.length)
  }

  getAverageExecutionTime(operation?: string): number {
    const relevantMetrics = operation ? this.performanceMetrics.filter((m) => m.operation === operation) : this.performanceMetrics

    if (relevantMetrics.length === 0) return 0

    const totalTime = relevantMetrics.reduce((total, m) => total + m.duration, 0)
    return totalTime / relevantMetrics.length
  }

  // Validation helpers
  validateTransactionSuccess(receipt: any): void {
    expect(receipt).toBeDefined()
    expect(receipt.status).toBe(1)
    expect(receipt.transactionHash).toBeValidTransactionHash()
    expect(Number(receipt.gasUsed)).toBeReasonableGasUsage()
  }

  validateContractAddress(address: string): void {
    expect(address).toBeValidEthereumAddress()
    expect(address).not.toBe('0x0000000000000000000000000000000000000000')
  }

  // Error simulation (for mock mode)
  simulateNetworkError(): void {
    if (!this.options.useRealProvider) {
      ethersMock.simulateNetworkError('Network connection failed')
    }
  }

  simulateContractRevert(reason?: string): void {
    if (!this.options.useRealProvider) {
      ethersMock.simulateContractRevert(reason)
    }
  }

  simulateTransactionFailure(): void {
    if (!this.options.useRealProvider) {
      ethersMock.simulateTransactionFailure()
    }
  }

  restoreNormalOperation(): void {
    if (!this.options.useRealProvider) {
      ethersMock.restoreNormalOperation()
      ContractMock.resetAllState()
    }
  }

  // Cleanup
  async cleanup(): Promise<void> {
    this.transactionHistory = []
    this.gasUsageHistory = []
    this.performanceMetrics = []

    if (!this.options.useRealProvider) {
      ethersMock.restoreNormalOperation()
      ContractMock.resetAllState()
    }
  }
}

export default BlockchainTestEnvironment
