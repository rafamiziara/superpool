import { ErrorRecoveryResult } from '@superpool/types'
import { FeedbackManager } from './FeedbackManager'
import { AppError, ErrorType } from '../../../utils/errorHandling'

// Mock the showErrorFromAppError function
jest.mock('../../../utils', () => ({
  showErrorFromAppError: jest.fn(),
}))

describe('FeedbackManager', () => {
  let mockAppError: AppError

  beforeEach(() => {
    mockAppError = {
      name: 'AppError',
      message: 'Test error',
      type: ErrorType.AUTHENTICATION_FAILED,
      userFriendlyMessage: 'Authentication failed. Please try connecting your wallet again.',
      timestamp: new Date(),
    }
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
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

      jest.advanceTimersByTime(2000)
      expect(showErrorFromAppError).toHaveBeenCalledWith(mockAppError)
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
    })

    it('should log appropriate messages', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      const recoveryResult: ErrorRecoveryResult = {
        shouldDisconnect: true,
        shouldShowError: true,
        errorDelay: 1500,
        cleanupPerformed: false,
      }

      FeedbackManager.showErrorFeedback(mockAppError, recoveryResult)

      expect(consoleSpy).toHaveBeenCalledWith('Scheduling error feedback in 1500ms')

      consoleSpy.mockRestore()
    })
  })

  describe('logRecoveryResult', () => {
    it('should log recovery result details', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
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

      consoleSpy.mockRestore()
    })
  })
})
