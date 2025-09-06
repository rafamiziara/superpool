// Error recovery modules for clean separation of concerns and error handling
// Re-export shared types from @superpool/types for convenience
export { ErrorRecoveryResult, ErrorType, SessionErrorContext } from '@superpool/types'

export { ConnectorErrorHandler } from './ConnectorErrorHandler'
export { ErrorAnalysisResult, ErrorAnalyzer } from './ErrorAnalyzer'
export { ErrorHandler, RecoveryActions } from './ErrorHandler'
export { ErrorRecoveryService } from './ErrorRecoveryService'
export { FeedbackManager } from './FeedbackManager'
export { FirebaseCleanupManager } from './FirebaseCleanupManager'
export { GenericErrorContext, GenericErrorHandler } from './GenericErrorHandler'
export { SessionErrorHandler } from './SessionErrorHandler'
export { TimeoutErrorHandler } from './TimeoutErrorHandler'
