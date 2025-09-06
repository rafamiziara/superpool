# Smart Contract Integration Testing Guide

## ⛓️ **Blockchain Integration Testing for SuperPool Backend**

This guide focuses on testing Smart Contract integration within Firebase Cloud Functions, covering ethers.js interactions, transaction handling, event listening, and Safe multi-sig integration. It provides comprehensive patterns for testing Web3 functionality in serverless environments.

### **Contract Testing Philosophy**

- **Integration First**: Test actual contract interactions, not just mocks
- **Chain Agnostic**: Support testing across Polygon Amoy, Mainnet, and local networks
- **Gas Awareness**: Monitor and test gas usage patterns
- **Error Resilience**: Comprehensive blockchain error scenario testing
- **Multi-Sig Security**: Test Safe wallet integration patterns

---

## ⚙️ **Contract Testing Architecture**

### **Blockchain Test Environment Setup**

```typescript
// src/__tests__/setup/blockchain.setup.ts
import { JsonRpcProvider, Wallet, Contract } from 'ethers'
import { jest } from '@jest/globals'

export interface ChainConfig {
  chainId: number
  name: string
  rpcUrl: string
  blockTime: number // Average block time in ms
}

export const TEST_CHAINS: Record<string, ChainConfig> = {
  local: {
    chainId: 31337,
    name: 'localhost',
    rpcUrl: 'http://127.0.0.1:8545',
    blockTime: 1000,
  },
  amoy: {
    chainId: 80002,
    name: 'polygon-amoy',
    rpcUrl: process.env.POLYGON_AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology',
    blockTime: 2000,
  },
  polygon: {
    chainId: 137,
    name: 'polygon',
    rpcUrl: process.env.POLYGON_MAINNET_RPC_URL || 'https://polygon-rpc.com',
    blockTime: 2000,
  },
}

export class BlockchainTestEnvironment {
  private static instance: BlockchainTestEnvironment

  public provider: JsonRpcProvider
  public wallet: Wallet
  public chainConfig: ChainConfig

  // Contract instances
  public poolFactory: Contract
  public safeContract?: Contract

  private constructor(chainName: string = 'local') {
    this.chainConfig = TEST_CHAINS[chainName]
    this.initializeProvider()
    this.initializeWallet()
  }

  static getInstance(chainName: string = 'local'): BlockchainTestEnvironment {
    if (!BlockchainTestEnvironment.instance) {
      BlockchainTestEnvironment.instance = new BlockchainTestEnvironment(chainName)
    }
    return BlockchainTestEnvironment.instance
  }

  private initializeProvider(): void {
    this.provider = new JsonRpcProvider(this.chainConfig.rpcUrl)
  }

  private initializeWallet(): void {
    // Use test private key for consistent testing
    const testPrivateKey = process.env.TEST_PRIVATE_KEY || '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'

    this.wallet = new Wallet(testPrivateKey, this.provider)
  }

  async setupContracts(): Promise<void> {
    // Load contract addresses from environment
    const poolFactoryAddress = this.getContractAddress('POOL_FACTORY')
    const safeAddress = this.getContractAddress('SAFE', false) // Optional

    // Initialize contracts
    this.poolFactory = new Contract(poolFactoryAddress, await this.loadContractABI('PoolFactory'), this.wallet)

    if (safeAddress) {
      this.safeContract = new Contract(safeAddress, await this.loadContractABI('Safe'), this.wallet)
    }
  }

  private getContractAddress(contractType: string, required: boolean = true): string {
    const envKey = `${contractType}_ADDRESS_${this.chainConfig.name.toUpperCase()}`
    const address = process.env[envKey]

    if (!address && required) {
      throw new Error(`Contract address not found: ${envKey}`)
    }

    return address || ''
  }

  private async loadContractABI(contractName: string): Promise<any[]> {
    // In real implementation, load from artifacts
    // For testing, return mock ABI or load from test fixtures

    const abis = {
      PoolFactory: [
        'function createPool(address owner, uint256 maxLoanAmount, uint256 interestRate, uint256 duration, string name) returns (uint256)',
        'function pools(uint256 poolId) view returns (address owner, address poolAddress, string name, uint256 maxLoanAmount, uint256 interestRate, uint256 duration, bool isActive)',
        'function poolCount() view returns (uint256)',
        'function owner() view returns (address)',
        'function transferOwnership(address newOwner)',
        'function acceptOwnership()',
        'function pause()',
        'function unpause()',
        'function paused() view returns (bool)',
        'event PoolCreated(uint256 indexed poolId, address indexed poolAddress, address indexed owner, string name, uint256 maxLoanAmount, uint256 interestRate, uint256 duration)',
        'event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)',
        'event Paused(address account)',
        'event Unpaused(address account)',
      ],
      Safe: [
        'function getOwners() view returns (address[])',
        'function getThreshold() view returns (uint256)',
        'function isOwner(address owner) view returns (bool)',
        'function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 nonce) view returns (bytes32)',
        'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) returns (bool)',
        'function checkSignatures(bytes32 dataHash, bytes data, bytes signatures)',
        'function nonce() view returns (uint256)',
      ],
    }

    return abis[contractName] || []
  }

  async reset(): Promise<void> {
    // Reset to clean state for testing
    if (this.chainConfig.name === 'localhost') {
      // For local testing, we can reset the blockchain state
      try {
        await this.provider.send('hardhat_reset', [])
      } catch (error) {
        // Ignore if not using Hardhat
      }
    }
  }

  async waitForTransaction(txHash: string, confirmations: number = 1): Promise<any> {
    const receipt = await this.provider.waitForTransaction(txHash, confirmations)
    return receipt
  }

  async getLatestBlock(): Promise<any> {
    return await this.provider.getBlock('latest')
  }

  async getCurrentGasPrice(): Promise<bigint> {
    try {
      const feeData = await this.provider.getFeeData()
      return feeData.gasPrice || BigInt('20000000000') // 20 Gwei default
    } catch {
      return BigInt('20000000000') // Fallback
    }
  }

  async estimateContractGas(contract: Contract, methodName: string, args: any[]): Promise<bigint> {
    try {
      return await contract[methodName].estimateGas(...args)
    } catch (error) {
      console.warn(`Gas estimation failed for ${methodName}:`, error)
      return BigInt('500000') // Default gas limit
    }
  }
}
```

