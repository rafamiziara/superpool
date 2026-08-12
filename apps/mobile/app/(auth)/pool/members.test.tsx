import type { MemberInfo } from '@superpool/types'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import React from 'react'
import { mockLocalSearchParams } from '../../../src/__tests__/setup'
import { MOCK_USER_ADDRESS } from '../../../src/mocks/lending'
import { authStore } from '../../../src/stores/AuthStore'
import { poolStore } from '../../../src/stores/PoolStore'
import MembersScreen from './members'

const TX_HASH = '0xaaaa000000000000000000000000000000000000000000000000000000000001'

/** Pool 2 in the mock data is the one the mock user owns. */
const POOL_ID = '2'
/** Pool 1 belongs to someone else — the subject for the not-owner path. */
const POOL_I_DO_NOT_OWN = '1'
const APPLICANT = '0x0000000000000000000000000000000000000042'

const mockApproveMember = jest.fn()
const mockRejectMember = jest.fn()
const mockRemoveMember = jest.fn()
const mockWaitForTransaction = jest.fn()
const mockTriggerIndexing = jest.fn()
const mockReset = jest.fn()
let mockMembershipError: string | null = null

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}))

jest.mock('../../../src/hooks/pools/useMembership', () => ({
  useMembership: () => ({
    requestMembership: jest.fn(),
    approveMember: mockApproveMember,
    rejectMember: mockRejectMember,
    removeMember: mockRemoveMember,
    leavePool: jest.fn(),
    isSubmitting: false,
    error: mockMembershipError,
    reset: mockReset,
  }),
}))

jest.mock('../../../src/hooks/pools/useTransactionMonitoring', () => ({
  useTransactionMonitoring: () => ({ waitForTransaction: mockWaitForTransaction, isWaiting: false, error: null }),
}))

jest.mock('../../../src/hooks/pools/usePoolIndexing', () => ({
  usePoolIndexing: () => ({ triggerIndexing: mockTriggerIndexing, indexConfirmed: jest.fn(), isIndexing: false }),
}))

function member(account: string, status: MemberInfo['status']): MemberInfo {
  return {
    id: `31337-2-${account.toLowerCase()}`,
    poolId: 2,
    poolAddress: poolStore.poolById(2)!.poolAddress,
    account: account.toLowerCase(),
    status,
    joinedAt: '2026-08-11T09:00:00.000Z',
    chainId: 31337,
    transactionHash: '0xaaa',
    blockNumber: 100,
  }
}

beforeEach(async () => {
  jest.clearAllMocks()
  mockMembershipError = null
  mockApproveMember.mockResolvedValue(TX_HASH)
  mockRejectMember.mockResolvedValue(TX_HASH)
  mockRemoveMember.mockResolvedValue(TX_HASH)
  mockWaitForTransaction.mockResolvedValue({ account: APPLICANT, txHash: TX_HASH })
  mockTriggerIndexing.mockResolvedValue(undefined)
  mockLocalSearchParams.mockReturnValue({ poolId: POOL_ID })
  authStore.walletAddress = MOCK_USER_ADDRESS
  await poolStore.fetchPools()
  poolStore.memberRecords = []
})

afterEach(() => {
  poolStore.memberRecords = []
  authStore.walletAddress = null
})

