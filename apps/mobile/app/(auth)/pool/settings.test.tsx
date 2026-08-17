import type { LoanInfo } from '@superpool/types'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import React from 'react'
import { mockWagmiUseReadContract } from '../../../src/__tests__/mocks'
import { mockLocalSearchParams } from '../../../src/__tests__/setup'
import { MOCK_USER_ADDRESS } from '../../../src/mocks/lending'
import { authStore } from '../../../src/stores/AuthStore'
import { poolStore } from '../../../src/stores/PoolStore'
import PoolSettingsScreen from './settings'

/** Pool 2 in the mock data is the one the mock user owns. */
const POOL_ID = '2'
/** Pool 1 belongs to someone else. */
const POOL_I_DO_NOT_OWN = '1'

const mockSetRequiresApproval = jest.fn()
const mockSetRequiresMembership = jest.fn()
const mockReset = jest.fn()
let mockSettingsError: string | null = null
let mockIsSubmitting = false

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}))

jest.mock('../../../src/hooks/pools/usePoolSettings', () => ({
  usePoolSettings: () => ({
    setRequiresApproval: mockSetRequiresApproval,
    setRequiresMembership: mockSetRequiresMembership,
    isSubmitting: mockIsSubmitting,
    error: mockSettingsError,
    reset: mockReset,
  }),
}))

/**
 * `poolConfig` decodes to a six-member tuple; the screen reads
 * `requiresApproval` from index 4 and `requiresMembership` from index 5. `data: undefined` stands for a
 * pool that predates the field, where the decode yields nothing.
 */
function mockConfig({ requiresApproval = false, requiresMembership = false, readable = true, isLoading = false } = {}) {
  const refetch = jest.fn().mockResolvedValue({ data: undefined })
  mockWagmiUseReadContract.mockReturnValue({
    data: readable ? [10_000_000_000_000_000_000n, 500n, 2_592_000n, true, requiresApproval, requiresMembership] : undefined,
    isLoading,
    refetch,
  })

  return refetch
}

function pendingRequest(overrides: Partial<LoanInfo> = {}): LoanInfo {
  return {
    id: '31337-2-5',
    loanId: 5,
    poolId: 2,
    poolAddress: poolStore.poolById(2)!.poolAddress,
    borrower: '0x0000000000000000000000000000000000000042',
    amount: '4000000000000000000',
    interestRate: 500,
    duration: 2_592_000,
    startedAt: '2026-08-11T09:00:00.000Z',
    isRepaid: false,
    amountRepaid: '0',
    status: 'requested',
    chainId: 31337,
    transactionHash: '0xaaa',
    blockNumber: 100,
    ...overrides,
  }
}

beforeEach(async () => {
  jest.clearAllMocks()
  mockSettingsError = null
  mockIsSubmitting = false
  mockSetRequiresApproval.mockResolvedValue('0xabc')
  mockSetRequiresMembership.mockResolvedValue('0xabc')
  mockLocalSearchParams.mockReturnValue({ poolId: POOL_ID })
  mockConfig()
  authStore.walletAddress = null
  await poolStore.fetchPools()
  poolStore.loanRecords = []
})

afterEach(() => {
  poolStore.loanRecords = []
  authStore.walletAddress = null
})

