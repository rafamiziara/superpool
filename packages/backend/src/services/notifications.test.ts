import { NotificationData } from '@superpool/types'
import { Firestore } from 'firebase-admin/firestore'
import { notificationKey, notifyOnce, notifyWallet } from './notifications'

const WALLET = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc'

const DATA: NotificationData = {
  kind: 'loan_requested',
  poolId: '7',
  poolName: 'Builders Guild',
  actor: '0x0000000000000000000000000000000000000042',
}

const NOTIFICATION = { title: 'New loan request', body: 'Someone asked to borrow from Builders Guild.', data: DATA }

/** One ticket per message, in the order they were sent — as Expo replies. */
function expoReply(tickets: object[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: tickets }),
    text: async () => '',
  }
}

function buildFirestore(options: { tokens?: string[]; markerExists?: boolean } = {}) {
  const { tokens = [], markerExists = false } = options

  const mockDelete = jest.fn().mockResolvedValue(undefined)
  const mockCreate = markerExists
    ? jest.fn().mockRejectedValue(new Error('ALREADY_EXISTS: entity already exists'))
    : jest.fn().mockResolvedValue(undefined)

  const mockTokenDelete = jest.fn().mockResolvedValue(undefined)
  const tokenDocRef = {
    get: jest.fn().mockResolvedValue({ exists: true, data: () => ({}) }),
    delete: mockTokenDelete,
  }

  const mockGet = jest.fn().mockResolvedValue({ docs: tokens.map((id) => ({ id })) })
  const mockWhere = jest.fn().mockReturnValue({ get: mockGet })

  const markerDocRef = { create: mockCreate, delete: mockDelete }

  const mockCollection = jest.fn().mockImplementation((name: string) => {
    if (name === 'notifications_sent') return { doc: jest.fn().mockReturnValue(markerDocRef) }

    return { doc: jest.fn().mockReturnValue(tokenDocRef), where: mockWhere }
  })

  return {
    firestore: { collection: mockCollection } as unknown as Firestore,
    mockCreate,
    mockDelete,
    mockTokenDelete,
  }
}

let fetchSpy: jest.SpyInstance

beforeEach(() => {
  fetchSpy = jest.spyOn(global, 'fetch')
})

afterEach(() => {
  fetchSpy.mockRestore()
})

// ---------------------------------------------------------------------------
// Recipients.
// ---------------------------------------------------------------------------

describe('notifyWallet', () => {
  it('sends to every device the wallet has registered', async () => {
    fetchSpy.mockResolvedValue(expoReply([{ status: 'ok' }, { status: 'ok' }]) as never)
    const { firestore } = buildFirestore({ tokens: ['ExponentPushToken[a]', 'ExponentPushToken[b]'] })

    await expect(notifyWallet(WALLET, NOTIFICATION, firestore)).resolves.toMatchObject({ sent: 2, pruned: 0 })

    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string)
    expect(body.map((message: { to: string }) => message.to)).toEqual(['ExponentPushToken[a]', 'ExponentPushToken[b]'])
  })

  it('carries the data block the mobile deep-link switch reads', async () => {
    fetchSpy.mockResolvedValue(expoReply([{ status: 'ok' }]) as never)
    const { firestore } = buildFirestore({ tokens: ['ExponentPushToken[a]'] })

    await notifyWallet(WALLET, NOTIFICATION, firestore)

    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string)
    expect(body[0]).toMatchObject({ title: NOTIFICATION.title, body: NOTIFICATION.body, data: DATA })
  })

  // An owner who has never granted permission simply does not hear about it.
  // That is the common case early on and must not read as an error.
  it('posts nothing for a wallet with no devices', async () => {
    const { firestore } = buildFirestore({ tokens: [] })

    await expect(notifyWallet(WALLET, NOTIFICATION, firestore)).resolves.toEqual({ sent: 0, pruned: 0, noRecipients: true })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  // Without this the service POSTs to a dead device on every future
  // notification, forever.
  it('deletes a token the device no longer answers for', async () => {
    fetchSpy.mockResolvedValue(expoReply([{ status: 'error', details: { error: 'DeviceNotRegistered' } }]) as never)
    const { firestore, mockTokenDelete } = buildFirestore({ tokens: ['ExponentPushToken[a]'] })

    await expect(notifyWallet(WALLET, NOTIFICATION, firestore)).resolves.toMatchObject({ sent: 0, pruned: 1 })
    expect(mockTokenDelete).toHaveBeenCalled()
  })

  it('prunes only the token that failed, not the batch', async () => {
    // Tickets carry no token, so the pruning depends on index correspondence.
    fetchSpy.mockResolvedValue(
      expoReply([{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }, { status: 'ok' }]) as never
    )
    const { firestore, mockTokenDelete } = buildFirestore({
      tokens: ['ExponentPushToken[a]', 'ExponentPushToken[b]', 'ExponentPushToken[c]'],
    })

    await expect(notifyWallet(WALLET, NOTIFICATION, firestore)).resolves.toMatchObject({ sent: 2, pruned: 1 })
    expect(mockTokenDelete).toHaveBeenCalledTimes(1)
  })

  it('keeps a token that failed for some other reason', async () => {
    fetchSpy.mockResolvedValue(expoReply([{ status: 'error', details: { error: 'MessageRateExceeded' } }]) as never)
    const { firestore, mockTokenDelete } = buildFirestore({ tokens: ['ExponentPushToken[a]'] })

    await expect(notifyWallet(WALLET, NOTIFICATION, firestore)).resolves.toMatchObject({ sent: 0, pruned: 0 })
    expect(mockTokenDelete).not.toHaveBeenCalled()
  })

  it('splits a send across requests at Expo’s documented cap', async () => {
    const tokens = Array.from({ length: 150 }, (_, index) => `ExponentPushToken[${index}]`)
    fetchSpy
      .mockResolvedValueOnce(expoReply(Array.from({ length: 100 }, () => ({ status: 'ok' }))) as never)
      .mockResolvedValueOnce(expoReply(Array.from({ length: 50 }, () => ({ status: 'ok' }))) as never)
    const { firestore } = buildFirestore({ tokens })

    await expect(notifyWallet(WALLET, NOTIFICATION, firestore)).resolves.toMatchObject({ sent: 150 })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchSpy.mock.calls[0][1]!.body as string)).toHaveLength(100)
    expect(JSON.parse(fetchSpy.mock.calls[1][1]!.body as string)).toHaveLength(50)
  })

  it('throws when Expo rejects the request outright', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 502, text: async () => 'bad gateway' } as never)
    const { firestore } = buildFirestore({ tokens: ['ExponentPushToken[a]'] })

    await expect(notifyWallet(WALLET, NOTIFICATION, firestore)).rejects.toThrow('502')
  })

  // A 200 carrying an `errors` array rather than tickets. Reading that as "no
  // tickets, nothing sent" would report success for a send that never happened.
  it('throws when Expo answers 200 with errors instead of tickets', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ errors: [{ message: 'Invalid credentials' }] }),
      text: async () => '',
    } as never)
    const { firestore } = buildFirestore({ tokens: ['ExponentPushToken[a]'] })

    await expect(notifyWallet(WALLET, NOTIFICATION, firestore)).rejects.toThrow('Invalid credentials')
  })

  it('survives a reply carrying neither tickets nor errors', async () => {
    fetchSpy.mockResolvedValue({ ok: true, status: 200, json: async () => ({}), text: async () => '' } as never)
    const { firestore } = buildFirestore({ tokens: ['ExponentPushToken[a]'] })

    await expect(notifyWallet(WALLET, NOTIFICATION, firestore)).resolves.toMatchObject({ sent: 0, pruned: 0 })
  })
})

