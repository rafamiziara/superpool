import * as Application from 'expo-application'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { getUniqueDeviceId } from './deviceId'

// Mock dependencies
jest.mock('expo-application', () => ({
  getAndroidId: jest.fn(),
  getIosIdForVendorAsync: jest.fn(),
}))

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}))

jest.mock('react-native', () => ({
  Platform: {
    OS: 'android', // Default to android for tests
  },
}))

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-12345'),
}))

// Mock console methods
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {})

describe('getUniqueDeviceId', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockConsoleWarn.mockClear()
    // Reset Platform.OS to android by default
    ;(Platform as { OS: 'android' | 'ios' | 'web' | 'unknown' }).OS = 'android'
  })

  afterAll(() => {
    mockConsoleWarn.mockRestore()
  })

  describe('Basic functionality', () => {
    it('should return a non-null string', async () => {
      const result = await getUniqueDeviceId()

      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
      expect(result!.length).toBeGreaterThan(0)
    })

    it('should handle multiple calls', async () => {
      const result1 = await getUniqueDeviceId()
      const result2 = await getUniqueDeviceId()

      expect(typeof result1).toBe('string')
      expect(typeof result2).toBe('string')
      expect(result1!.length).toBeGreaterThan(0)
      expect(result2!.length).toBeGreaterThan(0)
    })

    it('should not return null or undefined', async () => {
      const result = await getUniqueDeviceId()

      expect(result).not.toBeNull()
      expect(result).not.toBeUndefined()
    })
  })

  describe('Android platform (lines 11-15)', () => {
    beforeEach(() => {
      ;(Platform as { OS: 'android' | 'ios' | 'web' | 'unknown' }).OS = 'android'
    })

    it('should return UUID when getAndroidId returns null', async () => {
      ;(Application.getAndroidId as jest.Mock).mockReturnValue(null)

      const result = await getUniqueDeviceId()

      expect(result).toBe('mock-uuid-12345')
      expect(Application.getAndroidId).toHaveBeenCalled()
    })

    it('should return UUID when getAndroidId returns undefined', async () => {
      ;(Application.getAndroidId as jest.Mock).mockReturnValue(undefined)

      const result = await getUniqueDeviceId()

      expect(result).toBe('mock-uuid-12345')
      expect(Application.getAndroidId).toHaveBeenCalled()
    })

    it('should return Android ID when available', async () => {
      ;(Application.getAndroidId as jest.Mock).mockReturnValue('android-device-id-123')

      const result = await getUniqueDeviceId()

      expect(result).toBe('android-device-id-123')
      expect(Application.getAndroidId).toHaveBeenCalled()
    })
  })

  describe('iOS platform (lines 23)', () => {
    beforeEach(() => {
      ;(Platform as { OS: 'android' | 'ios' | 'web' | 'unknown' }).OS = 'ios'
    })

    it('should return UUID when getIosIdForVendorAsync returns null', async () => {
      ;(Application.getIosIdForVendorAsync as jest.Mock).mockResolvedValue(null)

      const result = await getUniqueDeviceId()

      expect(result).toBe('mock-uuid-12345')
      expect(Application.getIosIdForVendorAsync).toHaveBeenCalled()
    })

    it('should return iOS ID when available', async () => {
      ;(Application.getIosIdForVendorAsync as jest.Mock).mockResolvedValue('ios-vendor-id-123')

      const result = await getUniqueDeviceId()

      expect(result).toBe('ios-vendor-id-123')
      expect(Application.getIosIdForVendorAsync).toHaveBeenCalled()
    })
  })

  describe('Web platform (lines 27-44)', () => {
    beforeEach(() => {
      ;(Platform as { OS: 'android' | 'ios' | 'web' | 'unknown' }).OS = 'web'
    })

    it('should create new web ID when none exists', async () => {
      ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null)
      ;(SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined)

      const result = await getUniqueDeviceId()

      expect(result).toBe('mock-uuid-12345')
      expect(SecureStore.getItemAsync).toHaveBeenCalledWith('web_device_id')
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('web_device_id', 'mock-uuid-12345')
    })

    it('should return existing web ID when available', async () => {
      ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue('existing-web-id-123')

      const result = await getUniqueDeviceId()

      expect(result).toBe('existing-web-id-123')
      expect(SecureStore.getItemAsync).toHaveBeenCalledWith('web_device_id')
      expect(SecureStore.setItemAsync).not.toHaveBeenCalled()
    })

    it('should handle SecureStore setItem failure (lines 34-37)', async () => {
      ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null)
      ;(SecureStore.setItemAsync as jest.Mock).mockRejectedValue(new Error('Storage failed'))

      const result = await getUniqueDeviceId()

      expect(result).toBe('mock-uuid-12345')
      expect(mockConsoleWarn).toHaveBeenCalledWith('Failed to store web device ID:', expect.any(Error))
    })

    it('should handle SecureStore access failure (lines 41-43)', async () => {
      ;(SecureStore.getItemAsync as jest.Mock).mockRejectedValue(new Error('SecureStore failed'))

      const result = await getUniqueDeviceId()

      expect(result).toBe('mock-uuid-12345')
      expect(mockConsoleWarn).toHaveBeenCalledWith('SecureStore access failed, using fallback UUID:', expect.any(Error))
    })
  })

  describe('Error handling (lines 45-47)', () => {
    it('should handle general platform errors', async () => {
      ;(Platform as { OS: 'android' | 'ios' | 'web' | 'unknown' }).OS = 'android'
      ;(Application.getAndroidId as jest.Mock).mockImplementation(() => {
        throw new Error('Platform API failed')
      })

      const result = await getUniqueDeviceId()

      expect(result).toBe('mock-uuid-12345')
      expect(mockConsoleWarn).toHaveBeenCalledWith('Device ID retrieval failed, using fallback UUID:', expect.any(Error))
    })

    it('should handle unknown platforms', async () => {
      ;(Platform as { OS: 'android' | 'ios' | 'web' | 'unknown' }).OS = 'unknown'

      const result = await getUniqueDeviceId()

      expect(result).toBe('mock-uuid-12345')
      expect(SecureStore.getItemAsync).toHaveBeenCalledWith('web_device_id')
    })
  })
})
