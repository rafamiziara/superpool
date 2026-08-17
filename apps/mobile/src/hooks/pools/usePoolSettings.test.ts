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
import { describePoolSettingsError, usePoolSettings } from './usePoolSettings'

const POOL_ADDRESS = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0'
const WALLET_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const TX_HASH = '0xaaaa000000000000000000000000000000000000000000000000000000000001'
const LOCALHOST_CHAIN_ID = 31337

jest.mock('../../config/contracts', () => ({
  DEFAULT_CHAIN_ID: 31337,
  getPoolFactoryAddress: jest.fn(),
}))

/** Wraps a cause the way Viem does, so `BaseError.walk` has something to find. */
function wrapped(cause: Error): BaseError {
  return new BaseError('Contract write failed', { cause: new BaseError('inner', { cause }) })
}

type RevertAbiItem = NonNullable<ContractFunctionRevertedError['data']>['abiItem']

/** Looks the error up in the shipped ABI, so a rename there fails this test too. */
function revertedWith(name: string): ContractFunctionRevertedError {
  const item = LendingPoolABI.find((entry) => entry.type === 'error' && entry.name === name)
  if (!item || item.type !== 'error') throw new Error(`LendingPoolABI has no error named ${name}`)

  const reverted = new ContractFunctionRevertedError({ abi: [], functionName: 'setRequiresApproval' })
  reverted.data = { abiItem: item as RevertAbiItem, errorName: name, args: [] }

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
  mockEstimateContractGas.mockResolvedValue(50_000n)
  mockWriteContractAsync.mockResolvedValue(TX_HASH)
  mockWaitForTransactionReceipt.mockResolvedValue({ status: 'success', logs: [] })
})

describe('describePoolSettingsError', () => {
  it('should explain that only the owner may change a pool', () => {
    expect(describePoolSettingsError(wrapped(revertedWith('OwnableUnauthorizedAccount')))).toMatch(/Only the pool owner/)
  })

  it('should not blame the contract when the user declined', () => {
    expect(describePoolSettingsError(wrapped(new UserRejectedRequestError(new Error('denied'))))).toMatch(/cancelled/)
  })
})

describe('usePoolSettings', () => {
  it('should write the target value, not a toggle', async () => {
    // The caller reads the current state from the chain; sending a flip would
    // race a change made elsewhere.
    const { result } = renderHook(() => usePoolSettings())

    await act(async () => {
      await result.current.setRequiresApproval({ poolAddress: POOL_ADDRESS, requiresApproval: true })
    })

    expect(mockWriteContractAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        address: POOL_ADDRESS,
        functionName: 'setRequiresApproval',
        args: [true],
        chainId: LOCALHOST_CHAIN_ID,
      })
    )
  })

  it('should send false just as readily', async () => {
    const { result } = renderHook(() => usePoolSettings())

    await act(async () => {
      await result.current.setRequiresApproval({ poolAddress: POOL_ADDRESS, requiresApproval: false })
    })

    expect(mockWriteContractAsync).toHaveBeenCalledWith(expect.objectContaining({ args: [false] }))
  })

  it('should estimate before asking for a signature', async () => {
    // This is what turns "you are not the owner" into a message rather than a
    // prompt for a transaction that reverts.
    const { result } = renderHook(() => usePoolSettings())

    await act(async () => {
      await result.current.setRequiresApproval({ poolAddress: POOL_ADDRESS, requiresApproval: true })
    })

    expect(mockEstimateContractGas).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'setRequiresApproval', account: WALLET_ADDRESS })
    )
    expect(mockWriteContractAsync).toHaveBeenCalledWith(expect.objectContaining({ gas: 60_000n }))
  })

  it('should wait for the receipt before reporting success', async () => {
    // The screens that route borrowing read this flag from the chain, so
    // reporting early would leave the app contradicting itself.
    const { result } = renderHook(() => usePoolSettings())

    await act(async () => {
      await result.current.setRequiresApproval({ poolAddress: POOL_ADDRESS, requiresApproval: true })
    })

    expect(mockWaitForTransactionReceipt).toHaveBeenCalledWith(expect.objectContaining({ hash: TX_HASH }))
    expect(result.current.isSubmitting).toBe(false)
  })

  it('should report a reverted transaction as a failure', async () => {
    mockWaitForTransactionReceipt.mockResolvedValue({ status: 'reverted', logs: [] })
    const { result } = renderHook(() => usePoolSettings())

    await act(async () => {
      await expect(result.current.setRequiresApproval({ poolAddress: POOL_ADDRESS, requiresApproval: true })).rejects.toThrow()
    })

    expect(result.current.error).toMatch(/rejected the change/)
    expect(result.current.isSubmitting).toBe(false)
  })

  it('should surface a revert from the estimate', async () => {
    mockEstimateContractGas.mockRejectedValue(wrapped(revertedWith('OwnableUnauthorizedAccount')))
    const { result } = renderHook(() => usePoolSettings())

    await act(async () => {
      await expect(result.current.setRequiresApproval({ poolAddress: POOL_ADDRESS, requiresApproval: true })).rejects.toThrow()
    })

    expect(result.current.error).toMatch(/Only the pool owner/)
    expect(mockWriteContractAsync).not.toHaveBeenCalled()
  })

  it('should refuse without a connected wallet', async () => {
    mockWagmiUseAccount.mockReturnValue({ isConnected: false, isConnecting: false, address: undefined, chainId: undefined })
    const { result } = renderHook(() => usePoolSettings())

    await act(async () => {
      await expect(result.current.setRequiresApproval({ poolAddress: POOL_ADDRESS, requiresApproval: true })).rejects.toThrow(
        /Connect a wallet/
      )
    })

    expect(result.current.error).toMatch(/Connect a wallet/)
  })

  it('should leave the estimate to the wallet when no client is configured', async () => {
    mockWagmiUsePublicClient.mockReturnValue(undefined)
    const { result } = renderHook(() => usePoolSettings())

    await act(async () => {
      await result.current.setRequiresApproval({ poolAddress: POOL_ADDRESS, requiresApproval: true })
    })

    expect(mockWriteContractAsync).toHaveBeenCalledWith(expect.not.objectContaining({ gas: expect.anything() }))
  })

  it('should record nothing in the pending transactions store', async () => {
    // Deliberate: nothing indexes `ApprovalRequirementChanged`, and every screen
    // that cares reads the flag from the chain. There is nothing to recover.
    const { result } = renderHook(() => usePoolSettings())

    await act(async () => {
      await result.current.setRequiresApproval({ poolAddress: POOL_ADDRESS, requiresApproval: true })
    })

    expect(pendingTransactionsStore.transactions).toHaveLength(0)
  })

  it('should clear a previous failure on reset', async () => {
    mockEstimateContractGas.mockRejectedValue(wrapped(revertedWith('OwnableUnauthorizedAccount')))
    const { result } = renderHook(() => usePoolSettings())

    await act(async () => {
      await expect(result.current.setRequiresApproval({ poolAddress: POOL_ADDRESS, requiresApproval: true })).rejects.toThrow()
    })
    expect(result.current.error).not.toBeNull()

    act(() => {
      result.current.reset()
    })

    expect(result.current.error).toBeNull()
    expect(result.current.isSubmitting).toBe(false)
  })
})
