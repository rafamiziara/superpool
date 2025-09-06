/**
 * Parallel Test Execution System
 * 
 * Advanced parallel test execution with intelligent workload distribution,
 * resource management, and conflict detection. Optimizes test suite
 * execution time while maintaining reliability and isolation.
 */

import { EventEmitter } from 'events'
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads'
import { cpus } from 'os'
import { TestEnvironmentIsolationManager, IsolationScope } from './TestEnvironmentIsolation'
import { performanceManager } from './PerformanceTestUtilities'

// Execution strategy types
export enum ParallelStrategy {
  MAX_CONCURRENCY = 'max-concurrency',     // Use all available cores
  CONSERVATIVE = 'conservative',           // Use 50% of available cores
  ADAPTIVE = 'adaptive',                  // Dynamically adjust based on load
  CUSTOM = 'custom'                       // User-defined concurrency
}

// Test workload categories for optimal distribution
export enum WorkloadCategory {
  LIGHT = 'light',           // Quick unit tests (< 100ms)
  MEDIUM = 'medium',         // Integration tests (< 5s)
  HEAVY = 'heavy',          // E2E/performance tests (> 5s)
  DATABASE = 'database',     // Database-dependent tests
  NETWORK = 'network',      // Network-dependent tests
  CPU_INTENSIVE = 'cpu'     // CPU-intensive tests
}

// Test execution priority
export enum ExecutionPriority {
  CRITICAL = 'critical',     // Must pass for pipeline success
  HIGH = 'high',            // Important but non-blocking
  MEDIUM = 'medium',        // Standard priority
  LOW = 'low'              // Can be deferred
}

// Parallel execution configuration
export interface ParallelExecutionConfig {
  strategy: ParallelStrategy
  maxWorkers: number
  minWorkers: number
  workloadDistribution: WorkloadDistributionConfig
  resourceManagement: ResourceManagementConfig
  errorHandling: ErrorHandlingConfig
  monitoring: ParallelMonitoringConfig
}

export interface WorkloadDistributionConfig {
  balancingAlgorithm: 'round-robin' | 'least-loaded' | 'affinity-based' | 'priority-queue'
  chunkSize: number
  adaptiveChunking: boolean
  resourceAffinity: boolean // Keep similar tests on same worker
}

export interface ResourceManagementConfig {
  memoryLimitPerWorker: number // MB
  cpuThrottling: boolean
  ioThrottling: boolean
  sharedResourceLocking: boolean
}

export interface ErrorHandlingConfig {
  retryFailedTests: boolean
  maxRetries: number
  retryDelay: number
  isolateFailures: boolean // Run failed tests in isolation
  failFast: boolean
}

export interface ParallelMonitoringConfig {
  trackWorkerPerformance: boolean
  trackResourceUsage: boolean
  generateDistributionReport: boolean
  realTimeMonitoring: boolean
}

// Test suite definition for parallel execution
export interface ParallelTestSuite {
  name: string
  tests: ParallelTestCase[]
  setup?: () => Promise<void>
  teardown?: () => Promise<void>
  config?: Partial<ParallelExecutionConfig>
}

export interface ParallelTestCase {
  id: string
  name: string
  category: WorkloadCategory
  priority: ExecutionPriority
  estimatedDuration: number // milliseconds
  dependencies: string[] // Test IDs this test depends on
  exclusions: string[] // Tests that cannot run concurrently
  isolationRequirements: IsolationScope[]
  resources: string[] // Required resources (db, network, etc.)
  execute: () => Promise<TestResult>
}

export interface TestResult {
  id: string
  name: string
  success: boolean
  duration: number
  error?: Error
  metadata: TestMetadata
}

export interface TestMetadata {
  workerId: number
  startTime: number
  endTime: number
  memoryUsage: number
  retryCount: number
}

// Worker pool management
export interface WorkerPool {
  workers: Map<number, WorkerContext>
  availableWorkers: number[]
  busyWorkers: number[]
  workerAssignments: Map<number, string[]> // Worker ID -> Test IDs
}

export interface WorkerContext {
  id: number
  worker: Worker
  currentTests: string[]
  performance: WorkerPerformanceMetrics
  status: 'idle' | 'busy' | 'error' | 'terminating'
}

export interface WorkerPerformanceMetrics {
  testsCompleted: number
  totalExecutionTime: number
  averageExecutionTime: number
  memoryUsage: number
  errorCount: number
}

