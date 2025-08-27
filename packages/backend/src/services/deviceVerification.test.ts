import { jest } from '@jest/globals'

// Mock Firebase services
const mockGet = jest.fn() as jest.MockedFunction<() => Promise<any>>
const mockSet = jest.fn() as jest.MockedFunction<(data: any) => Promise<void>>
const mockUpdate = jest.fn() as jest.MockedFunction<(data: any) => Promise<void>>
const mockDelete = jest.fn() as jest.MockedFunction<() => Promise<void>>
const mockCollection = jest.fn() as jest.MockedFunction<(name: string) => any>
const mockDoc = jest.fn() as jest.MockedFunction<(id: string) => any>

mockCollection.mockReturnValue({ doc: mockDoc })
mockDoc.mockReturnValue({
  get: mockGet,
  set: mockSet,
  update: mockUpdate,
  delete: mockDelete,
  ref: { update: mockUpdate },
})

jest.mock('./index', () => ({
  firestore: { collection: mockCollection },
}))

// Mock logger
const mockLoggerInfo = jest.fn()
const mockLoggerError = jest.fn()
const mockLoggerWarn = jest.fn()

jest.mock('firebase-functions/v2', () => ({
  logger: {
    info: mockLoggerInfo,
    error: mockLoggerError,
    warn: mockLoggerWarn,
  },
}))

import { DeviceVerificationService } from './deviceVerification'
import { APPROVED_DEVICES_COLLECTION } from '../constants'
import { ApprovedDevice } from '../types'

