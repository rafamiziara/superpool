/**
 * Firebase Test Fixtures
 *
 * This file contains sample Firebase data, user records, Firestore documents,
 * and authentication patterns for comprehensive backend testing.
 */

import type { DecodedIdToken, UserRecord } from 'firebase-admin/auth'
import { SAMPLE_ADDRESSES } from './blockchain'

// Sample user records for Firebase Auth testing
export const SAMPLE_USERS: Record<string, Partial<UserRecord>> = {
  POOL_OWNER_1: {
    uid: 'pool-owner-1',
    email: 'poolowner1@superpool.test',
    emailVerified: true,
    displayName: 'Pool Owner One',
    disabled: false,
    customClaims: {
      walletAddress: SAMPLE_ADDRESSES.POOL_OWNER_1,
      role: 'pool_owner',
    },
    metadata: {
      creationTime: new Date('2024-01-15T10:00:00Z').toUTCString(),
      lastSignInTime: new Date('2024-01-20T15:30:00Z').toUTCString(),
    },
  },

  POOL_OWNER_2: {
    uid: 'pool-owner-2',
    email: 'poolowner2@superpool.test',
    emailVerified: true,
    displayName: 'Pool Owner Two',
    disabled: false,
    customClaims: {
      walletAddress: SAMPLE_ADDRESSES.POOL_OWNER_2,
      role: 'pool_owner',
    },
    metadata: {
      creationTime: new Date('2024-01-16T11:00:00Z').toUTCString(),
      lastSignInTime: new Date('2024-01-21T09:15:00Z').toUTCString(),
    },
  },

  BORROWER_1: {
    uid: 'borrower-1',
    email: 'borrower1@superpool.test',
    emailVerified: true,
    displayName: 'Borrower One',
    disabled: false,
    customClaims: {
      walletAddress: SAMPLE_ADDRESSES.BORROWER_1,
      role: 'borrower',
    },
    metadata: {
      creationTime: new Date('2024-01-17T14:00:00Z').toUTCString(),
      lastSignInTime: new Date('2024-01-22T12:45:00Z').toUTCString(),
    },
  },

  LENDER_1: {
    uid: 'lender-1',
    email: 'lender1@superpool.test',
    emailVerified: true,
    displayName: 'Lender One',
    disabled: false,
    customClaims: {
      walletAddress: SAMPLE_ADDRESSES.LENDER_1,
      role: 'lender',
    },
    metadata: {
      creationTime: new Date('2024-01-18T16:00:00Z').toUTCString(),
      lastSignInTime: new Date('2024-01-23T08:20:00Z').toUTCString(),
    },
  },

  SAFE_OWNER_1: {
    uid: 'safe-owner-1',
    email: 'safeowner1@superpool.test',
    emailVerified: true,
    displayName: 'Safe Owner One',
    disabled: false,
    customClaims: {
      walletAddress: SAMPLE_ADDRESSES.SAFE_OWNER_1,
      role: 'safe_owner',
      isAdmin: true,
    },
    metadata: {
      creationTime: new Date('2024-01-10T09:00:00Z').toUTCString(),
      lastSignInTime: new Date('2024-01-24T07:30:00Z').toUTCString(),
    },
  },

  UNVERIFIED_USER: {
    uid: 'unverified-user',
    email: 'unverified@superpool.test',
    emailVerified: false,
    displayName: 'Unverified User',
    disabled: false,
    customClaims: {},
    metadata: {
      creationTime: new Date('2024-01-19T18:00:00Z').toUTCString(),
      lastSignInTime: undefined,
    },
  },

  DISABLED_USER: {
    uid: 'disabled-user',
    email: 'disabled@superpool.test',
    emailVerified: true,
    displayName: 'Disabled User',
    disabled: true,
    customClaims: {
      walletAddress: '0x1111111111111111111111111111111111111111',
      role: 'suspended',
    },
    metadata: {
      creationTime: new Date('2024-01-12T12:00:00Z').toUTCString(),
      lastSignInTime: new Date('2024-01-13T10:00:00Z').toUTCString(),
    },
  },
}

