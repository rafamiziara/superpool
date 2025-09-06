# SuperPool Backend Mock System Documentation

## 🎯 **Centralized Mock Architecture for Firebase & Blockchain**

Our backend mock system provides consistent, maintainable mocks for Firebase Cloud Functions and blockchain integration testing. This system ensures test reliability while maintaining development velocity for complex serverless and Web3 scenarios.

### **Mock System Philosophy**

- **Centralized Control**: Single source of truth for all mock configurations
- **Realistic Behavior**: Mocks simulate actual Firebase/blockchain behavior patterns
- **Test Isolation**: Each test runs with clean, predictable mock state
- **Performance First**: Fast mock responses for rapid test execution
- **Error Simulation**: Comprehensive error scenario coverage

---

## 📦 **Mock Architecture Overview**

### **Directory Structure**

```
src/
├── __mocks__/
│   ├── index.ts                    # Mock registry and factory
│   ├── firebase/
│   │   ├── FirebaseAdminMock.ts    # Admin SDK mocking
│   │   ├── FirestoreMock.ts        # Firestore operations
│   │   ├── AuthMock.ts             # Firebase Auth mocking
│   │   └── FunctionsMock.ts        # Cloud Functions context
│   ├── blockchain/
│   │   ├── EthersMock.ts           # Ethers.js provider/signer
│   │   ├── ContractMock.ts         # Smart contract interactions
│   │   ├── ProviderMock.ts         # RPC provider mocking
│   │   └── SafeMock.ts             # Safe multi-sig mocking
│   ├── external/
│   │   ├── ApiMock.ts              # External API mocking
│   │   └── NetworkMock.ts          # Network request mocking
│   └── fixtures/
│       ├── blockchain.ts           # Blockchain test data
│       ├── firebase.ts             # Firebase test data
│       └── contracts.ts            # Contract test data
```

---

## 🔥 **Firebase Mock System**

### **FirebaseAdminMock Configuration**

```typescript
// src/__mocks__/firebase/FirebaseAdminMock.ts
import { jest } from '@jest/globals'
import type { App, ServiceAccount, AppOptions } from 'firebase-admin/app'
import type { Auth } from 'firebase-admin/auth'
import type { Firestore } from 'firebase-admin/firestore'

export class FirebaseAdminMock {
  private static instance: FirebaseAdminMock

  // Mock instances
  public app: jest.Mocked<App>
  public auth: jest.Mocked<Auth>
  public firestore: jest.Mocked<Firestore>

  constructor() {
    this.initializeAppMock()
    this.initializeAuthMock()
    this.initializeFirestoreMock()
  }

  static getInstance(): FirebaseAdminMock {
    if (!FirebaseAdminMock.instance) {
      FirebaseAdminMock.instance = new FirebaseAdminMock()
    }
    return FirebaseAdminMock.instance
  }

  private initializeAppMock(): void {
    this.app = {
      name: '[DEFAULT]',
      options: {} as AppOptions,
      delete: jest.fn().mockResolvedValue(undefined),
    } as jest.Mocked<App>
  }

  private initializeAuthMock(): void {
    this.auth = {
      // User management
      getUser: jest.fn(),
      getUserByEmail: jest.fn(),
      createUser: jest.fn(),
      updateUser: jest.fn(),
      deleteUser: jest.fn(),

      // Token verification
      verifyIdToken: jest.fn(),
      createCustomToken: jest.fn(),

      // User listing
      listUsers: jest.fn(),

      // Default successful auth responses
      verifyIdToken: jest.fn().mockResolvedValue({
        uid: 'test-user-id',
        email: 'test@example.com',
        email_verified: true,
        aud: 'test-project-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        iss: 'https://securetoken.google.com/test-project-id',
        sub: 'test-user-id',
      }),

      createCustomToken: jest.fn().mockResolvedValue('mock-custom-token'),
    } as unknown as jest.Mocked<Auth>
  }

  private initializeFirestoreMock(): void {
    const mockDoc = {
      id: 'mock-doc-id',
      ref: {} as any,
      exists: true,
      data: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    }

    const mockCollection = {
      doc: jest.fn().mockReturnValue(mockDoc),
      add: jest.fn(),
      get: jest.fn(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
    }

    this.firestore = {
      // Collection operations
      collection: jest.fn().mockReturnValue(mockCollection),
      doc: jest.fn().mockReturnValue(mockDoc),

      // Batch operations
      batch: jest.fn().mockReturnValue({
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        commit: jest.fn().mockResolvedValue([]),
      }),

      // Transaction operations
      runTransaction: jest.fn(),

      // Utility methods
      getAll: jest.fn(),
      listCollections: jest.fn(),

      // Timestamps
      FieldValue: {
        serverTimestamp: jest.fn().mockReturnValue('MOCK_SERVER_TIMESTAMP'),
        delete: jest.fn().mockReturnValue('MOCK_DELETE'),
        increment: jest.fn((value) => `MOCK_INCREMENT_${value}`),
        arrayUnion: jest.fn((values) => `MOCK_ARRAY_UNION_${JSON.stringify(values)}`),
        arrayRemove: jest.fn((values) => `MOCK_ARRAY_REMOVE_${JSON.stringify(values)}`),
      },

      // Default collection behavior
      collection: jest.fn((name: string) => ({
        ...mockCollection,
        id: name,
        path: name,
      })),
    } as unknown as jest.Mocked<Firestore>
  }

  // Test utilities
  resetAllMocks(): void {
    jest.clearAllMocks()
    // Reset to default behaviors
    this.initializeAuthMock()
    this.initializeFirestoreMock()
  }

  // Simulate Firebase errors
  simulateFirestoreError(errorCode: string = 'unavailable'): void {
    const error = new Error(`Simulated Firestore error: ${errorCode}`)
    error.code = errorCode

    this.firestore.collection = jest.fn().mockRejectedValue(error)
    this.firestore.doc = jest.fn().mockRejectedValue(error)
  }

  simulateAuthError(errorCode: string = 'invalid-argument'): void {
    const error = new Error(`Simulated Auth error: ${errorCode}`)
    error.code = errorCode

    this.auth.verifyIdToken = jest.fn().mockRejectedValue(error)
  }
}

// Global mock instance
export const firebaseAdminMock = FirebaseAdminMock.getInstance()

// Jest mock setup
jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn().mockReturnValue(firebaseAdminMock.app),
  getApps: jest.fn().mockReturnValue([firebaseAdminMock.app]),
  deleteApp: jest.fn(),
  cert: jest.fn(),
}))

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn().mockReturnValue(firebaseAdminMock.auth),
}))

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn().mockReturnValue(firebaseAdminMock.firestore),
  FieldValue: firebaseAdminMock.firestore.FieldValue,
  Timestamp: {
    now: jest.fn().mockReturnValue({ seconds: 1234567890, nanoseconds: 0 }),
    fromDate: jest.fn(),
  },
}))
```

