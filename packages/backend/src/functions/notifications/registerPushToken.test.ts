jest.mock('../../services')
jest.mock('../../services/pushTokens', () => ({
  ...jest.requireActual('../../services/pushTokens'),
  savePushToken: jest.fn(),
  deletePushToken: jest.fn(),
}))

const { registerPushTokenHandler } = require('./registerPushToken')
const { unregisterPushTokenHandler } = require('./unregisterPushToken')
const { savePushToken, deletePushToken } = require('../../services/pushTokens')

const TOKEN = 'ExponentPushToken[abcdefghijklmnop]'
const WALLET = '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc'

function buildRequest(overrides: Partial<{ auth: object | null; data: Record<string, unknown> }> = {}) {
  return {
    auth: overrides.auth !== undefined ? overrides.auth : { uid: WALLET, token: {} },
    data: overrides.data !== undefined ? overrides.data : { token: TOKEN, deviceId: 'device-1', platform: 'ios' },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  savePushToken.mockResolvedValue(true)
  deletePushToken.mockResolvedValue(true)
})

describe('registerPushToken', () => {
  it('stores the token and reports the write', async () => {
    await expect(registerPushTokenHandler(buildRequest())).resolves.toEqual({ stored: true })
  })

  // The wallet comes from `request.auth.uid`, which the auth function sets to
  // the address itself. Taking it from the body would let a caller register a
  // token against somebody else's wallet and receive their notifications.
  it('takes the wallet from the caller’s identity, never from the request', async () => {
    const victim = '0x0000000000000000000000000000000000000042'

    await registerPushTokenHandler(buildRequest({ data: { token: TOKEN, deviceId: 'device-1', platform: 'ios', walletAddress: victim } }))

    expect(savePushToken).toHaveBeenCalledWith(TOKEN, WALLET, 'device-1', 'ios', expect.anything())
  })

  it('reports no write when the record already said this', async () => {
    savePushToken.mockResolvedValue(false)

    await expect(registerPushTokenHandler(buildRequest())).resolves.toEqual({ stored: false })
  })

  it('refuses an unauthenticated caller', async () => {
    await expect(registerPushTokenHandler(buildRequest({ auth: null }))).rejects.toMatchObject({ code: 'unauthenticated' })
    expect(savePushToken).not.toHaveBeenCalled()
  })

  // The token becomes a document id, so a malformed one is not merely useless.
  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['not an Expo token', 'fcm-token'],
    ['containing a path separator', 'ExponentPushToken[a/b]'],
  ])('refuses a token that is %s', async (_label, token) => {
    await expect(registerPushTokenHandler(buildRequest({ data: { token, deviceId: 'device-1', platform: 'ios' } }))).rejects.toMatchObject({
      code: 'invalid-argument',
    })
    expect(savePushToken).not.toHaveBeenCalled()
  })

  it('refuses a request with no device id', async () => {
    await expect(registerPushTokenHandler(buildRequest({ data: { token: TOKEN, platform: 'ios' } }))).rejects.toMatchObject({
      code: 'invalid-argument',
    })
  })

  it('refuses an unknown platform', async () => {
    await expect(
      registerPushTokenHandler(buildRequest({ data: { token: TOKEN, deviceId: 'device-1', platform: 'windows' } }))
    ).rejects.toMatchObject({ code: 'invalid-argument' })
  })

  it('reports a storage failure as internal rather than leaking it', async () => {
    savePushToken.mockRejectedValue(new Error('firestore exploded'))

    await expect(registerPushTokenHandler(buildRequest())).rejects.toMatchObject({ code: 'internal' })
  })

  // A callable can be invoked with no payload at all; destructuring it must not
  // be the thing that throws.
  it('refuses a request with no data rather than crashing on it', async () => {
    await expect(registerPushTokenHandler({ ...buildRequest(), data: undefined })).rejects.toMatchObject({ code: 'invalid-argument' })
  })
})

describe('unregisterPushToken', () => {
  it('removes the token', async () => {
    await expect(unregisterPushTokenHandler(buildRequest({ data: { token: TOKEN } }))).resolves.toEqual({ removed: true })
    expect(deletePushToken).toHaveBeenCalledWith(TOKEN, expect.anything())
  })

  it('reports nothing removed when there was nothing registered', async () => {
    deletePushToken.mockResolvedValue(false)

    await expect(unregisterPushTokenHandler(buildRequest({ data: { token: TOKEN } }))).resolves.toEqual({ removed: false })
  })

  it('refuses an unauthenticated caller', async () => {
    await expect(unregisterPushTokenHandler(buildRequest({ auth: null, data: { token: TOKEN } }))).rejects.toMatchObject({
      code: 'unauthenticated',
    })
    expect(deletePushToken).not.toHaveBeenCalled()
  })

  it('refuses a malformed token', async () => {
    await expect(unregisterPushTokenHandler(buildRequest({ data: { token: '../../pools/1' } }))).rejects.toMatchObject({
      code: 'invalid-argument',
    })
  })

  it('refuses a request with no data rather than crashing on it', async () => {
    await expect(unregisterPushTokenHandler({ ...buildRequest(), data: undefined })).rejects.toMatchObject({ code: 'invalid-argument' })
  })

  it('reports a delete failure as internal rather than leaking it', async () => {
    deletePushToken.mockRejectedValue(new Error('firestore exploded'))

    await expect(unregisterPushTokenHandler(buildRequest({ data: { token: TOKEN } }))).rejects.toMatchObject({ code: 'internal' })
  })
})