// Sample decoded ID tokens for authentication testing
export const SAMPLE_ID_TOKENS: Record<string, DecodedIdToken> = {
  VALID_POOL_OWNER: {
    uid: 'pool-owner-1',
    email: 'poolowner1@superpool.test',
    email_verified: true,
    name: 'Pool Owner One',
    picture: 'https://example.com/avatar1.jpg',
    aud: 'superpool-test',
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    iat: Math.floor(Date.now() / 1000),
    iss: 'https://securetoken.google.com/superpool-test',
    sub: 'pool-owner-1',
    auth_time: Math.floor(Date.now() / 1000) - 300, // 5 minutes ago
    firebase: {
      identities: {
        email: ['poolowner1@superpool.test'],
      },
      sign_in_provider: 'wallet',
    },
    walletAddress: SAMPLE_ADDRESSES.POOL_OWNER_1,
    role: 'pool_owner',
  },

  EXPIRED_TOKEN: {
    uid: 'expired-user',
    email: 'expired@superpool.test',
    email_verified: true,
    aud: 'superpool-test',
    exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
    iat: Math.floor(Date.now() / 1000) - 7200, // Issued 2 hours ago
    iss: 'https://securetoken.google.com/superpool-test',
    sub: 'expired-user',
    auth_time: Math.floor(Date.now() / 1000) - 7200,
    firebase: {
      identities: {
        email: ['expired@superpool.test'],
      },
      sign_in_provider: 'wallet',
    },
  },

  INVALID_AUDIENCE: {
    uid: 'invalid-aud-user',
    email: 'invalid@example.com',
    email_verified: true,
    aud: 'wrong-project-id', // Wrong audience
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    iss: 'https://securetoken.google.com/wrong-project-id',
    sub: 'invalid-aud-user',
    auth_time: Math.floor(Date.now() / 1000),
    firebase: {
      identities: {
        email: ['invalid@example.com'],
      },
      sign_in_provider: 'wallet',
    },
  },
}