### **Cloud Functions Context Mock**

```typescript
// src/__mocks__/firebase/FunctionsMock.ts
import { jest } from '@jest/globals'
import type { CallableRequest, HttpsError, CallableContext } from 'firebase-functions/v2/https'

export interface MockCallableRequest<T = any> extends Partial<CallableRequest<T>> {
  data: T
  auth?: {
    uid: string
    token?: any
  }
  app?: any
  rawRequest?: any
}

export class FunctionsMock {
  // Create mock CallableRequest
  static createCallableRequest<T>(data: T, uid?: string, options?: Partial<CallableRequest<T>>): CallableRequest<T> {
    return {
      data,
      auth: uid
        ? {
            uid,
            token: {
              firebase: {
                identities: {},
                sign_in_provider: 'wallet',
              },
              uid,
            },
          }
        : null,
      app: undefined,
      rawRequest: {
        headers: {
          'content-type': 'application/json',
          'user-agent': 'firebase-admin-node',
        },
        method: 'POST',
      },
      ...options,
    } as CallableRequest<T>
  }

  // Create mock HttpsError
  static createHttpsError(code: string, message: string, details?: any): HttpsError {
    const error = new Error(message) as any
    error.code = code
    error.details = details
    error.httpErrorCode = this.getHttpErrorCode(code)
    return error as HttpsError
  }

  private static getHttpErrorCode(code: string): number {
    const errorCodes: Record<string, number> = {
      'invalid-argument': 400,
      'failed-precondition': 400,
      'out-of-range': 400,
      unauthenticated: 401,
      'permission-denied': 403,
      'not-found': 404,
      'already-exists': 409,
      'resource-exhausted': 429,
      cancelled: 499,
      'data-loss': 500,
      unknown: 500,
      internal: 500,
      'not-implemented': 501,
      unavailable: 503,
      'deadline-exceeded': 504,
    }
    return errorCodes[code] || 500
  }

  // Mock Firebase Functions environment
  static setupFunctionsEnvironment(): void {
    process.env.FUNCTIONS_EMULATOR = 'true'
    process.env.GCLOUD_PROJECT = 'test-project-id'
    process.env.FIREBASE_CONFIG = JSON.stringify({
      projectId: 'test-project-id',
      storageBucket: 'test-project-id.appspot.com',
    })
  }

  // Reset Functions environment
  static resetFunctionsEnvironment(): void {
    delete process.env.FUNCTIONS_EMULATOR
    delete process.env.GCLOUD_PROJECT
    delete process.env.FIREBASE_CONFIG
  }
}

// Mock firebase-functions/v2/https
jest.mock('firebase-functions/v2/https', () => ({
  onCall: jest.fn((options, handler) => handler),
  HttpsError: jest
    .fn()
    .mockImplementation((code: string, message: string, details?: any) => FunctionsMock.createHttpsError(code, message, details)),
}))
```

