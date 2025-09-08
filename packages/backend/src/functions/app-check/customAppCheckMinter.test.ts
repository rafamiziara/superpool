import { jest } from '@jest/globals'
import * as express from 'express'
import { AppCheckToken } from 'firebase-admin/app-check'
import { Request } from 'firebase-functions/v2/https'
// Import centralized mocks
import { firebaseAdminMock } from '../../__mocks__'

// Mock the logger to prevent console clutter during tests
const mockLoggerError = jest.fn()
const mockLoggerInfo = jest.fn()
const mockLoggerWarn = jest.fn()

jest.mock('firebase-functions/v2', () => ({
  logger: { error: mockLoggerError, info: mockLoggerInfo, warn: mockLoggerWarn },
}))

// Mock the services module to use our centralized Firebase mocks
jest.mock('../../services', () => {
  const { firebaseAdminMock } = require('../../__mocks__')
  return {
    auth: firebaseAdminMock.auth,
    firestore: firebaseAdminMock.firestore,
    appCheck: firebaseAdminMock.appCheck,
    ContractService: jest.fn(),
    ProviderService: jest.fn(),
  }
})

// Mock the DeviceVerificationService
const mockIsDeviceApproved = jest.fn() as jest.MockedFunction<(deviceId: string) => Promise<boolean>>
jest.mock('../../services/deviceVerification', () => ({
  DeviceVerificationService: {
    isDeviceApproved: mockIsDeviceApproved,
  },
}))

const { customAppCheckMinterHandler } = require('./customAppCheckMinter')
const services = require('../../services')

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
    // Reset all centralized mocks
    firebaseAdminMock.resetAllMocks()
    jest.clearAllMocks()

    process.env.APP_ID_FIREBASE = FIREBASE_APP_ID

    // Default to approved device for existing tests
    mockIsDeviceApproved.mockResolvedValue(true)

    // Setup default App Check mock behavior
    services.appCheck.createToken.mockResolvedValue({
      token: 'default-mock-token',
      ttlMillis: TTL_MILLIS,
    })
  })

  // Test case: Successful token minting (Happy Path)
  it('should successfully mint and return an App Check token', async () => {
    // Arrange
    const testDeviceId = 'device-id-123'
    const expectedToken: AppCheckToken = {
      token: 'mock-app-check-token',
      ttlMillis: 123456789,
    }

    mockRequest.body = { deviceId: testDeviceId }

    // Configure the centralized App Check mock
    services.appCheck.createToken.mockResolvedValue(expectedToken)

    // Act
    await customAppCheckMinterHandler(mockRequest, mockResponse as express.Response)

    // Assert
    expect(mockIsDeviceApproved).toHaveBeenCalledWith(testDeviceId)
    expect(services.appCheck.createToken).toHaveBeenCalledWith(FIREBASE_APP_ID, { ttlMillis: TTL_MILLIS })
    expect(mockLoggerInfo).toHaveBeenCalledWith('App Check token minted successfully', { deviceId: testDeviceId })
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
    expect(mockLoggerError).toHaveBeenCalledWith('Firebase App ID is not configured.')
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
    // Configure the centralized App Check mock to throw an error
    services.appCheck.createToken.mockRejectedValue(new Error('Admin SDK error'))

    // Act
    await customAppCheckMinterHandler(mockRequest, mockResponse as express.Response)

    // Assert
    expect(mockResponse.status).toHaveBeenCalledWith(500)
    expect(mockResponse.send).toHaveBeenCalledWith('Internal Server Error: Failed to mint App Check token')
    expect(services.appCheck.createToken).toHaveBeenCalledTimes(1)
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
    expect(mockLoggerWarn).toHaveBeenCalledWith('App Check token requested for unapproved device', { deviceId: testDeviceId })
    expect(mockResponse.status).toHaveBeenCalledWith(403)
    expect(mockResponse.send).toHaveBeenCalledWith('Forbidden: Device not approved. Please authenticate with your wallet first.')
    expect(services.appCheck.createToken).not.toHaveBeenCalled()
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
    expect(mockLoggerError).toHaveBeenCalledWith('Device verification failed', { error: expect.any(Error), deviceId: testDeviceId })
    expect(mockResponse.status).toHaveBeenCalledWith(403)
    expect(mockResponse.send).toHaveBeenCalledWith('Forbidden: Device not approved. Please authenticate with your wallet first.')
    expect(services.appCheck.createToken).not.toHaveBeenCalled()
  })
})