export class ParallelTestExecutor extends EventEmitter {
  private static instance: ParallelTestExecutor
  private config: ParallelExecutionConfig
  private workerPool: WorkerPool
  private testQueue: TestQueue
  private executionHistory: Map<string, TestResult> = new Map()
  private dependencyGraph: Map<string, string[]> = new Map()
  private isolationManager: TestEnvironmentIsolationManager
  
  private constructor(config: ParallelExecutionConfig) {
    super()
    this.config = config
    this.workerPool = this.createWorkerPool()
    this.testQueue = new TestQueue(config.workloadDistribution)
    this.isolationManager = TestEnvironmentIsolationManager.getInstance()
  }
  
  public static getInstance(config?: ParallelExecutionConfig): ParallelTestExecutor {
    if (!ParallelTestExecutor.instance) {
      if (!config) {
        throw new Error('ParallelTestExecutor requires configuration on first instantiation')
      }
      ParallelTestExecutor.instance = new ParallelTestExecutor(config)
    }
    return ParallelTestExecutor.instance
  }
  
  /**
   * Execute test suite in parallel
   */
  async executeParallel(testSuite: ParallelTestSuite): Promise<ParallelExecutionResult> {
    console.log(`🚀 Starting parallel execution of ${testSuite.name}`)
    console.log(`   Workers: ${this.workerPool.workers.size}`)
    console.log(`   Tests: ${testSuite.tests.length}`)
    
    const startTime = Date.now()
    
    try {
      // Setup test suite
      if (testSuite.setup) {
        console.log('🔧 Running test suite setup...')
        await testSuite.setup()
      }
      
      // Build dependency graph
      this.buildDependencyGraph(testSuite.tests)
      
      // Queue tests for execution
      this.testQueue.enqueueTests(testSuite.tests)
      
      // Start parallel execution
      const results = await this.executeTestsInParallel()
      
      // Cleanup test suite
      if (testSuite.teardown) {
        console.log('🧹 Running test suite teardown...')
        await testSuite.teardown()
      }
      
      const endTime = Date.now()
      const totalDuration = endTime - startTime
      
      const executionResult: ParallelExecutionResult = {
        suiteName: testSuite.name,
        totalTests: testSuite.tests.length,
        successfulTests: results.filter(r => r.success).length,
        failedTests: results.filter(r => !r.success).length,
        totalDuration,
        results,
        performance: this.calculateExecutionPerformance(results, totalDuration),
        workerMetrics: this.getWorkerMetrics()
      }
      
      console.log(`✅ Parallel execution completed in ${totalDuration}ms`)
      console.log(`   Success: ${executionResult.successfulTests}/${executionResult.totalTests}`)
      
      return executionResult
      
    } catch (error) {
      console.error('❌ Parallel execution failed:', error)
      throw error
    } finally {
      await this.cleanup()
    }
  }
  
  /**
   * Create worker pool based on configuration
   */
  private createWorkerPool(): WorkerPool {
    const workerCount = this.calculateOptimalWorkerCount()
    console.log(`👥 Creating worker pool with ${workerCount} workers`)
    
    const workers = new Map<number, WorkerContext>()
    const availableWorkers: number[] = []
    
    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(__filename, {
        workerData: { workerId: i, config: this.config }
      })
      
      const context: WorkerContext = {
        id: i,
        worker,
        currentTests: [],
        performance: {
          testsCompleted: 0,
          totalExecutionTime: 0,
          averageExecutionTime: 0,
          memoryUsage: 0,
          errorCount: 0
        },
        status: 'idle'
      }
      
      // Setup worker event handlers
      this.setupWorkerEventHandlers(context)
      
      workers.set(i, context)
      availableWorkers.push(i)
    }
    
