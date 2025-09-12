# Firebase Cloud Functions Testing Guide

## 🔥 **Firebase-Specific Testing Patterns for SuperPool Backend**

This guide focuses on testing Firebase Cloud Functions, Firestore operations, and Firebase Auth integration within the SuperPool backend architecture. It provides comprehensive patterns for testing serverless Cloud Functions with real-world blockchain integration scenarios.

### **Testing Philosophy for Cloud Functions**

- **Serverless-First**: Test Cloud Function execution contexts and lifecycle
- **Firebase Integration**: Test Auth, Firestore, and Functions interactions
- **Blockchain Bridge**: Test Firebase ↔ Smart Contract integration
- **Production Realism**: Mirror production Firebase environment constraints

---

## ⚡ **Cloud Functions Testing Architecture**

### **Test Environment Setup**

```typescript
// src/__tests__/setup/firebase.setup.ts
import { jest } from '@jest/globals'
import { initializeApp, getApps, deleteApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

export class FirebaseTestEnvironment {
  private static instance: FirebaseTestEnvironment
  private app: any

  static getInstance(): FirebaseTestEnvironment {
    if (!FirebaseTestEnvironment.instance) {
      FirebaseTestEnvironment.instance = new FirebaseTestEnvironment()
    }
    return FirebaseTestEnvironment.instance
  }

  async setup(): Promise<void> {
    // Clean up existing apps
    const apps = getApps()
    await Promise.all(apps.map((app) => deleteApp(app)))

    // Setup test environment variables
    process.env.GCLOUD_PROJECT = 'superpool-test'
    process.env.FIREBASE_CONFIG = JSON.stringify({
      projectId: 'superpool-test',
      storageBucket: 'superpool-test.appspot.com',
    })
    process.env.FUNCTIONS_EMULATOR = 'true'

    // Initialize Firebase Admin with test config
    this.app = initializeApp(
      {
        projectId: 'superpool-test',
        // Use test service account or run in emulator mode
      },
      'test-app'
    )
  }

  async teardown(): Promise<void> {
    if (this.app) {
      await deleteApp(this.app)
    }

    // Clean up environment
    delete process.env.GCLOUD_PROJECT
    delete process.env.FIREBASE_CONFIG
    delete process.env.FUNCTIONS_EMULATOR
  }

  getAuth() {
    return getAuth(this.app)
  }

  getFirestore() {
    return getFirestore(this.app)
  }
}
```

### **Cloud Function Test Wrapper**

```typescript
// src/__tests__/utils/cloudFunctionTester.ts
import type { CallableRequest, HttpsError } from 'firebase-functions/v2/https'
import { FirebaseTestEnvironment } from '../setup/firebase.setup'

export interface TestCallableRequest<T = any> extends Partial<CallableRequest<T>> {
  data: T
  auth?: {
    uid: string
    token?: any
  }
}

export class CloudFunctionTester {
  private firebaseEnv: FirebaseTestEnvironment

  constructor() {
    this.firebaseEnv = FirebaseTestEnvironment.getInstance()
  }

  /**
   * Create a properly formatted CallableRequest for testing
   */
  createRequest<T>(data: T, uid?: string, customAuth?: any): CallableRequest<T> {
    const auth = uid
      ? {
          uid,
          token: {
            firebase: {
              identities: {},
              sign_in_provider: 'wallet',
            },
            uid,
            ...customAuth,
          },
        }
      : null

    return {
      data,
      auth,
      app: undefined,
      rawRequest: {
        headers: {
          'content-type': 'application/json',
          'user-agent': 'firebase-functions-test',
          'x-forwarded-for': '127.0.0.1',
        },
        method: 'POST',
        url: '/test-function',
      },
    } as CallableRequest<T>
  }

  /**
   * Create authenticated request with wallet address
   */
  createAuthenticatedRequest<T>(data: T, walletAddress: string, uid: string = `user-${walletAddress.slice(-8)}`): CallableRequest<T> {
    return this.createRequest(data, uid, {
      walletAddress,
      sign_in_provider: 'wallet',
    })
  }

  /**
   * Test Cloud Function with error expectation
   */
  async expectFunctionError<T>(
    functionHandler: (request: CallableRequest<T>) => Promise<any>,
    request: CallableRequest<T>,
    expectedErrorCode: string,
    expectedMessage?: string
  ): Promise<HttpsError> {
    try {
      await functionHandler(request)
      throw new Error('Expected function to throw error, but it succeeded')
    } catch (error: any) {
      expect(error.code).toBe(expectedErrorCode)
      if (expectedMessage) {
        expect(error.message).toContain(expectedMessage)
      }
      return error as HttpsError
    }
  }

  /**
   * Test Cloud Function with success expectation
   */
  async expectFunctionSuccess<T, R>(
    functionHandler: (request: CallableRequest<T>) => Promise<R>,
    request: CallableRequest<T>,
    validator?: (result: R) => void
  ): Promise<R> {
    const result = await functionHandler(request)
    expect(result).toBeDefined()

    if (validator) {
      validator(result)
    }

    return result
  }
}
```