// Sample Firestore documents
export const SAMPLE_FIRESTORE_DOCS = {
  // Pools collection
  POOLS: {
    '1': {
      id: '1',
      address: '0x0000000000000000000000000000000000000001',
      owner: SAMPLE_ADDRESSES.POOL_OWNER_1,
      name: 'Basic Lending Pool',
      description: 'A simple lending pool for testing basic functionality',
      maxLoanAmount: '1000000000000000000000', // 1000 ETH in wei
      interestRate: 500, // 5%
      loanDuration: 2592000, // 30 days
      chainId: 80002,
      createdBy: 'pool-owner-1',
      createdAt: new Date('2024-01-15T10:30:00Z'),
      updatedAt: new Date('2024-01-15T10:30:00Z'),
      transactionHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      blockNumber: 1234567,
      isActive: true,
      metadata: {
        eventId: 'pool-created-1-0',
        logIndex: 0,
        syncedAt: new Date('2024-01-15T10:31:00Z'),
        version: 1,
      },
      stats: {
        totalLent: '0',
        totalBorrowed: '0',
        activeLoans: 0,
        completedLoans: 0,
        defaultedLoans: 0,
        apr: 5.0,
        utilization: 0,
      },
    },

    '2': {
      id: '2',
      address: '0x0000000000000000000000000000000000000002',
      owner: SAMPLE_ADDRESSES.POOL_OWNER_2,
      name: 'High Interest Short Term Pool',
      description: 'Higher risk, higher reward short-term lending pool',
      maxLoanAmount: '500000000000000000000', // 500 ETH in wei
      interestRate: 1200, // 12%
      loanDuration: 1296000, // 15 days
      chainId: 80002,
      createdBy: 'pool-owner-2',
      createdAt: new Date('2024-01-16T11:30:00Z'),
      updatedAt: new Date('2024-01-16T11:30:00Z'),
      transactionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      blockNumber: 1234568,
      isActive: true,
      metadata: {
        eventId: 'pool-created-2-0',
        logIndex: 0,
        syncedAt: new Date('2024-01-16T11:31:00Z'),
        version: 1,
      },
      stats: {
        totalLent: '100000000000000000000', // 100 ETH
        totalBorrowed: '50000000000000000000', // 50 ETH
        activeLoans: 2,
        completedLoans: 1,
        defaultedLoans: 0,
        apr: 12.0,
        utilization: 50,
      },
    },
  },

  // Auth nonces collection
  AUTH_NONCES: {
    'nonce-123': {
      walletAddress: SAMPLE_ADDRESSES.POOL_OWNER_1,
      nonce: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      timestamp: Date.now() - 300000, // 5 minutes ago
      expiresAt: new Date(Date.now() + 300000), // 5 minutes from now
      used: false,
      createdAt: new Date(Date.now() - 300000),
    },

    'nonce-456': {
      walletAddress: SAMPLE_ADDRESSES.BORROWER_1,
      nonce: 'fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
      timestamp: Date.now() - 1200000, // 20 minutes ago
      expiresAt: new Date(Date.now() - 600000), // Expired 10 minutes ago
      used: false,
      createdAt: new Date(Date.now() - 1200000),
    },

    'nonce-789': {
      walletAddress: SAMPLE_ADDRESSES.LENDER_1,
      nonce: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      timestamp: Date.now() - 100000, // 100 seconds ago
      expiresAt: new Date(Date.now() + 500000), // Valid for 500 more seconds
      used: true, // Already used
      createdAt: new Date(Date.now() - 100000),
    },
  },

  // Users collection
  USERS: {
    'pool-owner-1': {
      uid: 'pool-owner-1',
      walletAddress: SAMPLE_ADDRESSES.POOL_OWNER_1,
      email: 'poolowner1@superpool.test',
      displayName: 'Pool Owner One',
      createdAt: new Date('2024-01-15T10:00:00Z'),
      lastLoginAt: new Date('2024-01-20T15:30:00Z'),
      role: 'pool_owner',
      isActive: true,
      preferences: {
        notifications: true,
        theme: 'dark',
        language: 'en',
      },
    },

    'borrower-1': {
      uid: 'borrower-1',
      walletAddress: SAMPLE_ADDRESSES.BORROWER_1,
      email: 'borrower1@superpool.test',
      displayName: 'Borrower One',
      createdAt: new Date('2024-01-17T14:00:00Z'),
      lastLoginAt: new Date('2024-01-22T12:45:00Z'),
      role: 'borrower',
      isActive: true,
      borrowingHistory: {
        totalBorrowed: '25000000000000000000', // 25 ETH
        activeLoans: 1,
        completedLoans: 3,
        defaultedLoans: 0,
        creditScore: 750,
      },
    },
  },

  // Approved devices collection
  APPROVED_DEVICES: {
    'device-123': {
      deviceId: 'device-123',
      userId: 'pool-owner-1',
      walletAddress: SAMPLE_ADDRESSES.POOL_OWNER_1,
      approvedAt: new Date('2024-01-15T10:05:00Z'),
      lastUsedAt: new Date('2024-01-20T15:30:00Z'),
      deviceInfo: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        platform: 'Windows',
        ip: '192.168.1.100',
      },
      isActive: true,
    },
  },

  // Safe transactions collection
  SAFE_TRANSACTIONS: {
    'safe-tx-1': {
      transactionHash: '0xabc1234567890123456789012345678901234567890123456789012345678901',
      safeAddress: SAMPLE_ADDRESSES.SAFE_ADDRESS,
      safeTransaction: {
        to: SAMPLE_ADDRESSES.POOL_FACTORY,
        value: '0',
        data: '0x1234567890abcdef',
        operation: 0,
        safeTxGas: '0',
        baseGas: '0',
        gasPrice: '0',
        gasToken: SAMPLE_ADDRESSES.ZERO_ADDRESS,
        refundReceiver: SAMPLE_ADDRESSES.ZERO_ADDRESS,
        nonce: '42',
      },
      poolParams: {
        poolOwner: SAMPLE_ADDRESSES.POOL_OWNER_3,
        maxLoanAmount: '10000000000000000000000', // 10,000 ETH
        interestRate: 300,
        loanDuration: 7776000,
        name: 'Large Enterprise Pool',
        description: 'Large pool for enterprise-level lending',
      },
      chainId: 80002,
      status: 'pending_signatures',
      requiredSignatures: 3,
      currentSignatures: 1,
      signatures: [
        {
          signer: SAMPLE_ADDRESSES.SAFE_OWNER_1,
          signature: '0x1234567890abcdef...',
          signedAt: new Date('2024-01-24T10:00:00Z'),
        },
      ],
      createdBy: 'safe-owner-1',
      createdAt: new Date('2024-01-24T10:00:00Z'),
      expiresAt: new Date('2024-01-31T10:00:00Z'), // 7 days
      type: 'pool_creation',
    },
  },

  // Event logs collection
  EVENT_LOGS: {
    'pool-created-1-0': {
      eventType: 'PoolCreated',
      contractAddress: SAMPLE_ADDRESSES.POOL_FACTORY,
      chainId: 80002,
      poolId: '1',
      poolAddress: '0x0000000000000000000000000000000000000001',
      poolOwner: SAMPLE_ADDRESSES.POOL_OWNER_1,
      name: 'Basic Lending Pool',
      maxLoanAmount: '1000000000000000000000',
      interestRate: 500,
      loanDuration: 2592000,
      transactionHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      blockNumber: 1234567,
      logIndex: 0,
      timestamp: Math.floor(Date.parse('2024-01-15T10:30:00Z') / 1000),
      processedAt: new Date('2024-01-15T10:31:00Z'),
      validationPassed: true,
    },
  },

  // Pool owners index
  POOL_OWNERS: {
    [SAMPLE_ADDRESSES.POOL_OWNER_1]: {
      address: SAMPLE_ADDRESSES.POOL_OWNER_1,
      poolIds: ['1'],
      lastPoolCreated: new Date('2024-01-15T10:30:00Z'),
      totalPools: 1,
      stats: {
        totalValueLocked: '1000000000000000000000', // 1000 ETH
        avgInterestRate: 500, // 5%
        successRate: 100,
      },
    },

    [SAMPLE_ADDRESSES.POOL_OWNER_2]: {
      address: SAMPLE_ADDRESSES.POOL_OWNER_2,
      poolIds: ['2'],
      lastPoolCreated: new Date('2024-01-16T11:30:00Z'),
      totalPools: 1,
      stats: {
        totalValueLocked: '500000000000000000000', // 500 ETH
        avgInterestRate: 1200, // 12%
        successRate: 100,
      },
    },
  },
}

