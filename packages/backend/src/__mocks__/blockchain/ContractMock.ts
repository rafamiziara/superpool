/**
 * Smart Contract Mock System
 *
 * This system provides comprehensive mocking for SuperPool smart contracts
 * including PoolFactory, Safe multi-sig, and lending pool contracts.
 * Completely rebuilt with proper TypeScript support and Jest compatibility.
 */

import { jest } from '@jest/globals'

// Core Ethers Types Simulation
export interface MockTransactionReceipt {
  transactionHash: string
  blockNumber: number
  status: number
  gasUsed: bigint
  logs: Array<{
    address: string
    topics: string[]
    data: string
  }>
  events?: Array<{
    event: string
    args: Record<string, unknown>
  }>
}

export interface MockTransactionResponse {
  hash: string
  wait: jest.MockedFunction<() => Promise<MockTransactionReceipt>>
}

// Pool Creation Event Interface
export interface PoolCreatedEvent {
  poolId: bigint
  poolAddress: string
  poolOwner: string
  name: string
  maxLoanAmount: bigint
  interestRate: number
  loanDuration: number
}

// Safe Transaction Data Interface
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

// Mock Contract Function Interface
export interface MockContractFunction {
  (...args: unknown[]): Promise<unknown>
  staticCall: jest.MockedFunction<(...args: unknown[]) => Promise<unknown>>
  estimateGas: jest.MockedFunction<(...args: unknown[]) => Promise<bigint>>
}

// Mock Contract Interface
export interface MockContract {
  target: string
  interface: {
    parseLog: jest.MockedFunction<(log: { topics: string[]; data: string }) => unknown>
    encodeFunctionData: jest.MockedFunction<(fragment: string, values?: readonly unknown[]) => string>
    getFunction: jest.MockedFunction<(key: string) => unknown>
  }
  getAddress: jest.MockedFunction<() => Promise<string>>
  [functionName: string]: MockContractFunction | unknown
}

// Mock Provider Interface
export interface MockProvider {
  waitForTransaction: jest.MockedFunction<(hash: string, confirmations?: number, timeout?: number) => Promise<MockTransactionReceipt>>
  getFeeData: jest.MockedFunction<() => Promise<{ gasPrice: bigint; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }>>
  getTransactionReceipt: jest.MockedFunction<(hash: string) => Promise<MockTransactionReceipt | null>>
  getCode: jest.MockedFunction<(address: string) => Promise<string>>
  getNetwork: jest.MockedFunction<() => Promise<{ chainId: number; name: string }>>
}

export class ContractMock {
  private static poolCount = 0
  private static pools = new Map<
    string,
    {
      id: bigint
      address: string
      owner: string
      name: string
      maxLoanAmount: bigint
      interestRate: number
      loanDuration: number
    }
  >()
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
  static createPoolFactoryMock(contractAddress?: string): MockContract {
    const address = contractAddress || '0x1234567890123456789012345678901234567890'

    const mock: MockContract = {
      target: address,
      interface: {
        parseLog: jest.fn((log: { topics: string[]; data: string }) => {
          // Mock parsing pool creation events
          if (log.topics[0] === '0x123...poolcreated') {
            return {
              name: 'PoolCreated',
              args: {
                poolId: BigInt(++ContractMock.poolCount),
                poolAddress: `0x${ContractMock.poolCount.toString().padStart(40, '0')}`,
                poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
                name: 'Test Pool',
                maxLoanAmount: BigInt('1000000000000000000'),
                interestRate: 5,
                loanDuration: 30,
              },
            }
          }
          return null
        }),
        encodeFunctionData: jest.fn((fragment: string, values: readonly unknown[] = []) => {
          return `0x${fragment.slice(0, 8)}${values.map(() => '0'.repeat(64)).join('')}`
        }),
        getFunction: jest.fn((key: string) => ({
          name: key,
          inputs: [],
        })),
      },
      getAddress: jest.fn(async () => address),
    }

    // Add createPool function
    const createPoolFunction: MockContractFunction = jest.fn(
      async (name: string, maxLoanAmount: bigint, interestRate: number, loanDuration: number) => {
        const poolId = BigInt(++ContractMock.poolCount)
        const poolAddress = `0x${ContractMock.poolCount.toString().padStart(40, '0')}`

        // Store pool data
        ContractMock.pools.set(poolAddress, {
          id: poolId,
          address: poolAddress,
          owner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
          name,
          maxLoanAmount,
          interestRate,
          loanDuration,
        })

        const mockTx: MockTransactionResponse = {
          hash: `0x${'123'.repeat(21)}${ContractMock.poolCount}`,
          wait: jest.fn(async () => ({
            transactionHash: `0x${'123'.repeat(21)}${ContractMock.poolCount}`,
            blockNumber: 12345000 + ContractMock.poolCount,
            status: 1,
            gasUsed: BigInt('500000'),
            logs: [
              {
                address: poolAddress,
                topics: ['0x123...poolcreated', `0x${poolId.toString(16).padStart(64, '0')}`],
                data: `0x${poolAddress.slice(2).padStart(64, '0')}`,
              },
            ],
            events: [
              {
                event: 'PoolCreated',
                args: {
                  poolId,
                  poolAddress,
                  poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
                  name,
                  maxLoanAmount,
                  interestRate,
                  loanDuration,
                },
              },
            ],
          })),
        }

        return mockTx
      }
    ) as unknown as MockContractFunction

    createPoolFunction.staticCall = jest.fn(async () => BigInt(ContractMock.poolCount + 1))
    createPoolFunction.estimateGas = jest.fn(async () => BigInt('500000'))

    mock.createPool = createPoolFunction

    // Add other PoolFactory functions
    mock.getPool = jest.fn(async (poolId: bigint) => {
      const pool = Array.from(ContractMock.pools.values()).find((p) => p.id === poolId)
      return pool ? [pool.address, pool.owner, pool.name, pool.maxLoanAmount, pool.interestRate, pool.loanDuration] : null
    })

    mock.poolCount = jest.fn(async () => BigInt(ContractMock.poolCount))

    return mock
  }

