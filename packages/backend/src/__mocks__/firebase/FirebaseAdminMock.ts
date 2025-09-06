/**
 * Comprehensive Firebase Admin SDK Mock System
 *
 * This mock provides complete Firebase Admin SDK simulation for testing
 * Cloud Functions, Firestore operations, and Authentication workflows.
 */

import { jest } from '@jest/globals'
import type { App, ServiceAccount, AppOptions } from 'firebase-admin/app'
import type { Auth, DecodedIdToken, UserRecord } from 'firebase-admin/auth'
import type {
  Firestore,
  DocumentSnapshot,
  QuerySnapshot,
  DocumentReference,
  CollectionReference,
  WriteBatch,
  Transaction,
  FieldValue,
} from 'firebase-admin/firestore'

export interface MockFirestoreDocument {
  id: string
  ref: DocumentReference
  exists: boolean
  data: () => any
  get: jest.MockedFunction<any>
  set: jest.MockedFunction<any>
  update: jest.MockedFunction<any>
  delete: jest.MockedFunction<any>
}

export interface MockFirestoreCollection {
  id: string
  path: string
  doc: jest.MockedFunction<any>
  add: jest.MockedFunction<any>
  get: jest.MockedFunction<any>
  where: jest.MockedFunction<any>
  orderBy: jest.MockedFunction<any>
  limit: jest.MockedFunction<any>
  offset: jest.MockedFunction<any>
}

export class FirebaseAdminMock {
  private static instance: FirebaseAdminMock

  // Mock instances
  public app: jest.Mocked<App>
  public auth: jest.Mocked<Auth>
  public firestore: jest.Mocked<Firestore>

  // Internal state for realistic mocking
  private mockDocuments = new Map<string, any>()
  private mockCollections = new Map<string, any[]>()
  private mockUsers = new Map<string, UserRecord>()