    return {
      workers,
      availableWorkers,
      busyWorkers: [],
      workerAssignments: new Map()
    }
  }
  
  /**
   * Calculate optimal number of workers
   */
  private calculateOptimalWorkerCount(): number {
    const cpuCount = cpus().length
    
    switch (this.config.strategy) {
      case ParallelStrategy.MAX_CONCURRENCY:
        return Math.min(cpuCount, this.config.maxWorkers)
        
      case ParallelStrategy.CONSERVATIVE:
        return Math.max(Math.floor(cpuCount * 0.5), this.config.minWorkers)
        
      case ParallelStrategy.ADAPTIVE:
        // Start conservative, can scale up based on load
        return Math.max(Math.floor(cpuCount * 0.6), this.config.minWorkers)
        
      case ParallelStrategy.CUSTOM:
        return Math.max(this.config.minWorkers, Math.min(this.config.maxWorkers, cpuCount))
        
      default:
        return Math.max(Math.floor(cpuCount * 0.5), 2)
    }
  }
  
  /**
   * Setup event handlers for worker
   */
  private setupWorkerEventHandlers(context: WorkerContext): void {
    context.worker.on('message', (message) => {
      this.handleWorkerMessage(context, message)
    })
    
    context.worker.on('error', (error) => {
      this.handleWorkerError(context, error)
    })
    
    context.worker.on('exit', (code) => {
      this.handleWorkerExit(context, code)
    })
  }
  
  /**
   * Handle messages from workers
   */
  private handleWorkerMessage(context: WorkerContext, message: any): void {
    switch (message.type) {
      case 'test-completed':
        this.handleTestCompleted(context, message.result)
        break
        
      case 'test-failed':
        this.handleTestFailed(context, message.result)
        break
        
      case 'performance-update':
        this.updateWorkerPerformance(context, message.metrics)
        break
        
      case 'resource-usage':
        this.trackResourceUsage(context, message.usage)
        break
    }
  }
  
  /**
   * Handle worker errors
   */
  private handleWorkerError(context: WorkerContext, error: Error): void {
    console.error(`❌ Worker ${context.id} error:`, error)
    context.status = 'error'
    context.performance.errorCount++
    
    // Reassign tests from failed worker
    this.reassignWorkerTests(context)
    
    // Restart worker if configured
    if (this.config.errorHandling.retryFailedTests) {
      this.restartWorker(context)
    }
  }
  
  /**
   * Handle worker exit
   */
  private handleWorkerExit(context: WorkerContext, code: number): void {
    console.log(`👋 Worker ${context.id} exited with code ${code}`)
    context.status = 'terminating'
    
    // Remove from available workers
    const availableIndex = this.workerPool.availableWorkers.indexOf(context.id)
    if (availableIndex > -1) {
      this.workerPool.availableWorkers.splice(availableIndex, 1)
    }
    
    const busyIndex = this.workerPool.busyWorkers.indexOf(context.id)
    if (busyIndex > -1) {
      this.workerPool.busyWorkers.splice(busyIndex, 1)
    }
  }
  
  /**
   * Execute tests in parallel using worker pool
   */
  private async executeTestsInParallel(): Promise<TestResult[]> {
    const results: TestResult[] = []
    
    return new Promise((resolve, reject) => {
      const checkCompletion = () => {
        if (this.testQueue.isEmpty() && this.workerPool.busyWorkers.length === 0) {
          resolve(results)
        }
      }
      
      // Process test queue
      const processQueue = () => {
        while (!this.testQueue.isEmpty() && this.workerPool.availableWorkers.length > 0) {
          const test = this.testQueue.dequeue()
          const workerId = this.assignTestToWorker(test)
          
          if (workerId !== -1) {
            this.executeTestOnWorker(workerId, test)
          } else {
            // Put test back in queue and wait
            this.testQueue.enqueue(test)
            break
          }
        }
        
        checkCompletion()
      }
      
      // Handle test completion
      this.on('test-completed', (result: TestResult) => {
        results.push(result)
        this.makeWorkerAvailable(result.metadata.workerId)
        processQueue()
      })
      
      // Handle test failure
      this.on('test-failed', (result: TestResult) => {
        if (this.config.errorHandling.retryFailedTests && result.metadata.retryCount < this.config.errorHandling.maxRetries) {
          // Retry test
          setTimeout(() => {
            result.metadata.retryCount++
            const test = this.createRetryTest(result)
            this.testQueue.enqueue(test)
            processQueue()
          }, this.config.errorHandling.retryDelay)
        } else {
          results.push(result)
        }
        
        this.makeWorkerAvailable(result.metadata.workerId)
        
        if (this.config.errorHandling.failFast && !result.success) {
          reject(new Error(`Test failed: ${result.name}`))
          return
        }
        
        processQueue()
      })
      
      // Start initial processing
      processQueue()
    })
  }
  
  /**
   * Build dependency graph for tests
   */
  private buildDependencyGraph(tests: ParallelTestCase[]): void {
    for (const test of tests) {
      this.dependencyGraph.set(test.id, test.dependencies)
    }
  }
  
  /**
   * Assign test to optimal worker
   */
  private assignTestToWorker(test: ParallelTestCase): number {
    if (this.workerPool.availableWorkers.length === 0) {
      return -1
    }
    
    switch (this.config.workloadDistribution.balancingAlgorithm) {
      case 'round-robin':
        return this.assignRoundRobin()
        
      case 'least-loaded':
        return this.assignLeastLoaded()
        
      case 'affinity-based':
        return this.assignAffinityBased(test)
        
      case 'priority-queue':
        return this.assignPriorityBased(test)
        
      default:
        return this.assignRoundRobin()
    }
  }
  
  /**
   * Round-robin worker assignment
   */
  private assignRoundRobin(): number {
    return this.workerPool.availableWorkers.shift() || -1
  }
  
  /**
   * Least loaded worker assignment
   */
  private assignLeastLoaded(): number {
    let leastLoadedWorker = -1
    let minLoad = Infinity
    
    for (const workerId of this.workerPool.availableWorkers) {
      const worker = this.workerPool.workers.get(workerId)!
      const load = worker.currentTests.length
      
      if (load < minLoad) {
        minLoad = load
        leastLoadedWorker = workerId
      }
    }
    
    if (leastLoadedWorker !== -1) {
      const index = this.workerPool.availableWorkers.indexOf(leastLoadedWorker)
      this.workerPool.availableWorkers.splice(index, 1)
    }
    
    return leastLoadedWorker
  }
  
  /**
   * Affinity-based worker assignment
   */
  private assignAffinityBased(test: ParallelTestCase): number {
    // Prefer workers that have run similar tests
    for (const workerId of this.workerPool.availableWorkers) {
      const assignments = this.workerPool.workerAssignments.get(workerId) || []
      const hasAffinity = assignments.some(testId => {
        const previousTest = this.findTestById(testId)
        return previousTest && previousTest.category === test.category
      })
      
      if (hasAffinity) {
        const index = this.workerPool.availableWorkers.indexOf(workerId)
        this.workerPool.availableWorkers.splice(index, 1)
        return workerId
      }
    }
    
    return this.assignLeastLoaded()
  }
  
  /**
   * Priority-based worker assignment
   */
  private assignPriorityBased(test: ParallelTestCase): number {
    // For high priority tests, use best performing worker
    if (test.priority === ExecutionPriority.CRITICAL) {
      let bestWorker = -1
      let bestPerformance = 0
      
      for (const workerId of this.workerPool.availableWorkers) {
        const worker = this.workerPool.workers.get(workerId)!
        const performance = worker.performance.testsCompleted / (worker.performance.averageExecutionTime || 1)
        
        if (performance > bestPerformance) {
          bestPerformance = performance
          bestWorker = workerId
        }
      }
      
      if (bestWorker !== -1) {
        const index = this.workerPool.availableWorkers.indexOf(bestWorker)
        this.workerPool.availableWorkers.splice(index, 1)
      }
      
      return bestWorker
    }
    
    return this.assignLeastLoaded()
  }
  
  /**
   * Execute test on specific worker
   */
  private async executeTestOnWorker(workerId: number, test: ParallelTestCase): Promise<void> {
    const worker = this.workerPool.workers.get(workerId)!
    
    // Move worker to busy
    this.workerPool.busyWorkers.push(workerId)
    worker.status = 'busy'
    worker.currentTests.push(test.id)
    
    // Track assignment
    if (!this.workerPool.workerAssignments.has(workerId)) {
      this.workerPool.workerAssignments.set(workerId, [])
    }
    this.workerPool.workerAssignments.get(workerId)!.push(test.id)
    
    // Send test to worker
    worker.worker.postMessage({
      type: 'execute-test',
      test: {
        id: test.id,
        name: test.name,
        category: test.category,
        priority: test.priority,
        // Serialize the execute function
        executeFunction: test.execute.toString()
      }
    })
  }
  
  /**
   * Handle test completion
   */
  private handleTestCompleted(context: WorkerContext, result: TestResult): void {
    console.log(`✅ Test ${result.name} completed on worker ${context.id}`)
    
    // Update worker performance
    context.performance.testsCompleted++
    context.performance.totalExecutionTime += result.duration
    context.performance.averageExecutionTime = context.performance.totalExecutionTime / context.performance.testsCompleted
    
    // Remove test from worker's current tests
    const testIndex = context.currentTests.indexOf(result.id)
    if (testIndex > -1) {
      context.currentTests.splice(testIndex, 1)
    }
    
    this.emit('test-completed', result)
  }
  
  /**
   * Handle test failure
   */
  private handleTestFailed(context: WorkerContext, result: TestResult): void {
    console.error(`❌ Test ${result.name} failed on worker ${context.id}:`, result.error)
    
    context.performance.errorCount++
    
    // Remove test from worker's current tests
    const testIndex = context.currentTests.indexOf(result.id)
    if (testIndex > -1) {
      context.currentTests.splice(testIndex, 1)
    }
    
    this.emit('test-failed', result)
  }
  
  /**
   * Make worker available for new tests
   */
  private makeWorkerAvailable(workerId: number): void {
    const busyIndex = this.workerPool.busyWorkers.indexOf(workerId)
    if (busyIndex > -1) {
      this.workerPool.busyWorkers.splice(busyIndex, 1)
      this.workerPool.availableWorkers.push(workerId)
      
      const worker = this.workerPool.workers.get(workerId)!
      worker.status = 'idle'
    }
  }
  
  /**
   * Calculate execution performance metrics
   */
  private calculateExecutionPerformance(results: TestResult[], totalDuration: number): ExecutionPerformanceMetrics {
    const parallelEfficiency = this.calculateParallelEfficiency(results, totalDuration)
    const workerUtilization = this.calculateWorkerUtilization()
    
    return {
      totalDuration,
      averageTestDuration: results.reduce((sum, r) => sum + r.duration, 0) / results.length,
      parallelEfficiency,
      workerUtilization,
      throughput: results.length / (totalDuration / 1000), // tests per second
      speedupFactor: this.calculateSpeedupFactor(results, totalDuration)
    }
  }
  
  /**
   * Calculate parallel efficiency
   */
  private calculateParallelEfficiency(results: TestResult[], totalDuration: number): number {
    const sequentialTime = results.reduce((sum, r) => sum + r.duration, 0)
    return (sequentialTime / (totalDuration * this.workerPool.workers.size)) * 100
  }
  
  /**
   * Calculate worker utilization
   */
  private calculateWorkerUtilization(): number {
    let totalUtilization = 0
    
    for (const worker of this.workerPool.workers.values()) {
      const utilization = worker.performance.totalExecutionTime / Date.now() // Simplified calculation
      totalUtilization += utilization
    }
    
    return (totalUtilization / this.workerPool.workers.size) * 100
  }
  
  /**
   * Calculate speedup factor
   */
  private calculateSpeedupFactor(results: TestResult[], totalDuration: number): number {
    const sequentialTime = results.reduce((sum, r) => sum + r.duration, 0)
    return sequentialTime / totalDuration
  }
  
  /**
   * Get worker metrics
   */
  private getWorkerMetrics(): WorkerMetrics[] {
    return Array.from(this.workerPool.workers.values()).map(worker => ({
      workerId: worker.id,
      performance: { ...worker.performance },
      status: worker.status,
      currentTestCount: worker.currentTests.length
    }))
  }
  
  /**
   * Helper methods
   */
  private findTestById(testId: string): ParallelTestCase | null {
    // Implementation would search through registered tests
    return null
  }
  
  private reassignWorkerTests(context: WorkerContext): void {
    // Reassign current tests to other workers
    for (const testId of context.currentTests) {
      // Add back to queue for reassignment
      console.log(`🔄 Reassigning test ${testId} from failed worker ${context.id}`)
    }
  }
  
  private restartWorker(context: WorkerContext): void {
    console.log(`🔄 Restarting worker ${context.id}`)
    // Implementation would restart the worker
  }
  
  private createRetryTest(result: TestResult): ParallelTestCase {
    // Create a retry test based on failed result
    return {
      id: `${result.id}-retry-${result.metadata.retryCount + 1}`,
      name: `${result.name} (Retry ${result.metadata.retryCount + 1})`,
      category: WorkloadCategory.LIGHT, // Retries get lower priority
      priority: ExecutionPriority.MEDIUM,
      estimatedDuration: result.duration,
      dependencies: [],
      exclusions: [],
      isolationRequirements: [],
      resources: [],
      execute: async () => result // Placeholder
    }
  }
  
  private updateWorkerPerformance(context: WorkerContext, metrics: any): void {
    // Update worker performance metrics
    context.performance = { ...context.performance, ...metrics }
  }
  
  private trackResourceUsage(context: WorkerContext, usage: any): void {
    // Track resource usage for worker
    context.performance.memoryUsage = usage.memory
  }
  
  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up parallel test executor...')
    
    // Terminate all workers
    for (const worker of this.workerPool.workers.values()) {
      await worker.worker.terminate()
    }
    
    // Clear data structures
    this.workerPool.workers.clear()
    this.workerPool.availableWorkers.length = 0
    this.workerPool.busyWorkers.length = 0
    this.testQueue.clear()
    
    console.log('✅ Parallel test executor cleanup complete')
  }
}

