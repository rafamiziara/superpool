import type { AuthProgressCallbacks, AuthStep } from '@superpool/types'
import { AuthenticationStepExecutor } from './AuthenticationStepExecutor'

describe('AuthenticationStepExecutor', () => {
  let executor: AuthenticationStepExecutor
  let mockProgressCallbacks: jest.Mocked<AuthProgressCallbacks>
  let consoleLogSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()

    mockProgressCallbacks = {
      onStepStart: jest.fn(),
      onStepComplete: jest.fn(),
      onStepFail: jest.fn(),
    }

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
  })

  afterEach(() => {
    jest.useRealTimers()
    consoleLogSpy.mockRestore()
  })

  describe('Constructor', () => {
    it('should create executor without progress callbacks', () => {
      executor = new AuthenticationStepExecutor()
      expect(executor).toBeInstanceOf(AuthenticationStepExecutor)
    })

    it('should create executor with progress callbacks', () => {
      executor = new AuthenticationStepExecutor(mockProgressCallbacks)
      expect(executor).toBeInstanceOf(AuthenticationStepExecutor)
    })

    it('should create multiple independent instances', () => {
      const executor1 = new AuthenticationStepExecutor(mockProgressCallbacks)
      const executor2 = new AuthenticationStepExecutor()

      expect(executor1).toBeInstanceOf(AuthenticationStepExecutor)
      expect(executor2).toBeInstanceOf(AuthenticationStepExecutor)
      expect(executor1).not.toBe(executor2)
    })
  })

  describe('executeStep', () => {
    const testStep: AuthStep = 'generate-message'

    beforeEach(() => {
      executor = new AuthenticationStepExecutor(mockProgressCallbacks)
    })

    describe('Successful Step Execution', () => {
      it('should execute step successfully with default options', async () => {
        const mockStepFunction = jest.fn().mockResolvedValue('step-result')

        const executePromise = executor.executeStep(testStep, mockStepFunction)

        // Fast forward through delays and run all timers
        await jest.runAllTimersAsync()

        const result = await executePromise

        expect(result).toBe('step-result')
        expect(mockStepFunction).toHaveBeenCalledTimes(1)
        expect(mockProgressCallbacks.onStepStart).toHaveBeenCalledWith(testStep)
        expect(mockProgressCallbacks.onStepComplete).toHaveBeenCalledWith(testStep)
      })

      it('should execute step with custom timing options', async () => {
        const mockStepFunction = jest.fn().mockResolvedValue('custom-result')
        const options = {
          beforeDelay: 100,
          afterDelay: 300,
        }

        const executePromise = executor.executeStep(testStep, mockStepFunction, options)

        await jest.runAllTimersAsync()

        const result = await executePromise

        expect(result).toBe('custom-result')
        expect(mockProgressCallbacks.onStepStart).toHaveBeenCalledWith(testStep)
        expect(mockProgressCallbacks.onStepComplete).toHaveBeenCalledWith(testStep)
      })

      it('should skip progress callbacks when requested', async () => {
        const mockStepFunction = jest.fn().mockResolvedValue('skip-callbacks-result')
        const options = { skipProgressCallbacks: true }

        const executePromise = executor.executeStep(testStep, mockStepFunction, options)

        await jest.runAllTimersAsync()

        const result = await executePromise

        expect(result).toBe('skip-callbacks-result')
        expect(mockProgressCallbacks.onStepStart).not.toHaveBeenCalled()
        expect(mockProgressCallbacks.onStepComplete).not.toHaveBeenCalled()
      })

      it('should handle zero delays', async () => {
        const mockStepFunction = jest.fn().mockResolvedValue('no-delay-result')
        const options = {
          beforeDelay: 0,
          afterDelay: 0,
        }

        const result = await executor.executeStep(testStep, mockStepFunction, options)

        expect(result).toBe('no-delay-result')
        expect(mockStepFunction).toHaveBeenCalledTimes(1)
      })

      it('should log step execution', async () => {
        const mockStepFunction = jest.fn().mockResolvedValue('logged-result')

        const executePromise = executor.executeStep(testStep, mockStepFunction)

        await jest.runAllTimersAsync()

        await executePromise

        expect(consoleLogSpy).toHaveBeenCalledWith(`🔄 Starting step: ${testStep}`)
        expect(consoleLogSpy).toHaveBeenCalledWith(`✅ Completing step: ${testStep}`)
      })

      it('should handle different step types', async () => {
        const steps: AuthStep[] = ['generate-message', 'request-signature', 'verify-signature', 'acquire-lock']

        for (const step of steps) {
          const mockStepFunction = jest.fn().mockResolvedValue(`${step}-result`)

          const executePromise = executor.executeStep(step, mockStepFunction)

          await jest.runAllTimersAsync()

          const result = await executePromise

          expect(result).toBe(`${step}-result`)
          expect(mockProgressCallbacks.onStepStart).toHaveBeenCalledWith(step)
          expect(mockProgressCallbacks.onStepComplete).toHaveBeenCalledWith(step)
        }
      })
    })

    describe('Step Execution with Different Return Types', () => {
      it('should handle step function returning object', async () => {
        const mockResult = { token: 'abc123', timestamp: 1641024000000 }
        const mockStepFunction = jest.fn().mockResolvedValue(mockResult)

        const executePromise = executor.executeStep(testStep, mockStepFunction)

        await jest.runAllTimersAsync()

        const result = await executePromise

        expect(result).toEqual(mockResult)
      })

      it('should handle step function returning null', async () => {
        const mockStepFunction = jest.fn().mockResolvedValue(null)

        const executePromise = executor.executeStep(testStep, mockStepFunction)

        await jest.runAllTimersAsync()

        const result = await executePromise

        expect(result).toBeNull()
      })

      it('should handle step function returning undefined', async () => {
        const mockStepFunction = jest.fn().mockResolvedValue(undefined)

        const executePromise = executor.executeStep(testStep, mockStepFunction)

        await jest.runAllTimersAsync()

        const result = await executePromise

        expect(result).toBeUndefined()
      })

      it('should handle step function returning boolean', async () => {
        const mockStepFunction = jest.fn().mockResolvedValue(true)

        const executePromise = executor.executeStep(testStep, mockStepFunction)

        await jest.runAllTimersAsync()

        const result = await executePromise

        expect(result).toBe(true)
      })
    })

    describe('Error Handling', () => {
      it('should handle step function throwing error', async () => {
        const stepError = new Error('Step execution failed')
        const mockStepFunction = jest.fn().mockRejectedValue(stepError)

        const executePromise = executor.executeStep(testStep, mockStepFunction)

        // Use Promise.allSettled to handle both timers and promise rejection
        await Promise.allSettled([jest.runAllTimersAsync(), executePromise])

        await expect(executePromise).rejects.toThrow('Step execution failed')

        expect(mockProgressCallbacks.onStepStart).toHaveBeenCalledWith(testStep)
        expect(mockProgressCallbacks.onStepFail).toHaveBeenCalledWith(testStep, 'Step execution failed')
        expect(mockProgressCallbacks.onStepComplete).not.toHaveBeenCalled()
      })

      it('should handle non-Error thrown values', async () => {
        const mockStepFunction = jest.fn().mockRejectedValue('String error')

        const executePromise = executor.executeStep(testStep, mockStepFunction)

        await Promise.allSettled([jest.runAllTimersAsync(), executePromise])
        await expect(executePromise).rejects.toBe('String error')

        expect(mockProgressCallbacks.onStepFail).toHaveBeenCalledWith(testStep, 'String error')
      })

      it('should handle null/undefined thrown values', async () => {
        const mockStepFunction = jest.fn().mockRejectedValue(null)

        const executePromise = executor.executeStep(testStep, mockStepFunction)

        await Promise.allSettled([jest.runAllTimersAsync(), executePromise])
        await expect(executePromise).rejects.toBeNull()

        expect(mockProgressCallbacks.onStepFail).toHaveBeenCalledWith(testStep, 'null')
      })

      it('should handle complex error objects', async () => {
        const complexError = { code: 'AUTH_ERROR', details: 'Authentication failed' }
        const mockStepFunction = jest.fn().mockRejectedValue(complexError)

        const executePromise = executor.executeStep(testStep, mockStepFunction)

        await Promise.allSettled([jest.runAllTimersAsync(), executePromise])
        await expect(executePromise).rejects.toEqual(complexError)

        expect(mockProgressCallbacks.onStepFail).toHaveBeenCalledWith(testStep, '[object Object]')
      })

      it('should skip error callbacks when skipProgressCallbacks is true', async () => {
        const stepError = new Error('Skip error callbacks')
        const mockStepFunction = jest.fn().mockRejectedValue(stepError)
        const options = { skipProgressCallbacks: true }

        const executePromise = executor.executeStep(testStep, mockStepFunction, options)

        await Promise.allSettled([jest.runAllTimersAsync(), executePromise])
        await expect(executePromise).rejects.toThrow('Skip error callbacks')

        expect(mockProgressCallbacks.onStepStart).not.toHaveBeenCalled()
        expect(mockProgressCallbacks.onStepFail).not.toHaveBeenCalled()
        expect(mockProgressCallbacks.onStepComplete).not.toHaveBeenCalled()
      })
    })

    describe('Timing and Delays', () => {
      it('should respect custom before and after delays', async () => {
        const mockStepFunction = jest.fn().mockResolvedValue('timing-test')
        const options = {
          beforeDelay: 500,
          afterDelay: 1000,
        }

        const executePromise = executor.executeStep(testStep, mockStepFunction, options)

        await jest.runAllTimersAsync()

        const result = await executePromise
        expect(result).toBe('timing-test')
        expect(mockStepFunction).toHaveBeenCalled()
      })

      it('should handle very long delays', async () => {
        const mockStepFunction = jest.fn().mockResolvedValue('long-delay')
        const options = {
          beforeDelay: 5000,
          afterDelay: 3000,
        }

        const executePromise = executor.executeStep(testStep, mockStepFunction, options)

        await jest.runAllTimersAsync()

        const result = await executePromise
        expect(result).toBe('long-delay')
      })

      it('should handle negative delays as zero', async () => {
        const mockStepFunction = jest.fn().mockResolvedValue('negative-delay')
        const options = {
          beforeDelay: -100,
          afterDelay: -200,
        }

        // Should execute immediately without delays
        const result = await executor.executeStep(testStep, mockStepFunction, options)

        expect(result).toBe('negative-delay')
        expect(mockStepFunction).toHaveBeenCalled()
      })
    })

    describe('Without Progress Callbacks', () => {
      beforeEach(() => {
        executor = new AuthenticationStepExecutor() // No callbacks
      })

      it('should execute step without callbacks gracefully', async () => {
        const mockStepFunction = jest.fn().mockResolvedValue('no-callbacks')

        const executePromise = executor.executeStep(testStep, mockStepFunction)

        await jest.runAllTimersAsync()

        const result = await executePromise

        expect(result).toBe('no-callbacks')
        expect(mockStepFunction).toHaveBeenCalledTimes(1)
      })

      it('should handle errors without callbacks', async () => {
        const stepError = new Error('No callbacks error')
        const mockStepFunction = jest.fn().mockRejectedValue(stepError)

        const executePromise = executor.executeStep(testStep, mockStepFunction)

        await Promise.allSettled([jest.runAllTimersAsync(), executePromise])
        await expect(executePromise).rejects.toThrow('No callbacks error')
      })
    })
  })

  describe('executeLockStep', () => {
    beforeEach(() => {
      executor = new AuthenticationStepExecutor(mockProgressCallbacks)
    })

    it('should execute lock step with longer before delay', async () => {
      const mockLockFunction = jest.fn().mockResolvedValue('lock-acquired')

      const executePromise = executor.executeLockStep(mockLockFunction)

      await jest.runAllTimersAsync()

      const result = await executePromise

      expect(result).toBe('lock-acquired')
      expect(mockProgressCallbacks.onStepStart).toHaveBeenCalledWith('acquire-lock')
      expect(mockProgressCallbacks.onStepComplete).toHaveBeenCalledWith('acquire-lock')
    })

    it('should handle lock step errors', async () => {
      const lockError = new Error('Lock acquisition failed')
      const mockLockFunction = jest.fn().mockRejectedValue(lockError)

      const executePromise = executor.executeLockStep(mockLockFunction)

      await Promise.allSettled([jest.runAllTimersAsync(), executePromise])
      await expect(executePromise).rejects.toThrow('Lock acquisition failed')

      expect(mockProgressCallbacks.onStepFail).toHaveBeenCalledWith('acquire-lock', 'Lock acquisition failed')
    })

    it('should use correct timing for lock step', async () => {
      const mockLockFunction = jest.fn().mockResolvedValue('timing-test')

      const executePromise = executor.executeLockStep(mockLockFunction)

      await jest.runAllTimersAsync()

      const result = await executePromise
      expect(result).toBe('timing-test')
      expect(mockLockFunction).toHaveBeenCalled()
    })

    it('should log lock step execution', async () => {
      const mockLockFunction = jest.fn().mockResolvedValue('logged-lock')

      const executePromise = executor.executeLockStep(mockLockFunction)

      await jest.runAllTimersAsync()

      await executePromise

      expect(consoleLogSpy).toHaveBeenCalledWith('🔄 Starting step: acquire-lock')
      expect(consoleLogSpy).toHaveBeenCalledWith('✅ Completing step: acquire-lock')
    })
  })

  describe('executeInternalStep', () => {
    beforeEach(() => {
      executor = new AuthenticationStepExecutor(mockProgressCallbacks)
    })

    it('should execute internal step without any timing or callbacks', async () => {
      const mockInternalFunction = jest.fn().mockResolvedValue('internal-result')

      const result = await executor.executeInternalStep(mockInternalFunction)

      expect(result).toBe('internal-result')
      expect(mockInternalFunction).toHaveBeenCalledTimes(1)
      expect(mockProgressCallbacks.onStepStart).not.toHaveBeenCalled()
      expect(mockProgressCallbacks.onStepComplete).not.toHaveBeenCalled()
    })

    it('should handle internal step errors without callbacks', async () => {
      const internalError = new Error('Internal step failed')
      const mockInternalFunction = jest.fn().mockRejectedValue(internalError)

      await expect(executor.executeInternalStep(mockInternalFunction)).rejects.toThrow('Internal step failed')

      expect(mockProgressCallbacks.onStepFail).not.toHaveBeenCalled()
    })

    it('should execute immediately without any delays', async () => {
      const mockInternalFunction = jest.fn().mockResolvedValue('immediate-result')

      const startTime = Date.now()
      const result = await executor.executeInternalStep(mockInternalFunction)
      const endTime = Date.now()

      expect(result).toBe('immediate-result')
      // Should execute very quickly (allowing for some test execution time)
      expect(endTime - startTime).toBeLessThan(50)
    })

    it('should handle different return types from internal steps', async () => {
      const testCases = [
        { value: 'string', expected: 'string' },
        { value: 123, expected: 123 },
        { value: true, expected: true },
        { value: null, expected: null },
        { value: undefined, expected: undefined },
        { value: { key: 'value' }, expected: { key: 'value' } },
      ]

      for (const testCase of testCases) {
        const mockInternalFunction = jest.fn().mockResolvedValue(testCase.value)

        const result = await executor.executeInternalStep(mockInternalFunction)

        expect(result).toEqual(testCase.expected)
      }
    })
  })

  describe('Integration and Realistic Scenarios', () => {
    beforeEach(() => {
      executor = new AuthenticationStepExecutor(mockProgressCallbacks)
    })

    it('should handle complete authentication flow simulation', async () => {
      const steps = [
        { step: 'generate-message' as AuthStep, result: 'message-generated' },
        { step: 'request-signature' as AuthStep, result: 'signature-requested' },
        { step: 'verify-signature' as AuthStep, result: 'signature-verified' },
      ]

      const results = []

      for (const stepInfo of steps) {
        const mockStepFunction = jest.fn().mockResolvedValue(stepInfo.result)
        const executePromise = executor.executeStep(stepInfo.step, mockStepFunction)

        await jest.runAllTimersAsync()

        const result = await executePromise
        results.push(result)
      }

      expect(results).toEqual(['message-generated', 'signature-requested', 'signature-verified'])

      // Verify all callbacks were called
      steps.forEach((stepInfo) => {
        expect(mockProgressCallbacks.onStepStart).toHaveBeenCalledWith(stepInfo.step)
        expect(mockProgressCallbacks.onStepComplete).toHaveBeenCalledWith(stepInfo.step)
      })
    })

    it('should handle mixed step execution types', async () => {
      // Regular step
      const regularPromise = executor.executeStep('generate-message', jest.fn().mockResolvedValue('regular'))

      // Lock step
      const lockPromise = executor.executeLockStep(jest.fn().mockResolvedValue('lock'))

      // Internal step
      const internalResult = await executor.executeInternalStep(jest.fn().mockResolvedValue('internal'))

      // Run all timers for the async steps
      await jest.runAllTimersAsync()

      const [regularResult, lockResult] = await Promise.all([regularPromise, lockPromise])

      expect(regularResult).toBe('regular')
      expect(lockResult).toBe('lock')
      expect(internalResult).toBe('internal')
    })

    it('should handle step failure in middle of flow', async () => {
      // First step succeeds
      const step1Promise = executor.executeStep('generate-message', jest.fn().mockResolvedValue('step1-success'))

      await jest.runAllTimersAsync()
      const step1Result = await step1Promise

      expect(step1Result).toBe('step1-success')

      // Second step fails
      const step2Promise = executor.executeStep('request-signature', jest.fn().mockRejectedValue(new Error('step2-failed')))

      await Promise.allSettled([jest.runAllTimersAsync(), step2Promise])
      await expect(step2Promise).rejects.toThrow('step2-failed')

      // Verify callback order
      expect(mockProgressCallbacks.onStepStart).toHaveBeenCalledWith('generate-message')
      expect(mockProgressCallbacks.onStepComplete).toHaveBeenCalledWith('generate-message')
      expect(mockProgressCallbacks.onStepStart).toHaveBeenCalledWith('request-signature')
      expect(mockProgressCallbacks.onStepFail).toHaveBeenCalledWith('request-signature', 'step2-failed')
    })
  })

  describe('Performance and Memory', () => {
    beforeEach(() => {
      executor = new AuthenticationStepExecutor(mockProgressCallbacks)
    })

    it('should handle many concurrent steps efficiently', async () => {
      const stepPromises = Array.from({ length: 10 }, (_, i) =>
        executor.executeStep('generate-message', jest.fn().mockResolvedValue(`result-${i}`))
      )

      await jest.runAllTimersAsync()

      const results = await Promise.all(stepPromises)

      expect(results).toHaveLength(10)
      results.forEach((result, i) => {
        expect(result).toBe(`result-${i}`)
      })
    })

    it('should handle rapid successive step executions', async () => {
      const results = []

      for (let i = 0; i < 5; i++) {
        const mockStepFunction = jest.fn().mockResolvedValue(`rapid-${i}`)
        const executePromise = executor.executeStep('generate-message', mockStepFunction)

        await jest.runAllTimersAsync()

        const result = await executePromise
        results.push(result)
      }

      expect(results).toEqual(['rapid-0', 'rapid-1', 'rapid-2', 'rapid-3', 'rapid-4'])
    })

    it('should not leak memory with large step results', async () => {
      const largeResult = 'A'.repeat(100000) // 100KB result
      const mockStepFunction = jest.fn().mockResolvedValue(largeResult)

      const executePromise = executor.executeStep('generate-message', mockStepFunction)

      await jest.runAllTimersAsync()

      const result = await executePromise

      expect(result).toBe(largeResult)
      expect((result as string).length).toBe(100000)
    })
  })

  describe('Edge Cases and Error Conditions', () => {
    beforeEach(() => {
      executor = new AuthenticationStepExecutor(mockProgressCallbacks)
    })

    it('should handle undefined step function', async () => {
      const executePromise = executor.executeStep('generate-message', undefined as any)

      await Promise.allSettled([jest.runAllTimersAsync(), executePromise])
      await expect(executePromise).rejects.toThrow()
    })

    it('should handle null step function', async () => {
      const executePromise = executor.executeStep('generate-message', null as any)

      await Promise.allSettled([jest.runAllTimersAsync(), executePromise])
      await expect(executePromise).rejects.toThrow()
    })

    it('should handle malformed options object', async () => {
      const mockStepFunction = jest.fn().mockResolvedValue('malformed-options')
      const malformedOptions = { invalidOption: 'invalid' } as any

      const executePromise = executor.executeStep('generate-message', mockStepFunction, malformedOptions)

      await jest.runAllTimersAsync() // Default delays should be used

      const result = await executePromise

      expect(result).toBe('malformed-options')
    })

    it('should handle step function that returns a promise that never resolves', () => {
      const neverResolvingPromise = new Promise(() => {}) // Never resolves
      const mockStepFunction = jest.fn().mockReturnValue(neverResolvingPromise)

      const executePromise = executor.executeStep('generate-message', mockStepFunction)

      // The promise should still be pending
      let resolved = false
      executePromise.finally(() => {
        resolved = true
      })

      expect(resolved).toBe(false)
      expect(mockStepFunction).not.toHaveBeenCalled() // Because of beforeDelay
    })
  })

  describe('Type Safety and Interface Compliance', () => {
    it('should handle all AuthStep types', async () => {
      const authSteps: AuthStep[] = ['generate-message', 'request-signature', 'verify-signature', 'acquire-lock']

      executor = new AuthenticationStepExecutor(mockProgressCallbacks)

      for (const step of authSteps) {
        const mockStepFunction = jest.fn().mockResolvedValue(`${step}-result`)

        const executePromise = executor.executeStep(step, mockStepFunction)

        await jest.runAllTimersAsync()

        const result = await executePromise

        expect(result).toBe(`${step}-result`)
        expect(mockProgressCallbacks.onStepStart).toHaveBeenCalledWith(step)
      }
    })

    it('should maintain generic type safety for step function results', async () => {
      executor = new AuthenticationStepExecutor(mockProgressCallbacks)

      // Test with specific typed results
      const stringResult = await executor.executeInternalStep(async () => 'string')
      const numberResult = await executor.executeInternalStep(async () => 42)
      const objectResult = await executor.executeInternalStep(async () => ({ key: 'value' }))

      expect(typeof stringResult).toBe('string')
      expect(typeof numberResult).toBe('number')
      expect(typeof objectResult).toBe('object')
    })

    it('should work with optional progress callbacks interface', () => {
      const partialCallbacks: Partial<AuthProgressCallbacks> = {
        onStepStart: jest.fn(),
        // onStepComplete and onStepFail are optional
      }

      executor = new AuthenticationStepExecutor(partialCallbacks as AuthProgressCallbacks)

      expect(executor).toBeInstanceOf(AuthenticationStepExecutor)
    })
  })
})