---

## ⛓️ **Blockchain Mock System**

### **Ethers.js Mock Configuration**

```typescript
// src/__mocks__/blockchain/EthersMock.ts
import { jest } from '@jest/globals'
import type { JsonRpcProvider, Wallet, Contract, TransactionResponse, TransactionReceipt, Block } from 'ethers'

export class EthersMock {
  private static instance: EthersMock

  // Mock instances
  public provider: jest.Mocked<JsonRpcProvider>
  public wallet: jest.Mocked<Wallet>
  public contract: jest.Mocked<Contract>

  constructor() {
    this.initializeProviderMock()
    this.initializeWalletMock()
    this.initializeContractMock()
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
      getNetwork: jest.fn().mockResolvedValue({
        chainId: 80002,
        name: 'polygon-amoy',
      }),

      // Block information
      getBlock: jest.fn().mockResolvedValue({
        number: 1234567,
        hash: '0x1234567890abcdef',
        timestamp: Math.floor(Date.now() / 1000),
        transactions: [],
      } as Block),

      getBlockNumber: jest.fn().mockResolvedValue(1234567),

      // Transaction operations
      getTransaction: jest.fn().mockResolvedValue({
        hash: '0xabcdef1234567890',
        from: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
        to: '0x1234567890123456789012345678901234567890',
        value: BigInt('1000000000000000000'), // 1 ETH
        gasLimit: BigInt('21000'),
        gasPrice: BigInt('20000000000'), // 20 Gwei
        nonce: 42,
        blockNumber: 1234567,
        blockHash: '0x1234567890abcdef',
      } as TransactionResponse),

      getTransactionReceipt: jest.fn().mockResolvedValue({
        transactionHash: '0xabcdef1234567890',
        blockNumber: 1234567,
        blockHash: '0x1234567890abcdef',
        transactionIndex: 0,
        gasUsed: BigInt('21000'),
        effectiveGasPrice: BigInt('20000000000'),
        status: 1, // Success
        logs: [],
      } as TransactionReceipt),

      // Account information
      getBalance: jest.fn().mockResolvedValue(BigInt('1000000000000000000')), // 1 ETH
      getTransactionCount: jest.fn().mockResolvedValue(42),

      // Gas estimation
      estimateGas: jest.fn().mockResolvedValue(BigInt('21000')),

      // Event filtering
      getLogs: jest.fn().mockResolvedValue([]),

      // Utility methods
      resolveName: jest.fn(),
      lookupAddress: jest.fn(),
    } as unknown as jest.Mocked<JsonRpcProvider>
  }

  private initializeWalletMock(): void {
    this.wallet = {
      // Wallet properties
      address: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
      privateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
      provider: this.provider,

      // Signing methods
      signMessage: jest
        .fn()
        .mockResolvedValue(
          '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678901234567890abcdef1234567890abcdef1234567890abcdef123456789012'
        ),

      signTransaction: jest
        .fn()
        .mockResolvedValue(
          '0xf86c42850ba43b7400825208941234567890123456789012345678901234567890880de0b6b3a76400008025a01234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12a01234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12'
        ),

      // Transaction sending
      sendTransaction: jest.fn().mockResolvedValue({
        hash: '0xabcdef1234567890',
        from: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
        wait: jest.fn().mockResolvedValue({
          transactionHash: '0xabcdef1234567890',
          status: 1,
          gasUsed: BigInt('21000'),
        } as TransactionReceipt),
      } as TransactionResponse),

      // Connection
      connect: jest.fn().mockReturnThis(),

      // Utility methods
      encrypt: jest.fn(),
    } as unknown as jest.Mocked<Wallet>
  }

  private initializeContractMock(): void {
    this.contract = {
      // Contract properties
      target: '0x1234567890123456789012345678901234567890',
      interface: {} as any,
      provider: this.provider,
      runner: this.wallet,

      // Contract methods (these will be overridden for specific contracts)
      getFunction: jest.fn(),

      // Event filtering
      queryFilter: jest.fn().mockResolvedValue([]),
      on: jest.fn(),
      off: jest.fn(),

      // Gas estimation
      estimateGas: {
        // Generic method that can be extended for specific contract functions
        getFunction: jest.fn().mockReturnValue(jest.fn().mockResolvedValue(BigInt('100000'))),
      },

      // Static calls (view functions)
      // These will be populated based on specific contract interfaces

      // Transaction methods
      // These will be populated based on specific contract interfaces

      // Connection
      connect: jest.fn().mockReturnThis(),
    } as unknown as jest.Mocked<Contract>
  }

  // Test utilities
  resetAllMocks(): void {
    jest.clearAllMocks()
    this.initializeProviderMock()
    this.initializeWalletMock()
    this.initializeContractMock()
  }

  // Simulate blockchain errors
  simulateNetworkError(errorMessage: string = 'Network error'): void {
    const error = new Error(errorMessage)
    error.code = 'NETWORK_ERROR'

    this.provider.getNetwork = jest.fn().mockRejectedValue(error)
    this.provider.getBlock = jest.fn().mockRejectedValue(error)
    this.provider.getTransaction = jest.fn().mockRejectedValue(error)
  }

  simulateTransactionFailure(): void {
    this.wallet.sendTransaction = jest.fn().mockResolvedValue({
      hash: '0xfailedtx123456789',
      wait: jest.fn().mockResolvedValue({
        status: 0, // Failed
        gasUsed: BigInt('21000'),
      } as TransactionReceipt),
    } as TransactionResponse)
  }

  simulateContractRevert(reason: string = 'execution reverted'): void {
    const revertError = new Error(`execution reverted: ${reason}`)
    revertError.code = 'CALL_EXCEPTION'

    // Mock contract call failures
    this.contract.getFunction = jest.fn().mockReturnValue(jest.fn().mockRejectedValue(revertError))
  }
}

// Global mock instance
export const ethersMock = EthersMock.getInstance()

// Jest mock setup for ethers
jest.mock('ethers', () => ({
  // Provider
  JsonRpcProvider: jest.fn().mockImplementation(() => ethersMock.provider),

  // Wallet
  Wallet: jest.fn().mockImplementation(() => ethersMock.wallet),

  // Contract
  Contract: jest.fn().mockImplementation(() => ethersMock.contract),

  // Utilities
  parseEther: jest.fn((value: string) => BigInt(parseFloat(value) * 1e18)),
  formatEther: jest.fn((value: bigint) => (Number(value) / 1e18).toString()),
  parseUnits: jest.fn((value: string, decimals: number) => BigInt(parseFloat(value) * Math.pow(10, decimals))),
  formatUnits: jest.fn((value: bigint, decimals: number) => (Number(value) / Math.pow(10, decimals)).toString()),

  // Addresses
  isAddress: jest.fn((address: string) => /^0x[a-fA-F0-9]{40}$/.test(address)),
  getAddress: jest.fn((address: string) => address.toLowerCase()),

  // Hashing
  keccak256: jest.fn((data: string) => '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12'),
  solidityPackedKeccak256: jest.fn(() => '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12'),

  // Encoding
  AbiCoder: jest.fn().mockImplementation(() => ({
    encode: jest.fn().mockReturnValue('0x1234567890abcdef'),
    decode: jest.fn().mockReturnValue(['decoded', 'values']),
  })),

  // Constants
  ZeroAddress: '0x0000000000000000000000000000000000000000',
  MaxUint256: BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'),
}))
```