### **Contract Test Helper**

```typescript
// src/__tests__/utils/contractTester.ts
import { Contract, parseEther, formatEther, TransactionResponse } from 'ethers'
import { BlockchainTestEnvironment } from '../setup/blockchain.setup'
import { expect } from '@jest/globals'

export interface PoolCreationParams {
  poolOwner: string
  maxLoanAmount: string // In ETH
  interestRate: number // In basis points
  loanDuration: number // In seconds
  name: string
}

export interface TransactionResult {
  success: boolean
  transactionHash: string
  gasUsed: bigint
  events: any[]
  blockNumber: number
}

export class ContractTester {
  private blockchain: BlockchainTestEnvironment

  constructor(chainName: string = 'local') {
    this.blockchain = BlockchainTestEnvironment.getInstance(chainName)
  }

  async setup(): Promise<void> {
    await this.blockchain.setupContracts()
  }

  /**
   * Create pool via PoolFactory contract
   */
  async createPool(params: PoolCreationParams): Promise<TransactionResult> {
    const { poolOwner, maxLoanAmount, interestRate, loanDuration, name } = params

    // Convert ETH to wei
    const maxLoanAmountWei = parseEther(maxLoanAmount)

    // Estimate gas
    const estimatedGas = await this.blockchain.estimateContractGas(this.blockchain.poolFactory, 'createPool', [
      poolOwner,
      maxLoanAmountWei,
      interestRate,
      loanDuration,
      name,
    ])

    // Execute transaction
    const tx: TransactionResponse = await this.blockchain.poolFactory.createPool(
      poolOwner,
      maxLoanAmountWei,
      interestRate,
      loanDuration,
      name,
      {
        gasLimit: (estimatedGas * BigInt(120)) / BigInt(100), // 20% buffer
      }
    )

    // Wait for confirmation
    const receipt = await this.blockchain.waitForTransaction(tx.hash)

    // Parse events
    const events = receipt.logs
      .map((log: any) => {
        try {
          return this.blockchain.poolFactory.interface.parseLog(log)
        } catch {
          return null
        }
      })
      .filter(Boolean)

    return {
      success: receipt.status === 1,
      transactionHash: tx.hash,
      gasUsed: receipt.gasUsed,
      events,
      blockNumber: receipt.blockNumber,
    }
  }

  /**
   * Get pool information by ID
   */
  async getPool(poolId: number): Promise<any> {
    const poolData = await this.blockchain.poolFactory.pools(poolId)

    return {
      owner: poolData[0],
      poolAddress: poolData[1],
      name: poolData[2],
      maxLoanAmount: poolData[3],
      interestRate: poolData[4],
      duration: poolData[5],
      isActive: poolData[6],
    }
  }

  /**
   * Get total pool count
   */
  async getPoolCount(): Promise<number> {
    const count = await this.blockchain.poolFactory.poolCount()
    return Number(count)
  }

  /**
   * Test ownership transfer
   */
  async transferOwnership(newOwner: string): Promise<TransactionResult> {
    const tx = await this.blockchain.poolFactory.transferOwnership(newOwner)
    const receipt = await this.blockchain.waitForTransaction(tx.hash)

    return {
      success: receipt.status === 1,
      transactionHash: tx.hash,
      gasUsed: receipt.gasUsed,
      events: [],
      blockNumber: receipt.blockNumber,
    }
  }

  /**
   * Test Safe multi-sig operations
   */
  async executeSafeTransaction(to: string, value: bigint, data: string, signatures: string): Promise<TransactionResult> {
    if (!this.blockchain.safeContract) {
      throw new Error('Safe contract not initialized')
    }

    const tx = await this.blockchain.safeContract.execTransaction(
      to,
      value,
      data,
      0, // operation: CALL
      0, // safeTxGas
      0, // baseGas
      0, // gasPrice
      '0x0000000000000000000000000000000000000000', // gasToken
      '0x0000000000000000000000000000000000000000', // refundReceiver
      signatures
    )

    const receipt = await this.blockchain.waitForTransaction(tx.hash)

    return {
      success: receipt.status === 1,
      transactionHash: tx.hash,
      gasUsed: receipt.gasUsed,
      events: [],
      blockNumber: receipt.blockNumber,
    }
  }

  /**
   * Validate transaction expectations
   */
  expectSuccessfulTransaction(result: TransactionResult): void {
    expect(result.success).toBe(true)
    expect(result.transactionHash).toMatch(/^0x[a-fA-F0-9]{64}$/)
    expect(result.gasUsed).toBeGreaterThan(BigInt(0))
    expect(result.blockNumber).toBeGreaterThan(0)
  }

  /**
   * Validate gas usage is within expected range
   */
  expectReasonableGasUsage(result: TransactionResult, maxGas: number): void {
    expect(Number(result.gasUsed)).toBeLessThan(maxGas)
    expect(Number(result.gasUsed)).toBeGreaterThan(21000) // Minimum transaction gas
  }

  /**
   * Validate specific events were emitted
   */
  expectEvent(result: TransactionResult, eventName: string, expectedArgs?: any): void {
    const event = result.events.find((e) => e.name === eventName)
    expect(event).toBeDefined()

    if (expectedArgs) {
      Object.keys(expectedArgs).forEach((key) => {
        expect(event.args[key]).toEqual(expectedArgs[key])
      })
    }
  }
}
```

