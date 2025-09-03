/**
 * Streamlined Jest Setup Configuration
 *
 * This file now focuses only on Jest/MobX configuration and imports centralized mocks.
 * All mock definitions have been moved to the centralized __mocks__ directory structure.
 */

import '@testing-library/jest-dom'
import { configure } from 'mobx'

// Configure MobX for testing environment
configure({
  enforceActions: 'never', // Relax for testing
  computedRequiresReaction: false,
  reactionRequiresObservable: false,
  observableRequiresReaction: false,
  disableErrorBoundaries: false, // Keep error boundaries enabled for testing
  isolateGlobalState: true, // Isolate test state
})

// Apply Firebase mocks using centralized definitions (imported inline to avoid Jest scoping issues)
jest.mock('firebase/auth', () => require('@mocks/external/firebase').firebaseAuth)
jest.mock('firebase/functions', () => require('@mocks/external/firebase').firebaseFunctions)
jest.mock('firebase/app', () => require('@mocks/external/firebase').firebaseApp)

// Apply AsyncStorage mock using centralized definition
jest.mock('@react-native-async-storage/async-storage', () => require('@mocks/external/asyncStorage').default)

// Apply Expo mocks using centralized definitions
jest.mock('expo-secure-store', () => require('@mocks/external/expo').expoSecureStore)
jest.mock('expo-application', () => require('@mocks/external/expo').expoApplication)

// Apply Wagmi mocks using centralized definitions
jest.mock('wagmi', () => require('@mocks/external/wagmi').default)

// Apply internal utility mocks using centralized definitions
jest.mock('./utils/toast', () => require('@mocks/internal/utils').toast)
jest.mock('./utils/firebaseAuthManager', () => require('@mocks/internal/utils').firebaseAuthManager)

// Mock Expo runtime to prevent import meta registry errors
jest.mock('expo/src/winter/runtime.native', () => ({
  __esModule: true,
  default: {},
}))

// Mock global Expo import meta registry
Object.defineProperty(global, '__ExpoImportMetaRegistry', {
  value: new Map(),
  configurable: true,
})

// Mock TextDecoder for React Native compatibility
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = class TextDecoder {
    readonly encoding: string = 'utf-8'
    readonly fatal: boolean = false
    readonly ignoreBOM: boolean = false

    constructor() {
      // Basic implementation for testing
    }

    decode(input?: BufferSource): string {
      if (!input) return ''
      const bytes = new Uint8Array(input as ArrayBuffer)
      return String.fromCharCode.apply(null, Array.from(bytes))
    }
  }
}

// Global test timeout
jest.setTimeout(10000)