/**
 * Test queue for managing test execution order
 */
class TestQueue {
  private queue: ParallelTestCase[] = []
  private priorityQueue: Map<ExecutionPriority, ParallelTestCase[]> = new Map()
  private config: WorkloadDistributionConfig
  
  constructor(config: WorkloadDistributionConfig) {
    this.config = config
    this.initializePriorityQueues()
  }
  
  private initializePriorityQueues(): void {
    for (const priority of Object.values(ExecutionPriority)) {
      this.priorityQueue.set(priority as ExecutionPriority, [])
    }
  }
  
  enqueueTests(tests: ParallelTestCase[]): void {
    for (const test of tests) {
      this.enqueue(test)
    }
  }
  
  enqueue(test: ParallelTestCase): void {
    const priorityTests = this.priorityQueue.get(test.priority) || []
    priorityTests.push(test)
  }
  
  dequeue(): ParallelTestCase | null {
    // Dequeue by priority
    for (const priority of [ExecutionPriority.CRITICAL, ExecutionPriority.HIGH, ExecutionPriority.MEDIUM, ExecutionPriority.LOW]) {
      const priorityTests = this.priorityQueue.get(priority) || []
      if (priorityTests.length > 0) {
        return priorityTests.shift() || null
      }
    }
    
    return null
  }
  
