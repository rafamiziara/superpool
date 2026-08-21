import { act, renderHook } from '@testing-library/react-native'
import { type Address, BaseError, UserRejectedRequestError } from 'viem'
import {
  mockEstimateContractGas,
  mockReadContract,
  mockWagmiUseAccount,
  mockWagmiUsePublicClient,
  mockWaitForTransactionReceipt,
  mockWriteContractAsync,
} from '../../__tests__/mocks'
import { ERC20ABI } from '../../constants/abis'
import { useTokenApproval } from './useTokenApproval'

const TOKEN = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359'
const POOL = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0'
const WALLET = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const TX_HASH = '0xaaaa000000000000000000000000000000000000000000000000000000000001'

jest.mock('../../config/contracts', () => ({
  DEFAULT_CHAIN_ID: 31337,
  getPoolFactoryAddress: jest.fn(),
}))

describe('useTokenApproval', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockWagmiUseAccount.mockReturnValue({
      isConnected: true,
      isConnecting: false,
      address: WALLET as Address,
      chainId: 31337,
    })
    mockWagmiUsePublicClient.mockReturnValue({
      chain: { id: 31337 },
      estimateContractGas: mockEstimateContractGas,
      waitForTransactionReceipt: mockWaitForTransactionReceipt,
      getTransactionReceipt: jest.fn(),
      readContract: mockReadContract,
    })
    mockEstimateContractGas.mockResolvedValue(50_000n)
    mockWriteContractAsync.mockResolvedValue(TX_HASH)
    mockWaitForTransactionReceipt.mockResolvedValue({ status: 'success' })
  })

  describe('readAllowance', () => {
    it('asks the token what the pool may already take', async () => {
      mockReadContract.mockResolvedValue(5_000_000n)
      const { result } = renderHook(() => useTokenApproval())

      let allowance: bigint | undefined
      await act(async () => {
        allowance = await result.current.readAllowance({ token: TOKEN, spender: POOL })
      })

      expect(allowance).toBe(5_000_000n)
      expect(mockReadContract).toHaveBeenCalledWith(
        expect.objectContaining({ address: TOKEN, abi: ERC20ABI, functionName: 'allowance', args: [WALLET, POOL] })
      )
    })

    it('answers undefined rather than zero when the read fails', async () => {
      // The distinction matters: a caller must not conclude "no approval yet"
      // from a read that never happened — but it may safely ask for one.
      mockReadContract.mockRejectedValue(new Error('rpc down'))
      const { result } = renderHook(() => useTokenApproval())

      let allowance: bigint | undefined = 1n
      await act(async () => {
        allowance = await result.current.readAllowance({ token: TOKEN, spender: POOL })
      })

      expect(allowance).toBeUndefined()
    })

    it('answers undefined with no wallet connected', async () => {
      mockWagmiUseAccount.mockReturnValue({ isConnected: false, isConnecting: false, address: undefined, chainId: 31337 })
      const { result } = renderHook(() => useTokenApproval())

      let allowance: bigint | undefined = 1n
      await act(async () => {
        allowance = await result.current.readAllowance({ token: TOKEN, spender: POOL })
      })

      expect(allowance).toBeUndefined()
      expect(mockReadContract).not.toHaveBeenCalled()
    })
  })

  describe('approve', () => {
    it('approves the amount asked for, and never the maximum', async () => {
      // `type(uint256).max` is the convenient thing and it means a bug in the
      // pool can reach the rest of the member's balance.
      const { result } = renderHook(() => useTokenApproval())

      await act(async () => {
        await result.current.approve({ token: TOKEN, spender: POOL, amount: 5_000_000n })
      })

      expect(mockWriteContractAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          address: TOKEN,
          abi: ERC20ABI,
          functionName: 'approve',
          args: [POOL, 5_000_000n],
          chainId: 31337,
        })
      )
    })

    it('waits for the receipt before resolving', async () => {
      // The deposit is sent immediately after. An allowance still in the
      // mempool is an allowance of zero as far as the pool is concerned.
      const { result } = renderHook(() => useTokenApproval())

      await act(async () => {
        await result.current.approve({ token: TOKEN, spender: POOL, amount: 5_000_000n })
      })

      expect(mockWaitForTransactionReceipt).toHaveBeenCalledWith({ hash: TX_HASH })
    })

    it('adds head-room to the estimate', async () => {
      const { result } = renderHook(() => useTokenApproval())

      await act(async () => {
        await result.current.approve({ token: TOKEN, spender: POOL, amount: 5_000_000n })
      })

      expect(mockWriteContractAsync).toHaveBeenCalledWith(expect.objectContaining({ gas: 60_000n }))
    })

    it('refuses to run without a connected wallet', async () => {
      mockWagmiUseAccount.mockReturnValue({ isConnected: false, isConnecting: false, address: undefined, chainId: 31337 })
      const { result } = renderHook(() => useTokenApproval())

      await act(async () => {
        await expect(result.current.approve({ token: TOKEN, spender: POOL, amount: 1n })).rejects.toThrow(
          'Connect a wallet before approving'
        )
      })

      expect(mockWriteContractAsync).not.toHaveBeenCalled()
    })

    it('refuses an amount of nothing', async () => {
      const { result } = renderHook(() => useTokenApproval())

      await act(async () => {
        await expect(result.current.approve({ token: TOKEN, spender: POOL, amount: 0n })).rejects.toThrow(
          'Enter an amount greater than zero'
        )
      })

      expect(mockWriteContractAsync).not.toHaveBeenCalled()
    })

    it('reports a rejected signature', async () => {
      mockWriteContractAsync.mockRejectedValue(
        new BaseError('write failed', { cause: new BaseError('inner', { cause: new UserRejectedRequestError(new Error('nope')) }) })
      )
      const { result } = renderHook(() => useTokenApproval())

      await act(async () => {
        await expect(result.current.approve({ token: TOKEN, spender: POOL, amount: 1n })).rejects.toThrow()
      })

      expect(result.current.error).toBeTruthy()
    })
  })

  describe('reset', () => {
    it('clears a previous error', async () => {
      mockWriteContractAsync.mockRejectedValue(new Error('boom'))
      const { result } = renderHook(() => useTokenApproval())

      await act(async () => {
        await expect(result.current.approve({ token: TOKEN, spender: POOL, amount: 1n })).rejects.toThrow()
      })
      expect(result.current.error).toBeTruthy()

      act(() => result.current.reset())

      expect(result.current.error).toBeNull()
    })
  })
})
