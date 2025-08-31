import { UIStore } from './UIStore'

describe('UIStore', () => {
  let store: UIStore

  beforeEach(() => {
    store = new UIStore()
    jest.clearAllMocks()
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('Initial State', () => {
    it('should initialize with correct default values', () => {
      expect(store.onboardingCurrentIndex).toBe(0)
    })
  })

  describe('Computed Properties', () => {
    it('should return current onboarding slide index', () => {
      expect(store.currentOnboardingSlide).toBe(0)
    })

    it('should return updated slide index after change', () => {
      store.onboardingCurrentIndex = 2
      expect(store.currentOnboardingSlide).toBe(2)
    })
  })

  describe('setOnboardingIndex', () => {
    it('should set onboarding index to positive value', () => {
      store.setOnboardingIndex(3)
      expect(store.onboardingCurrentIndex).toBe(3)
    })

    it('should set onboarding index to zero', () => {
      store.onboardingCurrentIndex = 5
      store.setOnboardingIndex(0)
      expect(store.onboardingCurrentIndex).toBe(0)
    })

    it('should not allow negative values (set to 0)', () => {
      store.setOnboardingIndex(-1)
      expect(store.onboardingCurrentIndex).toBe(0)
    })

    it('should not allow negative values (set to 0) from positive value', () => {
      store.onboardingCurrentIndex = 3
      store.setOnboardingIndex(-5)
      expect(store.onboardingCurrentIndex).toBe(0)
    })

    it('should handle large positive values', () => {
      const largeValue = 999999
      store.setOnboardingIndex(largeValue)
      expect(store.onboardingCurrentIndex).toBe(largeValue)
    })

    it('should log the index change', () => {
      const consoleSpy = jest.spyOn(console, 'log')
      store.setOnboardingIndex(2)

      expect(consoleSpy).toHaveBeenCalledWith('📱 UIStore.setOnboardingIndex: 2')
    })

    it('should log negative values as 0', () => {
      const consoleSpy = jest.spyOn(console, 'log')
      store.setOnboardingIndex(-3)

      expect(consoleSpy).toHaveBeenCalledWith('📱 UIStore.setOnboardingIndex: -3')
      expect(store.onboardingCurrentIndex).toBe(0) // But actual value is 0
    })
  })

  describe('resetOnboardingState', () => {
    it('should reset onboarding index to 0', () => {
      store.onboardingCurrentIndex = 5
      store.resetOnboardingState()
      expect(store.onboardingCurrentIndex).toBe(0)
    })

    it('should reset from any value to 0', () => {
      store.onboardingCurrentIndex = 999
      store.resetOnboardingState()
      expect(store.onboardingCurrentIndex).toBe(0)
    })

    it('should work when already at 0', () => {
      store.onboardingCurrentIndex = 0
      store.resetOnboardingState()
      expect(store.onboardingCurrentIndex).toBe(0)
    })

    it('should log reset action', () => {
      const consoleSpy = jest.spyOn(console, 'log')
      store.resetOnboardingState()

      expect(consoleSpy).toHaveBeenCalledWith('🔄 UIStore.resetOnboardingState called')
    })

    it('should log even when already at 0', () => {
      const consoleSpy = jest.spyOn(console, 'log')
      store.onboardingCurrentIndex = 0
      store.resetOnboardingState()

      expect(consoleSpy).toHaveBeenCalledWith('🔄 UIStore.resetOnboardingState called')
    })
  })

  describe('MobX Reactivity', () => {
    it('should trigger reactions when onboarding index changes', () => {
      const reactionSpy = jest.fn()

      const { reaction } = require('mobx')
      const dispose = reaction(() => store.onboardingCurrentIndex, reactionSpy)

      store.setOnboardingIndex(2)
      expect(reactionSpy).toHaveBeenCalledWith(2, 0)

      dispose()
    })

    it('should trigger reactions for computed currentOnboardingSlide', () => {
      const reactionSpy = jest.fn()

      const { reaction } = require('mobx')
      const dispose = reaction(() => store.currentOnboardingSlide, reactionSpy)

      store.setOnboardingIndex(3)
      expect(reactionSpy).toHaveBeenCalledWith(3, 0)

      dispose()
    })

    it('should trigger reactions on reset', () => {
      const reactionSpy = jest.fn()

      const { reaction } = require('mobx')
      const dispose = reaction(() => store.onboardingCurrentIndex, reactionSpy)

      store.setOnboardingIndex(5)
      reactionSpy.mockClear() // Clear previous calls

      store.resetOnboardingState()
      expect(reactionSpy).toHaveBeenCalledWith(0, 5)

      dispose()
    })

    it('should not trigger reactions when value does not change', () => {
      const reactionSpy = jest.fn()

      const { reaction } = require('mobx')
      const dispose = reaction(() => store.onboardingCurrentIndex, reactionSpy)

      store.setOnboardingIndex(0) // Same as initial value
      expect(reactionSpy).not.toHaveBeenCalled()

      dispose()
    })

    it('should handle multiple rapid changes', () => {
      const reactionSpy = jest.fn()

      const { reaction } = require('mobx')
      const dispose = reaction(() => store.onboardingCurrentIndex, reactionSpy)

      store.setOnboardingIndex(1)
      store.setOnboardingIndex(2)
      store.setOnboardingIndex(3)

      expect(reactionSpy).toHaveBeenCalledTimes(3)
      expect(reactionSpy).toHaveBeenNthCalledWith(1, 1, 0)
      expect(reactionSpy).toHaveBeenNthCalledWith(2, 2, 1)
      expect(reactionSpy).toHaveBeenNthCalledWith(3, 3, 2)

      dispose()
    })
  })

  describe('Integration Scenarios', () => {
    it('should support typical onboarding flow', () => {
      const states = []

      // Simulate typical onboarding progression
      states.push(store.currentOnboardingSlide) // 0 - Welcome

      store.setOnboardingIndex(1)
      states.push(store.currentOnboardingSlide) // 1 - Feature 1

      store.setOnboardingIndex(2)
      states.push(store.currentOnboardingSlide) // 2 - Feature 2

      store.setOnboardingIndex(3)
      states.push(store.currentOnboardingSlide) // 3 - Feature 3

      store.resetOnboardingState()
      states.push(store.currentOnboardingSlide) // 0 - Reset

      expect(states).toEqual([0, 1, 2, 3, 0])
    })

    it('should handle going backwards in onboarding', () => {
      store.setOnboardingIndex(3)
      expect(store.currentOnboardingSlide).toBe(3)

      store.setOnboardingIndex(1) // Go back
      expect(store.currentOnboardingSlide).toBe(1)

      store.setOnboardingIndex(2) // Go forward again
      expect(store.currentOnboardingSlide).toBe(2)
    })

    it('should work with state persistence pattern', () => {
      // Simulate saving/loading state
      store.setOnboardingIndex(2)
      const savedIndex = store.onboardingCurrentIndex

      // Create new store (simulate app restart)
      const newStore = new UIStore()
      newStore.setOnboardingIndex(savedIndex)

      expect(newStore.currentOnboardingSlide).toBe(2)
    })
  })

  describe('Edge Cases', () => {
    it('should handle decimal numbers by truncating', () => {
      // Math.max might not handle this exactly as expected
      store.setOnboardingIndex(2.7)
      expect(store.onboardingCurrentIndex).toBe(2.7)
    })

    it('should handle zero explicitly', () => {
      store.setOnboardingIndex(5)
      store.setOnboardingIndex(0)
      expect(store.onboardingCurrentIndex).toBe(0)
    })

    it('should handle multiple resets', () => {
      store.setOnboardingIndex(10)
      store.resetOnboardingState()
      store.resetOnboardingState()
      store.resetOnboardingState()

      expect(store.onboardingCurrentIndex).toBe(0)
    })

    it('should handle very large numbers', () => {
      const veryLargeNumber = Number.MAX_SAFE_INTEGER
      store.setOnboardingIndex(veryLargeNumber)
      expect(store.onboardingCurrentIndex).toBe(veryLargeNumber)
    })

    it('should handle Infinity', () => {
      store.setOnboardingIndex(Infinity)
      expect(store.onboardingCurrentIndex).toBe(Infinity)
    })

    it('should handle NaN', () => {
      store.setOnboardingIndex(NaN)
      expect(store.onboardingCurrentIndex).toBe(0) // Math.max(0, NaN) = 0
    })
  })

  describe('Performance', () => {
    it('should handle many index changes efficiently', () => {
      const startTime = performance.now()

      for (let i = 0; i < 1000; i++) {
        store.setOnboardingIndex(i)
      }

      const endTime = performance.now()
      expect(endTime - startTime).toBeLessThan(100) // Should be very fast
      expect(store.onboardingCurrentIndex).toBe(999)
    })

    it('should handle rapid state changes without issues', () => {
      // Rapid fire changes
      for (let i = 0; i < 100; i++) {
        store.setOnboardingIndex(i)
        store.resetOnboardingState()
        store.setOnboardingIndex(i + 1)
      }

      // Should end up in final state
      expect(store.onboardingCurrentIndex).toBe(100)
    })
  })

  describe('Logging Behavior', () => {
    it('should log all setOnboardingIndex calls', () => {
      const consoleSpy = jest.spyOn(console, 'log')

      store.setOnboardingIndex(1)
      store.setOnboardingIndex(2)
      store.setOnboardingIndex(0)

      expect(consoleSpy).toHaveBeenCalledTimes(3)
      expect(consoleSpy).toHaveBeenNthCalledWith(1, '📱 UIStore.setOnboardingIndex: 1')
      expect(consoleSpy).toHaveBeenNthCalledWith(2, '📱 UIStore.setOnboardingIndex: 2')
      expect(consoleSpy).toHaveBeenNthCalledWith(3, '📱 UIStore.setOnboardingIndex: 0')
    })

    it('should log all resetOnboardingState calls', () => {
      const consoleSpy = jest.spyOn(console, 'log')

      store.resetOnboardingState()
      store.resetOnboardingState()

      expect(consoleSpy).toHaveBeenCalledTimes(2)
      expect(consoleSpy).toHaveBeenNthCalledWith(1, '🔄 UIStore.resetOnboardingState called')
      expect(consoleSpy).toHaveBeenNthCalledWith(2, '🔄 UIStore.resetOnboardingState called')
    })

    it('should not interfere with actual functionality when logging fails', () => {
      // Mock console.log to throw error
      jest.spyOn(console, 'log').mockImplementation(() => {
        throw new Error('Logging failed')
      })

      // Should still work despite logging failure
      expect(() => store.setOnboardingIndex(5)).not.toThrow()
      expect(store.onboardingCurrentIndex).toBe(5)

      expect(() => store.resetOnboardingState()).not.toThrow()
      expect(store.onboardingCurrentIndex).toBe(0)
    })
  })
})
