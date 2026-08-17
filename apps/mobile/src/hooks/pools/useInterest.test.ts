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
import { type ClaimInterestParams, describeClaimInterestError, useInterest } from './useInterest'
import { NATIVE } from '../../__tests__/fixtures/denomination'

const POOL_ADDRESS = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0'
const WALLET_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const TX_HASH = '0xaaaa000000000000000000000000000000000000000000000000000000000001'
const LOCALHOST_CHAIN_ID = 31337

jest.mock('../../config/contracts', () => ({
  DEFAULT_CHAIN_ID: 31337,
  getPoolFactoryAddress: jest.fn(),
}))

function makeParams(overrides: Partial<ClaimInterestParams> = {}): ClaimInterestParams {
  return {
    poolId: 1,
    poolAddress: POOL_ADDRESS,
    poolName: 'Neighbourhood Fund',
    denomination: NATIVE,
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
  const reverted = new ContractFunctionRevertedError({ abi: [], functionName: 'claimInterest' })
  reverted.data = { abiItem: findAbiError(name), errorName: name, args: [] }

  return reverted
}

// ---------------------------------------------------------------------------

describe('describeClaimInterestError', () => {
  it('reports a rejected signature as a cancellation', () => {
    expect(describeClaimInterestError(wrapped(new UserRejectedRequestError(new Error('denied'))))).toBe('Transaction cancelled')
  })

  it('reports an unaffordable transaction', () => {
    expect(describeClaimInterestError(wrapped(new InsufficientFundsError()))).toBe('Insufficient balance for gas')
  })

  it.each([
    ['NothingToClaim', 'You have no interest to claim from this pool yet'],
    ['InsufficientLiquidity', 'The pool has lent out too much to pay your interest right now — try again once a loan is repaid'],
    ['EnforcedPause', 'This pool is not processing claims at the moment'],
    ['TransferFailed', 'The transfer back to your wallet failed'],
  ])('translates the %s revert', (name, expected) => {
    expect(describeClaimInterestError(wrapped(revertedWith(name)))).toBe(expected)
  })

  it('says the interest is still there when the pool cannot pay yet', () => {
    // The claim is delayed, not lost — the wording has to carry that, or someone
    // reads a temporary shortfall as their earnings having vanished.
    expect(describeClaimInterestError(wrapped(revertedWith('InsufficientLiquidity')))).toMatch(/once a loan is repaid/)
  })

  it('falls back to a generic message for a non-Error', () => {
    expect(describeClaimInterestError('nope')).toBe('Failed to claim interest')
  })
})

// ---------------------------------------------------------------------------

describe('useInterest', () => {
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
    const { result } = renderHook(() => useInterest())

    expect(result.current.isSubmitting).toBe(false)
    expect(result.current.error).toBeNull()
  })

  describe('the happy path', () => {
    it('sends claimInterest with no arguments and no value', async () => {
      // The contract pays out everything owed; there is no amount to pass, and
      // nothing leaves the wallet but gas.
      const { result } = renderHook(() => useInterest())

      await act(async () => {
        await result.current.claimInterest(makeParams())
      })

      expect(mockWriteContractAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          address: POOL_ADDRESS,
          abi: LendingPoolABI,
          functionName: 'claimInterest',
          args: [],
          chainId: LOCALHOST_CHAIN_ID,
        })
      )
      expect(mockWriteContractAsync).toHaveBeenCalledWith(expect.not.objectContaining({ value: expect.anything() }))
    })

    it('sends to the pool, not to the factory', async () => {
      const { result } = renderHook(() => useInterest())

      await act(async () => {
        await result.current.claimInterest(makeParams({ poolAddress: '0x1111111111111111111111111111111111111111' }))
      })

      expect(mockWriteContractAsync).toHaveBeenCalledWith(
        expect.objectContaining({ address: '0x1111111111111111111111111111111111111111' })
      )
    })

    it('estimates before signing, so a pool without claimInterest is caught early', async () => {
      const { result } = renderHook(() => useInterest())

      await act(async () => {
        await result.current.claimInterest(makeParams())
      })

      expect(mockEstimateContractGas).toHaveBeenCalledWith(
        expect.objectContaining({
          address: POOL_ADDRESS,
          functionName: 'claimInterest',
          args: [],
          account: WALLET_ADDRESS,
        })
      )
    })

    it('adds 20% head-room to the estimated gas', async () => {
      const { result } = renderHook(() => useInterest())

      await act(async () => {
        await result.current.claimInterest(makeParams())
      })

      expect(mockWriteContractAsync).toHaveBeenCalledWith(expect.objectContaining({ gas: 120_000n }))
    })

    it('returns the transaction hash', async () => {
      const { result } = renderHook(() => useInterest())

      let txHash
      await act(async () => {
        txHash = await result.current.claimInterest(makeParams())
      })

      expect(txHash).toBe(TX_HASH)
    })

    it('records the transaction as CLAIM_INTEREST, with no amount', async () => {
      // The type is what picks the result extractor later; the wrong one finds
      // no log, and "no log" is read as failure. There is no amount to record
      // because the figure only exists once the receipt is decoded.
      const { result } = renderHook(() => useInterest())

      await act(async () => {
        await result.current.claimInterest(makeParams())
      })

      const [recorded] = pendingTransactionsStore.transactions
      expect(recorded.type).toBe('CLAIM_INTEREST')
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
      })
    })
  })

  describe('failures', () => {
    it('refuses to submit without a wallet', async () => {
      mockWagmiUseAccount.mockReturnValue({ isConnected: false, isConnecting: false, address: undefined, chainId: undefined })

      const { result } = renderHook(() => useInterest())

      await act(async () => {
        await expect(result.current.claimInterest(makeParams())).rejects.toThrow('Connect a wallet before claiming')
      })

      expect(mockWriteContractAsync).not.toHaveBeenCalled()
    })

    it('surfaces a revert and records nothing', async () => {
      mockWriteContractAsync.mockRejectedValue(wrapped(revertedWith('InsufficientLiquidity')))

      const { result } = renderHook(() => useInterest())

      await act(async () => {
        await expect(result.current.claimInterest(makeParams())).rejects.toThrow()
      })

      expect(result.current.error).toBe('The pool has lent out too much to pay your interest right now — try again once a loan is repaid')
      expect(result.current.isSubmitting).toBe(false)
      expect(pendingTransactionsStore.transactions).toHaveLength(0)
    })

    it('clears the error on reset', async () => {
      mockWriteContractAsync.mockRejectedValue(new Error('socket hang up'))

      const { result } = renderHook(() => useInterest())

      await act(async () => {
        await expect(result.current.claimInterest(makeParams())).rejects.toThrow()
      })
      expect(result.current.error).toBe('socket hang up')

      act(() => result.current.reset())
      expect(result.current.error).toBeNull()
    })
  })
})