describe('PoolSettingsScreen', () => {
  it('says so when the pool is not available', () => {
    mockLocalSearchParams.mockReturnValue({ poolId: '9999' })

    const { getByTestId } = render(<PoolSettingsScreen />)

    expect(getByTestId('settings-pool-not-found')).toBeTruthy()
  })

  it('turns away anyone who is not the pool owner', () => {
    // `setRequiresApproval` is `onlyOwner`; offering the control to a member
    // invites a transaction that reverts.
    mockLocalSearchParams.mockReturnValue({ poolId: POOL_I_DO_NOT_OWN })

    const { getByTestId, queryByTestId } = render(<PoolSettingsScreen />)

    expect(getByTestId('settings-not-owner')).toBeTruthy()
    expect(queryByTestId('settings-approval-toggle')).toBeNull()
  })

  it('lets the owner in whatever case their wallet reports', () => {
    // Indexed addresses are lowercased; a connected wallet is checksummed.
    authStore.walletAddress = MOCK_USER_ADDRESS.toLowerCase()

    const { getByTestId } = render(<PoolSettingsScreen />)

    expect(getByTestId('settings-screen')).toBeTruthy()
  })

  describe('the current state', () => {
    it('reads off as off', () => {
      mockConfig({ requiresApproval: false })

      const { getByTestId, getByText } = render(<PoolSettingsScreen />)

      expect(getByTestId('settings-approval-off')).toBeTruthy()
      expect(getByText('Review requests before lending')).toBeTruthy()
    })

    it('reads on as on', () => {
      mockConfig({ requiresApproval: true })

      const { getByTestId, getByText } = render(<PoolSettingsScreen />)

      expect(getByTestId('settings-approval-on')).toBeTruthy()
      expect(getByText('Stop reviewing requests')).toBeTruthy()
    })

    it('comes from the chain, not the indexed pool record', () => {
      // Nothing indexes `requiresApproval`, and this screen is what changes it.
      mockConfig({ requiresApproval: true })

      render(<PoolSettingsScreen />)

      expect(mockWagmiUseReadContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: 'poolConfig' }))
    })

    it('waits rather than guessing while the read is in flight', () => {
      mockConfig({ isLoading: true })

      const { getByTestId, queryByTestId } = render(<PoolSettingsScreen />)

      expect(getByTestId('settings-loading')).toBeTruthy()
      expect(queryByTestId('settings-approval-toggle')).toBeNull()
    })
  })

  describe('changing it', () => {
    it('sends the opposite of what the chain currently says', async () => {
      mockConfig({ requiresApproval: false })
      const { getByTestId } = render(<PoolSettingsScreen />)

      await act(async () => {
        fireEvent.press(getByTestId('settings-approval-toggle'))
      })

      expect(mockSetRequiresApproval).toHaveBeenCalledWith(
        expect.objectContaining({ poolAddress: poolStore.poolById(2)!.poolAddress, requiresApproval: true })
      )
    })

    it('turns it back off from on', async () => {
      mockConfig({ requiresApproval: true })
      const { getByTestId } = render(<PoolSettingsScreen />)

      await act(async () => {
        fireEvent.press(getByTestId('settings-approval-toggle'))
      })

      expect(mockSetRequiresApproval).toHaveBeenCalledWith(expect.objectContaining({ requiresApproval: false }))
    })

    it('re-reads the chain once the change is confirmed', async () => {
      const refetch = mockConfig({ requiresApproval: false })
      const { getByTestId } = render(<PoolSettingsScreen />)

      await act(async () => {
        fireEvent.press(getByTestId('settings-approval-toggle'))
      })

      await waitFor(() => expect(refetch).toHaveBeenCalled())
    })

    it('does not re-read when the change failed', async () => {
      const refetch = mockConfig({ requiresApproval: false })
      mockSetRequiresApproval.mockRejectedValue(new Error('Only the pool owner can change this'))
      const { getByTestId } = render(<PoolSettingsScreen />)

      await act(async () => {
        fireEvent.press(getByTestId('settings-approval-toggle'))
      })

      expect(refetch).not.toHaveBeenCalled()
    })

    it('shows the failure', () => {
      mockSettingsError = 'Only the pool owner can change this'

      const { getByTestId } = render(<PoolSettingsScreen />)

      expect(getByTestId('settings-error')).toBeTruthy()
    })

    it('locks the control while a change is in flight', async () => {
      mockIsSubmitting = true
      const { getByTestId } = render(<PoolSettingsScreen />)

      await act(async () => {
        fireEvent.press(getByTestId('settings-approval-toggle'))
      })

      expect(mockSetRequiresApproval).not.toHaveBeenCalled()
      // Both toggles say "Confirming…" — one wallet, one transaction at a time —
      // so this has to name the control rather than search the whole screen.
      expect(getByTestId('settings-approval-toggle')).toHaveTextContent('Confirming…')
    })
  })

  describe('deciding who joins', () => {
    it('shows the pool as open by default', () => {
      const { getByTestId } = render(<PoolSettingsScreen />)

      expect(getByTestId('settings-membership-off')).toBeTruthy()
    })

    it('closes an open pool', async () => {
      const { getByTestId } = render(<PoolSettingsScreen />)

      await act(async () => {
        fireEvent.press(getByTestId('settings-membership-toggle'))
      })

      expect(mockSetRequiresMembership).toHaveBeenCalledWith(
        expect.objectContaining({ poolAddress: poolStore.poolById(2)!.poolAddress, requiresMembership: true })
      )
    })

    it('opens a closed pool', async () => {
      mockConfig({ requiresMembership: true })
      const { getByTestId } = render(<PoolSettingsScreen />)

      expect(getByTestId('settings-membership-on')).toBeTruthy()

      await act(async () => {
        fireEvent.press(getByTestId('settings-membership-toggle'))
      })

      expect(mockSetRequiresMembership).toHaveBeenCalledWith(expect.objectContaining({ requiresMembership: false }))
    })

    it('reassures the owner that closing strands nobody', () => {
      // The register is written on every deposit, so everyone who has funded the
      // pool is already a member — the fact an owner needs before flipping this.
      const { getByText } = render(<PoolSettingsScreen />)

      expect(getByText(/stays a member/)).toBeTruthy()
    })

    it('re-reads the chain once the change confirms', async () => {
      const refetch = mockConfig()
      const { getByTestId } = render(<PoolSettingsScreen />)

      await act(async () => {
        fireEvent.press(getByTestId('settings-membership-toggle'))
      })

      await waitFor(() => expect(refetch).toHaveBeenCalled())
    })
  })

  describe('what a change does to work in flight', () => {
    it('warns that turning approval off leaves requests waiting', () => {
      // The contract is deliberate about this: the owner still has to decide.
      mockConfig({ requiresApproval: true })
      poolStore.loanRecords = [pendingRequest()]

      const { getByText } = render(<PoolSettingsScreen />)

      expect(getByText(/does not clear the request already waiting/)).toBeTruthy()
    })

    it('counts more than one', () => {
      mockConfig({ requiresApproval: true })
      poolStore.loanRecords = [pendingRequest(), pendingRequest({ id: '31337-2-6', loanId: 6 })]

      const { getByText } = render(<PoolSettingsScreen />)

      expect(getByText(/does not clear the 2 requests already waiting/)).toBeTruthy()
    })

    it('says outstanding loans are unaffected when turning it on', () => {
      mockConfig({ requiresApproval: false })

      const { getByText } = render(<PoolSettingsScreen />)

      expect(getByText(/affects new borrowing only/)).toBeTruthy()
    })
  })

  it('explains that an older pool cannot be changed at all', () => {
    // A pre-beacon clone has no approval step and cannot be upgraded, so
    // `poolConfig` decodes to nothing. Offering a switch that reverts is worse.
    mockConfig({ readable: false })

    const { getByTestId, queryByTestId } = render(<PoolSettingsScreen />)

    expect(getByTestId('settings-unsupported')).toBeTruthy()
    expect(queryByTestId('settings-approval-toggle')).toBeNull()
  })
})
