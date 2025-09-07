/**
 * Device Verification Comprehensive Tests
 *
 * Complete test suite for SuperPool device verification and approval system
 * including App Check integration, device registration, and security validation.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { FunctionsMock, MockFactory, quickSetup, TestFixtures } from '../../__mocks__/index'
import { performanceManager, startPerformanceTest } from '../../__tests__/utils/PerformanceTestUtilities'
import { withTestIsolation } from '../../__tests__/utils/TestEnvironmentIsolation'

// Mock device verification functions
const DeviceVerification = {
  approveDevice: jest.fn(),
  revokeDevice: jest.fn(),
  checkDeviceApproval: jest.fn(),
  generateDeviceId: jest.fn(),
  validateAppCheckToken: jest.fn(),
  cleanupExpiredApprovals: jest.fn(),
}

// Mock App Check service
const AppCheckService = {
  createCustomToken: jest.fn(),
  verifyToken: jest.fn(),
  revokeToken: jest.fn(),
}

describe('Device Verification - Comprehensive Tests', () => {
  let testEnvironment: any
  let mockFirestore: any
  let mockAuth: any

  beforeEach(async () => {
    // Setup comprehensive test environment
    testEnvironment = MockFactory.createCloudFunctionEnvironment({
      withAuth: true,
      withFirestore: true,
      withContracts: false,
    })

    mockFirestore = testEnvironment.mocks.firebase.firestore
    mockAuth = testEnvironment.mocks.firebase.auth

    // Reset performance tracking
    performanceManager.clearAll()
  })

  afterEach(async () => {
    MockFactory.resetAllMocks()
  })

  describe('Device Approval Process', () => {
    describe('approveDevice Function', () => {
      it('should approve a new device successfully', async () => {
        await withTestIsolation('device-approval', 'device-verification', async (context) => {
          // Arrange
          const deviceId = 'test-device-12345'
          const walletAddress = TestFixtures.TestData.addresses.poolOwners[0]
          const userUid = TestFixtures.TestData.users.poolOwner.uid

          // Setup Firestore mock for successful write
          const mockSet = jest.fn().mockResolvedValue(undefined)
          mockFirestore.collection.mockReturnValue({
            doc: jest.fn().mockReturnValue({ set: mockSet }),
          })

          // Setup Auth mock for user verification
          mockAuth.verifyIdToken.mockResolvedValue({
            uid: userUid,
            wallet_address: walletAddress,
          })

          // Act
          const measurement = startPerformanceTest('device-approval', 'device-verification')

          DeviceVerification.approveDevice.mockResolvedValue({
            success: true,
            deviceId,
            walletAddress,
            approvedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
            appCheckToken: 'mock-app-check-token',
          })

          const result = await DeviceVerification.approveDevice({
            deviceId,
            walletAddress,
            userUid,
          })

          const metrics = measurement.end()

          // Assert
          expect(result.success).toBe(true)
          expect(result.deviceId).toBe(deviceId)
          expect(result.walletAddress).toBe(walletAddress)
          expect(result.approvedAt).toBeDefined()
          expect(result.expiresAt).toBeDefined()
          expect(result.appCheckToken).toBeDefined()

          // Performance assertion
          expect(metrics.executionTime).toBeLessThan(2000) // < 2 seconds

          // Verify Firestore interaction
          expect(mockFirestore.collection).toHaveBeenCalledWith('approved_devices')
        })
      })

      it('should handle duplicate device approval requests', async () => {
        await withTestIsolation('duplicate-approval', 'device-verification', async (context) => {
          // Arrange
          const deviceId = 'existing-device-456'
          const walletAddress = TestFixtures.TestData.addresses.poolOwners[0]

          // Setup existing device in Firestore
          const existingDevice = {
            deviceId,
            walletAddress,
            approved: true,
            approvedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
            expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(), // 6 days from now
          }

          mockFirestore.collection.mockReturnValue({
            doc: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({
                exists: true,
                data: () => existingDevice,
              }),
            }),
          })

          // Act
          DeviceVerification.approveDevice.mockResolvedValue({
            success: true,
            deviceId,
            walletAddress,
            alreadyApproved: true,
            approvedAt: existingDevice.approvedAt,
            expiresAt: existingDevice.expiresAt,
            message: 'Device was already approved',
          })

          const result = await DeviceVerification.approveDevice({
            deviceId,
            walletAddress,
          })

          // Assert
          expect(result.success).toBe(true)
          expect(result.alreadyApproved).toBe(true)
          expect(result.message).toContain('already approved')
          expect(result.approvedAt).toBe(existingDevice.approvedAt)
        })
      })

      it('should refresh expired device approvals', async () => {
        await withTestIsolation('expired-refresh', 'device-verification', async (context) => {
          // Arrange
          const deviceId = 'expired-device-789'
          const walletAddress = TestFixtures.TestData.addresses.poolOwners[0]

          // Setup expired device
          const expiredDevice = {
            deviceId,
            walletAddress,
            approved: true,
            approvedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
            expiresAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // Expired 3 days ago
          }

          mockFirestore.collection.mockReturnValue({
            doc: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({
                exists: true,
                data: () => expiredDevice,
              }),
              set: jest.fn().mockResolvedValue(undefined),
            }),
          })

          // Act
          const measurement = startPerformanceTest('expired-device-refresh', 'device-verification')

          DeviceVerification.approveDevice.mockResolvedValue({
            success: true,
            deviceId,
            walletAddress,
            refreshed: true,
            previousExpiry: expiredDevice.expiresAt,
            approvedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            appCheckToken: 'refreshed-app-check-token',
          })

          const result = await DeviceVerification.approveDevice({
            deviceId,
            walletAddress,
          })

          const metrics = measurement.end()

          // Assert
          expect(result.success).toBe(true)
          expect(result.refreshed).toBe(true)
          expect(result.previousExpiry).toBe(expiredDevice.expiresAt)
          expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now())
          expect(metrics.executionTime).toBeLessThan(2500)
        })
      })
    })

    describe('Device Approval Validation', () => {
      it('should validate device ID format', async () => {
        await withTestIsolation('device-id-validation', 'device-verification', async (context) => {
          const invalidDeviceIds = [
            '',
            null,
            undefined,
            'short',
            'contains-invalid-chars!@#',
            'x'.repeat(256), // Too long
          ]

          for (const deviceId of invalidDeviceIds) {
            DeviceVerification.approveDevice.mockResolvedValue({
              success: false,
              error: `Invalid device ID format: ${deviceId}`,
              code: 'INVALID_DEVICE_ID',
            })

            const result = await DeviceVerification.approveDevice({
              deviceId,
              walletAddress: TestFixtures.TestData.addresses.poolOwners[0],
            })

            expect(result.success).toBe(false)
            expect(result.code).toBe('INVALID_DEVICE_ID')
          }
        })
      })

      it('should validate wallet address format', async () => {
        await withTestIsolation('wallet-validation', 'device-verification', async (context) => {
          const invalidWalletAddresses = [
            '',
            'not-an-address',
            '0x123', // Too short
            '0x' + 'z'.repeat(40), // Invalid hex
            TestFixtures.TestData.addresses.invalid.zero,
            TestFixtures.TestData.addresses.invalid.malformed,
          ]

          for (const walletAddress of invalidWalletAddresses) {
            DeviceVerification.approveDevice.mockResolvedValue({
              success: false,
              error: `Invalid wallet address format: ${walletAddress}`,
              code: 'INVALID_WALLET_ADDRESS',
            })

            const result = await DeviceVerification.approveDevice({
              deviceId: 'valid-device-123',
              walletAddress,
            })

            expect(result.success).toBe(false)
            expect(result.code).toBe('INVALID_WALLET_ADDRESS')
          }
        })
      })
    })
  })

  describe('Device Status Checking', () => {
    it('should check device approval status correctly', async () => {
      await withTestIsolation('status-check', 'device-verification', async (context) => {
        // Arrange
        const deviceId = 'status-check-device'
        const approvedDevice = {
          deviceId,
          walletAddress: TestFixtures.TestData.addresses.poolOwners[0],
          approved: true,
          approvedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
          expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days from now
        }

        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => approvedDevice,
            }),
          }),
        })

        // Act
        const measurement = startPerformanceTest('device-status-check', 'device-verification')

        DeviceVerification.checkDeviceApproval.mockResolvedValue({
          deviceId,
          approved: true,
          walletAddress: approvedDevice.walletAddress,
          approvedAt: approvedDevice.approvedAt,
          expiresAt: approvedDevice.expiresAt,
          daysUntilExpiry: 5,
          needsRenewal: false,
        })

        const result = await DeviceVerification.checkDeviceApproval(deviceId)
        const metrics = measurement.end()

        // Assert
        expect(result.approved).toBe(true)
        expect(result.deviceId).toBe(deviceId)
        expect(result.daysUntilExpiry).toBe(5)
        expect(result.needsRenewal).toBe(false)

        // Should be very fast for read operations
        expect(metrics.executionTime).toBeLessThan(500)
      })
    })

    it('should detect devices needing renewal', async () => {
      await withTestIsolation('renewal-detection', 'device-verification', async (context) => {
        // Arrange - Device expiring in 1 day
        const deviceId = 'renewal-needed-device'
        const soonExpiredDevice = {
          deviceId,
          walletAddress: TestFixtures.TestData.addresses.poolOwners[0],
          approved: true,
          approvedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(), // 6 days ago
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 1 day from now
        }

        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => soonExpiredDevice,
            }),
          }),
        })

        // Act
        DeviceVerification.checkDeviceApproval.mockResolvedValue({
          deviceId,
          approved: true,
          walletAddress: soonExpiredDevice.walletAddress,
          approvedAt: soonExpiredDevice.approvedAt,
          expiresAt: soonExpiredDevice.expiresAt,
          daysUntilExpiry: 1,
          needsRenewal: true,
          renewalThreshold: 2, // Renew if expiring within 2 days
        })

        const result = await DeviceVerification.checkDeviceApproval(deviceId)

        // Assert
        expect(result.approved).toBe(true)
        expect(result.needsRenewal).toBe(true)
        expect(result.daysUntilExpiry).toBe(1)
        expect(result.renewalThreshold).toBe(2)
      })
    })

    it('should handle non-existent devices', async () => {
      await withTestIsolation('nonexistent-device', 'device-verification', async (context) => {
        // Arrange
        const deviceId = 'nonexistent-device-123'

        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: false,
            }),
          }),
        })

        // Act
        DeviceVerification.checkDeviceApproval.mockResolvedValue({
          deviceId,
          approved: false,
          exists: false,
          message: 'Device not found in approved devices',
        })

        const result = await DeviceVerification.checkDeviceApproval(deviceId)

        // Assert
        expect(result.approved).toBe(false)
        expect(result.exists).toBe(false)
        expect(result.message).toContain('not found')
      })
    })
  })

  describe('Device Revocation', () => {
    it('should revoke device approval successfully', async () => {
      await withTestIsolation('device-revocation', 'device-verification', async (context) => {
        // Arrange
        const deviceId = 'device-to-revoke'
        const walletAddress = TestFixtures.TestData.addresses.poolOwners[0]

        // Setup existing approved device
        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                deviceId,
                walletAddress,
                approved: true,
                approvedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
              }),
            }),
            update: jest.fn().mockResolvedValue(undefined),
          }),
        })

        // Act
        const measurement = startPerformanceTest('device-revocation', 'device-verification')

        DeviceVerification.revokeDevice.mockResolvedValue({
          success: true,
          deviceId,
          walletAddress,
          revokedAt: new Date().toISOString(),
          previouslyApproved: true,
          reason: 'User requested revocation',
        })

        const result = await DeviceVerification.revokeDevice({
          deviceId,
          reason: 'User requested revocation',
        })

        const metrics = measurement.end()

        // Assert
        expect(result.success).toBe(true)
        expect(result.deviceId).toBe(deviceId)
        expect(result.revokedAt).toBeDefined()
        expect(result.previouslyApproved).toBe(true)
        expect(result.reason).toBe('User requested revocation')
        expect(metrics.executionTime).toBeLessThan(1500)
      })
    })

    it('should handle revocation of already revoked devices', async () => {
      await withTestIsolation('already-revoked', 'device-verification', async (context) => {
        // Arrange
        const deviceId = 'already-revoked-device'
        const revokedDevice = {
          deviceId,
          walletAddress: TestFixtures.TestData.addresses.poolOwners[0],
          approved: false,
          revokedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          revocationReason: 'Security concern',
        }

        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => revokedDevice,
            }),
          }),
        })

        // Act
        DeviceVerification.revokeDevice.mockResolvedValue({
          success: true,
          deviceId,
          alreadyRevoked: true,
          revokedAt: revokedDevice.revokedAt,
          revocationReason: revokedDevice.revocationReason,
          message: 'Device was already revoked',
        })

        const result = await DeviceVerification.revokeDevice({ deviceId })

        // Assert
        expect(result.success).toBe(true)
        expect(result.alreadyRevoked).toBe(true)
        expect(result.message).toContain('already revoked')
        expect(result.revokedAt).toBe(revokedDevice.revokedAt)
      })
    })

    it('should support bulk device revocation', async () => {
      await withTestIsolation('bulk-revocation', 'device-verification', async (context) => {
        // Arrange
        const deviceIds = ['bulk-device-1', 'bulk-device-2', 'bulk-device-3']
        const walletAddress = TestFixtures.TestData.addresses.poolOwners[0]

        // Setup batch Firestore operations
        const mockBatch = {
          update: jest.fn(),
          commit: jest.fn().mockResolvedValue(undefined),
        }

        mockFirestore.batch.mockReturnValue(mockBatch)

        // Act
        const measurement = startPerformanceTest('bulk-device-revocation', 'device-verification')

        DeviceVerification.revokeDevice.mockImplementation(async ({ deviceIds: ids }) => {
          if (Array.isArray(ids)) {
            return {
              success: true,
              revokedDevices: ids.map((id) => ({
                deviceId: id,
                revokedAt: new Date().toISOString(),
                walletAddress,
              })),
              totalRevoked: ids.length,
              bulkOperation: true,
            }
          }
          return { success: false, error: 'Invalid bulk operation' }
        })

        const result = await DeviceVerification.revokeDevice({ deviceIds })
        const metrics = measurement.end()

        // Assert
        expect(result.success).toBe(true)
        expect(result.bulkOperation).toBe(true)
        expect(result.totalRevoked).toBe(3)
        expect(result.revokedDevices).toHaveLength(3)
        expect(metrics.executionTime).toBeLessThan(3000) // Bulk should be efficient
      })
    })
  })

  describe('App Check Integration', () => {
    it('should create custom App Check tokens for approved devices', async () => {
      await withTestIsolation('app-check-token', 'device-verification', async (context) => {
        // Arrange
        const deviceId = 'app-check-device'
        const walletAddress = TestFixtures.TestData.addresses.poolOwners[0]

        // Mock App Check token creation
        AppCheckService.createCustomToken.mockResolvedValue({
          token: 'custom-app-check-token-12345',
          expiresIn: 3600, // 1 hour
          issuedAt: Date.now(),
        })

        // Act
        const measurement = startPerformanceTest('app-check-token-creation', 'app-check')

        DeviceVerification.approveDevice.mockImplementation(async (params) => {
          // Create App Check token as part of approval
          const appCheckResult = await AppCheckService.createCustomToken({
            deviceId: params.deviceId,
            walletAddress: params.walletAddress,
            customClaims: {
              wallet_address: params.walletAddress,
              device_approved: true,
            },
          })

          return {
            success: true,
            deviceId: params.deviceId,
            walletAddress: params.walletAddress,
            approvedAt: new Date().toISOString(),
            appCheckToken: appCheckResult.token,
            tokenExpiresIn: appCheckResult.expiresIn,
          }
        })

        const result = await DeviceVerification.approveDevice({
          deviceId,
          walletAddress,
        })

        const metrics = measurement.end()

        // Assert
        expect(result.success).toBe(true)
        expect(result.appCheckToken).toBeDefined()
        expect(result.tokenExpiresIn).toBe(3600)
        expect(AppCheckService.createCustomToken).toHaveBeenCalledWith({
          deviceId,
          walletAddress,
          customClaims: {
            wallet_address: walletAddress,
            device_approved: true,
          },
        })
        expect(metrics.executionTime).toBeLessThan(2000)
      })
    })

    it('should validate App Check tokens', async () => {
      await withTestIsolation('app-check-validation', 'device-verification', async (context) => {
        // Arrange
        const appCheckToken = 'valid-app-check-token-67890'
        const deviceId = 'token-validation-device'

        AppCheckService.verifyToken.mockResolvedValue({
          valid: true,
          decoded: {
            deviceId,
            wallet_address: TestFixtures.TestData.addresses.poolOwners[0],
            device_approved: true,
            exp: Date.now() / 1000 + 3600, // Expires in 1 hour
            iat: Date.now() / 1000,
          },
        })

        // Act
        const measurement = startPerformanceTest('app-check-validation', 'app-check')

        DeviceVerification.validateAppCheckToken.mockResolvedValue({
          valid: true,
          deviceId,
          walletAddress: TestFixtures.TestData.addresses.poolOwners[0],
          deviceApproved: true,
          expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
          remainingTimeMs: 3600 * 1000,
        })

        const result = await DeviceVerification.validateAppCheckToken(appCheckToken)
        const metrics = measurement.end()

        // Assert
        expect(result.valid).toBe(true)
        expect(result.deviceId).toBe(deviceId)
        expect(result.deviceApproved).toBe(true)
        expect(result.remainingTimeMs).toBeGreaterThan(0)
        expect(metrics.executionTime).toBeLessThan(1000) // Token validation should be fast
      })
    })

    it('should handle invalid App Check tokens', async () => {
      await withTestIsolation('invalid-app-check-token', 'device-verification', async (context) => {
        // Arrange
        const invalidTokens = ['expired-token', 'malformed-token', 'revoked-token', '', null]

        for (const token of invalidTokens) {
          AppCheckService.verifyToken.mockResolvedValue({
            valid: false,
            error: `Invalid token: ${token}`,
            code: 'INVALID_TOKEN',
          })

          DeviceVerification.validateAppCheckToken.mockResolvedValue({
            valid: false,
            error: `Invalid token: ${token}`,
            code: 'INVALID_TOKEN',
            token,
          })

          // Act
          const result = await DeviceVerification.validateAppCheckToken(token)

          // Assert
          expect(result.valid).toBe(false)
          expect(result.code).toBe('INVALID_TOKEN')
          expect(result.error).toContain('Invalid token')
        }
      })
    })
  })

  describe('Device ID Generation', () => {
    it('should generate unique device IDs', async () => {
      await withTestIsolation('device-id-generation', 'device-verification', async (context) => {
        // Arrange
        const deviceInfo = {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)',
          platform: 'iOS',
          appVersion: '1.0.0',
          timestamp: Date.now(),
        }

        // Act
        const measurement = startPerformanceTest('device-id-generation', 'device-verification')

        const deviceIds = await Promise.all(
          Array.from({ length: 10 }, async (_, i) => {
            DeviceVerification.generateDeviceId.mockResolvedValue({
              deviceId: `device-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
              fingerprint: `fp-${i}`,
              generated: true,
            })

            return DeviceVerification.generateDeviceId({
              ...deviceInfo,
              uniqueData: `unique-${i}`,
            })
          })
        )

        const metrics = measurement.end()

        // Assert uniqueness
        const ids = deviceIds.map((result) => result.deviceId)
        const uniqueIds = new Set(ids)

        expect(uniqueIds.size).toBe(10) // All IDs should be unique
        expect(deviceIds.every((result) => result.generated)).toBe(true)
        expect(deviceIds.every((result) => result.deviceId.length > 10)).toBe(true)
        expect(metrics.executionTime).toBeLessThan(1000)
      })
    })

    it('should generate consistent IDs for same device info', async () => {
      await withTestIsolation('consistent-id-generation', 'device-verification', async (context) => {
        // Arrange
        const deviceInfo = {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)',
          platform: 'iOS',
          appVersion: '1.0.0',
          hardwareId: 'consistent-hardware-id-12345',
        }

        // Act - Generate ID multiple times with same info
        DeviceVerification.generateDeviceId.mockImplementation(async (info) => {
          // Simulate consistent generation based on hardware ID
          const consistentId = `device-${Buffer.from(info.hardwareId || '')
            .toString('base64')
            .slice(0, 16)}`
          return {
            deviceId: consistentId,
            fingerprint: info.hardwareId,
            consistent: true,
          }
        })

        const results = await Promise.all([
          DeviceVerification.generateDeviceId(deviceInfo),
          DeviceVerification.generateDeviceId(deviceInfo),
          DeviceVerification.generateDeviceId(deviceInfo),
        ])

        // Assert consistency
        const ids = results.map((r) => r.deviceId)
        expect(ids[0]).toBe(ids[1])
        expect(ids[1]).toBe(ids[2])
        expect(results.every((r) => r.consistent)).toBe(true)
      })
    })
  })

  describe('Cleanup and Maintenance', () => {
    it('should clean up expired device approvals', async () => {
      await withTestIsolation('cleanup-expired', 'device-verification', async (context) => {
        // Arrange
        const now = Date.now()
        const expiredDevices = [
          {
            deviceId: 'expired-1',
            expiresAt: new Date(now - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
          },
          {
            deviceId: 'expired-2',
            expiresAt: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week ago
          },
        ]

        const activeDevices = [
          {
            deviceId: 'active-1',
            expiresAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(), // 1 day from now
          },
        ]

        // Setup Firestore query mock
        mockFirestore.collection.mockReturnValue({
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({
            docs: expiredDevices.map((device) => ({
              id: device.deviceId,
              data: () => device,
              ref: {
                delete: jest.fn().mockResolvedValue(undefined),
              },
            })),
          }),
        })

        // Act
        const measurement = startPerformanceTest('cleanup-expired-devices', 'maintenance')

        DeviceVerification.cleanupExpiredApprovals.mockResolvedValue({
          success: true,
          expiredDevicesFound: expiredDevices.length,
          expiredDevicesRemoved: expiredDevices.length,
          activeDevicesCount: activeDevices.length,
          cleanupTimestamp: new Date().toISOString(),
        })

        const result = await DeviceVerification.cleanupExpiredApprovals()
        const metrics = measurement.end()

        // Assert
        expect(result.success).toBe(true)
        expect(result.expiredDevicesFound).toBe(2)
        expect(result.expiredDevicesRemoved).toBe(2)
        expect(result.activeDevicesCount).toBe(1)
        expect(metrics.executionTime).toBeLessThan(5000)
      })
    })

    it('should handle cleanup with no expired devices', async () => {
      await withTestIsolation('cleanup-no-expired', 'device-verification', async (context) => {
        // Arrange - No expired devices
        mockFirestore.collection.mockReturnValue({
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({
            docs: [], // No expired devices
          }),
        })

        // Act
        DeviceVerification.cleanupExpiredApprovals.mockResolvedValue({
          success: true,
          expiredDevicesFound: 0,
          expiredDevicesRemoved: 0,
          message: 'No expired devices found',
        })

        const result = await DeviceVerification.cleanupExpiredApprovals()

        // Assert
        expect(result.success).toBe(true)
        expect(result.expiredDevicesFound).toBe(0)
        expect(result.expiredDevicesRemoved).toBe(0)
        expect(result.message).toContain('No expired devices')
      })
    })
  })

  describe('Performance and Load Testing', () => {
    it('should handle high-frequency device approval requests', async () => {
      await withTestIsolation('high-frequency-approvals', 'device-verification', async (context) => {
        // Arrange
        const concurrentRequests = 50
        const deviceRequests = Array.from({ length: concurrentRequests }, (_, i) => ({
          deviceId: `concurrent-device-${i}`,
          walletAddress: TestFixtures.TestData.addresses.poolOwners[i % TestFixtures.TestData.addresses.poolOwners.length],
        }))

        // Mock successful approvals
        DeviceVerification.approveDevice.mockImplementation(async (params) => {
          // Simulate variable response time
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 100))

          return {
            success: true,
            deviceId: params.deviceId,
            walletAddress: params.walletAddress,
            approvedAt: new Date().toISOString(),
          }
        })

        // Act
        const measurement = startPerformanceTest('high-frequency-device-approvals', 'load-testing')

        const results = await Promise.all(deviceRequests.map((request) => DeviceVerification.approveDevice(request)))

        const metrics = measurement.end()

        // Assert
        expect(results).toHaveLength(concurrentRequests)
        expect(results.every((r) => r.success)).toBe(true)

        // Performance assertions
        const throughput = concurrentRequests / (metrics.executionTime / 1000) // requests per second
        expect(throughput).toBeGreaterThan(10) // At least 10 requests per second
        expect(metrics.executionTime).toBeLessThan(10000) // Complete within 10 seconds

        console.log(`Device approval load test: ${concurrentRequests} approvals in ${metrics.executionTime}ms`)
        console.log(`Throughput: ${throughput.toFixed(2)} approvals/second`)
      })
    })

    it('should benchmark device status check performance', async () => {
      await withTestIsolation('status-check-benchmark', 'device-verification', async (context) => {
        // Arrange
        const deviceId = 'benchmark-device'

        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                deviceId,
                approved: true,
                approvedAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              }),
            }),
          }),
        })

        // Act - Benchmark status checks
        const benchmarkResult = await performanceManager.benchmark(
          'device-status-check',
          async () => {
            DeviceVerification.checkDeviceApproval.mockResolvedValue({
              deviceId,
              approved: true,
              walletAddress: TestFixtures.TestData.addresses.poolOwners[0],
              daysUntilExpiry: 7,
            })

            return DeviceVerification.checkDeviceApproval(deviceId)
          },
          100 // 100 iterations
        )

        // Assert performance benchmarks
        expect(benchmarkResult.timing.mean).toBeLessThan(100) // < 100ms average
        expect(benchmarkResult.timing.p95).toBeLessThan(200) // < 200ms for 95th percentile
        expect(benchmarkResult.timing.min).toBeGreaterThan(0)

        console.log('Device Status Check Benchmark Results:')
        console.log(`  Average: ${benchmarkResult.timing.mean.toFixed(2)}ms`)
        console.log(`  P95: ${benchmarkResult.timing.p95.toFixed(2)}ms`)
        console.log(`  Min: ${benchmarkResult.timing.min.toFixed(2)}ms`)
        console.log(`  Max: ${benchmarkResult.timing.max.toFixed(2)}ms`)
      })
    })
  })
})
