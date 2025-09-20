import { CustomProvider } from 'firebase/app-check'
import { appCheckProvider } from './appCheckProvider'

// Mock dependencies
jest.mock('./deviceId')
import { getUniqueDeviceId } from './deviceId'
const mockGetUniqueDeviceId = getUniqueDeviceId as jest.MockedFunction<typeof getUniqueDeviceId>

// Mock fetch
const mockFetch = jest.fn()
global.fetch = mockFetch

// Mock console methods
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

// Mock environment variables
const originalEnv = process.env
const MOCK_BASE_URL = 'https://test-functions.com/'

describe('appCheckProvider', () => {
  const getTokenFromProvider = async () => {
    const provider = appCheckProvider()
    // Access the internal getToken method for testing
    const providerInternal = provider as unknown as { getToken: () => Promise<{ token: string; expireTimeMillis: number }> }
    return providerInternal.getToken()
  }

  beforeAll(() => {
    process.env = {
      ...originalEnv,
      EXPO_PUBLIC_CLOUD_FUNCTIONS_BASE_URL: MOCK_BASE_URL,
    }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return a CustomProvider instance', () => {
    const provider = appCheckProvider()
    expect(provider).toBeInstanceOf(CustomProvider)
  })

  describe('getToken functionality', () => {
    it('should return valid token on successful request', async () => {
      const mockTokenResponse = {
        appCheckToken: 'valid-token',
        expireTimeMillis: Date.now() + 3600000,
      }

      mockGetUniqueDeviceId.mockResolvedValue('device-123')
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockTokenResponse),
      })

      const result = await getTokenFromProvider()

      expect(result).toMatchObject({
        token: 'valid-token',
        expireTimeMillis: mockTokenResponse.expireTimeMillis,
      })
    })

    it('should return dummy token when device ID is falsy', async () => {
      mockGetUniqueDeviceId.mockResolvedValue(null)

      const result = await getTokenFromProvider()

      expect(mockConsoleError).toHaveBeenCalled()
      expect(result.token).toBe('dummy-token-device-not-approved')
      expect(result.expireTimeMillis).toBeGreaterThan(Date.now())
    })

    it('should return dummy token when getUniqueDeviceId throws', async () => {
      mockGetUniqueDeviceId.mockRejectedValue(new Error('Device error'))

      const result = await getTokenFromProvider()

      expect(result.token).toBe('dummy-token-device-not-approved')
    })

    it('should return dummy token when fetch throws', async () => {
      mockGetUniqueDeviceId.mockResolvedValue('device-123')
      mockFetch.mockRejectedValue(new Error('Network error'))

      const result = await getTokenFromProvider()

      expect(result.token).toBe('dummy-token-device-not-approved')
    })

    it('should return dummy token when response is not ok', async () => {
      mockGetUniqueDeviceId.mockResolvedValue('device-123')
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Unauthorized',
      })

      const result = await getTokenFromProvider()

      expect(result.token).toBe('dummy-token-device-not-approved')
    })

    it('should return dummy token when JSON parsing fails', async () => {
      mockGetUniqueDeviceId.mockResolvedValue('device-123')
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
      })

      const result = await getTokenFromProvider()

      expect(result.token).toBe('dummy-token-device-not-approved')
    })
  })
})