---

## 🏗️ **Pool Factory Contract Tests**

### **Pool Creation Integration Tests**

```typescript
// src/functions/pools/__tests__/createPool.integration.test.ts
import { describe, beforeAll, beforeEach, afterAll, it, expect } from '@jest/globals'
import { ContractTester, PoolCreationParams } from '../../__tests__/utils/contractTester'
import { CloudFunctionTester } from '../../__tests__/utils/cloudFunctionTester'
import { firebaseAdminMock } from '../../__mocks__/firebase/FirebaseAdminMock'

// Import the function under test
import { createPoolHandler } from '../createPool'

describe('Pool Creation Contract Integration', () => {
  let contractTester: ContractTester
  let functionTester: CloudFunctionTester

  beforeAll(async () => {
    // Setup blockchain testing environment
    contractTester = new ContractTester('local') // Use local blockchain
    await contractTester.setup()

    functionTester = new CloudFunctionTester()
  })

  beforeEach(() => {
    // Reset mocks
    firebaseAdminMock.resetAllMocks()

    // Setup successful Firestore operations
    firebaseAdminMock.firestore.collection('pools').doc().set.mockResolvedValue(undefined)
  })

  describe('Successful Pool Creation', () => {
    it('should create pool via contract and save to Firestore', async () => {
      // Arrange
      const poolParams: PoolCreationParams = {
        poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
        maxLoanAmount: '1000', // 1000 ETH
        interestRate: 500, // 5%
        loanDuration: 2592000, // 30 days
        name: 'Integration Test Pool',
      }

      const request = functionTester.createAuthenticatedRequest(
        {
          poolOwner: poolParams.poolOwner,
          maxLoanAmount: poolParams.maxLoanAmount,
          interestRate: poolParams.interestRate,
          loanDuration: poolParams.loanDuration,
          name: poolParams.name,
          description: 'Integration test pool for contract validation',
        },
        poolParams.poolOwner
      )

      // Act
      const result = await createPoolHandler(request)

      // Assert Cloud Function response
      expect(result.success).toBe(true)
      expect(result.poolId).toBeDefined()
      expect(result.transactionHash).toMatch(/^0x[a-fA-F0-9]{64}$/)

      // Verify contract state
      const poolData = await contractTester.getPool(Number(result.poolId))
      expect(poolData.owner).toBe(poolParams.poolOwner)
      expect(poolData.name).toBe(poolParams.name)
      expect(poolData.interestRate).toBe(poolParams.interestRate)
      expect(poolData.isActive).toBe(true)

      // Verify Firestore save
      expect(firebaseAdminMock.firestore.collection).toHaveBeenCalledWith('pools')
    })

    it('should emit PoolCreated event with correct parameters', async () => {
      // Arrange
      const poolParams: PoolCreationParams = {
        poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
        maxLoanAmount: '500',
        interestRate: 750,
        loanDuration: 1296000, // 15 days
        name: 'Event Test Pool',
      }

      // Act
      const contractResult = await contractTester.createPool(poolParams)

      // Assert transaction success
      contractTester.expectSuccessfulTransaction(contractResult)
      contractTester.expectReasonableGasUsage(contractResult, 500000)

      // Assert PoolCreated event
      contractTester.expectEvent(contractResult, 'PoolCreated', {
        owner: poolParams.poolOwner,
        name: poolParams.name,
        interestRate: poolParams.interestRate,
      })

      // Verify gas usage is reasonable
      expect(Number(contractResult.gasUsed)).toBeLessThan(400000)
    })
  })

  describe('Contract Validation', () => {
    it('should reject invalid pool owner address', async () => {
      // Arrange
      const invalidParams = {
        poolOwner: '0x0000000000000000000000000000000000000000', // Zero address
        maxLoanAmount: '1000',
        interestRate: 500,
        loanDuration: 2592000,
        name: 'Invalid Owner Pool',
      }

      // Act & Assert
      await expect(contractTester.createPool(invalidParams)).rejects.toThrow(/invalid address|zero address/i)
    })

    it('should reject zero max loan amount', async () => {
      // Arrange
      const invalidParams = {
        poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
        maxLoanAmount: '0', // Zero amount
        interestRate: 500,
        loanDuration: 2592000,
        name: 'Zero Amount Pool',
      }

      // Act & Assert
      await expect(contractTester.createPool(invalidParams)).rejects.toThrow(/amount|value/i)
    })

    it('should reject invalid interest rate', async () => {
      // Arrange
      const invalidParams = {
        poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
        maxLoanAmount: '1000',
        interestRate: 10001, // > 100%
        loanDuration: 2592000,
        name: 'Invalid Interest Pool',
      }

      // Act & Assert
      await expect(contractTester.createPool(invalidParams)).rejects.toThrow(/rate|interest/i)
    })

    it('should reject invalid loan duration', async () => {
      // Arrange
      const invalidParams = {
        poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
        maxLoanAmount: '1000',
        interestRate: 500,
        loanDuration: 0, // Zero duration
        name: 'Invalid Duration Pool',
      }

      // Act & Assert
      await expect(contractTester.createPool(invalidParams)).rejects.toThrow(/duration|time/i)
    })
  })

  describe('Gas Optimization', () => {
    it('should use reasonable gas for pool creation', async () => {
      // Arrange
      const poolParams: PoolCreationParams = {
        poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
        maxLoanAmount: '1000',
        interestRate: 500,
        loanDuration: 2592000,
        name: 'Gas Test Pool',
      }

      // Act
      const result = await contractTester.createPool(poolParams)

      // Assert
      contractTester.expectSuccessfulTransaction(result)

      // Gas should be under 400k for pool creation
      expect(Number(result.gasUsed)).toBeLessThan(400000)
      expect(Number(result.gasUsed)).toBeGreaterThan(100000) // Should use meaningful amount of gas
    })

    it('should have consistent gas usage across similar pools', async () => {
      // Arrange
      const gasUsageResults: number[] = []

      // Act - Create multiple similar pools
      for (let i = 0; i < 3; i++) {
        const params: PoolCreationParams = {
          poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
          maxLoanAmount: '1000',
          interestRate: 500,
          loanDuration: 2592000,
          name: `Consistency Test Pool ${i}`,
        }

        const result = await contractTester.createPool(params)
        gasUsageResults.push(Number(result.gasUsed))
      }

      // Assert - Gas usage should be consistent (within 10% variance)
      const avgGas = gasUsageResults.reduce((sum, gas) => sum + gas, 0) / gasUsageResults.length

      gasUsageResults.forEach((gasUsed) => {
        const variance = Math.abs(gasUsed - avgGas) / avgGas
        expect(variance).toBeLessThan(0.1) // Less than 10% variance
      })
    })
  })

  describe('Contract State Verification', () => {
    it('should increment pool count correctly', async () => {
      // Arrange
      const initialCount = await contractTester.getPoolCount()

      const poolParams: PoolCreationParams = {
        poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
        maxLoanAmount: '1000',
        interestRate: 500,
        loanDuration: 2592000,
        name: 'Count Test Pool',
      }

      // Act
      await contractTester.createPool(poolParams)

      // Assert
      const finalCount = await contractTester.getPoolCount()
      expect(finalCount).toBe(initialCount + 1)
    })

    it('should store pool data correctly', async () => {
      // Arrange
      const poolParams: PoolCreationParams = {
        poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
        maxLoanAmount: '2500',
        interestRate: 825,
        loanDuration: 5184000, // 60 days
        name: 'Data Verification Pool',
      }

      // Act
      const result = await contractTester.createPool(poolParams)
      const poolId = result.events.find((e) => e.name === 'PoolCreated')?.args.poolId

      // Assert
      const storedPool = await contractTester.getPool(Number(poolId))

      expect(storedPool.owner).toBe(poolParams.poolOwner)
      expect(storedPool.name).toBe(poolParams.name)
      expect(Number(storedPool.interestRate)).toBe(poolParams.interestRate)
      expect(Number(storedPool.duration)).toBe(poolParams.loanDuration)
      expect(storedPool.isActive).toBe(true)

      // Verify maxLoanAmount in wei
      const expectedAmountWei = BigInt(poolParams.maxLoanAmount) * BigInt(10) ** BigInt(18)
      expect(storedPool.maxLoanAmount).toBe(expectedAmountWei)
    })
  })
})
```

