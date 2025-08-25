import { renderHook } from '@testing-library/react-hooks'
import { AppError, createAppError, ErrorType } from '../utils/errorHandling'
import { AuthStep } from './useAuthProgress'

// Mock external wagmi dependencies
jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  useDisconnect: jest.fn(),
  useSignMessage: jest.fn(),
  useSignTypedData: jest.fn(),
}))

// Mock internal hook dependencies
jest.mock('./useAuthenticationState')
jest.mock('./useAuthProgress')
jest.mock('./useFirebaseAuth')
jest.mock('./useWalletConnectionTrigger')
jest.mock('./useLogoutState')

// Mock service dependencies
jest.mock('../services/authenticationOrchestrator')

// Import the real hook (not mocked)
import { useAuthentication } from './useAuthentication'

// Import mocked dependencies for typing
import { useAccount, useDisconnect, useSignMessage, useSignTypedData } from 'wagmi'
import { useAuthenticationState } from './useAuthenticationState'
import { useAuthProgress } from './useAuthProgress'
import { useFirebaseAuth } from './useFirebaseAuth'
import { useWalletConnectionTrigger } from './useWalletConnectionTrigger'
import { getGlobalLogoutState } from './useLogoutState'
import { AuthenticationOrchestrator } from '../services/authenticationOrchestrator'

// TypeScript interfaces for mocked dependencies (complete mock objects to satisfy wagmi types)
interface MockUseAccountReturn {
  address: string | undefined
  addresses: readonly string[] | undefined
  chain: { id: number } | undefined
  chainId: number | undefined
  connector: any
  isConnected: boolean
  isReconnecting: boolean
  isConnecting: boolean
  isDisconnected: boolean
  status: 'connected' | 'connecting' | 'reconnecting' | 'disconnected'
}

interface MockUseDisconnectReturn {
  disconnect: jest.MockedFunction<() => void>
  error: Error | null
  data: void | undefined
  variables: any | undefined
  isError: boolean
  isIdle: boolean
  isPending: boolean
  isSuccess: boolean
  status: string
  reset: jest.MockedFunction<() => void>
  context: unknown
  failureCount: number
  disconnectAsync: jest.MockedFunction<() => Promise<void>>
}

interface MockUseSignMessageReturn {
  signMessageAsync: jest.MockedFunction<() => Promise<string>>
  error: Error | null
  data: string | undefined
  variables: any | undefined
  isError: boolean
  isIdle: boolean
  isPending: boolean
  isSuccess: boolean
  status: string
  reset: jest.MockedFunction<() => void>
  context: unknown
  failureCount: number
}

interface MockUseSignTypedDataReturn {
  signTypedDataAsync: jest.MockedFunction<() => Promise<string>>
  error: Error | null
  data: string | undefined
  variables: any | undefined
  isError: boolean
  isIdle: boolean
  isPending: boolean
  isSuccess: boolean
  status: string
  reset: jest.MockedFunction<() => void>
  context: unknown
  failureCount: number
}

interface MockUseAuthenticationStateReturn {
  authError: AppError | null
  isAuthenticating: boolean
  authWalletAddress: string | null
  setAuthError: jest.MockedFunction<(error: AppError | null) => void>
  getAuthLock: jest.MockedFunction<() => { current: any }>
  releaseAuthLock: jest.MockedFunction<() => void>
}

interface MockUseAuthProgressReturn {
  currentStep: AuthStep | null
  completedSteps: Set<AuthStep>
  failedStep: AuthStep | null
  isComplete: boolean
  error: string | null
  startStep: jest.MockedFunction<(step: AuthStep) => void>
  completeStep: jest.MockedFunction<(step: AuthStep) => void>
  failStep: jest.MockedFunction<(step: AuthStep, error?: string) => void>
  resetProgress: jest.MockedFunction<() => void>
  getStepStatus: jest.MockedFunction<(step: AuthStep) => 'pending' | 'current' | 'completed' | 'failed'>
  getStepInfo: jest.MockedFunction<(step: AuthStep) => any>
  getAllSteps: jest.MockedFunction<() => any[]>
}

