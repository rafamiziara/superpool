import { Firestore, Timestamp } from 'firebase-admin/firestore'
import {
  entitlementFor,
  isNoteKind,
  listNotes,
  normaliseNoteText,
  noteDocId,
  noteFor,
  resolveStagedNote,
  saveNote,
  stagedRecordId,
  stageNote,
} from './notes'

const OWNER = '0x1111111111111111111111111111111111111111'
const BORROWER = '0x2222222222222222222222222222222222222222'
const STRANGER = '0x3333333333333333333333333333333333333333'

const CHAIN_ID = 31337
const POOL_ID = 1
const LOAN_ID = `${CHAIN_ID}-${POOL_ID}-7`
const MEMBER_ID = `${CHAIN_ID}-${POOL_ID}-${BORROWER}`

type Docs = Record<string, Record<string, Record<string, unknown>>>

/**
 * A Firestore small enough to reason about: nested plain objects, real
 * `create` semantics (throws on an existing document) and a query builder that
 * filters on equality the way the service uses it.
 */
function buildFirestore(seed: Docs = {}) {
  const store: Docs = JSON.parse(JSON.stringify(seed, replacer), reviver)

  const collection = (name: string) => {
    store[name] ??= {}

    const filters: [string, unknown][] = []

    const query = {
      where(field: string, _op: string, value: unknown) {
        filters.push([field, value])

        return query
      },
      orderBy() {
        return query
      },
      limit() {
        return query
      },
      count() {
        return { get: async () => ({ data: () => ({ count: matches().length }) }) }
      },
      get: async () => ({
        docs: matches().map(([id, data]) => ({ id, data: () => data })),
      }),
    }

    const matches = () => Object.entries(store[name]).filter(([, data]) => filters.every(([field, value]) => data[field] === value))

    return {
      ...query,
      doc: (id: string) => ({
        get: async () => ({ exists: id in store[name], data: () => store[name][id] }),
        create: async (data: Record<string, unknown>) => {
          if (id in store[name]) throw new Error('already exists')

          store[name][id] = data
        },
        delete: async () => {
          delete store[name][id]
        },
      }),
    }
  }

  return { firestore: { collection } as unknown as Firestore, store }
}

function replacer(this: Record<string, unknown>, key: string, value: unknown) {
  return this[key] instanceof Timestamp ? { __timestamp: (this[key] as Timestamp).toMillis() } : value
}

function reviver(_key: string, value: unknown) {
  if (value && typeof value === 'object' && '__timestamp' in value) {
    return Timestamp.fromMillis((value as { __timestamp: number }).__timestamp)
  }

  return value
}

const seeded = (): Docs => ({
  pools: { [`${CHAIN_ID}-${POOL_ID}`]: { poolOwner: OWNER.toLowerCase(), name: 'Neighbours' } },
  loans: { [LOAN_ID]: { chainId: CHAIN_ID, poolId: POOL_ID, borrower: BORROWER.toLowerCase() } },
  memberships: { [MEMBER_ID]: { chainId: CHAIN_ID, poolId: POOL_ID, account: BORROWER.toLowerCase() } },
})

const params = (overrides: Partial<Parameters<typeof saveNote>[0]> = {}) => ({
  recordId: LOAN_ID,
  kind: 'loan_rejected' as const,
  text: 'The pool is fully lent out until March.',
  author: OWNER,
  subject: BORROWER,
  chainId: CHAIN_ID,
  poolId: POOL_ID,
  ...overrides,
})

describe('noteDocId', () => {
  // Keying on the record alone would collapse a life's worth of statements
  // into one, and would surface a reason the owner thought better of.
  it('is the record and the outcome, so one record can carry several', () => {
    expect(noteDocId(LOAN_ID, 'loan_rejected')).toBe(`${LOAN_ID}:loan_rejected`)
    expect(noteDocId(LOAN_ID, 'loan_approved')).not.toBe(noteDocId(LOAN_ID, 'loan_rejected'))
  })
})

describe('stagedRecordId', () => {
  it('lowercases the hash, since wallets report it either way', () => {
    expect(stagedRecordId(CHAIN_ID, '0xABC')).toBe(`tx:${CHAIN_ID}:0xabc`)
  })
})

describe('isNoteKind', () => {
  it('accepts the kinds a note may carry', () => {
    expect(isNoteKind('loan_purpose')).toBe(true)
    expect(isNoteKind('membership_removed')).toBe(true)
  })

  // The wire value is a string until something checks it.
  it('refuses anything else, including notification kinds that are not note kinds', () => {
    expect(isNoteKind('loan_requested')).toBe(false)
    expect(isNoteKind('')).toBe(false)
    expect(isNoteKind('../../etc/passwd')).toBe(false)
  })
})

describe('normaliseNoteText', () => {
  it('trims', () => {
    expect(normaliseNoteText('  because  ')).toBe('because')
  })

  it('refuses nothing, and refuses a document', () => {
    expect(normaliseNoteText('   ')).toBeNull()
    expect(normaliseNoteText(undefined)).toBeNull()
    expect(normaliseNoteText(42)).toBeNull()
    expect(normaliseNoteText('a'.repeat(281))).toBeNull()
    expect(normaliseNoteText('a'.repeat(280))).toHaveLength(280)
  })
})