### **Smart Contract Mock System**

```typescript
// src/__mocks__/blockchain/ContractMock.ts
import { jest } from '@jest/globals'
import { ethersMock } from './EthersMock'

export interface PoolCreatedEvent {
  poolId: bigint
  poolAddress: string
  poolOwner: string
  name: string
  maxLoanAmount: bigint
  interestRate: number
  loanDuration: number
}

export class ContractMock {
  // Pool Factory Contract Mock
  static createPoolFactoryMock() {
    const poolFactoryMock = {
      ...ethersMock.contract,
      target: '0x1234567890123456789012345678901234567890',

      // Read methods
      poolCount: jest.fn().mockResolvedValue(BigInt('3')),
      pools: jest.fn().mockImplementation((poolId: bigint) => {
        // Return mock pool data based on poolId
        return Promise.resolve({
          owner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
          poolAddress: `0x${poolId.toString().padStart(40, '0')}`,
          name: `Pool ${poolId}`,
          maxLoanAmount: BigInt('1000000000000000000000'), // 1000 ETH
          interestRate: 500, // 5%
          loanDuration: 2592000, // 30 days
          isActive: true,
        })
      }),

      // Owner management
      owner: jest.fn().mockResolvedValue('0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a'),
      pendingOwner: jest.fn().mockResolvedValue('0x0000000000000000000000000000000000000000'),

      // Write methods
      createPool: jest
        .fn()
        .mockImplementation((poolOwner: string, maxLoanAmount: bigint, interestRate: number, loanDuration: number, name: string) => {
          const newPoolId = BigInt('4') // Next pool ID

          return Promise.resolve({
            hash: '0xabcdef1234567890abcdef1234567890abcdef12',
            wait: jest.fn().mockResolvedValue({
              transactionHash: '0xabcdef1234567890abcdef1234567890abcdef12',
              blockNumber: 1234567,
              status: 1,
              gasUsed: BigInt('500000'),
              logs: [
                {
                  address: '0x1234567890123456789012345678901234567890',
                  topics: [
                    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12', // PoolCreated event signature
                    `0x000000000000000000000000000000000000000000000000000000000000000${newPoolId.toString(16)}`, // poolId
                  ],
                  data: '0x...', // Encoded event data
                },
              ],
              events: [
                {
                  event: 'PoolCreated',
                  args: {
                    poolId: newPoolId,
                    poolAddress: `0x${newPoolId.toString().padStart(40, '0')}`,
                    poolOwner,
                    name,
                    maxLoanAmount,
                    interestRate,
                    loanDuration,
                  },
                },
              ],
            }),
          })
        }),

      transferOwnership: jest.fn().mockResolvedValue({
        hash: '0xownership123456789',
        wait: jest.fn().mockResolvedValue({
          status: 1,
          gasUsed: BigInt('50000'),
        }),
      }),

      acceptOwnership: jest.fn().mockResolvedValue({
        hash: '0xaccept123456789',
        wait: jest.fn().mockResolvedValue({
          status: 1,
          gasUsed: BigInt('50000'),
        }),
      }),

      // Emergency functions
      pause: jest.fn().mockResolvedValue({
        hash: '0xpause123456789',
        wait: jest.fn().mockResolvedValue({ status: 1 }),
      }),

      unpause: jest.fn().mockResolvedValue({
        hash: '0xunpause123456789',
        wait: jest.fn().mockResolvedValue({ status: 1 }),
      }),

      paused: jest.fn().mockResolvedValue(false),

      // Gas estimation
      estimateGas: {
        createPool: jest.fn().mockResolvedValue(BigInt('500000')),
        transferOwnership: jest.fn().mockResolvedValue(BigInt('50000')),
        acceptOwnership: jest.fn().mockResolvedValue(BigInt('50000')),
        pause: jest.fn().mockResolvedValue(BigInt('30000')),
        unpause: jest.fn().mockResolvedValue(BigInt('30000')),
      },

      // Event filtering
      queryFilter: jest.fn().mockImplementation((eventName: string) => {
        if (eventName === 'PoolCreated') {
          return Promise.resolve([
            {
              event: 'PoolCreated',
              args: {
                poolId: BigInt('1'),
                poolAddress: '0x0000000000000000000000000000000000000001',
                poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
                name: 'Test Pool 1',
                maxLoanAmount: BigInt('1000000000000000000000'),
                interestRate: 500,
                loanDuration: 2592000,
              },
              blockNumber: 1234567,
              transactionHash: '0xevent123456789',
            },
          ])
        }
        return Promise.resolve([])
      }),
    }

    return poolFactoryMock
  }

  // Safe Contract Mock
  static createSafeMock() {
    const safeMock = {
      ...ethersMock.contract,
      target: '0x9876543210987654321098765432109876543210',

      // Safe read methods
      getOwners: jest
        .fn()
        .mockResolvedValue([
          '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
          '0x1234567890123456789012345678901234567890',
          '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        ]),

      getThreshold: jest.fn().mockResolvedValue(BigInt('2')),

      isOwner: jest.fn().mockImplementation((address: string) => {
        const owners = [
          '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
          '0x1234567890123456789012345678901234567890',
          '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        ]
        return Promise.resolve(owners.includes(address))
      }),

      nonce: jest.fn().mockResolvedValue(BigInt('42')),

      // Safe transaction methods
      getTransactionHash: jest
        .fn()
        .mockImplementation(() => Promise.resolve('0xsafetx123456789abcdef123456789abcdef123456789abcdef123456789abcdef12')),

      checkSignatures: jest.fn().mockResolvedValue(true),

      execTransaction: jest.fn().mockResolvedValue({
        hash: '0xsafeexec123456789',
        wait: jest.fn().mockResolvedValue({
          status: 1,
          gasUsed: BigInt('200000'),
          logs: [],
        }),
      }),

      // Gas estimation
      estimateGas: {
        execTransaction: jest.fn().mockResolvedValue(BigInt('200000')),
      },
    }

    return safeMock
  }

  // Generic contract factory
  static createContractMock(address: string, customMethods: any = {}) {
    return {
      ...ethersMock.contract,
      target: address,
      ...customMethods,
    }
  }
}
```

