/**
 * Performance Testing Utilities
 *
 * Comprehensive performance testing, benchmarking, and monitoring utilities
 * for SuperPool backend functions. Provides memory leak detection,
 * execution time analysis, and load testing capabilities.
 */

import { performance, PerformanceObserver } from 'perf_hooks'
import { EventEmitter } from 'events'

// Performance test types
export enum PerformanceTestType {
  RESPONSE_TIME = 'response_time',
  MEMORY_USAGE = 'memory_usage',
  CPU_USAGE = 'cpu_usage',
  CONCURRENCY = 'concurrency',
  LOAD_TEST = 'load_test',
  STRESS_TEST = 'stress_test',
  SPIKE_TEST = 'spike_test',
}

// Performance metrics collection
export interface PerformanceMetrics {
  executionTime: number
  memoryUsage: NodeJS.MemoryUsage
  cpuUsage: NodeJS.CpuUsage
  timestamp: number
  testName: string
  category: string
}

// Load testing configuration
export interface LoadTestConfig {
  concurrentUsers: number
  duration: number // in milliseconds
  rampUpTime: number // in milliseconds
  thinkTime: number // delay between requests
  maxRequestsPerSecond: number
}

// Performance thresholds
export interface PerformanceThresholds {
  maxResponseTime: number // milliseconds
  maxMemoryUsage: number // bytes
  maxCpuUsage: number // percentage
  minSuccessRate: number // percentage
}

export class PerformanceTestManager extends EventEmitter {
  private static instance: PerformanceTestManager
  private metrics: Map<string, PerformanceMetrics[]> = new Map()
  private benchmarks: Map<string, BenchmarkResult> = new Map()
  private observer: PerformanceObserver
  private activeTests: Set<string> = new Set()

  private constructor() {
    super()
    this.setupPerformanceObserver()
  }

  public static getInstance(): PerformanceTestManager {
    if (!PerformanceTestManager.instance) {
      PerformanceTestManager.instance = new PerformanceTestManager()
    }
    return PerformanceTestManager.instance
  }

