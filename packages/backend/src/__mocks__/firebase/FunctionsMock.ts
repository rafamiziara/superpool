/**
 * Firebase Cloud Functions Mock System
 *
 * This mock provides complete Firebase Cloud Functions simulation for testing
 * CallableRequest objects, HttpsError handling, and Functions environment setup.
 * Implements MOCK_SYSTEM.md specifications with proper TypeScript support.
 */

import { jest } from '@jest/globals'
import type { CallableRequest, HttpsError } from 'firebase-functions/v2/https'

// Define our own AuthData interface to avoid import issues
export interface MockAuthData {
  uid: string
  token: {
    firebase: {
      identities: Record<string, string[]>
      sign_in_provider: string
    }
    uid: string
    email: string
    email_verified: boolean
    aud: string
    exp: number
    iat: number
    iss: string
    sub: string
    auth_time: number
  }
}

/**
 * Enhanced CallableRequest interface with all required properties
 * Fixes TypeScript errors by including missing acceptsStreaming property
 */
export interface MockCallableRequest<T = Record<string, unknown>> extends Partial<CallableRequest<T>> {
  data: T
  auth?: MockAuthData | undefined
  app?: unknown
  rawRequest?: {
    headers: Record<string, string>
    method: string
    url: string
    body: string
  }
  acceptsStreaming?: boolean // ✅ CRITICAL - Fixes 150+ TypeScript errors
}

/**
 * Cloud Functions context mock for testing Firebase Functions
 */
