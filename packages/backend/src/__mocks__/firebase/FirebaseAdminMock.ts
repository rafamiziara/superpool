/**
 * Comprehensive Firebase Admin SDK Mock System
 *
 * This mock provides complete Firebase Admin SDK simulation for testing
 * Cloud Functions, Firestore operations, and Authentication workflows.
 * Completely updated with proper TypeScript support and Jest compatibility.
 */

import { jest } from '@jest/globals'

// Properly typed interfaces for Firebase mocking
export interface MockDecodedIdToken {
  uid: string
  email?: string
  email_verified?: boolean
  name?: string
  picture?: string
  aud: string
  exp: number
  iat: number
  iss: string
  sub: string
  auth_time: number
  firebase: {
    identities: Record<string, string[]>
    sign_in_provider: string
  }
}

export interface MockUserMetadata {
  creationTime: string
  lastSignInTime?: string
  lastRefreshTime?: string
}

export interface MockUserRecord {
  uid: string
  email?: string
  emailVerified?: boolean
  displayName?: string
  photoURL?: string
  phoneNumber?: string
  disabled: boolean
  metadata: MockUserMetadata
  customClaims?: Record<string, unknown>
  providerData: unknown[]
  toJSON: () => Record<string, unknown>
}

export interface MockDocumentData {
  [field: string]: unknown
}

export interface MockDocumentSnapshot {
  id: string
  exists: boolean
  data: () => MockDocumentData | undefined
  ref: MockDocumentReference
}

export interface MockDocumentReference {
  id: string
  path: string
  collection: (collectionPath: string) => MockCollectionReference
  get: jest.MockedFunction<() => Promise<MockDocumentSnapshot>>
  set: jest.MockedFunction<(data: MockDocumentData, options?: { merge?: boolean }) => Promise<void>>
  update: jest.MockedFunction<(updates: Partial<MockDocumentData>) => Promise<void>>
  delete: jest.MockedFunction<() => Promise<void>>
}

export interface MockQuerySnapshot {
  empty: boolean
  size: number
  docs: MockDocumentSnapshot[]
  forEach: (callback: (doc: MockDocumentSnapshot) => void) => void
}

export interface MockCollectionReference {
  id: string
  path: string
  doc: jest.MockedFunction<(documentPath?: string) => MockDocumentReference>
  add: jest.MockedFunction<(data: MockDocumentData) => Promise<MockDocumentReference>>
  get: jest.MockedFunction<() => Promise<MockQuerySnapshot>>
  where: jest.MockedFunction<(field: string, op: string, value: unknown) => MockCollectionReference>
  orderBy: jest.MockedFunction<(field: string, direction?: 'asc' | 'desc') => MockCollectionReference>
  limit: jest.MockedFunction<(limit: number) => MockCollectionReference>
  offset: jest.MockedFunction<(offset: number) => MockCollectionReference>
}

// Type aliases for backwards compatibility
export type MockFirestoreDocument = MockDocumentSnapshot
export type MockFirestoreCollection = MockCollectionReference

export interface MockTransaction {
  get: jest.MockedFunction<(ref: MockDocumentReference) => Promise<MockDocumentSnapshot>>
  set: jest.MockedFunction<(ref: MockDocumentReference, data: MockDocumentData) => void>
  update: jest.MockedFunction<(ref: MockDocumentReference, updates: Partial<MockDocumentData>) => void>
  delete: jest.MockedFunction<(ref: MockDocumentReference) => void>
}

export interface MockWriteBatch {
  set: jest.MockedFunction<(ref: MockDocumentReference, data: MockDocumentData) => MockWriteBatch>
  update: jest.MockedFunction<(ref: MockDocumentReference, updates: Partial<MockDocumentData>) => MockWriteBatch>
  delete: jest.MockedFunction<(ref: MockDocumentReference) => MockWriteBatch>
  commit: jest.MockedFunction<() => Promise<unknown[]>>
}

export interface MockFieldValue {
  serverTimestamp: jest.MockedFunction<() => string>
  delete: jest.MockedFunction<() => string>
  increment: jest.MockedFunction<(value: number) => string>
  arrayUnion: jest.MockedFunction<(values: unknown[]) => string>
  arrayRemove: jest.MockedFunction<(values: unknown[]) => string>
}

export interface MockTimestamp {
  seconds: number
  nanoseconds: number
  toDate: () => Date
}

export interface MockTimestampStatic {
  now: jest.MockedFunction<() => MockTimestamp>
  fromDate: jest.MockedFunction<(date: Date) => MockTimestamp>
}

