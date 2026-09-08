import type { Note } from '@superpool/types'
import type { CallableRequest } from 'firebase-functions/v2/https'
import type { NoteEntitlement } from '../../services/notes'

vi.mock('../../services')
vi.mock('../../services/notes', async () => ({
  ...(await vi.importActual<typeof import('../../services/notes')>('../../services/notes')),
  entitlementFor: vi.fn(),
  saveNote: vi.fn(),
  stageNote: vi.fn(),
}))

import * as notesMock from '../../services/notes'
import { saveNoteHandler } from './saveNote'

// These modules are mocked above; vi.mocked restores the mock types that the
// real signatures would otherwise hide.
const { entitlementFor, saveNote, stageNote } = vi.mocked(notesMock)
const OWNER = '0x1111111111111111111111111111111111111111'
const BORROWER = '0x2222222222222222222222222222222222222222'
const LOAN_ID = '31337-1-7'

const NOTE = { id: `${LOAN_ID}:loan_rejected`, recordId: LOAN_ID, kind: 'loan_rejected', text: 'Not this month.' }

function buildRequest<T>(overrides: Partial<{ auth: object | null; data: Record<string, unknown> }> = {}): CallableRequest<T> {
  return {
    auth: overrides.auth !== undefined ? overrides.auth : { uid: OWNER, token: {} },
    data: overrides.data !== undefined ? overrides.data : { kind: 'loan_rejected', recordId: LOAN_ID, text: 'Not this month.' },
  } as unknown as CallableRequest<T>
}

beforeEach(() => {
  vi.clearAllMocks()
  entitlementFor.mockResolvedValue({
    author: OWNER.toLowerCase(),
    subject: BORROWER.toLowerCase(),
    chainId: 31337,
    poolId: 1,
  } as unknown as NoteEntitlement)
  saveNote.mockResolvedValue(NOTE as unknown as Note)
  stageNote.mockResolvedValue({ ...NOTE, kind: 'loan_purpose' } as unknown as Note)
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
      /kind/i
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
  // A real 32-byte hash. It was '0xdead', which the schema now refuses — and
  // which would have keyed a staged note under something no log could produce.
  const TX_HASH = '0xdededededededededededededededededededededededededededededededede'
  const staged = { kind: 'loan_purpose', txHash: TX_HASH, chainId: 31337, text: 'School fees.' }

  it('parks a purpose under the transaction that asked for the loan', async () => {
    await saveNoteHandler(buildRequest({ auth: { uid: BORROWER }, data: staged }))

    expect(stageNote).toHaveBeenCalledWith(
      expect.objectContaining({ recordId: `tx:31337:${TX_HASH}`, author: BORROWER.toLowerCase(), subject: BORROWER.toLowerCase() }),
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
      saveNoteHandler(buildRequest({ data: { kind: 'loan_rejected', txHash: TX_HASH, text: 'Not this month.' } }))
    ).rejects.toThrow(/only a loan purpose/i)
  })

  it('refuses a second purpose for the same transaction', async () => {
    stageNote.mockResolvedValue(null)

    await expect(saveNoteHandler(buildRequest({ auth: { uid: BORROWER }, data: staged }))).rejects.toThrow(/already been written/i)
  })
})