// Sample authentication messages for wallet signing
export const SAMPLE_AUTH_MESSAGES = {
  VALID_MESSAGE: (walletAddress: string, nonce: string, timestamp: number) =>
    `SuperPool Authentication\nWallet: ${walletAddress}\nNonce: ${nonce}\nTimestamp: ${timestamp}\nThis message will expire in 10 minutes.`,

  EXPIRED_MESSAGE: (walletAddress: string, nonce: string) =>
    `SuperPool Authentication\nWallet: ${walletAddress}\nNonce: ${nonce}\nTimestamp: ${Date.now() - 900000}\nThis message will expire in 10 minutes.`,

  INVALID_FORMAT: 'Invalid authentication message format',
}

// Sample error scenarios for Firebase testing
export const SAMPLE_FIREBASE_ERRORS = {
  AUTH_INVALID_TOKEN: {
    code: 'auth/id-token-expired',
    message: 'Firebase ID token has expired. Get a fresh token from your client app and try again.',
  },

  AUTH_USER_NOT_FOUND: {
    code: 'auth/user-not-found',
    message: 'There is no user record corresponding to the provided identifier.',
  },

  AUTH_INVALID_EMAIL: {
    code: 'auth/invalid-email',
    message: 'The email address is improperly formatted.',
  },

  FIRESTORE_PERMISSION_DENIED: {
    code: 'permission-denied',
    message: 'Missing or insufficient permissions.',
  },

  FIRESTORE_NOT_FOUND: {
    code: 'not-found',
    message: 'The document does not exist.',
  },

  FIRESTORE_ALREADY_EXISTS: {
    code: 'already-exists',
    message: 'The document already exists.',
  },

  FIRESTORE_UNAVAILABLE: {
    code: 'unavailable',
    message: 'The service is currently unavailable.',
  },

  FIRESTORE_DEADLINE_EXCEEDED: {
    code: 'deadline-exceeded',
    message: 'The deadline expired before the operation could complete.',
  },
}

