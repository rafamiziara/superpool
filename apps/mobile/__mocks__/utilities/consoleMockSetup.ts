/**
 * Console Mock Setup Utility
 *
 * Centralized utility for setting up and tearing down console method mocks
 * in test environments. This reduces repetitive mock setup code.
 */

interface ConsoleMockSetup {
  originalConsoleLog: typeof console.log
  originalConsoleTime: typeof console.time
  originalConsoleTimeEnd: typeof console.timeEnd
  originalConsoleError: typeof console.error
  originalConsoleWarn: typeof console.warn
}

/**
 * Set up console method mocks
 * @param methods Array of console methods to mock
 * @returns Cleanup function and original methods
 */
export const setupConsoleMocks = (
  methods: Array<'log' | 'time' | 'timeEnd' | 'error' | 'warn'> = ['log', 'time', 'timeEnd', 'error', 'warn']
): ConsoleMockSetup & { restore: () => void } => {
  const original: ConsoleMockSetup = {
    originalConsoleLog: console.log,
    originalConsoleTime: console.time,
    originalConsoleTimeEnd: console.timeEnd,
    originalConsoleError: console.error,
    originalConsoleWarn: console.warn,
  }

  // Mock specified methods
  if (methods.includes('log')) {
    console.log = jest.fn()
  }
  if (methods.includes('time')) {
    console.time = jest.fn()
  }
  if (methods.includes('timeEnd')) {
    console.timeEnd = jest.fn()
  }
  if (methods.includes('error')) {
    console.error = jest.fn()
  }
  if (methods.includes('warn')) {
    console.warn = jest.fn()
  }

  return {
    ...original,
    restore: () => {
      if (methods.includes('log')) console.log = original.originalConsoleLog
      if (methods.includes('time')) console.time = original.originalConsoleTime
      if (methods.includes('timeEnd')) console.timeEnd = original.originalConsoleTimeEnd
      if (methods.includes('error')) console.error = original.originalConsoleError
      if (methods.includes('warn')) console.warn = original.originalConsoleWarn
    },
  }
}
