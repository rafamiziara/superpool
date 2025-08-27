import { configure } from 'mobx'
import { Platform } from 'react-native'

// Note: batchingForReactNative is no longer needed in newer versions of mobx-react-lite
// import 'mobx-react-lite/batchingForReactNative'

/**
 * Configure MobX for React Native environment
 * This should be called once at app startup before any stores are created
 */
export const configureMobX = () => {
  configure({
    // Enforce that state changes are made through actions
    enforceActions: 'always',

    // Less noisy development warnings
    computedRequiresReaction: false,

    // Don't warn when observables are accessed outside reactive contexts
    // This is common in React Native and not always problematic
    reactionRequiresObservable: false,

    // Don't warn about observable access outside reactive contexts
    // This reduces noise while still enforcing actions
    observableRequiresReaction: false,

    // Keep error boundaries enabled
    disableErrorBoundaries: false,
  })

  console.log(`📱 MobX configured for ${Platform.OS} environment`)
}

/**
 * React Native specific MobX utilities
 */
export const mobxUtils = {
  /**
   * Check if we're in development mode
   */
  isDevelopment: __DEV__,

  /**
   * Platform-specific logging
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  log: (message: string, ...args: any[]) => {
    if (__DEV__) {
      console.log(`🏪 [MobX] ${message}`, ...args)
    }
  },

  /**
   * Performance timing for store operations
   */
  time: (label: string) => {
    if (__DEV__ && console.time) {
      console.time(`🏪 [MobX] ${label}`)
    }
  },

  timeEnd: (label: string) => {
    if (__DEV__ && console.timeEnd) {
      console.timeEnd(`🏪 [MobX] ${label}`)
    }
  },
}
