import { act, renderHook, waitFor } from '@testing-library/react-native'
import { mockFirebaseCallable, mockWagmiUseAccount } from '../../__tests__/mocks'
import { useNotes } from './useNotes'

jest.mock('../../config/contracts', () => ({
  DEFAULT_CHAIN_ID: 31337,
  getPoolFactoryAddress: jest.fn(),
}))

const NOTE = {
  id: '31337-1-5:loan_purpose',
  recordId: '31337-1-5',
  kind: 'loan_purpose',
  text: 'School fees.',
  author: '0xabc',
  subject: '0xabc',
  chainId: 31337,
  poolId: 1,
  createdAt: '2026-08-18T09:00:00.000Z',
}

/** One mock per callable name, so a test can tell `listNotes` from `saveNote`. */
function mockCallables(handlers: Record<string, jest.Mock>) {
  mockFirebaseCallable.mockImplementation((_functions?: unknown, name?: string) => handlers[name as string] ?? jest.fn())
}

beforeEach(() => {
  jest.clearAllMocks()
  mockWagmiUseAccount.mockReturnValue({ isConnected: true, isConnecting: false, address: undefined, chainId: 31337 })
})

describe('useNotes', () => {
  it('loads the notes for a pool', async () => {
    const list = jest.fn().mockResolvedValue({ data: { notes: [NOTE], totalCount: 1, limit: 50 } })
    mockCallables({ listNotes: list })

    const { result } = renderHook(() => useNotes(1))

    await waitFor(() => expect(result.current.notes).toEqual([NOTE]))
    expect(list).toHaveBeenCalledWith({ chainId: 31337, poolId: 1 })
  })

  it('asks for nothing when there is no pool to ask about', async () => {
    const list = jest.fn()
    mockCallables({ listNotes: list })

    renderHook(() => useNotes(undefined))

    await waitFor(() => expect(list).not.toHaveBeenCalled())
  })

  // Silent like the indexing hook: a screen that could not load its reasons
  // still shows every decision they belong to.
  it('shows no notes rather than an error when the load fails', async () => {
    mockCallables({ listNotes: jest.fn().mockRejectedValue(new Error('offline')) })

    const { result } = renderHook(() => useNotes(1))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.notes).toEqual([])
  })

  it('finds a note by its record and its outcome, not by either alone', async () => {
    mockCallables({ listNotes: jest.fn().mockResolvedValue({ data: { notes: [NOTE], totalCount: 1, limit: 50 } }) })

    const { result } = renderHook(() => useNotes(1))

    await waitFor(() => expect(result.current.notes).toHaveLength(1))
    expect(result.current.noteFor('31337-1-5', 'loan_purpose')).toEqual(NOTE)
    expect(result.current.noteFor('31337-1-5', 'loan_rejected')).toBeUndefined()
    expect(result.current.noteFor('31337-1-6', 'loan_purpose')).toBeUndefined()
  })

  it('writes a note and keeps it without another round trip', async () => {
    const save = jest.fn().mockResolvedValue({ data: { note: NOTE } })
    mockCallables({ listNotes: jest.fn().mockResolvedValue({ data: { notes: [], totalCount: 0, limit: 50 } }), saveNote: save })

    const { result } = renderHook(() => useNotes(1))

    await act(async () => {
      await result.current.writeNote({ kind: 'loan_purpose', txHash: `0x${'de'.repeat(32)}`, text: 'School fees.' })
    })

    expect(save).toHaveBeenCalledWith({ kind: 'loan_purpose', txHash: `0x${'de'.repeat(32)}`, text: 'School fees.', chainId: 31337 })
    expect(result.current.noteFor('31337-1-5', 'loan_purpose')).toEqual(NOTE)
  })

  // A note is never load-bearing: losing one must not stop the transaction it
  // explains, so the caller is told and carries on.
  it('reports a failed write rather than throwing', async () => {
    const save = jest.fn().mockRejectedValue(new Error('permission-denied'))
    mockCallables({ listNotes: jest.fn().mockResolvedValue({ data: { notes: [], totalCount: 0, limit: 50 } }), saveNote: save })

    const { result } = renderHook(() => useNotes(1))

    await act(async () => {
      await expect(result.current.writeNote({ kind: 'loan_rejected', recordId: '31337-1-5', text: 'no' })).resolves.toBe(false)
    })
  })

  it('does not send an empty reason', async () => {
    const save = jest.fn()
    mockCallables({ listNotes: jest.fn().mockResolvedValue({ data: { notes: [], totalCount: 0, limit: 50 } }), saveNote: save })

    const { result } = renderHook(() => useNotes(1))

    await act(async () => {
      await expect(result.current.writeNote({ kind: 'loan_rejected', recordId: '31337-1-5', text: '   ' })).resolves.toBe(false)
    })

    expect(save).not.toHaveBeenCalled()
  })

  // Every feed here is per chain by construction, and a note is keyed on a
  // record whose id starts with the chain it happened on.
  it('reloads when the wallet changes chain', async () => {
    const list = jest.fn().mockResolvedValue({ data: { notes: [], totalCount: 0, limit: 50 } })
    mockCallables({ listNotes: list })

    const { rerender } = renderHook(() => useNotes(1))
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1))

    mockWagmiUseAccount.mockReturnValue({ isConnected: true, isConnecting: false, address: undefined, chainId: 80002 })
    rerender({})

    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ chainId: 80002, poolId: 1 }))
  })
})
