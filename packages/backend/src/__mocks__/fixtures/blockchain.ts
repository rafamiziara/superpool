/**
 * Blockchain Test Fixtures
 *
 * This file contains sample blockchain data, contract interactions,
 * and transaction patterns for comprehensive testing.
 */

import type { PoolCreatedEvent } from '../blockchain/ContractMock'

// Sample Ethereum addresses for testing
export const SAMPLE_ADDRESSES = {
  // Pool owners
  POOL_OWNER_1: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
  POOL_OWNER_2: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  POOL_OWNER_3: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',

  // Borrowers
  BORROWER_1: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
  BORROWER_2: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
  BORROWER_3: '0x976EA74026E726554dB657fA54763abd0C3a0aa9',

  // Lenders
  LENDER_1: '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955',
  LENDER_2: '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f',
  LENDER_3: '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',

  // Safe multi-sig owners
  SAFE_OWNER_1: '0xBcd4042DE499D14e55001CcbB24a551F3b954096',
  SAFE_OWNER_2: '0x71bE63f3384f5fb98995898A86B02Fb2426c5788',
  SAFE_OWNER_3: '0xFABB0ac9d68B0B445fB7357272Ff202C5651694a',
  SAFE_OWNER_4: '0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec',
  SAFE_OWNER_5: '0xdF3e18d64BC6A983f673Ab319CCaE4f1a57C7097',

  // Contracts
  POOL_FACTORY: '0x1234567890123456789012345678901234567890',
  SAFE_ADDRESS: '0x9876543210987654321098765432109876543210',

  // Zero address for testing invalid scenarios
  ZERO_ADDRESS: '0x0000000000000000000000000000000000000000',

  // Invalid addresses for testing validation
  INVALID_ADDRESS: '0xinvalid',
  INVALID_CHECKSUM: '0x742d35cc6670c74288c2e768dc1e574a0b7dbe7a', // lowercase
}

// Sample transaction hashes
export const SAMPLE_TRANSACTION_HASHES = {
  POOL_CREATION_1: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  POOL_CREATION_2: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  SAFE_EXECUTION_1: '0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
  FAILED_TRANSACTION: '0x0000000000000000000000000000000000000000000000000000000000000000',

  // Multi-sig transaction hashes
  SAFE_TX_HASH_1: '0xabc1234567890123456789012345678901234567890123456789012345678901',
  SAFE_TX_HASH_2: '0xdef9876543210987654321098765432109876543210987654321098765432109',
}

// Sample pool creation parameters
export const SAMPLE_POOL_PARAMS = {
  BASIC_POOL: {
    poolOwner: SAMPLE_ADDRESSES.POOL_OWNER_1,
    maxLoanAmount: '1000', // 1000 ETH
    interestRate: 500, // 5%
    loanDuration: 2592000, // 30 days
    name: 'Basic Lending Pool',
    description: 'A simple lending pool for testing basic functionality',
  },

  HIGH_INTEREST_POOL: {
    poolOwner: SAMPLE_ADDRESSES.POOL_OWNER_2,
    maxLoanAmount: '500', // 500 ETH
    interestRate: 1200, // 12%
    loanDuration: 1296000, // 15 days
    name: 'High Interest Short Term Pool',
    description: 'Higher risk, higher reward short-term lending pool',
  },

  LARGE_POOL: {
    poolOwner: SAMPLE_ADDRESSES.POOL_OWNER_3,
    maxLoanAmount: '10000', // 10,000 ETH
    interestRate: 300, // 3%
    loanDuration: 7776000, // 90 days
    name: 'Large Enterprise Pool',
    description: 'Large pool for enterprise-level lending with competitive rates',
  },

  MICRO_POOL: {
    poolOwner: SAMPLE_ADDRESSES.POOL_OWNER_1,
    maxLoanAmount: '10', // 10 ETH
    interestRate: 800, // 8%
    loanDuration: 604800, // 7 days
    name: 'Micro Lending Pool',
    description: 'Small pool for micro-loans and quick turnaround',
  },

  // Invalid scenarios
  ZERO_AMOUNT_POOL: {
    poolOwner: SAMPLE_ADDRESSES.POOL_OWNER_1,
    maxLoanAmount: '0', // Invalid
    interestRate: 500,
    loanDuration: 2592000,
    name: 'Invalid Zero Amount Pool',
    description: 'This should fail validation',
  },

  INVALID_RATE_POOL: {
    poolOwner: SAMPLE_ADDRESSES.POOL_OWNER_1,
    maxLoanAmount: '1000',
    interestRate: 15000, // Invalid: > 100%
    loanDuration: 2592000,
    name: 'Invalid High Rate Pool',
    description: 'This should fail with invalid interest rate',
  },

  ZERO_DURATION_POOL: {
    poolOwner: SAMPLE_ADDRESSES.POOL_OWNER_1,
    maxLoanAmount: '1000',
    interestRate: 500,
    loanDuration: 0, // Invalid
    name: 'Invalid Zero Duration Pool',
    description: 'This should fail with zero duration',
  },

  INVALID_OWNER_POOL: {
    poolOwner: SAMPLE_ADDRESSES.ZERO_ADDRESS, // Invalid
    maxLoanAmount: '1000',
    interestRate: 500,
    loanDuration: 2592000,
    name: 'Invalid Owner Pool',
    description: 'This should fail with invalid owner address',
  },
}

