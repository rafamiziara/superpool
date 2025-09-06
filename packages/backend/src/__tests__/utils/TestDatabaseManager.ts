/**
 * Test Database Management System
 *
 * Comprehensive database management for testing environments including
 * Firestore emulator management, test data seeding, cleanup automation,
 * and state isolation between tests.
 */

import { connectFirestoreEmulator, Firestore } from 'firebase/firestore'
import { deleteApp, getApps, initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { EventEmitter } from 'events'
import { ChildProcess, spawn } from 'child_process'

// Database management configuration
export interface TestDatabaseConfig {
  projectId: string
  host: string
  port: number
  emulatorPath?: string
  dataDirectory?: string
  rules?: string
  autoCleanup: boolean
  seedData: boolean
}

// Test data seeding configuration
export interface SeedingConfig {
  collections: CollectionSeedConfig[]
  batchSize: number
  parallel: boolean
  validateAfterSeed: boolean
}

export interface CollectionSeedConfig {
  name: string
  documents: DocumentSeedConfig[]
  indexes?: IndexConfig[]
}

export interface DocumentSeedConfig {
  id?: string
  data: Record<string, any>
  subcollections?: CollectionSeedConfig[]
}

export interface IndexConfig {
  fields: { fieldPath: string; order: 'asc' | 'desc' }[]
  collectionGroup?: boolean
}

// Database state management
export interface DatabaseSnapshot {
  timestamp: number
  collections: Map<string, CollectionSnapshot>
  metadata: SnapshotMetadata
}

export interface CollectionSnapshot {
  name: string
  documentCount: number
  documents: Map<string, any>
  indexes: IndexConfig[]
}

export interface SnapshotMetadata {
  testSuite: string
  testCase: string
  snapshotId: string
  size: number
}

export class TestDatabaseManager extends EventEmitter {
  private static instance: TestDatabaseManager
  private config: TestDatabaseConfig
  private firestore: Firestore | null = null
  private emulatorProcess: ChildProcess | null = null
  private snapshots: Map<string, DatabaseSnapshot> = new Map()
  private initialized: boolean = false
  private testIsolationEnabled: boolean = true

  private constructor(config: TestDatabaseConfig) {
    super()
    this.config = config
  }

  public static getInstance(config?: TestDatabaseConfig): TestDatabaseManager {
    if (!TestDatabaseManager.instance) {
      if (!config) {
        throw new Error('TestDatabaseManager requires configuration on first instantiation')
      }
      TestDatabaseManager.instance = new TestDatabaseManager(config)
    }
    return TestDatabaseManager.instance
  }

  /**
   * Initialize the test database environment
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('🗄️  Test database already initialized')
      return
    }

    console.log('🚀 Initializing test database environment...')

    try {
      // Start Firestore emulator
      await this.startEmulator()

      // Connect to emulator
      await this.connectToEmulator()

      // Setup security rules
      if (this.config.rules) {
        await this.applySecurityRules()
      }

      // Seed initial data if configured
      if (this.config.seedData) {
        await this.seedInitialData()
      }

      this.initialized = true
      this.emit('database-initialized')
      console.log('✅ Test database environment ready')
    } catch (error) {
      console.error('❌ Failed to initialize test database:', error)
      throw error
    }
  }

  /**
   * Start Firestore emulator
   */
  private async startEmulator(): Promise<void> {
    console.log('🔥 Starting Firestore emulator...')

    const emulatorArgs = [
      'emulators:start',
      '--only',
      'firestore',
      '--project',
      this.config.projectId,
      '--export-on-exit',
      this.config.dataDirectory || './test-data',
      '--import',
      this.config.dataDirectory || './test-data',
    ]

    this.emulatorProcess = spawn('firebase', emulatorArgs, {
      stdio: 'pipe',
      detached: false,
    })

    return new Promise((resolve, reject) => {
      let output = ''

      this.emulatorProcess!.stdout?.on('data', (data) => {
        output += data.toString()
        if (output.includes('All emulators ready')) {
          resolve()
        }
      })

      this.emulatorProcess!.stderr?.on('data', (data) => {
        console.error('Emulator error:', data.toString())
      })

      this.emulatorProcess!.on('error', (error) => {
        console.error('Failed to start emulator:', error)
        reject(error)
      })

      // Timeout after 30 seconds
      setTimeout(() => {
        reject(new Error('Emulator startup timeout'))
      }, 30000)
    })
  }

  /**
   * Connect to Firestore emulator
   */
  private async connectToEmulator(): Promise<void> {
    const app = initializeApp(
      {
        projectId: this.config.projectId,
      },
      `test-app-${Date.now()}`
    )

    this.firestore = getFirestore(app)

    connectFirestoreEmulator(this.firestore, this.config.host, this.config.port)

    console.log(`🔗 Connected to Firestore emulator at ${this.config.host}:${this.config.port}`)
  }

  /**
   * Apply security rules
   */
  private async applySecurityRules(): Promise<void> {
    console.log('🛡️  Applying security rules...')
    // Implementation would integrate with Firebase emulator REST API
    // to deploy security rules for testing
  }

  /**
   * Seed initial test data
   */
  private async seedInitialData(): Promise<void> {
    console.log('🌱 Seeding initial test data...')

    const seedConfig: SeedingConfig = {
      collections: [
        {
          name: 'users',
          documents: [
            {
              id: 'test-user-1',
              data: {
                uid: 'test-user-1',
                email: 'testuser1@superpool.test',
                walletAddress: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
                role: 'pool_owner',
                createdAt: new Date().toISOString(),
              },
            },
            {
              id: 'test-user-2',
              data: {
                uid: 'test-user-2',
                email: 'testuser2@superpool.test',
                walletAddress: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
                role: 'borrower',
                createdAt: new Date().toISOString(),
              },
            },
          ],
        },
        {
          name: 'pools',
          documents: [
            {
              id: 'test-pool-1',
              data: {
                poolId: 'test-pool-1',
                name: 'Test Lending Pool',
                poolOwner: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
                maxLoanAmount: '1000',
                interestRate: 500,
                loanDuration: 2592000,
                status: 'active',
                createdAt: new Date().toISOString(),
              },
            },
          ],
        },
        {
          name: 'approved_devices',
          documents: [
            {
              id: 'test-device-1',
              data: {
                deviceId: 'test-device-1',
                walletAddress: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
                approved: true,
                approvedAt: new Date().toISOString(),
              },
            },
          ],
        },
      ],
      batchSize: 10,
      parallel: true,
      validateAfterSeed: true,
    }

    await this.seedCollections(seedConfig)
  }

  /**
   * Seed collections with test data
   */
  async seedCollections(config: SeedingConfig): Promise<void> {
    if (!this.firestore) {
      throw new Error('Firestore not initialized')
    }

    console.log(`📊 Seeding ${config.collections.length} collections...`)

    for (const collectionConfig of config.collections) {
      await this.seedCollection(collectionConfig)
    }

    if (config.validateAfterSeed) {
      await this.validateSeedData(config)
    }

    this.emit('data-seeded', config)
  }

  /**
   * Seed individual collection
   */
  private async seedCollection(config: CollectionSeedConfig): Promise<void> {
    if (!this.firestore) return

    console.log(`   📁 Seeding collection: ${config.name} (${config.documents.length} documents)`)

    const batch = this.firestore.batch ? this.firestore.batch() : null

    for (const docConfig of config.documents) {
      const docId = docConfig.id || this.generateDocumentId()
      const docRef = this.firestore.collection(config.name).doc(docId)

      if (batch) {
        batch.set(docRef, docConfig.data)
      } else {
        // Fallback if batch not available
        await docRef.set(docConfig.data)
      }

      // Handle subcollections
      if (docConfig.subcollections) {
        for (const subCollection of docConfig.subcollections) {
          for (const subDoc of subCollection.documents) {
            const subDocId = subDoc.id || this.generateDocumentId()
            const subDocRef = docRef.collection(subCollection.name).doc(subDocId)

            if (batch) {
              batch.set(subDocRef, subDoc.data)
            } else {
              await subDocRef.set(subDoc.data)
            }
          }
        }
      }
    }

    if (batch) {
      await batch.commit()
    }
  }

  /**
   * Validate seeded data
   */
  private async validateSeedData(config: SeedingConfig): Promise<void> {
    if (!this.firestore) return

    console.log('✅ Validating seeded data...')

    for (const collectionConfig of config.collections) {
      const snapshot = await this.firestore.collection(collectionConfig.name).get()

      if (snapshot.size !== collectionConfig.documents.length) {
        throw new Error(`Collection ${collectionConfig.name} has ${snapshot.size} documents, expected ${collectionConfig.documents.length}`)
      }
    }

    console.log('✅ Data validation successful')
  }

  /**
   * Create database snapshot for test isolation
   */
  async createSnapshot(testSuite: string, testCase: string): Promise<string> {
    if (!this.firestore) {
      throw new Error('Firestore not initialized')
    }

    const snapshotId = `${testSuite}-${testCase}-${Date.now()}`
    console.log(`📸 Creating database snapshot: ${snapshotId}`)

    const collections = new Map<string, CollectionSnapshot>()

    // Get all collections (this is a simplified version)
    const collectionNames = ['users', 'pools', 'loans', 'transactions', 'approved_devices', 'auth_nonces']

    for (const collectionName of collectionNames) {
      const collectionRef = this.firestore.collection(collectionName)
      const snapshot = await collectionRef.get()

      const documents = new Map<string, any>()
      snapshot.forEach((doc) => {
        documents.set(doc.id, doc.data())
      })

      collections.set(collectionName, {
        name: collectionName,
        documentCount: snapshot.size,
        documents,
        indexes: [], // Would be populated from index information
      })
    }

    const databaseSnapshot: DatabaseSnapshot = {
      timestamp: Date.now(),
      collections,
      metadata: {
        testSuite,
        testCase,
        snapshotId,
        size: collections.size,
      },
    }

    this.snapshots.set(snapshotId, databaseSnapshot)
    this.emit('snapshot-created', snapshotId, databaseSnapshot)

    return snapshotId
  }

  /**
   * Restore database from snapshot
   */
  async restoreFromSnapshot(snapshotId: string): Promise<void> {
    const snapshot = this.snapshots.get(snapshotId)
    if (!snapshot) {
      throw new Error(`Snapshot ${snapshotId} not found`)
    }

    if (!this.firestore) {
      throw new Error('Firestore not initialized')
    }

    console.log(`🔄 Restoring database from snapshot: ${snapshotId}`)

    // Clear current data
    await this.clearAllData()

    // Restore from snapshot
    for (const [collectionName, collectionSnapshot] of snapshot.collections) {
      const collectionRef = this.firestore.collection(collectionName)

      for (const [docId, docData] of collectionSnapshot.documents) {
        await collectionRef.doc(docId).set(docData)
      }
    }

    this.emit('snapshot-restored', snapshotId)
    console.log('✅ Database restored from snapshot')
  }

  /**
   * Clear all test data
   */
  async clearAllData(): Promise<void> {
    if (!this.firestore) return

    console.log('🧹 Clearing all test data...')

    const collectionNames = ['users', 'pools', 'loans', 'transactions', 'approved_devices', 'auth_nonces']

    for (const collectionName of collectionNames) {
      await this.clearCollection(collectionName)
    }

    this.emit('data-cleared')
  }

  /**
   * Clear specific collection
   */
  async clearCollection(collectionName: string): Promise<void> {
    if (!this.firestore) return

    const collectionRef = this.firestore.collection(collectionName)
    const snapshot = await collectionRef.get()

    const batch = this.firestore.batch ? this.firestore.batch() : null

    snapshot.forEach((doc) => {
      if (batch) {
        batch.delete(doc.ref)
      } else {
        doc.ref.delete()
      }
    })

    if (batch) {
      await batch.commit()
    }
  }

  /**
   * Setup test isolation for a specific test
   */
  async setupTestIsolation(testName: string): Promise<TestIsolationContext> {
    if (!this.testIsolationEnabled) {
      return { testName, snapshotId: null, cleanup: async () => {} }
    }

    const snapshotId = await this.createSnapshot('test', testName)

    return {
      testName,
      snapshotId,
      cleanup: async () => {
        await this.restoreFromSnapshot(snapshotId)
        this.snapshots.delete(snapshotId)
      },
    }
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(): Promise<DatabaseStats> {
    if (!this.firestore) {
      return { totalCollections: 0, totalDocuments: 0, collections: [] }
    }

    const collectionNames = ['users', 'pools', 'loans', 'transactions', 'approved_devices', 'auth_nonces']
    const collections: CollectionStats[] = []
    let totalDocuments = 0

    for (const collectionName of collectionNames) {
      const snapshot = await this.firestore.collection(collectionName).get()
      const documentCount = snapshot.size

      collections.push({
        name: collectionName,
        documentCount,
      })

      totalDocuments += documentCount
    }

    return {
      totalCollections: collections.length,
      totalDocuments,
      collections,
    }
  }

  /**
   * Generate unique document ID
   */
  private generateDocumentId(): string {
    return `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down test database...')

    try {
      // Clear data if auto-cleanup enabled
      if (this.config.autoCleanup) {
        await this.clearAllData()
      }

      // Disconnect from Firestore
      if (this.firestore) {
        const apps = getApps()
        for (const app of apps) {
          if (app.name.startsWith('test-app-')) {
            await deleteApp(app)
          }
        }
        this.firestore = null
      }

      // Stop emulator
      if (this.emulatorProcess) {
        this.emulatorProcess.kill('SIGTERM')
        this.emulatorProcess = null
      }

      this.initialized = false
      this.emit('database-shutdown')
      console.log('✅ Test database shutdown complete')
    } catch (error) {
      console.error('❌ Error during shutdown:', error)
      throw error
    }
  }

  /**
   * Get Firestore instance for direct access
   */
  getFirestore(): Firestore {
    if (!this.firestore) {
      throw new Error('Database not initialized')
    }
    return this.firestore
  }

  /**
   * Enable or disable test isolation
   */
  setTestIsolation(enabled: boolean): void {
    this.testIsolationEnabled = enabled
    console.log(`🔒 Test isolation ${enabled ? 'enabled' : 'disabled'}`)
  }

  /**
   * Get all snapshots
   */
  getSnapshots(): Map<string, DatabaseSnapshot> {
    return new Map(this.snapshots)
  }
}

// Type definitions
export interface TestIsolationContext {
  testName: string
  snapshotId: string | null
  cleanup: () => Promise<void>
}

export interface DatabaseStats {
  totalCollections: number
  totalDocuments: number
  collections: CollectionStats[]
}

export interface CollectionStats {
  name: string
  documentCount: number
}

// Default test database configuration
export const DEFAULT_TEST_DB_CONFIG: TestDatabaseConfig = {
  projectId: 'superpool-test',
  host: 'localhost',
  port: 8080,
  dataDirectory: './test-data',
  autoCleanup: true,
  seedData: true,
}

// Export singleton factory
export const createTestDatabaseManager = (config?: Partial<TestDatabaseConfig>): TestDatabaseManager => {
  const finalConfig = { ...DEFAULT_TEST_DB_CONFIG, ...config }
  return TestDatabaseManager.getInstance(finalConfig)
}

// Export convenience functions
export const initializeTestDatabase = async (config?: Partial<TestDatabaseConfig>): Promise<TestDatabaseManager> => {
  const manager = createTestDatabaseManager(config)
  await manager.initialize()
  return manager
}

export const withTestIsolation = async <T>(
  testName: string,
  testFn: (context: TestIsolationContext) => Promise<T>,
  manager?: TestDatabaseManager
): Promise<T> => {
  const dbManager = manager || TestDatabaseManager.getInstance()
  const context = await dbManager.setupTestIsolation(testName)

  try {
    return await testFn(context)
  } finally {
    await context.cleanup()
  }
}