describe('entitlementFor', () => {
  it('lets the borrower state a purpose on their own loan', async () => {
    const { firestore } = buildFirestore(seeded())

    await expect(entitlementFor(LOAN_ID, 'loan_purpose', firestore)).resolves.toMatchObject({
      author: BORROWER.toLowerCase(),
      subject: BORROWER.toLowerCase(),
    })
  })

  // A borrower cannot decline their own request, and an owner cannot invent a
  // purpose on somebody's behalf.
  it('gives every decision to the pool owner, and names the borrower as its subject', async () => {
    const { firestore } = buildFirestore(seeded())

    await expect(entitlementFor(LOAN_ID, 'loan_rejected', firestore)).resolves.toMatchObject({
      author: OWNER.toLowerCase(),
      subject: BORROWER.toLowerCase(),
    })
  })

  it('reads a membership kind from the membership register, not the loans', async () => {
    const { firestore } = buildFirestore(seeded())

    await expect(entitlementFor(MEMBER_ID, 'membership_removed', firestore)).resolves.toMatchObject({
      author: OWNER.toLowerCase(),
      subject: BORROWER.toLowerCase(),
      poolId: POOL_ID,
    })
  })

  // Otherwise any wallet could park text under any key it can spell.
  it('refuses a record nobody has indexed', async () => {
    const { firestore } = buildFirestore(seeded())

    await expect(entitlementFor(`${CHAIN_ID}-9-9`, 'loan_rejected', firestore)).resolves.toBeNull()
  })

  it('refuses when the pool itself was never indexed, since there is no owner', async () => {
    const docs = seeded()
    delete docs.pools[`${CHAIN_ID}-${POOL_ID}`]
    const { firestore } = buildFirestore(docs)

    await expect(entitlementFor(LOAN_ID, 'loan_rejected', firestore)).resolves.toBeNull()
  })

  it('refuses a record with no subject on it', async () => {
    const docs = seeded()
    docs.loans[LOAN_ID] = { chainId: CHAIN_ID, poolId: POOL_ID }
    const { firestore } = buildFirestore(docs)

    await expect(entitlementFor(LOAN_ID, 'loan_rejected', firestore)).resolves.toBeNull()
  })
})

describe('saveNote', () => {
  it('stores the note under (record, outcome) and lowercases both parties', async () => {
    const { firestore, store } = buildFirestore(seeded())

    const note = await saveNote(params(), firestore)

    expect(note).toMatchObject({ id: `${LOAN_ID}:loan_rejected`, author: OWNER.toLowerCase(), subject: BORROWER.toLowerCase() })
    expect(store.notes[`${LOAN_ID}:loan_rejected`]).toBeDefined()
  })

  it('dates the note on the wire as ISO, which is what survives the callable encoder', async () => {
    const { firestore } = buildFirestore(seeded())

    const note = await saveNote(params(), firestore)

    expect(new Date(note!.createdAt).getTime()).not.toBeNaN()
  })

  // A reason that can be rewritten after the borrower has read it is a draft.
  it('is write-once: a second note under the same key changes nothing', async () => {
    const { firestore, store } = buildFirestore(seeded())

    await saveNote(params(), firestore)
    const second = await saveNote(params({ text: 'Actually, never mind.' }), firestore)

    expect(second).toBeNull()
    expect(store.notes[`${LOAN_ID}:loan_rejected`].text).toBe(params().text)
  })

  it('keeps the moment it was written when one is supplied', async () => {
    const { firestore } = buildFirestore(seeded())
    const written = Timestamp.fromMillis(1_700_000_000_000)

    const note = await saveNote(params({ createdAt: written }), firestore)

    expect(note!.createdAt).toBe(written.toDate().toISOString())
  })
})

describe('noteFor', () => {
  it('answers with the note attached to that outcome', async () => {
    const { firestore } = buildFirestore(seeded())
    await saveNote(params(), firestore)

    await expect(noteFor(LOAN_ID, 'loan_rejected', firestore)).resolves.toMatchObject({ text: params().text })
  })

  // The check that makes a reason the owner thought better of invisible.
  it('does not answer with a note written for a different outcome', async () => {
    const { firestore } = buildFirestore(seeded())
    await saveNote(params(), firestore)

    await expect(noteFor(LOAN_ID, 'loan_approved', firestore)).resolves.toBeNull()
  })
})