---

## 🧪 **Mock Usage Patterns**

### **Basic Test Setup**

```typescript
// Example: Testing createPool Cloud Function
import { jest, describe, beforeEach, afterEach, it, expect } from '@jest/globals'
import { firebaseAdminMock } from '../__mocks__/firebase/FirebaseAdminMock'
import { ethersMock } from '../__mocks__/blockchain/EthersMock'
import { ContractMock } from '../__mocks__/blockchain/ContractMock'
import { FunctionsMock } from '../__mocks__/firebase/FunctionsMock'

// Import function under test
import { createPoolHandler } from '../functions/pools/createPool'

describe('createPool Cloud Function', () => {
  let poolFactoryMock: any

  beforeEach(() => {
    // Setup Functions environment
    FunctionsMock.setupFunctionsEnvironment()

    // Reset all mocks
    firebaseAdminMock.resetAllMocks()
    ethersMock.resetAllMocks()

    // Setup contract mocks
    poolFactoryMock = ContractMock.createPoolFactoryMock()

    // Mock successful Firestore operations
    firebaseAdminMock.firestore.collection('pools').doc().set.mockResolvedValue(undefined)
  })

  afterEach(() => {
    FunctionsMock.resetFunctionsEnvironment()
  })

  it('should create pool successfully with valid parameters', async () => {
    // Arrange
    const validRequest = FunctionsMock.createCallableRequest(
      {
        poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
        maxLoanAmount: '1000',
        interestRate: 500,
        loanDuration: 2592000,
        name: 'Test Pool',
        description: 'Test pool description',
      },
      'test-user-id'
    )

    // Act
    const result = await createPoolHandler(validRequest)

    // Assert
    expect(result.success).toBe(true)
    expect(result.poolId).toBeDefined()
    expect(result.transactionHash).toBeDefined()

    // Verify contract interaction
    expect(poolFactoryMock.createPool).toHaveBeenCalledWith(
      '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
      expect.any(BigInt), // maxLoanAmount in wei
      500,
      2592000,
      'Test Pool'
    )

    // Verify Firestore write
    expect(firebaseAdminMock.firestore.collection).toHaveBeenCalledWith('pools')
  })

  it('should handle contract execution failures', async () => {
    // Arrange
    const validRequest = FunctionsMock.createCallableRequest(
      {
        poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
        maxLoanAmount: '1000',
        interestRate: 500,
        loanDuration: 2592000,
        name: 'Test Pool',
        description: 'Test pool description',
      },
      'test-user-id'
    )

    // Simulate contract revert
    ethersMock.simulateContractRevert('Insufficient allowance')

    // Act & Assert
    await expect(createPoolHandler(validRequest)).rejects.toThrow('Contract execution failed')
  })

  it('should handle Firebase connection errors', async () => {
    // Arrange
    const validRequest = FunctionsMock.createCallableRequest(
      {
        poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
        maxLoanAmount: '1000',
        interestRate: 500,
        loanDuration: 2592000,
        name: 'Test Pool',
        description: 'Test pool description',
      },
      'test-user-id'
    )

    // Simulate Firestore error
    firebaseAdminMock.simulateFirestoreError('unavailable')

    // Act & Assert
    await expect(createPoolHandler(validRequest)).rejects.toThrow('Service temporarily unavailable')
  })
})
```

