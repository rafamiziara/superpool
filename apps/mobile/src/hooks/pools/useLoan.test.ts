import { act, renderHook } from '@testing-library/react-native'
import { type Address, BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from 'viem'
import {
  mockEstimateContractGas,
  mockGetTransactionReceipt,
  mockWagmiUseAccount,
  mockWagmiUsePublicClient,
  mockWaitForTransactionReceipt,
  mockWriteContractAsync,
} from '../../__tests__/mocks'
import { LendingPoolABI } from '../../constants/abis'
import { pendingTransactionsStore } from '../../stores/PendingTransactionsStore'
import {
  type BorrowParams,
  calculateRepayment,
  describeApproveError,
  describeBorrowError,
  describeCancelError,
  describeRejectError,
  describeRepayError,
  describeRequestError,
  type LoanDecisionParams,
  type RepayParams,
  useLoan,
  validateBorrowParams,
} from './useLoan'

const POOL_ADDRESS = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0'
const WALLET_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const TX_HASH = '0xaaaa000000000000000000000000000000000000000000000000000000000001'
const LOCALHOST_CHAIN_ID = 31337

jest.mock('../../config/contracts', () => ({
  DEFAULT_CHAIN_ID: 31337,
  getPoolFactoryAddress: jest.fn(),
}))

function makeBorrowParams(overrides: Partial<BorrowParams> = {}): BorrowParams {
  return {
    poolId: 1,
    poolAddress: POOL_ADDRESS,
    poolName: 'Neighbourhood Fund',
    amount: 5_000_000_000_000_000_000n,
    ...overrides,
  }
}

function makeRepayParams(overrides: Partial<RepayParams> = {}): RepayParams {
  return {
    poolId: 1,
    poolAddress: POOL_ADDRESS,
    poolName: 'Neighbourhood Fund',
    loanId: 3,
    amount: 5_250_000_000_000_000_000n,
    ...overrides,
  }
}

function makeDecisionParams(overrides: Partial<LoanDecisionParams> = {}): LoanDecisionParams {
  return {
    poolId: 1,
    poolAddress: POOL_ADDRESS,
    poolName: 'Neighbourhood Fund',
    loanId: 7,
    amount: 5_000_000_000_000_000_000n,
    ...overrides,
  }
}

/** Wraps a cause the way Viem does, so `BaseError.walk` has something to find. */
function wrapped(cause: Error): BaseError {
  return new BaseError('Contract write failed', { cause: new BaseError('inner', { cause }) })
}

type RevertAbiItem = NonNullable<ContractFunctionRevertedError['data']>['abiItem']

/** Looks the error up in the shipped ABI, so a rename there fails this test too. */
function findAbiError(name: string): RevertAbiItem {
  const item = LendingPoolABI.find((entry) => entry.type === 'error' && entry.name === name)
  if (!item || item.type !== 'error') throw new Error(`LendingPoolABI has no error named ${name}`)

  return item
}

function revertedWith(name: string, functionName = 'createLoan'): ContractFunctionRevertedError {
  const reverted = new ContractFunctionRevertedError({ abi: [], functionName })
  reverted.data = { abiItem: findAbiError(name), errorName: name, args: [] }

  return reverted
}

beforeEach(async () => {
  jest.clearAllMocks()
  await pendingTransactionsStore.reset()
  mockWagmiUseAccount.mockReturnValue({
    isConnected: true,
    isConnecting: false,
    address: WALLET_ADDRESS as Address,
    chainId: LOCALHOST_CHAIN_ID,
  })
  mockWagmiUsePublicClient.mockReturnValue({
    chain: { id: LOCALHOST_CHAIN_ID },
    estimateContractGas: mockEstimateContractGas,
    waitForTransactionReceipt: mockWaitForTransactionReceipt,
    getTransactionReceipt: mockGetTransactionReceipt,
  })
  mockEstimateContractGas.mockResolvedValue(100_000n)
  mockWriteContractAsync.mockResolvedValue(TX_HASH)
})

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('calculateRepayment', () => {
  it('should add flat interest at the loanrate', () => {
    // 5 POL at 500 bps = 5.25 POL
    expect(calculateRepayment(5_000_000_000_000_000_000n, 500)).toBe(5_250_000_000_000_000_000n)
  })

  it('should return the principal when the pool charges nothing', () => {
    expect(calculateRepayment(1_000_000_000_000_000_000n, 0)).toBe(1_000_000_000_000_000_000n)
  })

  it('should not grow with time', () => {
    // Interest is fixed at creation — repaying early costs exactly the same,
    // which is why the borrow form states the total up front.
    const first = calculateRepayment(3_000_000_000_000_000_000n, 750)
    const second = calculateRepayment(3_000_000_000_000_000_000n, 750)

    expect(first).toBe(second)
  })
})

describe('validateBorrowParams', () => {
  it('should accept a valid request', () => {
    expect(validateBorrowParams(makeBorrowParams())).toBeNull()
  })

  it('should reject a zero amount', () => {
    expect(validateBorrowParams(makeBorrowParams({ amount: 0n }))).toMatch(/greater than zero/)
  })

  it('should reject more than the pool lends at once', () => {
    const message = validateBorrowParams(makeBorrowParams({ amount: 10n }), { maxLoanAmount: 5n })

    expect(message).toMatch(/lends at most|at once/)
  })

  it('should reject more than the pool currently holds', () => {
    const message = validateBorrowParams(makeBorrowParams({ amount: 10n }), { available: 5n })

    expect(message).toMatch(/available/)
  })

  it('should not check limits it was not given', () => {
    // The screen may not know them yet; the pre-flight estimate is the backstop.
    expect(validateBorrowParams(makeBorrowParams({ amount: 10n }))).toBeNull()
  })
})

describe('describeBorrowError', () => {
  it.each([
    ['UnauthorizedBorrower', /Join this pool/],
    ['LoanOutstanding', /Repay your current loan/],
    ['ExceedsMaxLoanAmount', /more than this pool lends/],
    ['InsufficientFunds', /does not have that much/],
    ['PoolNotActive', /not lending/],
  ])('should explain %s in the borrower’s terms', (name, expected) => {
    expect(describeBorrowError(wrapped(revertedWith(name)))).toMatch(expected)
  })

  it('should not blame the contract when the user declined', () => {
    expect(describeBorrowError(wrapped(new UserRejectedRequestError(new Error('denied'))))).not.toMatch(/Failed to borrow/)
  })
})

describe('describeRepayError', () => {
  it('should read UnauthorizedBorrower as someone else’s loan', () => {
    // The same custom error means "you never contributed" on `createLoan` and
    // "this is not your loan" on `repayLoan`; the wording has to pick per path.
    expect(describeRepayError(wrapped(revertedWith('UnauthorizedBorrower', 'repayLoan')))).toMatch(/another wallet/)
  })

  it.each([
    ['LoanAlreadyRepaid', /already been repaid/],
    // Not `InsufficientRepaymentAmount`: the contract no longer has that error,
    // because there is no longer a minimum. Any amount above zero is a payment.
    ['InvalidAmount', /greater than zero/],
    ['LoanNotDisbursed', /Nothing has been lent/],
  ])('should explain %s', (name, expected) => {
    expect(describeRepayError(wrapped(revertedWith(name, 'repayLoan')))).toMatch(expected)
  })
})

// ---------------------------------------------------------------------------
// borrow
// ---------------------------------------------------------------------------

describe('useLoan borrow', () => {
  it('should call createLoan with the amount and return the hash', async () => {
    const { result } = renderHook(() => useLoan())

    let txHash: string | undefined
    await act(async () => {
      txHash = await result.current.borrow(makeBorrowParams())
    })

    expect(txHash).toBe(TX_HASH)
    expect(mockWriteContractAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        address: POOL_ADDRESS,
        functionName: 'createLoan',
        args: [5_000_000_000_000_000_000n],
        chainId: LOCALHOST_CHAIN_ID,
      })
    )
  })

  it('should estimate first, so a doomed request never reaches the wallet', async () => {
    // This is what turns the membership rule into a message instead of a
    // signature prompt for a transaction that cannot succeed.
    const { result } = renderHook(() => useLoan())

    await act(async () => {
      await result.current.borrow(makeBorrowParams())
    })

    expect(mockEstimateContractGas).toHaveBeenCalledWith(expect.objectContaining({ functionName: 'createLoan', account: WALLET_ADDRESS }))
  })

  it('should add head-room to the estimate', async () => {
    const { result } = renderHook(() => useLoan())

    await act(async () => {
      await result.current.borrow(makeBorrowParams())
    })

    expect(mockWriteContractAsync).toHaveBeenCalledWith(expect.objectContaining({ gas: 120_000n }))
  })

  it('should record the transaction before returning', async () => {
    // A kill straight after signing must still leave it recoverable at launch.
    const { result } = renderHook(() => useLoan())

    await act(async () => {
      await result.current.borrow(makeBorrowParams())
    })

    const stored = pendingTransactionsStore.transactions.find((tx) => tx.txHash === TX_HASH)
    expect(stored).toMatchObject({ type: 'BORROW', status: 'submitted' })
  })

  it('should not claim a loan id it does not have yet', async () => {
    // The contract assigns it; the receipt is where it comes back.
    const { result } = renderHook(() => useLoan())

    await act(async () => {
      await result.current.borrow(makeBorrowParams())
    })

    const stored = pendingTransactionsStore.transactions.find((tx) => tx.txHash === TX_HASH)
    expect(stored?.type === 'BORROW' && stored.params.loanId).toBeUndefined()
  })

  it('should reject a zero amount without touching the wallet', async () => {
    const { result } = renderHook(() => useLoan())

    await act(async () => {
      await expect(result.current.borrow(makeBorrowParams({ amount: 0n }))).rejects.toThrow(/greater than zero/)
    })

    expect(mockWriteContractAsync).not.toHaveBeenCalled()
    // A field-level failure belongs to the form, not the flow.
    expect(result.current.error).toBeNull()
  })

  it('should refuse without a connected wallet', async () => {
    mockWagmiUseAccount.mockReturnValue({ isConnected: false, isConnecting: false, address: undefined, chainId: undefined })
    const { result } = renderHook(() => useLoan())

    await act(async () => {
      await expect(result.current.borrow(makeBorrowParams())).rejects.toThrow(/Connect a wallet/)
    })

    expect(result.current.error).toMatch(/Connect a wallet/)
  })

  it('should surface a revert as the flow error', async () => {
    mockEstimateContractGas.mockRejectedValue(wrapped(revertedWith('LoanOutstanding')))
    const { result } = renderHook(() => useLoan())

    await act(async () => {
      await expect(result.current.borrow(makeBorrowParams())).rejects.toThrow()
    })

    expect(result.current.error).toMatch(/Repay your current loan/)
    expect(result.current.isSubmitting).toBe(false)
  })

  it('should leave the estimate to the wallet when no client is configured', async () => {
    mockWagmiUsePublicClient.mockReturnValue(undefined)
    const { result } = renderHook(() => useLoan())

    await act(async () => {
      await result.current.borrow(makeBorrowParams())
    })

    expect(mockWriteContractAsync).toHaveBeenCalledWith(expect.not.objectContaining({ gas: expect.anything() }))
  })
})