  /**
   * Setup performance observer for automatic metric collection
   */
  private setupPerformanceObserver(): void {
    this.observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.emit('performance-entry', entry)
      }
    })

    this.observer.observe({ entryTypes: ['function', 'measure', 'mark'] })
  }

  /**
   * Start performance measurement for a test
   */
  startMeasurement(testName: string, category: string = 'general'): PerformanceMeasurement {
    const measurementId = `${testName}-${Date.now()}`
    this.activeTests.add(measurementId)

    const startTime = performance.now()
    const startCpuUsage = process.cpuUsage()
    const startMemory = process.memoryUsage()

    performance.mark(`${measurementId}-start`)

    return {
      id: measurementId,
      testName,
      category,
      startTime,
      startCpuUsage,
      startMemory,
      end: () => this.endMeasurement(measurementId, testName, category, startTime, startCpuUsage, startMemory),
    }
  }

  /**
   * End performance measurement
   */
  private endMeasurement(
    measurementId: string,
    testName: string,
    category: string,
    startTime: number,
    startCpuUsage: NodeJS.CpuUsage,
    startMemory: NodeJS.MemoryUsage
  ): PerformanceMetrics {
    const endTime = performance.now()
    const endCpuUsage = process.cpuUsage(startCpuUsage)
    const endMemory = process.memoryUsage()

    performance.mark(`${measurementId}-end`)
    performance.measure(`${measurementId}`, `${measurementId}-start`, `${measurementId}-end`)

    const metrics: PerformanceMetrics = {
      executionTime: endTime - startTime,
      memoryUsage: {
        rss: endMemory.rss - startMemory.rss,
        heapTotal: endMemory.heapTotal - startMemory.heapTotal,
        heapUsed: endMemory.heapUsed - startMemory.heapUsed,
        external: endMemory.external - startMemory.external,
        arrayBuffers: endMemory.arrayBuffers - startMemory.arrayBuffers,
      },
      cpuUsage: endCpuUsage,
      timestamp: Date.now(),
      testName,
      category,
    }

    this.recordMetrics(testName, metrics)
    this.activeTests.delete(measurementId)

    return metrics
  }

  /**
   * Record performance metrics
   */
  private recordMetrics(testName: string, metrics: PerformanceMetrics): void {
    if (!this.metrics.has(testName)) {
      this.metrics.set(testName, [])
    }

    this.metrics.get(testName)!.push(metrics)
    this.emit('metrics-recorded', testName, metrics)
  }

  /**
   * Run performance benchmark for a function
   */
  async benchmark<T>(name: string, fn: () => Promise<T> | T, iterations: number = 100, warmupRuns: number = 10): Promise<BenchmarkResult> {
    console.log(`🏃 Running benchmark: ${name} (${iterations} iterations)`)

    // Warmup runs to stabilize performance
    for (let i = 0; i < warmupRuns; i++) {
      await fn()
    }

    const measurements: number[] = []
    const memoryMeasurements: number[] = []

    for (let i = 0; i < iterations; i++) {
      const measurement = this.startMeasurement(`${name}-benchmark`, 'benchmark')

      try {
        await fn()
        const metrics = measurement.end()
        measurements.push(metrics.executionTime)
        memoryMeasurements.push(metrics.memoryUsage.heapUsed)
      } catch (error) {
        measurement.end()
        throw error
      }
    }

    const result = this.calculateBenchmarkResult(name, measurements, memoryMeasurements)
    this.benchmarks.set(name, result)

    return result
  }

  /**
   * Calculate benchmark statistics
   */
  private calculateBenchmarkResult(name: string, timeMeasurements: number[], memoryMeasurements: number[]): BenchmarkResult {
    const sortedTimes = [...timeMeasurements].sort((a, b) => a - b)
    const sortedMemory = [...memoryMeasurements].sort((a, b) => a - b)

    return {
      name,
      iterations: timeMeasurements.length,
      timing: {
        min: Math.min(...timeMeasurements),
        max: Math.max(...timeMeasurements),
        mean: timeMeasurements.reduce((sum, val) => sum + val, 0) / timeMeasurements.length,
        median: sortedTimes[Math.floor(sortedTimes.length / 2)],
        p95: sortedTimes[Math.floor(sortedTimes.length * 0.95)],
        p99: sortedTimes[Math.floor(sortedTimes.length * 0.99)],
        stdDev: this.calculateStandardDeviation(timeMeasurements),
      },
      memory: {
        min: Math.min(...memoryMeasurements),
        max: Math.max(...memoryMeasurements),
        mean: memoryMeasurements.reduce((sum, val) => sum + val, 0) / memoryMeasurements.length,
        median: sortedMemory[Math.floor(sortedMemory.length / 2)],
        stdDev: this.calculateStandardDeviation(memoryMeasurements),
      },
      timestamp: Date.now(),
    }
  }

  /**
   * Calculate standard deviation
   */
  private calculateStandardDeviation(values: number[]): number {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length
    const squaredDifferences = values.map((val) => Math.pow(val - mean, 2))
    const avgSquaredDiff = squaredDifferences.reduce((sum, val) => sum + val, 0) / values.length
    return Math.sqrt(avgSquaredDiff)
  }

  /**
   * Run load test
   */
  async runLoadTest<T>(
    name: string,
    fn: () => Promise<T> | T,
    config: LoadTestConfig,
    thresholds?: PerformanceThresholds
  ): Promise<LoadTestResult> {
    console.log(`🔥 Running load test: ${name}`)
    console.log(`   Users: ${config.concurrentUsers}`)
    console.log(`   Duration: ${config.duration}ms`)
    console.log(`   Ramp-up: ${config.rampUpTime}ms`)

    const results: LoadTestResult = {
      name,
      config,
      startTime: Date.now(),
      endTime: 0,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      responseTimes: [],
      errors: [],
      throughput: 0,
      averageResponseTime: 0,
      successRate: 0,
    }

    const promises: Promise<void>[] = []
    const userRampDelay = config.rampUpTime / config.concurrentUsers

    // Start concurrent users with ramp-up
    for (let user = 0; user < config.concurrentUsers; user++) {
      const userPromise = new Promise<void>((resolve) => {
        setTimeout(async () => {
          await this.simulateUser(fn, config, results)
          resolve()
        }, user * userRampDelay)
      })

      promises.push(userPromise)
    }

    // Wait for all users to complete
    await Promise.all(promises)

    results.endTime = Date.now()
    results.throughput = results.totalRequests / ((results.endTime - results.startTime) / 1000)
    results.averageResponseTime = results.responseTimes.reduce((sum, time) => sum + time, 0) / results.responseTimes.length
    results.successRate = (results.successfulRequests / results.totalRequests) * 100

    // Check against thresholds
    if (thresholds) {
      this.validateThresholds(results, thresholds)
    }

    return results
  }

  /**
   * Simulate individual user for load testing
   */
  private async simulateUser<T>(fn: () => Promise<T> | T, config: LoadTestConfig, results: LoadTestResult): Promise<void> {
    const userStartTime = Date.now()
    const userEndTime = userStartTime + config.duration

    while (Date.now() < userEndTime) {
      const measurement = this.startMeasurement(`${results.name}-load-test`, 'load-test')

      try {
        results.totalRequests++
        await fn()
        const metrics = measurement.end()

        results.successfulRequests++
        results.responseTimes.push(metrics.executionTime)
      } catch (error) {
        measurement.end()
        results.failedRequests++
        results.errors.push(error as Error)
      }

      // Think time between requests
      if (config.thinkTime > 0) {
        await this.sleep(config.thinkTime)
      }

      // Rate limiting
      const currentRate = results.totalRequests / ((Date.now() - results.startTime) / 1000)
      if (currentRate > config.maxRequestsPerSecond) {
        await this.sleep(100) // Brief pause to reduce rate
      }
    }
  }

  /**
   * Validate performance against thresholds
   */
  private validateThresholds(results: LoadTestResult, thresholds: PerformanceThresholds): void {
    const violations: string[] = []

    if (results.averageResponseTime > thresholds.maxResponseTime) {
      violations.push(`Average response time ${results.averageResponseTime}ms exceeds threshold ${thresholds.maxResponseTime}ms`)
    }

    if (results.successRate < thresholds.minSuccessRate) {
      violations.push(`Success rate ${results.successRate}% below threshold ${thresholds.minSuccessRate}%`)
    }

    if (violations.length > 0) {
      console.warn(`⚠️  Performance thresholds violated:`)
      violations.forEach((violation) => console.warn(`   - ${violation}`))
    }
  }

  /**
   * Detect memory leaks by running function repeatedly
   */
  async detectMemoryLeaks<T>(
    name: string,
    fn: () => Promise<T> | T,
    iterations: number = 1000,
    gcInterval: number = 100
  ): Promise<MemoryLeakReport> {
    console.log(`🔍 Memory leak detection: ${name} (${iterations} iterations)`)

    const memorySnapshots: MemorySnapshot[] = []

    // Force garbage collection if available (--expose-gc)
    const forceGC = global.gc || (() => {})

    for (let i = 0; i < iterations; i++) {
      const measurement = this.startMeasurement(`${name}-memory-leak`, 'memory-leak')

      await fn()

      // Periodic garbage collection
      if (i % gcInterval === 0) {
        forceGC()
        const metrics = measurement.end()

        memorySnapshots.push({
          iteration: i,
          heapUsed: metrics.memoryUsage.heapUsed,
          heapTotal: metrics.memoryUsage.heapTotal,
          rss: metrics.memoryUsage.rss,
          external: metrics.memoryUsage.external,
        })
      } else {
        measurement.end()
      }
    }

    return this.analyzeMemoryLeaks(name, memorySnapshots)
  }

  /**
   * Analyze memory snapshots for leaks
   */
  private analyzeMemoryLeaks(name: string, snapshots: MemorySnapshot[]): MemoryLeakReport {
    if (snapshots.length < 2) {
      return { name, hasLeak: false, report: 'Insufficient data for analysis' }
    }

    const first = snapshots[0]
    const last = snapshots[snapshots.length - 1]

    const heapGrowth = last.heapUsed - first.heapUsed
    const rssGrowth = last.rss - first.rss

    // Simple heuristic: significant growth indicates potential leak
    const heapGrowthMB = heapGrowth / (1024 * 1024)
    const rssGrowthMB = rssGrowth / (1024 * 1024)

    const hasLeak = heapGrowthMB > 10 || rssGrowthMB > 20 // Thresholds in MB

    return {
      name,
      hasLeak,
      report: `Heap growth: ${heapGrowthMB.toFixed(2)}MB, RSS growth: ${rssGrowthMB.toFixed(2)}MB`,
      details: {
        initialMemory: first,
        finalMemory: last,
        growth: {
          heap: heapGrowthMB,
          rss: rssGrowthMB,
        },
        snapshots,
      },
    }
  }

  /**
   * Get performance summary for a test
   */
  getPerformanceSummary(testName: string): PerformanceSummary | null {
    const metrics = this.metrics.get(testName)
    if (!metrics || metrics.length === 0) {
      return null
    }

    const executionTimes = metrics.map((m) => m.executionTime)
    const memoryUsages = metrics.map((m) => m.memoryUsage.heapUsed)

    return {
      testName,
      totalRuns: metrics.length,
      averageExecutionTime: executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length,
      minExecutionTime: Math.min(...executionTimes),
      maxExecutionTime: Math.max(...executionTimes),
      averageMemoryUsage: memoryUsages.reduce((sum, mem) => sum + mem, 0) / memoryUsages.length,
      totalMemoryAllocated: memoryUsages.reduce((sum, mem) => sum + mem, 0),
      categories: [...new Set(metrics.map((m) => m.category))],
    }
  }

  /**
   * Generate comprehensive performance report
   */
  generateReport(): PerformanceReport {
    const testSummaries = Array.from(this.metrics.keys())
      .map((testName) => this.getPerformanceSummary(testName)!)
      .filter(Boolean)

    const benchmarkResults = Array.from(this.benchmarks.values())

    return {
      timestamp: Date.now(),
      testSummaries,
      benchmarks: benchmarkResults,
      totalTests: testSummaries.length,
      totalBenchmarks: benchmarkResults.length,
      overallStats: this.calculateOverallStats(testSummaries),
    }
  }

  /**
   * Calculate overall performance statistics
   */
  private calculateOverallStats(summaries: PerformanceSummary[]): OverallPerformanceStats {
    if (summaries.length === 0) {
      return { averageExecutionTime: 0, totalMemoryUsage: 0, totalRuns: 0 }
    }

    return {
      averageExecutionTime: summaries.reduce((sum, s) => sum + s.averageExecutionTime, 0) / summaries.length,
      totalMemoryUsage: summaries.reduce((sum, s) => sum + s.totalMemoryAllocated, 0),
      totalRuns: summaries.reduce((sum, s) => sum + s.totalRuns, 0),
    }
  }

  /**
   * Clear all metrics and benchmarks
   */
  clearAll(): void {
    this.metrics.clear()
    this.benchmarks.clear()
    this.activeTests.clear()
  }

  /**
   * Utility sleep function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

// Type definitions
export interface PerformanceMeasurement {
  id: string
  testName: string
  category: string
  startTime: number
  startCpuUsage: NodeJS.CpuUsage
  startMemory: NodeJS.MemoryUsage
  end: () => PerformanceMetrics
}

export interface BenchmarkResult {
  name: string
  iterations: number
  timing: {
    min: number
    max: number
    mean: number
    median: number
    p95: number
    p99: number
    stdDev: number
  }
  memory: {
    min: number
    max: number
    mean: number
    median: number
    stdDev: number
  }
  timestamp: number
}

export interface LoadTestResult {
  name: string
  config: LoadTestConfig
  startTime: number
  endTime: number
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  responseTimes: number[]
  errors: Error[]
  throughput: number
  averageResponseTime: number
  successRate: number
}

export interface MemorySnapshot {
  iteration: number
  heapUsed: number
  heapTotal: number
  rss: number
  external: number
}

export interface MemoryLeakReport {
  name: string
  hasLeak: boolean
  report: string
  details?: {
    initialMemory: MemorySnapshot
    finalMemory: MemorySnapshot
    growth: {
      heap: number
      rss: number
    }
    snapshots: MemorySnapshot[]
  }
}

export interface PerformanceSummary {
  testName: string
  totalRuns: number
  averageExecutionTime: number
  minExecutionTime: number
  maxExecutionTime: number
  averageMemoryUsage: number
  totalMemoryAllocated: number
  categories: string[]
}

export interface PerformanceReport {
  timestamp: number
  testSummaries: PerformanceSummary[]
  benchmarks: BenchmarkResult[]
  totalTests: number
  totalBenchmarks: number
  overallStats: OverallPerformanceStats
}

export interface OverallPerformanceStats {
  averageExecutionTime: number
  totalMemoryUsage: number
  totalRuns: number
}

// Export singleton instance
export const performanceManager = PerformanceTestManager.getInstance()

// Convenience functions
export const startPerformanceTest = (name: string, category?: string): PerformanceMeasurement => {
  return performanceManager.startMeasurement(name, category)
}

export const runBenchmark = async <T>(name: string, fn: () => Promise<T> | T, iterations?: number): Promise<BenchmarkResult> => {
  return performanceManager.benchmark(name, fn, iterations)
}

export const detectMemoryLeaks = async <T>(name: string, fn: () => Promise<T> | T, iterations?: number): Promise<MemoryLeakReport> => {
  return performanceManager.detectMemoryLeaks(name, fn, iterations)
}