// Sample pool creation events
export const SAMPLE_POOL_EVENTS: PoolCreatedEvent[] = [
  {
    poolId: BigInt(1),
    poolAddress: '0x0000000000000000000000000000000000000001',
    poolOwner: SAMPLE_ADDRESSES.POOL_OWNER_1,
    name: 'Basic Lending Pool',
    maxLoanAmount: BigInt('1000000000000000000000'), // 1000 ETH in wei
    interestRate: 500,
    loanDuration: 2592000,
  },
  {
    poolId: BigInt(2),
    poolAddress: '0x0000000000000000000000000000000000000002',
    poolOwner: SAMPLE_ADDRESSES.POOL_OWNER_2,
    name: 'High Interest Short Term Pool',
    maxLoanAmount: BigInt('500000000000000000000'), // 500 ETH in wei
    interestRate: 1200,
    loanDuration: 1296000,
  },
  {
    poolId: BigInt(3),
    poolAddress: '0x0000000000000000000000000000000000000003',
    poolOwner: SAMPLE_ADDRESSES.POOL_OWNER_3,
    name: 'Large Enterprise Pool',
    maxLoanAmount: BigInt('10000000000000000000000'), // 10,000 ETH in wei
    interestRate: 300,
    loanDuration: 7776000,
  },
]

// Sample Safe multi-sig transaction data
export const SAMPLE_SAFE_TRANSACTIONS = {
  POOL_CREATION_TX: {
    to: SAMPLE_ADDRESSES.POOL_FACTORY,
    value: BigInt(0),
    data: '0x1234567890abcdef', // Mock encoded createPool call
    operation: 0, // CALL
    safeTxGas: BigInt(0),
    baseGas: BigInt(0),
    gasPrice: BigInt(0),
    gasToken: SAMPLE_ADDRESSES.ZERO_ADDRESS,
    refundReceiver: SAMPLE_ADDRESSES.ZERO_ADDRESS,
    nonce: BigInt(42),
  },

  OWNERSHIP_TRANSFER_TX: {
    to: SAMPLE_ADDRESSES.POOL_FACTORY,
    value: BigInt(0),
    data: '0xabcdef1234567890', // Mock encoded transferOwnership call
    operation: 0, // CALL
    safeTxGas: BigInt(0),
    baseGas: BigInt(0),
    gasPrice: BigInt(0),
    gasToken: SAMPLE_ADDRESSES.ZERO_ADDRESS,
    refundReceiver: SAMPLE_ADDRESSES.ZERO_ADDRESS,
    nonce: BigInt(43),
  },
}