// Helper functions for creating test data
export class FirebaseFixtures {
  /**
   * Create a sample user record with custom properties
   */
  static createUser(overrides: Partial<UserRecord> = {}): UserRecord {
    const baseUser = {
      uid: `user-${Date.now()}`,
      email: `user-${Date.now()}@test.com`,
      emailVerified: true,
      displayName: 'Test User',
      disabled: false,
      metadata: {
        creationTime: new Date().toUTCString(),
        lastSignInTime: new Date().toUTCString(),
      },
      customClaims: {},
      providerData: [],
      toJSON: () => ({ uid: overrides.uid || `user-${Date.now()}` }),
    } as UserRecord

    return { ...baseUser, ...overrides }
  }

  /**
   * Create a sample decoded ID token
   */
  static createIdToken(overrides: Partial<DecodedIdToken> = {}): DecodedIdToken {
    const now = Math.floor(Date.now() / 1000)

    return {
      uid: `user-${Date.now()}`,
      aud: 'superpool-test',
      exp: now + 3600,
      iat: now,
      iss: 'https://securetoken.google.com/superpool-test',
      sub: `user-${Date.now()}`,
      auth_time: now,
      firebase: {
        identities: {},
        sign_in_provider: 'wallet',
      },
      ...overrides,
    }
  }

  /**
   * Create a sample nonce document
   */
  static createNonce(walletAddress: string, overrides: any = {}) {
    const timestamp = Date.now()

    return {
      walletAddress,
      nonce: Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
      timestamp,
      expiresAt: new Date(timestamp + 600000), // 10 minutes
      used: false,
      createdAt: new Date(timestamp),
      ...overrides,
    }
  }

  /**
   * Create a sample pool document
   */
  static createPoolDocument(poolId: string, overrides: any = {}) {
    return {
      id: poolId,
      address: `0x${'0'.repeat(39)}${poolId}`,
      owner: SAMPLE_ADDRESSES.POOL_OWNER_1,
      name: `Test Pool ${poolId}`,
      description: `Test pool ${poolId} for comprehensive testing`,
      maxLoanAmount: '1000000000000000000000', // 1000 ETH
      interestRate: 500, // 5%
      loanDuration: 2592000, // 30 days
      chainId: 80002,
      createdBy: 'pool-owner-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      transactionHash: `0x${'pool'.padEnd(60, '0')}${poolId.padStart(4, '0')}`,
      blockNumber: 1234567,
      isActive: true,
      ...overrides,
    }
  }
}

export default {
  SAMPLE_USERS,
  SAMPLE_ID_TOKENS,
  SAMPLE_FIRESTORE_DOCS,
  SAMPLE_AUTH_MESSAGES,
  SAMPLE_FIREBASE_ERRORS,
  FirebaseFixtures,
}