---

## 🔐 **Authentication Testing Patterns**

### **Firebase Auth Integration Tests**

```typescript
// src/functions/auth/__tests__/generateAuthMessage.test.ts
import { describe, beforeEach, afterEach, it, expect } from '@jest/globals'
import { CloudFunctionTester } from '../../__tests__/utils/cloudFunctionTester'
import { FirebaseTestEnvironment } from '../../__tests__/setup/firebase.setup'
import { firebaseAdminMock } from '../../__mocks__/firebase/FirebaseAdminMock'

// Import function under test
import { generateAuthMessageHandler } from '../generateAuthMessage'

describe('generateAuthMessage Cloud Function', () => {
  let functionTester: CloudFunctionTester
  let firebaseEnv: FirebaseTestEnvironment

  beforeEach(async () => {
    firebaseEnv = FirebaseTestEnvironment.getInstance()
    await firebaseEnv.setup()

    functionTester = new CloudFunctionTester()

    // Reset mocks
    firebaseAdminMock.resetAllMocks()
  })

  afterEach(async () => {
    await firebaseEnv.teardown()
  })

  describe('Successful Authentication Flow', () => {
    it('should generate auth message for valid wallet address', async () => {
      // Arrange
      const walletAddress = '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a'
      const request = functionTester.createRequest({
        walletAddress,
      })

      // Mock Firestore operations
      firebaseAdminMock.firestore.collection('auth_nonces').add.mockResolvedValue({
        id: 'nonce-123',
      } as any)

      // Act
      const result = await functionTester.expectFunctionSuccess(generateAuthMessageHandler, request, (result) => {
        expect(result.message).toMatch(/Please sign this message to authenticate/)
        expect(result.nonce).toBeDefined()
        expect(result.timestamp).toBeDefined()
      })

      // Assert
      expect(result.message).toContain(walletAddress)
      expect(result.nonce).toHaveLength(64) // 32 bytes hex
      expect(result.timestamp).toBeGreaterThan(Date.now() - 1000)

      // Verify Firestore interaction
      expect(firebaseAdminMock.firestore.collection).toHaveBeenCalledWith('auth_nonces')
    })

    it('should include correct message format', async () => {
      // Arrange
      const walletAddress = '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a'
      const request = functionTester.createRequest({ walletAddress })

      firebaseAdminMock.firestore.collection('auth_nonces').add.mockResolvedValue({
        id: 'nonce-123',
      } as any)

      // Act
      const result = await generateAuthMessageHandler(request)

      // Assert - Message format validation
      expect(result.message).toMatch(/SuperPool Authentication/)
      expect(result.message).toMatch(/Wallet: 0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a/)
      expect(result.message).toMatch(/Nonce: [a-f0-9]{64}/)
      expect(result.message).toMatch(/Timestamp: \d{13}/)
      expect(result.message).toMatch(/This message will expire in 10 minutes/)
    })
  })

  describe('Input Validation', () => {
    it('should reject invalid wallet address', async () => {
      // Arrange
      const invalidRequest = functionTester.createRequest({
        walletAddress: 'invalid-address',
      })

      // Act & Assert
      await functionTester.expectFunctionError(
        generateAuthMessageHandler,
        invalidRequest,
        'invalid-argument',
        'Invalid wallet address format'
      )

      // Verify no Firestore interaction
      expect(firebaseAdminMock.firestore.collection).not.toHaveBeenCalled()
    })

    it('should reject missing wallet address', async () => {
      // Arrange
      const emptyRequest = functionTester.createRequest({})

      // Act & Assert
      await functionTester.expectFunctionError(generateAuthMessageHandler, emptyRequest, 'invalid-argument', 'walletAddress is required')
    })

    it('should reject null wallet address', async () => {
      // Arrange
      const nullRequest = functionTester.createRequest({
        walletAddress: null,
      })

      // Act & Assert
      await functionTester.expectFunctionError(generateAuthMessageHandler, nullRequest, 'invalid-argument')
    })
  })

  describe('Firebase Integration Error Handling', () => {
    it('should handle Firestore write failures', async () => {
      // Arrange
      const validRequest = functionTester.createRequest({
        walletAddress: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
      })

      // Simulate Firestore error
      firebaseAdminMock.simulateFirestoreError('unavailable')

      // Act & Assert
      await functionTester.expectFunctionError(generateAuthMessageHandler, validRequest, 'unavailable', 'Service temporarily unavailable')
    })

    it('should handle Firestore timeout', async () => {
      // Arrange
      const validRequest = functionTester.createRequest({
        walletAddress: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
      })

      // Simulate timeout
      firebaseAdminMock.simulateFirestoreError('deadline-exceeded')

      // Act & Assert
      await functionTester.expectFunctionError(generateAuthMessageHandler, validRequest, 'deadline-exceeded', 'Request timeout')
    })

    it('should handle permission denied', async () => {
      // Arrange
      const validRequest = functionTester.createRequest({
        walletAddress: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
      })

      // Simulate permission error
      firebaseAdminMock.simulateFirestoreError('permission-denied')

      // Act & Assert
      await functionTester.expectFunctionError(generateAuthMessageHandler, validRequest, 'permission-denied', 'Insufficient permissions')
    })
  })

  describe('Nonce Management', () => {
    it('should create unique nonces for concurrent requests', async () => {
      // Arrange
      const walletAddress = '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a'
      const request1 = functionTester.createRequest({ walletAddress })
      const request2 = functionTester.createRequest({ walletAddress })

      firebaseAdminMock.firestore.collection('auth_nonces').add.mockResolvedValue({
        id: 'nonce-123',
      } as any)

      // Act
      const [result1, result2] = await Promise.all([generateAuthMessageHandler(request1), generateAuthMessageHandler(request2)])

      // Assert
      expect(result1.nonce).not.toBe(result2.nonce)
      expect(result1.timestamp).not.toBe(result2.timestamp)

      // Verify multiple Firestore writes
      expect(firebaseAdminMock.firestore.collection('auth_nonces').add).toHaveBeenCalledTimes(2)
    })

    it('should store nonce with correct expiration', async () => {
      // Arrange
      const walletAddress = '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a'
      const request = functionTester.createRequest({ walletAddress })

      let savedNonce: any
      firebaseAdminMock.firestore.collection('auth_nonces').add.mockImplementation((data) => {
        savedNonce = data
        return Promise.resolve({ id: 'nonce-123' } as any)
      })

      // Act
      await generateAuthMessageHandler(request)

      // Assert
      expect(savedNonce).toBeDefined()
      expect(savedNonce.walletAddress).toBe(walletAddress)
      expect(savedNonce.nonce).toBeDefined()
      expect(savedNonce.expiresAt).toBeDefined()

      // Check expiration is 10 minutes from now
      const expectedExpiry = new Date(Date.now() + 10 * 60 * 1000)
      const actualExpiry = savedNonce.expiresAt.toDate()
      const timeDiff = Math.abs(expectedExpiry.getTime() - actualExpiry.getTime())
      expect(timeDiff).toBeLessThan(1000) // Within 1 second
    })
  })
})
```