### **Advanced Error Simulation**

```typescript
describe('Error Scenario Testing', () => {
  it('should handle network timeouts', async () => {
    // Simulate network timeout
    ethersMock.simulateNetworkError('Request timeout')

    const request = FunctionsMock.createCallableRequest(validPoolData, 'test-user')

    await expect(createPoolHandler(request)).rejects.toThrow('Blockchain network unavailable')
  })

  it('should handle authentication failures', async () => {
    // Simulate expired token
    firebaseAdminMock.simulateAuthError('auth/id-token-expired')

    const request = FunctionsMock.createCallableRequest(validPoolData, 'test-user')

    await expect(createPoolHandler(request)).rejects.toThrow('Authentication expired')
  })

  it('should handle gas estimation failures', async () => {
    // Mock gas estimation failure
    const poolFactoryMock = ContractMock.createPoolFactoryMock()
    poolFactoryMock.estimateGas.createPool.mockRejectedValue(new Error('Gas estimation failed'))

    const request = FunctionsMock.createCallableRequest(validPoolData, 'test-user')

    // Should fallback to default gas limit
    const result = await createPoolHandler(request)
    expect(result.success).toBe(true)
  })
})
```

### **Integration Test Patterns**

```typescript
describe('Full Integration Tests', () => {
  it('should complete full pool creation workflow', async () => {
    // 1. Mock authentication
    const authResult = await firebaseAdminMock.auth.verifyIdToken('mock-token')
    expect(authResult.uid).toBe('test-user-id')

    // 2. Mock contract deployment
    const poolFactoryMock = ContractMock.createPoolFactoryMock()
    const createTx = await poolFactoryMock.createPool(
      '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
      BigInt('1000000000000000000000'),
      500,
      2592000,
      'Integration Test Pool'
    )

    // 3. Mock transaction confirmation
    const receipt = await createTx.wait()
    expect(receipt.status).toBe(1)
    expect(receipt.events).toBeDefined()

    // 4. Mock Firestore save
    const poolDoc = firebaseAdminMock.firestore.collection('pools').doc('4')
    await poolDoc.set({
      id: '4',
      name: 'Integration Test Pool',
      owner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
      createdAt: new Date(),
      isActive: true,
    })

    // 5. Verify complete workflow
    expect(poolFactoryMock.createPool).toHaveBeenCalled()
    expect(poolDoc.set).toHaveBeenCalled()
  })
})
```