  isEmpty(): boolean {
    return Array.from(this.priorityQueue.values()).every(queue => queue.length === 0)
  }
  
  clear(): void {
    for (const queue of this.priorityQueue.values()) {
      queue.length = 0
    }
  }
}

// Type definitions
export interface ParallelExecutionResult {
  suiteName: string
  totalTests: number
  successfulTests: number
  failedTests: number
  totalDuration: number
  results: TestResult[]
  performance: ExecutionPerformanceMetrics
  workerMetrics: WorkerMetrics[]
}

export interface ExecutionPerformanceMetrics {
  totalDuration: number
  averageTestDuration: number
  parallelEfficiency: number
  workerUtilization: number
  throughput: number
  speedupFactor: number
}

export interface WorkerMetrics {
  workerId: number
  performance: WorkerPerformanceMetrics
  status: string
  currentTestCount: number
}

// Default configuration
export const DEFAULT_PARALLEL_CONFIG: ParallelExecutionConfig = {
  strategy: ParallelStrategy.ADAPTIVE,
  maxWorkers: cpus().length,
  minWorkers: 2,
  workloadDistribution: {
    balancingAlgorithm: 'least-loaded',
    chunkSize: 1,
    adaptiveChunking: true,
    resourceAffinity: true
  },
  resourceManagement: {
    memoryLimitPerWorker: 512, // MB
    cpuThrottling: false,
    ioThrottling: false,
    sharedResourceLocking: true
  },
  errorHandling: {
    retryFailedTests: true,
    maxRetries: 2,
    retryDelay: 1000,
    isolateFailures: true,
    failFast: false
  },
  monitoring: {
    trackWorkerPerformance: true,
    trackResourceUsage: true,
    generateDistributionReport: true,
    realTimeMonitoring: true
  }
}

