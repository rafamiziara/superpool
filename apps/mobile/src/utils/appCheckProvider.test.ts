// Mock all dependencies FIRST before any imports
jest.doMock('expo-application', () => ({
  getAndroidId: jest.fn(),
  getIosIdForVendorAsync: jest.fn(),
}))

jest.doMock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}))

jest.doMock('react-native', () => ({
  Platform: { OS: 'ios' },
}))

jest.doMock('uuid', () => ({
  v4: jest.fn(),
}))

// Mock environment BEFORE importing the module
const originalEnv = process.env.EXPO_PUBLIC_CLOUD_FUNCTIONS_BASE_URL
process.env.EXPO_PUBLIC_CLOUD_FUNCTIONS_BASE_URL = 'https://test-functions.firebase.com/'

// Import after mocking - use require to ensure mocks are applied
const { customAppCheckProviderFactory, getUniqueDeviceId } = require('./appCheckProvider')
const mockApplication = require('expo-application')
const mockSecureStore = require('expo-secure-store')
const mockRN = require('react-native')
const mockUuid = require('uuid')

// Mock fetch globally
const mockFetch = jest.fn()
global.fetch = mockFetch

describe('appCheckProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Reset all mocks with default values
    mockApplication.getAndroidId.mockReturnValue('default-android')
    mockApplication.getIosIdForVendorAsync.mockResolvedValue('default-ios')
    mockSecureStore.getItemAsync.mockResolvedValue('default-web')
    mockSecureStore.setItemAsync.mockResolvedValue(undefined)
    mockUuid.v4.mockReturnValue('default-uuid')
    mockRN.Platform.OS = 'ios'
  })

  afterAll(() => {
    process.env.EXPO_PUBLIC_CLOUD_FUNCTIONS_BASE_URL = originalEnv
  })

  describe('getUniqueDeviceId', () => {
    it('should return Android ID when available', async () => {
      mockRN.Platform.OS = 'android'
      mockApplication.getAndroidId.mockReturnValue('android123')

      const result = await getUniqueDeviceId()
      expect(result).toBe('android123')
    })

    it('should return UUID when Android ID is null', async () => {
      mockRN.Platform.OS = 'android'
      mockApplication.getAndroidId.mockReturnValue(null)
      mockUuid.v4.mockReturnValue('fallback-uuid')

      const result = await getUniqueDeviceId()
      expect(result).toBe('fallback-uuid')
    })

    it('should return iOS ID when available', async () => {
      mockRN.Platform.OS = 'ios'
      mockApplication.getIosIdForVendorAsync.mockResolvedValue('ios123')

      const result = await getUniqueDeviceId()
      expect(result).toBe('ios123')
    })

    it('should return UUID when iOS ID is null', async () => {
      mockRN.Platform.OS = 'ios'
      mockApplication.getIosIdForVendorAsync.mockResolvedValue(null)
      mockUuid.v4.mockReturnValue('ios-fallback')

      const result = await getUniqueDeviceId()
      expect(result).toBe('ios-fallback')
    })

    it('should return existing web device ID', async () => {
      mockRN.Platform.OS = 'web'
      mockSecureStore.getItemAsync.mockResolvedValue('existing-web-id')

      const result = await getUniqueDeviceId()
      expect(result).toBe('existing-web-id')
    })

    it('should generate new web device ID', async () => {
      mockRN.Platform.OS = 'web'
      mockSecureStore.getItemAsync.mockResolvedValue(null)
      mockSecureStore.setItemAsync.mockResolvedValue(undefined)
      mockUuid.v4.mockReturnValue('new-web-id')

      const result = await getUniqueDeviceId()
      expect(result).toBe('new-web-id')
    })

    it('should handle errors gracefully', async () => {
      mockRN.Platform.OS = 'android'
      mockApplication.getAndroidId.mockImplementation(() => {
        throw new Error('Permission denied')
      })
      mockUuid.v4.mockReturnValue('error-fallback')

      const result = await getUniqueDeviceId()
      expect(result).toBe('error-fallback')
    })

    it('should handle unknown platform', async () => {
      mockRN.Platform.OS = 'unknown'
      mockSecureStore.getItemAsync.mockRejectedValue(new Error('SecureStore not available'))
      mockUuid.v4.mockReturnValue('unknown-fallback')

      const result = await getUniqueDeviceId()
      expect(result).toBe('unknown-fallback')
    })
  })

  describe('customAppCheckProviderFactory', () => {
    it('should create provider with getToken function', () => {
      const provider = customAppCheckProviderFactory()
      expect(provider).toHaveProperty('getToken')
      expect(typeof provider.getToken).toBe('function')
    })

    it('should fetch token successfully', async () => {
      mockRN.Platform.OS = 'ios'
      mockApplication.getIosIdForVendorAsync.mockResolvedValue('device123')
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          appCheckToken: 'test-token',
          expireTimeMillis: Date.now() + 3600000,
        }),
      })

      const provider = customAppCheckProviderFactory()
      const result = await provider.getToken()

      expect(result.token).toBe('test-token')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-functions.firebase.com/customAppCheckMinter',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: 'device123' }),
        })
      )
    })

    it('should return dummy token on network failure', async () => {
      mockRN.Platform.OS = 'ios'
      mockApplication.getIosIdForVendorAsync.mockResolvedValue('device123')
      mockFetch.mockRejectedValue(new Error('Network error'))

      const provider = customAppCheckProviderFactory()
      const result = await provider.getToken()

      expect(result.token).toBe('dummy-token-device-not-approved')
    })

    it('should return dummy token on HTTP error', async () => {
      mockRN.Platform.OS = 'ios'
      mockApplication.getIosIdForVendorAsync.mockResolvedValue('device123')
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Server Error',
      })

      const provider = customAppCheckProviderFactory()
      const result = await provider.getToken()

      expect(result.token).toBe('dummy-token-device-not-approved')
    })

    it('should handle device ID failure with fallback', async () => {
      mockRN.Platform.OS = 'ios'
      mockApplication.getIosIdForVendorAsync.mockRejectedValue(new Error('Device error'))
      mockUuid.v4.mockReturnValue('fallback-id')
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          appCheckToken: 'fallback-token',
          expireTimeMillis: Date.now() + 3600000,
        }),
      })

      const provider = customAppCheckProviderFactory()
      const result = await provider.getToken()

      expect(result.token).toBe('fallback-token')
    })

    it('should handle missing environment URL', async () => {
      // Temporarily clear the mock and let fetch actually fail
      const originalFetch = global.fetch
      global.fetch = jest.fn().mockRejectedValue(new Error('Invalid URL'))

      mockRN.Platform.OS = 'ios'
      mockApplication.getIosIdForVendorAsync.mockResolvedValue('device123')

      const provider = customAppCheckProviderFactory()
      const result = await provider.getToken()

      expect(result.token).toBe('dummy-token-device-not-approved')

      // Restore original fetch
      global.fetch = originalFetch
    })
  })
})