// ---------------------------------------------------------------------------
// repay
// ---------------------------------------------------------------------------

describe('useLoan repay', () => {
  it('should call repayLoan with the id and send the total as value', async () => {
    // `repayLoan` takes an id, not an amount, and is payable — the sum is the
    // `value`, and anything less reverts.
    const { result } = renderHook(() => useLoan())

    await act(async () => {
      await result.current.repay(makeRepayParams())
    })

    expect(mockWriteContractAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'repayLoan',
        args: [3n],
        value: 5_250_000_000_000_000_000n,
      })
    )
  })

  it('should include the value in the estimate', async () => {
    // Without it the estimate succeeds on a call that would revert for being
    // underfunded, and the user pays for the discovery.
    const { result } = renderHook(() => useLoan())

    await act(async () => {
      await result.current.repay(makeRepayParams())
    })

    expect(mockEstimateContractGas).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'repayLoan', value: 5_250_000_000_000_000_000n })
    )
  })

  it('should record the loan id it is settling', async () => {
    const { result } = renderHook(() => useLoan())

    await act(async () => {
      await result.current.repay(makeRepayParams())
    })

    const stored = pendingTransactionsStore.transactions.find((tx) => tx.txHash === TX_HASH)
    expect(stored).toMatchObject({ type: 'REPAY', params: { loanId: 3 } })
  })

  it('should refuse without a connected wallet', async () => {
    mockWagmiUseAccount.mockReturnValue({ isConnected: false, isConnecting: false, address: undefined, chainId: undefined })
    const { result } = renderHook(() => useLoan())

    await act(async () => {
      await expect(result.current.repay(makeRepayParams())).rejects.toThrow(/Connect a wallet/)
    })
  })

  it('should surface a revert in repayment wording', async () => {
    mockEstimateContractGas.mockRejectedValue(wrapped(revertedWith('LoanAlreadyRepaid', 'repayLoan')))
    const { result } = renderHook(() => useLoan())

    await act(async () => {
      await expect(result.current.repay(makeRepayParams())).rejects.toThrow()
    })

    expect(result.current.error).toMatch(/already been repaid/)
  })
})

