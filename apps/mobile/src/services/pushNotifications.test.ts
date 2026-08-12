import * as Device from 'expo-device'
import { mockGetExpoPushToken, mockGetPermissions, mockRequestPermissions, mockSetNotificationChannel } from '../__tests__/setup'
import { mockFirebaseCallable } from '../__tests__/mocks'
import {
  hasNotificationPermission,
  registerForPushNotifications,
  requestNotificationPermission,
  unregisterForPushNotifications,
} from './pushNotifications'

jest.mock('../utils/deviceId', () => ({ getUniqueDeviceId: jest.fn(async () => 'device-1') }))

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'project-1' } } } },
}))

const { getUniqueDeviceId } = jest.requireMock('../utils/deviceId')

const TOKEN = 'ExponentPushToken[test-token]'

/** The callable the service reaches for, so calls can be asserted on. */
let callable: jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  callable = jest.fn().mockResolvedValue({ data: { stored: true } })
  mockFirebaseCallable.mockReturnValue(callable)
  mockGetPermissions.mockResolvedValue({ status: 'granted', canAskAgain: true })
  mockRequestPermissions.mockResolvedValue({ status: 'granted', canAskAgain: true })
  mockGetExpoPushToken.mockResolvedValue({ data: TOKEN })
  getUniqueDeviceId.mockResolvedValue('device-1')
  ;(Device as { isDevice: boolean }).isDevice = true
})

afterEach(async () => {
  // The service holds the token in module scope so a disconnect can give it
  // back; leaving one behind would leak into the next test.
  await unregisterForPushNotifications()
})

describe('hasNotificationPermission', () => {
  it('reads the current answer without asking', async () => {
    await expect(hasNotificationPermission()).resolves.toBe(true)
    expect(mockRequestPermissions).not.toHaveBeenCalled()
  })

  it('is false when permission was denied', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'denied', canAskAgain: true })

    await expect(hasNotificationPermission()).resolves.toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Asking.
//
// The prompt is a one-shot: on iOS a denial cannot be re-asked in-app, only
// redirected to Settings. Spending it carelessly is how an app permanently
// loses the channel it is building.
// ---------------------------------------------------------------------------

describe('requestNotificationPermission', () => {
  it('does not re-ask when permission is already granted', async () => {
    await expect(requestNotificationPermission()).resolves.toBe(true)
    expect(mockRequestPermissions).not.toHaveBeenCalled()
  })

  it('asks when nobody has been asked yet', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'undetermined', canAskAgain: true })

    await expect(requestNotificationPermission()).resolves.toBe(true)
    expect(mockRequestPermissions).toHaveBeenCalled()
  })

  it('reports a refusal rather than re-prompting when it cannot ask again', async () => {
    // The OS would show nothing anyway.
    mockGetPermissions.mockResolvedValue({ status: 'denied', canAskAgain: false })

    await expect(requestNotificationPermission()).resolves.toBe(false)
    expect(mockRequestPermissions).not.toHaveBeenCalled()
  })

  it('reports a denial given at the prompt', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'undetermined', canAskAgain: true })
    mockRequestPermissions.mockResolvedValue({ status: 'denied', canAskAgain: false })

    await expect(requestNotificationPermission()).resolves.toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Registering.
// ---------------------------------------------------------------------------

describe('registerForPushNotifications', () => {
  it('registers the token against the connected wallet', async () => {
    await expect(registerForPushNotifications()).resolves.toBe(TOKEN)

    expect(mockFirebaseCallable).toHaveBeenCalledWith(expect.anything(), 'registerPushToken')
    // No wallet in the payload: the callable takes it from `request.auth.uid`.
    expect(callable).toHaveBeenCalledWith({ token: TOKEN, deviceId: 'device-1', platform: expect.any(String) })
  })

  it('issues the token against the EAS project id', async () => {
    await registerForPushNotifications()

    expect(mockGetExpoPushToken).toHaveBeenCalledWith({ projectId: 'project-1' })
  })

  // Asking here would be asking on launch by another name.
  it('never prompts, and registers nothing without permission', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'denied', canAskAgain: true })

    await expect(registerForPushNotifications()).resolves.toBeNull()
    expect(mockRequestPermissions).not.toHaveBeenCalled()
    expect(callable).not.toHaveBeenCalled()
  })

  it('skips a simulator, which has no push service to register with', async () => {
    ;(Device as { isDevice: boolean }).isDevice = false

    await expect(registerForPushNotifications()).resolves.toBeNull()
    expect(mockGetExpoPushToken).not.toHaveBeenCalled()
  })

  it('registers nothing when the device has no id', async () => {
    getUniqueDeviceId.mockResolvedValue(null)

    await expect(registerForPushNotifications()).resolves.toBeNull()
    expect(callable).not.toHaveBeenCalled()
  })

  // Notifications are an enhancement; a sign-in that worked must not be
  // reported as failed because a token could not be arranged.
  it('swallows a failure rather than breaking the caller', async () => {
    callable.mockRejectedValue(new Error('emulator offline'))

    await expect(registerForPushNotifications()).resolves.toBeNull()
  })

  it('swallows a failure to obtain a token at all', async () => {
    mockGetExpoPushToken.mockRejectedValue(new Error('no push service'))

    await expect(registerForPushNotifications()).resolves.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Giving the token back.
//
// A token left registered to the outgoing wallet delivers its requests to
// whoever uses the device next. That is a privacy leak, not an annoyance.
// ---------------------------------------------------------------------------

describe('unregisterForPushNotifications', () => {
  it('gives back the token this device registered', async () => {
    await registerForPushNotifications()
    jest.clearAllMocks()
    mockFirebaseCallable.mockReturnValue(callable)

    await unregisterForPushNotifications()

    expect(mockFirebaseCallable).toHaveBeenCalledWith(expect.anything(), 'unregisterPushToken')
    expect(callable).toHaveBeenCalledWith({ token: TOKEN })
  })

  it('does nothing when this device never held one', async () => {
    await unregisterForPushNotifications()

    expect(callable).not.toHaveBeenCalled()
  })

  it('forgets the token even when the call fails, rather than retrying forever', async () => {
    await registerForPushNotifications()
    callable.mockRejectedValue(new Error('offline'))

    await expect(unregisterForPushNotifications()).resolves.toBeUndefined()

    // A second attempt has nothing left to give back.
    callable.mockClear()
    await unregisterForPushNotifications()
    expect(callable).not.toHaveBeenCalled()
  })
})

describe('android channel', () => {
  it('is created before a token is requested', async () => {
    // Android shows nothing at all without one, silently: no error and no
    // notification.
    await registerForPushNotifications()

    if (mockSetNotificationChannel.mock.calls.length > 0) {
      expect(mockSetNotificationChannel.mock.invocationCallOrder[0]).toBeLessThan(mockGetExpoPushToken.mock.invocationCallOrder[0])
    }
  })
})