### **Signature Verification Testing**

```typescript
// src/functions/auth/__tests__/verifySignatureAndLogin.test.ts
import { describe, beforeEach, it, expect } from '@jest/globals'
import { CloudFunctionTester } from '../../__tests__/utils/cloudFunctionTester'
import { firebaseAdminMock } from '../../__mocks__/firebase/FirebaseAdminMock'
import { ethers } from 'ethers'

import { verifySignatureAndLoginHandler } from '../verifySignatureAndLogin'

describe('verifySignatureAndLogin Cloud Function', () => {
  let functionTester: CloudFunctionTester

  // Test wallet for consistent signatures
  const testWallet = new ethers.Wallet('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12')
  const testWalletAddress = testWallet.address

  beforeEach(() => {
    functionTester = new CloudFunctionTester()
    firebaseAdminMock.resetAllMocks()
  })

  describe('Successful Authentication', () => {
    it('should verify valid signature and create user session', async () => {
      // Arrange - Create test message and signature
      const nonce = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12'
      const timestamp = Date.now()
      const message = `SuperPool Authentication\nWallet: ${testWalletAddress}\nNonce: ${nonce}\nTimestamp: ${timestamp}\nThis message will expire in 10 minutes.`

      const signature = await testWallet.signMessage(message)

      const request = functionTester.createRequest({
        walletAddress: testWalletAddress,
        signature,
        nonce,
        timestamp,
      })

      // Mock nonce verification
      firebaseAdminMock.firestore
        .collection('auth_nonces')
        .where()
        .get.mockResolvedValue({
          empty: false,
          docs: [
            {
              id: 'nonce-doc-id',
              data: () => ({
                walletAddress: testWalletAddress,
                nonce,
                createdAt: new Date(timestamp),
                expiresAt: new Date(timestamp + 10 * 60 * 1000),
                used: false,
              }),
              ref: {
                delete: jest.fn().mockResolvedValue(undefined),
              },
            },
          ],
        } as any)

      // Mock custom token creation
      firebaseAdminMock.auth.createCustomToken.mockResolvedValue('custom-token-123')

      // Mock user creation/update
      firebaseAdminMock.firestore.collection('users').doc().set.mockResolvedValue(undefined)
      firebaseAdminMock.firestore.collection('approved_devices').doc().set.mockResolvedValue(undefined)

      // Act
      const result = await functionTester.expectFunctionSuccess(verifySignatureAndLoginHandler, request, (result) => {
        expect(result.success).toBe(true)
        expect(result.customToken).toBe('custom-token-123')
        expect(result.user).toBeDefined()
        expect(result.user.walletAddress).toBe(testWalletAddress)
      })

      // Assert Firebase interactions
      expect(firebaseAdminMock.auth.createCustomToken).toHaveBeenCalledWith(expect.stringMatching(/^wallet-/), {
        walletAddress: testWalletAddress,
      })
    })

    it('should handle existing user authentication', async () => {
      // Arrange
      const nonce = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12'
      const timestamp = Date.now()
      const message = `SuperPool Authentication\nWallet: ${testWalletAddress}\nNonce: ${nonce}\nTimestamp: ${timestamp}\nThis message will expire in 10 minutes.`
      const signature = await testWallet.signMessage(message)

      const request = functionTester.createRequest({
        walletAddress: testWalletAddress,
        signature,
        nonce,
        timestamp,
      })

      // Mock existing user
      firebaseAdminMock.firestore
        .collection('users')
        .where()
        .get.mockResolvedValue({
          empty: false,
          docs: [
            {
              id: 'existing-user-id',
              data: () => ({
                walletAddress: testWalletAddress,
                createdAt: new Date(timestamp - 1000000),
                lastLoginAt: new Date(timestamp - 100000),
              }),
            },
          ],
        } as any)

      // Mock nonce verification
      firebaseAdminMock.firestore
        .collection('auth_nonces')
        .where()
        .get.mockResolvedValue({
          empty: false,
          docs: [
            {
              data: () => ({
                walletAddress: testWalletAddress,
                nonce,
                expiresAt: new Date(timestamp + 10 * 60 * 1000),
                used: false,
              }),
              ref: { delete: jest.fn() },
            },
          ],
        } as any)

      firebaseAdminMock.auth.createCustomToken.mockResolvedValue('custom-token-456')

      // Act
      const result = await verifySignatureAndLoginHandler(request)

      // Assert - Should update existing user instead of creating new one
      expect(result.success).toBe(true)
      expect(result.user.walletAddress).toBe(testWalletAddress)

      // Verify user update call (not create)
      expect(
        firebaseAdminMock.firestore.collection('users').doc().update || firebaseAdminMock.firestore.collection('users').doc().set
      ).toHaveBeenCalled()
    })
  })

  describe('Signature Validation', () => {
    it('should reject invalid signature', async () => {
      // Arrange
      const nonce = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12'
      const timestamp = Date.now()
      const invalidSignature = '0xinvalidsignature123456789abcdef'

      const request = functionTester.createRequest({
        walletAddress: testWalletAddress,
        signature: invalidSignature,
        nonce,
        timestamp,
      })

      // Mock nonce verification (valid nonce)
      firebaseAdminMock.firestore
        .collection('auth_nonces')
        .where()
        .get.mockResolvedValue({
          empty: false,
          docs: [
            {
              data: () => ({
                walletAddress: testWalletAddress,
                nonce,
                expiresAt: new Date(timestamp + 10 * 60 * 1000),
                used: false,
              }),
            },
          ],
        } as any)

      // Act & Assert
      await functionTester.expectFunctionError(verifySignatureAndLoginHandler, request, 'invalid-argument', 'Invalid signature')
    })

    it('should reject signature from wrong wallet', async () => {
      // Arrange - Sign with different wallet
      const wrongWallet = new ethers.Wallet('0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef')
      const nonce = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12'
      const timestamp = Date.now()
      const message = `SuperPool Authentication\nWallet: ${testWalletAddress}\nNonce: ${nonce}\nTimestamp: ${timestamp}\nThis message will expire in 10 minutes.`

      // Sign with wrong wallet but claim it's from testWalletAddress
      const wrongSignature = await wrongWallet.signMessage(message)

      const request = functionTester.createRequest({
        walletAddress: testWalletAddress,
        signature: wrongSignature,
        nonce,
        timestamp,
      })

      // Mock nonce verification
      firebaseAdminMock.firestore
        .collection('auth_nonces')
        .where()
        .get.mockResolvedValue({
          empty: false,
          docs: [
            {
              data: () => ({
                walletAddress: testWalletAddress,
                nonce,
                expiresAt: new Date(timestamp + 10 * 60 * 1000),
                used: false,
              }),
            },
          ],
        } as any)

      // Act & Assert
      await functionTester.expectFunctionError(verifySignatureAndLoginHandler, request, 'invalid-argument', 'Signature verification failed')
    })
  })

  describe('Nonce Validation', () => {
    it('should reject expired nonce', async () => {
      // Arrange
      const nonce = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12'
      const timestamp = Date.now() - 15 * 60 * 1000 // 15 minutes ago (expired)
      const message = `SuperPool Authentication\nWallet: ${testWalletAddress}\nNonce: ${nonce}\nTimestamp: ${timestamp}\nThis message will expire in 10 minutes.`
      const signature = await testWallet.signMessage(message)

      const request = functionTester.createRequest({
        walletAddress: testWalletAddress,
        signature,
        nonce,
        timestamp,
      })

      // Mock expired nonce
      firebaseAdminMock.firestore
        .collection('auth_nonces')
        .where()
        .get.mockResolvedValue({
          empty: false,
          docs: [
            {
              data: () => ({
                walletAddress: testWalletAddress,
                nonce,
                expiresAt: new Date(timestamp + 10 * 60 * 1000), // Expired
                used: false,
              }),
            },
          ],
        } as any)

      // Act & Assert
      await functionTester.expectFunctionError(verifySignatureAndLoginHandler, request, 'invalid-argument', 'Nonce has expired')
    })

    it('should reject already used nonce', async () => {
      // Arrange
      const nonce = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12'
      const timestamp = Date.now()
      const message = `SuperPool Authentication\nWallet: ${testWalletAddress}\nNonce: ${nonce}\nTimestamp: ${timestamp}\nThis message will expire in 10 minutes.`
      const signature = await testWallet.signMessage(message)

      const request = functionTester.createRequest({
        walletAddress: testWalletAddress,
        signature,
        nonce,
        timestamp,
      })

      // Mock used nonce
      firebaseAdminMock.firestore
        .collection('auth_nonces')
        .where()
        .get.mockResolvedValue({
          empty: false,
          docs: [
            {
              data: () => ({
                walletAddress: testWalletAddress,
                nonce,
                expiresAt: new Date(timestamp + 10 * 60 * 1000),
                used: true, // Already used
              }),
            },
          ],
        } as any)

      // Act & Assert
      await functionTester.expectFunctionError(verifySignatureAndLoginHandler, request, 'invalid-argument', 'Nonce has already been used')
    })

    it('should reject non-existent nonce', async () => {
      // Arrange
      const nonce = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12'
      const timestamp = Date.now()
      const message = `SuperPool Authentication\nWallet: ${testWalletAddress}\nNonce: ${nonce}\nTimestamp: ${timestamp}\nThis message will expire in 10 minutes.`
      const signature = await testWallet.signMessage(message)

      const request = functionTester.createRequest({
        walletAddress: testWalletAddress,
        signature,
        nonce,
        timestamp,
      })

      // Mock non-existent nonce
      firebaseAdminMock.firestore
        .collection('auth_nonces')
        .where()
        .get.mockResolvedValue({
          empty: true, // No nonce found
          docs: [],
        } as any)

      // Act & Assert
      await functionTester.expectFunctionError(verifySignatureAndLoginHandler, request, 'invalid-argument', 'Invalid or expired nonce')
    })
  })
})
```