// ---------------------------------------------------------------------------
// Idempotency.
//
// `syncPoolEvents` re-scans block ranges on purpose and a failed scheduled run
// is retried, so re-scanning genesis — a supported operation here — must not
// produce a push per request ever made.
// ---------------------------------------------------------------------------

describe('notifyOnce', () => {
  it('sends the first time', async () => {
    fetchSpy.mockResolvedValue(expoReply([{ status: 'ok' }]) as never)
    const { firestore } = buildFirestore({ tokens: ['ExponentPushToken[a]'] })

    await expect(notifyOnce('key-1', WALLET, NOTIFICATION, firestore)).resolves.toMatchObject({ sent: 1 })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('sends nothing the second time', async () => {
    const { firestore } = buildFirestore({ tokens: ['ExponentPushToken[a]'], markerExists: true })

    await expect(notifyOnce('key-1', WALLET, NOTIFICATION, firestore)).resolves.toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  // `create` rather than get-then-set: two concurrent sweeps would both read
  // "not sent" and both send.
  it('claims the marker before sending, not after', async () => {
    const order: string[] = []
    fetchSpy.mockImplementation(async () => {
      order.push('send')

      return expoReply([{ status: 'ok' }]) as never
    })
    const { firestore, mockCreate } = buildFirestore({ tokens: ['ExponentPushToken[a]'] })
    mockCreate.mockImplementation(async () => {
      order.push('claim')
    })

    await notifyOnce('key-1', WALLET, NOTIFICATION, firestore)

    expect(order).toEqual(['claim', 'send'])
  })

  // A transient network failure should not silence the notification forever.
  it('releases the claim when the send throws', async () => {
    fetchSpy.mockRejectedValue(new Error('network down') as never)
    const { firestore, mockDelete } = buildFirestore({ tokens: ['ExponentPushToken[a]'] })

    await expect(notifyOnce('key-1', WALLET, NOTIFICATION, firestore)).rejects.toThrow('network down')
    expect(mockDelete).toHaveBeenCalled()
  })

  // Expo accepted the request and rejected one device: that notification
  // genuinely happened, and retrying would deliver it twice to everyone else.
  it('keeps the claim when Expo answered but a device was gone', async () => {
    fetchSpy.mockResolvedValue(expoReply([{ status: 'error', details: { error: 'DeviceNotRegistered' } }]) as never)
    const { firestore, mockDelete } = buildFirestore({ tokens: ['ExponentPushToken[a]'] })

    await expect(notifyOnce('key-1', WALLET, NOTIFICATION, firestore)).resolves.toMatchObject({ pruned: 1 })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('keeps the claim when the wallet had no devices at all', async () => {
    const { firestore, mockDelete } = buildFirestore({ tokens: [] })

    await expect(notifyOnce('key-1', WALLET, NOTIFICATION, firestore)).resolves.toMatchObject({ noRecipients: true })
    expect(mockDelete).not.toHaveBeenCalled()
  })
})

describe('notificationKey', () => {
  // The same loan is worth notifying about more than once over its life;
  // keying on the document alone would silence everything after the first.
  it('separates two notifications about the same record', () => {
    expect(notificationKey('31337-7-1', 'loan_requested')).not.toBe(notificationKey('31337-7-1', 'membership_requested'))
  })

  it('is stable for the same record and kind', () => {
    expect(notificationKey('31337-7-1', 'loan_requested')).toBe(notificationKey('31337-7-1', 'loan_requested'))
  })

  it('separates the same transition on two records', () => {
    expect(notificationKey('31337-7-1', 'loan_requested')).not.toBe(notificationKey('31337-7-2', 'loan_requested'))
  })
})
