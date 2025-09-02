/**
 * Streamlined Jest Setup Configuration
 *
 * This file now focuses only on Jest/MobX configuration and imports centralized mocks.
 * All mock definitions have been moved to the centralized __mocks__ directory structure.
 */

import '@testing-library/jest-dom'
import { configure } from 'mobx'
import { firebaseApp, firebaseAuth, firebaseFunctions } from '../__mocks__/external/firebase'
import asyncStorage from '../__mocks__/external/asyncStorage'
import { expoApplication, expoSecureStore } from '../__mocks__/external/expo'
import wagmi from '../__mocks__/external/wagmi'
import { firebaseAuthManager, toast } from '../__mocks__/internal/utils'

// Configure MobX for testing environment
configure({
  enforceActions: 'never', // Relax for testing
  computedRequiresReaction: false,
  reactionRequiresObservable: false,
  observableRequiresReaction: false,
  disableErrorBoundaries: false, // Keep error boundaries enabled for testing
  isolateGlobalState: true, // Isolate test state
})

// Apply Firebase mocks using centralized definitions
jest.mock('firebase/auth', () => firebaseAuth)
jest.mock('firebase/functions', () => firebaseFunctions)
jest.mock('firebase/app', () => firebaseApp)

// Apply AsyncStorage mock using centralized definition
jest.mock('@react-native-async-storage/async-storage', () => asyncStorage)

// Apply Expo mocks using centralized definitions
jest.mock('expo-secure-store', () => expoSecureStore)
jest.mock('expo-application', () => expoApplication)

// Apply Wagmi mocks using centralized definitions
jest.mock('wagmi', () => wagmi)

// Apply internal utility mocks using centralized definitions
jest.mock('./utils/toast', () => toast)
jest.mock('./utils/firebaseAuthManager', () => firebaseAuthManager)

// Global test timeout
jest.setTimeout(10000)
