// Error recovery modules for clean separation of concerns and error handling
// Re-export shared types from @superpool/types for convenience
export { ErrorType, SessionErrorContext, ErrorRecoveryResult } from '@superpool/types'

export { ErrorAnalyzer, ErrorAnalysisResult } from './ErrorAnalyzer'
export { ErrorHandler, RecoveryActions } from './ErrorHandler'
export { SessionErrorHandler } from './SessionErrorHandler'
export { TimeoutErrorHandler } from './TimeoutErrorHandler'
export { ConnectorErrorHandler } from './ConnectorErrorHandler'
export { GenericErrorHandler, GenericErrorContext } from './GenericErrorHandler'
export { FeedbackManager } from './FeedbackManager'
export { FirebaseCleanupManager } from './FirebaseCleanupManager'
export { ErrorRecoveryService } from './ErrorRecoveryService'