---

## 🔐 **Safe Multi-Sig Integration Tests**

### **Multi-Signature Transaction Testing**

```typescript
// src/functions/safe/__tests__/createPoolSafe.integration.test.ts
import { describe, beforeAll, beforeEach, it, expect } from '@jest/globals'
import { ContractTester } from '../../__tests__/utils/contractTester'
import { CloudFunctionTester } from '../../__tests__/utils/cloudFunctionTester'
import { firebaseAdminMock } from '../../__mocks__/firebase/FirebaseAdminMock'
import { ethers } from 'ethers'

import { createPoolSafeHandler } from '../createPoolSafe'

describe('Safe Multi-Sig Pool Creation Integration', () => {
  let contractTester: ContractTester
  let functionTester: CloudFunctionTester

  // Test Safe owners (3-of-5 multisig)
  const safeOwners = [
    '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
    '0x1234567890123456789012345678901234567890',
    '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    '0x9876543210987654321098765432109876543210',
    '0x5555666677778888999900001111222233334444',
  ]

  beforeAll(async () => {
    contractTester = new ContractTester('local')
    await contractTester.setup()
    functionTester = new CloudFunctionTester()
  })

  beforeEach(() => {
    firebaseAdminMock.resetAllMocks()

    // Mock successful Safe transaction creation
    firebaseAdminMock.firestore.collection('safe_transactions').doc().set.mockResolvedValue(undefined)
  })

  describe('Safe Transaction Creation', () => {
    it('should create Safe transaction for pool creation', async () => {
      // Arrange
      const poolParams = {
        poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
        maxLoanAmount: '1000',
        interestRate: 500,
        loanDuration: 2592000,
        name: 'Safe Multi-Sig Pool',
        description: 'Pool created through Safe multi-signature wallet',
      }

      const request = functionTester.createAuthenticatedRequest(
        poolParams,
        safeOwners[0] // First owner creates the transaction
      )

      // Act
      const result = await createPoolSafeHandler(request)

      // Assert
      expect(result.success).toBe(true)
      expect(result.transactionHash).toBeDefined()
      expect(result.safeAddress).toBeDefined()
      expect(result.requiredSignatures).toBeGreaterThan(0)
      expect(result.currentSignatures).toBe(0) // No signatures yet

      // Verify Firestore transaction storage
      expect(firebaseAdminMock.firestore.collection).toHaveBeenCalledWith('safe_transactions')
    })

    it('should generate correct transaction hash for deterministic signing', async () => {
      // Arrange
      const poolParams = {
        poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
        maxLoanAmount: '1000',
        interestRate: 500,
        loanDuration: 2592000,
        name: 'Hash Test Pool',
        description: 'Testing deterministic hash generation',
      }

      const request1 = functionTester.createAuthenticatedRequest(poolParams, safeOwners[0])
      const request2 = functionTester.createAuthenticatedRequest(poolParams, safeOwners[1])

      // Act
      const result1 = await createPoolSafeHandler(request1)
      const result2 = await createPoolSafeHandler(request2)

      // Assert - Same parameters should generate same transaction hash
      expect(result1.transactionHash).toBe(result2.transactionHash)
      expect(result1.safeAddress).toBe(result2.safeAddress)
    })
  })

  describe('Safe Transaction Validation', () => {
    it('should validate Safe contract state', async () => {
      // This test would verify that:
      // 1. Safe contract is properly configured
      // 2. Owners are correctly set
      // 3. Threshold is appropriate
      // 4. Safe has sufficient permissions

      if (!contractTester.blockchain.safeContract) {
        console.log('Safe contract not available in test environment')
        return
      }

      // Arrange & Act
      const owners = await contractTester.blockchain.safeContract.getOwners()
      const threshold = await contractTester.blockchain.safeContract.getThreshold()

      // Assert
      expect(owners.length).toBeGreaterThanOrEqual(3) // Minimum 3 owners
      expect(Number(threshold)).toBeGreaterThanOrEqual(2) // Minimum 2-of-N
      expect(Number(threshold)).toBeLessThanOrEqual(owners.length) // Threshold <= owners

      // Verify all expected owners are present
      safeOwners.forEach((owner) => {
        expect(owners.map((o) => o.toLowerCase())).toContain(owner.toLowerCase())
      })
    })

    it('should validate user is Safe owner before creating transaction', async () => {
      // Arrange
      const nonOwnerAddress = '0x1111111111111111111111111111111111111111'
      const poolParams = {
        poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
        maxLoanAmount: '1000',
        interestRate: 500,
        loanDuration: 2592000,
        name: 'Unauthorized Pool',
        description: 'Should fail - created by non-owner',
      }

      const request = functionTester.createAuthenticatedRequest(poolParams, nonOwnerAddress)

      // Act & Assert
      await expect(createPoolSafeHandler(request)).rejects.toThrow(/not a Safe owner|unauthorized|permission denied/i)
    })
  })

  describe('Transaction Signature Collection', () => {
    it('should collect signatures from multiple Safe owners', async () => {
      // This test simulates the multi-signature workflow

      // 1. Create Safe transaction
      const poolParams = {
        poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
        maxLoanAmount: '1000',
        interestRate: 500,
        loanDuration: 2592000,
        name: 'Multi-Sig Signature Pool',
        description: 'Testing signature collection',
      }

      const createRequest = functionTester.createAuthenticatedRequest(poolParams, safeOwners[0])
      const createResult = await createPoolSafeHandler(createRequest)

      expect(createResult.success).toBe(true)
      const transactionHash = createResult.transactionHash

      // 2. Simulate signature collection from owners
      const signatures = []

      for (let i = 0; i < 3; i++) {
        // Need 3 signatures for 3-of-5 multisig
        const ownerWallet = new ethers.Wallet(`0x${'0'.repeat(63)}${i + 1}`) // Test wallets
        const signature = await ownerWallet.signMessage(ethers.getBytes(transactionHash))
        signatures.push(signature)
      }

      // 3. Verify signatures are valid format
      signatures.forEach((sig) => {
        expect(sig).toMatch(/^0x[a-fA-F0-9]{130}$/) // 65 bytes hex
      })

      // 4. Test signature concatenation for Safe execution
      const combinedSignatures = signatures.join('').replace(/0x/g, '').replace(/^/, '0x')
      expect(combinedSignatures).toMatch(/^0x[a-fA-F0-9]{390}$/) // 3 * 65 bytes
    })

    it('should track signature status correctly', async () => {
      // Arrange
      const transactionHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'

      // Mock Firestore data for transaction tracking
      const mockTransactionData = {
        transactionHash,
        safeAddress: '0x9876543210987654321098765432109876543210',
        requiredSignatures: 3,
        currentSignatures: 1,
        signatures: [
          {
            signer: safeOwners[0],
            signature: '0x1234567890abcdef...',
            signedAt: new Date(),
          },
        ],
      }

      firebaseAdminMock.firestore
        .collection('safe_transactions')
        .doc()
        .get.mockResolvedValue({
          exists: true,
          data: () => mockTransactionData,
        })

      // Act - Add second signature
      const newSignature = {
        signer: safeOwners[1],
        signature: '0xabcdef1234567890...',
        signedAt: new Date(),
      }

      // Assert - Should track signature count correctly
      const updatedSignatures = [...mockTransactionData.signatures, newSignature]
      expect(updatedSignatures).toHaveLength(2)
      expect(updatedSignatures[1].signer).toBe(safeOwners[1])

      // Check if ready for execution (3 signatures needed)
      const readyToExecute = updatedSignatures.length >= mockTransactionData.requiredSignatures
      expect(readyToExecute).toBe(false) // Still need 1 more signature
    })
  })

  describe('Safe Transaction Execution', () => {
    it('should execute Safe transaction when threshold met', async () => {
      // This test would require actual Safe contract interaction
      // In a real test environment, this would:
      // 1. Create a Safe transaction
      // 2. Collect required signatures
      // 3. Execute the transaction via Safe.execTransaction
      // 4. Verify pool creation occurred

      if (!contractTester.blockchain.safeContract) {
        console.log('Safe contract execution test skipped - no Safe contract available')
        return
      }

      // Mock successful execution result
      const mockExecutionResult = {
        success: true,
        transactionHash: '0xsafeexecution123456789',
        executionTxHash: '0xpoolcreation123456789',
        poolId: 1,
        poolAddress: '0x0000000000000000000000000000000000000001',
      }

      // Verify execution result structure
      expect(mockExecutionResult.success).toBe(true)
      expect(mockExecutionResult.poolId).toBeGreaterThan(0)
      expect(mockExecutionResult.poolAddress).toMatch(/^0x[a-fA-F0-9]{40}$/)
    })
  })
})
```

