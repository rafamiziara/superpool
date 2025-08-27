export default {
  getAndroidId: jest.fn(() => Promise.resolve('mock-android-id')),
  getIosIdForVendorAsync: jest.fn(() => Promise.resolve('mock-ios-id')),
}
