/**
 * Firebase Mock
 *
 * Consolidated Firebase mocks extracted from setupTests.ts
 * Includes Auth, Functions, and App modules
 */

// Firebase Auth mock
export const firebaseAuth = {
  signInWithCustomToken: jest.fn(),
  signOut: jest.fn(),
  onAuthStateChanged: jest.fn(),
  User: {},
}

// Firebase Functions mock
export const firebaseFunctions = {
  httpsCallable: jest.fn(() => jest.fn()),
  getFunctions: jest.fn(),
}

// Firebase App mock
export const firebaseApp = {
  initializeApp: jest.fn(),
  getApps: jest.fn(() => []),
  getApp: jest.fn(),
}

// Default export for easy importing
export default {
  auth: firebaseAuth,
  functions: firebaseFunctions,
  app: firebaseApp,
}