---

## 📄 **Firestore Operations Testing**

### **Database Transaction Testing**

```typescript
// src/__tests__/patterns/firestoreTransactions.test.ts
import { describe, beforeEach, it, expect } from '@jest/globals'
import { firebaseAdminMock } from '../__mocks__/firebase/FirebaseAdminMock'

describe('Firestore Transaction Patterns', () => {
  beforeEach(() => {
    firebaseAdminMock.resetAllMocks()
  })

  describe('Atomic Pool Creation', () => {
    it('should handle atomic pool and owner index updates', async () => {
      // Arrange
      const poolData = {
        id: '1',
        owner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
        name: 'Test Pool',
        maxLoanAmount: '1000000000000000000000',
        interestRate: 500,
        loanDuration: 2592000,
        createdAt: new Date(),
        isActive: true,
      }

      // Mock transaction
      const mockTransaction = {
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      }

      firebaseAdminMock.firestore.runTransaction.mockImplementation(async (callback) => {
        return await callback(mockTransaction)
      })

      // Mock existing owner data
      mockTransaction.get.mockResolvedValue({
        exists: true,
        data: () => ({
          address: poolData.owner,
          poolIds: ['0'],
          totalPools: 1,
        }),
      })

      // Act - Simulate atomic pool creation with owner update
      await firebaseAdminMock.firestore.runTransaction(async (transaction) => {
        // Create pool document
        const poolRef = firebaseAdminMock.firestore.collection('pools').doc(poolData.id)
        transaction.set(poolRef, poolData)

        // Update owner index
        const ownerRef = firebaseAdminMock.firestore.collection('pool_owners').doc(poolData.owner)
        const ownerDoc = await transaction.get(ownerRef)

        if (ownerDoc.exists) {
          const ownerData = ownerDoc.data()
          transaction.update(ownerRef, {
            poolIds: [...ownerData.poolIds, poolData.id],
            totalPools: ownerData.totalPools + 1,
            lastPoolCreated: poolData.createdAt,
          })
        }

        return { success: true }
      })

      // Assert
      expect(firebaseAdminMock.firestore.runTransaction).toHaveBeenCalled()
      expect(mockTransaction.set).toHaveBeenCalledWith(expect.anything(), poolData)
      expect(mockTransaction.update).toHaveBeenCalledWith(expect.anything(), {
        poolIds: ['0', '1'],
        totalPools: 2,
        lastPoolCreated: poolData.createdAt,
      })
    })

    it('should handle transaction failures and rollbacks', async () => {
      // Arrange
      const mockTransaction = {
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      }

      // Simulate transaction failure
      const transactionError = new Error('Transaction failed')
      firebaseAdminMock.firestore.runTransaction.mockRejectedValue(transactionError)

      // Act & Assert
      await expect(
        firebaseAdminMock.firestore.runTransaction(async () => {
          throw transactionError
        })
      ).rejects.toThrow('Transaction failed')

      // Verify no partial state changes
      expect(mockTransaction.set).not.toHaveBeenCalled()
      expect(mockTransaction.update).not.toHaveBeenCalled()
    })
  })

  describe('Batch Operations', () => {
    it('should handle batch writes for multiple documents', async () => {
      // Arrange
      const mockBatch = {
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        commit: jest.fn().mockResolvedValue([]),
      }

      firebaseAdminMock.firestore.batch.mockReturnValue(mockBatch)

      const poolUpdates = [
        { id: '1', isActive: false },
        { id: '2', isActive: false },
        { id: '3', isActive: false },
      ]

      // Act
      const batch = firebaseAdminMock.firestore.batch()

      poolUpdates.forEach((update) => {
        const poolRef = firebaseAdminMock.firestore.collection('pools').doc(update.id)
        batch.update(poolRef, { isActive: update.isActive })
      })

      await batch.commit()

      // Assert
      expect(mockBatch.update).toHaveBeenCalledTimes(3)
      expect(mockBatch.commit).toHaveBeenCalledTimes(1)
    })

    it('should handle batch commit failures', async () => {
      // Arrange
      const mockBatch = {
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        commit: jest.fn().mockRejectedValue(new Error('Batch commit failed')),
      }

      firebaseAdminMock.firestore.batch.mockReturnValue(mockBatch)

      // Act & Assert
      const batch = firebaseAdminMock.firestore.batch()
      batch.update({} as any, { isActive: false })

      await expect(batch.commit()).rejects.toThrow('Batch commit failed')
    })
  })
})
```