export interface MockFirestore {
  collection: jest.MockedFunction<(collectionPath: string) => MockCollectionReference>
  doc: jest.MockedFunction<(documentPath: string) => MockDocumentReference>
  batch: jest.MockedFunction<() => MockWriteBatch>
  runTransaction: jest.MockedFunction<(callback: (transaction: MockTransaction) => Promise<unknown>) => Promise<unknown>>
  getAll: jest.MockedFunction<(...documentRefs: MockDocumentReference[]) => Promise<MockDocumentSnapshot[]>>
  listCollections: jest.MockedFunction<() => Promise<MockCollectionReference[]>>
  FieldValue: MockFieldValue
  Timestamp: MockTimestampStatic
}

export interface MockAuth {
  getUser: jest.MockedFunction<(uid: string) => Promise<MockUserRecord>>
  getUserByEmail: jest.MockedFunction<(email: string) => Promise<MockUserRecord>>
  createUser: jest.MockedFunction<(properties: Partial<MockUserRecord>) => Promise<MockUserRecord>>
  updateUser: jest.MockedFunction<(uid: string, properties: Partial<MockUserRecord>) => Promise<MockUserRecord>>
  deleteUser: jest.MockedFunction<(uid: string) => Promise<void>>
  verifyIdToken: jest.MockedFunction<(idToken: string, checkRevoked?: boolean) => Promise<MockDecodedIdToken>>
  createCustomToken: jest.MockedFunction<(uid: string, developerClaims?: Record<string, unknown>) => Promise<string>>
  listUsers: jest.MockedFunction<(maxResults?: number, pageToken?: string) => Promise<{ users: MockUserRecord[]; pageToken?: string }>>
  setCustomUserClaims: jest.MockedFunction<(uid: string, customUserClaims: Record<string, unknown>) => Promise<void>>
}

export interface MockAppCheckToken {
  token: string
  ttlMillis: number
}

export interface MockAppCheck {
  createToken: jest.MockedFunction<(appId: string, options?: { ttlMillis?: number }) => Promise<MockAppCheckToken>>
  verifyToken: jest.MockedFunction<(appCheckToken: string) => Promise<{ appId: string; token: MockAppCheckToken }>>
}

export interface MockApp {
  name: string
  options: {
    projectId?: string
    storageBucket?: string
  }
  delete: jest.MockedFunction<() => Promise<void>>
}

export class FirebaseAdminMock {
  private static instance: FirebaseAdminMock

  // Mock instances
  public app!: MockApp
  public auth!: MockAuth
  public firestore!: MockFirestore
  public appCheck!: MockAppCheck

  // Internal state for realistic mocking
  private mockDocuments = new Map<string, MockDocumentData>()
  private mockCollections = new Map<string, MockDocumentData[]>()
  private mockUsers = new Map<string, MockUserRecord>()

