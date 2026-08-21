import { act, renderHook } from '@testing-library/react-native'
import { type Address, BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from 'viem'
import {
  mockEstimateContractGas,
  mockGetTransactionReceipt,
  mockReadContract,
  mockWagmiUseAccount,
  mockWagmiUsePublicClient,
  mockWaitForTransactionReceipt,
  mockWriteContractAsync,
} from '../../__tests__/mocks'
import { LendingPoolABI } from '../../constants/abis'
import { pendingTransactionsStore } from '../../stores/PendingTransactionsStore'
import {
  describeDecideMemberError,
  describeLeavePoolError,
  describeRemoveMemberError,
  describeRequestMembershipError,
  type MemberDecisionParams,
  type MembershipParams,
  useMembership,
} from './useMembership'

const POOL_ADDRESS = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0'
const WALLET_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const APPLICANT = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
const TX_HASH = '0xaaaa000000000000000000000000000000000000000000000000000000000001'
const LOCALHOST_CHAIN_ID = 31337

jest.mock('../../config/contracts', () => ({
  DEFAULT_CHAIN_ID: 31337,
  getPoolFactoryAddress: jest.fn(),
}))

function makeParams(overrides: Partial<MembershipParams> = {}): MembershipParams {
  return {
    poolId: 1,
    poolAddress: POOL_ADDRESS,
    poolName: 'Neighbourhood Fund',
    ...overrides,
  }
}

function makeDecisionParams(overrides: Partial<MemberDecisionParams> = {}): MemberDecisionParams {
  return {
    ...makeParams(),
    account: APPLICANT,
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

function revertedWith(name: string, functionName = 'requestMembership'): ContractFunctionRevertedError {
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
    readContract: mockReadContract,
  })
  mockEstimateContractGas.mockResolvedValue(100_000n)
  mockWriteContractAsync.mockResolvedValue(TX_HASH)
})

// ---------------------------------------------------------------------------
// Error wording
// ---------------------------------------------------------------------------

describe('error wording', () => {
  it('should cover both meanings of AlreadyMember', () => {
    // The contract does not distinguish "already in" from "already waiting",
    // so the wording must not claim either.
    expect(describeRequestMembershipError(wrapped(revertedWith('AlreadyMember')))).toMatch(/already a member|waiting/)
  })

  it('should read NoPendingRequest as a race rather than a fault', () => {
    expect(describeDecideMemberError(wrapped(revertedWith('NoPendingRequest', 'approveMember')))).toMatch(/already been decided/)
  })

  it('should name the owner on an unauthorised decision', () => {
    expect(describeDecideMemberError(wrapped(revertedWith('OwnableUnauthorizedAccount', 'approveMember')))).toMatch(/pool owner/)
  })

  it('should explain NotAMember from the remover’s side', () => {
    expect(describeRemoveMemberError(wrapped(revertedWith('NotAMember', 'removeMember')))).toMatch(/not a member/i)
  })

  it('should explain NotAMember from the leaver’s side', () => {
    expect(describeLeavePoolError(wrapped(revertedWith('NotAMember', 'leavePool')))).toMatch(/You are not a member/)
  })

  it('should not dress up a user rejection as a contract failure', () => {
    expect(describeRequestMembershipError(wrapped(new UserRejectedRequestError(new Error('denied'))))).toMatch(/cancell?ed|rejected/i)
  })
})

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