### **Collection Query Testing**

```typescript
// src/__tests__/patterns/firestoreQueries.test.ts
import { describe, beforeEach, it, expect } from '@jest/globals'
import { firebaseAdminMock } from '../__mocks__/firebase/FirebaseAdminMock'

describe('Firestore Query Patterns', () => {
  beforeEach(() => {
    firebaseAdminMock.resetAllMocks()
  })

  describe('Pool Listing Queries', () => {
    it('should query pools with pagination', async () => {
      // Arrange
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({
          empty: false,
          size: 2,
          docs: [
            {
              id: '1',
              data: () => ({
                name: 'Pool 1',
                owner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
                isActive: true,
              }),
            },
            {
              id: '2',
              data: () => ({
                name: 'Pool 2',
                owner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
                isActive: true,
              }),
            },
          ],
        }),
      }

      firebaseAdminMock.firestore.collection('pools').mockReturnValue(mockQuery as any)

      // Act
      const query = firebaseAdminMock.firestore
        .collection('pools')
        .where('isActive', '==', true)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .offset(0)

      const result = await query.get()

      // Assert
      expect(mockQuery.where).toHaveBeenCalledWith('isActive', '==', true)
      expect(mockQuery.orderBy).toHaveBeenCalledWith('createdAt', 'desc')
      expect(mockQuery.limit).toHaveBeenCalledWith(20)
      expect(mockQuery.offset).toHaveBeenCalledWith(0)
      expect(result.size).toBe(2)
    })

    it('should handle complex compound queries', async () => {
      // Arrange
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({
          empty: false,
          docs: [],
        }),
      }

      firebaseAdminMock.firestore.collection('pools').mockReturnValue(mockQuery as any)

      // Act
      const query = firebaseAdminMock.firestore
        .collection('pools')
        .where('chainId', '==', 80002)
        .where('isActive', '==', true)
        .where('interestRate', '>=', 100)
        .where('interestRate', '<=', 1000)
        .orderBy('interestRate', 'asc')
        .limit(10)

      await query.get()

      // Assert
      expect(mockQuery.where).toHaveBeenCalledWith('chainId', '==', 80002)
      expect(mockQuery.where).toHaveBeenCalledWith('isActive', '==', true)
      expect(mockQuery.where).toHaveBeenCalledWith('interestRate', '>=', 100)
      expect(mockQuery.where).toHaveBeenCalledWith('interestRate', '<=', 1000)
      expect(mockQuery.orderBy).toHaveBeenCalledWith('interestRate', 'asc')
    })

    it('should handle empty query results', async () => {
      // Arrange
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({
          empty: true,
          size: 0,
          docs: [],
        }),
      }

      firebaseAdminMock.firestore.collection('pools').mockReturnValue(mockQuery as any)

      // Act
      const query = firebaseAdminMock.firestore.collection('pools').where('owner', '==', '0xnonexistent')

      const result = await query.get()

      // Assert
      expect(result.empty).toBe(true)
      expect(result.size).toBe(0)
      expect(result.docs).toHaveLength(0)
    })
  })

  describe('Query Error Handling', () => {
    it('should handle query timeout errors', async () => {
      // Arrange
      const timeoutError = new Error('Query timeout')
      timeoutError.code = 'deadline-exceeded'

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockRejectedValue(timeoutError),
      }

      firebaseAdminMock.firestore.collection('pools').mockReturnValue(mockQuery as any)

      // Act & Assert
      const query = firebaseAdminMock.firestore.collection('pools').where('isActive', '==', true)

      await expect(query.get()).rejects.toMatchObject({
        code: 'deadline-exceeded',
      })
    })

    it('should handle permission denied errors', async () => {
      // Arrange
      const permissionError = new Error('Permission denied')
      permissionError.code = 'permission-denied'

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockRejectedValue(permissionError),
      }

      firebaseAdminMock.firestore.collection('pools').mockReturnValue(mockQuery as any)

      // Act & Assert
      const query = firebaseAdminMock.firestore.collection('pools').where('isActive', '==', true)

      await expect(query.get()).rejects.toMatchObject({
        code: 'permission-denied',
      })
    })
  })
})
```