  private constructor() {
    this.initializeAppMock()
    this.initializeAuthMock()
    this.initializeFirestoreMock()
    this.initializeAppCheckMock()
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
      },
      delete: jest.fn(async () => void 0),
    }
  }

  private initializeAuthMock(): void {
    this.auth = {
      // User management
      getUser: jest.fn(async (uid: string) => {
        const user = this.mockUsers.get(uid)
        if (!user) {
          const error = new Error(`There is no user record corresponding to the provided identifier: ${uid}`) as Error & { code: string }
          error.code = 'auth/user-not-found'
          throw error
        }
        return user
      }),

      getUserByEmail: jest.fn(async (email: string) => {
        const user = Array.from(this.mockUsers.values()).find((u) => u.email === email)
        if (!user) {
          const error = new Error(`There is no user record corresponding to the provided email: ${email}`) as Error & { code: string }
          error.code = 'auth/user-not-found'
          throw error
        }
        return user
      }),

      createUser: jest.fn(async (properties: Partial<MockUserRecord>) => {
        const uid = properties.uid || `test-user-${Date.now()}`
        const user: MockUserRecord = {
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
        }

        this.mockUsers.set(uid, user)
        return user
      }),

      updateUser: jest.fn(async (uid: string, properties: Partial<MockUserRecord>) => {
        const existingUser = this.mockUsers.get(uid)
        if (!existingUser) {
          const error = new Error(`There is no user record corresponding to the provided identifier: ${uid}`) as Error & { code: string }
          error.code = 'auth/user-not-found'
          throw error
        }

        const updatedUser = { ...existingUser, ...properties }
        this.mockUsers.set(uid, updatedUser)
        return updatedUser
      }),

      deleteUser: jest.fn(async (uid: string) => {
        const deleted = this.mockUsers.delete(uid)
        if (!deleted) {
          const error = new Error(`There is no user record corresponding to the provided identifier: ${uid}`) as Error & { code: string }
          error.code = 'auth/user-not-found'
          throw error
        }
      }),

      // Token verification
      verifyIdToken: jest.fn(async (idToken: string) => {
        // Simulate token validation
        if (idToken === 'invalid-token') {
          const error = new Error('Firebase ID token has invalid signature') as Error & { code: string }
          error.code = 'auth/id-token-expired'
          throw error
        }

        if (idToken === 'expired-token') {
          const error = new Error('Firebase ID token has expired') as Error & { code: string }
          error.code = 'auth/id-token-expired'
          throw error
        }

        const decodedToken: MockDecodedIdToken = {
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

        return decodedToken
      }),

      createCustomToken: jest.fn(async (uid: string) => {
        const token = `mock-custom-token-${uid}-${Date.now()}`
        return token
      }),

      // User listing
      listUsers: jest.fn(async (maxResults?: number, pageToken?: string) => {
        const users = Array.from(this.mockUsers.values())
        const startIndex = pageToken ? parseInt(pageToken) : 0
        const endIndex = maxResults ? Math.min(startIndex + maxResults, users.length) : users.length
        const pageUsers = users.slice(startIndex, endIndex)

        return {
          users: pageUsers,
          pageToken: endIndex < users.length ? endIndex.toString() : undefined,
        }
      }),

      // Custom claims
      setCustomUserClaims: jest.fn(async (uid: string, customUserClaims: Record<string, unknown>) => {
        const user = this.mockUsers.get(uid)
        if (user) {
          user.customClaims = customUserClaims
          this.mockUsers.set(uid, user)
        }
      }),
    }
  }

  private initializeFirestoreMock(): void {
    // Create mock document factory
    const createMockDocument = (id: string, data?: MockDocumentData): MockDocumentSnapshot & MockDocumentReference => ({
      id,
      path: `mock-collection/${id}`,
      exists: data !== undefined,
      data: jest.fn(() => data),
      ref: {} as MockDocumentReference,
      collection: jest.fn((collectionPath: string) => this.createMockCollection(collectionPath)),
      get: jest.fn(async () => ({
        id,
        exists: data !== undefined,
        data: () => data,
        ref: {} as MockDocumentReference,
      })),
      set: jest.fn(async (newData: MockDocumentData, options?: { merge?: boolean }) => {
        if (options?.merge) {
          const existing = this.mockDocuments.get(id) || {}
          this.mockDocuments.set(id, { ...existing, ...newData })
        } else {
          this.mockDocuments.set(id, newData)
        }
      }),
      update: jest.fn(async (updates: Partial<MockDocumentData>) => {
        const existing = this.mockDocuments.get(id) || {}
        this.mockDocuments.set(id, { ...existing, ...updates })
      }),
      delete: jest.fn(async () => {
        this.mockDocuments.delete(id)
      }),
    })

    // Create mock collection factory
    const createMockCollection = (collectionId: string): MockCollectionReference => ({
      id: collectionId,
      path: collectionId,
      doc: jest.fn((docId?: string) => {
        const id = docId || `auto-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const fullPath = `${collectionId}/${id}`
        const data = this.mockDocuments.get(fullPath)
        return createMockDocument(id, data)
      }),
      add: jest.fn(async (data: MockDocumentData) => {
        const id = `auto-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const fullPath = `${collectionId}/${id}`
        this.mockDocuments.set(fullPath, data)
        return createMockDocument(id, data)
      }),
      get: jest.fn(async () => {
        // Return all documents in collection
        const docs = Array.from(this.mockDocuments.entries())
          .filter(([path]) => path.startsWith(`${collectionId}/`))
          .map(([path, data]) => {
            const id = path.split('/').pop()!
            return createMockDocument(id, data)
          })

        return {
          empty: docs.length === 0,
          size: docs.length,
          docs,
          forEach: (callback: (doc: MockDocumentSnapshot) => void) => docs.forEach(callback),
        }
      }),
      where: jest.fn(() => createMockCollection(collectionId)),
      orderBy: jest.fn(() => createMockCollection(collectionId)),
      limit: jest.fn(() => createMockCollection(collectionId)),
      offset: jest.fn(() => createMockCollection(collectionId)),
    })

    // Store reference to collection factory for later use
    this.createMockCollection = createMockCollection

    this.firestore = {
      // Collection operations
      collection: jest.fn((collectionPath: string) => createMockCollection(collectionPath)),

      doc: jest.fn((documentPath: string) => {
        const data = this.mockDocuments.get(documentPath)
        const id = documentPath.split('/').pop()!
        return createMockDocument(id, data)
      }),

      // Batch operations
      batch: jest.fn(
        (): MockWriteBatch => ({
          set: jest.fn(function (this: MockWriteBatch) {
            return this
          }),
          update: jest.fn(function (this: MockWriteBatch) {
            return this
          }),
          delete: jest.fn(function (this: MockWriteBatch) {
            return this
          }),
          commit: jest.fn(async () => []),
        })
      ),

      // Transaction operations
      runTransaction: jest.fn(async (callback: (transaction: MockTransaction) => Promise<unknown>) => {
        const mockTransaction: MockTransaction = {
          get: jest.fn(async () => ({
            id: 'mock-id',
            exists: true,
            data: () => ({}),
            ref: {} as MockDocumentReference,
          })),
          set: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
        }

        return await callback(mockTransaction)
      }),

      // Utility methods
      getAll: jest.fn(async () => []),
      listCollections: jest.fn(async () => []),

      // Field values
      FieldValue: {
        serverTimestamp: jest.fn(() => 'MOCK_SERVER_TIMESTAMP'),
        delete: jest.fn(() => 'MOCK_DELETE'),
        increment: jest.fn((value: number) => `MOCK_INCREMENT_${value}`),
        arrayUnion: jest.fn((values: unknown[]) => `MOCK_ARRAY_UNION_${JSON.stringify(values)}`),
        arrayRemove: jest.fn((values: unknown[]) => `MOCK_ARRAY_REMOVE_${JSON.stringify(values)}`),
      },

      // Timestamps
      Timestamp: {
        now: jest.fn(
          (): MockTimestamp => ({
            seconds: Math.floor(Date.now() / 1000),
            nanoseconds: 0,
            toDate: () => new Date(),
          })
        ),
        fromDate: jest.fn(
          (date: Date): MockTimestamp => ({
            seconds: Math.floor(date.getTime() / 1000),
            nanoseconds: (date.getTime() % 1000) * 1000000,
            toDate: () => date,
          })
        ),
      },
    }
  }

  // Collection factory reference for internal use
  private createMockCollection!: (collectionId: string) => MockCollectionReference

  private initializeAppCheckMock(): void {
    this.appCheck = {
      createToken: jest.fn(async (appId: string, options?: { ttlMillis?: number }): Promise<MockAppCheckToken> => {
        const ttlMillis = options?.ttlMillis || 3600000 // Default 1 hour
        return {
          token: `mock-app-check-token-${Date.now()}`,
          ttlMillis,
        }
      }),
      verifyToken: jest.fn(async (appCheckToken: string) => {
        return {
          appId: 'superpool-test',
          token: {
            token: appCheckToken,
            ttlMillis: 3600000,
          },
        }
      }),
    }
  }

  // Public accessor for App Check mock
  getAppCheckMock(): MockAppCheck {
    return this.appCheck
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
    this.initializeAppCheckMock()
  }

  // Data seeding for tests
  seedUser(user: Partial<MockUserRecord> & { uid: string }): void {
    const fullUser: MockUserRecord = {
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
    }

    this.mockUsers.set(user.uid, fullUser)
  }

  seedDocument(path: string, data: MockDocumentData): void {
    this.mockDocuments.set(path, data)
  }

  getDocument(path: string): MockDocumentData | undefined {
    return this.mockDocuments.get(path)
  }

  getAllDocuments(): Map<string, MockDocumentData> {
    return new Map(this.mockDocuments)
  }

  // Error simulation
  simulateFirestoreError(errorCode: string = 'unavailable', message?: string): void {
    const error = new Error(message || `Simulated Firestore error: ${errorCode}`) as Error & { code: string }
    error.code = errorCode

    // Override collection method to throw error
    this.firestore.collection = jest.fn(() => {
      throw error
    }) as jest.MockedFunction<(collectionPath: string) => MockCollectionReference>
    this.firestore.doc = jest.fn(() => {
      throw error
    }) as jest.MockedFunction<(documentPath: string) => MockDocumentReference>
  }

  simulateAuthError(errorCode: string = 'invalid-argument', message?: string): void {
    const error = new Error(message || `Simulated Auth error: ${errorCode}`) as Error & { code: string }
    error.code = errorCode

    this.auth.verifyIdToken = jest.fn(async () => {
      throw error
    })
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
  initializeApp: jest.fn(() => firebaseAdminMock.app),
  getApps: jest.fn(() => [firebaseAdminMock.app]),
  deleteApp: jest.fn(async () => void 0),
  cert: jest.fn(() => ({})),
  applicationDefault: jest.fn(() => ({})),
}))

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => firebaseAdminMock.auth),
}))

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => firebaseAdminMock.firestore),
  FieldValue: firebaseAdminMock.firestore.FieldValue,
  Timestamp: firebaseAdminMock.firestore.Timestamp,
}))

jest.mock('firebase-admin/app-check', () => ({
  getAppCheck: jest.fn(() => firebaseAdminMock.appCheck),
}))

export default firebaseAdminMock