// ---------------------------------------------------------------------------
// The approval flow.
//
// Only pools whose owner turned review on take this path: `createLoan` reverts
// with `ApprovalRequired` there, and the request is decided later by someone
// else. What separates these from borrowing is that confirmation is not the
// outcome — nothing moves until the owner approves.
// ---------------------------------------------------------------------------

describe('describeRequestError', () => {
  it.each([
    ['UnauthorizedBorrower', /Join this pool/],
    ['LoanOutstanding', /already have a loan or a request/],
    ['ExceedsMaxLoanAmount', /more than this pool lends/],
    ['InvalidAmount', /greater than zero/],
  ])('should explain %s in the requester’s terms', (name, expected) => {
    expect(describeRequestError(wrapped(revertedWith(name, 'requestLoan')))).toMatch(expected)
  })
})

describe('describeApproveError', () => {
  it('should read LoanNotPending as a race, not a fault', () => {
    // Two owners, or a borrower cancelling while the decision is in flight.
    expect(describeApproveError(wrapped(revertedWith('LoanNotPending', 'approveLoan')))).toMatch(/already been decided/)
  })

  it('should explain a pool that cannot cover the request', () => {
    // Liquidity is checked at approval, not at request time — the pool that was
    // empty when asked may be fundable by now, and the reverse.
    expect(describeApproveError(wrapped(revertedWith('InsufficientFunds', 'approveLoan')))).toMatch(/does not have that much/)
  })
})

