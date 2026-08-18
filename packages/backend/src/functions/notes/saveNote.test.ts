jest.mock('../../services')
jest.mock('../../services/notes', () => ({
  ...jest.requireActual('../../services/notes'),
  entitlementFor: jest.fn(),
  saveNote: jest.fn(),
  stageNote: jest.fn(),
}))

const { saveNoteHandler } = require('./saveNote')
const { entitlementFor, saveNote, stageNote } = require('../../services/notes')

const OWNER = '0x1111111111111111111111111111111111111111'
const BORROWER = '0x2222222222222222222222222222222222222222'
const LOAN_ID = '31337-1-7'

const NOTE = { id: `${LOAN_ID}:loan_rejected`, recordId: LOAN_ID, kind: 'loan_rejected', text: 'Not this month.' }

function buildRequest(overrides: Partial<{ auth: object | null; data: Record<string, unknown> }> = {}) {
  return {
    auth: overrides.auth !== undefined ? overrides.auth : { uid: OWNER, token: {} },
    data: overrides.data !== undefined ? overrides.data : { kind: 'loan_rejected', recordId: LOAN_ID, text: 'Not this month.' },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  entitlementFor.mockResolvedValue({ author: OWNER.toLowerCase(), subject: BORROWER.toLowerCase(), chainId: 31337, poolId: 1 })
  saveNote.mockResolvedValue(NOTE)
  stageNote.mockResolvedValue({ ...NOTE, kind: 'loan_purpose' })
})

describe('saveNote', () => {
  it('writes the note and hands it back', async () => {
    await expect(saveNoteHandler(buildRequest())).resolves.toEqual({ note: NOTE })
  })

  it('refuses an unauthenticated caller', async () => {
    await expect(saveNoteHandler(buildRequest({ auth: null }))).rejects.toThrow(/authenticated/i)
  })

  // The author is the one thing a caller cannot claim to be, which is what
  // stops a note being written in somebody else's name.
  it('takes the author from the caller’s identity, never from the request', async () => {
    await saveNoteHandler(buildRequest({ data: { kind: 'loan_rejected', recordId: LOAN_ID, text: 'Not this month.', author: BORROWER } }))

    expect(saveNote).toHaveBeenCalledWith(expect.objectContaining({ author: OWNER.toLowerCase() }), expect.anything())
  })

  it('takes the subject and the pool from the indexed record, not from the request', async () => {
    await saveNoteHandler(buildRequest({ data: { kind: 'loan_rejected', recordId: LOAN_ID, text: 'Not this month.', poolId: 99 } }))

    expect(saveNote).toHaveBeenCalledWith(expect.objectContaining({ subject: BORROWER.toLowerCase(), poolId: 1 }), expect.anything())
  })

  // A borrower cannot decline their own request.
  it('refuses a caller who is not entitled to this kind on this record', async () => {
    await expect(saveNoteHandler(buildRequest({ auth: { uid: BORROWER } }))).rejects.toThrow(/cannot write/i)
    expect(saveNote).not.toHaveBeenCalled()
  })

  it('refuses a record nobody has indexed', async () => {
    entitlementFor.mockResolvedValue(null)

    await expect(saveNoteHandler(buildRequest())).rejects.toThrow(/no indexed record/i)
  })

  // Write-once, and loudly: the caller believes they are saying something, and
  // what already stands is what the other party has been told.
  it('refuses a second note under the same key', async () => {
    saveNote.mockResolvedValue(null)

    await expect(saveNoteHandler(buildRequest())).rejects.toThrow(/already been written/i)
  })

  it('refuses a kind it does not recognise', async () => {
    await expect(saveNoteHandler(buildRequest({ data: { kind: 'loan_requested', recordId: LOAN_ID, text: 'hi' } }))).rejects.toThrow(
      /valid kind/i
    )
  })

  it('refuses text that says nothing, or says too much', async () => {
    await expect(saveNoteHandler(buildRequest({ data: { kind: 'loan_rejected', recordId: LOAN_ID, text: '  ' } }))).rejects.toThrow(
      /at most 280/i
    )
    await expect(
      saveNoteHandler(buildRequest({ data: { kind: 'loan_rejected', recordId: LOAN_ID, text: 'a'.repeat(281) } }))
    ).rejects.toThrow(/at most 280/i)
  })

  it('refuses a note that names neither a record nor a transaction', async () => {
    await expect(saveNoteHandler(buildRequest({ data: { kind: 'loan_rejected', text: 'why' } }))).rejects.toThrow(/recordId or the txHash/i)
  })
})

describe('saveNote, staged under a transaction', () => {
  const staged = { kind: 'loan_purpose', txHash: '0xdead', chainId: 31337, text: 'School fees.' }

  it('parks a purpose under the transaction that asked for the loan', async () => {
    await saveNoteHandler(buildRequest({ auth: { uid: BORROWER }, data: staged }))

    expect(stageNote).toHaveBeenCalledWith(
      expect.objectContaining({ recordId: 'tx:31337:0xdead', author: BORROWER.toLowerCase(), subject: BORROWER.toLowerCase() }),
      expect.anything()
    )
  })

  // Nothing can be checked here: the loan does not exist yet, so there is no
  // record to read an entitlement from.
  it('reads no record, because there is not one yet', async () => {
    await saveNoteHandler(buildRequest({ auth: { uid: BORROWER }, data: staged }))

    expect(entitlementFor).not.toHaveBeenCalled()
  })

  it('refuses to stage anything but a purpose', async () => {
    await expect(
      saveNoteHandler(buildRequest({ data: { kind: 'loan_rejected', txHash: '0xdead', text: 'Not this month.' } }))
    ).rejects.toThrow(/only a loan purpose/i)
  })

  it('refuses a second purpose for the same transaction', async () => {
    stageNote.mockResolvedValue(null)

    await expect(saveNoteHandler(buildRequest({ auth: { uid: BORROWER }, data: staged }))).rejects.toThrow(/already been written/i)
  })
})

// A module, not a script: these files use `require` so that `jest.mock` hoists
// above it, and without an export the test globals would collide with every
// other callable test in the project.
export {}
