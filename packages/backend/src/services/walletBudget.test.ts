import { Firestore } from 'firebase-admin/firestore'
import { claimWhitelisting, releaseWhitelisting, WalletBusyError, withWalletLock } from './walletBudget'

const CHAIN_ID = 80002

/**
 * A Firestore stand-in whose `runTransaction` actually runs, backed by a plain
 * map of documents.
 *
 * The point of these tests is the arithmetic and the ordering, both of which a
 * mock returning `undefined` would happily agree with — so the store is real
 * enough to hold a count between calls.
 */
function buildFirestore() {
  const docs = new Map<string, Record<string, unknown>>()

  const docRef = (id: string) => ({
    id,
    set: jest.fn(async (data: Record<string, unknown>) => {
      docs.set(id, data)
    }),
  })

  const firestore = {
    collection: jest.fn(() => ({ doc: (id: string) => docRef(id) })),
    runTransaction: jest.fn(async (work: (transaction: unknown) => Promise<unknown>) =>
      work({
        get: async (ref: { id: string }) => ({ data: () => docs.get(ref.id) }),
        set: (ref: { id: string }, data: Record<string, unknown>) => docs.set(ref.id, data),
      })
    ),
  }

  return { firestore: firestore as unknown as Firestore, docs }
}

describe('claimWhitelisting', () => {
  afterEach(() => {
    delete process.env.WHITELIST_DAILY_CAP
  })

  it('grants a claim and counts it', async () => {
    const { firestore } = buildFirestore()

    const claim = await claimWhitelisting(CHAIN_ID, firestore)

    expect(claim).toMatchObject({ granted: true, used: 1 })
  })

  it('counts consecutive claims against the same day', async () => {
    const { firestore } = buildFirestore()

    await claimWhitelisting(CHAIN_ID, firestore)
    const second = await claimWhitelisting(CHAIN_ID, firestore)

    expect(second.used).toBe(2)
  })

  it('refuses once the day is spent', async () => {
    const { firestore, docs } = buildFirestore()
    const cap = (await claimWhitelisting(CHAIN_ID, firestore)).cap

    // Fast-forward the counter rather than making `cap` calls.
    docs.set(`budget-${CHAIN_ID}-${new Date().toISOString().slice(0, 10)}`, { count: cap })

    expect(await claimWhitelisting(CHAIN_ID, firestore)).toMatchObject({ granted: false })
  })

  it('counts each chain separately', async () => {
    // One wallet, but a budget exhausted on Amoy must not stop localhost.
    const { firestore } = buildFirestore()

    await claimWhitelisting(CHAIN_ID, firestore)
    const other = await claimWhitelisting(31337, firestore)

    expect(other.used).toBe(1)
  })

  it('gives a claim back', async () => {
    const { firestore } = buildFirestore()

    await claimWhitelisting(CHAIN_ID, firestore)
    await releaseWhitelisting(CHAIN_ID, firestore)

    expect((await claimWhitelisting(CHAIN_ID, firestore)).used).toBe(1)
  })

  it('never lets a release drive the count below zero', async () => {
    const { firestore } = buildFirestore()

    await releaseWhitelisting(CHAIN_ID, firestore)

    expect((await claimWhitelisting(CHAIN_ID, firestore)).used).toBe(1)
  })

  it('does not throw when a release fails', async () => {
    // A leaked claim costs one slot out of the day and resets at midnight,
    // which is a far better failure than an error path that can itself fail.
    const { firestore } = buildFirestore()
    ;(firestore.runTransaction as jest.Mock).mockRejectedValueOnce(new Error('firestore unavailable'))

    await expect(releaseWhitelisting(CHAIN_ID, firestore)).resolves.toBeUndefined()
  })
})

describe('withWalletLock', () => {
  it('runs the work and returns its value', async () => {
    const { firestore } = buildFirestore()

    await expect(withWalletLock(CHAIN_ID, firestore, async () => 'done')).resolves.toBe('done')
  })

  it('refuses a second holder while the first is working', async () => {
    const { firestore } = buildFirestore()

    let release!: () => void
    const held = withWalletLock(CHAIN_ID, firestore, () => new Promise<void>((resolve) => (release = resolve)))

    // The failure this prevents: both callers build a transaction on the same
    // nonce and the chain keeps one.
    await expect(withWalletLock(CHAIN_ID, firestore, async () => 'second')).rejects.toBeInstanceOf(WalletBusyError)

    release()
    await held
  })

  it('frees the lock once the work is done', async () => {
    const { firestore } = buildFirestore()

    await withWalletLock(CHAIN_ID, firestore, async () => 'first')

    await expect(withWalletLock(CHAIN_ID, firestore, async () => 'second')).resolves.toBe('second')
  })

  it('frees the lock when the work throws', async () => {
    // Otherwise one failed RPC call wedges pool creation until the lease ages
    // out, which is the kind of outage that looks like a hung product.
    const { firestore } = buildFirestore()

    await expect(withWalletLock(CHAIN_ID, firestore, async () => Promise.reject(new Error('rpc down')))).rejects.toThrow('rpc down')

    await expect(withWalletLock(CHAIN_ID, firestore, async () => 'second')).resolves.toBe('second')
  })

  it('takes over a lease that has expired', async () => {
    // The holder is a Cloud Function that can vanish mid-call, so the lock has
    // to be a lease rather than a mutex.
    const { firestore, docs } = buildFirestore()
    docs.set(`lock-${CHAIN_ID}`, { chainId: CHAIN_ID, lockedUntil: Date.now() - 1 })

    await expect(withWalletLock(CHAIN_ID, firestore, async () => 'taken over')).resolves.toBe('taken over')
  })

  it('locks each chain separately', async () => {
    const { firestore } = buildFirestore()

    let release!: () => void
    const held = withWalletLock(CHAIN_ID, firestore, () => new Promise<void>((resolve) => (release = resolve)))

    await expect(withWalletLock(31337, firestore, async () => 'other chain')).resolves.toBe('other chain')

    release()
    await held
  })
})