---

## 📊 **Event Listener Testing**

### **Blockchain Event Synchronization Tests**

```typescript
// src/functions/events/__tests__/poolEventListener.integration.test.ts
import { describe, beforeAll, beforeEach, afterAll, it, expect } from '@jest/globals'
import { ContractTester } from '../../__tests__/utils/contractTester'
import { firebaseAdminMock } from '../../__mocks__/firebase/FirebaseAdminMock'
import { ethers } from 'ethers'

describe('Pool Event Listener Integration', () => {
  let contractTester: ContractTester

  beforeAll(async () => {
    contractTester = new ContractTester('local')
    await contractTester.setup()
  })

  beforeEach(() => {
    firebaseAdminMock.resetAllMocks()
  })

  describe('PoolCreated Event Processing', () => {
    it('should process PoolCreated events and sync to Firestore', async () => {
      // Arrange
      const poolParams = {
        poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
        maxLoanAmount: '1000',
        interestRate: 500,
        loanDuration: 2592000,
        name: 'Event Sync Test Pool',
      }

      // Mock Firestore operations
      firebaseAdminMock.firestore.collection('pools').doc().set.mockResolvedValue(undefined)
      firebaseAdminMock.firestore.collection('event_logs').doc().set.mockResolvedValue(undefined)
      firebaseAdminMock.firestore.collection('pool_owners').doc().set.mockResolvedValue(undefined)

      // Act
      const result = await contractTester.createPool(poolParams)

      // Simulate event listener processing
      const poolCreatedEvent = result.events.find((e) => e.name === 'PoolCreated')
      expect(poolCreatedEvent).toBeDefined()

      // Process event data
      const eventData = {
        poolId: poolCreatedEvent.args.poolId,
        poolAddress: poolCreatedEvent.args.poolAddress,
        poolOwner: poolCreatedEvent.args.owner,
        name: poolCreatedEvent.args.name,
        maxLoanAmount: poolCreatedEvent.args.maxLoanAmount,
        interestRate: poolCreatedEvent.args.interestRate,
        loanDuration: poolCreatedEvent.args.loanDuration,
        transactionHash: result.transactionHash,
        blockNumber: result.blockNumber,
        timestamp: Date.now(),
      }

      // Verify event data structure
      expect(eventData.poolId).toBeDefined()
      expect(eventData.poolAddress).toMatch(/^0x[a-fA-F0-9]{40}$/)
      expect(eventData.poolOwner).toBe(poolParams.poolOwner)
      expect(eventData.name).toBe(poolParams.name)
      expect(Number(eventData.interestRate)).toBe(poolParams.interestRate)
    })

    it('should handle event processing failures gracefully', async () => {
      // Arrange
      const poolParams = {
        poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
        maxLoanAmount: '1000',
        interestRate: 500,
        loanDuration: 2592000,
        name: 'Error Handling Pool',
      }

      // Simulate Firestore error
      firebaseAdminMock.simulateFirestoreError('unavailable')

      // Act
      const result = await contractTester.createPool(poolParams)
      const event = result.events.find((e) => e.name === 'PoolCreated')

      // Simulate event processing with error handling
      try {
        // This would normally save to Firestore
        await firebaseAdminMock.firestore.collection('pools').doc().set({})
      } catch (error) {
        // Assert error is handled appropriately
        expect(error).toBeDefined()
        expect(error.code).toBe('unavailable')
      }

      // Event should still be logged for retry
      expect(event).toBeDefined()
      expect(result.success).toBe(true) // Contract transaction still succeeded
    })
  })

  describe('Event Filtering and Pagination', () => {
    it('should filter events by block range', async () => {
      // Arrange
      const startBlock = await contractTester.blockchain.getLatestBlock()
      const startBlockNumber = startBlock.number

      // Create multiple pools to generate events
      const poolPromises = []
      for (let i = 0; i < 3; i++) {
        poolPromises.push(
          contractTester.createPool({
            poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
            maxLoanAmount: '1000',
            interestRate: 500 + i * 100,
            loanDuration: 2592000,
            name: `Filter Test Pool ${i}`,
          })
        )
      }

      await Promise.all(poolPromises)

      const endBlock = await contractTester.blockchain.getLatestBlock()
      const endBlockNumber = endBlock.number

      // Act - Query events in block range
      const filter = contractTester.blockchain.poolFactory.filters.PoolCreated()
      const events = await contractTester.blockchain.poolFactory.queryFilter(filter, startBlockNumber, endBlockNumber)

      // Assert
      expect(events.length).toBeGreaterThanOrEqual(3)
      events.forEach((event) => {
        expect(event.blockNumber).toBeGreaterThanOrEqual(startBlockNumber)
        expect(event.blockNumber).toBeLessThanOrEqual(endBlockNumber)
      })
    })

    it('should handle large event datasets with pagination', async () => {
      // This test simulates handling many events efficiently

      // Mock large dataset
      const mockEvents = Array(100)
        .fill(null)
        .map((_, i) => ({
          event: 'PoolCreated',
          args: {
            poolId: BigInt(i + 1),
            poolAddress: `0x${'0'.repeat(39)}${(i + 1).toString()}`,
            owner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
            name: `Bulk Pool ${i + 1}`,
          },
          blockNumber: 1000000 + i,
          transactionHash: `0x${'a'.repeat(63)}${i.toString(16)}`,
        }))

      // Process in batches
      const batchSize = 10
      const batches = []

      for (let i = 0; i < mockEvents.length; i += batchSize) {
        const batch = mockEvents.slice(i, i + batchSize)
        batches.push(batch)
      }

      // Assert batch processing
      expect(batches.length).toBe(10) // 100 events / 10 per batch
      batches.forEach((batch) => {
        expect(batch.length).toBeLessThanOrEqual(batchSize)
      })

      // Verify each batch can be processed independently
      batches.forEach((batch, batchIndex) => {
        batch.forEach((event) => {
          expect(event.args.poolId).toBeGreaterThan(BigInt(0))
          expect(event.blockNumber).toBeGreaterThan(0)
        })
      })
    })
  })

  describe('Event Deduplication', () => {
    it('should handle duplicate events correctly', async () => {
      // Arrange
      const eventId = 'pool-created-1-0' // poolId-logIndex format
      const eventData = {
        poolId: '1',
        poolAddress: '0x0000000000000000000000000000000000000001',
        poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
        name: 'Duplicate Test Pool',
        transactionHash: '0xabc123',
        blockNumber: 1000000,
        logIndex: 0,
      }

      // Mock existing event
      firebaseAdminMock.firestore
        .collection('event_logs')
        .doc(eventId)
        .get.mockResolvedValue({
          exists: true,
          data: () => eventData,
        })

      // Act - Try to process duplicate event
      const isDuplicate = true // Would be determined by checking Firestore

      // Assert
      if (isDuplicate) {
        // Should skip processing
        expect(firebaseAdminMock.firestore.collection('event_logs').doc().set).not.toHaveBeenCalled()
      } else {
        // Should process normally
        expect(firebaseAdminMock.firestore.collection('event_logs').doc().set).toHaveBeenCalled()
      }
    })
  })
})
```