  /**
   * Create comprehensive Safe contract mock
   */
  static createSafeMock(contractAddress?: string): MockContract {
    const address = contractAddress || '0x9876543210987654321098765432109876543210'

    const mock: MockContract = {
      target: address,
      interface: {
        parseLog: jest.fn(() => null),
        encodeFunctionData: jest.fn(() => '0x123456'),
        getFunction: jest.fn(() => ({ name: 'mockFunction' })),
      },
      getAddress: jest.fn(async () => address),
    }

    // Safe-specific functions
    mock.getThreshold = jest.fn(async () => BigInt(ContractMock.safeThreshold))
    mock.getOwners = jest.fn(async () => ContractMock.safeOwners)
    mock.nonce = jest.fn(async () => BigInt(ContractMock.safeNonce))

    mock.isOwner = jest.fn(async (address: string) => {
      return ContractMock.safeOwners.includes(address)
    })

    mock.getTransactionHash = jest.fn(
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
        return `0x${[to, value.toString(), data, operation.toString(), safeTxGas.toString()].join('').slice(0, 64).padEnd(64, '0')}`
      }
    )

    mock.checkSignatures = jest.fn(async (dataHash: string, data: string, signatures: string) => {
      // Simple validation - in real tests, this would validate actual signatures
      return signatures.length >= ContractMock.safeThreshold * 130 // 65 bytes per signature * 2
    })

    mock.execTransaction = jest.fn(
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
        ContractMock.safeNonce++

        const mockTx: MockTransactionResponse = {
          hash: `0x${'456'.repeat(21)}${ContractMock.safeNonce}`,
          wait: jest.fn(async () => ({
            transactionHash: `0x${'456'.repeat(21)}${ContractMock.safeNonce}`,
            blockNumber: 12346000,
            status: 1,
            gasUsed: BigInt('150000'),
            logs: [
              {
                address,
                topics: ['0x456...executed'],
                data: '0x123456',
              },
            ],
          })),
        }

        return mockTx
      }
    )

    return mock
  }

  /**
   * Create LendingPool contract mock
   */
  static createLendingPoolMock(contractAddress?: string): MockContract {
    const address = contractAddress || '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'

    const mock: MockContract = {
      target: address,
      interface: {
        parseLog: jest.fn(() => null),
        encodeFunctionData: jest.fn(() => '0x789abc'),
        getFunction: jest.fn(() => ({ name: 'mockFunction' })),
      },
      getAddress: jest.fn(async () => address),
    }

    // LendingPool specific functions
    mock.owner = jest.fn(async () => '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a')
    mock.name = jest.fn(async () => 'Test Pool')
    mock.maxLoanAmount = jest.fn(async () => BigInt('1000000000000000000'))
    mock.interestRate = jest.fn(async () => BigInt('5'))
    mock.loanDuration = jest.fn(async () => BigInt('30'))
    mock.isActive = jest.fn(async () => true)

    mock.isMember = jest.fn(async (address: string) => {
      // Mock member check
      return address !== '0x0000000000000000000000000000000000000000'
    })

    return mock
  }

  /**
   * Create mock provider for blockchain interaction
   */
  static createProviderMock(): MockProvider {
    return {
      waitForTransaction: jest.fn(async (hash: string) => ({
        transactionHash: hash,
        blockNumber: 12345678,
        status: 1,
        gasUsed: BigInt('100000'),
        logs: [],
      })),

      getFeeData: jest.fn(async () => ({
        gasPrice: BigInt('20000000000'),
        maxFeePerGas: BigInt('25000000000'),
        maxPriorityFeePerGas: BigInt('2000000000'),
      })),

      getTransactionReceipt: jest.fn(async (hash: string) => ({
        transactionHash: hash,
        blockNumber: 12345678,
        status: 1,
        gasUsed: BigInt('100000'),
        logs: [],
      })),

      getCode: jest.fn(async (address: string) => {
        // Return empty for non-contract addresses
        if (address === '0x0000000000000000000000000000000000000000') return '0x'
        // Return mock bytecode for contract addresses
        return '0x608060405234801561001057600080fd5b50...'
      }),

      getNetwork: jest.fn(async () => ({
        chainId: 80002,
        name: 'polygon-amoy',
      })),
    }
  }

  /**
   * Reset all mock state (useful for test cleanup)
   */
  static reset(): void {
    ContractMock.poolCount = 0
    ContractMock.pools.clear()
    ContractMock.safeNonce = 42
  }

  /**
   * Get current mock state (useful for testing)
   */
  static getState() {
    return {
      poolCount: ContractMock.poolCount,
      pools: Array.from(ContractMock.pools.entries()),
      safeNonce: ContractMock.safeNonce,
      safeOwners: [...ContractMock.safeOwners],
      safeThreshold: ContractMock.safeThreshold,
    }
  }
}

// Export default instance
export default ContractMock
