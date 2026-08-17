import { act, renderHook } from '@testing-library/react-native'
import { type Address, BaseError, ContractFunctionRevertedError, InsufficientFundsError, UserRejectedRequestError } from 'viem'
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
import { describeWithdrawalError, useWithdrawal, validateWithdrawalParams, type WithdrawalParams } from './useWithdrawal'
import { NATIVE } from '../../__tests__/fixtures/denomination'

const POOL_ADDRESS = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0'
const WALLET_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const TX_HASH = '0xaaaa000000000000000000000000000000000000000000000000000000000001'
const LOCALHOST_CHAIN_ID = 31337

jest.mock('../../config/contracts', () => ({
  DEFAULT_CHAIN_ID: 31337,
  getPoolFactoryAddress: jest.fn(),
}))

function makeParams(overrides: Partial<WithdrawalParams> = {}): WithdrawalParams {
  return {
    poolId: 1,
    poolAddress: POOL_ADDRESS,
    poolName: 'Neighbourhood Fund',
    denomination: NATIVE,
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

function revertedWith(name: string): ContractFunctionRevertedError {
  const reverted = new ContractFunctionRevertedError({ abi: [], functionName: 'withdraw' })
  reverted.data = { abiItem: findAbiError(name), errorName: name, args: [] }

  return reverted
}

// ---------------------------------------------------------------------------

describe('validateWithdrawalParams', () => {
  it('accepts a positive amount', () => {
    expect(validateWithdrawalParams(makeParams())).toBeNull()
  })

  it.each([
    ['a zero amount', 0n],
    ['a negative amount', -1n],
  ])('rejects %s', (_label, amount) => {
    expect(validateWithdrawalParams(makeParams({ amount }))).toBe('Enter an amount greater than zero')
  })

  it('rejects more than the chain says is withdrawable', () => {
    expect(validateWithdrawalParams(makeParams({ amount: 6n }), 5n)).toBe('That is more than you can withdraw right now')
  })

  it('accepts exactly the withdrawable amount', () => {
    expect(validateWithdrawalParams(makeParams({ amount: 5n }), 5n)).toBeNull()
  })

  it('skips the cap when the chain value is unknown', () => {
    expect(validateWithdrawalParams(makeParams({ amount: 10n }), undefined)).toBeNull()
  })
})

describe('describeWithdrawalError', () => {
  it('reports a rejected signature as a cancellation', () => {
    expect(describeWithdrawalError(wrapped(new UserRejectedRequestError(new Error('denied'))))).toBe('Transaction cancelled')
  })

  it('reports an unaffordable transaction', () => {
    expect(describeWithdrawalError(wrapped(new InsufficientFundsError()))).toBe('Insufficient balance for gas')
  })

  it.each([
    ['InvalidAmount', 'Enter an amount greater than zero'],
    ['InsufficientBalance', 'That is more than you have in this pool'],
    ['InsufficientLiquidity', 'The pool has lent out too much to cover that right now — try a smaller amount'],
    ['LoanOutstanding', 'Repay your loan from this pool before withdrawing'],
    ['EnforcedPause', 'This pool is not processing withdrawals at the moment'],
  ])('translates the %s revert', (name, expected) => {
    expect(describeWithdrawalError(wrapped(revertedWith(name)))).toBe(expected)
  })

  it('keeps the two "not enough" cases distinct', () => {
    // One says you never had it, the other says the pool cannot pay yet. They
    // call for different actions, so collapsing them would mislead.
    expect(describeWithdrawalError(wrapped(revertedWith('InsufficientBalance')))).not.toBe(
      describeWithdrawalError(wrapped(revertedWith('InsufficientLiquidity')))
    )
  })

  it('falls back to a generic message for a non-Error', () => {
    expect(describeWithdrawalError('nope')).toBe('Failed to withdraw')
  })
})

// ---------------------------------------------------------------------------

describe('useWithdrawal', () => {
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

  it('starts idle', () => {
    const { result } = renderHook(() => useWithdrawal())

    expect(result.current.isSubmitting).toBe(false)
    expect(result.current.error).toBeNull()
  })

  describe('the happy path', () => {
    it('sends withdraw with the amount as an argument, not as value', async () => {
      // The pool pays the caller, so nothing leaves the wallet but gas.
      const { result } = renderHook(() => useWithdrawal())

      await act(async () => {
        await result.current.withdraw(makeParams())
      })

      expect(mockWriteContractAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          address: POOL_ADDRESS,
          abi: LendingPoolABI,
          functionName: 'withdraw',
          args: [5_000_000_000_000_000_000n],
          chainId: LOCALHOST_CHAIN_ID,
        })
      )
      expect(mockWriteContractAsync).toHaveBeenCalledWith(expect.not.objectContaining({ value: expect.anything() }))
    })

    it('sends to the pool, not to the factory', async () => {
      const { result } = renderHook(() => useWithdrawal())

      await act(async () => {
        await result.current.withdraw(makeParams({ poolAddress: '0x1111111111111111111111111111111111111111' }))
      })

      expect(mockWriteContractAsync).toHaveBeenCalledWith(
        expect.objectContaining({ address: '0x1111111111111111111111111111111111111111' })
      )
    })

    it('estimates before signing, so a pool without withdraw is caught early', async () => {
      // Pools are minimal-proxy clones: one created before the v2 implementation
      // has no `withdraw` at all, and the estimate is what turns that into a
      // message rather than a doomed signature prompt.
      const { result } = renderHook(() => useWithdrawal())

      await act(async () => {
        await result.current.withdraw(makeParams())
      })

      expect(mockEstimateContractGas).toHaveBeenCalledWith(
        expect.objectContaining({
          address: POOL_ADDRESS,
          functionName: 'withdraw',
          args: [5_000_000_000_000_000_000n],
          account: WALLET_ADDRESS,
        })
      )
    })

    it('adds 20% head-room to the estimated gas', async () => {
      const { result } = renderHook(() => useWithdrawal())

      await act(async () => {
        await result.current.withdraw(makeParams())
      })

      expect(mockWriteContractAsync).toHaveBeenCalledWith(expect.objectContaining({ gas: 120_000n }))
    })

    it('returns the transaction hash', async () => {
      const { result } = renderHook(() => useWithdrawal())

      let txHash
      await act(async () => {
        txHash = await result.current.withdraw(makeParams())
      })

      expect(txHash).toBe(TX_HASH)
    })

    it('records the transaction as WITHDRAW before returning', async () => {
      // The type is what picks the result extractor later; the wrong one finds
      // no log, and "no log" is read as failure.
      const { result } = renderHook(() => useWithdrawal())

      await act(async () => {
        await result.current.withdraw(makeParams())
      })

      const [recorded] = pendingTransactionsStore.transactions
      expect(recorded.type).toBe('WITHDRAW')
      expect(recorded.txHash).toBe(TX_HASH)
      expect(recorded.status).toBe('submitted')
      expect(recorded.chainId).toBe(LOCALHOST_CHAIN_ID)
      // On the record itself, not in its params: every pending transaction is
      // denominated, and a card has to read it without knowing the type.
      expect(recorded.denomination).toEqual(NATIVE)
      expect(recorded.params).toEqual({
        poolId: 1,
        poolAddress: POOL_ADDRESS,
        poolName: 'Neighbourhood Fund',
        amount: '5000000000000000000',
      })
    })
  })

  describe('failures', () => {
    it('refuses to submit without a wallet', async () => {
      mockWagmiUseAccount.mockReturnValue({ isConnected: false, isConnecting: false, address: undefined, chainId: undefined })

      const { result } = renderHook(() => useWithdrawal())

      await act(async () => {
        await expect(result.current.withdraw(makeParams())).rejects.toThrow('Connect a wallet before withdrawing')
      })

      expect(mockWriteContractAsync).not.toHaveBeenCalled()
    })

    it('throws a validation failure without setting error, leaving it to the form', async () => {
      const { result } = renderHook(() => useWithdrawal())

      await act(async () => {
        await expect(result.current.withdraw(makeParams({ amount: 0n }))).rejects.toThrow('Enter an amount greater than zero')
      })

      expect(result.current.error).toBeNull()
      expect(mockWriteContractAsync).not.toHaveBeenCalled()
    })

    it('surfaces a revert and records nothing', async () => {
      mockWriteContractAsync.mockRejectedValue(wrapped(revertedWith('InsufficientLiquidity')))

      const { result } = renderHook(() => useWithdrawal())

      await act(async () => {
        await expect(result.current.withdraw(makeParams())).rejects.toThrow()
      })

      expect(result.current.error).toBe('The pool has lent out too much to cover that right now — try a smaller amount')
      expect(result.current.isSubmitting).toBe(false)
      expect(pendingTransactionsStore.transactions).toHaveLength(0)
    })

    it('clears the error on reset', async () => {
      mockWriteContractAsync.mockRejectedValue(new Error('socket hang up'))

      const { result } = renderHook(() => useWithdrawal())

      await act(async () => {
        await expect(result.current.withdraw(makeParams())).rejects.toThrow()
      })
      expect(result.current.error).toBe('socket hang up')

      act(() => result.current.reset())
      expect(result.current.error).toBeNull()
    })
  })
})
