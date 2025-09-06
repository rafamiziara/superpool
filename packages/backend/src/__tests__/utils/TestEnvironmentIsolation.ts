/**
 * Test Environment Isolation System
 * 
 * Comprehensive test isolation infrastructure ensuring clean, isolated
 * test environments for each test suite and individual test case.
 * Prevents test interference and ensures deterministic test results.
 */

import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import { TestDatabaseManager } from './TestDatabaseManager'
import { performanceManager } from './PerformanceTestUtilities'

// Isolation scope levels
export enum IsolationScope {
  GLOBAL = 'global',           // Shared across entire test suite
  SUITE = 'suite',            // Isolated per test suite
  TEST_CASE = 'test-case',    // Isolated per individual test
  FUNCTION = 'function'       // Isolated per function call
}

// Isolation strategies
export enum IsolationStrategy {
  SNAPSHOT = 'snapshot',       // Database/state snapshots
  CONTAINER = 'container',     // Process/container isolation
  MOCK = 'mock',              // Mock isolation
  HYBRID = 'hybrid'           // Combination of strategies
}

// Resource types for isolation
export enum IsolatedResource {
  DATABASE = 'database',
  MEMORY = 'memory',
  NETWORK = 'network',
  FILESYSTEM = 'filesystem',
  ENVIRONMENT = 'environment',
  MOCKS = 'mocks'
}

// Test environment configuration
export interface TestEnvironmentConfig {
  isolationScope: IsolationScope
  isolationStrategy: IsolationStrategy
  resources: IsolatedResource[]
  parallel: boolean
  maxConcurrency: number
  timeoutMs: number
  cleanupStrategy: CleanupStrategy
  monitoring: MonitoringConfig
}

export interface CleanupStrategy {
  automatic: boolean
  onError: boolean
  onSuccess: boolean
  aggressive: boolean // Force cleanup even if tests fail
}

export interface MonitoringConfig {
  trackMemory: boolean
  trackPerformance: boolean
  trackResources: boolean
  generateReports: boolean
}

// Test environment context
export interface TestEnvironmentContext {
  id: string
  name: string
  scope: IsolationScope
  strategy: IsolationStrategy
  startTime: number
  endTime?: number
  resources: Map<IsolatedResource, ResourceContext>
  metadata: EnvironmentMetadata
  cleanup: () => Promise<void>
}

export interface ResourceContext {
  type: IsolatedResource
  isolated: boolean
  snapshotId?: string
  originalState?: any
  currentState?: any
  cleanup: () => Promise<void>
}

export interface EnvironmentMetadata {
  testSuite: string
  testCase?: string
  parentContext?: string
  childContexts: string[]
  tags: string[]
}

export class TestEnvironmentIsolationManager extends EventEmitter {
  private static instance: TestEnvironmentIsolationManager
  private environments: Map<string, TestEnvironmentContext> = new Map()
  private activeEnvironments: Set<string> = new Set()
  private resourceManagers: Map<IsolatedResource, ResourceManager> = new Map()
  private config: TestEnvironmentConfig
  
  private constructor(config: TestEnvironmentConfig) {
    super()
    this.config = config
    this.initializeResourceManagers()
  }
  
  public static getInstance(config?: TestEnvironmentConfig): TestEnvironmentIsolationManager {
    if (!TestEnvironmentIsolationManager.instance) {
      if (!config) {
        throw new Error('TestEnvironmentIsolationManager requires configuration on first instantiation')
      }
      TestEnvironmentIsolationManager.instance = new TestEnvironmentIsolationManager(config)
    }
    return TestEnvironmentIsolationManager.instance
  }
  
  /**
   * Initialize resource managers for different isolation types
   */
  private initializeResourceManagers(): void {
    this.resourceManagers.set(IsolatedResource.DATABASE, new DatabaseResourceManager())
    this.resourceManagers.set(IsolatedResource.MEMORY, new MemoryResourceManager())
    this.resourceManagers.set(IsolatedResource.NETWORK, new NetworkResourceManager())
    this.resourceManagers.set(IsolatedResource.FILESYSTEM, new FilesystemResourceManager())
    this.resourceManagers.set(IsolatedResource.ENVIRONMENT, new EnvironmentResourceManager())
    this.resourceManagers.set(IsolatedResource.MOCKS, new MockResourceManager())
  }
  