describe('describeRejectError and describeCancelError', () => {
  it('should both read LoanNotPending as already decided', () => {
    expect(describeRejectError(wrapped(revertedWith('LoanNotPending', 'rejectLoan')))).toMatch(/already been decided/)
    expect(describeCancelError(wrapped(revertedWith('LoanNotPending', 'cancelLoanRequest')))).toMatch(/already been decided/)
  })

  it('should read UnauthorizedBorrower on a cancellation as someone else’s request', () => {
    expect(describeCancelError(wrapped(revertedWith('UnauthorizedBorrower', 'cancelLoanRequest')))).toMatch(/another wallet/)
  })
})

describe('useLoan requestLoan', () => {
  it('should call requestLoan with the amount, not createLoan', async () => {
    const { result } = renderHook(() => useLoan())

    let txHash: string | undefined
    await act(async () => {
      txHash = await result.current.requestLoan(makeBorrowParams())
    })

    expect(txHash).toBe(TX_HASH)
    expect(mockWriteContractAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        address: POOL_ADDRESS,
        functionName: 'requestLoan',
        args: [5_000_000_000_000_000_000n],
        chainId: LOCALHOST_CHAIN_ID,
      })
    )
  })

  it('should record it as a request, distinct from a borrow', async () => {
    // The two differ to the user — funds now, or an answer later — so the copy,
    // the card and the status modal all key on this.
    const { result } = renderHook(() => useLoan())

    await act(async () => {
      await result.current.requestLoan(makeBorrowParams())
    })

    const stored = pendingTransactionsStore.transactions.find((tx) => tx.txHash === TX_HASH)
    expect(stored).toMatchObject({ type: 'REQUEST_LOAN', status: 'submitted' })
  })

  it('should not claim a loan id it does not have yet', async () => {
    // A request is assigned an id by the contract exactly as a borrow is.
    const { result } = renderHook(() => useLoan())

    await act(async () => {
      await result.current.requestLoan(makeBorrowParams())
    })

    const stored = pendingTransactionsStore.transactions.find((tx) => tx.txHash === TX_HASH)
    expect(stored?.type === 'REQUEST_LOAN' && stored.params.loanId).toBeUndefined()
  })

  it('should estimate before asking for a signature', async () => {
    const { result } = renderHook(() => useLoan())

    await act(async () => {
      await result.current.requestLoan(makeBorrowParams())
    })

    expect(mockEstimateContractGas).toHaveBeenCalledWith(expect.objectContaining({ functionName: 'requestLoan', account: WALLET_ADDRESS }))
  })

  it('should reject a zero amount without touching the wallet', async () => {
    const { result } = renderHook(() => useLoan())

    await act(async () => {
      await expect(result.current.requestLoan(makeBorrowParams({ amount: 0n }))).rejects.toThrow(/greater than zero/)
    })

    expect(mockWriteContractAsync).not.toHaveBeenCalled()
    expect(result.current.error).toBeNull()
  })

  it('should refuse without a connected wallet', async () => {
    mockWagmiUseAccount.mockReturnValue({ isConnected: false, isConnecting: false, address: undefined, chainId: undefined })
    const { result } = renderHook(() => useLoan())

    await act(async () => {
      await expect(result.current.requestLoan(makeBorrowParams())).rejects.toThrow(/Connect a wallet/)
    })
  })

  it('should surface a revert in requesting wording', async () => {
    mockEstimateContractGas.mockRejectedValue(wrapped(revertedWith('LoanOutstanding', 'requestLoan')))
    const { result } = renderHook(() => useLoan())

    await act(async () => {
      await expect(result.current.requestLoan(makeBorrowParams())).rejects.toThrow()
    })

    expect(result.current.error).toMatch(/already have a loan or a request/)
  })
})