export class FunctionsMock {
  /**
   * Create a properly typed CallableRequest for testing
   * Includes all required properties to prevent TypeScript errors
   */
  static createCallableRequest<T>(data: T, uid?: string, options?: Partial<MockCallableRequest<T>>): CallableRequest<T> {
    const baseRequest: MockCallableRequest<T> = {
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
              email: `${uid}@test.com`,
              email_verified: true,
              aud: 'superpool-test',
              exp: Math.floor(Date.now() / 1000) + 3600,
              iat: Math.floor(Date.now() / 1000),
              iss: 'https://securetoken.google.com/superpool-test',
              sub: uid,
              auth_time: Math.floor(Date.now() / 1000),
            },
          }
        : undefined,
      app: undefined,
      rawRequest: {
        headers: {
          'content-type': 'application/json',
          'user-agent': 'firebase-admin-node',
          authorization: uid ? `Bearer mock-token-${uid}` : '',
        },
        method: 'POST',
        url: '/test-function',
        body: JSON.stringify({ data }),
      },
      acceptsStreaming: false, // ✅ CRITICAL - Prevents TypeScript errors
      ...options,
    }

    return baseRequest as CallableRequest<T>
  }

  /**
   * Create authenticated CallableRequest with device information
   * Used for testing device verification workflows
   */
  static createAuthenticatedRequest<T>(
    data: T,
    uid: string,
    deviceInfo?: {
      deviceId?: string
      platform?: 'android' | 'ios' | 'web'
      appVersion?: string
    }
  ): CallableRequest<T> {
    const enhancedData = {
      ...data,
      ...(deviceInfo && {
        deviceId: deviceInfo.deviceId,
        platform: deviceInfo.platform,
        appVersion: deviceInfo.appVersion,
      }),
    }

    return this.createCallableRequest(enhancedData, uid, {
      rawRequest: {
        headers: {
          'content-type': 'application/json',
          'user-agent': `SuperPool/${deviceInfo?.appVersion || '1.0.0'} (${deviceInfo?.platform || 'test'})`,
          'x-device-id': deviceInfo?.deviceId || 'test-device-id',
          authorization: `Bearer mock-token-${uid}`,
        },
        method: 'POST',
        url: '/authenticated-function',
        body: JSON.stringify({ data: enhancedData }),
      },
    })
  }

  /**
   * Create unauthenticated CallableRequest for testing auth failures
   */
  static createUnauthenticatedRequest<T>(data: T): CallableRequest<T> {
    return this.createCallableRequest(data, undefined, {
      auth: undefined,
      rawRequest: {
        headers: {
          'content-type': 'application/json',
          'user-agent': 'firebase-admin-node',
        },
        method: 'POST',
        url: '/unauthenticated-function',
        body: JSON.stringify({ data }),
      },
    })
  }

  /**
   * Create properly typed HttpsError for testing error scenarios
   * Matches Firebase Functions HttpsError structure exactly
   */
  static createHttpsError(code: string, message: string, details?: Record<string, unknown>): HttpsError {
    const error = new Error(message) as HttpsError & {
      code: string
      details?: Record<string, unknown>
      httpErrorCode: number
      name: string
      status: number
    }
    error.code = code
    error.details = details
    error.httpErrorCode = this.getHttpErrorCode(code)

    // Add Firebase-specific error properties
    error.name = 'HttpsError'
    error.status = error.httpErrorCode

    return error as HttpsError
  }

  /**
   * Map Firebase error codes to HTTP status codes
   * Based on official Firebase Functions error code mappings
   */
  private static getHttpErrorCode(code: string): number {
    const errorCodes: Record<string, number> = {
      // Client errors (4xx)
      'invalid-argument': 400,
      'failed-precondition': 400,
      'out-of-range': 400,
      unauthenticated: 401,
      'permission-denied': 403,
      'not-found': 404,
      'already-exists': 409,
      'resource-exhausted': 429,
      cancelled: 499,

      // Server errors (5xx)
      'data-loss': 500,
      unknown: 500,
      internal: 500,
      'not-implemented': 501,
      unavailable: 503,
      'deadline-exceeded': 504,
    }

    return errorCodes[code] || 500
  }

  /**
   * Setup Firebase Functions environment variables for testing
   * Configures the test environment to simulate Cloud Functions runtime
   */
  static setupFunctionsEnvironment(): void {
    // Core Functions environment
    process.env.FUNCTIONS_EMULATOR = 'true'
    process.env.GCLOUD_PROJECT = 'superpool-test'
    process.env.FUNCTION_REGION = 'us-central1'
    process.env.FUNCTION_MEMORY_MB = '512'
    process.env.FUNCTION_TIMEOUT_SEC = '60'

    // Firebase project configuration
    process.env.FIREBASE_CONFIG = JSON.stringify({
      projectId: 'superpool-test',
      storageBucket: 'superpool-test.appspot.com',
      locationId: 'us-central1',
      messagingSenderId: '123456789012',
      appId: '1:123456789012:web:abcdef123456',
    })

    // Authentication configuration
    process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099'
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080'
    process.env.FIREBASE_STORAGE_EMULATOR_HOST = 'localhost:9199'

    // Runtime configuration
    process.env.NODE_ENV = 'test'
    process.env.SUPERPOOL_ENV = 'test'
  }

  /**
   * Reset Firebase Functions environment to clean state
   * Removes all Functions-related environment variables
   */
  static resetFunctionsEnvironment(): void {
    const envVarsToDelete = [
      'FUNCTIONS_EMULATOR',
      'GCLOUD_PROJECT',
      'FUNCTION_REGION',
      'FUNCTION_MEMORY_MB',
      'FUNCTION_TIMEOUT_SEC',
      'FIREBASE_CONFIG',
      'FIREBASE_AUTH_EMULATOR_HOST',
      'FIRESTORE_EMULATOR_HOST',
      'FIREBASE_STORAGE_EMULATOR_HOST',
    ]

    envVarsToDelete.forEach((envVar) => {
      delete process.env[envVar]
    })
  }

  /**
   * Create a batch of test requests for load testing
   * Useful for performance testing scenarios
   */
  static createBatchRequests<T>(dataArray: T[], uid?: string, options?: Partial<MockCallableRequest<T>>): CallableRequest<T>[] {
    return dataArray.map((data) => this.createCallableRequest(data, uid, options))
  }

  /**
   * Create request with custom headers for testing edge cases
   */
  static createCustomHeaderRequest<T>(data: T, headers: Record<string, string>, uid?: string): CallableRequest<T> {
    return this.createCallableRequest(data, uid, {
      rawRequest: {
        headers,
        method: 'POST',
        url: '/custom-header-function',
        body: JSON.stringify({ data }),
      },
    })
  }

  /**
   * Create streaming request for testing streaming scenarios
   */
  static createStreamingRequest<T>(data: T, uid?: string): CallableRequest<T> {
    return this.createCallableRequest(data, uid, {
      acceptsStreaming: true, // ✅ Enable streaming
      rawRequest: {
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream',
          'cache-control': 'no-cache',
        },
        method: 'POST',
        url: '/streaming-function',
        body: JSON.stringify({ data }),
      },
    })
  }
}

