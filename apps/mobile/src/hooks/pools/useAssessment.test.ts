import { act, renderHook, waitFor } from '@testing-library/react-native'
import { mockFirebaseCallable, mockWagmiUseAccount } from '../../__tests__/mocks'
import { useAssessments } from './useAssessment'

jest.mock('../../config/contracts', () => ({
  DEFAULT_CHAIN_ID: 31337,
  getPoolFactoryAddress: jest.fn(),
}))

const HISTORY = { total: 4, repaid: 3, onTime: 3, late: 0, undated: 0, outstanding: 1, overdue: 0, defaulted: 0, isNew: false }

const ASSESSMENT = {
  id: '31337-1-7',
  chainId: 31337,
  poolId: 1,
  loanId: 7,
  risk: 'low',
  summary: 'A modest ask.',
  observations: [],
  questions: [],
  limitations: ['No purpose.'],
  inputs: { amount: 10, liquidity: 80, symbol: 'POL', hadPurpose: false, borrower: HISTORY },
  createdAt: '2026-08-18T09:00:00.000Z',
}

let assessCallable: jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockWagmiUseAccount.mockReturnValue({ isConnected: true, isConnecting: false, address: undefined, chainId: 31337 })
  assessCallable = jest.fn().mockResolvedValue({ data: { assessment: ASSESSMENT, cached: true } })
  mockFirebaseCallable.mockImplementation((_functions?: unknown, name?: string) =>
    name === 'assessLoan' ? assessCallable : jest.fn().mockResolvedValue({ data: {} })
  )
})

describe('useAssessments', () => {
  it('reads every request on screen when the queue opens', async () => {
    const { result } = renderHook(() => useAssessments(['31337-1-7', '31337-1-8']))

    await waitFor(() => expect(result.current.assessments['31337-1-7']).toEqual(ASSESSMENT))
    expect(assessCallable).toHaveBeenCalledTimes(2)
  })

  /*
    The backend reads a stored assessment back rather than making a new one, so
    asking once per loan is what makes asking on open affordable. Asking again
    on every render would make the first ask — the one that spends money —
    happen over and over.
  */
  it('asks about each loan once, however many times it re-renders', async () => {
    const { rerender } = renderHook(() => useAssessments(['31337-1-7']))

    await waitFor(() => expect(assessCallable).toHaveBeenCalledTimes(1))

    rerender({})
    rerender({})

    await waitFor(() => expect(assessCallable).toHaveBeenCalledTimes(1))
  })

  it('asks about a request that appears later, and not about the ones already read', async () => {
    const { rerender } = renderHook(({ ids }: { ids: string[] }) => useAssessments(ids), {
      initialProps: { ids: ['31337-1-7'] },
    })

    await waitFor(() => expect(assessCallable).toHaveBeenCalledTimes(1))

    rerender({ ids: ['31337-1-7', '31337-1-8'] })

    await waitFor(() => expect(assessCallable).toHaveBeenCalledTimes(2))
    expect(assessCallable).toHaveBeenLastCalledWith(expect.objectContaining({ loanId: '31337-1-8' }))
  })

  it('asks about nothing when the queue is empty', async () => {
    renderHook(() => useAssessments([]))

    await waitFor(() => expect(assessCallable).not.toHaveBeenCalled())
  })

  // On open it must never spend twice; a refresh is the owner saying to.
  it('does not ask for a fresh reading on open', async () => {
    renderHook(() => useAssessments(['31337-1-7']))

    await waitFor(() => expect(assessCallable).toHaveBeenCalled())
    expect(assessCallable).toHaveBeenCalledWith({ chainId: 31337, loanId: '31337-1-7' })
  })

  it('asks for a fresh one when the owner says so', async () => {
    const { result } = renderHook(() => useAssessments(['31337-1-7']))

    await waitFor(() => expect(assessCallable).toHaveBeenCalledTimes(1))

    await act(async () => {
      await result.current.refresh('31337-1-7')
    })

    expect(assessCallable).toHaveBeenLastCalledWith({ chainId: 31337, loanId: '31337-1-7', refresh: true })
  })

  it('reports why there is none, so the panel can tell ordinary from broken', async () => {
    assessCallable.mockResolvedValue({ data: { unavailable: 'not-configured', cached: false } })

    const { result } = renderHook(() => useAssessments(['31337-1-7']))

    await waitFor(() => expect(result.current.unavailable['31337-1-7']).toBe('not-configured'))
    expect(result.current.assessments['31337-1-7']).toBeUndefined()
  })

  // Silent like `triggerIndexing`. A red banner about missing help the owner
  // never asked for by name is worse than the absence it describes.
  it('stays quiet when the call fails outright', async () => {
    assessCallable.mockRejectedValue(new Error('offline'))

    const { result } = renderHook(() => useAssessments(['31337-1-7']))

    await waitFor(() => expect(result.current.pending['31337-1-7']).toBeUndefined())
    expect(result.current.assessments['31337-1-7']).toBeUndefined()
  })

  it('clears the loading flag once each has answered', async () => {
    const { result } = renderHook(() => useAssessments(['31337-1-7']))

    await waitFor(() => expect(result.current.assessments['31337-1-7']).toBeDefined())
    expect(result.current.pending).toEqual({})
  })
})
