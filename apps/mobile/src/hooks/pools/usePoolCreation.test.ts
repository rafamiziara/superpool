import { act, renderHook } from '@testing-library/react-native'
import { type Address, BaseError, ContractFunctionRevertedError, InsufficientFundsError, UserRejectedRequestError } from 'viem'
import {
  mockEstimateContractGas,
  mockFirebaseCallable,
  mockGetTransactionReceipt,
  mockWagmiUseAccount,
  mockWagmiUsePublicClient,
  mockWaitForTransactionReceipt,
  mockWriteContractAsync,
} from '../../__tests__/mocks'
import { PoolFactoryABI } from '../../constants/abis'
import { pendingTransactionsStore } from '../../stores/PendingTransactionsStore'
import { describePoolCreationError, type PoolCreationParams, usePoolCreation, validatePoolCreationParams } from './usePoolCreation'

const FACTORY_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
const WALLET_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const TX_HASH = '0xaaaa000000000000000000000000000000000000000000000000000000000001'
const LOCALHOST_CHAIN_ID = 31337
const AMOY_CHAIN_ID = 80002

// The factory address is read from the environment when config/contracts is first
// imported, so it has to be set before that module is loaded.
jest.mock('../../config/contracts', () => ({
  DEFAULT_CHAIN_ID: 31337,
  getPoolFactoryAddress: jest.fn((chainId: number) => (chainId === 31337 ? '0x5FbDB2315678afecb367f032d93F642f64180aa3' : undefined)),
}))

const { getPoolFactoryAddress } = jest.requireMock<{ getPoolFactoryAddress: jest.Mock }>('../../config/contracts')

function makeParams(overrides: Partial<PoolCreationParams> = {}): PoolCreationParams {
  return {
    name: 'Neighbourhood Fund',
    description: 'Micro-loans for the block',
    maxLoanAmount: 1_000_000_000_000_000_000n,
    interestRate: 500,
    loanDuration: 2_592_000,
    requiresMembership: false,
    ...overrides,
  }
}

/** Wraps a cause the way Viem does, so `BaseError.walk` has something to find. */
function wrapped(cause: Error): BaseError {
  return new BaseError('Contract write failed', { cause: new BaseError('inner', { cause }) })
}

/** The ABI item Viem attaches to a decoded revert. */
type RevertAbiItem = NonNullable<ContractFunctionRevertedError['data']>['abiItem']

/** Looks the error up in the shipped ABI, so a rename there fails this test too. */
function findAbiError(name: string): RevertAbiItem {
  const item = PoolFactoryABI.find((entry) => entry.type === 'error' && entry.name === name)
  if (!item || item.type !== 'error') throw new Error(`PoolFactoryABI has no error named ${name}`)

  return item
}

/** A revert of `error` as Viem reports it from a failed call. */
function revertedWith(name: string): ContractFunctionRevertedError {
  const reverted = new ContractFunctionRevertedError({ abi: [], functionName: 'createPool' })
  reverted.data = { abiItem: findAbiError(name), errorName: name, args: [] }

  return reverted
}

describe('validatePoolCreationParams', () => {
  it('accepts valid params', () => {
    expect(validatePoolCreationParams(makeParams())).toBeNull()
  })

  it.each([
    ['an empty name', { name: '' }, 'Pool name is required'],
    ['a whitespace-only name', { name: '   ' }, 'Pool name is required'],
    ['a zero loan amount', { maxLoanAmount: 0n }, 'Maximum loan amount must be greater than zero'],
    ['a negative loan amount', { maxLoanAmount: -1n }, 'Maximum loan amount must be greater than zero'],
    ['a negative rate', { interestRate: -1 }, 'Interest rate must be a whole number of basis points'],
    ['a fractional rate', { interestRate: 5.5 }, 'Interest rate must be a whole number of basis points'],
    ['a rate above 100%', { interestRate: 10_001 }, 'Interest rate must be between 0% and 100%'],
    ['a zero duration', { loanDuration: 0 }, 'Loan duration must be greater than zero'],
    ['a fractional duration', { loanDuration: 1.5 }, 'Loan duration must be greater than zero'],
  ])('rejects %s', (_label, overrides, expected) => {
    expect(validatePoolCreationParams(makeParams(overrides))).toBe(expected)
  })

  it('allows the contract ceiling of exactly 100%', () => {
    expect(validatePoolCreationParams(makeParams({ interestRate: 10_000 }))).toBeNull()
  })

  it('allows an empty description', () => {
    expect(validatePoolCreationParams(makeParams({ description: '' }))).toBeNull()
  })
})