---

## 📊 **Mock Performance & Debugging**

### **Mock Performance Monitoring**

```typescript
// src/__mocks__/utils/PerformanceMonitor.ts
export class MockPerformanceMonitor {
  private static callCounts = new Map<string, number>()
  private static callTimes = new Map<string, number[]>()

  static trackCall(mockName: string, duration: number): void {
    // Update call count
    const currentCount = this.callCounts.get(mockName) || 0
    this.callCounts.set(mockName, currentCount + 1)

    // Track timing
    const times = this.callTimes.get(mockName) || []
    times.push(duration)
    this.callTimes.set(mockName, times)
  }

  static getStats(): Record<string, { calls: number; avgTime: number; totalTime: number }> {
    const stats: Record<string, any> = {}

    for (const [mockName, count] of this.callCounts) {
      const times = this.callTimes.get(mockName) || []
      const totalTime = times.reduce((sum, time) => sum + time, 0)
      const avgTime = totalTime / times.length

      stats[mockName] = {
        calls: count,
        avgTime: Number(avgTime.toFixed(2)),
        totalTime: Number(totalTime.toFixed(2)),
      }
    }

    return stats
  }

  static reset(): void {
    this.callCounts.clear()
    this.callTimes.clear()
  }

  static logStats(): void {
    const stats = this.getStats()
    console.table(stats)
  }
}

// Enhanced mock wrapper with performance tracking
export function withPerformanceTracking<T extends (...args: any[]) => any>(mockName: string, mockFunction: T): T {
  return ((...args: any[]) => {
    const start = performance.now()
    const result = mockFunction(...args)
    const end = performance.now()

    MockPerformanceMonitor.trackCall(mockName, end - start)

    return result
  }) as T
}
```

### **Mock State Debugging**

```typescript
// src/__mocks__/utils/MockDebugger.ts
export class MockDebugger {
  private static debugMode = process.env.NODE_ENV === 'test' && process.env.DEBUG_MOCKS === 'true'

  static log(mockName: string, operation: string, details: any): void {
    if (!this.debugMode) return

    console.log(`[MOCK DEBUG] ${mockName}.${operation}:`, {
      timestamp: new Date().toISOString(),
      details: JSON.stringify(details, null, 2),
    })
  }

  static logCall(mockName: string, method: string, args: any[], result: any): void {
    if (!this.debugMode) return

    console.group(`[MOCK CALL] ${mockName}.${method}`)
    console.log('Arguments:', args)
    console.log('Result:', result)
    console.groupEnd()
  }

  static logError(mockName: string, method: string, error: any): void {
    if (!this.debugMode) return

    console.error(`[MOCK ERROR] ${mockName}.${method}:`, error)
  }

  static enable(): void {
    this.debugMode = true
  }

  static disable(): void {
    this.debugMode = false
  }
}

// Usage in mocks
export function withDebugLogging<T extends (...args: any[]) => any>(mockName: string, method: string, mockFunction: T): T {
  return ((...args: any[]) => {
    try {
      const result = mockFunction(...args)
      MockDebugger.logCall(mockName, method, args, result)
      return result
    } catch (error) {
      MockDebugger.logError(mockName, method, error)
      throw error
    }
  }) as T
}
```

