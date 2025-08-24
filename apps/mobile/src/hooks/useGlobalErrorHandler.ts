import { useEffect, useRef } from 'react'
import { SessionManager } from '../utils/sessionManager'

interface GlobalErrorHandler {
  isHandling: boolean
  lastHandledError: string | null
  lastHandledTime: number
}

export const useGlobalErrorHandler = () => {
  const errorState = useRef<GlobalErrorHandler>({
    isHandling: false,
    lastHandledError: null,
    lastHandledTime: 0,
  })

  useEffect(() => {
    // Global error handler for session corruption
    const handleGlobalError = async (error: Error | unknown) => {
      const errorMessage = error instanceof Error ? error.message : String(error)

      // Only handle session corruption errors
      if (!SessionManager.detectSessionCorruption(errorMessage)) {
        return
      }

      // Prevent handling the same error multiple times rapidly
      const now = Date.now()
      if (
        errorState.current.isHandling ||
        (errorState.current.lastHandledError === errorMessage && now - errorState.current.lastHandledTime < 5000)
      ) {
        return
      }

      console.log('🚨 Global session corruption detected:', errorMessage)

      errorState.current.isHandling = true
      errorState.current.lastHandledError = errorMessage
      errorState.current.lastHandledTime = now

      try {
        await SessionManager.handleSessionCorruption(errorMessage)
      } catch (recoveryError) {
        console.error('❌ Failed to recover from session corruption:', recoveryError)
      } finally {
        // Reset handling state after delay
        setTimeout(() => {
          errorState.current.isHandling = false
        }, 3000)
      }
    }

    // Set up global error handlers
    const originalConsoleError = console.error
    console.error = (...args) => {
      originalConsoleError.apply(console, args)

      // Handle potential session errors
      const errorString = args.join(' ')
      if (SessionManager.detectSessionCorruption(errorString)) {
        handleGlobalError({ message: errorString })
      }
    }

    // Note: React Native doesn't have window.addEventListener for unhandledrejection
    // but we can still catch console errors which is where these show up

    return () => {
      // Restore original console.error
      console.error = originalConsoleError
    }
  }, [])
}