  private constructor() {
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
      options: {
        projectId: 'superpool-test',
        storageBucket: 'superpool-test.appspot.com',
      } as AppOptions,
      delete: jest.fn().mockResolvedValue(undefined),
    } as jest.Mocked<App>
  }

  private initializeAuthMock(): void {
    this.auth = {
      // User management
      getUser: jest.fn().mockImplementation((uid: string) => {
        const user = this.mockUsers.get(uid)
        if (!user) {
          const error = new Error(`There is no user record corresponding to the provided identifier: ${uid}`)
          ;(error as any).code = 'auth/user-not-found'
          throw error
        }
        return Promise.resolve(user)
      }),

      getUserByEmail: jest.fn().mockImplementation((email: string) => {
        const user = Array.from(this.mockUsers.values()).find((u) => u.email === email)
        if (!user) {
          const error = new Error(`There is no user record corresponding to the provided email: ${email}`)
          ;(error as any).code = 'auth/user-not-found'
          throw error
        }
        return Promise.resolve(user)
      }),

      createUser: jest.fn().mockImplementation((properties: any) => {
        const uid = properties.uid || `test-user-${Date.now()}`
        const user: UserRecord = {
          uid,
          email: properties.email,
          emailVerified: properties.emailVerified || false,
          displayName: properties.displayName,
          photoURL: properties.photoURL,
          phoneNumber: properties.phoneNumber,
          disabled: properties.disabled || false,
          metadata: {
            creationTime: new Date().toUTCString(),
            lastSignInTime: undefined,
            lastRefreshTime: undefined,
          },
          customClaims: properties.customClaims || {},
          providerData: [],
          toJSON: () => ({ uid, email: properties.email }),
        } as UserRecord

        this.mockUsers.set(uid, user)
        return Promise.resolve(user)
      }),

      updateUser: jest.fn().mockImplementation((uid: string, properties: any) => {
        const existingUser = this.mockUsers.get(uid)
        if (!existingUser) {
          const error = new Error(`There is no user record corresponding to the provided identifier: ${uid}`)
          ;(error as any).code = 'auth/user-not-found'
          throw error
        }

        const updatedUser = { ...existingUser, ...properties }
        this.mockUsers.set(uid, updatedUser)
        return Promise.resolve(updatedUser)
      }),

      deleteUser: jest.fn().mockImplementation((uid: string) => {
        const deleted = this.mockUsers.delete(uid)
        if (!deleted) {
          const error = new Error(`There is no user record corresponding to the provided identifier: ${uid}`)
          ;(error as any).code = 'auth/user-not-found'
          throw error
        }
        return Promise.resolve()
      }),

      // Token verification
      verifyIdToken: jest.fn().mockImplementation((idToken: string, checkRevoked?: boolean) => {
        // Simulate token validation
        if (idToken === 'invalid-token') {
          const error = new Error('Firebase ID token has invalid signature')
          ;(error as any).code = 'auth/id-token-expired'
          throw error
        }

        if (idToken === 'expired-token') {
          const error = new Error('Firebase ID token has expired')
          ;(error as any).code = 'auth/id-token-expired'
          throw error
        }

        const decodedToken: DecodedIdToken = {
          uid: 'test-user-id',
          email: 'test@example.com',
          email_verified: true,
          name: 'Test User',
          picture: 'https://example.com/avatar.jpg',
          aud: 'superpool-test',
          exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
          iat: Math.floor(Date.now() / 1000),
          iss: 'https://securetoken.google.com/superpool-test',
          sub: 'test-user-id',
          auth_time: Math.floor(Date.now() / 1000),
          firebase: {
            identities: {
              email: ['test@example.com'],
            },
            sign_in_provider: 'wallet',
          },
        }

        return Promise.resolve(decodedToken)
      }),

      createCustomToken: jest.fn().mockImplementation((uid: string, developerClaims?: any) => {
        const token = `mock-custom-token-${uid}-${Date.now()}`
        return Promise.resolve(token)
      }),

      // User listing
      listUsers: jest.fn().mockImplementation((maxResults?: number, pageToken?: string) => {
        const users = Array.from(this.mockUsers.values())
        const startIndex = pageToken ? parseInt(pageToken) : 0
        const endIndex = maxResults ? Math.min(startIndex + maxResults, users.length) : users.length
        const pageUsers = users.slice(startIndex, endIndex)

        return Promise.resolve({
          users: pageUsers,
          pageToken: endIndex < users.length ? endIndex.toString() : undefined,
        })
      }),

      // Custom claims
      setCustomUserClaims: jest.fn().mockImplementation((uid: string, customUserClaims: any) => {
        const user = this.mockUsers.get(uid)
        if (user) {
          user.customClaims = customUserClaims
          this.mockUsers.set(uid, user)
        }
        return Promise.resolve()
      }),
    } as unknown as jest.Mocked<Auth>
  }

  private initializeFirestoreMock(): void {
    // Create mock document factory
    const createMockDocument = (id: string, data?: any): MockFirestoreDocument => ({
      id,
      ref: {} as DocumentReference,
      exists: data !== undefined,
      data: jest.fn().mockReturnValue(data),
      get: jest.fn().mockResolvedValue({
        id,
        exists: data !== undefined,
        data: () => data,
      }),
      set: jest.fn().mockImplementation((newData: any, options?: any) => {
        if (options?.merge) {
          const existing = this.mockDocuments.get(id) || {}
          this.mockDocuments.set(id, { ...existing, ...newData })
        } else {
          this.mockDocuments.set(id, newData)
        }
        return Promise.resolve()
      }),
      update: jest.fn().mockImplementation((updates: any) => {
        const existing = this.mockDocuments.get(id) || {}
        this.mockDocuments.set(id, { ...existing, ...updates })
        return Promise.resolve()
      }),
      delete: jest.fn().mockImplementation(() => {
        this.mockDocuments.delete(id)
        return Promise.resolve()
      }),
    })

    // Create mock collection factory
    const createMockCollection = (collectionId: string): MockFirestoreCollection => ({
      id: collectionId,
      path: collectionId,
      doc: jest.fn().mockImplementation((docId?: string) => {
        const id = docId || `auto-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const fullPath = `${collectionId}/${id}`
        const data = this.mockDocuments.get(fullPath)
        return createMockDocument(id, data)
      }),
      add: jest.fn().mockImplementation((data: any) => {
        const id = `auto-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const fullPath = `${collectionId}/${id}`
        this.mockDocuments.set(fullPath, data)
        return Promise.resolve(createMockDocument(id, data))
      }),
      get: jest.fn().mockImplementation(() => {
        // Return all documents in collection
        const docs = Array.from(this.mockDocuments.entries())
          .filter(([path]) => path.startsWith(`${collectionId}/`))
          .map(([path, data]) => {
            const id = path.split('/').pop()!
            return createMockDocument(id, data)
          })

        return Promise.resolve({
          empty: docs.length === 0,
          size: docs.length,
          docs,
          forEach: (callback: any) => docs.forEach(callback),
        })
      }),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
    })

    this.firestore = {
      // Collection operations
      collection: jest.fn().mockImplementation((collectionPath: string) => {
        return createMockCollection(collectionPath)
      }),

      doc: jest.fn().mockImplementation((documentPath: string) => {
        const data = this.mockDocuments.get(documentPath)
        const id = documentPath.split('/').pop()!
        return createMockDocument(id, data)
      }),

      // Batch operations
      batch: jest.fn().mockImplementation(() => ({
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        commit: jest.fn().mockResolvedValue([]),
      })),

      // Transaction operations
      runTransaction: jest.fn().mockImplementation(async (callback: any) => {
        const mockTransaction = {
          get: jest.fn().mockImplementation((ref: any) => {
            // Mock transaction get
            return Promise.resolve({
              exists: true,
              data: () => ({}),
            })
          }),
          set: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
        }

        return await callback(mockTransaction)
      }),

      // Utility methods
      getAll: jest.fn().mockResolvedValue([]),
      listCollections: jest.fn().mockResolvedValue([]),

      // Field values
      FieldValue: {
        serverTimestamp: jest.fn().mockReturnValue('MOCK_SERVER_TIMESTAMP'),
        delete: jest.fn().mockReturnValue('MOCK_DELETE'),
        increment: jest.fn((value) => `MOCK_INCREMENT_${value}`),
        arrayUnion: jest.fn((values) => `MOCK_ARRAY_UNION_${JSON.stringify(values)}`),
        arrayRemove: jest.fn((values) => `MOCK_ARRAY_REMOVE_${JSON.stringify(values)}`),
      } as any,

      // Timestamps
      Timestamp: {
        now: jest.fn().mockReturnValue({
          seconds: Math.floor(Date.now() / 1000),
          nanoseconds: 0,
          toDate: () => new Date(),
        }),
        fromDate: jest.fn((date: Date) => ({
          seconds: Math.floor(date.getTime() / 1000),
          nanoseconds: (date.getTime() % 1000) * 1000000,
          toDate: () => date,
        })),
      } as any,
    } as unknown as jest.Mocked<Firestore>
  }

  // Test utilities
  resetAllMocks(): void {
    jest.clearAllMocks()

    // Clear internal state
    this.mockDocuments.clear()
    this.mockCollections.clear()
    this.mockUsers.clear()

    // Reinitialize with fresh mocks
    this.initializeAuthMock()
    this.initializeFirestoreMock()
  }

  // Data seeding for tests
  seedUser(user: Partial<UserRecord> & { uid: string }): void {
    const fullUser: UserRecord = {
      uid: user.uid,
      email: user.email || `${user.uid}@test.com`,
      emailVerified: user.emailVerified || true,
      displayName: user.displayName || 'Test User',
      photoURL: user.photoURL,
      phoneNumber: user.phoneNumber,
      disabled: user.disabled || false,
      metadata: {
        creationTime: new Date().toUTCString(),
        lastSignInTime: undefined,
        lastRefreshTime: undefined,
      },
      customClaims: user.customClaims || {},
      providerData: [],
      toJSON: () => ({ uid: user.uid, email: user.email }),
    } as UserRecord

    this.mockUsers.set(user.uid, fullUser)
  }

  seedDocument(path: string, data: any): void {
    this.mockDocuments.set(path, data)
  }

  getDocument(path: string): any {
    return this.mockDocuments.get(path)
  }

  getAllDocuments(): Map<string, any> {
    return new Map(this.mockDocuments)
  }

  // Error simulation
  simulateFirestoreError(errorCode: string = 'unavailable', message?: string): void {
    const error = new Error(message || `Simulated Firestore error: ${errorCode}`)
    ;(error as any).code = errorCode

    // Override collection method to throw error
    this.firestore.collection = jest.fn().mockRejectedValue(error)
    this.firestore.doc = jest.fn().mockRejectedValue(error)
  }

  simulateAuthError(errorCode: string = 'invalid-argument', message?: string): void {
    const error = new Error(message || `Simulated Auth error: ${errorCode}`)
    ;(error as any).code = errorCode

    this.auth.verifyIdToken = jest.fn().mockRejectedValue(error)
  }

  // Restore normal operation after error simulation
  restoreNormalOperation(): void {
    this.initializeFirestoreMock()
    this.initializeAuthMock()
  }
}

// Global mock instance
export const firebaseAdminMock = FirebaseAdminMock.getInstance()

// Jest module mocks
jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn().mockReturnValue(firebaseAdminMock.app),
  getApps: jest.fn().mockReturnValue([firebaseAdminMock.app]),
  deleteApp: jest.fn().mockResolvedValue(undefined),
  cert: jest.fn().mockReturnValue({}),
  applicationDefault: jest.fn().mockReturnValue({}),
}))

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn().mockReturnValue(firebaseAdminMock.auth),
}))

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn().mockReturnValue(firebaseAdminMock.firestore),
  FieldValue: firebaseAdminMock.firestore.FieldValue,
  Timestamp: firebaseAdminMock.firestore.Timestamp,
}))

export default firebaseAdminMock