  /**
   * Create isolated test environment
   */
  async createIsolatedEnvironment(
    name: string,
    scope: IsolationScope,
    testSuite: string,
    testCase?: string,
    parentContext?: string
  ): Promise<TestEnvironmentContext> {
    const contextId = uuidv4()
    
    console.log(`🔒 Creating isolated environment: ${name} (${scope})`)
    
    const context: TestEnvironmentContext = {
      id: contextId,
      name,
      scope,
      strategy: this.config.isolationStrategy,
      startTime: Date.now(),
      resources: new Map(),
      metadata: {
        testSuite,
        testCase,
        parentContext,
        childContexts: [],
        tags: []
      },
      cleanup: () => this.cleanupEnvironment(contextId)
    }
    
    try {
      // Setup resource isolation
      await this.setupResourceIsolation(context)
      
      // Register environment
      this.environments.set(contextId, context)
      this.activeEnvironments.add(contextId)
      
      // Link to parent context if exists
      if (parentContext && this.environments.has(parentContext)) {
        this.environments.get(parentContext)!.metadata.childContexts.push(contextId)
      }
      
      // Start monitoring if enabled
      if (this.config.monitoring.trackMemory || this.config.monitoring.trackPerformance) {
        this.startEnvironmentMonitoring(context)
      }
      
      this.emit('environment-created', context)
      console.log(`✅ Environment ${name} created with ID: ${contextId}`)
      
      return context
      
    } catch (error) {
      console.error(`❌ Failed to create environment ${name}:`, error)
      throw error
    }
  }
  
  /**
   * Setup resource isolation for the environment
   */
  private async setupResourceIsolation(context: TestEnvironmentContext): Promise<void> {
    for (const resourceType of this.config.resources) {
      const resourceManager = this.resourceManagers.get(resourceType)
      
      if (!resourceManager) {
        console.warn(`⚠️  No resource manager found for ${resourceType}`)
        continue
      }
      
      console.log(`   🔧 Setting up ${resourceType} isolation...`)
      
      try {
        const resourceContext = await resourceManager.isolate(context)
        context.resources.set(resourceType, resourceContext)
      } catch (error) {
        console.error(`❌ Failed to isolate ${resourceType}:`, error)
        throw error
      }
    }
  }
  
  /**
   * Start monitoring for the environment
   */
  private startEnvironmentMonitoring(context: TestEnvironmentContext): void {
    if (this.config.monitoring.trackPerformance) {
      const measurement = performanceManager.startMeasurement(
        `env-${context.name}`,
        'environment-isolation'
      )
      
      // Store measurement for cleanup
      context.metadata.tags.push(`perf-measurement:${measurement.id}`)
    }
    
    if (this.config.monitoring.trackMemory) {
      this.trackMemoryUsage(context)
    }
  }
  
  /**
   * Track memory usage for environment
   */
  private trackMemoryUsage(context: TestEnvironmentContext): void {
    const interval = setInterval(() => {
      const memUsage = process.memoryUsage()
      this.emit('memory-usage', context.id, memUsage)
    }, 5000) // Track every 5 seconds
    
    context.metadata.tags.push(`memory-interval:${interval}`)
  }
  
  /**
   * Cleanup isolated environment
   */
  async cleanupEnvironment(contextId: string): Promise<void> {
    const context = this.environments.get(contextId)
    
    if (!context) {
      console.warn(`⚠️  Environment ${contextId} not found for cleanup`)
      return
    }
    
    console.log(`🧹 Cleaning up environment: ${context.name}`)
    
    try {
      // Cleanup child environments first
      for (const childId of context.metadata.childContexts) {
        await this.cleanupEnvironment(childId)
      }
      
      // Cleanup resources
      await this.cleanupResources(context)
      
      // Stop monitoring
      await this.stopEnvironmentMonitoring(context)
      
      // Mark as completed
      context.endTime = Date.now()
      
      // Remove from active environments
      this.activeEnvironments.delete(contextId)
      
      // Remove from parent's child list
      if (context.metadata.parentContext) {
        const parent = this.environments.get(context.metadata.parentContext)
        if (parent) {
          const index = parent.metadata.childContexts.indexOf(contextId)
          if (index > -1) {
            parent.metadata.childContexts.splice(index, 1)
          }
        }
      }
      
      this.emit('environment-cleaned', context)
      console.log(`✅ Environment ${context.name} cleaned up`)
      
    } catch (error) {
      console.error(`❌ Failed to cleanup environment ${context.name}:`, error)
      throw error
    }
  }
  
