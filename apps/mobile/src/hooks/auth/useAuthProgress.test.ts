import { renderHook, act } from '@testing-library/react-hooks'
import { AuthStep } from '@superpool/types'
import { useAuthProgress } from './useAuthProgress'

describe('useAuthProgress', () => {
  it('should initialize with correct default state', () => {
    const { result } = renderHook(() => useAuthProgress())

    expect(result.current.currentStep).toBeNull()
    expect(result.current.completedSteps).toEqual(new Set())
    expect(result.current.failedStep).toBeNull()
    expect(result.current.isComplete).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('should start a step correctly', () => {
    const { result } = renderHook(() => useAuthProgress())

    act(() => {
      result.current.startStep('connect-wallet')
    })

    expect(result.current.currentStep).toBe('connect-wallet')
    expect(result.current.failedStep).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('should complete a step correctly and add to completed steps', () => {
    const { result } = renderHook(() => useAuthProgress())

    act(() => {
      result.current.startStep('connect-wallet')
    })

    act(() => {
      result.current.completeStep('connect-wallet')
    })

    expect(result.current.completedSteps.has('connect-wallet')).toBe(true)
    expect(result.current.currentStep).toBe('connect-wallet') // Should remain current until final step
    expect(result.current.isComplete).toBe(false)
  })

  it('should complete firebase-auth step and mark authentication as complete', () => {
    const { result } = renderHook(() => useAuthProgress())

    act(() => {
      result.current.startStep('firebase-auth')
    })

    act(() => {
      result.current.completeStep('firebase-auth')
    })

    expect(result.current.completedSteps.has('firebase-auth')).toBe(true)
    expect(result.current.currentStep).toBeNull() // Should be null after firebase-auth
    expect(result.current.isComplete).toBe(true)
  })

  it('should handle step failure correctly', () => {
    const { result } = renderHook(() => useAuthProgress())
    const errorMessage = 'User rejected signature'

    act(() => {
      result.current.startStep('request-signature')
    })

    act(() => {
      result.current.failStep('request-signature', errorMessage)
    })

    expect(result.current.currentStep).toBeNull()
    expect(result.current.failedStep).toBe('request-signature')
    expect(result.current.error).toBe(errorMessage)
    expect(result.current.isComplete).toBe(false)
  })

  it('should reset progress correctly with connect-wallet pre-completed', () => {
    const { result } = renderHook(() => useAuthProgress())

    // Set up some initial state
    act(() => {
      result.current.startStep('request-signature')
    })

    act(() => {
      result.current.completeStep('acquire-lock')
    })

    act(() => {
      result.current.failStep('request-signature', 'Some error')
    })

    // Reset progress
    act(() => {
      result.current.resetProgress()
    })

    expect(result.current.currentStep).toBeNull()
    expect(result.current.completedSteps).toEqual(new Set(['connect-wallet']))
    expect(result.current.failedStep).toBeNull()
    expect(result.current.isComplete).toBe(false)
    expect(result.current.error).toBeNull()
  })

  describe('getStepStatus', () => {
    it('should return "failed" for failed step', () => {
      const { result } = renderHook(() => useAuthProgress())

      act(() => {
        result.current.failStep('request-signature', 'Error')
      })

      expect(result.current.getStepStatus('request-signature')).toBe('failed')
    })

    it('should return "completed" for completed step', () => {
      const { result } = renderHook(() => useAuthProgress())

      act(() => {
        result.current.completeStep('connect-wallet')
      })

      expect(result.current.getStepStatus('connect-wallet')).toBe('completed')
    })

    it('should return "current" for current step', () => {
      const { result } = renderHook(() => useAuthProgress())

      act(() => {
        result.current.startStep('acquire-lock')
      })

      expect(result.current.getStepStatus('acquire-lock')).toBe('current')
    })

    it('should return "pending" for untouched step', () => {
      const { result } = renderHook(() => useAuthProgress())

      expect(result.current.getStepStatus('generate-message')).toBe('pending')
    })
  })

  it('should get step info correctly for all auth steps', () => {
    const { result } = renderHook(() => useAuthProgress())

    const connectWalletInfo = result.current.getStepInfo('connect-wallet')
    expect(connectWalletInfo).toEqual({
      step: 'connect-wallet',
      title: 'Connect Wallet',
      description: 'Wallet connection established',
    })

    const acquireLockInfo = result.current.getStepInfo('acquire-lock')
    expect(acquireLockInfo).toEqual({
      step: 'acquire-lock',
      title: 'Acquire Lock & Validate State',
      description: 'Securing authentication process',
    })

    const firebaseAuthInfo = result.current.getStepInfo('firebase-auth')
    expect(firebaseAuthInfo).toEqual({
      step: 'firebase-auth',
      title: 'Firebase Authentication',
      description: 'Completing authentication',
    })
  })

  it('should get all steps correctly', () => {
    const { result } = renderHook(() => useAuthProgress())

    const allSteps = result.current.getAllSteps()
    expect(allSteps).toHaveLength(6)
    
    const stepTitles = allSteps.map(step => step.title)
    expect(stepTitles).toContain('Connect Wallet')
    expect(stepTitles).toContain('Acquire Lock & Validate State')
    expect(stepTitles).toContain('Generate Auth Message')
    expect(stepTitles).toContain('Request Signature')
    expect(stepTitles).toContain('Verify Signature')
    expect(stepTitles).toContain('Firebase Authentication')
  })

  it('should handle complete authentication flow correctly', () => {
    const { result } = renderHook(() => useAuthProgress())

    const authSteps: AuthStep[] = [
      'connect-wallet',
      'acquire-lock',
      'generate-message',
      'request-signature',
      'verify-signature',
      'firebase-auth',
    ]

    // Simulate complete authentication flow
    authSteps.forEach((step) => {
      act(() => {
        result.current.startStep(step)
      })

      expect(result.current.currentStep).toBe(step)
      expect(result.current.getStepStatus(step)).toBe('current')

      act(() => {
        result.current.completeStep(step)
      })

      expect(result.current.completedSteps.has(step)).toBe(true)
      expect(result.current.getStepStatus(step)).toBe('completed')

      // Only the final step should set isComplete to true and currentStep to null
      if (step === 'firebase-auth') {
        expect(result.current.isComplete).toBe(true)
        expect(result.current.currentStep).toBeNull()
      } else {
        expect(result.current.isComplete).toBe(false)
        expect(result.current.currentStep).toBe(step)
      }
    })

    expect(result.current.completedSteps.size).toBe(6)
  })

  it('should clear previous errors when starting a new step', () => {
    const { result } = renderHook(() => useAuthProgress())

    // Set up a failed state
    act(() => {
      result.current.failStep('request-signature', 'Previous error')
    })

    expect(result.current.failedStep).toBe('request-signature')
    expect(result.current.error).toBe('Previous error')

    // Start a new step - should clear error state
    act(() => {
      result.current.startStep('verify-signature')
    })

    expect(result.current.currentStep).toBe('verify-signature')
    expect(result.current.failedStep).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('should maintain completed steps across state transitions', () => {
    const { result } = renderHook(() => useAuthProgress())

    // Complete first two steps
    act(() => {
      result.current.completeStep('connect-wallet')
    })

    act(() => {
      result.current.completeStep('acquire-lock')
    })

    expect(result.current.completedSteps.has('connect-wallet')).toBe(true)
    expect(result.current.completedSteps.has('acquire-lock')).toBe(true)

    // Start and fail next step
    act(() => {
      result.current.startStep('generate-message')
    })

    act(() => {
      result.current.failStep('generate-message', 'Network error')
    })

    // Completed steps should remain intact
    expect(result.current.completedSteps.has('connect-wallet')).toBe(true)
    expect(result.current.completedSteps.has('acquire-lock')).toBe(true)
    expect(result.current.completedSteps.has('generate-message')).toBe(false)
  })
})