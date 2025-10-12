import { ApprovedDevice } from '@superpool/types'
import { APPROVED_DEVICES_COLLECTION } from '../constants'
import { mockLogger } from '../__tests__/setup'

// Import mocked services (already mocked in setup.ts)
const { firestore } = require('./index')

// Import the service to test
const { DeviceVerificationService } = require('./deviceVerification')

describe('DeviceVerificationService', () => {
  const deviceId = 'test-device-123'
  const walletAddress = '0x1234567890123456789012345678901234567890'
  const platform: 'android' | 'ios' | 'web' = 'android'
  const mockTimestamp = 1678886400000

  // Mock Date.prototype.getTime
  const originalGetTime = Date.prototype.getTime
  Date.prototype.getTime = () => mockTimestamp

  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterAll(() => {
    Date.prototype.getTime = originalGetTime
  })

  describe('isDeviceApproved', () => {
    // Test Case: Device exists and is approved (Happy Path)
    it('should return true and update lastUsed timestamp when device is approved', async () => {
      // Arrange
      const mockUpdate = jest.fn().mockResolvedValue(undefined)
      const mockDeviceDoc = {
        exists: true,
        ref: {
          update: mockUpdate,
        },
      }

      const mockDoc = jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(mockDeviceDoc),
      })

      const mockCollection = jest.fn().mockReturnValue({
        doc: mockDoc,
      })

      firestore.collection.mockReturnValue(mockCollection())

      // Act
      const result = await DeviceVerificationService.isDeviceApproved(deviceId)

      // Assert
      expect(result).toBe(true)
      expect(firestore.collection).toHaveBeenCalledWith(APPROVED_DEVICES_COLLECTION)
      expect(mockDoc).toHaveBeenCalledWith(deviceId)
      expect(mockUpdate).toHaveBeenCalledWith({ lastUsed: mockTimestamp })
      expect(mockLogger.info).toHaveBeenCalledWith('Device verified successfully', { deviceId })
    })

    // Test Case: Device does not exist
    it('should return false when device is not found in approved devices', async () => {
      // Arrange
      const mockDeviceDoc = {
        exists: false,
      }

      const mockDoc = jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(mockDeviceDoc),
      })

      const mockCollection = jest.fn().mockReturnValue({
        doc: mockDoc,
      })

      firestore.collection.mockReturnValue(mockCollection())

      // Act
      const result = await DeviceVerificationService.isDeviceApproved(deviceId)

      // Assert
      expect(result).toBe(false)
      expect(firestore.collection).toHaveBeenCalledWith(APPROVED_DEVICES_COLLECTION)
      expect(mockDoc).toHaveBeenCalledWith(deviceId)
      expect(mockLogger.info).toHaveBeenCalledWith('Device not found in approved devices', { deviceId })
    })

    // Test Case: Error during verification
    it('should return false and log error when verification fails', async () => {
      // Arrange
      const error = new Error('Firestore read error')
      const mockDoc = jest.fn().mockReturnValue({
        get: jest.fn().mockRejectedValue(error),
      })

      const mockCollection = jest.fn().mockReturnValue({
        doc: mockDoc,
      })

      firestore.collection.mockReturnValue(mockCollection())

      // Act
      const result = await DeviceVerificationService.isDeviceApproved(deviceId)

      // Assert
      expect(result).toBe(false)
      expect(mockLogger.error).toHaveBeenCalledWith('Error verifying device', { error, deviceId })
    })

    // Test Case: Error during lastUsed update (should still return true)
    it('should return false when lastUsed update fails', async () => {
      // Arrange
      const updateError = new Error('Update failed')
      const mockUpdate = jest.fn().mockRejectedValue(updateError)
      const mockDeviceDoc = {
        exists: true,
        ref: {
          update: mockUpdate,
        },
      }

      const mockDoc = jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(mockDeviceDoc),
      })

      const mockCollection = jest.fn().mockReturnValue({
        doc: mockDoc,
      })

      firestore.collection.mockReturnValue(mockCollection())

      // Act
      const result = await DeviceVerificationService.isDeviceApproved(deviceId)

      // Assert
      expect(result).toBe(false)
      expect(mockLogger.error).toHaveBeenCalledWith('Error verifying device', {
        error: updateError,
        deviceId,
      })
    })
  })

  describe('approveDevice', () => {
    // Test Case: Successfully approve device (Happy Path)
    it('should successfully approve a device with android platform', async () => {
      // Arrange
      const mockSet = jest.fn().mockResolvedValue(undefined)
      const mockDoc = jest.fn().mockReturnValue({
        set: mockSet,
      })

      const mockCollection = jest.fn().mockReturnValue({
        doc: mockDoc,
      })

      firestore.collection.mockReturnValue(mockCollection())

      const expectedDevice: ApprovedDevice = {
        deviceId,
        walletAddress,
        approvedAt: mockTimestamp,
        platform: 'android',
        lastUsed: mockTimestamp,
      }

      // Act
      await DeviceVerificationService.approveDevice(deviceId, walletAddress, 'android')

      // Assert
      expect(firestore.collection).toHaveBeenCalledWith(APPROVED_DEVICES_COLLECTION)
      expect(mockDoc).toHaveBeenCalledWith(deviceId)
      expect(mockSet).toHaveBeenCalledWith(expectedDevice)
      expect(mockLogger.info).toHaveBeenCalledWith('Device approved successfully', {
        deviceId,
        walletAddress,
        platform: 'android',
      })
    })

    // Test Case: Approve iOS device
    it('should successfully approve a device with ios platform', async () => {
      // Arrange
      const mockSet = jest.fn().mockResolvedValue(undefined)
      const mockDoc = jest.fn().mockReturnValue({
        set: mockSet,
      })

      const mockCollection = jest.fn().mockReturnValue({
        doc: mockDoc,
      })

      firestore.collection.mockReturnValue(mockCollection())

      const expectedDevice: ApprovedDevice = {
        deviceId,
        walletAddress,
        approvedAt: mockTimestamp,
        platform: 'ios',
        lastUsed: mockTimestamp,
      }

      // Act
      await DeviceVerificationService.approveDevice(deviceId, walletAddress, 'ios')

      // Assert
      expect(mockSet).toHaveBeenCalledWith(expectedDevice)
      expect(mockLogger.info).toHaveBeenCalledWith('Device approved successfully', {
        deviceId,
        walletAddress,
        platform: 'ios',
      })
    })

    // Test Case: Approve web device
    it('should successfully approve a device with web platform', async () => {
      // Arrange
      const mockSet = jest.fn().mockResolvedValue(undefined)
      const mockDoc = jest.fn().mockReturnValue({
        set: mockSet,
      })

      const mockCollection = jest.fn().mockReturnValue({
        doc: mockDoc,
      })

      firestore.collection.mockReturnValue(mockCollection())

      const expectedDevice: ApprovedDevice = {
        deviceId,
        walletAddress,
        approvedAt: mockTimestamp,
        platform: 'web',
        lastUsed: mockTimestamp,
      }

      // Act
      await DeviceVerificationService.approveDevice(deviceId, walletAddress, 'web')

      // Assert
      expect(mockSet).toHaveBeenCalledWith(expectedDevice)
      expect(mockLogger.info).toHaveBeenCalledWith('Device approved successfully', {
        deviceId,
        walletAddress,
        platform: 'web',
      })
    })

    // Test Case: Error during device approval
    it('should throw error and log when device approval fails', async () => {
      // Arrange
      const error = new Error('Firestore write error')
      const mockSet = jest.fn().mockRejectedValue(error)
      const mockDoc = jest.fn().mockReturnValue({
        set: mockSet,
      })

      const mockCollection = jest.fn().mockReturnValue({
        doc: mockDoc,
      })

      firestore.collection.mockReturnValue(mockCollection())

      // Act & Assert
      await expect(DeviceVerificationService.approveDevice(deviceId, walletAddress, platform)).rejects.toThrow('Failed to approve device')
      expect(mockLogger.error).toHaveBeenCalledWith('Error approving device', {
        error,
        deviceId,
        walletAddress,
      })
    })

    // Test Case: Multiple devices for same wallet
    it('should allow approving multiple devices for the same wallet', async () => {
      // Arrange
      const device1 = 'device-1'
      const device2 = 'device-2'
      const mockSet = jest.fn().mockResolvedValue(undefined)
      const mockDoc = jest.fn().mockReturnValue({
        set: mockSet,
      })

      const mockCollection = jest.fn().mockReturnValue({
        doc: mockDoc,
      })

      firestore.collection.mockReturnValue(mockCollection())

      // Act
      await DeviceVerificationService.approveDevice(device1, walletAddress, 'android')
      await DeviceVerificationService.approveDevice(device2, walletAddress, 'ios')

      // Assert
      expect(mockDoc).toHaveBeenCalledWith(device1)
      expect(mockDoc).toHaveBeenCalledWith(device2)
      expect(mockSet).toHaveBeenCalledTimes(2)
    })

    // Test Case: Overwriting existing device approval
    it('should overwrite existing device approval when called again', async () => {
      // Arrange
      const newWalletAddress = '0x9876543210987654321098765432109876543210'
      const mockSet = jest.fn().mockResolvedValue(undefined)
      const mockDoc = jest.fn().mockReturnValue({
        set: mockSet,
      })

      const mockCollection = jest.fn().mockReturnValue({
        doc: mockDoc,
      })

      firestore.collection.mockReturnValue(mockCollection())

      // Act - First approval
      await DeviceVerificationService.approveDevice(deviceId, walletAddress, 'android')

      // Act - Second approval (different wallet)
      await DeviceVerificationService.approveDevice(deviceId, newWalletAddress, 'ios')

      // Assert
      expect(mockSet).toHaveBeenCalledTimes(2)
      const secondCall = mockSet.mock.calls[1][0]
      expect(secondCall.walletAddress).toBe(newWalletAddress)
      expect(secondCall.platform).toBe('ios')
    })
  })
})
