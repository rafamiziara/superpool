import { renderHook, waitFor } from '@testing-library/react-native'
import { mockFirebaseCallable, mockWagmiUseAccount } from '../../__tests__/mocks'
import { useLoanDecisions } from './useLoanDecisions'

jest.mock('../../config/contracts', () => ({
  DEFAULT_CHAIN_ID: 31337,
  getPoolFactoryAddress: jest.fn(),
}))

const DECISION = {
  id: '31337-0xaaa-0',
  loanId: 5,
  poolId: 1,
  poolAddress: '0x3b9Fab925D36946000F2636a49808cD5CF56F290',
  borrower: '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc',
  amount: '4000000000000000000',
  outcome: 'approved' as const,
  decidedBy: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
  chainId: 31337,
  transactionHash: '0xaaa',
  logIndex: 0,
  blockNumber: 100,
  decidedAt: '2026-08-18T09:00:00.000Z',
}

/** One mock per callable name, so a test can tell one feed from another. */
function mockCallables(handlers: Record<string, jest.Mock>) {
  mockFirebaseCallable.mockImplementation((_functions?: unknown, name?: string) => handlers[name as string] ?? jest.fn())
}

beforeEach(() => {
  jest.clearAllMocks()
  mockWagmiUseAccount.mockReturnValue({ isConnected: true, isConnecting: false, address: undefined, chainId: 31337 })
})

describe('useLoanDecisions', () => {
  it('loads the decisions for a pool', async () => {
    // Arrange
    const list = jest.fn().mockResolvedValue({ data: { decisions: [DECISION], totalCount: 1, limit: 50 } })
    mockCallables({ listLoanDecisions: list })

    // Act
    const { result } = renderHook(() => useLoanDecisions(1))

    // Assert
    await waitFor(() => expect(result.current.decisions).toEqual([DECISION]))
    expect(list).toHaveBeenCalledWith({ chainId: 31337, poolId: 1 })
  })

  it('asks for nothing when there is no pool to ask about', async () => {
    // Arrange
    const list = jest.fn()
    mockCallables({ listLoanDecisions: list })

    // Act
    renderHook(() => useLoanDecisions(undefined))

    // Assert
    await waitFor(() => expect(list).not.toHaveBeenCalled())
  })

  it('asks the connected chain, since a decision belongs to the log it came from', async () => {
    // Arrange
    const list = jest.fn().mockResolvedValue({ data: { decisions: [], totalCount: 0, limit: 50 } })
    mockCallables({ listLoanDecisions: list })
    mockWagmiUseAccount.mockReturnValue({ isConnected: true, isConnecting: false, address: undefined, chainId: 80002 })

    // Act
    renderHook(() => useLoanDecisions(3))

    // Assert
    await waitFor(() => expect(list).toHaveBeenCalledWith({ chainId: 80002, poolId: 3 }))
  })

  it('shows no history rather than an error when the load fails', async () => {
    // Arrange — silent like the notes hook: every figure that comes from the
    // loans themselves is still on the screen.
    mockCallables({ listLoanDecisions: jest.fn().mockRejectedValue(new Error('offline')) })

    // Act
    const { result } = renderHook(() => useLoanDecisions(1))

    // Assert
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.decisions).toEqual([])
  })

  it('survives a response that carries no decisions field', async () => {
    // Arrange — a pool that has decided nothing is the ordinary case for a
    // pool that lends on demand.
    mockCallables({ listLoanDecisions: jest.fn().mockResolvedValue({ data: {} }) })

    // Act
    const { result } = renderHook(() => useLoanDecisions(1))

    // Assert
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.decisions).toEqual([])
  })

  it('reloads on demand', async () => {
    // Arrange
    const list = jest.fn().mockResolvedValue({ data: { decisions: [DECISION], totalCount: 1, limit: 50 } })
    mockCallables({ listLoanDecisions: list })

    // Act
    const { result } = renderHook(() => useLoanDecisions(1))
    await waitFor(() => expect(result.current.decisions).toHaveLength(1))
    await result.current.refresh()

    // Assert
    expect(list).toHaveBeenCalledTimes(2)
  })
})
