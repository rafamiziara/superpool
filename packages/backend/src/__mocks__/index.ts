/**
 * Mock System Index
 *
 * Central export point for the entire SuperPool backend mock system.
 * This provides a unified interface for accessing all mocks, fixtures,
 * and testing utilities.
 */

// Export core mock classes
export { FirebaseAdminMock, firebaseAdminMock } from './firebase/FirebaseAdminMock'
export { EthersMock, ethersMock } from './blockchain/EthersMock'
export { ContractMock } from './blockchain/ContractMock'

// Export test utilities
export { CloudFunctionTester } from '../__tests__/utils/CloudFunctionTester'
export { BlockchainTestEnvironment } from '../__tests__/utils/BlockchainTestEnvironment'

// Export all fixtures and test data
export * from './fixtures'
export { default as TestFixtures } from './fixtures'

// Export specific commonly used fixtures
export { SAMPLE_SAFE_EXECUTION_DATA, SAMPLE_SAFE_TRANSACTIONS, SAMPLE_TRANSACTION_HASHES, SAMPLE_AUTH_MESSAGES } from './fixtures'
export { FirebaseFixtures as Firebase } from './fixtures/firebase'

// Import the required modules for internal use
import { firebaseAdminMock } from './firebase/FirebaseAdminMock'
import { ethersMock } from './blockchain/EthersMock'
import { ContractMock } from './blockchain/ContractMock'
import { CloudFunctionTester } from '../__tests__/utils/CloudFunctionTester'
import { BlockchainTestEnvironment } from '../__tests__/utils/BlockchainTestEnvironment'
import TestFixtures, {
  SAMPLE_AUTH_MESSAGES,
  SAMPLE_SAFE_EXECUTION_DATA,
  SAMPLE_SAFE_TRANSACTIONS,
  SAMPLE_TRANSACTION_HASHES,
} from './fixtures'
import { FirebaseFixtures } from './fixtures/firebase'

// Export types
export type { MockFirestoreDocument, MockFirestoreCollection } from './firebase/FirebaseAdminMock'

export type { MockTransactionResponse, MockTransactionReceipt } from './blockchain/EthersMock'

export type { PoolCreatedEvent, SafeTransactionData } from './blockchain/ContractMock'

export type { TestCallableRequest, MockHttpsError, CloudFunctionTestOptions } from '../__tests__/utils/CloudFunctionTester'

export type { ChainConfig, ContractConfig, TestWalletConfig, BlockchainTestOptions } from '../__tests__/utils/BlockchainTestEnvironment'

// Convenience mock factory for common testing patterns
export class MockFactory {
  /**
   * Create a complete mock environment for Cloud Function testing
   */
  static createCloudFunctionEnvironment(
    options: {
      withAuth?: boolean
      withFirestore?: boolean
      withContracts?: boolean
      chainName?: string
    } = {}
  ) {
    const { withAuth = true, withFirestore = true, withContracts = true, chainName = 'local' } = options

    const environment = {
      functionTester: new CloudFunctionTester(),
      mocks: {} as any,
      fixtures: TestFixtures,
    }

    if (withAuth || withFirestore) {
      environment.mocks.firebase = firebaseAdminMock
      firebaseAdminMock.resetAllMocks()
    }

    if (withContracts) {
      environment.mocks.blockchain = BlockchainTestEnvironment.getInstance({ chainName })
      environment.mocks.ethers = ethersMock
      ethersMock.resetAllMocks()
    }

    return environment
  }

  /**
   * Create a pool creation test scenario with all necessary mocks
   */
  static createPoolCreationScenario(poolParams?: any, userUid?: string) {
    const environment = this.createCloudFunctionEnvironment()

    const defaultParams = TestFixtures.TestData.pools.basic
    const params = { ...defaultParams, ...poolParams }
    const uid = userUid || TestFixtures.TestData.users.poolOwner.uid

    // Setup user
    environment.mocks.firebase.seedUser({
      uid,
      email: TestFixtures.TestData.users.poolOwner.email,
      customClaims: { walletAddress: params.poolOwner || TestFixtures.TestData.addresses.poolOwners[0] },
    })

    // Create authenticated request
    const request = environment.functionTester.createAuthenticatedRequest(params, uid)

    // Setup successful Firestore operations
    environment.mocks.firebase.firestore.collection('pools').doc().set.mockResolvedValue(undefined)

    // Setup contract mock
    const poolFactory = ContractMock.createPoolFactoryMock()
    environment.mocks.poolFactory = poolFactory

    return {
      ...environment,
      request,
      params,
      uid,
      poolFactory,
    }
  }

