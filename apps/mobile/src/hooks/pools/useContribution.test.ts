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
import { type ContributionParams, describeContributionError, useContribution, validateContributionParams } from './useContribution'

const POOL_ADDRESS = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0'
const WALLET_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const TX_HASH = '0xaaaa000000000000000000000000000000000000000000000000000000000001'
const LOCALHOST_CHAIN_ID = 31337
const AMOY_CHAIN_ID = 80002

jest.mock('../../config/contracts', () => ({
  DEFAULT_CHAIN_ID: 31337,
  getPoolFactoryAddress: jest.fn(),
}))

function makeParams(overrides: Partial<ContributionParams> = {}): ContributionParams {
  return {
    poolId: 1,
    poolAddress: POOL_ADDRESS,
    poolName: 'Neighbourhood Fund',
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
  const reverted = new ContractFunctionRevertedError({ abi: [], functionName: 'depositFunds' })
  reverted.data = { abiItem: findAbiError(name), errorName: name, args: [] }

  return reverted
}

// ---------------------------------------------------------------------------

describe('validateContributionParams', () => {
  it('accepts a positive amount', () => {
    expect(validateContributionParams(makeParams())).toBeNull()
  })

  it.each([
    ['a zero amount', 0n],
    ['a negative amount', -1n],
  ])('rejects %s', (_label, amount) => {
    expect(validateContributionParams(makeParams({ amount }))).toBe('Enter an amount greater than zero')
  })
})

describe('describeContributionError', () => {
  it('reports a rejected signature as a cancellation', () => {
    expect(describeContributionError(wrapped(new UserRejectedRequestError(new Error('denied'))))).toBe('Transaction cancelled')
  })

  it('reports an unaffordable transaction', () => {
    expect(describeContributionError(wrapped(new InsufficientFundsError()))).toBe('Insufficient balance for gas')
  })

  it.each([
    ['InvalidAmount', 'Enter an amount greater than zero'],
    ['EnforcedPause', 'This pool is not accepting contributions at the moment'],
  ])('translates the %s revert', (name, expected) => {
    expect(describeContributionError(wrapped(revertedWith(name)))).toBe(expected)
  })

  it('falls back to the message for a plain Error', () => {
    expect(describeContributionError(new Error('socket hang up'))).toBe('socket hang up')
  })

  it('falls back to a generic message for a non-Error', () => {
    expect(describeContributionError('nope')).toBe('Failed to contribute')
  })
})

// ---------------------------------------------------------------------------

describe('useContribution', () => {
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
    const { result } = renderHook(() => useContribution())

    expect(result.current.isSubmitting).toBe(false)
    expect(result.current.error).toBeNull()
  })

  describe('the happy path', () => {
    it('sends depositFunds with the amount as value', async () => {
      const { result } = renderHook(() => useContribution())

      await act(async () => {
        await result.current.contribute(makeParams())
      })

      expect(mockWriteContractAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          address: POOL_ADDRESS,
          abi: LendingPoolABI,
          functionName: 'depositFunds',
          value: 5_000_000_000_000_000_000n,
          chainId: LOCALHOST_CHAIN_ID,
        })
      )
    })

    it('sends to the pool, not to the factory', async () => {
      // `depositFunds` lives on the pool clone; the factory has no such method.
      const { result } = renderHook(() => useContribution())

      await act(async () => {
        await result.current.contribute(makeParams({ poolAddress: '0x1111111111111111111111111111111111111111' }))
      })

      expect(mockWriteContractAsync).toHaveBeenCalledWith(
        expect.objectContaining({ address: '0x1111111111111111111111111111111111111111' })
      )
    })

    it('never calls a backend preparation step', async () => {
      // Deposits need no whitelisting: the factory's creator list governs who
      // may create a pool, not who may fund one.
      const { result } = renderHook(() => useContribution())

      await act(async () => {
        await result.current.contribute(makeParams())
      })

      expect(mockEstimateContractGas).toHaveBeenCalled()
      expect(result.current.error).toBeNull()
    })

    it('estimates with the value included, so an unaffordable deposit is caught before signing', async () => {
      const { result } = renderHook(() => useContribution())

      await act(async () => {
        await result.current.contribute(makeParams())
      })

      expect(mockEstimateContractGas).toHaveBeenCalledWith(
        expect.objectContaining({
          address: POOL_ADDRESS,
          functionName: 'depositFunds',
          value: 5_000_000_000_000_000_000n,
          account: WALLET_ADDRESS,
        })
      )
    })

    it('adds 20% head-room to the estimated gas', async () => {
      const { result } = renderHook(() => useContribution())

      await act(async () => {
        await result.current.contribute(makeParams())
      })

      expect(mockWriteContractAsync).toHaveBeenCalledWith(expect.objectContaining({ gas: 120_000n }))
    })

    it('returns the transaction hash', async () => {
      const { result } = renderHook(() => useContribution())

      let txHash
      await act(async () => {
        txHash = await result.current.contribute(makeParams())
      })

      expect(txHash).toBe(TX_HASH)
      expect(result.current.isSubmitting).toBe(false)
    })

    it('records the transaction so a kill after signing is still recoverable', async () => {
      const { result } = renderHook(() => useContribution())

      await act(async () => {
        await result.current.contribute(makeParams())
      })

      expect(pendingTransactionsStore.transactions).toHaveLength(1)
      const [stored] = pendingTransactionsStore.transactions
      expect(stored.type).toBe('CONTRIBUTE')
      expect(stored.status).toBe('submitted')
      expect(stored.chainId).toBe(LOCALHOST_CHAIN_ID)
      expect(stored.params).toEqual({
        poolId: 1,
        poolAddress: POOL_ADDRESS,
        poolName: 'Neighbourhood Fund',
        // A decimal string, not a bigint: the record is persisted as JSON.
        amount: '5000000000000000000',
      })
    })

    it('falls back to the default chain when the wallet reports none', async () => {
      mockWagmiUseAccount.mockReturnValue({
        isConnected: true,
        isConnecting: false,
        address: WALLET_ADDRESS as Address,
        chainId: undefined,
      })
      const { result } = renderHook(() => useContribution())

      await act(async () => {
        await result.current.contribute(makeParams())
      })

      expect(mockWriteContractAsync).toHaveBeenCalledWith(expect.objectContaining({ chainId: LOCALHOST_CHAIN_ID }))
    })

    it('uses the chain the wallet is on', async () => {
      mockWagmiUseAccount.mockReturnValue({
        isConnected: true,
        isConnecting: false,
        address: WALLET_ADDRESS as Address,
        chainId: AMOY_CHAIN_ID,
      })
      const { result } = renderHook(() => useContribution())

      await act(async () => {
        await result.current.contribute(makeParams())
      })

      expect(mockWriteContractAsync).toHaveBeenCalledWith(expect.objectContaining({ chainId: AMOY_CHAIN_ID }))
      expect(pendingTransactionsStore.transactions[0].chainId).toBe(AMOY_CHAIN_ID)
    })

    it('leaves the estimate to the wallet when no client is configured', async () => {
      mockWagmiUsePublicClient.mockReturnValue(undefined)
      const { result } = renderHook(() => useContribution())

      await act(async () => {
        await result.current.contribute(makeParams())
      })

      expect(mockWriteContractAsync).toHaveBeenCalledWith(expect.not.objectContaining({ gas: expect.anything() }))
    })
  })

  describe('failures', () => {
    it('rejects an invalid amount without setting error, leaving that to the form', async () => {
      const { result } = renderHook(() => useContribution())

      await act(async () => {
        await expect(result.current.contribute(makeParams({ amount: 0n }))).rejects.toThrow('Enter an amount greater than zero')
      })

      expect(result.current.error).toBeNull()
      expect(mockWriteContractAsync).not.toHaveBeenCalled()
    })

    it('refuses to run without a connected wallet', async () => {
      mockWagmiUseAccount.mockReturnValue({ isConnected: false, isConnecting: false, address: undefined, chainId: undefined })
      const { result } = renderHook(() => useContribution())

      await act(async () => {
        await expect(result.current.contribute(makeParams())).rejects.toThrow('Connect a wallet before contributing')
      })

      expect(result.current.error).toBe('Connect a wallet before contributing')
      expect(mockWriteContractAsync).not.toHaveBeenCalled()
    })

    it('reports a rejected signature and stores nothing', async () => {
      mockWriteContractAsync.mockRejectedValue(wrapped(new UserRejectedRequestError(new Error('denied'))))
      const { result } = renderHook(() => useContribution())

      await act(async () => {
        await expect(result.current.contribute(makeParams())).rejects.toThrow('Transaction cancelled')
      })

      expect(result.current.error).toBe('Transaction cancelled')
      expect(pendingTransactionsStore.transactions).toHaveLength(0)
      expect(result.current.isSubmitting).toBe(false)
    })

    it('reports a failed estimate without asking the user to sign', async () => {
      mockEstimateContractGas.mockRejectedValue(wrapped(revertedWith('EnforcedPause')))
      const { result } = renderHook(() => useContribution())

      await act(async () => {
        await expect(result.current.contribute(makeParams())).rejects.toThrow('This pool is not accepting contributions')
      })

      expect(mockWriteContractAsync).not.toHaveBeenCalled()
    })
  })

  describe('reset', () => {
    it('clears a previous error', async () => {
      mockWriteContractAsync.mockRejectedValue(new Error('socket hang up'))
      const { result } = renderHook(() => useContribution())

      await act(async () => {
        await expect(result.current.contribute(makeParams())).rejects.toThrow()
      })
      expect(result.current.error).not.toBeNull()

      act(() => result.current.reset())

      expect(result.current.error).toBeNull()
      expect(result.current.isSubmitting).toBe(false)
    })
  })
})
