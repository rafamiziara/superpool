import { customAppCheckProviderFactory, getUniqueDeviceId } from './appCheckProvider'

// Mock expo-application - must be hoisted before imports
const mockGetAndroidId = jest.fn()
const mockGetIosIdForVendorAsync = jest.fn()

jest.mock('expo-application', () => ({
  __esModule: true,
  getAndroidId: mockGetAndroidId,
  getIosIdForVendorAsync: mockGetIosIdForVendorAsync,
  default: {
    getAndroidId: mockGetAndroidId,
    getIosIdForVendorAsync: mockGetIosIdForVendorAsync,
  },
}))

// Mock expo-secure-store
const mockSecureStore = {
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}

jest.mock('expo-secure-store', () => mockSecureStore)

// Mock react-native Platform
let mockPlatformOS = 'ios' // Default to iOS

jest.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockPlatformOS
    },
  },
}))

// Mock uuid
const mockUuid = {
  v4: jest.fn(),
}

jest.mock('uuid', () => mockUuid)

// Mock global fetch
const mockFetch = jest.fn()
global.fetch = mockFetch

// Mock environment variable
const originalEnv = process.env.EXPO_PUBLIC_CLOUD_FUNCTIONS_BASE_URL
process.env.EXPO_PUBLIC_CLOUD_FUNCTIONS_BASE_URL = 'https://test-functions.firebase.com/'