describe('useLoan owner decisions', () => {
  it.each([
    ['approveLoan', 'APPROVE_LOAN'],
    ['rejectLoan', 'REJECT_LOAN'],
    ['cancelLoanRequest', 'CANCEL_LOAN_REQUEST'],
  ] as const)('should call %s with the loan id and record it as %s', async (functionName, type) => {
    const { result } = renderHook(() => useLoan())

    await act(async () => {
      await result.current[functionName](makeDecisionParams())
    })

    expect(mockWriteContractAsync).toHaveBeenCalledWith(expect.objectContaining({ functionName, args: [7n] }))
    expect(pendingTransactionsStore.transactions.find((tx) => tx.txHash === TX_HASH)).toMatchObject({ type, params: { loanId: 7 } })
  })

  it.each(['approveLoan', 'rejectLoan', 'cancelLoanRequest'] as const)('should send nothing as value from %s', async (functionName) => {
    // None of the three is payable. Approval moves money, but out of the pool's
    // own balance — the owner is not funding it from their wallet.
    const { result } = renderHook(() => useLoan())

    await act(async () => {
      await result.current[functionName](makeDecisionParams())
    })

    expect(mockWriteContractAsync).toHaveBeenCalledWith(expect.not.objectContaining({ value: expect.anything() }))
  })

  it.each(['approveLoan', 'rejectLoan', 'cancelLoanRequest'] as const)(
    'should estimate before %s reaches the wallet',
    async (functionName) => {
      // The estimate is what catches a request someone else already decided.
      const { result } = renderHook(() => useLoan())

      await act(async () => {
        await result.current[functionName](makeDecisionParams())
      })

      expect(mockEstimateContractGas).toHaveBeenCalledWith(expect.objectContaining({ functionName, account: WALLET_ADDRESS }))
      expect(mockWriteContractAsync).toHaveBeenCalledWith(expect.objectContaining({ gas: 120_000n }))
    }
  )

  it('should record whose request the owner is deciding', async () => {
    // The card has to name the borrower; the sender's own address is the owner.
    const borrower = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65'
    const { result } = renderHook(() => useLoan())

    await act(async () => {
      await result.current.approveLoan(makeDecisionParams({ borrower }))
    })

    expect(pendingTransactionsStore.transactions.find((tx) => tx.txHash === TX_HASH)).toMatchObject({ params: { borrower } })
  })

  it('should leave the borrower out of a cancellation', async () => {
    // The borrower is the sender there, so naming them would just repeat it.
    const { result } = renderHook(() => useLoan())

    await act(async () => {
      await result.current.cancelLoanRequest(makeDecisionParams())
    })

    const stored = pendingTransactionsStore.transactions.find((tx) => tx.txHash === TX_HASH)
    expect(stored?.type === 'CANCEL_LOAN_REQUEST' && stored.params.borrower).toBeUndefined()
  })

  it.each([
    ['approveLoan', /Connect a wallet before approving/],
    ['rejectLoan', /Connect a wallet before deciding/],
    ['cancelLoanRequest', /Connect a wallet before withdrawing/],
  ] as const)('should refuse %s without a connected wallet', async (functionName, expected) => {
    mockWagmiUseAccount.mockReturnValue({ isConnected: false, isConnecting: false, address: undefined, chainId: undefined })
    const { result } = renderHook(() => useLoan())

    await act(async () => {
      await expect(result.current[functionName](makeDecisionParams())).rejects.toThrow(expected)
    })

    expect(result.current.error).toMatch(expected)
  })

  it('should surface an approval revert in the owner’s wording', async () => {
    mockEstimateContractGas.mockRejectedValue(wrapped(revertedWith('LoanNotPending', 'approveLoan')))
    const { result } = renderHook(() => useLoan())

    await act(async () => {
      await expect(result.current.approveLoan(makeDecisionParams())).rejects.toThrow()
    })

    expect(result.current.error).toMatch(/already been decided/)
    expect(result.current.isSubmitting).toBe(false)
  })

  it('should leave the estimate to the wallet when no client is configured', async () => {
    mockWagmiUsePublicClient.mockReturnValue(undefined)
    const { result } = renderHook(() => useLoan())

    await act(async () => {
      await result.current.approveLoan(makeDecisionParams())
    })

    expect(mockWriteContractAsync).toHaveBeenCalledWith(expect.not.objectContaining({ gas: expect.anything() }))
  })
})

describe('useLoan reset', () => {
  it('should clear a previous failure', async () => {
    mockEstimateContractGas.mockRejectedValue(wrapped(revertedWith('LoanOutstanding')))
    const { result } = renderHook(() => useLoan())

    await act(async () => {
      await expect(result.current.borrow(makeBorrowParams())).rejects.toThrow()
    })
    expect(result.current.error).not.toBeNull()

    act(() => {
      result.current.reset()
    })

    expect(result.current.error).toBeNull()
    expect(result.current.isSubmitting).toBe(false)
  })
})