/**
 * Common error scenarios for testing
 * Pre-configured HttpsError instances for common test cases
 */
export const CommonErrors = {
  // Authentication errors
  UNAUTHENTICATED: FunctionsMock.createHttpsError('unauthenticated', 'Authentication required'),

  PERMISSION_DENIED: FunctionsMock.createHttpsError('permission-denied', 'Insufficient permissions'),

  // Validation errors
  INVALID_ARGUMENT: FunctionsMock.createHttpsError('invalid-argument', 'Invalid request data', {
    field: 'test-field',
    value: 'invalid-value',
  }),

  // Resource errors
  NOT_FOUND: FunctionsMock.createHttpsError('not-found', 'Resource not found'),

  ALREADY_EXISTS: FunctionsMock.createHttpsError('already-exists', 'Resource already exists'),

  // Server errors
  INTERNAL_ERROR: FunctionsMock.createHttpsError('internal', 'Internal server error'),

  UNAVAILABLE: FunctionsMock.createHttpsError('unavailable', 'Service temporarily unavailable'),

  // Rate limiting
  RESOURCE_EXHAUSTED: FunctionsMock.createHttpsError('resource-exhausted', 'Rate limit exceeded'),
}

/**
 * Jest mock setup for firebase-functions/v2/https
 * Automatically configures Jest mocks when this file is imported
 */
jest.mock('firebase-functions/v2/https', () => ({
  onCall: jest.fn(
    (
      options: Record<string, unknown> | ((request: CallableRequest<unknown>) => Promise<unknown>),
      handler?: (request: CallableRequest<unknown>) => Promise<unknown>
    ) => {
      // Return the handler function for direct testing
      const actualHandler = handler || options
      const wrappedHandler = async (request: CallableRequest<unknown>) => {
        try {
          return await (actualHandler as (request: CallableRequest<unknown>) => Promise<unknown>)(request)
        } catch (error: unknown) {
          // Convert regular errors to HttpsError format for consistency
          if (error && typeof error === 'object' && 'code' in error) {
            return error
          }
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          throw FunctionsMock.createHttpsError('internal', errorMessage)
        }
      }

      // Add metadata for testing
      ;(wrappedHandler as Record<string, unknown>).options = typeof options === 'object' ? options : {}
      ;(wrappedHandler as Record<string, unknown>).originalHandler = actualHandler

      return wrappedHandler
    }
  ),

  HttpsError: jest
    .fn<(code: string, message: string, details?: Record<string, unknown>) => HttpsError>()
    .mockImplementation((code: string, message: string, details?: Record<string, unknown>) =>
      FunctionsMock.createHttpsError(code, message, details)
    ),

  // Export other Functions utilities that might be needed
  onRequest: jest.fn(),
  onDocumentCreated: jest.fn(),
  onDocumentUpdated: jest.fn(),
  onDocumentDeleted: jest.fn(),
}))

export default FunctionsMock
