import { PushReceipt } from '@superpool/types'
import { Firestore } from 'firebase-admin/firestore'
import { mockLogger } from '../__tests__/setup'
import { collectReceipts, RECEIPT_DELAY_MS, RECEIPT_EXPIRY_MS, recordTickets } from './pushReceipts'

const NOW = 1_800_000_000_000
const TOKEN = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]'
const OTHER_TOKEN = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]'
const WALLET = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc'

function row(overrides: Partial<PushReceipt> = {}): PushReceipt {
  return {
    ticketId: 'ticket-1',
    token: TOKEN,
    walletAddress: WALLET.toLowerCase(),
    kind: 'loan_requested',
    // Old enough to be asked about, by a minute.
    createdAt: NOW - RECEIPT_DELAY_MS - 60_000,
    ...overrides,
  }
}

/** What Expo's `getReceipts` replies with: a map keyed by ticket id. */
function receiptsReply(data: Record<string, object>) {
  return { ok: true, status: 200, json: async () => ({ data }), text: async () => '' }
}

function buildFirestore(rows: PushReceipt[]) {
  const receiptDeletes: string[] = []
  const tokenDeletes: string[] = []
  const batchSets: PushReceipt[] = []
  const mockCommit = jest.fn().mockResolvedValue(undefined)

  const receiptsCollection = {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ empty: rows.length === 0, docs: rows.map((data) => ({ data: () => data })) }),
    doc: jest.fn().mockImplementation((id: string) => ({
      delete: jest.fn().mockImplementation(async () => {
        receiptDeletes.push(id)
      }),
    })),
  }

  const tokensCollection = {
    doc: jest.fn().mockImplementation((id: string) => ({
      get: jest.fn().mockResolvedValue({ exists: true }),
      delete: jest.fn().mockImplementation(async () => {
        tokenDeletes.push(id)
      }),
    })),
  }

  const firestore = {
    collection: jest.fn().mockImplementation((name: string) => (name === 'push_receipts' ? receiptsCollection : tokensCollection)),
    batch: jest.fn().mockReturnValue({
      set: jest.fn().mockImplementation((_ref: unknown, data: PushReceipt) => batchSets.push(data)),
      commit: mockCommit,
    }),
  } as unknown as Firestore

  return { firestore, receiptsCollection, receiptDeletes, tokenDeletes, batchSets, mockCommit }
}

let fetchSpy: jest.SpyInstance

beforeEach(() => {
  jest.clearAllMocks()
  fetchSpy = jest.spyOn(global, 'fetch')
})

afterEach(() => {
  fetchSpy.mockRestore()
})

describe('recordTickets', () => {
  it('queues one row per accepted ticket, carrying the token it went to', async () => {
    // The ticket→token pairing exists only in the send loop: Expo's tickets
    // carry no token, and nothing afterwards can rebuild the link. Storing it
    // here is what lets a failed receipt know what to prune.
    const { firestore, batchSets, mockCommit } = buildFirestore([])

    const queued = await recordTickets(
      [
        { ticketId: 'ticket-1', token: TOKEN, kind: 'loan_requested' },
        { ticketId: 'ticket-2', token: OTHER_TOKEN, kind: 'loan_requested' },
      ],
      WALLET,
      firestore
    )

    expect(queued).toBe(2)
    expect(mockCommit).toHaveBeenCalledTimes(1)
    expect(batchSets.map((record) => record.token)).toEqual([TOKEN, OTHER_TOKEN])
    expect(batchSets[0].walletAddress).toBe(WALLET.toLowerCase())
  })

  it('writes nothing when nothing was accepted', async () => {
    const { firestore, mockCommit } = buildFirestore([])

    await expect(recordTickets([], WALLET, firestore)).resolves.toBe(0)
    expect(mockCommit).not.toHaveBeenCalled()
  })

  it('survives a non-Error thrown by the write', async () => {
    const { firestore } = buildFirestore([])
    ;(firestore.batch as jest.Mock).mockReturnValue({ set: jest.fn(), commit: jest.fn().mockRejectedValue('firestore, but as a string') })

    await expect(recordTickets([{ ticketId: 'ticket-1', token: TOKEN, kind: 'loan_requested' }], WALLET, firestore)).resolves.toBe(0)
  })

  it('swallows a write failure rather than failing the send', async () => {
    // The send already happened. Reporting it as failed would release the
    // `notifyOnce` claim and deliver the same message a second time — a worse
    // outcome than losing the ability to check on it.
    const { firestore } = buildFirestore([])
    ;(firestore.batch as jest.Mock).mockReturnValue({
      set: jest.fn(),
      commit: jest.fn().mockRejectedValue(new Error('firestore unavailable')),
    })

    await expect(recordTickets([{ ticketId: 'ticket-1', token: TOKEN, kind: 'loan_requested' }], WALLET, firestore)).resolves.toBe(0)
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Could not queue push receipts'), expect.anything())
  })
})

