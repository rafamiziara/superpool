// Import after mocking dependencies
// import type { DeviceIdResult } from './secureDeviceId' will be used via require

// Mock React Native Platform
const mockPlatform = { OS: 'ios' }
jest.mock('react-native', () => ({
  Platform: mockPlatform,
}))

// Mock crypto for testing
const mockGetRandomValues = jest.fn()
const mockCrypto = {
  getRandomValues: mockGetRandomValues,
  subtle: {} as SubtleCrypto,
  randomUUID: jest.fn(() => 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' as `${string}-${string}-${string}-${string}-${string}`),
} as unknown as Crypto

// Setup crypto mock
Object.defineProperty(global, 'crypto', {
  value: mockCrypto,
  writable: true,
})

// Import after mocking
const { SecureDeviceIdGenerator, generateSecureDeviceId, generateSecureDeviceIdWithInfo, secureDeviceId } = require('./secureDeviceId')
type _DeviceIdResult = import('./secureDeviceId').DeviceIdResult

describe('SecureDeviceIdGenerator', () => {
  let generator: InstanceType<typeof SecureDeviceIdGenerator>
  let consoleLogSpy: jest.SpyInstance
  let consoleWarnSpy: jest.SpyInstance
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()

    // Reset platform to iOS by default
    mockPlatform.OS = 'ios'

    // Setup console spies
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

    // Create fresh generator instance
    generator = new SecureDeviceIdGenerator()

    // Setup default crypto mock behavior
    let callCounter = 0
    mockGetRandomValues.mockImplementation((array: Uint8Array) => {
      // Fill with deterministic but varied random values for testing
      callCounter++
      for (let i = 0; i < array.length; i++) {
        array[i] = (i * 17 + 42 + callCounter * 13) % 256
      }
      return array
    })
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    generator.clearCache()
  })

  describe('Singleton Pattern', () => {
    it('should return the same instance when calling getInstance', () => {
      const instance1 = SecureDeviceIdGenerator.getInstance()
      const instance2 = SecureDeviceIdGenerator.getInstance()

      expect(instance1).toBe(instance2)
      expect(instance1).toBeInstanceOf(SecureDeviceIdGenerator)
    })
  })

  describe('Cryptographically Secure Generation', () => {
    it('should generate device ID using WebCrypto when available', async () => {
      const result = await generator.generateSecureDeviceId()

      expect(result.deviceId).toMatch(/^mobile-ios-\d+-[a-z0-9]+$/)
      expect(result.generatorUsed).toBe('WebCrypto')
      expect(result.entropy).toBeGreaterThan(50) // Should have high entropy
      expect(result.attemptsRequired).toBe(1)

      expect(mockGetRandomValues).toHaveBeenCalledWith(expect.any(Uint8Array))
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(/✅ Generated secure device ID with \d+ bits entropy using WebCrypto/)
      )
    })

    it('should generate device ID for different platforms', async () => {
      const platforms = ['ios', 'android'] as const

      for (const platform of platforms) {
        mockPlatform.OS = platform

        const result = await generator.generateSecureDeviceId()

        expect(result.deviceId).toMatch(new RegExp(`^mobile-${platform}-\\d+-[a-z0-9]+$`))
        expect(result.generatorUsed).toBe('WebCrypto')
      }
    })

    it('should use enhanced fallback when WebCrypto is not available', async () => {
      // Make crypto unavailable
      Object.defineProperty(global, 'crypto', {
        value: undefined,
        writable: true,
      })

      // Create new generator to pick up the change
      const fallbackGenerator = new SecureDeviceIdGenerator()

      const result = await fallbackGenerator.generateSecureDeviceId()

      expect(result.deviceId).toMatch(/^mobile-ios-\d+-[a-z0-9]+$/)
      expect(result.generatorUsed).toBe('EnhancedMathRandom')
      expect(result.entropy).toBeGreaterThan(30) // Lower but still reasonable entropy

      // Restore crypto for other tests
      Object.defineProperty(global, 'crypto', {
        value: mockCrypto,
        writable: true,
      })
    })

    it('should generate high entropy device IDs', async () => {
      const result = await generator.generateSecureDeviceId({
        entropyLength: 32, // 256 bits
      })

      expect(result.entropy).toBeGreaterThan(100) // Should have very high entropy
      expect(result.deviceId.length).toBeGreaterThan(50) // Longer ID
    })
  })

  describe('Collision Resistance', () => {
    it('should generate unique device IDs for multiple calls', async () => {
      const numIds = 10
      const ids = new Set<string>()

      for (let i = 0; i < numIds; i++) {
        const result = await generator.generateSecureDeviceId()
        ids.add(result.deviceId)
      }

      expect(ids.size).toBe(numIds) // All IDs should be unique
    })

    it('should handle local collision detection and retry', async () => {
      // Mock Date.now to return same timestamp for collision
      const fixedTimestamp = 1234567890000
      const originalDateNow = Date.now
      Date.now = jest.fn(() => fixedTimestamp)

      try {
        // Generate one ID first to create a collision
        const firstResult = await generator.generateSecureDeviceId()

        // Mock crypto to return same values initially, then different values
        let callCount = 0
        mockGetRandomValues.mockImplementation((array: Uint8Array) => {
          callCount++
          if (callCount <= 2) {
            // Return same values for collision (same as first call)
            for (let i = 0; i < array.length; i++) {
              array[i] = (i * 17 + 42 + 1 * 13) % 256 // Same as first call
            }
          } else {
            // Return different values after collision
            for (let i = 0; i < array.length; i++) {
              array[i] = (i * 31 + 73) % 256
            }
          }
          return array
        })

        // This should detect collision and retry
        const secondResult = await generator.generateSecureDeviceId()

        expect(secondResult.deviceId).not.toBe(firstResult.deviceId)
        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringMatching(/⚠️ Local collision detected for device ID/))
      } finally {
        // Restore Date.now
        Date.now = originalDateNow
      }
    })

    it('should handle external collision check', async () => {
      let collisionCheckCalls = 0
      const collisionCheck = jest.fn(async (_id: string) => {
        collisionCheckCalls++
        // Return true for first call (collision), false for second
        return collisionCheckCalls === 1
      })

      const result = await generator.generateSecureDeviceId({
        collisionCheck,
      })

      expect(result.attemptsRequired).toBe(2) // Should require retry
      expect(collisionCheck).toHaveBeenCalledTimes(2)
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringMatching(/⚠️ External collision detected for device ID/))
    })

    it('should fail after maximum retry attempts', async () => {
      const collisionCheck = jest.fn(async () => true) // Always return collision

      await expect(
        generator.generateSecureDeviceId({
          maxRetries: 3,
          collisionCheck,
        })
      ).rejects.toThrow('Failed to generate unique device ID after 3 attempts')

      expect(collisionCheck).toHaveBeenCalledTimes(3)
    })
  })

  describe('Error Handling', () => {
    it('should handle crypto API errors gracefully', async () => {
      // Mock crypto to throw an error when getRandomValues is called
      mockGetRandomValues.mockImplementation(() => {
        throw new Error('Crypto API failed')
      })

      // The generator should catch the error and retry, then eventually fail
      await expect(generator.generateSecureDeviceId()).rejects.toThrow(/Failed to generate secure device ID/)

      // Should have logged error attempts
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringMatching(/❌ Device ID generation attempt \d+ failed/), expect.any(Error))
    })

    it('should provide fallback error handling', async () => {
      // Mock crypto to be unavailable (undefined)
      Object.defineProperty(global, 'crypto', {
        value: undefined,
        writable: true,
      })

      // Create new generator to pick up the change
      const fallbackGenerator = new SecureDeviceIdGenerator()

      // Should still work with enhanced math random fallback
      const result = await fallbackGenerator.generateSecureDeviceId()

      expect(result.deviceId).toMatch(/^mobile-ios-\d+-[a-z0-9]+$/)
      expect(result.generatorUsed).toBe('EnhancedMathRandom')

      // Restore crypto
      Object.defineProperty(global, 'crypto', {
        value: mockCrypto,
        writable: true,
      })
    })
  })

  describe('Device ID Format and Structure', () => {
    it('should generate IDs with correct format structure', async () => {
      mockPlatform.OS = 'android'

      const result = await generator.generateSecureDeviceId()

      const parts = result.deviceId.split('-')
      expect(parts).toHaveLength(4) // mobile-platform-timestamp-random
      expect(parts[0]).toBe('mobile')
      expect(parts[1]).toBe('android')
      expect(parts[2]).toMatch(/^\d+$/) // timestamp
      expect(parts[3]).toMatch(/^[a-z0-9]+$/) // base36 random part
    })

    it('should include timestamp in device ID', async () => {
      const beforeTime = Date.now()

      const result = await generator.generateSecureDeviceId()

      const afterTime = Date.now()
      const timestampMatch = result.deviceId.match(/mobile-\w+-(\d+)-/)
      expect(timestampMatch).not.toBeNull()

      const timestamp = parseInt(timestampMatch![1], 10)
      expect(timestamp).toBeGreaterThanOrEqual(beforeTime)
      expect(timestamp).toBeLessThanOrEqual(afterTime)
    })

    it('should generate URL-safe characters only', async () => {
      const result = await generator.generateSecureDeviceId()

      // Should only contain alphanumeric characters, hyphens
      expect(result.deviceId).toMatch(/^[a-z0-9-]+$/)
      expect(result.deviceId).not.toMatch(/[^a-z0-9-]/)
    })
  })

  describe('Configuration Options', () => {
    it('should respect custom entropy length', async () => {
      const shortResult = await generator.generateSecureDeviceId({
        entropyLength: 8,
      })

      const longResult = await generator.generateSecureDeviceId({
        entropyLength: 32,
      })

      // Longer entropy should create longer random part
      const shortRandom = shortResult.deviceId.split('-')[3]
      const longRandom = longResult.deviceId.split('-')[3]

      expect(longRandom.length).toBeGreaterThan(shortRandom.length)
      expect(longResult.entropy).toBeGreaterThan(shortResult.entropy)
    })

    it('should respect maxRetries configuration', async () => {
      const collisionCheck = jest.fn(async () => true)

      await expect(
        generator.generateSecureDeviceId({
          maxRetries: 2,
          collisionCheck,
        })
      ).rejects.toThrow('Failed to generate unique device ID after 2 attempts')

      expect(collisionCheck).toHaveBeenCalledTimes(2)
    })
  })

  describe('Statistics and Monitoring', () => {
    it('should track generated IDs in statistics', async () => {
      const initialStats = generator.getStats()
      expect(initialStats.totalGenerated).toBe(0)

      await generator.generateSecureDeviceId()
      await generator.generateSecureDeviceId()

      const finalStats = generator.getStats()
      expect(finalStats.totalGenerated).toBe(2)
      expect(finalStats.generatorName).toBe('WebCrypto')
    })

    it('should clear cache when requested', async () => {
      await generator.generateSecureDeviceId()

      expect(generator.getStats().totalGenerated).toBe(1)

      generator.clearCache()

      expect(generator.getStats().totalGenerated).toBe(0)
    })
  })

  describe('Convenience Functions', () => {
    it('should provide simple generateDeviceId interface', async () => {
      const deviceId = await generator.generateDeviceId()

      expect(typeof deviceId).toBe('string')
      expect(deviceId).toMatch(/^mobile-ios-\d+-[a-z0-9]+$/)
    })

    it('should provide module-level convenience functions', async () => {
      const simpleId = await generateSecureDeviceId()
      const detailedResult = await generateSecureDeviceIdWithInfo()

      expect(typeof simpleId).toBe('string')
      expect(simpleId).toMatch(/^mobile-ios-\d+-[a-z0-9]+$/)

      expect(detailedResult).toHaveProperty('deviceId')
      expect(detailedResult).toHaveProperty('generatorUsed')
      expect(detailedResult).toHaveProperty('entropy')
      expect(detailedResult).toHaveProperty('attemptsRequired')
    })

    it('should provide access to singleton instance', () => {
      expect(secureDeviceId).toBeInstanceOf(SecureDeviceIdGenerator)
      expect(secureDeviceId).toBe(SecureDeviceIdGenerator.getInstance())
    })
  })

  describe('Cross-Platform Compatibility', () => {
    it('should work with different React Native platforms', async () => {
      const platforms = ['ios', 'android', 'web', 'windows', 'macos'] as const

      for (const platform of platforms) {
        mockPlatform.OS = platform

        const result = await generator.generateSecureDeviceId()

        expect(result.deviceId).toMatch(new RegExp(`^mobile-${platform}-\\d+-[a-z0-9]+$`))
        expect(result.generatorUsed).toBe('WebCrypto')
      }
    })

    it('should handle unknown platforms gracefully', async () => {
      mockPlatform.OS = 'unknown-platform'

      const result = await generator.generateSecureDeviceId()

      expect(result.deviceId).toMatch(/^mobile-unknown-platform-\d+-[a-z0-9]+$/)
    })
  })

  describe('Security Properties', () => {
    it('should not reuse random values between generations', async () => {
      const results = []

      for (let i = 0; i < 5; i++) {
        results.push(await generator.generateSecureDeviceId())
      }

      // Extract random parts
      const randomParts = results.map((r) => r.deviceId.split('-')[3])

      // All should be different
      const uniqueRandomParts = new Set(randomParts)
      expect(uniqueRandomParts.size).toBe(randomParts.length)
    })

    it('should have sufficient entropy for collision resistance', async () => {
      const result = await generator.generateSecureDeviceId()

      // With 16 bytes of entropy, should have at least 64 bits of entropy in base36
      expect(result.entropy).toBeGreaterThan(64)
    })

    it('should not log sensitive information', async () => {
      const result = await generator.generateSecureDeviceId()

      // Check that full device ID is not logged
      const logCalls = consoleLogSpy.mock.calls.flat()
      const hasFullDeviceId = logCalls.some((call) => typeof call === 'string' && call.includes(result.deviceId))

      expect(hasFullDeviceId).toBe(false)
    })
  })

  describe('Performance', () => {
    it('should generate device IDs efficiently', async () => {
      const start = Date.now()

      await generator.generateSecureDeviceId()

      const duration = Date.now() - start

      // Should complete within reasonable time (less than 100ms)
      expect(duration).toBeLessThan(100)
    })

    it('should handle multiple concurrent generations', async () => {
      const promises = Array.from({ length: 10 }, () => generator.generateSecureDeviceId())

      const results = await Promise.all(promises)

      // All should be unique
      const uniqueIds = new Set(results.map((r) => r.deviceId))
      expect(uniqueIds.size).toBe(results.length)
    })
  })
})

