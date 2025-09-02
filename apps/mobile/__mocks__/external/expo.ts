/**
 * Expo Module Mocks
 *
 * Consolidated Expo module mocks combining:
 * - expo-secure-store (from both expoSecureStore.js and setupTests.ts)
 * - expo-application (from expoApplication.js)
 */

// Expo SecureStore mock
export const expoSecureStore = {
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}

// Expo Application mock
export const expoApplication = {
  getAndroidId: jest.fn(() => Promise.resolve('mock-android-id')),
  getIosIdForVendorAsync: jest.fn(() => Promise.resolve('mock-ios-id')),
}

// Default export combining all Expo mocks
export default {
  secureStore: expoSecureStore,
  application: expoApplication,
}
