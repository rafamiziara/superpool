import { useCallback, useState } from 'react'

export type AuthStep = 
  | 'connect-wallet'
  | 'acquire-lock' 
  | 'generate-message'
  | 'request-signature'
  | 'verify-signature'
  | 'firebase-auth'

export interface AuthStepInfo {
  step: AuthStep
  title: string
  description: string
}

export interface AuthProgressState {
  currentStep: AuthStep | null
  completedSteps: Set<AuthStep>
  failedStep: AuthStep | null
  isComplete: boolean
  error: string | null
}

const AUTH_STEPS: Record<AuthStep, AuthStepInfo> = {
  'connect-wallet': {
    step: 'connect-wallet',
    title: 'Connect Wallet',
    description: 'Wallet connection established'
  },
  'acquire-lock': {
    step: 'acquire-lock', 
    title: 'Acquire Lock & Validate State',
    description: 'Securing authentication process'
  },
  'generate-message': {
    step: 'generate-message',
    title: 'Generate Auth Message', 
    description: 'Creating authentication challenge'
  },
  'request-signature': {
    step: 'request-signature',
    title: 'Request Signature',
    description: 'Sign message in your wallet app'
  },
  'verify-signature': {
    step: 'verify-signature',
    title: 'Verify Signature',
    description: 'Validating your signature'
  },
  'firebase-auth': {
    step: 'firebase-auth',
    title: 'Firebase Authentication',
    description: 'Completing authentication'
  }
}

export const useAuthProgress = () => {
  const [state, setState] = useState<AuthProgressState>({
    currentStep: null,
    completedSteps: new Set(),
    failedStep: null,
    isComplete: false,
    error: null
  })

  const startStep = useCallback((step: AuthStep) => {
    setState(prev => ({
      ...prev,
      currentStep: step,
      failedStep: null,
      error: null
    }))
  }, [])

  const completeStep = useCallback((step: AuthStep) => {
    setState(prev => {
      const newCompletedSteps = new Set(prev.completedSteps)
      newCompletedSteps.add(step)
      
      return {
        ...prev,
        completedSteps: newCompletedSteps,
        currentStep: step === 'firebase-auth' ? null : prev.currentStep,
        isComplete: step === 'firebase-auth',
        failedStep: null,
        error: null
      }
    })
  }, [])

  const failStep = useCallback((step: AuthStep, error: string) => {
    setState(prev => ({
      ...prev,
      currentStep: null,
      failedStep: step,
      error,
      isComplete: false
    }))
  }, [])

  const resetProgress = useCallback(() => {
    setState({
      currentStep: null,
      completedSteps: new Set(['connect-wallet']), // Wallet is already connected when we start
      failedStep: null,
      isComplete: false,
      error: null
    })
  }, [])

  const getStepStatus = useCallback((step: AuthStep) => {
    if (state.failedStep === step) return 'failed'
    if (state.completedSteps.has(step)) return 'completed'
    if (state.currentStep === step) return 'current'
    return 'pending'
  }, [state.currentStep, state.completedSteps, state.failedStep])

  const getStepInfo = useCallback((step: AuthStep) => AUTH_STEPS[step], [])

  const getAllSteps = useCallback(() => Object.values(AUTH_STEPS), [])

  return {
    ...state,
    startStep,
    completeStep,
    failStep,
    resetProgress,
    getStepStatus,
    getStepInfo,
    getAllSteps
  }
}