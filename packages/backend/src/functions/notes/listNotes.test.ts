jest.mock('../../services')
jest.mock('../../services/notes', () => ({
  ...jest.requireActual('../../services/notes'),
  listNotes: jest.fn(),
}))

const { listNotesHandler } = require('./listNotes')
const { listNotes } = require('../../services/notes')

const CALLER = '0x1111111111111111111111111111111111111111'

function buildRequest(overrides: Partial<{ auth: object | null; data: Record<string, unknown> }> = {}) {
  return {
    auth: overrides.auth !== undefined ? overrides.auth : { uid: CALLER, token: {} },
    data: overrides.data !== undefined ? overrides.data : { chainId: 31337, poolId: 1 },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
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
    listNotes.mockResolvedValue({ notes: [{ id: 'a' }], totalCount: 1 })

    await expect(listNotesHandler(buildRequest())).resolves.toEqual({ notes: [{ id: 'a' }], totalCount: 1, limit: 50 })
  })

  it('reports a query failure as an internal error rather than leaking it', async () => {
    listNotes.mockRejectedValue(new Error('index missing'))

    await expect(listNotesHandler(buildRequest())).rejects.toThrow(/Failed to list notes/i)
  })
})

// A module, not a script: these files use `require` so that `jest.mock` hoists
// above it, and without an export the test globals would collide with every
// other callable test in the project.
export {}