// Export singleton instance
export const parallelExecutor = ParallelTestExecutor.getInstance(DEFAULT_PARALLEL_CONFIG)

// Worker thread code
if (!isMainThread) {
  // Worker thread implementation
  const { workerId, config } = workerData
  
  parentPort?.on('message', async (message) => {
    if (message.type === 'execute-test') {
      try {
        const startTime = Date.now()
        
        // Recreate execute function from string
        const executeFunction = new Function('return ' + message.test.executeFunction)()
        
        // Execute test
        await executeFunction()
        
        const endTime = Date.now()
        
        parentPort?.postMessage({
          type: 'test-completed',
          result: {
            id: message.test.id,
            name: message.test.name,
            success: true,
            duration: endTime - startTime,
            metadata: {
              workerId,
              startTime,
              endTime,
              memoryUsage: process.memoryUsage().heapUsed,
              retryCount: 0
            }
          }
        })
      } catch (error) {
        parentPort?.postMessage({
          type: 'test-failed',
          result: {
            id: message.test.id,
            name: message.test.name,
            success: false,
            duration: 0,
            error: error,
            metadata: {
              workerId,
              startTime: Date.now(),
              endTime: Date.now(),
              memoryUsage: process.memoryUsage().heapUsed,
              retryCount: 0
            }
          }
        })
      }
    }
  })
}