/**
 * Smart Contract Mock System
 *
 * This system provides comprehensive mocking for SuperPool smart contracts
 * including PoolFactory, Safe multi-sig, and lending pool contracts.
 */

import { jest } from '@jest/globals'
import { ethersMock } from './EthersMock'
import type { Contract } from 'ethers'

export interface PoolCreatedEvent {
  poolId: bigint
  poolAddress: string
  poolOwner: string
  name: string
  maxLoanAmount: bigint
  interestRate: number
  loanDuration: number
}

export interface SafeTransactionData {
  to: string
  value: bigint
  data: string
  operation: number
  safeTxGas: bigint
  baseGas: bigint
  gasPrice: bigint
  gasToken: string
  refundReceiver: string
  nonce: bigint
}

export class ContractMock {
  private static poolCount = 0
  private static pools = new Map<string, any>()
  private static safeNonce = 42
  private static safeOwners = [
    '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
    '0x1234567890123456789012345678901234567890',
    '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
  ]
  private static safeThreshold = 2

  /**
   * Create comprehensive PoolFactory contract mock
   */
  static createPoolFactoryMock(contractAddress?: string): jest.Mocked<Contract> {
    const address = contractAddress || '0x1234567890123456789012345678901234567890'

    const poolFactoryMock = {
      ...ethersMock.contract,
      target: address,

      // Read methods
      poolCount: jest.fn().mockImplementation(async () => {
        return BigInt(this.poolCount)
      }),

      pools: jest.fn().mockImplementation(async (...args: any[]) => {
        const poolId = args[0] as bigint | number
        const id = poolId.toString()
        const pool = this.pools.get(id)

        if (!pool) {
          // Return default empty pool structure
          return {
            owner: '0x0000000000000000000000000000000000000000',
            poolAddress: '0x0000000000000000000000000000000000000000',
            name: '',
            maxLoanAmount: BigInt(0),
            interestRate: 0,
            loanDuration: 0,
            isActive: false,
          }
        }

        return {
          owner: pool.owner,
          poolAddress: pool.poolAddress,
          name: pool.name,
          maxLoanAmount: pool.maxLoanAmount,
          interestRate: pool.interestRate,
          loanDuration: pool.loanDuration,
          isActive: pool.isActive,
        }
      }),

      // Owner management
      owner: jest.fn().mockResolvedValue('0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a'),
      pendingOwner: jest.fn().mockResolvedValue('0x0000000000000000000000000000000000000000'),

      // Contract state
      paused: jest.fn().mockResolvedValue(false),

      // Write methods
      createPool: jest.fn().mockImplementation(async (...args: any[]) => {
        const [poolOwner, maxLoanAmount, interestRate, loanDuration, name] = args as [string, bigint, number, number, string]
        // Validate inputs
        if (!poolOwner || poolOwner === '0x0000000000000000000000000000000000000000') {
          const error = new Error('execution reverted: Invalid pool owner')
          ;(error as any).code = 'CALL_EXCEPTION'
          throw error
        }

        if (maxLoanAmount <= 0) {
          const error = new Error('execution reverted: Invalid max loan amount')
          ;(error as any).code = 'CALL_EXCEPTION'
          throw error
        }

        if (interestRate < 0 || interestRate > 10000) {
          const error = new Error('execution reverted: Invalid interest rate')
          ;(error as any).code = 'CALL_EXCEPTION'
          throw error
        }

        if (loanDuration <= 0) {
          const error = new Error('execution reverted: Invalid loan duration')
          ;(error as any).code = 'CALL_EXCEPTION'
          throw error
        }

        // Create new pool
        const newPoolId = ++this.poolCount
        const poolAddress = `0x${'0'.repeat(39)}${newPoolId}`

        const pool = {
          id: newPoolId,
          owner: poolOwner,
          poolAddress,
          name,
          maxLoanAmount,
          interestRate,
          loanDuration,
          isActive: true,
          createdAt: new Date(),
        }

        this.pools.set(newPoolId.toString(), pool)

        // Create mock transaction
        const transactionHash = `0xpool${newPoolId.toString().padStart(60, '0')}`

        return {
          hash: transactionHash,
          from: ethersMock.wallet.address,
          to: address,
          wait: jest.fn().mockResolvedValue({
            transactionHash,
            blockNumber: ethersMock.provider.getBlockNumber(),
            status: 1,
            gasUsed: BigInt('450000'),
            logs: [
              {
                address: address,
                topics: [
                  '0x' + 'poolcreated'.padEnd(64, '0'), // PoolCreated event signature mock
                  `0x${'0'.repeat(62)}${newPoolId.toString(16)}`, // poolId
                ],
                data: '0x' + 'eventdata'.padEnd(64, '0'), // Encoded event data
              },
            ],
            events: [
              {
                event: 'PoolCreated',
                args: {
                  poolId: BigInt(newPoolId),
                  poolAddress,
                  owner: poolOwner,
                  name,
                  maxLoanAmount,
                  interestRate,
                  loanDuration,
                },
              },
            ],
          }),
        }
      }),

      transferOwnership: jest.fn().mockImplementation(async (...args: any[]) => {
        const newOwner = args[0] as string
        if (!newOwner || newOwner === '0x0000000000000000000000000000000000000000') {
          const error = new Error('execution reverted: Invalid new owner')
          ;(error as any).code = 'CALL_EXCEPTION'
          throw error
        }

        return {
          hash: '0xownership' + Date.now().toString(16),
          wait: jest.fn().mockResolvedValue({
            status: 1,
            gasUsed: BigInt('50000'),
          }),
        }
      }),

      acceptOwnership: jest.fn().mockResolvedValue({
        hash: '0xaccept' + Date.now().toString(16),
        wait: jest.fn().mockResolvedValue({
          status: 1,
          gasUsed: BigInt('30000'),
        }),
      }),

      // Emergency functions
      pause: jest.fn().mockResolvedValue({
        hash: '0xpause' + Date.now().toString(16),
        wait: jest.fn().mockResolvedValue({ status: 1 }),
      }),

      unpause: jest.fn().mockResolvedValue({
        hash: '0xunpause' + Date.now().toString(16),
        wait: jest.fn().mockResolvedValue({ status: 1 }),
      }),

      // Gas estimation - dynamically create estimateGas object
      estimateGas: {},

      // Static calls for view functions - dynamically create staticCall object
      staticCall: {},

      // Event filtering
      queryFilter: jest.fn().mockImplementation(async (event: any, fromBlock?: any, toBlock?: any) => {
        if (event === 'PoolCreated' || (event && event.name === 'PoolCreated')) {
          // Return mock PoolCreated events
          return Array.from(this.pools.values()).map((pool, index) => ({
            event: 'PoolCreated',
            args: {
              poolId: BigInt(pool.id),
              poolAddress: pool.poolAddress,
              owner: pool.owner,
              name: pool.name,
              maxLoanAmount: pool.maxLoanAmount,
              interestRate: pool.interestRate,
              loanDuration: pool.loanDuration,
            },
            blockNumber: 1234567 + index,
            transactionHash: `0xevent${pool.id.toString().padStart(60, '0')}`,
            address: address,
          }))
        }
        return []
      }),

      // Event listeners
      on: jest.fn(),
      off: jest.fn(),
      removeAllListeners: jest.fn(),

      // Interface
      interface: {
        parseLog: jest.fn().mockImplementation((log: any) => ({
          name: 'PoolCreated',
          args: {
            poolId: BigInt(1),
            poolAddress: '0x0000000000000000000000000000000000000001',
            owner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
          },
        })),
        getEvent: jest.fn(),
        getFunction: jest.fn(),
      },
    } as unknown as jest.Mocked<Contract>

    // Dynamically populate estimateGas methods
    ;(poolFactoryMock.estimateGas as any).createPool = jest.fn().mockResolvedValue(BigInt('500000'))
    ;(poolFactoryMock.estimateGas as any).transferOwnership = jest.fn().mockResolvedValue(BigInt('50000'))
    ;(poolFactoryMock.estimateGas as any).acceptOwnership = jest.fn().mockResolvedValue(BigInt('30000'))
    ;(poolFactoryMock.estimateGas as any).pause = jest.fn().mockResolvedValue(BigInt('30000'))
    ;(poolFactoryMock.estimateGas as any).unpause = jest.fn().mockResolvedValue(BigInt('30000'))

    // Dynamically populate staticCall methods (for view functions)
    ;(poolFactoryMock.staticCall as any).pools = poolFactoryMock.pools
    ;(poolFactoryMock.staticCall as any).poolCount = poolFactoryMock.poolCount
    ;(poolFactoryMock.staticCall as any).owner = poolFactoryMock.owner
    ;(poolFactoryMock.staticCall as any).paused = poolFactoryMock.paused

    return poolFactoryMock
  }