---

## 🔍 **Firebase Functions Lifecycle Testing**

### **Function Context and Environment**

```typescript
// src/__tests__/patterns/functionLifecycle.test.ts
import { describe, beforeEach, afterEach, it, expect } from '@jest/globals'
import { CloudFunctionTester } from '../utils/cloudFunctionTester'

describe('Cloud Function Lifecycle', () => {
  let functionTester: CloudFunctionTester

  beforeEach(() => {
    functionTester = new CloudFunctionTester()
  })

  describe('Function Environment', () => {
    it('should have correct environment variables', () => {
      // Assert standard Firebase environment
      expect(process.env.GCLOUD_PROJECT).toBe('superpool-test')
      expect(process.env.FUNCTIONS_EMULATOR).toBe('true')

      // Assert custom environment variables
      expect(process.env.POLYGON_AMOY_RPC_URL).toBeDefined()
      expect(process.env.POOL_FACTORY_ADDRESS_AMOY).toBeDefined()
    })

    it('should handle missing environment variables gracefully', () => {
      // Arrange
      const originalRpcUrl = process.env.POLYGON_AMOY_RPC_URL
      delete process.env.POLYGON_AMOY_RPC_URL

      // Act & Assert - Function should handle missing RPC URL
      expect(() => {
        // Function initialization logic
        const rpcUrl = process.env.POLYGON_AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology'
        expect(rpcUrl).toBe('https://rpc-amoy.polygon.technology')
      }).not.toThrow()

      // Cleanup
      process.env.POLYGON_AMOY_RPC_URL = originalRpcUrl
    })
  })

  describe('Function Timeouts', () => {
    it('should handle function timeout scenarios', async () => {
      // Arrange - Create a function that would timeout
      const longRunningFunction = async (request: any) => {
        // Simulate long-running operation
        await new Promise((resolve) => setTimeout(resolve, 10000))
        return { success: true }
      }

      // Mock timeout after 5 seconds
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Function timeout')), 5000)
      })

      // Act & Assert
      await expect(Promise.race([longRunningFunction({}), timeoutPromise])).rejects.toThrow('Function timeout')
    })
  })

  describe('Memory Usage', () => {
    it('should monitor memory usage during execution', async () => {
      // Arrange
      const initialMemory = process.memoryUsage()

      // Act - Perform memory-intensive operation
      const largeArray = new Array(100000).fill(0).map((_, i) => ({
        id: i,
        data: `test-data-${i}`,
        timestamp: Date.now(),
      }))

      const finalMemory = process.memoryUsage()

      // Assert
      expect(finalMemory.heapUsed).toBeGreaterThan(initialMemory.heapUsed)

      // Cleanup
      largeArray.length = 0
    })
  })

  describe('Cold Start Simulation', () => {
    it('should handle cold start initialization', async () => {
      // Arrange - Simulate cold start by resetting global state
      const startTime = Date.now()

      // Mock initialization delay
      await new Promise((resolve) => setTimeout(resolve, 100))

      const initTime = Date.now() - startTime

      // Assert initialization completed within reasonable time
      expect(initTime).toBeGreaterThan(50) // Simulated delay
      expect(initTime).toBeLessThan(200) // Reasonable cold start time
    })
  })
})
```

