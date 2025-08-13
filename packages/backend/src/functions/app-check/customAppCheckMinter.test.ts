import { jest } from '@jest/globals'
import * as express from 'express'
import { AppCheckToken } from 'firebase-admin/app-check'
import { Request } from 'firebase-functions/v2/https'

// Mock the sub-path 'firebase-admin/firestore' to contain getFirestore
jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(),
}))

// Mock the sub-path 'firebase-admin/app-check' to return getAppCheck()
type CreateTokenFunction = (appId: string, options?: { appId?: string }) => Promise<AppCheckToken>
const mockCreateToken = jest.fn<CreateTokenFunction>()

const mockAppCheck = { createToken: mockCreateToken }

jest.mock('firebase-admin/app-check', () => ({
  getAppCheck: () => mockAppCheck,
}))

// Mock the root 'firebase-admin' package with all the necessary dependencies
const mockCredential = {
  getAccessToken: jest.fn(() => ({
    accessToken: 'mock-access-token',
    expirationTime: 123456789,
  })),
}

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: { cert: () => mockCredential },
}))

// Mock the logger to prevent console clutter during tests
const mockLoggerError = jest.fn()
const mockLoggerInfo = jest.fn()

jest.mock('firebase-functions/v2', () => ({
  logger: { error: mockLoggerError, info: mockLoggerInfo },
}))

const { customAppCheckMinterHandler } = require('./customAppCheckMinter')

describe('customAppCheckMinterHandler', () => {
  const TTL_MILLIS = 1000 * 60 * 60 * 24
  const FIREBASE_APP_ID = 'app-id-test'

  // Use a mocked request and response object
  const mockRequest = { method: 'POST' } as Request
  const mockResponse = { status: jest.fn(() => mockResponse), send: jest.fn() } as Partial<express.Response>

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.APP_ID_FIREBASE = FIREBASE_APP_ID
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
    mockCreateToken.mockResolvedValue(expectedToken)

    // Act
    await customAppCheckMinterHandler(mockRequest, mockResponse as express.Response)

    // Assert
    expect(mockCreateToken).toHaveBeenCalledWith(FIREBASE_APP_ID, { ttlMillis: TTL_MILLIS })
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
    mockCreateToken.mockRejectedValue(new Error('Admin SDK error'))

    // Act
    await customAppCheckMinterHandler(mockRequest, mockResponse as express.Response)

    // Assert
    expect(mockResponse.status).toHaveBeenCalledWith(500)
    expect(mockResponse.send).toHaveBeenCalledWith('Internal Server Error: Failed to mint App Check token')
    expect(mockCreateToken).toHaveBeenCalledTimes(1)
  })
})