// Sample signatures for multi-sig testing
export const SAMPLE_SIGNATURES = {
  OWNER_1_SIG:
    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b',
  OWNER_2_SIG:
    '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd1c',
  OWNER_3_SIG:
    '0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba09871b',

  // Combined signatures (concatenated)
  TWO_SIGNATURES:
    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1babcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd1c',

  THREE_SIGNATURES:
    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1babcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd1cfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba09871b',

  // Invalid signatures
  INVALID_SIG: '0xinvalid',
  SHORT_SIG: '0x1234567890',
  WRONG_LENGTH_SIG: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12', // Too short
}

// Sample Safe transaction execution data
export const SAMPLE_SAFE_EXECUTION_DATA = {
  POOL_CREATION_TX: {
    to: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
    data: '0x12345678',
    value: '0',
    operation: 0,
    safeTxGas: 100000,
    baseGas: 50000,
    gasPrice: '0',
    gasToken: '0x0000000000000000000000000000000000000000',
    refundReceiver: '0x0000000000000000000000000000000000000000',
    nonce: 0,
    transactionHash: '0x' + 'safetx'.repeat(11) + '1',
  },

  OWNERSHIP_TRANSFER_TX: {
    to: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
    data: '0x87654321',
    value: '0',
    operation: 0,
    safeTxGas: 75000,
    baseGas: 25000,
    gasPrice: '0',
    gasToken: '0x0000000000000000000000000000000000000000',
    refundReceiver: '0x0000000000000000000000000000000000000000',
    nonce: 1,
    transactionHash: '0x' + 'ownertx'.repeat(11) + '2',
  },
}

// Sample gas usage data for performance testing
export const SAMPLE_GAS_USAGE = {
  POOL_CREATION: {
    estimate: BigInt('450000'),
    actual: BigInt('423156'),
    method: 'createPool',
  },

  SAFE_EXECUTION: {
    estimate: BigInt('200000'),
    actual: BigInt('187432'),
    method: 'execTransaction',
  },

  OWNERSHIP_TRANSFER: {
    estimate: BigInt('50000'),
    actual: BigInt('47821'),
    method: 'transferOwnership',
  },

  MEMBER_ADDITION: {
    estimate: BigInt('100000'),
    actual: BigInt('95234'),
    method: 'addMember',
  },

  LOAN_REQUEST: {
    estimate: BigInt('180000'),
    actual: BigInt('167892'),
    method: 'requestLoan',
  },
}

// Sample block and transaction data
export const SAMPLE_BLOCKS = {
  CURRENT_BLOCK: {
    number: 1234567,
    hash: '0xabc1234567890123456789012345678901234567890123456789012345678901',
    timestamp: Math.floor(Date.now() / 1000),
    gasLimit: BigInt('30000000'),
    gasUsed: BigInt('15678432'),
  },

  PREVIOUS_BLOCK: {
    number: 1234566,
    hash: '0xdef9876543210987654321098765432109876543210987654321098765432109',
    timestamp: Math.floor(Date.now() / 1000) - 2000, // 2 seconds ago
    gasLimit: BigInt('30000000'),
    gasUsed: BigInt('14532178'),
  },
}

// Sample network configurations
export const SAMPLE_NETWORKS = {
  POLYGON_AMOY: {
    chainId: 80002,
    name: 'polygon-amoy',
    rpcUrl: 'https://rpc-amoy.polygon.technology',
    blockTime: 2000, // 2 seconds
    gasPrice: BigInt('30000000000'), // 30 Gwei
  },

  LOCAL_HARDHAT: {
    chainId: 31337,
    name: 'localhost',
    rpcUrl: 'http://127.0.0.1:8545',
    blockTime: 1000, // 1 second
    gasPrice: BigInt('20000000000'), // 20 Gwei
  },

  POLYGON_MAINNET: {
    chainId: 137,
    name: 'polygon',
    rpcUrl: 'https://polygon-rpc.com',
    blockTime: 2000, // 2 seconds
    gasPrice: BigInt('50000000000'), // 50 Gwei
  },
}