interface MockUseFirebaseAuthReturn {
  user: { uid: string } | null
  isAuthenticated: boolean
  isLoading: boolean
  walletAddress: string | null
}

interface MockAuthenticationOrchestrator {
  authenticate: jest.MockedFunction<(context: any) => Promise<void>>
  cleanup: jest.MockedFunction<() => void>
}

describe('useAuthentication', () => {
  // Cast mocked functions for TypeScript
  const mockUseAccount = useAccount as jest.MockedFunction<typeof useAccount>
  const mockUseDisconnect = useDisconnect as jest.MockedFunction<typeof useDisconnect>
  const mockUseSignMessage = useSignMessage as jest.MockedFunction<typeof useSignMessage>
  const mockUseSignTypedData = useSignTypedData as jest.MockedFunction<typeof useSignTypedData>
  const mockUseAuthenticationState = useAuthenticationState as jest.MockedFunction<typeof useAuthenticationState>
  const mockUseAuthProgress = useAuthProgress as jest.MockedFunction<typeof useAuthProgress>
  const mockUseFirebaseAuth = useFirebaseAuth as jest.MockedFunction<typeof useFirebaseAuth>
  const mockUseWalletConnectionTrigger = useWalletConnectionTrigger as jest.MockedFunction<typeof useWalletConnectionTrigger>
  const mockGetGlobalLogoutState = getGlobalLogoutState as jest.MockedFunction<typeof getGlobalLogoutState>
  const MockAuthenticationOrchestrator = AuthenticationOrchestrator as jest.MockedClass<typeof AuthenticationOrchestrator>

  // Helper functions to create mock return values
  const createMockAccountReturn = (overrides: Partial<MockUseAccountReturn> = {}): MockUseAccountReturn => ({
    address: undefined,
    addresses: undefined,
    chain: undefined,
    chainId: undefined,
    connector: undefined,
    isConnected: false,
    isReconnecting: false,
    isConnecting: false,
    isDisconnected: true,
    status: 'disconnected' as const,
    ...overrides,
  })

  const createMockDisconnectReturn = (overrides: Partial<MockUseDisconnectReturn> = {}): MockUseDisconnectReturn => ({
    disconnect: jest.fn(),
    error: null,
    data: undefined,
    variables: undefined,
    isError: false,
    isIdle: true,
    isPending: false,
    isSuccess: false,
    status: 'idle',
    reset: jest.fn(),
    context: undefined,
    failureCount: 0,
    disconnectAsync: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  })

  const createMockSignMessageReturn = (overrides: Partial<MockUseSignMessageReturn> = {}): MockUseSignMessageReturn => ({
    signMessageAsync: jest.fn().mockResolvedValue('0x123'),
    error: null,
    data: undefined,
    variables: undefined,
    isError: false,
    isIdle: true,
    isPending: false,
    isSuccess: false,
    status: 'idle',
    reset: jest.fn(),
    context: undefined,
    failureCount: 0,
    ...overrides,
  })

  const createMockSignTypedDataReturn = (overrides: Partial<MockUseSignTypedDataReturn> = {}): MockUseSignTypedDataReturn => ({
    signTypedDataAsync: jest.fn().mockResolvedValue('0x123'),
    error: null,
    data: undefined,
    variables: undefined,
    isError: false,
    isIdle: true,
    isPending: false,
    isSuccess: false,
    status: 'idle',
    reset: jest.fn(),
    context: undefined,
    failureCount: 0,
    ...overrides,
  })

  const createMockAuthStateReturn = (overrides: Partial<MockUseAuthenticationStateReturn> = {}): MockUseAuthenticationStateReturn => ({
    authError: null,
    isAuthenticating: false,
    authWalletAddress: null,
    setAuthError: jest.fn(),
    getAuthLock: jest.fn().mockReturnValue({ current: { isLocked: false, walletAddress: null } }),
    releaseAuthLock: jest.fn(),
    ...overrides,
  })

  const createMockAuthProgressReturn = (overrides: Partial<MockUseAuthProgressReturn> = {}): MockUseAuthProgressReturn => ({
    currentStep: null,
    completedSteps: new Set(),
    failedStep: null,
    isComplete: false,
    error: null,
    startStep: jest.fn(),
    completeStep: jest.fn(),
    failStep: jest.fn(),
    resetProgress: jest.fn(),
    getStepStatus: jest.fn().mockReturnValue('pending'),
    getStepInfo: jest.fn().mockReturnValue({}),
    getAllSteps: jest.fn().mockReturnValue([]),
    ...overrides,
  })

  const createMockFirebaseAuthReturn = (overrides: Partial<MockUseFirebaseAuthReturn> = {}): MockUseFirebaseAuthReturn => ({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    walletAddress: null,
    ...overrides,
  })

  beforeEach(() => {
    jest.clearAllMocks()

    // Set up default mock returns with strategic type assertions
    mockUseAccount.mockReturnValue(createMockAccountReturn() as any)
    mockUseDisconnect.mockReturnValue(createMockDisconnectReturn() as any)
    mockUseSignMessage.mockReturnValue(createMockSignMessageReturn() as any)
    mockUseSignTypedData.mockReturnValue(createMockSignTypedDataReturn() as any)
    mockUseAuthenticationState.mockReturnValue(createMockAuthStateReturn())
    mockUseAuthProgress.mockReturnValue(createMockAuthProgressReturn() as any)
    mockUseFirebaseAuth.mockReturnValue(createMockFirebaseAuthReturn() as any)
    mockUseWalletConnectionTrigger.mockImplementation(() => {})
    mockGetGlobalLogoutState.mockReturnValue({ isLoggingOut: false } as any)

    // Mock AuthenticationOrchestrator constructor
    MockAuthenticationOrchestrator.mockImplementation(() => ({
      authenticate: jest.fn().mockResolvedValue(undefined),
      cleanup: jest.fn(),
    }) as any)
  })

  it('should initialize with default authentication state', () => {
    const { result } = renderHook(() => useAuthentication())

    // Hook should complete without errors
    expect(result.error).toBeUndefined()

    // Should return expected shape with default values
    expect(result.current).toEqual({
      authError: null,
      isAuthenticating: false,
      authWalletAddress: null,
      isFirebaseAuthenticated: false,
      isFirebaseLoading: false,
      currentStep: null,
      completedSteps: new Set(),
      failedStep: null,
      isComplete: false,
      error: null,
      startStep: expect.any(Function),
      completeStep: expect.any(Function),
      failStep: expect.any(Function),
      resetProgress: expect.any(Function),
    })
  })

  it('should combine authentication state from multiple sources', () => {
    const mockAuthError = createAppError(ErrorType.WALLET_CONNECTION, 'Test error', new Error())
    const walletAddress = '0x1234567890123456789012345678901234567890'

    // Set up mocks to return specific states
    mockUseAuthenticationState.mockReturnValue(createMockAuthStateReturn({
      authError: mockAuthError,
      isAuthenticating: false,
      authWalletAddress: null,
    }) as any)
    
    mockUseAuthProgress.mockReturnValue(createMockAuthProgressReturn({
      currentStep: 'request-signature' as AuthStep,
      completedSteps: new Set(['connect-wallet', 'acquire-lock']),
      failedStep: null,
      isComplete: false,
      error: null,
    }) as any)
    
    mockUseFirebaseAuth.mockReturnValue(createMockFirebaseAuthReturn({
      isAuthenticated: true,
      isLoading: false,
      walletAddress: walletAddress,
    }) as any)

    const { result } = renderHook(() => useAuthentication())

    expect(result.current.authError).toBe(mockAuthError)
    expect(result.current.isAuthenticating).toBe(false)
    expect(result.current.authWalletAddress).toBe(walletAddress) // Firebase takes priority
    expect(result.current.isFirebaseAuthenticated).toBe(true)
    expect(result.current.isFirebaseLoading).toBe(false)
    expect(result.current.currentStep).toBe('request-signature')
    expect(result.current.completedSteps).toEqual(new Set(['connect-wallet', 'acquire-lock']))
    expect(result.current.failedStep).toBeNull()
    expect(result.current.isComplete).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('should prioritize Firebase wallet address over auth state address', () => {
    const firebaseAddress = '0x2222222222222222222222222222222222222222'
    const authStateAddress = '0x1111111111111111111111111111111111111111'

    mockUseAuthenticationState.mockReturnValue(createMockAuthStateReturn({
      authWalletAddress: authStateAddress,
    }) as any)
    
    mockUseFirebaseAuth.mockReturnValue(createMockFirebaseAuthReturn({
      walletAddress: firebaseAddress,
    }) as any)

    const { result } = renderHook(() => useAuthentication())

    // Should prioritize Firebase address over auth state address
    expect(result.current.authWalletAddress).toBe(firebaseAddress)
  })

  it('should fall back to auth state address when Firebase address is null', () => {
    const authStateAddress = '0x1111111111111111111111111111111111111111'

    mockUseAuthenticationState.mockReturnValue(createMockAuthStateReturn({
      authWalletAddress: authStateAddress,
    }) as any)
    
    mockUseFirebaseAuth.mockReturnValue(createMockFirebaseAuthReturn({
      walletAddress: null,
    }) as any)

    const { result } = renderHook(() => useAuthentication())

    // Should fall back to auth state address when Firebase is null
    expect(result.current.authWalletAddress).toBe(authStateAddress)
  })

  it('should combine isAuthenticating from auth state and Firebase loading', () => {
    const { result, rerender } = renderHook(() => useAuthentication())
    
    // Test case 1: Auth state is authenticating, Firebase is not loading
    mockUseAuthenticationState.mockReturnValue(createMockAuthStateReturn({
      isAuthenticating: true,
    }) as any)
    mockUseFirebaseAuth.mockReturnValue(createMockFirebaseAuthReturn({
      isLoading: false,
    }) as any)
    
    rerender()
    expect(result.current.isAuthenticating).toBe(true)

    // Test case 2: Auth state not authenticating, Firebase is loading
    mockUseAuthenticationState.mockReturnValue(createMockAuthStateReturn({
      isAuthenticating: false,
    }) as any)
    mockUseFirebaseAuth.mockReturnValue(createMockFirebaseAuthReturn({
      isLoading: true,
    }) as any)

    rerender()
    expect(result.current.isAuthenticating).toBe(true)

    // Test case 3: Both are active
    mockUseAuthenticationState.mockReturnValue(createMockAuthStateReturn({
      isAuthenticating: true,
    }) as any)
    mockUseFirebaseAuth.mockReturnValue(createMockFirebaseAuthReturn({
      isLoading: true,
    }) as any)

    rerender()
    expect(result.current.isAuthenticating).toBe(true)

    // Test case 4: Neither is active
    mockUseAuthenticationState.mockReturnValue(createMockAuthStateReturn({
      isAuthenticating: false,
    }) as any)
    mockUseFirebaseAuth.mockReturnValue(createMockFirebaseAuthReturn({
      isLoading: false,
    }) as any)

    rerender()
    expect(result.current.isAuthenticating).toBe(false)
  })

  it('should provide authentication progress methods', () => {
    const mockStartStep = jest.fn()
    const mockCompleteStep = jest.fn()
    const mockFailStep = jest.fn()
    const mockResetProgress = jest.fn()

    mockUseAuthProgress.mockReturnValue(createMockAuthProgressReturn({
      startStep: mockStartStep,
      completeStep: mockCompleteStep,
      failStep: mockFailStep,
      resetProgress: mockResetProgress,
    }) as any)

    const { result } = renderHook(() => useAuthentication())

    // Should provide progress methods from useAuthProgress
    expect(result.current.startStep).toBe(mockStartStep)
    expect(result.current.completeStep).toBe(mockCompleteStep)
    expect(result.current.failStep).toBe(mockFailStep)
    expect(result.current.resetProgress).toBe(mockResetProgress)
  })

  it('should expose Firebase authentication state separately', () => {
    const walletAddress = '0x1234567890123456789012345678901234567890'
    
    mockUseFirebaseAuth.mockReturnValue(createMockFirebaseAuthReturn({
      isAuthenticated: true,
      isLoading: false,
      walletAddress: walletAddress,
    }) as any)

    const { result } = renderHook(() => useAuthentication())

    // Should expose separate Firebase auth state for navigation logic
    expect(result.current.isFirebaseAuthenticated).toBe(true)
    expect(result.current.isFirebaseLoading).toBe(false)
    expect(result.current.authWalletAddress).toBe(walletAddress)
  })

  it('should handle authentication progress states correctly', () => {
    const steps: AuthStep[] = ['connect-wallet', 'acquire-lock', 'generate-message']

    mockUseAuthProgress.mockReturnValue(createMockAuthProgressReturn({
      currentStep: 'generate-message' as AuthStep,
      completedSteps: new Set(steps.slice(0, 2)),
      failedStep: null,
      isComplete: false,
      error: null,
    }) as any)

    const { result } = renderHook(() => useAuthentication())

    // Should properly reflect authentication progress
    expect(result.current.currentStep).toBe('generate-message')
    expect(result.current.completedSteps).toEqual(new Set(['connect-wallet', 'acquire-lock']))
    expect(result.current.failedStep).toBeNull()
    expect(result.current.isComplete).toBe(false)
  })

  it('should handle error states correctly', () => {
    const testError = createAppError(ErrorType.SIGNATURE_REJECTED, 'User rejected signature', new Error())

    mockUseAuthenticationState.mockReturnValue(createMockAuthStateReturn({
      authError: testError,
    }) as any)
    
    mockUseAuthProgress.mockReturnValue(createMockAuthProgressReturn({
      failedStep: 'request-signature' as AuthStep,
      error: 'User rejected signature',
    }) as any)

    const { result } = renderHook(() => useAuthentication())

    // Should properly handle error states
    expect(result.current.authError).toBe(testError)
    expect(result.current.failedStep).toBe('request-signature')
    expect(result.current.error).toBe('User rejected signature')
  })

  it('should handle authentication errors from different sources', () => {
    const errorTypes = [ErrorType.WALLET_CONNECTION, ErrorType.SIGNATURE_REJECTED, ErrorType.NETWORK_ERROR, ErrorType.AUTHENTICATION_FAILED]

    errorTypes.forEach((errorType) => {
      const testError = createAppError(errorType, `Test ${errorType} error`, new Error())

      mockUseAuthenticationState.mockReturnValue(createMockAuthStateReturn({ authError: testError }))

      const { result } = renderHook(() => useAuthentication())

      expect(result.current.authError).toBe(testError)
      expect(result.current.authError?.type).toBe(errorType)
    })
  })

  it('should handle complex authentication flow scenarios', () => {
    const walletAddress = '0x1234567890123456789012345678901234567890'
    const testError = createAppError(ErrorType.SIGNATURE_REJECTED, 'User rejected', new Error())

    // Complex scenario: Auth error, Firebase authenticated, progress in middle
    mockUseAuthenticationState.mockReturnValue(createMockAuthStateReturn({
      authError: testError,
      isAuthenticating: true,
    }) as any)
    
    mockUseAuthProgress.mockReturnValue(createMockAuthProgressReturn({
      currentStep: 'verify-signature' as AuthStep,
      completedSteps: new Set(['connect-wallet', 'acquire-lock', 'generate-message', 'request-signature']),
      failedStep: 'request-signature' as AuthStep,
      isComplete: false,
      error: 'User rejected signature',
    }) as any)
    
    mockUseFirebaseAuth.mockReturnValue(createMockFirebaseAuthReturn({
      isAuthenticated: true,
      isLoading: false,
      walletAddress: walletAddress, // Firebase takes priority
    }) as any)

    const { result } = renderHook(() => useAuthentication())

    expect(result.current).toEqual({
      authError: testError,
      isAuthenticating: true, // Combined from auth state and Firebase loading
      authWalletAddress: walletAddress, // Firebase takes priority
      isFirebaseAuthenticated: true,
      isFirebaseLoading: false,
      currentStep: 'verify-signature',
      completedSteps: new Set(['connect-wallet', 'acquire-lock', 'generate-message', 'request-signature']),
      failedStep: 'request-signature',
      isComplete: false,
      error: 'User rejected signature',
      startStep: expect.any(Function),
      completeStep: expect.any(Function),
      failStep: expect.any(Function),
      resetProgress: expect.any(Function),
    })
  })

  it('should validate complete authentication flow', () => {
    const walletAddress = '0x1234567890123456789012345678901234567890'

    // Complete successful authentication state
    mockUseAuthenticationState.mockReturnValue(createMockAuthStateReturn({
      authError: null,
      isAuthenticating: false,
    }) as any)
    
    mockUseAuthProgress.mockReturnValue(createMockAuthProgressReturn({
      currentStep: null,
      completedSteps: new Set([
        'connect-wallet',
        'acquire-lock',
        'generate-message',
        'request-signature',
        'verify-signature',
        'firebase-auth',
      ]),
      failedStep: null,
      isComplete: true,
      error: null,
    }) as any)
    
    mockUseFirebaseAuth.mockReturnValue(createMockFirebaseAuthReturn({
      isAuthenticated: true,
      isLoading: false,
      walletAddress: walletAddress,
    }) as any)

    const { result } = renderHook(() => useAuthentication())

    // Should indicate successful completion
    expect(result.current.authError).toBeNull()
    expect(result.current.isAuthenticating).toBe(false)
    expect(result.current.authWalletAddress).toBe(walletAddress)
    expect(result.current.isFirebaseAuthenticated).toBe(true)
    expect(result.current.currentStep).toBeNull()
    expect(result.current.completedSteps.size).toBe(6)
    expect(result.current.isComplete).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('should maintain consistent interface for all authentication states', () => {
    // Test that all states return consistent interface
    const testCases = [
      { 
        name: 'Default state', 
        authState: createMockAuthStateReturn(),
        authProgress: createMockAuthProgressReturn(),
        firebaseAuth: createMockFirebaseAuthReturn()
      },
      { 
        name: 'Authenticating state', 
        authState: createMockAuthStateReturn({ isAuthenticating: true }),
        authProgress: createMockAuthProgressReturn(),
        firebaseAuth: createMockFirebaseAuthReturn({ isLoading: true })
      },
      {
        name: 'Error state',
        authState: createMockAuthStateReturn({ authError: createAppError(ErrorType.WALLET_CONNECTION, 'Test', new Error()) }),
        authProgress: createMockAuthProgressReturn(),
        firebaseAuth: createMockFirebaseAuthReturn()
      },
      { 
        name: 'Complete state', 
        authState: createMockAuthStateReturn(),
        authProgress: createMockAuthProgressReturn({ isComplete: true, currentStep: null }),
        firebaseAuth: createMockFirebaseAuthReturn()
      },
    ]

    testCases.forEach(({ name, authState, authProgress, firebaseAuth }) => {
      mockUseAuthenticationState.mockReturnValue(authState)
      mockUseAuthProgress.mockReturnValue(authProgress as any)
      mockUseFirebaseAuth.mockReturnValue(firebaseAuth as any)
      
      const { result } = renderHook(() => useAuthentication())

      // Should always have the same interface
      expect(result.current).toHaveProperty('authError')
      expect(result.current).toHaveProperty('isAuthenticating')
      expect(result.current).toHaveProperty('authWalletAddress')
      expect(result.current).toHaveProperty('isFirebaseAuthenticated')
      expect(result.current).toHaveProperty('isFirebaseLoading')
      expect(result.current).toHaveProperty('currentStep')
      expect(result.current).toHaveProperty('completedSteps')
      expect(result.current).toHaveProperty('failedStep')
      expect(result.current).toHaveProperty('isComplete')
      expect(result.current).toHaveProperty('error')
      expect(result.current).toHaveProperty('startStep')
      expect(result.current).toHaveProperty('completeStep')
      expect(result.current).toHaveProperty('failStep')
      expect(result.current).toHaveProperty('resetProgress')

      // Function properties should be functions
      expect(typeof result.current.startStep).toBe('function')
      expect(typeof result.current.completeStep).toBe('function')
      expect(typeof result.current.failStep).toBe('function')
      expect(typeof result.current.resetProgress).toBe('function')
    })
  })
})
