import { configure } from 'mobx'
import { Platform } from 'react-native'

// Import MobX React Native batching
import 'mobx-react-lite/batchingForReactNative'

/**
 * Configure MobX for React Native environment
 * This should be called once at app startup before any stores are created
 */
export const configureMobX = () => {
  configure({
    // Enforce that state changes are made through actions
    enforceActions: 'always',

    // Warn about state changes not through actions in development
    computedRequiresReaction: __DEV__,

    // Warn when observables are accessed outside of reactive contexts in development
    reactionRequiresObservable: __DEV__,

    // Warn when observable objects are modified outside of actions in development
    observableRequiresReaction: __DEV__,

    // Disable warning about computed values being accessed outside of reactive contexts
    // in development (can be noisy in React Native)
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