// Sample error scenarios for testing error handling
export const SAMPLE_ERRORS = {
  CONTRACT_REVERT: {
    code: 'CALL_EXCEPTION',
    reason: 'execution reverted: Invalid pool owner',
    method: 'createPool',
    transaction: SAMPLE_TRANSACTION_HASHES.FAILED_TRANSACTION,
  },

  INSUFFICIENT_GAS: {
    code: 'UNPREDICTABLE_GAS_LIMIT',
    reason: 'cannot estimate gas; transaction may fail or may require manual gas limit',
    method: 'createPool',
  },

  NETWORK_ERROR: {
    code: 'NETWORK_ERROR',
    reason: 'could not detect network',
  },

  INVALID_ADDRESS: {
    code: 'INVALID_ARGUMENT',
    reason: 'invalid address',
    value: SAMPLE_ADDRESSES.INVALID_ADDRESS,
  },

  SAFE_THRESHOLD_NOT_MET: {
    code: 'CALL_EXCEPTION',
    reason: 'execution reverted: GS020: Threshold not met',
    method: 'execTransaction',
  },
}

// Helper functions for creating test data
export class BlockchainFixtures {
  /**
   * Create a random Ethereum address for testing
   */
  static randomAddress(): string {
    const hex = '0x' + Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
    return hex
  }

  /**
   * Create a random transaction hash
   */
  static randomTxHash(): string {
    const hex = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
    return hex
  }

  /**
   * Create sample pool parameters with random values
   */
  static randomPoolParams(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      poolOwner: this.randomAddress(),
      maxLoanAmount: (Math.floor(Math.random() * 10000) + 100).toString(),
      interestRate: Math.floor(Math.random() * 2000) + 100, // 1-20%
      loanDuration: Math.floor(Math.random() * 7776000) + 604800, // 7 days to 90 days
      name: `Random Pool ${Date.now()}`,
      description: `Randomly generated pool for testing purposes`,
      ...overrides,
    }
  }

  /**
   * Create a sample pool event with realistic data
   */
  static createPoolEvent(poolId: number, overrides: Partial<PoolCreatedEvent> = {}): PoolCreatedEvent {
    return {
      poolId: BigInt(poolId),
      poolAddress: `0x${'0'.repeat(39)}${poolId}`,
      poolOwner: SAMPLE_ADDRESSES.POOL_OWNER_1,
      name: `Test Pool ${poolId}`,
      maxLoanAmount: BigInt('1000000000000000000000'), // 1000 ETH
      interestRate: 500,
      loanDuration: 2592000,
      ...overrides,
    }
  }

  /**
   * Create sample transaction receipt
   */
  static createTransactionReceipt(txHash: string, overrides: Record<string, unknown> = {}) {
    return {
      transactionHash: txHash,
      blockNumber: SAMPLE_BLOCKS.CURRENT_BLOCK.number,
      blockHash: SAMPLE_BLOCKS.CURRENT_BLOCK.hash,
      transactionIndex: 0,
      gasUsed: BigInt('423156'),
      effectiveGasPrice: BigInt('30000000000'),
      status: 1,
      logs: [],
      events: [],
      ...overrides,
    }
  }

  /**
   * Create sample Safe transaction signatures
   */
  static createSafeSignatures(count: number): string {
    const sigs = [SAMPLE_SIGNATURES.OWNER_1_SIG, SAMPLE_SIGNATURES.OWNER_2_SIG, SAMPLE_SIGNATURES.OWNER_3_SIG].slice(0, count)

    return sigs.join('').replace(/0x/g, '').replace(/^/, '0x')
  }
}

export default {
  SAMPLE_ADDRESSES,
  SAMPLE_TRANSACTION_HASHES,
  SAMPLE_POOL_PARAMS,
  SAMPLE_POOL_EVENTS,
  SAMPLE_SAFE_TRANSACTIONS,
  SAMPLE_SAFE_EXECUTION_DATA,
  SAMPLE_SIGNATURES,
  SAMPLE_GAS_USAGE,
  SAMPLE_BLOCKS,
  SAMPLE_NETWORKS,
  SAMPLE_ERRORS,
  BlockchainFixtures,
}