describe('appCheckProvider', () => {
  let originalConsoleError: typeof console.error

  beforeEach(() => {
    jest.clearAllMocks()
    mockPlatformOS = 'ios' // Reset to default

    // Mock console.error to avoid test output pollution
    originalConsoleError = console.error
    console.error = jest.fn()
  })

  afterEach(() => {
    // Restore console.error
    console.error = originalConsoleError
  })

  afterAll(() => {
    process.env.EXPO_PUBLIC_CLOUD_FUNCTIONS_BASE_URL = originalEnv
  })

  describe('getUniqueDeviceId', () => {
    describe('Android Platform', () => {
      beforeEach(() => {
        mockPlatformOS = 'android'
      })

      it('should return Android ID for Android platform', async () => {
        const androidId = 'android_device_123456'
        mockGetAndroidId.mockResolvedValue(androidId)

        const result = await getUniqueDeviceId()

        expect(mockGetAndroidId).toHaveBeenCalled()
        expect(result).toBe(androidId)
      })

      it('should handle Android ID retrieval failure', async () => {
        mockGetAndroidId.mockRejectedValue(new Error('Permission denied'))
        mockUuid.v4.mockReturnValue('fallback-uuid-android')

        const result = await getUniqueDeviceId()

        expect(result).toBe('fallback-uuid-android')
        expect(mockUuid.v4).toHaveBeenCalled()
      })

      it('should handle null Android ID', async () => {
        mockGetAndroidId.mockResolvedValue(null)
        mockUuid.v4.mockReturnValue('fallback-uuid-android-null')

        const result = await getUniqueDeviceId()

        expect(result).toBe('fallback-uuid-android-null')
        expect(mockUuid.v4).toHaveBeenCalled()
      })
    })

    describe('iOS Platform', () => {
      beforeEach(() => {
        mockPlatformOS = 'ios'
      })

      it('should return iOS ID for Vendor for iOS platform', async () => {
        const iosId = 'ios_vendor_id_abcdef123456'
        mockGetIosIdForVendorAsync.mockResolvedValue(iosId)

        const result = await getUniqueDeviceId()

        expect(mockGetIosIdForVendorAsync).toHaveBeenCalled()
        expect(result).toBe(iosId)
      })

      it('should handle iOS ID retrieval failure', async () => {
        mockGetIosIdForVendorAsync.mockRejectedValue(new Error('Not available'))
        mockUuid.v4.mockReturnValue('fallback-uuid-ios')

        const result = await getUniqueDeviceId()

        expect(result).toBe('fallback-uuid-ios')
        expect(mockUuid.v4).toHaveBeenCalled()
      })

      it('should handle null iOS ID', async () => {
        mockGetIosIdForVendorAsync.mockResolvedValue(null)
        mockUuid.v4.mockReturnValue('fallback-uuid-ios-null')

        const result = await getUniqueDeviceId()

        expect(result).toBe('fallback-uuid-ios-null')
        expect(mockUuid.v4).toHaveBeenCalled()
      })
    })

    describe('Web Platform', () => {
      beforeEach(() => {
        mockPlatformOS = 'web'
      })

      it('should retrieve existing device ID from SecureStore', async () => {
        const existingId = 'existing_web_device_id'
        mockSecureStore.getItemAsync.mockResolvedValue(existingId)

        const result = await getUniqueDeviceId()

        expect(mockSecureStore.getItemAsync).toHaveBeenCalledWith('web_device_id')
        expect(result).toBe(existingId)
      })

      it('should generate and store new device ID when none exists', async () => {
        mockSecureStore.getItemAsync.mockResolvedValue(null)
        const newUuid = 'new_web_device_uuid'
        mockUuid.v4.mockReturnValue(newUuid)
        mockSecureStore.setItemAsync.mockResolvedValue()

        const result = await getUniqueDeviceId()

        expect(mockSecureStore.getItemAsync).toHaveBeenCalledWith('web_device_id')
        expect(mockUuid.v4).toHaveBeenCalled()
        expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith('web_device_id', newUuid)
        expect(result).toBe(newUuid)
      })

      it('should handle SecureStore errors gracefully', async () => {
        mockSecureStore.getItemAsync.mockRejectedValue(new Error('SecureStore error'))
        const fallbackUuid = 'fallback_web_uuid'
        mockUuid.v4.mockReturnValue(fallbackUuid)

        const result = await getUniqueDeviceId()

        expect(result).toBe(fallbackUuid)
      })

      it('should handle SecureStore save errors gracefully', async () => {
        mockSecureStore.getItemAsync.mockResolvedValue(null)
        mockSecureStore.setItemAsync.mockRejectedValue(new Error('Save failed'))
        const newUuid = 'uuid_with_save_error'
        mockUuid.v4.mockReturnValue(newUuid)

        const result = await getUniqueDeviceId()

        expect(result).toBe(newUuid) // Should still return the generated UUID
      })
    })

    describe('Unknown/Unsupported Platform', () => {
      beforeEach(() => {
        mockPlatformOS = 'unknown' as any
      })

      it('should fallback to UUID for unsupported platforms', async () => {
        const fallbackUuid = 'unknown_platform_uuid'
        mockUuid.v4.mockReturnValue(fallbackUuid)

        const result = await getUniqueDeviceId()

        expect(result).toBe(fallbackUuid)
        expect(mockUuid.v4).toHaveBeenCalled()
      })
    })

    describe('Consistency and Caching', () => {
      it('should return consistent results for multiple calls on same platform', async () => {
        mockPlatformOS = 'ios'
        const iosId = 'consistent_ios_id'
        mockGetIosIdForVendorAsync.mockResolvedValue(iosId)

        const result1 = await getUniqueDeviceId()
        const result2 = await getUniqueDeviceId()
        const result3 = await getUniqueDeviceId()

        expect(result1).toBe(iosId)
        expect(result2).toBe(iosId)
        expect(result3).toBe(iosId)
        expect(mockGetIosIdForVendorAsync).toHaveBeenCalledTimes(3)
      })
    })
  })

  describe('customAppCheckProviderFactory', () => {
    describe('Provider Creation', () => {
      it('should return an object with getToken function', () => {
        const provider = customAppCheckProviderFactory()

        expect(provider).toHaveProperty('getToken')
        expect(typeof provider.getToken).toBe('function')
      })
    })

    describe('getToken Implementation', () => {
      describe('Successful Token Fetching', () => {
        it('should fetch token successfully with valid response', async () => {
          const mockToken = 'valid_app_check_token_12345'
          const deviceId = 'test_device_id'

          mockPlatformOS = 'ios'
          mockGetIosIdForVendorAsync.mockResolvedValue(deviceId)

          mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ token: mockToken }),
          })

          const provider = customAppCheckProviderFactory()
          const result = await provider.getToken()

          expect(result).toEqual({
            token: mockToken,
            expiry: expect.any(Number),
          })

          expect(mockFetch).toHaveBeenCalledWith(
            'https://test-functions.firebase.com/customAppCheckMinter',
            expect.objectContaining({
              method: 'POST',
              headers: expect.objectContaining({
                'Content-Type': 'application/json',
              }),
              body: JSON.stringify({ deviceId }),
            })
          )
        })

        it('should set appropriate expiry time for tokens', async () => {
          const mockToken = 'token_with_expiry'
          const deviceId = 'test_device_id_expiry'

          mockPlatformOS = 'android'
          mockGetAndroidId.mockResolvedValue(deviceId)

          mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ token: mockToken }),
          })

          const beforeCall = Date.now()
          const provider = customAppCheckProviderFactory()
          const result = await provider.getToken()
          const afterCall = Date.now()

          // Token should expire approximately 1 hour from now
          const expectedExpiry = beforeCall + 60 * 60 * 1000 // 1 hour
          const actualExpiry = result.expiry

          expect(actualExpiry).toBeGreaterThanOrEqual(expectedExpiry - 1000) // Allow 1s variance
          expect(actualExpiry).toBeLessThanOrEqual(afterCall + 60 * 60 * 1000 + 1000)
        })
      })

      describe('Network Errors and Fallbacks', () => {
        it('should return dummy token on network failure', async () => {
          mockPlatformOS = 'ios'
          mockGetIosIdForVendorAsync.mockResolvedValue('device_id')

          mockFetch.mockRejectedValue(new Error('Network error'))

          const provider = customAppCheckProviderFactory()
          const result = await provider.getToken()

          expect(result.token).toBe('dummy_token_for_development')
          expect(result.expiry).toBeGreaterThan(Date.now())
        })

        it('should return dummy token on HTTP error response', async () => {
          mockPlatformOS = 'android'
          mockGetAndroidId.mockResolvedValue('android_device')

          mockFetch.mockResolvedValue({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
          })

          const provider = customAppCheckProviderFactory()
          const result = await provider.getToken()

          expect(result.token).toBe('dummy_token_for_development')
        })

        it('should return dummy token when response lacks token field', async () => {
          mockPlatformOS = 'web'
          mockSecureStore.getItemAsync.mockResolvedValue('web_device_id')

          mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ message: 'success' }), // No token field
          })

          const provider = customAppCheckProviderFactory()
          const result = await provider.getToken()

          expect(result.token).toBe('dummy_token_for_development')
        })

        it('should return dummy token on JSON parsing error', async () => {
          mockPlatformOS = 'ios'
          mockGetIosIdForVendorAsync.mockResolvedValue('ios_device')

          mockFetch.mockResolvedValue({
            ok: true,
            json: async () => {
              throw new Error('Invalid JSON')
            },
          })

          const provider = customAppCheckProviderFactory()
          const result = await provider.getToken()

          expect(result.token).toBe('dummy_token_for_development')
        })
      })

      describe('Device ID Integration', () => {
        it('should use different device IDs for different platforms', async () => {
          const androidId = 'android_specific_id'
          const iosId = 'ios_specific_id'

          // Test Android
          mockPlatformOS = 'android'
          mockGetAndroidId.mockResolvedValue(androidId)
          mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ token: 'android_token' }),
          })

          const androidProvider = customAppCheckProviderFactory()
          await androidProvider.getToken()

          expect(mockFetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
              body: JSON.stringify({ deviceId: androidId }),
            })
          )

          // Reset mock
          mockFetch.mockClear()

          // Test iOS
          mockPlatformOS = 'ios'
          mockGetIosIdForVendorAsync.mockResolvedValue(iosId)
          mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ token: 'ios_token' }),
          })

          const iosProvider = customAppCheckProviderFactory()
          await iosProvider.getToken()

          expect(mockFetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
              body: JSON.stringify({ deviceId: iosId }),
            })
          )
        })
      })

      describe('Environment Configuration', () => {
        it('should use correct Cloud Functions URL from environment', async () => {
          mockPlatformOS = 'ios'
          mockGetIosIdForVendorAsync.mockResolvedValue('test_device')
          mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ token: 'env_test_token' }),
          })

          const provider = customAppCheckProviderFactory()
          await provider.getToken()

          expect(mockFetch).toHaveBeenCalledWith('https://test-functions.firebase.com/customAppCheckMinter', expect.any(Object))
        })

        it('should handle missing environment variable gracefully', async () => {
          // Temporarily remove env var
          const originalUrl = process.env.EXPO_PUBLIC_CLOUD_FUNCTIONS_BASE_URL
          delete process.env.EXPO_PUBLIC_CLOUD_FUNCTIONS_BASE_URL

          mockPlatformOS = 'ios'
          mockGetIosIdForVendorAsync.mockResolvedValue('test_device')

          const provider = customAppCheckProviderFactory()
          const result = await provider.getToken()

          // Should fall back to dummy token when URL is not configured
          expect(result.token).toBe('dummy_token_for_development')

          // Restore env var
          process.env.EXPO_PUBLIC_CLOUD_FUNCTIONS_BASE_URL = originalUrl
        })
      })
    })

    describe('Multiple Provider Instances', () => {
      it('should create independent provider instances', async () => {
        const provider1 = customAppCheckProviderFactory()
        const provider2 = customAppCheckProviderFactory()

        expect(provider1).not.toBe(provider2)
        expect(provider1.getToken).not.toBe(provider2.getToken)
      })

      it('should work correctly with concurrent token requests', async () => {
        mockPlatformOS = 'ios'
        mockGetIosIdForVendorAsync.mockResolvedValue('concurrent_device')

        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({ token: 'concurrent_token' }),
        })

        const provider = customAppCheckProviderFactory()

        // Make concurrent requests
        const promises = Array.from({ length: 5 }, () => provider.getToken())
        const results = await Promise.all(promises)

        // All should succeed and return valid tokens
        results.forEach((result) => {
          expect(result.token).toBeTruthy()
          expect(result.expiry).toBeGreaterThan(Date.now())
        })

        expect(mockFetch).toHaveBeenCalledTimes(5)
      })
    })
  })

  describe('Error Handling and Resilience', () => {
    describe('Device ID Errors', () => {
      it('should handle device ID retrieval errors gracefully in token fetch', async () => {
        mockPlatformOS = 'ios'
        mockGetIosIdForVendorAsync.mockRejectedValue(new Error('Device ID unavailable'))
        mockUuid.v4.mockReturnValue('fallback_device_id')

        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({ token: 'fallback_token' }),
        })

        const provider = customAppCheckProviderFactory()
        const result = await provider.getToken()

        expect(result.token).toBe('fallback_token')
        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: JSON.stringify({ deviceId: 'fallback_device_id' }),
          })
        )
      })
    })

    describe('Timeout and Long-Running Requests', () => {
      it('should handle slow network requests', async () => {
        mockPlatformOS = 'android'
        mockGetAndroidId.mockResolvedValue('slow_device')

        // Simulate slow response
        mockFetch.mockImplementation(
          () =>
            new Promise((resolve) => {
              setTimeout(() => {
                resolve({
                  ok: true,
                  json: async () => ({ token: 'slow_token' }),
                })
              }, 100) // 100ms delay
            })
        )

        const provider = customAppCheckProviderFactory()
        const start = performance.now()
        const result = await provider.getToken()
        const end = performance.now()

        expect(result.token).toBe('slow_token')
        expect(end - start).toBeGreaterThanOrEqual(90) // Allow some variance
      })
    })
  })

  describe('Performance and Memory', () => {
    it('should handle rapid provider creation efficiently', () => {
      const start = performance.now()

      const providers = Array.from({ length: 100 }, () => customAppCheckProviderFactory())

      const end = performance.now()
      expect(end - start).toBeLessThan(100) // Should be very fast
      expect(providers).toHaveLength(100)
    })

    it('should not leak memory with repeated token requests', async () => {
      mockPlatformOS = 'ios'
      mockGetIosIdForVendorAsync.mockResolvedValue('memory_test_device')

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'memory_test_token' }),
      })

      const initialMemory = process.memoryUsage().heapUsed
      const provider = customAppCheckProviderFactory()

      // Make many token requests
      const promises = Array.from({ length: 50 }, () => provider.getToken())
      await Promise.all(promises)

      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory

      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024) // Less than 50MB
    })
  })

  describe('Integration Testing', () => {
    it('should integrate getUniqueDeviceId with token provider correctly', async () => {
      const deviceId = 'integration_test_device_id'
      mockPlatformOS = 'android'
      mockGetAndroidId.mockResolvedValue(deviceId)

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'integration_token' }),
      })

      // Test device ID function directly
      const directDeviceId = await getUniqueDeviceId()
      expect(directDeviceId).toBe(deviceId)

      // Test device ID through provider
      const provider = customAppCheckProviderFactory()
      await provider.getToken()

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ deviceId }),
        })
      )
    })

    it('should work across platform switching scenarios', async () => {
      // Start with iOS
      mockPlatformOS = 'ios'
      const iosId = 'ios_device_123'
      mockGetIosIdForVendorAsync.mockResolvedValue(iosId)

      const iosDeviceId = await getUniqueDeviceId()
      expect(iosDeviceId).toBe(iosId)

      // Switch to Android
      mockPlatformOS = 'android'
      const androidId = 'android_device_456'
      mockGetAndroidId.mockResolvedValue(androidId)

      const androidDeviceId = await getUniqueDeviceId()
      expect(androidDeviceId).toBe(androidId)

      // Device IDs should be different for different platforms
      expect(iosDeviceId).not.toBe(androidDeviceId)
    })
  })
})
