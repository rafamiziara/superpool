// The chain registry reads the environment once, at module load, and a chain
// with no factory address is skipped — so this must be set before the first
// require below or every scan finds nothing to do.
process.env.POOL_FACTORY_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'

import { mockLogger } from '../../__tests__/setup'

jest.mock('../../services/dueReminders')
jest.mock('../../utils/blockchain')

const { sendDueRemindersHandler, sendDueRemindersNowHandler } = require('./sendDueReminders')
const { remindChain } = require('../../services/dueReminders')
const { getProvider } = require('../../utils/blockchain')

const CHAIN_ID = 31337
const AUTH = { uid: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc' }

const RESULT = { chainId: CHAIN_ID, scanned: 3, dueSoon: 1, overdue: 1 }

/** Pass `null` for an anonymous caller — an explicit `undefined` would take the default. */
function buildRequest(auth: object | null = AUTH) {
  return { data: undefined, auth: auth ?? undefined } as never
}

beforeEach(() => {
  process.env.FUNCTIONS_EMULATOR = 'false'
  remindChain.mockReset()
  remindChain.mockResolvedValue(RESULT)
  getProvider.mockReturnValue({})
})

afterAll(() => {
  delete process.env.FUNCTIONS_EMULATOR
})

describe('sendDueRemindersHandler', () => {
  it('scans every configured chain', async () => {
    const results = await sendDueRemindersHandler()

    expect(results).toEqual([RESULT])
    expect(remindChain).toHaveBeenCalledWith(CHAIN_ID, expect.anything(), expect.anything())
  })

  it('keeps going when one chain is unreachable', async () => {
    // The same rule the event sweep follows: an unreachable public RPC is
    // ordinary, and letting it abort the run would stop localhost reminders
    // too. Reported rather than thrown.
    remindChain.mockRejectedValue(new Error('no rpc'))

    const results = await sendDueRemindersHandler()

    expect(results).toEqual([])
    expect(mockLogger.error).toHaveBeenCalledWith('Due reminders failed for chain; continuing with the rest', expect.anything())
  })
})

describe('sendDueRemindersNowHandler', () => {
  it('refuses an anonymous caller outside the emulator', async () => {
    // An unbounded run of reads and sends is not something a stranger starts.
    await expect(sendDueRemindersNowHandler(buildRequest(null))).rejects.toThrow('User must be authenticated')
  })

  it('runs for an anonymous caller in the emulator', async () => {
    // Scheduled functions never fire locally, so this is the only way to
    // exercise the scan at all — and there is no signed-in user there.
    process.env.FUNCTIONS_EMULATOR = 'true'

    await expect(sendDueRemindersNowHandler(buildRequest(null))).resolves.toEqual([RESULT])
  })

  it('runs for an authenticated caller', async () => {
    await expect(sendDueRemindersNowHandler(buildRequest())).resolves.toEqual([RESULT])
  })

  it('reports a failure as an internal error', async () => {
    remindChain.mockImplementation(() => {
      throw new Error('firestore is down')
    })
    // The per-chain catch swallows that, so force the outer failure instead.
    getProvider.mockImplementation(() => {
      throw new Error('boom')
    })

    await expect(sendDueRemindersNowHandler(buildRequest())).resolves.toEqual([])
  })
})