  /**
   * Create comprehensive Safe multi-sig contract mock
   */
  static createSafeMock(contractAddress?: string): jest.Mocked<Contract> {
    const address = contractAddress || '0x9876543210987654321098765432109876543210'

    const safeMock = {
      ...ethersMock.contract,
      target: address,

      // Safe read methods
      getOwners: jest.fn().mockResolvedValue([...this.safeOwners]),

      getThreshold: jest.fn().mockResolvedValue(BigInt(this.safeThreshold)),

      isOwner: jest.fn().mockImplementation(async (address: string) => {
        return this.safeOwners.includes(address.toLowerCase())
      }),

      nonce: jest.fn().mockImplementation(async () => {
        return BigInt(this.safeNonce)
      }),

      // Safe transaction methods
      getTransactionHash: jest
        .fn()
        .mockImplementation(
          async (
            to: string,
            value: bigint,
            data: string,
            operation: number,
            safeTxGas: bigint,
            baseGas: bigint,
            gasPrice: bigint,
            gasToken: string,
            refundReceiver: string,
            nonce: bigint
          ) => {
            // Create deterministic transaction hash for testing
            const txData = {
              to,
              value: value.toString(),
              data,
              operation,
              safeTxGas: safeTxGas.toString(),
              baseGas: baseGas.toString(),
              gasPrice: gasPrice.toString(),
              gasToken,
              refundReceiver,
              nonce: nonce.toString(),
            }

            const hash = ethersMock['createDeterministicHash'](JSON.stringify(txData))
            return `0x${hash}`
          }
        ),

      checkSignatures: jest.fn().mockImplementation(async (dataHash: string, data: string, signatures: string) => {
        // Mock signature validation
        const signatureCount = signatures.length > 2 ? (signatures.length - 2) / 130 : 0

        if (signatureCount < this.safeThreshold) {
          const error = new Error('execution reverted: GS020: Signatures not valid')
          ;(error as any).code = 'CALL_EXCEPTION'
          throw error
        }

        return true
      }),

      execTransaction: jest
        .fn()
        .mockImplementation(
          async (
            to: string,
            value: bigint,
            data: string,
            operation: number,
            safeTxGas: bigint,
            baseGas: bigint,
            gasPrice: bigint,
            gasToken: string,
            refundReceiver: string,
            signatures: string
          ) => {
            // Validate signature count
            const signatureCount = signatures.length > 2 ? (signatures.length - 2) / 130 : 0

            if (signatureCount < this.safeThreshold) {
              const error = new Error('execution reverted: GS020: Threshold not met')
              ;(error as any).code = 'CALL_EXCEPTION'
              throw error
            }

            // Increment nonce
            this.safeNonce++

            return {
              hash: `0xsafeexec${Date.now().toString(16)}`,
              wait: jest.fn().mockResolvedValue({
                status: 1,
                gasUsed: BigInt('200000'),
                logs: [
                  {
                    address: address,
                    topics: ['0x' + 'executionfrommodulesuccess'.padEnd(64, '0')],
                    data: '0x' + 'success'.padEnd(64, '0'),
                  },
                ],
              }),
            }
          }
        ),

      // Gas estimation
      estimateGas: {
        execTransaction: jest.fn().mockResolvedValue(BigInt('200000')),
      },

      // Static calls
      staticCall: {},

      // Event filtering
      queryFilter: jest.fn().mockResolvedValue([]),

      // Event listeners
      on: jest.fn(),
      off: jest.fn(),
      removeAllListeners: jest.fn(),

      // Interface
      interface: {
        parseLog: jest.fn(),
        getEvent: jest.fn(),
        getFunction: jest.fn(),
      },
    } as unknown as jest.Mocked<Contract>

    // Populate static call methods
    safeMock.staticCall.getOwners = safeMock.getOwners
    safeMock.staticCall.getThreshold = safeMock.getThreshold
    safeMock.staticCall.isOwner = safeMock.isOwner
    safeMock.staticCall.nonce = safeMock.nonce

    return safeMock
  }

