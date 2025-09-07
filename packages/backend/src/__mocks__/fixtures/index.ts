/**
 * Test Fixtures Index
 *
 * Central export point for all test fixtures, sample data, and test utilities
 * used across the SuperPool backend testing suite.
 */

// Export blockchain fixtures
export * from './blockchain'
export { default as BlockchainFixtures } from './blockchain'

// Export Firebase fixtures
export * from './firebase'
export { default as FirebaseFixtures } from './firebase'

// Re-export commonly used fixtures with aliases for convenience
export {
  SAMPLE_ADDRESSES as Addresses,
  SAMPLE_POOL_PARAMS as PoolParams,
  SAMPLE_TRANSACTION_HASHES,
  SAMPLE_SIGNATURES as Signatures,
  SAMPLE_SAFE_TRANSACTIONS,
  SAMPLE_SAFE_EXECUTION_DATA,
  SAMPLE_GAS_USAGE as GasUsage,
  BlockchainFixtures as Blockchain,
} from './blockchain'

export {
  SAMPLE_USERS as Users,
  SAMPLE_ID_TOKENS as IdTokens,
  SAMPLE_FIRESTORE_DOCS as FirestoreDocs,
  SAMPLE_AUTH_MESSAGES,
  SAMPLE_FIREBASE_ERRORS as FirebaseErrors,
  FirebaseFixtures as Firebase,
} from './firebase'

