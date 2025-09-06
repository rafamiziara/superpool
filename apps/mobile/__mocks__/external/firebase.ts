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
  initializeAuth: jest.fn(() => 'mocked-firebase-auth'),
  getReactNativePersistence: jest.fn(),
  connectAuthEmulator: jest.fn(),
  User: {},
}

// Firebase Functions mock
export const firebaseFunctions = {
  httpsCallable: jest.fn(() => jest.fn()),
  getFunctions: jest.fn(() => 'mocked-firebase-functions'),
  connectFunctionsEmulator: jest.fn(),
}

// Firebase App mock
export const firebaseApp = {
  initializeApp: jest.fn(() => 'mocked-firebase-app'),
  getApps: jest.fn(() => ['mocked-firebase-app']),
  getApp: jest.fn(() => 'mocked-firebase-app'),
}

// Firebase App Check mock
export const firebaseAppCheck = {
  initializeAppCheck: jest.fn(),
  getToken: jest.fn(() => Promise.resolve({ token: 'mock-token' })),
}

// Firebase Firestore mock
export const firebaseFirestore = {
  getFirestore: jest.fn(() => 'mocked-firestore'),
  connectFirestoreEmulator: jest.fn(),
}

// Default export for easy importing
export default {
  auth: firebaseAuth,
  functions: firebaseFunctions,
  app: firebaseApp,
  appCheck: firebaseAppCheck,
  firestore: firebaseFirestore,
}