describe('requestMembership', () => {
  it('should send with no arguments', async () => {
    // The applicant acts on their own membership; the contract reads msg.sender.
    const { result } = renderHook(() => useMembership())

    await act(async () => {
      await result.current.requestMembership(makeParams())
    })

    expect(mockWriteContractAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        address: POOL_ADDRESS,
        functionName: 'requestMembership',
        args: [],
        chainId: LOCALHOST_CHAIN_ID,
      })
    )
  })

  it('should record a pending transaction before returning', async () => {
    // A kill straight after signing must still leave something recoverable.
    const { result } = renderHook(() => useMembership())

    await act(async () => {
      await result.current.requestMembership(makeParams())
    })

    const [transaction] = pendingTransactionsStore.transactions
    expect(transaction).toMatchObject({ txHash: TX_HASH, type: 'REQUEST_MEMBERSHIP', status: 'submitted' })
    expect(transaction.params).toMatchObject({ poolId: 1, poolName: 'Neighbourhood Fund' })
  })

  it('should not name an account on the applicant’s own call', async () => {
    // It would just repeat the sender, and the card reads it as "whose".
    const { result } = renderHook(() => useMembership())

    await act(async () => {
      await result.current.requestMembership(makeParams())
    })

    expect(pendingTransactionsStore.transactions[0].params).not.toHaveProperty('account')
  })

  it('should estimate before asking the user to sign', async () => {
    const { result } = renderHook(() => useMembership())

    await act(async () => {
      await result.current.requestMembership(makeParams())
    })

    expect(mockEstimateContractGas).toHaveBeenCalledWith(expect.objectContaining({ functionName: 'requestMembership' }))
    expect(mockEstimateContractGas.mock.invocationCallOrder[0]).toBeLessThan(mockWriteContractAsync.mock.invocationCallOrder[0])
  })

  it('should add head-room to the estimate', async () => {
    const { result } = renderHook(() => useMembership())

    await act(async () => {
      await result.current.requestMembership(makeParams())
    })

    expect(mockWriteContractAsync).toHaveBeenCalledWith(expect.objectContaining({ gas: 120_000n }))
  })

  it('should refuse without a wallet', async () => {
    mockWagmiUseAccount.mockReturnValue({ isConnected: false, isConnecting: false, address: undefined, chainId: undefined })
    const { result } = renderHook(() => useMembership())

    await act(async () => {
      await expect(result.current.requestMembership(makeParams())).rejects.toThrow(/Connect a wallet/)
    })

    expect(mockWriteContractAsync).not.toHaveBeenCalled()
  })
})

describe('the owner’s decisions', () => {
  it.each([
    ['approveMember', 'APPROVE_MEMBER'],
    ['rejectMember', 'REJECT_MEMBER'],
    ['removeMember', 'REMOVE_MEMBER'],
  ] as const)('should send %s with the account being decided', async (method, type) => {
    const { result } = renderHook(() => useMembership())

    await act(async () => {
      await result.current[method](makeDecisionParams())
    })

    expect(mockWriteContractAsync).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: method, args: [APPLICANT], chainId: LOCALHOST_CHAIN_ID })
    )
    expect(pendingTransactionsStore.transactions[0]).toMatchObject({ type })
  })

  it('should carry the account onto the pending record', async () => {
    // The card has to name whose membership is changing; the sender's own
    // address would name the wrong person.
    const { result } = renderHook(() => useMembership())

    await act(async () => {
      await result.current.approveMember(makeDecisionParams())
    })

    expect(pendingTransactionsStore.transactions[0].params).toMatchObject({ account: APPLICANT })
  })

  it('should surface a decision that lost the race', async () => {
    mockEstimateContractGas.mockRejectedValue(wrapped(revertedWith('NoPendingRequest', 'approveMember')))
    const { result } = renderHook(() => useMembership())

    await act(async () => {
      await expect(result.current.approveMember(makeDecisionParams())).rejects.toThrow(/already been decided/)
    })

    expect(result.current.error).toMatch(/already been decided/)
    expect(mockWriteContractAsync).not.toHaveBeenCalled()
  })
})

describe('leavePool', () => {
  it('should send with no arguments, like requesting', async () => {
    const { result } = renderHook(() => useMembership())

    await act(async () => {
      await result.current.leavePool(makeParams())
    })

    expect(mockWriteContractAsync).toHaveBeenCalledWith(expect.objectContaining({ functionName: 'leavePool', args: [] }))
    expect(pendingTransactionsStore.transactions[0]).toMatchObject({ type: 'LEAVE_POOL' })
  })
})

describe('reset', () => {
  it('should clear a previous failure', async () => {
    mockEstimateContractGas.mockRejectedValue(wrapped(revertedWith('AlreadyMember')))
    const { result } = renderHook(() => useMembership())

    await act(async () => {
      await expect(result.current.requestMembership(makeParams())).rejects.toThrow()
    })
    expect(result.current.error).not.toBeNull()

    act(() => {
      result.current.reset()
    })

    expect(result.current.error).toBeNull()
    expect(result.current.isSubmitting).toBe(false)
  })
})