describe('resolveStagedNote', () => {
  const stageParams = () =>
    params({ recordId: stagedRecordId(CHAIN_ID, '0xdead'), kind: 'loan_purpose', author: BORROWER, subject: BORROWER, poolId: 0 })

  it('moves a staged purpose onto the loan the transaction created', async () => {
    const { firestore, store } = buildFirestore(seeded())
    await stageNote(stageParams(), firestore)

    const note = await resolveStagedNote(CHAIN_ID, '0xDEAD', LOAN_ID, 'loan_purpose', BORROWER, POOL_ID, firestore)

    expect(note).toMatchObject({ recordId: LOAN_ID, poolId: POOL_ID, kind: 'loan_purpose' })
    expect(store.notes[`${LOAN_ID}:loan_purpose`]).toBeDefined()
    expect(Object.keys(store.staged_notes)).toHaveLength(0)
  })

  // Nothing could be checked at staging time — the loan did not exist. This is
  // where the claim on a transaction hash is honoured, or is not.
  it('drops a purpose staged by somebody who is not the borrower', async () => {
    const { firestore, store } = buildFirestore(seeded())
    await stageNote(params({ ...stageParams(), author: STRANGER, subject: STRANGER }), firestore)

    const note = await resolveStagedNote(CHAIN_ID, '0xdead', LOAN_ID, 'loan_purpose', BORROWER, POOL_ID, firestore)

    expect(note).toBeNull()
    expect(store.notes?.[`${LOAN_ID}:loan_purpose`]).toBeUndefined()
    expect(Object.keys(store.staged_notes)).toHaveLength(0)
  })

  it('says nothing when no purpose was staged, which is the ordinary case', async () => {
    const { firestore } = buildFirestore(seeded())

    await expect(resolveStagedNote(CHAIN_ID, '0xdead', LOAN_ID, 'loan_purpose', BORROWER, POOL_ID, firestore)).resolves.toBeNull()
  })

  // Re-scanning a range is a supported operation here.
  it('is free to run twice: the second pass finds nothing to move and breaks nothing', async () => {
    const { firestore, store } = buildFirestore(seeded())
    await stageNote(stageParams(), firestore)

    await resolveStagedNote(CHAIN_ID, '0xdead', LOAN_ID, 'loan_purpose', BORROWER, POOL_ID, firestore)
    await resolveStagedNote(CHAIN_ID, '0xdead', LOAN_ID, 'loan_purpose', BORROWER, POOL_ID, firestore)

    expect(store.notes[`${LOAN_ID}:loan_purpose`].text).toBe(params().text)
  })
})

describe('stageNote', () => {
  it('refuses a second purpose for the same transaction', async () => {
    const { firestore } = buildFirestore(seeded())
    const staged = params({ recordId: stagedRecordId(CHAIN_ID, '0xdead'), kind: 'loan_purpose', author: BORROWER, subject: BORROWER })

    await expect(stageNote(staged, firestore)).resolves.not.toBeNull()
    await expect(stageNote(staged, firestore)).resolves.toBeNull()
  })
})

describe('listNotes', () => {
  async function seedNotes() {
    const built = buildFirestore(seeded())

    await saveNote(params(), built.firestore)
    await saveNote(params({ recordId: MEMBER_ID, kind: 'membership_removed' }), built.firestore)
    await saveNote(params({ recordId: `${CHAIN_ID}-${POOL_ID}-8`, kind: 'loan_rejected', subject: STRANGER }), built.firestore)

    return built
  }

  it('gives a pool owner every note on their own pool', async () => {
    const { firestore } = await seedNotes()

    const { notes, totalCount } = await listNotes({ caller: OWNER, chainId: CHAIN_ID, poolId: POOL_ID, limit: 50 }, firestore)

    expect(notes).toHaveLength(3)
    expect(totalCount).toBe(3)
  })

  // Widening this later is a one-line change; narrowing it after people have
  // written things is not.
  it('gives everybody else only the notes about themselves', async () => {
    const { firestore } = await seedNotes()

    const { notes } = await listNotes({ caller: BORROWER, chainId: CHAIN_ID, poolId: POOL_ID, limit: 50 }, firestore)

    expect(notes.map((note) => note.subject)).toEqual([BORROWER.toLowerCase(), BORROWER.toLowerCase()])
  })

  it('shows a wallet that is neither owner nor subject nothing at all', async () => {
    const { firestore } = await seedNotes()

    const { notes, totalCount } = await listNotes(
      { caller: '0x4444444444444444444444444444444444444444', chainId: CHAIN_ID, poolId: POOL_ID, limit: 50 },
      firestore
    )

    expect(notes).toHaveLength(0)
    expect(totalCount).toBe(0)
  })

  it('narrows to one record when asked', async () => {
    const { firestore } = await seedNotes()

    const { notes } = await listNotes({ caller: OWNER, chainId: CHAIN_ID, poolId: POOL_ID, recordId: MEMBER_ID, limit: 50 }, firestore)

    expect(notes.map((note) => note.kind)).toEqual(['membership_removed'])
  })

  // Without a pool there is no owner to be, so the caller sees themselves.
  it('falls back to the caller’s own notes when no pool is named', async () => {
    const { firestore } = await seedNotes()

    const { notes } = await listNotes({ caller: OWNER, chainId: CHAIN_ID, limit: 50 }, firestore)

    expect(notes).toHaveLength(0)
  })
})