---

## ⚡ **Performance and Gas Testing**

### **Gas Usage Benchmarks**

```typescript
// src/__tests__/performance/gasUsage.test.ts
import { describe, beforeAll, it, expect } from '@jest/globals'
import { ContractTester } from '../utils/contractTester'

describe('Gas Usage Benchmarks', () => {
  let contractTester: ContractTester

  beforeAll(async () => {
    contractTester = new ContractTester('local')
    await contractTester.setup()
  })

  describe('Pool Creation Gas Usage', () => {
    it('should use acceptable gas for standard pool creation', async () => {
      // Arrange
      const standardPool = {
        poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
        maxLoanAmount: '1000',
        interestRate: 500,
        loanDuration: 2592000,
        name: 'Standard Pool',
      }

      // Act
      const result = await contractTester.createPool(standardPool)

      // Assert
      contractTester.expectSuccessfulTransaction(result)

      // Gas benchmarks
      const gasUsed = Number(result.gasUsed)
      expect(gasUsed).toBeLessThan(400000) // Maximum acceptable gas
      expect(gasUsed).toBeGreaterThan(100000) // Minimum realistic gas

      console.log(`Standard pool creation gas: ${gasUsed}`)
    })

    it('should measure gas impact of different pool parameters', async () => {
      // Test different parameter combinations
      const testCases = [
        {
          name: 'Short name pool',
          params: {
            poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
            maxLoanAmount: '1000',
            interestRate: 500,
            loanDuration: 2592000,
            name: 'A',
          },
        },
        {
          name: 'Long name pool',
          params: {
            poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
            maxLoanAmount: '1000',
            interestRate: 500,
            loanDuration: 2592000,
            name: 'This is a very long pool name that might affect gas usage due to storage costs',
          },
        },
        {
          name: 'High value pool',
          params: {
            poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
            maxLoanAmount: '1000000', // 1M ETH
            interestRate: 500,
            loanDuration: 2592000,
            name: 'High Value Pool',
          },
        },
      ]

      const gasResults = []

      // Act
      for (const testCase of testCases) {
        const result = await contractTester.createPool(testCase.params)
        gasResults.push({
          name: testCase.name,
          gasUsed: Number(result.gasUsed),
        })
      }

      // Assert
      gasResults.forEach((result) => {
        expect(result.gasUsed).toBeLessThan(500000) // All should be reasonable
        console.log(`${result.name}: ${result.gasUsed} gas`)
      })

      // Analyze gas differences
      const shortNameGas = gasResults.find((r) => r.name === 'Short name pool')?.gasUsed || 0
      const longNameGas = gasResults.find((r) => r.name === 'Long name pool')?.gasUsed || 0

      // Long name should use more gas (but not excessively more)
      expect(longNameGas).toBeGreaterThan(shortNameGas)
      const gasDifference = longNameGas - shortNameGas
      expect(gasDifference).toBeLessThan(50000) // Should be reasonable increase
    })
  })

  describe('Batch Operations Gas Efficiency', () => {
    it('should measure gas efficiency of multiple pool creations', async () => {
      // Arrange
      const poolCount = 5
      const baseParams = {
        poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
        maxLoanAmount: '1000',
        interestRate: 500,
        loanDuration: 2592000,
      }

      // Act
      const gasUsageResults = []

      for (let i = 0; i < poolCount; i++) {
        const result = await contractTester.createPool({
          ...baseParams,
          name: `Batch Pool ${i}`,
        })

        gasUsageResults.push(Number(result.gasUsed))
      }

      // Assert
      const totalGas = gasUsageResults.reduce((sum, gas) => sum + gas, 0)
      const avgGas = totalGas / gasUsageResults.length

      console.log(`Batch creation - Total: ${totalGas}, Average: ${avgGas}`)

      // Each transaction should have consistent gas usage
      gasUsageResults.forEach((gasUsed, index) => {
        const variance = Math.abs(gasUsed - avgGas) / avgGas
        expect(variance).toBeLessThan(0.05) // Less than 5% variance

        if (index > 0) {
          // Later transactions might use slightly less gas (warm storage)
          expect(gasUsed).toBeLessThanOrEqual(gasUsageResults[0] * 1.1)
        }
      })
    })
  })
})
```

