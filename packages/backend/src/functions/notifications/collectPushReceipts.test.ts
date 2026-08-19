import { mockLogger } from '../../__tests__/setup'

jest.mock('../../services/pushReceipts')
jest.mock('../../services')

const { collectPushReceiptsHandler, collectPushReceiptsNowHandler } = require('./collectPushReceipts')
const { collectReceipts } = require('../../services/pushReceipts')

const AUTH = { uid: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc' }
const RESULT = { checked: 4, pruned: 1, failed: 0, expired: 0, pending: 2 }

/** Pass `null` for an anonymous caller — an explicit `undefined` would take the default. */
function buildRequest(auth: object | null = AUTH) {
  return { data: undefined, auth: auth ?? undefined } as never
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.FUNCTIONS_EMULATOR = 'false'
  collectReceipts.mockResolvedValue(RESULT)
})

afterAll(() => {
  delete process.env.FUNCTIONS_EMULATOR
})

describe('collectPushReceiptsHandler', () => {
  it('drains the queue and reports what it did', async () => {
    await expect(collectPushReceiptsHandler()).resolves.toEqual(RESULT)
    expect(collectReceipts).toHaveBeenCalledTimes(1)
  })

  it('is not per chain, unlike the sweep and the reminders', async () => {
    // A push token belongs to a device and a wallet; nothing about it is
    // chain-shaped, so there is no chain argument to get wrong.
    await collectPushReceiptsHandler()

    expect(collectReceipts).toHaveBeenCalledWith(expect.anything())
  })
})

describe('the scheduled function', () => {
  it('swallows a failure rather than letting the run report as crashed', async () => {
    // A schedule that throws is retried by the platform, which would re-ask
    // Expo about the same tickets. There is nothing to retry: the rows stay
    // queued and the next cycle picks them up anyway.
    const { collectPushReceipts } = require('./collectPushReceipts')
    collectReceipts.mockRejectedValue(new Error('firestore exploded'))

    await expect(collectPushReceipts.run(undefined)).resolves.toBeUndefined()
    expect(mockLogger.error).toHaveBeenCalledWith('Scheduled push receipt collection failed', expect.anything())
  })
})

describe('collectPushReceiptsNowHandler', () => {
  it('refuses an anonymous caller outside the emulator', async () => {
    await expect(collectPushReceiptsNowHandler(buildRequest(null))).rejects.toThrow(/must be authenticated/)
    expect(collectReceipts).not.toHaveBeenCalled()
  })

  it('serves an anonymous caller in the emulator', async () => {
    // Schedules never fire in the emulator and there is no signed-in user
    // there, so this is the only way to exercise the pass locally at all. The
    // same rule `sendDueRemindersNow` and `syncPoolEventsNow` follow.
    process.env.FUNCTIONS_EMULATOR = 'true'

    await expect(collectPushReceiptsNowHandler(buildRequest(null))).resolves.toEqual(RESULT)
  })

  it('serves an authenticated caller', async () => {
    await expect(collectPushReceiptsNowHandler(buildRequest())).resolves.toEqual(RESULT)
  })

  it('reports a failure as internal rather than leaking the cause', async () => {
    collectReceipts.mockRejectedValue(new Error('firestore exploded'))

    await expect(collectPushReceiptsNowHandler(buildRequest())).rejects.toThrow(/Failed to collect push receipts/)
    expect(mockLogger.error).toHaveBeenCalledWith('Manual push receipt collection failed', expect.anything())
  })
})