---

## 🔧 **Mock Configuration & Setup**

### **Jest Configuration Integration**

```javascript
// jest.config.js - Mock configuration
module.exports = {
  // Mock setup
  setupFilesAfterEnv: ['<rootDir>/src/__mocks__/jest.setup.ts'],

  // Mock directories
  moduleNameMapping: {
    '^@mocks/(.*)$': '<rootDir>/src/__mocks__/$1',
  },

  // Clear mocks between tests
  clearMocks: true,
  resetMocks: false, // Keep mock implementations
  restoreMocks: false, // Don't restore original implementations

  // Mock modules
  modulePathIgnorePatterns: ['<rootDir>/lib/', '<rootDir>/node_modules/'],
}
```

### **Global Mock Setup**

```typescript
// src/__mocks__/jest.setup.ts
import { firebaseAdminMock } from './firebase/FirebaseAdminMock'
import { ethersMock } from './blockchain/EthersMock'
import { MockPerformanceMonitor } from './utils/PerformanceMonitor'
import { MockDebugger } from './utils/MockDebugger'

// Global test setup
beforeAll(() => {
  // Enable mock debugging in test environment
  if (process.env.DEBUG_MOCKS === 'true') {
    MockDebugger.enable()
  }

  // Setup environment variables
  process.env.NODE_ENV = 'test'
  process.env.GCLOUD_PROJECT = 'test-project-id'
})

// Per-test setup
beforeEach(() => {
  // Reset all mocks to default state
  firebaseAdminMock.resetAllMocks()
  ethersMock.resetAllMocks()

  // Reset performance monitoring
  MockPerformanceMonitor.reset()
})

// Post-test cleanup
afterEach(() => {
  // Log mock performance stats in debug mode
  if (process.env.DEBUG_MOCKS === 'true') {
    MockPerformanceMonitor.logStats()
  }
})

// Global error handling for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})
```

---

## 🎯 **Mock Best Practices**

### **1. Consistent Mock Behavior**

```typescript
// ✅ Good: Consistent mock responses
const mockUser = {
  uid: 'test-user-id',
  email: 'test@example.com',
  displayName: 'Test User',
  emailVerified: true,
}

firebaseAdminMock.auth.getUser.mockResolvedValue(mockUser)
firebaseAdminMock.auth.getUserByEmail.mockResolvedValue(mockUser)

// ❌ Bad: Inconsistent mock data
firebaseAdminMock.auth.getUser.mockResolvedValue({ uid: 'user1' })
firebaseAdminMock.auth.getUserByEmail.mockResolvedValue({ uid: 'user2' }) // Different data!
```

### **2. Realistic Error Simulation**

```typescript
// ✅ Good: Realistic error patterns
ethersMock.simulateNetworkError('NETWORK_ERROR: Request timeout after 30s')
firebaseAdminMock.simulateFirestoreError('permission-denied')

// ❌ Bad: Generic or unrealistic errors
ethersMock.provider.getNetwork.mockRejectedValue(new Error('oops'))
```

### **3. State Management**

```typescript
// ✅ Good: Clean state management
describe('Pool Creation Tests', () => {
  beforeEach(() => {
    // Start with clean, predictable state
    firebaseAdminMock.resetAllMocks()
    ethersMock.resetAllMocks()
  })

  it('should create pool with fresh mocks', () => {
    // Test with clean state
  })
})

// ❌ Bad: Stateful mocks affecting other tests
describe('Pool Creation Tests', () => {
  it('first test modifies mock state', () => {
    ethersMock.provider.getBlockNumber.mockResolvedValue(999999)
  })

  it('second test affected by previous state', () => {
    // Unexpectedly gets block number 999999
  })
})
```

### **4. Mock Verification**

```typescript
// ✅ Good: Verify mock interactions
it('should call contract with correct parameters', async () => {
  await createPool(validParams)

  expect(poolFactoryMock.createPool).toHaveBeenCalledWith(
    validParams.poolOwner,
    expect.any(BigInt),
    validParams.interestRate,
    validParams.loanDuration,
    validParams.name
  )
  expect(poolFactoryMock.createPool).toHaveBeenCalledTimes(1)
})

// ❌ Bad: No verification of mock calls
it('should create pool', async () => {
  const result = await createPool(validParams)
  expect(result.success).toBe(true) // Only tests return value
})
```

---

This comprehensive mock system provides the foundation for reliable, maintainable backend testing that matches the quality standards established by the mobile app testing architecture.