describe('describePoolCreationError', () => {
  it('reads a rejected signature out of the nested cause', () => {
    expect(describePoolCreationError(wrapped(new UserRejectedRequestError(new Error('denied'))))).toBe('Transaction cancelled')
  })

  it('reports insufficient gas funds', () => {
    expect(describePoolCreationError(wrapped(new InsufficientFundsError({})))).toBe('Insufficient balance for gas')
  })

  it('translates a known contract error', () => {
    expect(describePoolCreationError(wrapped(revertedWith('UnauthorizedCreator')))).toBe(
      'This wallet is not authorised to create pools yet. Please try again in a moment.'
    )
  })

  it('falls back to the short message for an unrecognised Viem error', () => {
    expect(describePoolCreationError(new BaseError('Something went wrong'))).toBe('Something went wrong')
  })

  it('recognises a rejection signalled only by message', () => {
    expect(describePoolCreationError(new Error('User rejected the request'))).toBe('Transaction cancelled')
  })

  it('passes through a plain error message', () => {
    expect(describePoolCreationError(new Error('boom'))).toBe('boom')
  })

  it('has a fallback for a non-error throw', () => {
    expect(describePoolCreationError('nope')).toBe('Failed to create pool')
  })
})

describe('usePoolCreation', () => {
  let prepareCallable: jest.Mock

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
    getPoolFactoryAddress.mockImplementation((chainId: number) => (chainId === LOCALHOST_CHAIN_ID ? FACTORY_ADDRESS : undefined))

    mockEstimateContractGas.mockResolvedValue(1_000_000n)
    mockWriteContractAsync.mockResolvedValue(TX_HASH)

    prepareCallable = jest.fn().mockResolvedValue({ data: { isWhitelisted: true, wasAlreadyWhitelisted: false } })
    mockFirebaseCallable.mockReturnValue(prepareCallable)
  })

  it('starts idle', () => {
    const { result } = renderHook(() => usePoolCreation())

    expect(result.current.isPreparing).toBe(false)
    expect(result.current.isSubmitting).toBe(false)
    expect(result.current.error).toBeNull()
  })

  describe('the happy path', () => {
    it('whitelists, then sends the transaction from the user wallet', async () => {
      const { result } = renderHook(() => usePoolCreation())

      let txHash = ''
      await act(async () => {
        txHash = await result.current.createPool(makeParams())
      })

      expect(mockFirebaseCallable).toHaveBeenCalledWith(expect.anything(), 'preparePoolCreation')
      expect(prepareCallable).toHaveBeenCalledWith({ chainId: LOCALHOST_CHAIN_ID })
      expect(txHash).toBe(TX_HASH)
      expect(result.current.isPreparing).toBe(false)
      expect(result.current.isSubmitting).toBe(false)
      expect(result.current.error).toBeNull()
    })

    it('sends the struct the contract expects, with numbers widened to bigint', async () => {
      const { result } = renderHook(() => usePoolCreation())

      await act(async () => {
        await result.current.createPool(makeParams())
      })

      expect(mockWriteContractAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          address: FACTORY_ADDRESS,
          functionName: 'createPool',
          chainId: LOCALHOST_CHAIN_ID,
          args: [
            {
              maxLoanAmount: 1_000_000_000_000_000_000n,
              interestRate: 500n,
              loanDuration: 2_592_000n,
              name: 'Neighbourhood Fund',
              description: 'Micro-loans for the block',
              requiresMembership: false,
              // Native POL, and the app has no way to ask for anything else
              // yet. Asserted rather than omitted because the field decides
              // what the pool is denominated in for its whole life, and a
              // wrong-but-plausible address here is not something a later
              // screen could correct.
              loanToken: '0x0000000000000000000000000000000000000000',
            },
          ],
        })
      )
    })

    it('adds 20% head-room to the estimated gas', async () => {
      const { result } = renderHook(() => usePoolCreation())

      await act(async () => {
        await result.current.createPool(makeParams())
      })

      expect(mockEstimateContractGas).toHaveBeenCalledWith(expect.objectContaining({ account: WALLET_ADDRESS }))
      expect(mockWriteContractAsync).toHaveBeenCalledWith(expect.objectContaining({ gas: 1_200_000n }))
    })

    it('records the transaction for monitoring before resolving', async () => {
      const { result } = renderHook(() => usePoolCreation())

      await act(async () => {
        await result.current.createPool(makeParams())
      })

      expect(pendingTransactionsStore.transactions).toHaveLength(1)
      expect(pendingTransactionsStore.transactions[0]).toMatchObject({
        txHash: TX_HASH,
        chainId: LOCALHOST_CHAIN_ID,
        type: 'CREATE_POOL',
        status: 'submitted',
        params: {
          name: 'Neighbourhood Fund',
          maxLoanAmount: '1000000000000000000',
          interestRate: 500,
          loanDuration: 2_592_000,
        },
      })
    })

    it('lets the wallet estimate when no public client is configured', async () => {
      mockWagmiUsePublicClient.mockReturnValue(undefined)
      const { result } = renderHook(() => usePoolCreation())

      await act(async () => {
        await result.current.createPool(makeParams())
      })

      expect(mockEstimateContractGas).not.toHaveBeenCalled()
      expect(mockWriteContractAsync).toHaveBeenCalledWith(expect.not.objectContaining({ gas: expect.anything() }))
    })
  })

  describe('pre-flight failures', () => {
    it('throws validation errors without setting hook error, leaving them to the form', async () => {
      const { result } = renderHook(() => usePoolCreation())

      await act(async () => {
        await expect(result.current.createPool(makeParams({ name: '' }))).rejects.toThrow('Pool name is required')
      })

      expect(result.current.error).toBeNull()
      expect(prepareCallable).not.toHaveBeenCalled()
      expect(mockWriteContractAsync).not.toHaveBeenCalled()
    })

    it('refuses to run without a connected wallet', async () => {
      mockWagmiUseAccount.mockReturnValue({ isConnected: false, isConnecting: false, address: undefined, chainId: undefined })
      const { result } = renderHook(() => usePoolCreation())

      await act(async () => {
        await expect(result.current.createPool(makeParams())).rejects.toThrow('Connect a wallet before creating a pool')
      })

      expect(result.current.error).toBe('Connect a wallet before creating a pool')
      expect(prepareCallable).not.toHaveBeenCalled()
    })

    it('refuses a chain the factory is not deployed on', async () => {
      mockWagmiUseAccount.mockReturnValue({
        isConnected: true,
        isConnecting: false,
        address: WALLET_ADDRESS as Address,
        chainId: AMOY_CHAIN_ID,
      })
      const { result } = renderHook(() => usePoolCreation())

      await act(async () => {
        await expect(result.current.createPool(makeParams())).rejects.toThrow('SuperPool is not deployed on the selected network')
      })

      expect(result.current.error).toBe('SuperPool is not deployed on the selected network')
      expect(mockWriteContractAsync).not.toHaveBeenCalled()
    })
  })

  describe('failures after submission starts', () => {
    it('surfaces a whitelisting failure and never prompts the wallet', async () => {
      prepareCallable.mockRejectedValue(new Error('Pool creation is currently restricted to administrators only.'))
      const { result } = renderHook(() => usePoolCreation())

      await act(async () => {
        await expect(result.current.createPool(makeParams())).rejects.toThrow('restricted to administrators')
      })

      expect(result.current.error).toContain('restricted to administrators')
      expect(result.current.isPreparing).toBe(false)
      expect(mockWriteContractAsync).not.toHaveBeenCalled()
      expect(pendingTransactionsStore.transactions).toHaveLength(0)
    })

    it('reports a cancelled signature and records nothing', async () => {
      mockWriteContractAsync.mockRejectedValue(wrapped(new UserRejectedRequestError(new Error('denied'))))
      const { result } = renderHook(() => usePoolCreation())

      await act(async () => {
        await expect(result.current.createPool(makeParams())).rejects.toThrow('Transaction cancelled')
      })

      expect(result.current.error).toBe('Transaction cancelled')
      expect(result.current.isSubmitting).toBe(false)
      expect(pendingTransactionsStore.transactions).toHaveLength(0)
    })

    it('reports an unaffordable transaction from the gas estimate', async () => {
      mockEstimateContractGas.mockRejectedValue(wrapped(new InsufficientFundsError({})))
      const { result } = renderHook(() => usePoolCreation())

      await act(async () => {
        await expect(result.current.createPool(makeParams())).rejects.toThrow('Insufficient balance for gas')
      })

      expect(result.current.error).toBe('Insufficient balance for gas')
      expect(mockWriteContractAsync).not.toHaveBeenCalled()
    })

    it('translates a revert caught by the estimate', async () => {
      mockEstimateContractGas.mockRejectedValue(wrapped(revertedWith('UnauthorizedCreator')))
      const { result } = renderHook(() => usePoolCreation())

      await act(async () => {
        await expect(result.current.createPool(makeParams())).rejects.toThrow('not authorised to create pools yet')
      })

      expect(mockWriteContractAsync).not.toHaveBeenCalled()
    })
  })

  describe('reset', () => {
    it('clears the error so the form can be resubmitted', async () => {
      mockWriteContractAsync.mockRejectedValue(new Error('boom'))
      const { result } = renderHook(() => usePoolCreation())

      await act(async () => {
        await expect(result.current.createPool(makeParams())).rejects.toThrow('boom')
      })
      expect(result.current.error).toBe('boom')

      act(() => {
        result.current.reset()
      })

      expect(result.current.error).toBeNull()
      expect(result.current.isPreparing).toBe(false)
      expect(result.current.isSubmitting).toBe(false)
    })
  })
})
