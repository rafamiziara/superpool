import { logger } from 'firebase-functions/v2'
import { APPROVED_DEVICES_COLLECTION } from '../constants'
import { ApprovedDevice } from '../types'
import { firestore } from './index'

/**
 * Service for managing device verification and approval
 */
export class DeviceVerificationService {
  /**
   * Check if a device is approved for App Check token generation
   */
  static async isDeviceApproved(deviceId: string): Promise<boolean> {
    try {
      const deviceDoc = await firestore.collection(APPROVED_DEVICES_COLLECTION).doc(deviceId).get()

      if (!deviceDoc.exists) {
        logger.info('Device not found in approved devices', { deviceId })
        return false
      }

      // Update last used timestamp
      await deviceDoc.ref.update({ lastUsed: new Date().getTime() })

      logger.info('Device verified successfully', { deviceId })
      return true
    } catch (error) {
      logger.error('Error verifying device', { error, deviceId })
      return false
    }
  }

  /**
   * Approve a device for a specific wallet address
   */
  static async approveDevice(deviceId: string, walletAddress: string, platform: 'android' | 'ios' | 'web'): Promise<void> {
    try {
      const approvedDevice: ApprovedDevice = {
        deviceId,
        walletAddress,
        approvedAt: new Date().getTime(),
        platform,
        lastUsed: new Date().getTime(),
      }

      await firestore.collection(APPROVED_DEVICES_COLLECTION).doc(deviceId).set(approvedDevice)

      logger.info('Device approved successfully', { deviceId, walletAddress, platform })
    } catch (error) {
      logger.error('Error approving device', { error, deviceId, walletAddress })
      throw new Error('Failed to approve device')
    }
  }

  /**
   * Get device information if approved
   */
  static async getApprovedDevice(deviceId: string): Promise<ApprovedDevice | null> {
    try {
      const deviceDoc = await firestore.collection(APPROVED_DEVICES_COLLECTION).doc(deviceId).get()

      if (!deviceDoc.exists) {
        return null
      }

      return deviceDoc.data() as ApprovedDevice
    } catch (error) {
      logger.error('Error getting approved device', { error, deviceId })
      return null
    }
  }

  /**
   * Remove device approval (for security/admin purposes)
   */
  static async revokeDeviceApproval(deviceId: string): Promise<void> {
    try {
      await firestore.collection(APPROVED_DEVICES_COLLECTION).doc(deviceId).delete()

      logger.info('Device approval revoked', { deviceId })
    } catch (error) {
      logger.error('Error revoking device approval', { error, deviceId })
      throw new Error('Failed to revoke device approval')
    }
  }
}
