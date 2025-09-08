import { jest } from '@jest/globals'
import { firebaseAdminMock } from '../__mocks__'

// Mock logger for firebase-functions/v2
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

// Create a functional mock firestore that actually tracks calls
const createMockFirestore = () => {
  const mockDoc = {
    id: 'test-device-123',
    get: jest.fn<() => Promise<any>>(), // eslint-disable-line @typescript-eslint/no-explicit-any
    set: jest.fn<(data: any) => Promise<void>>(), // eslint-disable-line @typescript-eslint/no-explicit-any
    update: jest.fn<(data: any) => Promise<void>>(), // eslint-disable-line @typescript-eslint/no-explicit-any
    delete: jest.fn<() => Promise<void>>(),
    ref: { update: jest.fn<(data: any) => Promise<void>>() }, // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  const mockCollection = {
    doc: jest.fn<(id: string) => any>().mockReturnValue(mockDoc), // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  return {
    collection: jest.fn<(name: string) => any>().mockReturnValue(mockCollection), // eslint-disable-line @typescript-eslint/no-explicit-any
    mockDoc,
    mockCollection,
  }
}

const mockFirestore = createMockFirestore()

// Mock the services index module with our functional mock
jest.mock('./index', () => ({
  firestore: mockFirestore,
  auth: firebaseAdminMock.auth,
  appCheck: firebaseAdminMock.appCheck,
}))

import { APPROVED_DEVICES_COLLECTION } from '../constants'
import { ApprovedDevice } from '../types'

// Use require to import after mocks are set up
const { DeviceVerificationService } = require('./deviceVerification')

