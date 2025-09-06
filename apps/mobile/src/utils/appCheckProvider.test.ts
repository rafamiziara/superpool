// Mock environment BEFORE importing anything
const originalEnv = process.env.EXPO_PUBLIC_CLOUD_FUNCTIONS_BASE_URL
process.env.EXPO_PUBLIC_CLOUD_FUNCTIONS_BASE_URL = 'https://test-functions.firebase.com/'

// Create mock functions
const mockGetAndroidId = jest.fn()
const mockGetIosIdForVendorAsync = jest.fn()
const mockGetItemAsync = jest.fn()
const mockSetItemAsync = jest.fn()
const mockUuidv4 = jest.fn()

// Store reference to actual modules before mocking
jest.doMock('expo-application', () => ({
  getAndroidId: mockGetAndroidId,
  getIosIdForVendorAsync: mockGetIosIdForVendorAsync,
}))

jest.doMock('expo-secure-store', () => ({
  getItemAsync: mockGetItemAsync,
  setItemAsync: mockSetItemAsync,
}))

jest.doMock('uuid', () => ({
  v4: mockUuidv4,
}))

jest.doMock('react-native-get-random-values', () => ({}))

// Create mutable Platform mock
const mockPlatform = { OS: 'ios' }
jest.doMock('react-native', () => ({
  Platform: mockPlatform,
}))

// Mock Firebase App Check
jest.doMock('firebase/app-check', () => ({
  CustomProvider: jest.fn().mockImplementation((config) => ({
    getToken: config.getToken,
  })),
  AppCheckToken: {},
}))

// Mock fetch globally
const mockFetch = jest.fn()
global.fetch = mockFetch

// Import the module under test
const appCheckProvider = require('./appCheckProvider')

describe('appCheckProvider', () => {
  let getUniqueDeviceId: typeof appCheckProvider.getUniqueDeviceId
  let customAppCheckProviderFactory: typeof appCheckProvider.customAppCheckProviderFactory

  beforeAll(() => {
    // Get the functions from the required module
    getUniqueDeviceId = appCheckProvider.getUniqueDeviceId
    customAppCheckProviderFactory = appCheckProvider.customAppCheckProviderFactory
  })

  beforeEach(() => {
    jest.clearAllMocks()

    // Reset all mocks with default values
    mockGetAndroidId.mockReturnValue('default-android')
    mockGetIosIdForVendorAsync.mockResolvedValue('default-ios')
    mockGetItemAsync.mockResolvedValue('default-web')
    mockSetItemAsync.mockResolvedValue(undefined)
    mockUuidv4.mockReturnValue('default-uuid')
    mockPlatform.OS = 'ios'
  })

  afterAll(() => {
    process.env.EXPO_PUBLIC_CLOUD_FUNCTIONS_BASE_URL = originalEnv
  })

  describe('getUniqueDeviceId', () => {
    it('should return Android ID when available', async () => {
      mockPlatform.OS = 'android'
      mockGetAndroidId.mockReturnValue('android123')

      const result = await getUniqueDeviceId()
      expect(result).toBe('android123')
    })

    it('should return UUID when Android ID is null', async () => {
      mockPlatform.OS = 'android'
      mockGetAndroidId.mockReturnValue(null)
      mockUuidv4.mockReturnValue('fallback-uuid')

      const result = await getUniqueDeviceId()
      expect(result).toBe('fallback-uuid')
    })

    it('should return iOS ID when available', async () => {
      mockPlatform.OS = 'ios'
      mockGetIosIdForVendorAsync.mockResolvedValue('ios123')

      const result = await getUniqueDeviceId()
      expect(result).toBe('ios123')
    })

    it('should return UUID when iOS ID is null', async () => {
      mockPlatform.OS = 'ios'
      mockGetIosIdForVendorAsync.mockResolvedValue(null)
      mockUuidv4.mockReturnValue('ios-fallback')

      const result = await getUniqueDeviceId()
      expect(result).toBe('ios-fallback')
    })

    it('should return existing web device ID', async () => {
      mockPlatform.OS = 'web'
      mockGetItemAsync.mockResolvedValue('existing-web-id')

      const result = await getUniqueDeviceId()
      expect(result).toBe('existing-web-id')
    })

    it('should generate new web device ID', async () => {
      mockPlatform.OS = 'web'
      mockGetItemAsync.mockResolvedValue(null)
      mockSetItemAsync.mockResolvedValue(undefined)
      mockUuidv4.mockReturnValue('new-web-id')

      const result = await getUniqueDeviceId()
      expect(result).toBe('new-web-id')
    })

    it('should handle errors gracefully', async () => {
      mockPlatform.OS = 'android'
      mockGetAndroidId.mockImplementation(() => {
        throw new Error('Permission denied')
      })
      mockUuidv4.mockReturnValue('error-fallback')

      const result = await getUniqueDeviceId()
      expect(result).toBe('error-fallback')
    })

    it('should handle unknown platform', async () => {
      mockPlatform.OS = 'unknown' as 'android' | 'ios' | 'web' | 'unknown'
      mockGetItemAsync.mockRejectedValue(new Error('SecureStore not available'))
      mockUuidv4.mockReturnValue('unknown-fallback')

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
      mockPlatform.OS = 'ios'
      mockGetIosIdForVendorAsync.mockResolvedValue('device123')
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
      mockPlatform.OS = 'ios'
      mockGetIosIdForVendorAsync.mockResolvedValue('device123')
      mockFetch.mockRejectedValue(new Error('Network error'))

      const provider = customAppCheckProviderFactory()
      const result = await provider.getToken()

      expect(result.token).toBe('dummy-token-device-not-approved')
    })

    it('should return dummy token on HTTP error', async () => {
      mockPlatform.OS = 'ios'
      mockGetIosIdForVendorAsync.mockResolvedValue('device123')
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
      mockPlatform.OS = 'ios'
      mockGetIosIdForVendorAsync.mockRejectedValue(new Error('Device error'))
      mockUuidv4.mockReturnValue('fallback-id')
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

      mockPlatform.OS = 'ios'
      mockGetIosIdForVendorAsync.mockResolvedValue('device123')

      const provider = customAppCheckProviderFactory()
      const result = await provider.getToken()

      expect(result.token).toBe('dummy-token-device-not-approved')

      // Restore original fetch
      global.fetch = originalFetch
    })
  })
})
