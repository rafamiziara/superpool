import type { Note } from '@superpool/types'
import type { CallableRequest } from 'firebase-functions/v2/https'

vi.mock('../../services')
vi.mock('../../services/notes', async () => ({
  ...(await vi.importActual<typeof import('../../services/notes')>('../../services/notes')),
  listNotes: vi.fn(),
}))

import * as notesMock from '../../services/notes'
import { listNotesHandler } from './listNotes'

// These modules are mocked above; vi.mocked restores the mock types that the
// real signatures would otherwise hide.
const { listNotes } = vi.mocked(notesMock)
const CALLER = '0x1111111111111111111111111111111111111111'

function buildRequest<T>(overrides: Partial<{ auth: object | null; data: Record<string, unknown> }> = {}): CallableRequest<T> {
  return {
    auth: overrides.auth !== undefined ? overrides.auth : { uid: CALLER, token: {} },
    data: overrides.data !== undefined ? overrides.data : { chainId: 31337, poolId: 1 },
  } as unknown as CallableRequest<T>
}

beforeEach(() => {
  vi.clearAllMocks()
  listNotes.mockResolvedValue({ notes: [], totalCount: 0 })
})

describe('listNotes', () => {
  it('refuses an unauthenticated caller', async () => {
    await expect(listNotesHandler(buildRequest({ auth: null }))).rejects.toThrow(/authenticated/i)
  })

  // A caller who could name the wallet could read anybody's notes.
  it('takes the caller from their identity, never from the request', async () => {
    const victim = '0x2222222222222222222222222222222222222222'

    await listNotesHandler(buildRequest({ data: { chainId: 31337, poolId: 1, caller: victim, subject: victim } }))

    expect(listNotes).toHaveBeenCalledWith(expect.objectContaining({ caller: CALLER }), expect.anything())
  })

  it('caps the page at what the rules allow, and defaults it', async () => {
    await listNotesHandler(buildRequest({ data: { poolId: 1, limit: 5000 } }))
    expect(listNotes).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }), expect.anything())

    await listNotesHandler(buildRequest({ data: { poolId: 1 } }))
    expect(listNotes).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }), expect.anything())
  })

  it('passes the record filter through', async () => {
    await listNotesHandler(buildRequest({ data: { poolId: 1, recordId: '31337-1-7' } }))

    expect(listNotes).toHaveBeenCalledWith(expect.objectContaining({ recordId: '31337-1-7' }), expect.anything())
  })

  it('reports what it found', async () => {
    listNotes.mockResolvedValue({ notes: [{ id: 'a' } as unknown as Note], totalCount: 1 })

    await expect(listNotesHandler(buildRequest())).resolves.toEqual({ notes: [{ id: 'a' }], totalCount: 1, limit: 50 })
  })

  it('reports a query failure as an internal error rather than leaking it', async () => {
    listNotes.mockRejectedValue(new Error('index missing'))

    await expect(listNotesHandler(buildRequest())).rejects.toThrow(/Failed to list notes/i)
  })
})