describe('DeviceVerificationService', () => {
  const testDeviceId = 'test-device-123'
  const testWalletAddress = '0x1234567890123456789012345678901234567890'
  const testPlatform: 'android' | 'ios' | 'web' = 'android'
  const mockTimestamp = 1678886400000

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks()

    // Reset our custom firestore mock
    mockFirestore.collection.mockClear()
    mockFirestore.mockDoc.get.mockClear()
    mockFirestore.mockDoc.set.mockClear()
    mockFirestore.mockDoc.update.mockClear()
    mockFirestore.mockDoc.delete.mockClear()
    mockFirestore.mockDoc.ref.update.mockClear()
    mockFirestore.mockCollection.doc.mockClear()

    // Mock Date.getTime for consistent timestamps
    jest.spyOn(Date.prototype, 'getTime').mockReturnValue(mockTimestamp)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('isDeviceApproved', () => {
    it('should return true for approved device and update lastUsed timestamp', async () => {
      // Arrange - configure mock to return an existing document
      const mockDocSnapshot = {
        exists: true,
        ref: { update: mockFirestore.mockDoc.ref.update },
      }

      mockFirestore.mockDoc.get.mockResolvedValue(mockDocSnapshot)

      // Act
      const result = await DeviceVerificationService.isDeviceApproved(testDeviceId)

      // Assert
      expect(mockFirestore.collection).toHaveBeenCalledWith(APPROVED_DEVICES_COLLECTION)
      expect(mockFirestore.mockCollection.doc).toHaveBeenCalledWith(testDeviceId)
      expect(mockFirestore.mockDoc.ref.update).toHaveBeenCalledWith({ lastUsed: mockTimestamp })
      expect(mockLoggerInfo).toHaveBeenCalledWith('Device verified successfully', { deviceId: testDeviceId })
      expect(result).toBe(true)
    })

    it('should return false for non-approved device', async () => {
      // Arrange - configure mock to return non-existing document
      const mockDocSnapshot = {
        exists: false,
      }

      mockFirestore.mockDoc.get.mockResolvedValue(mockDocSnapshot)

      // Act
      const result = await DeviceVerificationService.isDeviceApproved(testDeviceId)

      // Assert
      expect(mockFirestore.collection).toHaveBeenCalledWith(APPROVED_DEVICES_COLLECTION)
      expect(mockFirestore.mockCollection.doc).toHaveBeenCalledWith(testDeviceId)
      expect(mockLoggerInfo).toHaveBeenCalledWith('Device not found in approved devices', { deviceId: testDeviceId })
      expect(result).toBe(false)
    })

    it('should return false and log error when verification fails', async () => {
      // Arrange - configure mock to throw error
      const error = new Error('Firestore error')
      mockFirestore.mockDoc.get.mockRejectedValue(error)

      // Act
      const result = await DeviceVerificationService.isDeviceApproved(testDeviceId)

      // Assert
      expect(mockLoggerError).toHaveBeenCalledWith('Error verifying device', {
        error,
        deviceId: testDeviceId,
      })
      expect(result).toBe(false)
    })
  })

  describe('approveDevice', () => {
    it('should successfully approve a device', async () => {
      // Arrange - configure mock for successful set operation
      const expectedDevice: ApprovedDevice = {
        deviceId: testDeviceId,
        walletAddress: testWalletAddress,
        approvedAt: mockTimestamp,
        platform: testPlatform,
        lastUsed: mockTimestamp,
      }

      mockFirestore.mockDoc.set.mockResolvedValue(undefined)

      // Act
      await DeviceVerificationService.approveDevice(testDeviceId, testWalletAddress, testPlatform)

      // Assert
      expect(mockFirestore.collection).toHaveBeenCalledWith(APPROVED_DEVICES_COLLECTION)
      expect(mockFirestore.mockCollection.doc).toHaveBeenCalledWith(testDeviceId)
      expect(mockFirestore.mockDoc.set).toHaveBeenCalledWith(expectedDevice)
      expect(mockLoggerInfo).toHaveBeenCalledWith('Device approved successfully', {
        deviceId: testDeviceId,
        walletAddress: testWalletAddress,
        platform: testPlatform,
      })
    })

    it('should throw error when device approval fails', async () => {
      // Arrange - configure mock to throw error on set
      const error = new Error('Firestore error')
      mockFirestore.mockDoc.set.mockRejectedValue(error)

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
      // Arrange - configure mock to return device data
      const deviceData: ApprovedDevice = {
        deviceId: testDeviceId,
        walletAddress: testWalletAddress,
        approvedAt: mockTimestamp,
        platform: testPlatform,
        lastUsed: mockTimestamp,
      }

      const mockDocSnapshot = {
        exists: true,
        data: jest.fn().mockReturnValue(deviceData),
      }

      mockFirestore.mockDoc.get.mockResolvedValue(mockDocSnapshot)

      // Act
      const result = await DeviceVerificationService.getApprovedDevice(testDeviceId)

      // Assert
      expect(mockFirestore.collection).toHaveBeenCalledWith(APPROVED_DEVICES_COLLECTION)
      expect(mockFirestore.mockCollection.doc).toHaveBeenCalledWith(testDeviceId)
      expect(result).toEqual(deviceData)
    })

    it('should return null for non-approved device', async () => {
      // Arrange - configure mock to return non-existing document
      const mockDocSnapshot = {
        exists: false,
      }

      mockFirestore.mockDoc.get.mockResolvedValue(mockDocSnapshot)

      // Act
      const result = await DeviceVerificationService.getApprovedDevice(testDeviceId)

      // Assert
      expect(result).toBeNull()
    })

    it('should return null and log error when retrieval fails', async () => {
      // Arrange - configure mock to throw error on get
      const error = new Error('Firestore error')
      mockFirestore.mockDoc.get.mockRejectedValue(error)

      // Act
      const result = await DeviceVerificationService.getApprovedDevice(testDeviceId)

      // Assert
      expect(mockLoggerError).toHaveBeenCalledWith('Error getting approved device', {
        error,
        deviceId: testDeviceId,
      })
      expect(result).toBeNull()
    })
  })

  describe('revokeDeviceApproval', () => {
    it('should successfully revoke device approval', async () => {
      // Arrange - configure mock for successful delete operation
      mockFirestore.mockDoc.delete.mockResolvedValue(undefined)

      // Act
      await DeviceVerificationService.revokeDeviceApproval(testDeviceId)

      // Assert
      expect(mockFirestore.collection).toHaveBeenCalledWith(APPROVED_DEVICES_COLLECTION)
      expect(mockFirestore.mockCollection.doc).toHaveBeenCalledWith(testDeviceId)
      expect(mockFirestore.mockDoc.delete).toHaveBeenCalled()
      expect(mockLoggerInfo).toHaveBeenCalledWith('Device approval revoked', { deviceId: testDeviceId })
    })

    it('should throw error when revocation fails', async () => {
      // Arrange - configure mock to throw error on delete
      const error = new Error('Firestore error')
      mockFirestore.mockDoc.delete.mockRejectedValue(error)

      // Act & Assert
      await expect(DeviceVerificationService.revokeDeviceApproval(testDeviceId)).rejects.toThrow('Failed to revoke device approval')

      expect(mockLoggerError).toHaveBeenCalledWith('Error revoking device approval', {
        error,
        deviceId: testDeviceId,
      })
    })
  })
})