describe('Integration with React Native Environment', () => {
  it('should work in React Native environment', async () => {
    // This test ensures the module can be imported and used in RN
    expect(SecureDeviceIdGenerator).toBeDefined()
    expect(generateSecureDeviceId).toBeDefined()

    const deviceId = await generateSecureDeviceId()
    expect(typeof deviceId).toBe('string')
    expect(deviceId.length).toBeGreaterThan(20)
  })

  it('should handle React Native crypto polyfills', async () => {
    // Test with react-native-get-random-values polyfill scenario
    const originalCrypto = global.crypto

    // Simulate polyfilled environment
    global.crypto = {
      ...mockCrypto,
      getRandomValues: jest.fn().mockImplementation((array: Uint8Array) => {
        // Simulate react-native-get-random-values behavior
        for (let i = 0; i < array.length; i++) {
          array[i] = Math.floor(Math.random() * 256)
        }
        return array
      }),
      subtle: {} as SubtleCrypto,
      randomUUID: jest.fn(() => 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' as `${string}-${string}-${string}-${string}-${string}`),
    } as unknown as Crypto

    const generator = new SecureDeviceIdGenerator()
    const result = await generator.generateSecureDeviceId()

    expect(result.deviceId).toMatch(/^mobile-ios-\d+-[a-z0-9]+$/)
    expect(result.generatorUsed).toBe('WebCrypto')

    // Restore
    global.crypto = originalCrypto
  })
})