describe('DeviceVerificationService', () => {
  const testDeviceId = 'test-device-123'
  const testWalletAddress = '0x1234567890123456789012345678901234567890'
  const testPlatform: 'android' | 'ios' | 'web' = 'android'
  const mockTimestamp = 1678886400000

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(Date.prototype, 'getTime').mockReturnValue(mockTimestamp)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('isDeviceApproved', () => {
    it('should return true for approved device and update lastUsed timestamp', async () => {
      // Arrange
      const mockDocSnapshot = {
        exists: true,
        ref: { update: mockUpdate },
      }
      mockGet.mockResolvedValue(mockDocSnapshot)

      // Act
      const result = await DeviceVerificationService.isDeviceApproved(testDeviceId)

      // Assert
      expect(mockCollection).toHaveBeenCalledWith(APPROVED_DEVICES_COLLECTION)
      expect(mockDoc).toHaveBeenCalledWith(testDeviceId)
      expect(mockUpdate).toHaveBeenCalledWith({ lastUsed: mockTimestamp })
      expect(mockLoggerInfo).toHaveBeenCalledWith('Device verified successfully', { deviceId: testDeviceId })
      expect(result).toBe(true)
    })

    it('should return false for non-approved device', async () => {
      // Arrange
      const mockDocSnapshot = { exists: false }
      mockGet.mockResolvedValue(mockDocSnapshot)

      // Act
      const result = await DeviceVerificationService.isDeviceApproved(testDeviceId)

      // Assert
      expect(mockCollection).toHaveBeenCalledWith(APPROVED_DEVICES_COLLECTION)
      expect(mockDoc).toHaveBeenCalledWith(testDeviceId)
      expect(mockLoggerInfo).toHaveBeenCalledWith('Device not found in approved devices', { deviceId: testDeviceId })
      expect(result).toBe(false)
    })

    it('should return false and log error when verification fails', async () => {
      // Arrange
      const error = new Error('Firestore error')
      mockGet.mockRejectedValue(error)

      // Act
      const result = await DeviceVerificationService.isDeviceApproved(testDeviceId)

      // Assert
      expect(mockLoggerError).toHaveBeenCalledWith('Error verifying device', { error, deviceId: testDeviceId })
      expect(result).toBe(false)
    })
  })

  describe('approveDevice', () => {
    it('should successfully approve a device', async () => {
      // Arrange
      mockSet.mockResolvedValue(undefined)

      const expectedDevice: ApprovedDevice = {
        deviceId: testDeviceId,
        walletAddress: testWalletAddress,
        approvedAt: mockTimestamp,
        platform: testPlatform,
        lastUsed: mockTimestamp,
      }

      // Act
      await DeviceVerificationService.approveDevice(testDeviceId, testWalletAddress, testPlatform)

      // Assert
      expect(mockCollection).toHaveBeenCalledWith(APPROVED_DEVICES_COLLECTION)
      expect(mockDoc).toHaveBeenCalledWith(testDeviceId)
      expect(mockSet).toHaveBeenCalledWith(expectedDevice)
      expect(mockLoggerInfo).toHaveBeenCalledWith('Device approved successfully', {
        deviceId: testDeviceId,
        walletAddress: testWalletAddress,
        platform: testPlatform,
      })
    })

    it('should throw error when device approval fails', async () => {
      // Arrange
      const error = new Error('Firestore error')
      mockSet.mockRejectedValue(error)

      // Act & Assert
      await expect(DeviceVerificationService.approveDevice(testDeviceId, testWalletAddress, testPlatform)).rejects.toThrow(
        'Failed to approve device'
      )

      expect(mockLoggerError).toHaveBeenCalledWith('Error approving device', {
        error,
        deviceId: testDeviceId,
        walletAddress: testWalletAddress,
      })
    })
  })

  describe('getApprovedDevice', () => {
    it('should return device data for approved device', async () => {
      // Arrange
      const deviceData: ApprovedDevice = {
        deviceId: testDeviceId,
        walletAddress: testWalletAddress,
        approvedAt: mockTimestamp,
        platform: testPlatform,
        lastUsed: mockTimestamp,
      }

      const mockDocSnapshot = {
        exists: true,
        data: () => deviceData,
      }
      mockGet.mockResolvedValue(mockDocSnapshot)

      // Act
      const result = await DeviceVerificationService.getApprovedDevice(testDeviceId)

      // Assert
      expect(mockCollection).toHaveBeenCalledWith(APPROVED_DEVICES_COLLECTION)
      expect(mockDoc).toHaveBeenCalledWith(testDeviceId)
      expect(result).toEqual(deviceData)
    })

    it('should return null for non-approved device', async () => {
      // Arrange
      const mockDocSnapshot = { exists: false }
      mockGet.mockResolvedValue(mockDocSnapshot)

      // Act
      const result = await DeviceVerificationService.getApprovedDevice(testDeviceId)

      // Assert
      expect(result).toBeNull()
    })

    it('should return null and log error when retrieval fails', async () => {
      // Arrange
      const error = new Error('Firestore error')
      mockGet.mockRejectedValue(error)

      // Act
      const result = await DeviceVerificationService.getApprovedDevice(testDeviceId)

      // Assert
      expect(mockLoggerError).toHaveBeenCalledWith('Error getting approved device', { error, deviceId: testDeviceId })
      expect(result).toBeNull()
    })
  })

  describe('revokeDeviceApproval', () => {
    it('should successfully revoke device approval', async () => {
      // Arrange
      mockDelete.mockResolvedValue(undefined)

      // Act
      await DeviceVerificationService.revokeDeviceApproval(testDeviceId)

      // Assert
      expect(mockCollection).toHaveBeenCalledWith(APPROVED_DEVICES_COLLECTION)
      expect(mockDoc).toHaveBeenCalledWith(testDeviceId)
      expect(mockDelete).toHaveBeenCalled()
      expect(mockLoggerInfo).toHaveBeenCalledWith('Device approval revoked', { deviceId: testDeviceId })
    })

    it('should throw error when revocation fails', async () => {
      // Arrange
      const error = new Error('Firestore error')
      mockDelete.mockRejectedValue(error)

      // Act & Assert
      await expect(DeviceVerificationService.revokeDeviceApproval(testDeviceId)).rejects.toThrow('Failed to revoke device approval')

      expect(mockLoggerError).toHaveBeenCalledWith('Error revoking device approval', { error, deviceId: testDeviceId })
    })
  })
})