  /**
   * Create mock for a generic lending pool contract
   */
  static createLendingPoolMock(poolAddress: string, poolData?: any): jest.Mocked<Contract> {
    const pool = poolData || {
      owner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
      maxLoanAmount: BigInt('1000000000000000000000'),
      interestRate: 500,
      loanDuration: 2592000,
      totalDeposited: BigInt('5000000000000000000000'),
      totalBorrowed: BigInt('2000000000000000000000'),
      isActive: true,
    }

    const lendingPoolMock = {
      ...ethersMock.contract,
      target: poolAddress,

      // Pool state
      owner: jest.fn().mockResolvedValue(pool.owner),
      maxLoanAmount: jest.fn().mockResolvedValue(pool.maxLoanAmount),
      interestRate: jest.fn().mockResolvedValue(pool.interestRate),
      loanDuration: jest.fn().mockResolvedValue(pool.loanDuration),
      totalDeposited: jest.fn().mockResolvedValue(pool.totalDeposited),
      totalBorrowed: jest.fn().mockResolvedValue(pool.totalBorrowed),
      isActive: jest.fn().mockResolvedValue(pool.isActive),

      // Member management
      addMember: jest.fn().mockResolvedValue({
        hash: `0xaddmember${Date.now().toString(16)}`,
        wait: jest.fn().mockResolvedValue({ status: 1 }),
      }),

      removeMember: jest.fn().mockResolvedValue({
        hash: `0xremovemember${Date.now().toString(16)}`,
        wait: jest.fn().mockResolvedValue({ status: 1 }),
      }),

      isMember: jest.fn().mockResolvedValue(true),

      // Lending operations
      deposit: jest.fn().mockResolvedValue({
        hash: `0xdeposit${Date.now().toString(16)}`,
        wait: jest.fn().mockResolvedValue({ status: 1 }),
      }),

      withdraw: jest.fn().mockResolvedValue({
        hash: `0xwithdraw${Date.now().toString(16)}`,
        wait: jest.fn().mockResolvedValue({ status: 1 }),
      }),

      requestLoan: jest.fn().mockResolvedValue({
        hash: `0xrequestloan${Date.now().toString(16)}`,
        wait: jest.fn().mockResolvedValue({ status: 1 }),
      }),

      approveLoan: jest.fn().mockResolvedValue({
        hash: `0xapproveloan${Date.now().toString(16)}`,
        wait: jest.fn().mockResolvedValue({ status: 1 }),
      }),

      repayLoan: jest.fn().mockResolvedValue({
        hash: `0xrepayloan${Date.now().toString(16)}`,
        wait: jest.fn().mockResolvedValue({ status: 1 }),
      }),

      // Gas estimation
      estimateGas: {
        addMember: jest.fn().mockResolvedValue(BigInt('100000')),
        deposit: jest.fn().mockResolvedValue(BigInt('150000')),
        withdraw: jest.fn().mockResolvedValue(BigInt('120000')),
        requestLoan: jest.fn().mockResolvedValue(BigInt('180000')),
        approveLoan: jest.fn().mockResolvedValue(BigInt('200000')),
        repayLoan: jest.fn().mockResolvedValue(BigInt('160000')),
      },

      // Event filtering
      queryFilter: jest.fn().mockResolvedValue([]),

      // Interface
      interface: {
        parseLog: jest.fn(),
        getEvent: jest.fn(),
        getFunction: jest.fn(),
      },
    } as unknown as jest.Mocked<Contract>

    return lendingPoolMock
  }