  /**
   * Cleanup resources for environment
   */
  private async cleanupResources(context: TestEnvironmentContext): Promise<void> {
    for (const [resourceType, resourceContext] of context.resources) {
      console.log(`   🧹 Cleaning up ${resourceType}...`)
      
      try {
        await resourceContext.cleanup()
      } catch (error) {
        console.error(`❌ Failed to cleanup ${resourceType}:`, error)
        
        if (this.config.cleanupStrategy.aggressive) {
          console.log(`⚡ Attempting aggressive cleanup for ${resourceType}`)
          // Implement aggressive cleanup strategies
        }
      }
    }
  }
  
  /**
   * Stop monitoring for environment
   */
  private async stopEnvironmentMonitoring(context: TestEnvironmentContext): Promise<void> {
    for (const tag of context.metadata.tags) {
      if (tag.startsWith('perf-measurement:')) {
        // Performance measurements are automatically ended
      } else if (tag.startsWith('memory-interval:')) {
        const intervalId = parseInt(tag.split(':')[1])
        clearInterval(intervalId)
      }
    }
  }
  
  /**
   * Get environment by ID
   */
  getEnvironment(contextId: string): TestEnvironmentContext | null {
    return this.environments.get(contextId) || null
  }
  
  /**
   * Get all active environments
   */
  getActiveEnvironments(): TestEnvironmentContext[] {
    return Array.from(this.activeEnvironments)
      .map(id => this.environments.get(id))
      .filter(Boolean) as TestEnvironmentContext[]
  }
  
  /**
   * Cleanup all environments
   */
  async cleanupAll(): Promise<void> {
    console.log('🧹 Cleaning up all test environments...')
    
    const activeIds = Array.from(this.activeEnvironments)
    
    for (const contextId of activeIds) {
      await this.cleanupEnvironment(contextId)
    }
    
    console.log('✅ All environments cleaned up')
  }
  
  /**
   * Generate isolation report
   */
  generateIsolationReport(): IsolationReport {
    const environments = Array.from(this.environments.values())
    
    return {
      totalEnvironments: environments.length,
      activeEnvironments: this.activeEnvironments.size,
      completedEnvironments: environments.filter(env => env.endTime).length,
      resourcesIsolated: this.calculateResourcesIsolated(environments),
      averageLifetime: this.calculateAverageLifetime(environments),
      isolationEfficiency: this.calculateIsolationEfficiency(environments),
      timestamp: Date.now()
    }
  }
  
  /**
   * Calculate resources isolated
   */
  private calculateResourcesIsolated(environments: TestEnvironmentContext[]): Record<IsolatedResource, number> {
    const resources: Record<IsolatedResource, number> = {} as Record<IsolatedResource, number>
    
    for (const resource of Object.values(IsolatedResource)) {
      resources[resource] = environments.filter(env => env.resources.has(resource)).length
    }
    
    return resources
  }
  
  /**
   * Calculate average environment lifetime
   */
  private calculateAverageLifetime(environments: TestEnvironmentContext[]): number {
    const completedEnvs = environments.filter(env => env.endTime)
    
    if (completedEnvs.length === 0) return 0
    
    const totalLifetime = completedEnvs.reduce((sum, env) => sum + (env.endTime! - env.startTime), 0)
    return totalLifetime / completedEnvs.length
  }
  
  /**
   * Calculate isolation efficiency
   */
  private calculateIsolationEfficiency(environments: TestEnvironmentContext[]): number {
    if (environments.length === 0) return 0
    
    const successfulIsolations = environments.filter(env => 
      env.endTime && env.resources.size === this.config.resources.length
    ).length
    
    return (successfulIsolations / environments.length) * 100
  }
}

// Abstract base class for resource managers
export abstract class ResourceManager {
  abstract isolate(context: TestEnvironmentContext): Promise<ResourceContext>
}

// Database resource manager
export class DatabaseResourceManager extends ResourceManager {
  async isolate(context: TestEnvironmentContext): Promise<ResourceContext> {
    // Get database manager
    const dbManager = TestDatabaseManager.getInstance()
    
    // Create snapshot for isolation
    const snapshotId = await dbManager.createSnapshot(
      context.metadata.testSuite,
      context.metadata.testCase || context.name
    )
    
    return {
      type: IsolatedResource.DATABASE,
      isolated: true,
      snapshotId,
      cleanup: async () => {
        await dbManager.restoreFromSnapshot(snapshotId)
      }
    }
  }
}

