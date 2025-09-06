/**
 * Cloud Function Testing Utility
 *
 * This utility provides comprehensive testing helpers for Firebase Cloud Functions,
 * including request creation, response validation, and error handling.
 */

import type { CallableRequest, HttpsError } from 'firebase-functions/v2/https'
import { firebaseAdminMock } from '../../__mocks__/firebase/FirebaseAdminMock'

export interface TestCallableRequest<T = any> extends Partial<CallableRequest<T>> {
  data: T
  auth?: {
    uid: string
    token?: any
  }
}

export interface MockHttpsError {
  code: string
  message: string
  details?: any
  httpErrorCode?: number
}

export interface CloudFunctionTestOptions {
  timeout?: number
  validateAuth?: boolean
  skipFirebaseInit?: boolean
}

export class CloudFunctionTester {
  private firebaseInitialized = false

  constructor(private options: CloudFunctionTestOptions = {}) {}

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
            email: `${uid}@test.com`,
            email_verified: true,
            name: `Test User ${uid}`,
            aud: 'superpool-test',
            exp: Math.floor(Date.now() / 1000) + 3600,
            iat: Math.floor(Date.now() / 1000),
            iss: 'https://securetoken.google.com/superpool-test',
            sub: uid,
            auth_time: Math.floor(Date.now() / 1000),
            ...customAuth,
          },
        }
      : null

    return {
      data,
      auth,
      app: {
        name: '[DEFAULT]',
        options: {
          projectId: 'superpool-test',
          storageBucket: 'superpool-test.appspot.com',
        },
      },
      rawRequest: {
        headers: {
          'content-type': 'application/json',
          'user-agent': 'firebase-functions-test',
          'x-forwarded-for': '127.0.0.1',
          authorization: uid ? `Bearer test-token-${uid}` : undefined,
          'x-firebase-appcheck': 'test-app-check-token',
        },
        method: 'POST',
        url: '/test-function',
        ip: '127.0.0.1',
        get: jest.fn((header: string) => {
          const headers: Record<string, string> = {
            'content-type': 'application/json',
            'user-agent': 'firebase-functions-test',
            authorization: uid ? `Bearer test-token-${uid}` : '',
          }
          return headers[header.toLowerCase()]
        }),
        header: jest.fn((header: string) => {
          const headers: Record<string, string> = {
            'content-type': 'application/json',
            'user-agent': 'firebase-functions-test',
            authorization: uid ? `Bearer test-token-${uid}` : '',
          }
          return headers[header.toLowerCase()]
        }),
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
      firebase: {
        identities: {
          wallet: [walletAddress],
        },
        sign_in_provider: 'wallet',
      },
    })
  }

  /**
   * Create unauthenticated request
   */
  createUnauthenticatedRequest<T>(data: T): CallableRequest<T> {
    return this.createRequest(data)
  }

  /**
   * Create request with custom authentication claims
   */
  createCustomAuthRequest<T>(data: T, customClaims: Record<string, any>, uid: string = 'test-user'): CallableRequest<T> {
    return this.createRequest(data, uid, customClaims)
  }

  /**
   * Test Cloud Function with error expectation
   */
  async expectFunctionError<T>(
    functionHandler: (request: CallableRequest<T>) => Promise<any>,
    request: CallableRequest<T>,
    expectedErrorCode: string,
    expectedMessage?: string | RegExp
  ): Promise<MockHttpsError> {
    try {
      await functionHandler(request)
      throw new Error('Expected function to throw error, but it succeeded')
    } catch (error: any) {
      expect(error.code).toBe(expectedErrorCode)

      if (expectedMessage) {
        if (typeof expectedMessage === 'string') {
          expect(error.message).toContain(expectedMessage)
        } else {
          expect(error.message).toMatch(expectedMessage)
        }
      }

      return {
        code: error.code,
        message: error.message,
        details: error.details,
        httpErrorCode: error.httpErrorCode,
      }
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

  /**
   * Test Cloud Function with timeout
   */
  async expectFunctionTimeout<T>(
    functionHandler: (request: CallableRequest<T>) => Promise<any>,
    request: CallableRequest<T>,
    timeoutMs: number = 5000
  ): Promise<void> {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Function timeout')), timeoutMs)
    })

    await expect(Promise.race([functionHandler(request), timeoutPromise])).rejects.toThrow('Function timeout')
  }

  /**
   * Setup Firebase test environment
   */
  async setupFirebaseEnvironment(): Promise<void> {
    if (this.firebaseInitialized || this.options.skipFirebaseInit) {
      return
    }

    // Setup environment variables
    process.env.GCLOUD_PROJECT = 'superpool-test'
    process.env.FIREBASE_CONFIG = JSON.stringify({
      projectId: 'superpool-test',
      storageBucket: 'superpool-test.appspot.com',
    })
    process.env.FUNCTIONS_EMULATOR = 'true'

    // Reset mocks
    firebaseAdminMock.resetAllMocks()

    this.firebaseInitialized = true
  }

  /**
   * Cleanup Firebase test environment
   */
  async cleanupFirebaseEnvironment(): Promise<void> {
    if (!this.firebaseInitialized) {
      return
    }

    // Clean up environment variables
    delete process.env.GCLOUD_PROJECT
    delete process.env.FIREBASE_CONFIG
    delete process.env.FUNCTIONS_EMULATOR

    this.firebaseInitialized = false
  }

  /**
   * Create mock HttpsError for testing
   */
  createHttpsError(code: string, message: string, details?: any): MockHttpsError {
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

    return {
      code,
      message,
      details,
      httpErrorCode: errorCodes[code] || 500,
    }
  }

  /**
   * Validate response structure for common SuperPool responses
   */
  validatePoolCreationResponse(response: any): void {
    expect(response).toHaveProperty('success')
    expect(typeof response.success).toBe('boolean')

    if (response.success) {
      expect(response).toHaveProperty('poolId')
      expect(response).toHaveProperty('transactionHash')
      expect(response.transactionHash).toBeValidTransactionHash()

      if (response.poolAddress) {
        expect(response.poolAddress).toBeValidEthereumAddress()
      }
    } else {
      expect(response).toHaveProperty('error')
      expect(typeof response.error).toBe('string')
    }
  }

  /**
   * Validate authentication response
   */
  validateAuthResponse(response: any): void {
    expect(response).toHaveProperty('success')
    expect(typeof response.success).toBe('boolean')

    if (response.success) {
      expect(response).toHaveProperty('customToken')
      expect(typeof response.customToken).toBe('string')
      expect(response).toHaveProperty('user')
      expect(response.user).toHaveProperty('walletAddress')
      expect(response.user.walletAddress).toBeValidEthereumAddress()
    }
  }

  /**
   * Validate Safe transaction response
   */
  validateSafeTransactionResponse(response: any): void {
    expect(response).toHaveProperty('success')
    expect(typeof response.success).toBe('boolean')

    if (response.success) {
      expect(response).toHaveProperty('transactionHash')
      expect(response).toHaveProperty('safeAddress')
      expect(response).toHaveProperty('requiredSignatures')
      expect(response).toHaveProperty('currentSignatures')
      expect(response.safeAddress).toBeValidEthereumAddress()
      expect(typeof response.requiredSignatures).toBe('number')
      expect(typeof response.currentSignatures).toBe('number')
    }
  }

  /**
   * Performance testing helper
   */
  async measurePerformance<T>(
    functionHandler: (request: CallableRequest<T>) => Promise<any>,
    request: CallableRequest<T>,
    expectedMaxDuration: number = 5000
  ): Promise<{ result: any; duration: number }> {
    const startTime = performance.now()
    const result = await functionHandler(request)
    const endTime = performance.now()
    const duration = endTime - startTime

    expect(duration).toBeLessThan(expectedMaxDuration)

    return { result, duration }
  }

  /**
   * Memory usage testing helper
   */
  async measureMemoryUsage<T>(
    functionHandler: (request: CallableRequest<T>) => Promise<any>,
    request: CallableRequest<T>,
    expectedMaxIncrease: number = 50 * 1024 * 1024 // 50MB
  ): Promise<{ result: any; memoryIncrease: number }> {
    const initialMemory = process.memoryUsage().heapUsed
    const result = await functionHandler(request)

    // Force garbage collection if available
    if (global.gc) {
      global.gc()
    }

    const finalMemory = process.memoryUsage().heapUsed
    const memoryIncrease = finalMemory - initialMemory

    expect(memoryIncrease).toBeLessThan(expectedMaxIncrease)

    return { result, memoryIncrease }
  }

  /**
   * Concurrent execution testing helper
   */
  async testConcurrentExecution<T>(
    functionHandler: (request: CallableRequest<T>) => Promise<any>,
    requests: CallableRequest<T>[],
    expectedMaxDuration: number = 10000
  ): Promise<any[]> {
    const startTime = performance.now()
    const results = await Promise.all(requests.map((req) => functionHandler(req)))
    const endTime = performance.now()
    const duration = endTime - startTime

    expect(duration).toBeLessThan(expectedMaxDuration)
    expect(results).toHaveLength(requests.length)

    return results
  }

  /**
   * Database state validation helper
   */
  async validateDatabaseState(collectionPath: string, expectedDocuments: Record<string, any>): Promise<void> {
    const allDocs = firebaseAdminMock.getAllDocuments()

    Object.entries(expectedDocuments).forEach(([docId, expectedData]) => {
      const fullPath = `${collectionPath}/${docId}`
      const actualData = allDocs.get(fullPath)

      expect(actualData).toBeDefined()
      expect(actualData).toMatchObject(expectedData)
    })
  }

  /**
   * Mock data seeding helper
   */
  seedTestData(data: {
    users?: Array<{ uid: string; email?: string; walletAddress?: string }>
    documents?: Array<{ path: string; data: any }>
  }): void {
    // Seed users
    if (data.users) {
      data.users.forEach((user) => {
        firebaseAdminMock.seedUser({
          uid: user.uid,
          email: user.email,
          customClaims: user.walletAddress ? { walletAddress: user.walletAddress } : {},
        })
      })
    }

    // Seed documents
    if (data.documents) {
      data.documents.forEach((doc) => {
        firebaseAdminMock.seedDocument(doc.path, doc.data)
      })
    }
  }
}

export default CloudFunctionTester