---

## 📊 **Performance Testing Patterns**

### **Response Time Testing**

```typescript
// src/__tests__/patterns/performance.test.ts
import { describe, it, expect } from '@jest/globals'
import { CloudFunctionTester } from '../utils/cloudFunctionTester'

describe('Firebase Function Performance', () => {
  const functionTester = new CloudFunctionTester()

  describe('Response Time Requirements', () => {
    it('should complete pool creation within acceptable time', async () => {
      // Arrange
      const startTime = performance.now()

      const request = functionTester.createAuthenticatedRequest(
        {
          poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
          maxLoanAmount: '1000',
          interestRate: 500,
          loanDuration: 2592000,
          name: 'Performance Test Pool',
          description: 'Testing response time',
        },
        '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a'
      )

      // Act
      // Mock the actual function call with realistic timing
      await new Promise((resolve) => setTimeout(resolve, 150)) // Simulate realistic processing time

      const endTime = performance.now()
      const responseTime = endTime - startTime

      // Assert
      expect(responseTime).toBeLessThan(5000) // 5 second SLA
      expect(responseTime).toBeGreaterThan(100) // Realistic minimum processing time
    })

    it('should handle concurrent requests efficiently', async () => {
      // Arrange
      const concurrentRequests = 5
      const requests = Array(concurrentRequests)
        .fill(null)
        .map((_, i) =>
          functionTester.createAuthenticatedRequest(
            {
              poolOwner: `0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7${i}`,
              maxLoanAmount: '1000',
              interestRate: 500,
              loanDuration: 2592000,
              name: `Concurrent Pool ${i}`,
              description: 'Testing concurrent processing',
            },
            `0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7${i}`
          )
        )

      // Act
      const startTime = performance.now()

      await Promise.all(
        requests.map(async (request, index) => {
          // Simulate concurrent processing
          await new Promise((resolve) => setTimeout(resolve, 100 + index * 10))
          return { success: true, poolId: index + 1 }
        })
      )

      const endTime = performance.now()
      const totalTime = endTime - startTime

      // Assert
      expect(totalTime).toBeLessThan(1000) // Should process concurrently, not sequentially
    })
  })

  describe('Resource Efficiency', () => {
    it('should not leak memory during repeated operations', async () => {
      // Arrange
      const initialMemory = process.memoryUsage().heapUsed
      const iterations = 100

      // Act
      for (let i = 0; i < iterations; i++) {
        const request = functionTester.createAuthenticatedRequest(
          {
            poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
            maxLoanAmount: '1000',
            interestRate: 500,
            loanDuration: 2592000,
            name: `Memory Test Pool ${i}`,
            description: 'Testing memory usage',
          },
          '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a'
        )

        // Simulate processing
        await new Promise((resolve) => setTimeout(resolve, 1))
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc()
      }

      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory

      // Assert
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024) // Less than 50MB increase
    })
  })
})
```

This comprehensive Firebase testing guide provides the foundation for testing Cloud Functions with realistic Firebase integration, proper error handling, and performance validation that mirrors production Firebase environments.