describe('MembersScreen', () => {
  it('says so when the pool is not available', () => {
    mockLocalSearchParams.mockReturnValue({ poolId: '9999' })

    const { getByTestId } = render(<MembersScreen />)

    expect(getByTestId('members-pool-not-found')).toBeTruthy()
  })

  it('turns away anyone who is not the pool owner', () => {
    // Every call here is `onlyOwner`; offering the controls to a member invites
    // a transaction that reverts.
    mockLocalSearchParams.mockReturnValue({ poolId: POOL_I_DO_NOT_OWN })

    const { getByTestId, queryByTestId } = render(<MembersScreen />)

    expect(getByTestId('members-not-owner')).toBeTruthy()
    expect(queryByTestId('members-waiting')).toBeNull()
  })

  it('lets the owner in whatever case their wallet reports', () => {
    authStore.walletAddress = MOCK_USER_ADDRESS.toLowerCase()

    const { getByTestId } = render(<MembersScreen />)

    expect(getByTestId('members-screen')).toBeTruthy()
  })

  it('lists whoever is waiting', () => {
    poolStore.memberRecords = [member(APPLICANT, 'requested')]

    const { getByTestId } = render(<MembersScreen />)

    expect(getByTestId('members-waiting')).toBeTruthy()
    expect(getByTestId(`members-approve-${APPLICANT.toLowerCase()}`)).toBeTruthy()
  })

  it('leaves decided applicants out of the queue', () => {
    // The record stays as history; only `requested` is work for the owner.
    poolStore.memberRecords = [member(APPLICANT, 'rejected'), member('0x0000000000000000000000000000000000000043', 'removed')]

    const { queryByTestId } = render(<MembersScreen />)

    expect(queryByTestId('members-waiting')).toBeNull()
  })

  it('admits an applicant', async () => {
    poolStore.memberRecords = [member(APPLICANT, 'requested')]
    const { getByTestId } = render(<MembersScreen />)

    await act(async () => {
      fireEvent.press(getByTestId(`members-approve-${APPLICANT.toLowerCase()}`))
    })

    expect(mockApproveMember).toHaveBeenCalledWith(expect.objectContaining({ account: APPLICANT.toLowerCase(), poolId: 2 }))
  })

  it('turns an applicant down', async () => {
    poolStore.memberRecords = [member(APPLICANT, 'requested')]
    const { getByTestId } = render(<MembersScreen />)

    await act(async () => {
      fireEvent.press(getByTestId(`members-reject-${APPLICANT.toLowerCase()}`))
    })

    expect(mockRejectMember).toHaveBeenCalledWith(expect.objectContaining({ account: APPLICANT.toLowerCase() }))
  })

  it('confirms and indexes in order', async () => {
    poolStore.memberRecords = [member(APPLICANT, 'requested')]
    const { getByTestId } = render(<MembersScreen />)

    await act(async () => {
      fireEvent.press(getByTestId(`members-approve-${APPLICANT.toLowerCase()}`))
    })

    await waitFor(() => expect(mockTriggerIndexing).toHaveBeenCalledWith(TX_HASH, 'APPROVE_MEMBER'))
    expect(mockWaitForTransaction.mock.invocationCallOrder[0]).toBeLessThan(mockTriggerIndexing.mock.invocationCallOrder[0])
  })

  it('does not index a decision that never confirmed', async () => {
    mockWaitForTransaction.mockRejectedValue(new Error('timed out'))
    poolStore.memberRecords = [member(APPLICANT, 'requested')]
    const { getByTestId } = render(<MembersScreen />)

    await act(async () => {
      fireEvent.press(getByTestId(`members-approve-${APPLICANT.toLowerCase()}`))
    })

    expect(mockTriggerIndexing).not.toHaveBeenCalled()
    expect(getByTestId('members-error')).toBeTruthy()
  })

  it('removes a member', async () => {
    poolStore.memberRecords = [member(APPLICANT, 'active')]
    const { getByTestId } = render(<MembersScreen />)

    await act(async () => {
      fireEvent.press(getByTestId(`members-remove-${APPLICANT.toLowerCase()}`))
    })

    expect(mockRemoveMember).toHaveBeenCalledWith(expect.objectContaining({ account: APPLICANT.toLowerCase() }))
  })

  it('does not offer to remove the owner from their own pool', () => {
    poolStore.memberRecords = [member(MOCK_USER_ADDRESS, 'active')]

    const { queryByTestId, getByText } = render(<MembersScreen />)

    expect(queryByTestId(`members-remove-${MOCK_USER_ADDRESS.toLowerCase()}`)).toBeNull()
    expect(getByText('Owner')).toBeTruthy()
  })

  it('states that removal is not confiscation', () => {
    // The wrong guess is the one that would stop an owner ever using it.
    const { getByText } = render(<MembersScreen />)

    expect(getByText(/stays theirs/)).toBeTruthy()
  })

  it('says so when nobody has joined yet', () => {
    const { getByTestId, getByText } = render(<MembersScreen />)

    expect(getByTestId('members-roster')).toBeTruthy()
    expect(getByText('No members yet')).toBeTruthy()
  })

  // A notification tap can open this screen on a cold start, where the auth
  // group has only just kicked off `fetchPools`. Answering "that pool is not
  // available" — or worse, "only the owner can decide" — to the owner who just
  // tapped a notification about their own pool is a definitive answer to a
  // question nothing has resolved yet.
  it('reads as loading, not as missing, while the pools are still arriving', () => {
    mockLocalSearchParams.mockReturnValue({ poolId: '9999' })
    poolStore.isLoading = true

    const { getByTestId, queryByTestId } = render(<MembersScreen />)

    expect(getByTestId('members-loading')).toBeTruthy()
    expect(queryByTestId('members-pool-not-found')).toBeNull()

    poolStore.isLoading = false
  })

  it('says the pool is missing once the load has finished', () => {
    mockLocalSearchParams.mockReturnValue({ poolId: '9999' })
    poolStore.isLoading = false

    const { getByTestId } = render(<MembersScreen />)

    expect(getByTestId('members-pool-not-found')).toBeTruthy()
  })
})