describe('collectReceipts', () => {
  it('asks about nothing when the queue is empty', async () => {
    const { firestore } = buildFirestore([])

    await expect(collectReceipts(firestore, NOW)).resolves.toEqual({ checked: 0, pruned: 0, failed: 0, expired: 0, pending: 0 })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('leaves a ticket alone until it is old enough to have an answer', async () => {
    // Asking sooner mostly returns "no receipt yet", which costs a request and
    // answers nothing.
    const { firestore, receiptsCollection } = buildFirestore([])

    await collectReceipts(firestore, NOW)

    expect(receiptsCollection.where).toHaveBeenCalledWith('createdAt', '<=', NOW - RECEIPT_DELAY_MS)
  })

  it('drops a row Expo confirmed as delivered', async () => {
    const { firestore, receiptDeletes, tokenDeletes } = buildFirestore([row()])
    fetchSpy.mockResolvedValue(receiptsReply({ 'ticket-1': { status: 'ok' } }))

    const result = await collectReceipts(firestore, NOW)

    expect(result).toMatchObject({ checked: 1, pruned: 0, failed: 0 })
    expect(receiptDeletes).toEqual(['ticket-1'])
    expect(tokenDeletes).toEqual([])
  })

  it('prunes the token behind a DeviceNotRegistered receipt', async () => {
    /*
      The whole reason this service exists.

      `DeviceNotRegistered` is written into the *receipt* rather than the
      ticket, because at ticket time Expo has not yet spoken to Apple or
      Google. Reading tickets alone — which is all the send path can do —
      catches a small fraction of dead tokens and POSTs to the rest for ever.
    */
    const { firestore, receiptDeletes, tokenDeletes } = buildFirestore([row()])
    fetchSpy.mockResolvedValue(receiptsReply({ 'ticket-1': { status: 'error', details: { error: 'DeviceNotRegistered' } } }))

    const result = await collectReceipts(firestore, NOW)

    expect(result).toMatchObject({ checked: 1, pruned: 1, failed: 0 })
    expect(tokenDeletes).toEqual([TOKEN])
    expect(receiptDeletes).toEqual(['ticket-1'])
  })

  it.each([['MismatchSenderId'], ['InvalidCredentials'], ['MessageTooBig'], ['MessageRateExceeded']])(
    'never prunes a token on %s',
    async (error) => {
      /*
        The trap.

        `MismatchSenderId` and `InvalidCredentials` are faults in the project's
        own FCM or APNs setup: they arrive on *every* message at once, so
        pruning on them would empty `push_tokens` — every device, every wallet —
        because somebody uploaded the wrong key. The other two are faults in
        what was sent. None of the four says anything about the recipient.
      */
      const { firestore, tokenDeletes, receiptDeletes } = buildFirestore([row()])
      fetchSpy.mockResolvedValue(receiptsReply({ 'ticket-1': { status: 'error', details: { error } } }))

      const result = await collectReceipts(firestore, NOW)

      expect(result).toMatchObject({ checked: 1, pruned: 0, failed: 1 })
      expect(tokenDeletes).toEqual([])
      // Still dropped from the queue: the question was answered, and asking
      // again would get the same answer for ever.
      expect(receiptDeletes).toEqual(['ticket-1'])
      expect(mockLogger.error).toHaveBeenCalledWith('Push delivery failed', expect.objectContaining({ error }))
    }
  )

  it('keeps a row Expo has no receipt for yet', async () => {
    // Expo produces receipts on its own schedule. An id it does not know about
    // is normal, not an error.
    const { firestore, receiptDeletes } = buildFirestore([row()])
    fetchSpy.mockResolvedValue(receiptsReply({}))

    const result = await collectReceipts(firestore, NOW)

    expect(result).toMatchObject({ checked: 0, pending: 1, expired: 0 })
    expect(receiptDeletes).toEqual([])
  })

  it('gives up on a ticket Expo has already discarded', async () => {
    // Receipts live about 24 hours. Past that nobody will ever answer, and the
    // row is only a source of future requests.
    const { firestore, receiptDeletes, tokenDeletes } = buildFirestore([row({ createdAt: NOW - RECEIPT_EXPIRY_MS - 1000 })])
    fetchSpy.mockResolvedValue(receiptsReply({}))

    const result = await collectReceipts(firestore, NOW)

    expect(result).toMatchObject({ expired: 1, pending: 0 })
    expect(receiptDeletes).toEqual(['ticket-1'])
    // Expiry says nothing about the device — only that Expo stopped answering.
    expect(tokenDeletes).toEqual([])
  })

  it('leaves the whole queue in place when Expo is unreachable', async () => {
    // The next run asks again, which is exactly right. Throwing here would
    // abandon every batch after this one too.
    const { firestore, receiptDeletes } = buildFirestore([row()])
    fetchSpy.mockRejectedValue(new Error('network down'))

    const result = await collectReceipts(firestore, NOW)

    expect(result).toMatchObject({ checked: 0, pending: 1 })
    expect(receiptDeletes).toEqual([])
  })

  it('leaves the queue in place when Expo answers with an error', async () => {
    const { firestore, receiptDeletes } = buildFirestore([row()])
    fetchSpy.mockResolvedValue({ ok: false, status: 503, json: async () => ({}), text: async () => 'unavailable' })

    const result = await collectReceipts(firestore, NOW)

    expect(result).toMatchObject({ checked: 0, pending: 1 })
    expect(receiptDeletes).toEqual([])
  })

  it('leaves the queue in place when Expo rejects the request itself', async () => {
    // A top-level `errors` array rather than a per-ticket verdict: the request
    // was refused, so nothing was learned about any of these tickets.
    const { firestore, receiptDeletes } = buildFirestore([row()])
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ errors: [{ message: 'invalid ids' }] }),
      text: async () => '',
    })

    const result = await collectReceipts(firestore, NOW)

    expect(result).toMatchObject({ checked: 0, pending: 1 })
    expect(receiptDeletes).toEqual([])
    expect(mockLogger.warn).toHaveBeenCalledWith('Expo rejected a receipts request', expect.anything())
  })

  it('finishes the batch when a row cannot be deleted', async () => {
    // The delete is tidying, not the job. A failure there must not abandon the
    // rows after it — the pruning is the part that matters, and it has already
    // happened by then.
    const rows = [row({ ticketId: 'ticket-1' }), row({ ticketId: 'ticket-2', token: OTHER_TOKEN })]
    const { firestore, tokenDeletes } = buildFirestore(rows)
    ;(firestore.collection as jest.Mock).mockImplementation((name: string) => {
      if (name !== 'push_receipts') {
        return {
          doc: jest.fn().mockImplementation((id: string) => ({
            get: jest.fn().mockResolvedValue({ exists: true }),
            delete: jest.fn().mockImplementation(async () => {
              tokenDeletes.push(id)
            }),
          })),
        }
      }

      return {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: false, docs: rows.map((data) => ({ data: () => data })) }),
        doc: jest.fn().mockReturnValue({ delete: jest.fn().mockRejectedValue(new Error('firestore unavailable')) }),
      }
    })

    fetchSpy.mockResolvedValue(
      receiptsReply({
        'ticket-1': { status: 'error', details: { error: 'DeviceNotRegistered' } },
        'ticket-2': { status: 'error', details: { error: 'DeviceNotRegistered' } },
      })
    )

    const result = await collectReceipts(firestore, NOW)

    expect(result).toMatchObject({ checked: 2, pruned: 2 })
    expect(tokenDeletes).toEqual([TOKEN, OTHER_TOKEN])
  })

  it('handles a mixed batch without letting one verdict decide the others', async () => {
    const rows = [
      row({ ticketId: 'ticket-1', token: TOKEN }),
      row({ ticketId: 'ticket-2', token: OTHER_TOKEN }),
      row({ ticketId: 'ticket-3', token: 'ExponentPushToken[cccccccccccccccccccccc]' }),
    ]
    const { firestore, tokenDeletes, receiptDeletes } = buildFirestore(rows)

    fetchSpy.mockResolvedValue(
      receiptsReply({
        'ticket-1': { status: 'ok' },
        'ticket-2': { status: 'error', details: { error: 'DeviceNotRegistered' } },
        // ticket-3 has no receipt yet.
      })
    )

    const result = await collectReceipts(firestore, NOW)

    expect(result).toMatchObject({ checked: 2, pruned: 1, failed: 0, pending: 1 })
    expect(tokenDeletes).toEqual([OTHER_TOKEN])
    expect(receiptDeletes).toEqual(['ticket-1', 'ticket-2'])
  })

  it('defaults to the wall clock when no moment is given', async () => {
    // The parameter exists so a test does not wait fifteen minutes; the
    // scheduled caller passes nothing.
    const { firestore, receiptsCollection } = buildFirestore([])

    await collectReceipts(firestore)

    expect(receiptsCollection.where).toHaveBeenCalledWith('createdAt', '<=', expect.any(Number))
  })

  it('treats a reply with no data as no receipts yet', async () => {
    const { firestore, receiptDeletes } = buildFirestore([row()])
    fetchSpy.mockResolvedValue({ ok: true, status: 200, json: async () => ({}), text: async () => '' })

    await expect(collectReceipts(firestore, NOW)).resolves.toMatchObject({ checked: 0, pending: 1 })
    expect(receiptDeletes).toEqual([])
  })

  it('survives a non-Error thrown by the fetch', async () => {
    const { firestore } = buildFirestore([row()])
    fetchSpy.mockRejectedValue('the network, but as a string')

    await expect(collectReceipts(firestore, NOW)).resolves.toMatchObject({ pending: 1 })
  })

  it('asks oldest first, so a backlog drains in the order it built up', async () => {
    const { firestore, receiptsCollection } = buildFirestore([])

    await collectReceipts(firestore, NOW)

    expect(receiptsCollection.orderBy).toHaveBeenCalledWith('createdAt')
  })

  it('bounds one run, so a backlog is drained over several', async () => {
    const { firestore, receiptsCollection } = buildFirestore([])

    await collectReceipts(firestore, NOW)

    expect(receiptsCollection.limit).toHaveBeenCalledWith(5000)
  })
})
