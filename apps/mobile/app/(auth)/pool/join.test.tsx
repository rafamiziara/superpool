import type { MemberInfo } from '@superpool/types'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import React from 'react'
import { mockLocalSearchParams } from '../../../src/__tests__/setup'
import { MOCK_USER_ADDRESS } from '../../../src/mocks/lending'
import { authStore } from '../../../src/stores/AuthStore'
import { poolStore } from '../../../src/stores/PoolStore'
import JoinPoolScreen from './join'

const TX_HASH = '0xaaaa000000000000000000000000000000000000000000000000000000000001'

/** Pool 1 belongs to someone else, which is who would be asking to join. */
const POOL_ID = '1'

const mockRequestMembership = jest.fn()
const mockWaitForTransaction = jest.fn()
const mockTriggerIndexing = jest.fn()
const mockReset = jest.fn()
let mockMembershipError: string | null = null

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}))

jest.mock('../../../src/hooks/pools/useMembership', () => ({
  useMembership: () => ({
    requestMembership: mockRequestMembership,
    approveMember: jest.fn(),
    rejectMember: jest.fn(),
    removeMember: jest.fn(),
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

function standing(status: MemberInfo['status']): MemberInfo {
  return {
    id: `31337-1-${MOCK_USER_ADDRESS.toLowerCase()}`,
    poolId: 1,
    poolAddress: poolStore.poolById(1)!.poolAddress,
    account: MOCK_USER_ADDRESS.toLowerCase(),
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
  mockRequestMembership.mockResolvedValue(TX_HASH)
  mockWaitForTransaction.mockResolvedValue({ account: MOCK_USER_ADDRESS, txHash: TX_HASH })
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

describe('JoinPoolScreen', () => {
  it('says so when the pool is not available', () => {
    mockLocalSearchParams.mockReturnValue({ poolId: '9999' })

    const { getByTestId } = render(<JoinPoolScreen />)

    expect(getByTestId('join-pool-not-found')).toBeTruthy()
  })

  it('states that asking costs nothing but a fee', () => {
    // The reassurance that decides whether someone asks at all.
    const { getByText } = render(<JoinPoolScreen />)

    expect(getByText(/No money moves/)).toBeTruthy()
  })

  it('sends the request', async () => {
    const { getByTestId } = render(<JoinPoolScreen />)

    await act(async () => {
      fireEvent.press(getByTestId('join-submit'))
    })

    expect(mockRequestMembership).toHaveBeenCalledWith(
      expect.objectContaining({ poolId: 1, poolAddress: poolStore.poolById(1)!.poolAddress })
    )
  })

  it('confirms and indexes in order', async () => {
    const { getByTestId } = render(<JoinPoolScreen />)

    await act(async () => {
      fireEvent.press(getByTestId('join-submit'))
    })

    await waitFor(() => expect(mockTriggerIndexing).toHaveBeenCalledWith(TX_HASH, 'REQUEST_MEMBERSHIP'))
    expect(mockWaitForTransaction).toHaveBeenCalledWith(TX_HASH, 'REQUEST_MEMBERSHIP')
    expect(mockWaitForTransaction.mock.invocationCallOrder[0]).toBeLessThan(mockTriggerIndexing.mock.invocationCallOrder[0])
  })

  it('does not index a request that never confirmed', async () => {
    // The pending record survives, so recovery and the sweep finish the job.
    mockWaitForTransaction.mockRejectedValue(new Error('timed out'))
    const { getByTestId } = render(<JoinPoolScreen />)

    await act(async () => {
      fireEvent.press(getByTestId('join-submit'))
    })

    expect(mockTriggerIndexing).not.toHaveBeenCalled()
    expect(getByTestId('join-error')).toBeTruthy()
  })

  it('does not ask twice while a request is already waiting', async () => {
    poolStore.memberRecords = [standing('requested')]
    const { getByTestId } = render(<JoinPoolScreen />)

    await act(async () => {
      fireEvent.press(getByTestId('join-submit'))
    })

    expect(mockRequestMembership).not.toHaveBeenCalled()
  })

  it('tells a rejected applicant they may ask again', () => {
    // A rejected applicant is not a stranger, and the screen must not pretend
    // their first attempt never happened.
    poolStore.memberRecords = [standing('rejected')]

    const { getByTestId } = render(<JoinPoolScreen />)

    expect(getByTestId('join-previously-rejected')).toBeTruthy()
    expect(getByTestId('join-submit')).toHaveTextContent('Ask again')
  })

  it('reassures a removed member that their balance is still theirs', () => {
    poolStore.memberRecords = [standing('removed')]

    const { getByTestId } = render(<JoinPoolScreen />)

    expect(getByTestId('join-previously-removed')).toBeTruthy()
  })

  it('shows the failure when the wallet refuses', async () => {
    mockRequestMembership.mockRejectedValue(new Error('You are already a member of this pool'))
    const { getByTestId } = render(<JoinPoolScreen />)

    await act(async () => {
      fireEvent.press(getByTestId('join-submit'))
    })

    expect(getByTestId('join-error')).toBeTruthy()
  })
})
