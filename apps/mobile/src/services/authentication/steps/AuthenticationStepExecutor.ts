import { AuthStep } from '@superpool/types'
import type { AuthProgressCallbacks } from '../authenticationOrchestrator'

/**
 * Handles the orchestration and timing of authentication steps
 * Separates UI timing concerns from business logic
 */
export class AuthenticationStepExecutor {
  constructor(private progressCallbacks?: AuthProgressCallbacks) {}

  /**
   * Execute an authentication step with proper timing and callbacks
   */
  async executeStep<T>(
    step: AuthStep,
    stepFunction: () => Promise<T>,
    options: {
      beforeDelay?: number
      afterDelay?: number
      skipProgressCallbacks?: boolean
    } = {}
  ): Promise<T> {
    const { beforeDelay = 200, afterDelay = 200, skipProgressCallbacks = false } = options

    // Start step progress
    if (!skipProgressCallbacks) {
      this.progressCallbacks?.onStepStart?.(step)
    }

    // Brief delay to ensure UI renders the step progress
    if (beforeDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, beforeDelay))
    }

    try {
      // Execute the actual step logic
      const result = await stepFunction()

      // Mark step as complete
      if (!skipProgressCallbacks) {
        this.progressCallbacks?.onStepComplete?.(step)
      }

      // Brief delay after completion to show completed state
      if (afterDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, afterDelay))
      }

      return result
    } catch (error) {
      // Mark step as failed
      if (!skipProgressCallbacks) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        this.progressCallbacks?.onStepFail?.(step, errorMessage)
      }
      throw error
    }
  }

  /**
   * Execute the lock acquisition step with longer delay
   */
  async executeLockStep<T>(stepFunction: () => Promise<T>): Promise<T> {
    return this.executeStep('acquire-lock', stepFunction, {
      beforeDelay: 600, // Longer delay for Step 2 to ensure UI renders
      afterDelay: 200,
    })
  }

  /**
   * Execute a step without progress callbacks (for internal steps)
   */
  async executeInternalStep<T>(stepFunction: () => Promise<T>): Promise<T> {
    return stepFunction()
  }
}