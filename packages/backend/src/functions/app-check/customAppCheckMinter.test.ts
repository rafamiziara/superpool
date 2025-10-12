import * as express from 'express'
import { Request } from 'firebase-functions/v2/https'
import { mockLogger } from '../../__tests__/setup'

// Mock the DeviceVerificationService
const mockIsDeviceApproved = jest.fn() as jest.MockedFunction<(deviceId: string) => Promise<boolean>>
jest.mock('../../services/deviceVerification', () => ({
  DeviceVerificationService: {
    isDeviceApproved: mockIsDeviceApproved,
  },
}))

// Import mocked services (already mocked in setup.ts)
const { appCheck } = require('../../services')

// Import the handler to test
const { customAppCheckMinterHandler } = require('./customAppCheckMinter')

describe('customAppCheckMinterHandler', () => {
  const TTL_MILLIS = 1000 * 60 * 60 * 24
  const FIREBASE_APP_ID = 'app-id-test'

  // Use a mocked request and response object
  const mockRequest = { method: 'POST', body: {} } as Request
  const mockResponse = {
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  } as Partial<express.Response>

  beforeEach(() => {
    jest.clearAllMocks()

    process.env.APP_ID_FIREBASE = FIREBASE_APP_ID

    // Default to approved device for existing tests
    mockIsDeviceApproved.mockResolvedValue(true)

    // Setup default App Check mock behavior
    appCheck.createToken.mockResolvedValue({
      token: 'default-mock-token',
      ttlMillis: TTL_MILLIS,
    })
  })

  // Test case: Successful token minting (Happy Path)
  it('should successfully mint and return an App Check token', async () => {
    // Arrange
    const testDeviceId = 'device-id-123'
    const expectedToken = {
      token: 'mock-app-check-token',
      ttlMillis: 123456789,
    }

    mockRequest.body = { deviceId: testDeviceId }
    appCheck.createToken.mockResolvedValue(expectedToken)

    // Act
    await customAppCheckMinterHandler(mockRequest, mockResponse as express.Response)

    // Assert
    expect(mockIsDeviceApproved).toHaveBeenCalledWith(testDeviceId)
    expect(appCheck.createToken).toHaveBeenCalledWith(FIREBASE_APP_ID, { ttlMillis: TTL_MILLIS })
    expect(mockLogger.info).toHaveBeenCalledWith('App Check token minted successfully', { deviceId: testDeviceId })
    expect(mockResponse.status).toHaveBeenCalledWith(200)
    expect(mockResponse.send).toHaveBeenCalledWith({ appCheckToken: expectedToken.token, expireTimeMillis: expectedToken.ttlMillis })
  })

  // Test case: Missing Environment Variable
  it('should return a 500 error if the App ID env variable is not configured', async () => {
    // Arrange
    delete process.env.APP_ID_FIREBASE

    // Act
    await customAppCheckMinterHandler(mockRequest, mockResponse as express.Response)

    // Assert
    expect(mockResponse.status).toHaveBeenCalledWith(500)
    expect(mockResponse.send).toHaveBeenCalledWith('Internal Server Error: Firebase App ID not set.')
    expect(mockLogger.error).toHaveBeenCalledWith('Firebase App ID is not configured.')
  })

  // Test case: Invalid request method
  it('should return a 405 error if the request method is not POST', async () => {
    // Arrange
    const getRequest = {
      ...mockRequest,
      method: 'GET',
    } as Request

    // Act
    await customAppCheckMinterHandler(getRequest, mockResponse as express.Response)

    // Assert
    expect(mockResponse.status).toHaveBeenCalledWith(405)
    expect(mockResponse.send).toHaveBeenCalledWith('Method Not Allowed')
  })

  // Test case: Invalid request (missing deviceId)
  it('should return a 400 error if deviceId is missing from the request body', async () => {
    // Arrange
    mockRequest.body = {}

    // Act
    await customAppCheckMinterHandler(mockRequest, mockResponse as express.Response)

    // Assert
    expect(mockResponse.status).toHaveBeenCalledWith(400)
    expect(mockResponse.send).toHaveBeenCalledWith('Bad Request: deviceId is required and must be a string.')
  })

  // Test case: Error during token minting
  it('should return a 500 error if token creation fails', async () => {
    // Arrange
    mockRequest.body = { deviceId: 'test-device' }
    appCheck.createToken.mockRejectedValue(new Error('Admin SDK error'))

    // Act
    await customAppCheckMinterHandler(mockRequest, mockResponse as express.Response)

    // Assert
    expect(mockResponse.status).toHaveBeenCalledWith(500)
    expect(mockResponse.send).toHaveBeenCalledWith('Internal Server Error: Failed to mint App Check token')
    expect(appCheck.createToken).toHaveBeenCalledTimes(1)
  })

  // Test case: Device not approved (Security)
  it('should return a 403 error if device is not approved', async () => {
    // Arrange
    const testDeviceId = 'unapproved-device-123'
    mockRequest.body = { deviceId: testDeviceId }
    mockIsDeviceApproved.mockResolvedValue(false)

    // Act
    await customAppCheckMinterHandler(mockRequest, mockResponse as express.Response)

    // Assert
    expect(mockIsDeviceApproved).toHaveBeenCalledWith(testDeviceId)
    expect(mockLogger.warn).toHaveBeenCalledWith('App Check token requested for unapproved device', { deviceId: testDeviceId })
    expect(mockResponse.status).toHaveBeenCalledWith(403)
    expect(mockResponse.send).toHaveBeenCalledWith('Forbidden: Device not approved. Please authenticate with your wallet first.')
    expect(appCheck.createToken).not.toHaveBeenCalled()
  })

  // Test case: Device verification throws error
  it('should return a 403 error if device verification fails', async () => {
    // Arrange
    const testDeviceId = 'error-device-123'
    mockRequest.body = { deviceId: testDeviceId }
    mockIsDeviceApproved.mockRejectedValue(new Error('Verification service error'))

    // Act
    await customAppCheckMinterHandler(mockRequest, mockResponse as express.Response)

    // Assert
    expect(mockIsDeviceApproved).toHaveBeenCalledWith(testDeviceId)
    expect(mockLogger.error).toHaveBeenCalledWith('Device verification failed', { error: expect.any(Error), deviceId: testDeviceId })
    expect(mockResponse.status).toHaveBeenCalledWith(403)
    expect(mockResponse.send).toHaveBeenCalledWith('Forbidden: Device not approved. Please authenticate with your wallet first.')
    expect(appCheck.createToken).not.toHaveBeenCalled()
  })
})