// Combined test data collections
export const TestData = {
  // Blockchain data
  addresses: {
    poolOwners: [
      '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
      '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
      '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    ],
    borrowers: [
      '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
      '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
      '0x976EA74026E726554dB657fA54763abd0C3a0aa9',
    ],
    lenders: [
      '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955',
      '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f',
      '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',
    ],
    safeOwners: [
      '0xBcd4042DE499D14e55001CcbB24a551F3b954096',
      '0x71bE63f3384f5fb98995898A86B02Fb2426c5788',
      '0xFABB0ac9d68B0B445fB7357272Ff202C5651694a',
      '0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec',
      '0xdF3e18d64BC6A983f673Ab319CCaE4f1a57C7097',
    ],
    contracts: {
      poolFactory: '0x1234567890123456789012345678901234567890',
      safe: '0x9876543210987654321098765432109876543210',
    },
    invalid: {
      zero: '0x0000000000000000000000000000000000000000',
      malformed: '0xinvalid',
      wrongChecksum: '0x742d35cc6670c74288c2e768dc1e574a0b7dbe7a',
    },
  },

  // Firebase Auth data
  users: {
    poolOwner: {
      uid: 'pool-owner-1',
      email: 'poolowner1@superpool.test',
      walletAddress: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
      role: 'pool_owner',
    },
    borrower: {
      uid: 'borrower-1',
      email: 'borrower1@superpool.test',
      walletAddress: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
      role: 'borrower',
    },
    lender: {
      uid: 'lender-1',
      email: 'lender1@superpool.test',
      walletAddress: '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955',
      role: 'lender',
    },
    safeOwner: {
      uid: 'safe-owner-1',
      email: 'safeowner1@superpool.test',
      walletAddress: '0xBcd4042DE499D14e55001CcbB24a551F3b954096',
      role: 'safe_owner',
      isAdmin: true,
    },
  },

  // Pool configurations
  pools: {
    basic: {
      maxLoanAmount: '1000', // ETH
      interestRate: 500, // 5%
      loanDuration: 2592000, // 30 days
      name: 'Basic Lending Pool',
    },
    highInterest: {
      maxLoanAmount: '500', // ETH
      interestRate: 1200, // 12%
      loanDuration: 1296000, // 15 days
      name: 'High Interest Short Term Pool',
    },
    enterprise: {
      maxLoanAmount: '10000', // ETH
      interestRate: 300, // 3%
      loanDuration: 7776000, // 90 days
      name: 'Large Enterprise Pool',
    },
    micro: {
      maxLoanAmount: '10', // ETH
      interestRate: 800, // 8%
      loanDuration: 604800, // 7 days
      name: 'Micro Lending Pool',
    },
  },

  // Network configurations
  networks: {
    local: {
      chainId: 31337,
      name: 'localhost',
      rpcUrl: 'http://127.0.0.1:8545',
      gasPrice: '20000000000', // 20 Gwei
    },
    amoy: {
      chainId: 80002,
      name: 'polygon-amoy',
      rpcUrl: 'https://rpc-amoy.polygon.technology',
      gasPrice: '30000000000', // 30 Gwei
    },
    polygon: {
      chainId: 137,
      name: 'polygon',
      rpcUrl: 'https://polygon-rpc.com',
      gasPrice: '50000000000', // 50 Gwei
    },
  },

  // Common error scenarios
  errors: {
    blockchain: {
      revert: 'execution reverted: Invalid pool owner',
      outOfGas: 'out of gas',
      networkError: 'could not detect network',
      insufficientFunds: 'insufficient funds for transfer',
    },
    firebase: {
      unauthenticated: 'Authentication required',
      permissionDenied: 'Missing or insufficient permissions',
      notFound: 'The document does not exist',
      alreadyExists: 'The document already exists',
      unavailable: 'The service is currently unavailable',
    },
    validation: {
      invalidAddress: 'Invalid Ethereum address format',
      invalidAmount: 'Amount must be greater than 0',
      invalidRate: 'Interest rate must be between 0 and 100%',
      invalidDuration: 'Duration must be at least 1 hour',
      missingField: 'Required field is missing',
    },
  },
}

// Test utilities and helpers
export const TestHelpers = {
  /**
   * Wait for a specified amount of time
   */
  wait: (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms)),

  /**
   * Create a random test identifier
   */
  randomId: (prefix: string = 'test'): string => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,

  /**
   * Create a timestamp for testing
   */
  timestamp: (offsetMs: number = 0): number => Date.now() + offsetMs,

  /**
   * Create a future date
   */
  futureDate: (offsetMs: number = 600000): Date => new Date(Date.now() + offsetMs), // Default 10 minutes

  /**
   * Create a past date
   */
  pastDate: (offsetMs: number = 600000): Date => new Date(Date.now() - offsetMs), // Default 10 minutes ago

  /**
   * Validate Ethereum address format
   */
  isValidAddress: (address: string): boolean => /^0x[a-fA-F0-9]{40}$/.test(address),

  /**
   * Validate transaction hash format
   */
  isValidTxHash: (hash: string): boolean => /^0x[a-fA-F0-9]{64}$/.test(hash),

  /**
   * Convert ETH to wei
   */
  ethToWei: (eth: string | number): string => {
    const ethValue = typeof eth === 'string' ? parseFloat(eth) : eth
    return (ethValue * 1e18).toString()
  },

  /**
   * Convert wei to ETH
   */
  weiToEth: (wei: string | bigint): string => {
    const weiValue = typeof wei === 'string' ? BigInt(wei) : wei
    return (Number(weiValue) / 1e18).toString()
  },

  /**
   * Create deterministic test data based on seed
   */
  deterministicData: (seed: string, type: 'address' | 'hash' | 'number'): string => {
    let hash = 0
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash + seed.charCodeAt(i)) & 0xffffffff
    }

    const positiveHash = Math.abs(hash)

    switch (type) {
      case 'address':
        return '0x' + positiveHash.toString(16).padStart(40, '0')
      case 'hash':
        return '0x' + positiveHash.toString(16).padStart(64, '0')
      case 'number':
        return positiveHash.toString()
      default:
        return positiveHash.toString()
    }
  },

  /**
   * Create a complete test scenario with all necessary data
   */
  createScenario: (name: string) => ({
    id: TestHelpers.randomId(name),
    timestamp: TestHelpers.timestamp(),
    user: TestData.users.poolOwner,
    pool: TestData.pools.basic,
    network: TestData.networks.local,
    addresses: {
      owner: TestData.addresses.poolOwners[0],
      borrower: TestData.addresses.borrowers[0],
      lender: TestData.addresses.lenders[0],
    },
  }),
}

// Export everything as default for easy importing
export default {
  TestData,
  TestHelpers,
}
