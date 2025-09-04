import { ErrorRecoveryResult } from '@superpool/types'
import { FeedbackManager } from './FeedbackManager'
import { AppError, ErrorType } from '../../../utils/errorHandling'

// Mock the showErrorFromAppError function
jest.mock('../../../utils', () => ({
  showErrorFromAppError: jest.fn(),
}))

describe('FeedbackManager', () => {
  let mockAppError: AppError
  let consoleSpy: jest.SpyInstance

  beforeEach(() => {
    mockAppError = {
      name: 'AppError',
      message: 'Test error',
      type: ErrorType.AUTHENTICATION_FAILED,
      userFriendlyMessage: 'Authentication failed. Please try connecting your wallet again.',
      timestamp: new Date(),
    }

    // Setup console spy for all tests
    consoleSpy = jest.spyOn(console, 'log').mockImplementation()

    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
    consoleSpy.mockRestore()
  })

  describe('showErrorFeedback', () => {
    it('should show error immediately when delay is 0', () => {
      const { showErrorFromAppError } = require('../../../utils')
      const recoveryResult: ErrorRecoveryResult = {
        shouldDisconnect: false,
        shouldShowError: true,
        errorDelay: 0,
        cleanupPerformed: false,
      }

      FeedbackManager.showErrorFeedback(mockAppError, recoveryResult)

      expect(showErrorFromAppError).toHaveBeenCalledWith(mockAppError)
      expect(consoleSpy).toHaveBeenCalledWith('Showing error feedback immediately')
      expect(consoleSpy).toHaveBeenCalledWith('Showing error toast for non-disconnect scenario:', mockAppError.userFriendlyMessage)
    })

    it('should show error after delay', () => {
      const { showErrorFromAppError } = require('../../../utils')
      const recoveryResult: ErrorRecoveryResult = {
        shouldDisconnect: true,
        shouldShowError: true,
        errorDelay: 2000,
        cleanupPerformed: false,
      }

      FeedbackManager.showErrorFeedback(mockAppError, recoveryResult)

      expect(showErrorFromAppError).not.toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith('Scheduling error feedback in 2000ms')

      jest.advanceTimersByTime(2000)

      expect(showErrorFromAppError).toHaveBeenCalledWith(mockAppError)
      expect(consoleSpy).toHaveBeenCalledWith('Showing error toast for disconnect scenario:', mockAppError.userFriendlyMessage)
    })

    it('should not show error when shouldShowError is false', () => {
      const { showErrorFromAppError } = require('../../../utils')
      const recoveryResult: ErrorRecoveryResult = {
        shouldDisconnect: true,
        shouldShowError: false,
        errorDelay: 1000,
        cleanupPerformed: true,
      }

      FeedbackManager.showErrorFeedback(mockAppError, recoveryResult)
      jest.advanceTimersByTime(1000)

      expect(showErrorFromAppError).not.toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith('Skipping error feedback - recovery result indicates no display needed')
    })

    it('should handle negative delay as immediate feedback', () => {
      const { showErrorFromAppError } = require('../../../utils')
      const recoveryResult: ErrorRecoveryResult = {
        shouldDisconnect: false,
        shouldShowError: true,
        errorDelay: -100,
        cleanupPerformed: false,
      }

      FeedbackManager.showErrorFeedback(mockAppError, recoveryResult)

      expect(showErrorFromAppError).toHaveBeenCalledWith(mockAppError)
      expect(consoleSpy).toHaveBeenCalledWith('Showing error feedback immediately')
    })

    it('should handle very large delays correctly', () => {
      const { showErrorFromAppError } = require('../../../utils')
      const recoveryResult: ErrorRecoveryResult = {
        shouldDisconnect: true,
        shouldShowError: true,
        errorDelay: 30000, // 30 seconds
        cleanupPerformed: false,
      }

      FeedbackManager.showErrorFeedback(mockAppError, recoveryResult)

      expect(showErrorFromAppError).not.toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith('Scheduling error feedback in 30000ms')

      // Advance by less than the delay to ensure it's not shown yet
      jest.advanceTimersByTime(29000)
      expect(showErrorFromAppError).not.toHaveBeenCalled()

      // Complete the delay
      jest.advanceTimersByTime(1000)
      expect(showErrorFromAppError).toHaveBeenCalledWith(mockAppError)
    })
  })

  describe('logRecoveryResult', () => {
    it('should log recovery result details for successful recovery', () => {
      const recoveryResult: ErrorRecoveryResult = {
        shouldDisconnect: true,
        shouldShowError: true,
        errorDelay: 2000,
        cleanupPerformed: true,
      }

      FeedbackManager.logRecoveryResult('test-handler', recoveryResult)

      expect(consoleSpy).toHaveBeenCalledWith('🔄 Error recovery completed by test-handler:', {
        shouldDisconnect: true,
        shouldShowError: true,
        errorDelay: 2000,
        cleanupPerformed: true,
      })
    })

    it('should log recovery result details for different handler names', () => {
      const recoveryResult: ErrorRecoveryResult = {
        shouldDisconnect: false,
        shouldShowError: false,
        errorDelay: 0,
        cleanupPerformed: false,
      }

      FeedbackManager.logRecoveryResult('authentication-handler', recoveryResult)

      expect(consoleSpy).toHaveBeenCalledWith('🔄 Error recovery completed by authentication-handler:', {
        shouldDisconnect: false,
        shouldShowError: false,
        errorDelay: 0,
        cleanupPerformed: false,
      })
    })

    it('should handle empty handler name', () => {
      const recoveryResult: ErrorRecoveryResult = {
        shouldDisconnect: false,
        shouldShowError: true,
        errorDelay: 1000,
        cleanupPerformed: true,
      }

      FeedbackManager.logRecoveryResult('', recoveryResult)

      expect(consoleSpy).toHaveBeenCalledWith('🔄 Error recovery completed by :', {
        shouldDisconnect: false,
        shouldShowError: true,
        errorDelay: 1000,
        cleanupPerformed: true,
      })
    })
  })
})