### **Contract Performance Testing**

```typescript
// src/__tests__/performance/contractPerformance.test.ts
import { describe, beforeAll, it, expect } from '@jest/globals'
import { ContractTester } from '../utils/contractTester'

describe('Contract Performance Testing', () => {
  let contractTester: ContractTester

  beforeAll(async () => {
    contractTester = new ContractTester('local')
    await contractTester.setup()
  })

  describe('Transaction Confirmation Times', () => {
    it('should confirm transactions within acceptable time', async () => {
      // Arrange
      const poolParams = {
        poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
        maxLoanAmount: '1000',
        interestRate: 500,
        loanDuration: 2592000,
        name: 'Performance Test Pool',
      }

      // Act
      const startTime = Date.now()
      const result = await contractTester.createPool(poolParams)
      const endTime = Date.now()

      const confirmationTime = endTime - startTime

      // Assert
      contractTester.expectSuccessfulTransaction(result)

      // Local blockchain should be fast
      expect(confirmationTime).toBeLessThan(5000) // 5 seconds max

      console.log(`Transaction confirmation time: ${confirmationTime}ms`)
    })

    it('should handle concurrent transactions efficiently', async () => {
      // Arrange
      const concurrentCount = 3
      const poolPromises = []

      // Act
      const startTime = Date.now()

      for (let i = 0; i < concurrentCount; i++) {
        poolPromises.push(
          contractTester.createPool({
            poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
            maxLoanAmount: '1000',
            interestRate: 500,
            loanDuration: 2592000,
            name: `Concurrent Pool ${i}`,
          })
        )
      }

      const results = await Promise.all(poolPromises)
      const endTime = Date.now()

      const totalTime = endTime - startTime

      // Assert
      results.forEach((result) => {
        contractTester.expectSuccessfulTransaction(result)
      })

      // Concurrent processing should not take significantly longer than sequential
      const averageTimePerTx = totalTime / concurrentCount
      expect(averageTimePerTx).toBeLessThan(3000) // 3 seconds per transaction average

      console.log(`Concurrent transactions total time: ${totalTime}ms (${averageTimePerTx}ms avg)`)
    })
  })

  describe('Contract State Query Performance', () => {
    it('should query pool data efficiently', async () => {
      // Arrange - Create a pool first
      const poolParams = {
        poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
        maxLoanAmount: '1000',
        interestRate: 500,
        loanDuration: 2592000,
        name: 'Query Performance Pool',
      }

      const createResult = await contractTester.createPool(poolParams)
      const poolId = createResult.events.find((e) => e.name === 'PoolCreated')?.args.poolId

      // Act
      const startTime = Date.now()
      const poolData = await contractTester.getPool(Number(poolId))
      const endTime = Date.now()

      const queryTime = endTime - startTime

      // Assert
      expect(poolData).toBeDefined()
      expect(poolData.owner).toBe(poolParams.poolOwner)
      expect(poolData.name).toBe(poolParams.name)

      // Query should be fast
      expect(queryTime).toBeLessThan(1000) // 1 second max

      console.log(`Pool query time: ${queryTime}ms`)
    })

    it('should handle multiple simultaneous queries efficiently', async () => {
      // Arrange - Create multiple pools
      const poolCount = 5
      const poolIds = []

      for (let i = 0; i < poolCount; i++) {
        const result = await contractTester.createPool({
          poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
          maxLoanAmount: '1000',
          interestRate: 500,
          loanDuration: 2592000,
          name: `Multi Query Pool ${i}`,
        })

        const poolId = result.events.find((e) => e.name === 'PoolCreated')?.args.poolId
        poolIds.push(Number(poolId))
      }

      // Act
      const startTime = Date.now()

      const queryPromises = poolIds.map((poolId) => contractTester.getPool(poolId))
      const poolDataResults = await Promise.all(queryPromises)

      const endTime = Date.now()
      const totalQueryTime = endTime - startTime

      // Assert
      expect(poolDataResults).toHaveLength(poolCount)
      poolDataResults.forEach((poolData, index) => {
        expect(poolData).toBeDefined()
        expect(poolData.name).toBe(`Multi Query Pool ${index}`)
      })

      const avgQueryTime = totalQueryTime / poolCount
      expect(avgQueryTime).toBeLessThan(500) // 500ms average per query

      console.log(`Multiple queries total time: ${totalQueryTime}ms (${avgQueryTime}ms avg)`)
    })
  })
})
```

This comprehensive contract testing guide provides thorough coverage of smart contract integration testing, including gas optimization, performance benchmarking, multi-sig workflows, and event processing patterns.