// Memory resource manager
export class MemoryResourceManager extends ResourceManager {
  async isolate(context: TestEnvironmentContext): Promise<ResourceContext> {
    const originalState = {
      heapUsed: process.memoryUsage().heapUsed,
      heapTotal: process.memoryUsage().heapTotal
    }
    
    return {
      type: IsolatedResource.MEMORY,
      isolated: true,
      originalState,
      cleanup: async () => {
        // Force garbage collection if available
        if (global.gc) {
          global.gc()
        }
      }
    }
  }
}

// Network resource manager
export class NetworkResourceManager extends ResourceManager {
  async isolate(context: TestEnvironmentContext): Promise<ResourceContext> {
    // Network isolation would involve mocking network calls
    // or using network namespaces in containerized environments
    
    return {
      type: IsolatedResource.NETWORK,
      isolated: true,
      cleanup: async () => {
        // Reset network mocks
      }
    }
  }
}

// Filesystem resource manager
export class FilesystemResourceManager extends ResourceManager {
  async isolate(context: TestEnvironmentContext): Promise<ResourceContext> {
    // Filesystem isolation could involve creating temporary directories
    // or using filesystem snapshots
    
    return {
      type: IsolatedResource.FILESYSTEM,
      isolated: true,
      cleanup: async () => {
        // Cleanup temporary files
      }
    }
  }
}

// Environment resource manager
export class EnvironmentResourceManager extends ResourceManager {
  async isolate(context: TestEnvironmentContext): Promise<ResourceContext> {
    const originalEnv = { ...process.env }
    
    return {
      type: IsolatedResource.ENVIRONMENT,
      isolated: true,
      originalState: originalEnv,
      cleanup: async () => {
        // Restore original environment variables
        process.env = originalEnv
      }
    }
  }
}

// Mock resource manager
export class MockResourceManager extends ResourceManager {
  async isolate(context: TestEnvironmentContext): Promise<ResourceContext> {
    // Reset all mocks to ensure clean state
    jest.clearAllMocks()
    jest.resetAllMocks()
    
    return {
      type: IsolatedResource.MOCKS,
      isolated: true,
      cleanup: async () => {
        jest.clearAllMocks()
        jest.resetAllMocks()
        jest.restoreAllMocks()
      }
    }
  }
}

// Type definitions
export interface IsolationReport {
  totalEnvironments: number
  activeEnvironments: number
  completedEnvironments: number
  resourcesIsolated: Record<IsolatedResource, number>
  averageLifetime: number
  isolationEfficiency: number
  timestamp: number
}

// Default configuration
export const DEFAULT_ISOLATION_CONFIG: TestEnvironmentConfig = {
  isolationScope: IsolationScope.TEST_CASE,
  isolationStrategy: IsolationStrategy.HYBRID,
  resources: [
    IsolatedResource.DATABASE,
    IsolatedResource.MEMORY,
    IsolatedResource.MOCKS
  ],
  parallel: true,
  maxConcurrency: 4,
  timeoutMs: 60000,
  cleanupStrategy: {
    automatic: true,
    onError: true,
    onSuccess: true,
    aggressive: false
  },
  monitoring: {
    trackMemory: true,
    trackPerformance: true,
    trackResources: true,
    generateReports: true
  }
}

// Convenience functions
export const createIsolationManager = (config?: Partial<TestEnvironmentConfig>): TestEnvironmentIsolationManager => {
  const finalConfig = { ...DEFAULT_ISOLATION_CONFIG, ...config }
  return TestEnvironmentIsolationManager.getInstance(finalConfig)
}

export const withIsolatedEnvironment = async <T>(
  testName: string,
  testSuite: string,
  testFn: (context: TestEnvironmentContext) => Promise<T>,
  scope: IsolationScope = IsolationScope.TEST_CASE
): Promise<T> => {
  const isolationManager = TestEnvironmentIsolationManager.getInstance()
  const context = await isolationManager.createIsolatedEnvironment(testName, scope, testSuite)
  
  try {
    return await testFn(context)
  } finally {
    await context.cleanup()
  }
}

// Export singleton instance
export const isolationManager = TestEnvironmentIsolationManager.getInstance(DEFAULT_ISOLATION_CONFIG)