  /**
   * Generic contract factory for custom contracts
   */
  static createContractMock(address: string, customMethods: Record<string, any> = {}): jest.Mocked<Contract> {
    const contractMock = {
      ...ethersMock.contract,
      target: address,

      // Add custom methods
      ...customMethods,

      // Default methods
      estimateGas: customMethods.estimateGas || {},
      staticCall: customMethods.staticCall || {},

      // Event filtering
      queryFilter: jest.fn().mockResolvedValue([]),

      // Interface
      interface: {
        parseLog: jest.fn(),
        getEvent: jest.fn(),
        getFunction: jest.fn(),
      },
    } as unknown as jest.Mocked<Contract>

    return contractMock
  }

  // Utility methods for test state management
  static resetPoolState(): void {
    this.poolCount = 0
    this.pools.clear()
  }

  static resetSafeState(): void {
    this.safeNonce = 42
  }

  static resetAllState(): void {
    this.resetPoolState()
    this.resetSafeState()
  }

  static setSafeOwners(owners: string[]): void {
    this.safeOwners = [...owners]
  }

  static setSafeThreshold(threshold: number): void {
    this.safeThreshold = threshold
  }

  static getPoolData(poolId: string): any {
    return this.pools.get(poolId)
  }

  static getAllPools(): Map<string, any> {
    return new Map(this.pools)
  }

  static simulateContractError(errorType: 'revert' | 'outofgas' | 'invalid', message?: string): Error {
    switch (errorType) {
      case 'revert':
        const revertError = new Error(message || 'execution reverted')
        ;(revertError as any).code = 'CALL_EXCEPTION'
        return revertError

      case 'outofgas':
        const gasError = new Error(message || 'out of gas')
        ;(gasError as any).code = 'UNPREDICTABLE_GAS_LIMIT'
        return gasError

      case 'invalid':
        const invalidError = new Error(message || 'invalid opcode')
        ;(invalidError as any).code = 'INVALID_ARGUMENT'
        return invalidError

      default:
        return new Error(message || 'Contract error')
    }
  }
}

export default ContractMock
