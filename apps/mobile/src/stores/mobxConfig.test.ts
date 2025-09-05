import { configure as mobxConfigure } from 'mobx'
import { Platform } from 'react-native'
import { configureMobX, mobxUtils } from './mobxConfig'
import { setupConsoleMocks } from '@mocks/utilities/consoleMockSetup'

// Type for globalThis with __DEV__
type GlobalWithDev = typeof globalThis & { __DEV__: boolean }

// JUSTIFIED INLINE MOCKING: Testing low-level MobX and React Native configuration
// This file tests the specific configuration behavior of MobX with React Native Platform,
// requiring precise control over the mocked dependencies to verify configuration values.
// Centralized mocking would not provide the fine-grained control needed for these tests.

// Mock React Native Platform
jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios', // Default to iOS for testing
  },
}))

// Mock MobX configure function
jest.mock('mobx', () => ({
  configure: jest.fn(),
}))

const mockMobxConfigure = mobxConfigure as jest.MockedFunction<typeof mobxConfigure>
const mockPlatform = Platform as jest.Mocked<typeof Platform>

describe('mobxConfig', () => {
  let consoleMocks: ReturnType<typeof setupConsoleMocks>
  let originalDEV: boolean

  beforeEach(() => {
    jest.clearAllMocks()

    // Setup console mocks using centralized utility
    consoleMocks = setupConsoleMocks(['log', 'time', 'timeEnd'])

    // Store original __DEV__ value
    originalDEV = (globalThis as GlobalWithDev).__DEV__
  })

  afterEach(() => {
    // Restore console methods
    consoleMocks.restore()

    // Restore __DEV__
    ;(globalThis as GlobalWithDev).__DEV__ = originalDEV
  })

  describe('configureMobX', () => {
    it('should configure MobX with correct production settings', () => {
      configureMobX()

      expect(mockMobxConfigure).toHaveBeenCalledWith({
        enforceActions: 'always',
        computedRequiresReaction: false,
        reactionRequiresObservable: false,
        observableRequiresReaction: false,
        disableErrorBoundaries: false,
      })
    })

    it('should log configuration message for iOS platform', () => {
      mockPlatform.OS = 'ios'

      configureMobX()

      expect(console.log).toHaveBeenCalledWith('📱 MobX configured for ios environment')
    })

    it('should log configuration message for Android platform', () => {
      mockPlatform.OS = 'android'

      configureMobX()

      expect(console.log).toHaveBeenCalledWith('📱 MobX configured for android environment')
    })

    it('should log configuration message for web platform', () => {
      mockPlatform.OS = 'web'

      configureMobX()

      expect(console.log).toHaveBeenCalledWith('📱 MobX configured for web environment')
    })

    it('should call MobX configure exactly once per invocation', () => {
      configureMobX()

      expect(mockMobxConfigure).toHaveBeenCalledTimes(1)
    })

    it('should be idempotent - can be called multiple times safely', () => {
      configureMobX()
      configureMobX()
      configureMobX()

      expect(mockMobxConfigure).toHaveBeenCalledTimes(3)
      expect(console.log).toHaveBeenCalledTimes(3)
    })
  })

  describe('mobxUtils', () => {
    describe('isDevelopment', () => {
      it('should return true when __DEV__ is true', () => {
        ;(globalThis as GlobalWithDev).__DEV__ = true

        // Re-import to get fresh value
        jest.resetModules()
        const { mobxUtils: freshUtils } = require('./mobxConfig')

        expect(freshUtils.isDevelopment).toBe(true)
      })

      it('should return false when __DEV__ is false', () => {
        ;(globalThis as GlobalWithDev).__DEV__ = false

        // Re-import to get fresh value
        jest.resetModules()
        const { mobxUtils: freshUtils } = require('./mobxConfig')

        expect(freshUtils.isDevelopment).toBe(false)
      })
    })

    describe('log', () => {
      it('should log messages in development mode', () => {
        ;(globalThis as GlobalWithDev).__DEV__ = true

        mobxUtils.log('Test message', 'arg1', 42, { key: 'value' })

        expect(console.log).toHaveBeenCalledWith('🏪 [MobX] Test message', 'arg1', 42, { key: 'value' })
      })

      it('should not log messages in production mode', () => {
        ;(globalThis as GlobalWithDev).__DEV__ = false

        mobxUtils.log('Test message', 'should not appear')

        expect(console.log).not.toHaveBeenCalled()
      })

      it('should handle messages with no additional arguments', () => {
        ;(globalThis as GlobalWithDev).__DEV__ = true

        mobxUtils.log('Simple message')

        expect(console.log).toHaveBeenCalledWith('🏪 [MobX] Simple message')
      })

      it('should handle empty messages', () => {
        ;(globalThis as GlobalWithDev).__DEV__ = true

        mobxUtils.log('')

        expect(console.log).toHaveBeenCalledWith('🏪 [MobX] ')
      })

      it('should handle complex object arguments', () => {
        ;(globalThis as GlobalWithDev).__DEV__ = true
        const complexObj = { nested: { array: [1, 2, 3], fn: () => {} } }

        mobxUtils.log('Complex object', complexObj)

        expect(console.log).toHaveBeenCalledWith('🏪 [MobX] Complex object', complexObj)
      })
    })

    describe('time', () => {
      it('should start timing in development mode when console.time exists', () => {
        ;(globalThis as GlobalWithDev).__DEV__ = true

        mobxUtils.time('test-operation')

        expect(console.time).toHaveBeenCalledWith('🏪 [MobX] test-operation')
      })

      it('should not start timing in production mode', () => {
        ;(globalThis as GlobalWithDev).__DEV__ = false

        mobxUtils.time('test-operation')

        expect(console.time).not.toHaveBeenCalled()
      })

      it('should handle missing console.time gracefully', () => {
        ;(globalThis as GlobalWithDev).__DEV__ = true
        console.time = undefined as unknown as typeof console.time

        expect(() => mobxUtils.time('test-operation')).not.toThrow()
      })

      it('should handle empty label', () => {
        ;(globalThis as GlobalWithDev).__DEV__ = true

        mobxUtils.time('')

        expect(console.time).toHaveBeenCalledWith('🏪 [MobX] ')
      })

      it('should handle special characters in label', () => {
        ;(globalThis as GlobalWithDev).__DEV__ = true

        mobxUtils.time('test-operation:123/special-chars')

        expect(console.time).toHaveBeenCalledWith('🏪 [MobX] test-operation:123/special-chars')
      })
    })

    describe('timeEnd', () => {
      it('should end timing in development mode when console.timeEnd exists', () => {
        ;(globalThis as GlobalWithDev).__DEV__ = true

        mobxUtils.timeEnd('test-operation')

        expect(console.timeEnd).toHaveBeenCalledWith('🏪 [MobX] test-operation')
      })

      it('should not end timing in production mode', () => {
        ;(globalThis as GlobalWithDev).__DEV__ = false

        mobxUtils.timeEnd('test-operation')

        expect(console.timeEnd).not.toHaveBeenCalled()
      })

      it('should handle missing console.timeEnd gracefully', () => {
        ;(globalThis as GlobalWithDev).__DEV__ = true
        console.timeEnd = undefined as unknown as typeof console.timeEnd

        expect(() => mobxUtils.timeEnd('test-operation')).not.toThrow()
      })

      it('should match time() label format', () => {
        ;(globalThis as GlobalWithDev).__DEV__ = true
        const label = 'matching-operation'

        mobxUtils.time(label)
        mobxUtils.timeEnd(label)

        expect(console.time).toHaveBeenCalledWith(`🏪 [MobX] ${label}`)
        expect(console.timeEnd).toHaveBeenCalledWith(`🏪 [MobX] ${label}`)
      })
    })

    describe('timing workflow', () => {
      it('should support complete time/timeEnd workflow', () => {
        ;(globalThis as GlobalWithDev).__DEV__ = true
        const operationLabel = 'store-initialization'

        mobxUtils.time(operationLabel)
        // Simulate some work
        mobxUtils.log('Operation in progress')
        mobxUtils.timeEnd(operationLabel)

        expect(console.time).toHaveBeenCalledWith(`🏪 [MobX] ${operationLabel}`)
        expect(console.log).toHaveBeenCalledWith('🏪 [MobX] Operation in progress')
        expect(console.timeEnd).toHaveBeenCalledWith(`🏪 [MobX] ${operationLabel}`)
      })

      it('should handle nested timing operations', () => {
        ;(globalThis as GlobalWithDev).__DEV__ = true

        mobxUtils.time('outer-operation')
        mobxUtils.time('inner-operation')
        mobxUtils.timeEnd('inner-operation')
        mobxUtils.timeEnd('outer-operation')

        expect(console.time).toHaveBeenCalledTimes(2)
        expect(console.timeEnd).toHaveBeenCalledTimes(2)
      })
    })
  })

  describe('MobX configuration options', () => {
    it('should enforce actions always for strict state management', () => {
      configureMobX()

      const configCall = mockMobxConfigure.mock.calls[0][0]
      expect(configCall.enforceActions).toBe('always')
    })

    it('should disable noisy development warnings', () => {
      configureMobX()

      const configCall = mockMobxConfigure.mock.calls[0][0]
      expect(configCall.computedRequiresReaction).toBe(false)
      expect(configCall.reactionRequiresObservable).toBe(false)
      expect(configCall.observableRequiresReaction).toBe(false)
    })

    it('should keep error boundaries enabled', () => {
      configureMobX()

      const configCall = mockMobxConfigure.mock.calls[0][0]
      expect(configCall.disableErrorBoundaries).toBe(false)
    })
  })

  describe('React Native compatibility', () => {
    it('should be compatible with different React Native platforms', () => {
      const platforms = ['ios', 'android', 'web', 'windows', 'macos']

      platforms.forEach((platform) => {
        mockPlatform.OS = platform as typeof Platform.OS

        expect(() => configureMobX()).not.toThrow()
        expect(console.log).toHaveBeenCalledWith(`📱 MobX configured for ${platform} environment`)
      })
    })

    it('should provide utilities that work across platforms', () => {
      expect(typeof mobxUtils.log).toBe('function')
      expect(typeof mobxUtils.time).toBe('function')
      expect(typeof mobxUtils.timeEnd).toBe('function')
      expect(typeof mobxUtils.isDevelopment).toBe('boolean')
    })
  })

  describe('production vs development behavior', () => {
    it('should behave appropriately in production environment', () => {
      ;(globalThis as GlobalWithDev).__DEV__ = false

      mobxUtils.log('Should not appear')
      mobxUtils.time('Should not time')
      mobxUtils.timeEnd('Should not time')

      expect(console.log).not.toHaveBeenCalled()
      expect(console.time).not.toHaveBeenCalled()
      expect(console.timeEnd).not.toHaveBeenCalled()
    })

    it('should behave appropriately in development environment', () => {
      ;(globalThis as GlobalWithDev).__DEV__ = true

      mobxUtils.log('Should appear')
      mobxUtils.time('Should time')
      mobxUtils.timeEnd('Should time')

      expect(console.log).toHaveBeenCalled()
      expect(console.time).toHaveBeenCalled()
      expect(console.timeEnd).toHaveBeenCalled()
    })
  })

  describe('memory and performance', () => {
    it('should not leak memory with repeated configuration calls', () => {
      const initialMemory = process.memoryUsage().heapUsed

      for (let i = 0; i < 100; i++) {
        configureMobX()
      }

      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory

      // Allow for some memory increase but not excessive
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024) // Less than 10MB
    })

    it('should perform logging operations quickly', () => {
      ;(globalThis as GlobalWithDev).__DEV__ = true
      const start = performance.now()

      for (let i = 0; i < 1000; i++) {
        mobxUtils.log(`Performance test ${i}`, { data: i })
      }

      const end = performance.now()
      expect(end - start).toBeLessThan(1000) // Should complete in under 1 second
    })
  })
})