  /**
   * Create a Safe multi-sig test scenario
   */
  static createSafeTransactionScenario(txParams?: any, safeOwnerUid?: string) {
    const environment = this.createCloudFunctionEnvironment()

    const defaultParams = SAMPLE_SAFE_TRANSACTIONS.POOL_CREATION_TX
    const params = { ...defaultParams, ...txParams }
    const uid = safeOwnerUid || TestFixtures.TestData.users.safeOwner.uid

    // Setup Safe owner
    environment.mocks.firebase.seedUser({
      uid,
      email: TestFixtures.TestData.users.safeOwner.email,
      customClaims: {
        walletAddress: TestFixtures.TestData.addresses.safeOwners[0],
        isAdmin: true,
      },
    })

    // Create authenticated request
    const request = environment.functionTester.createAuthenticatedRequest(params, uid)

    // Setup Safe contract mock
    const safeContract = ContractMock.createSafeMock()
    environment.mocks.safeContract = safeContract

    // Setup Firestore for Safe transactions
    environment.mocks.firebase.firestore.collection('safe_transactions').doc().set.mockResolvedValue(undefined)

    return {
      ...environment,
      request,
      params,
      uid,
      safeContract,
    }
  }

  /**
   * Create an authentication test scenario
   */
  static createAuthenticationScenario(walletAddress?: string) {
    const environment = this.createCloudFunctionEnvironment()

    const address = walletAddress || TestFixtures.TestData.addresses.poolOwners[0]

    // Create nonce
    const nonce = FirebaseFixtures.createNonce(address)
    environment.mocks.firebase.seedDocument(`auth_nonces/${nonce.nonce}`, nonce)

    // Create auth message
    const message = SAMPLE_AUTH_MESSAGES.VALID_MESSAGE(address, nonce.nonce, nonce.timestamp)

    return {
      ...environment,
      walletAddress: address,
      nonce: nonce.nonce,
      timestamp: nonce.timestamp,
      message,
    }
  }

  /**
   * Reset all mocks to clean state
   */
  static resetAllMocks() {
    firebaseAdminMock.resetAllMocks()
    ethersMock.resetAllMocks()
    ContractMock.reset()
  }

  /**
   * Create error scenarios for testing error handling
   */
  static createErrorScenarios() {
    return {
      firebase: {
        unavailable: () => firebaseAdminMock.simulateFirestoreError('unavailable'),
        permissionDenied: () => firebaseAdminMock.simulateFirestoreError('permission-denied'),
        authExpired: () => firebaseAdminMock.simulateAuthError('auth/id-token-expired'),
      },

      blockchain: {
        networkError: () => ethersMock.simulateNetworkError('Network connection failed'),
        contractRevert: (reason?: string) => ethersMock.simulateContractRevert(reason),
        transactionFailure: () => ethersMock.simulateTransactionFailure(),
      },

      restore: () => {
        firebaseAdminMock.restoreNormalOperation()
        ethersMock.restoreNormalOperation()
      },
    }
  }
}

// Export a pre-configured mock environment for common use cases
export const MockEnvironment = {
  /**
   * Standard test environment with all mocks enabled
   */
  standard: MockFactory.createCloudFunctionEnvironment({
    withAuth: true,
    withFirestore: true,
    withContracts: true,
  }),

  /**
   * Firebase-only environment for Cloud Function testing
   */
  firebaseOnly: MockFactory.createCloudFunctionEnvironment({
    withAuth: true,
    withFirestore: true,
    withContracts: false,
  }),

  /**
   * Blockchain-only environment for contract testing
   */
  blockchainOnly: MockFactory.createCloudFunctionEnvironment({
    withAuth: false,
    withFirestore: false,
    withContracts: true,
  }),

  /**
   * Reset all environments
   */
  reset: () => MockFactory.resetAllMocks(),
}

// Export convenience functions for quick test setup
export const quickSetup = {
  /**
   * Quick pool creation test setup
   */
  poolCreation: (params?: any, uid?: string) => MockFactory.createPoolCreationScenario(params, uid),

  /**
   * Quick Safe transaction test setup
   */
  safeTransaction: (params?: any, uid?: string) => MockFactory.createSafeTransactionScenario(params, uid),

  /**
   * Quick authentication test setup
   */
  authentication: (walletAddress?: string) => MockFactory.createAuthenticationScenario(walletAddress),

  /**
   * Quick error testing setup
   */
  errors: () => MockFactory.createErrorScenarios(),
}

export default {
  MockFactory,
  MockEnvironment,
  quickSetup,
}
