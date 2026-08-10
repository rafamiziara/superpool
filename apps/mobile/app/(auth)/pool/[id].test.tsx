import React from 'react'
import {
  makeContributeTransaction,
  makePendingTransaction,
  POOL_ADDRESS,
  TX_HASH,
} from '../../../src/__tests__/fixtures/pendingTransaction'
import { mockToast } from '../../../src/__tests__/mocks'
import { mockLocalSearchParams, mockRouterBack, mockRouterPush } from '../../../src/__tests__/setup'
import { fireEvent, render } from '../../../src/__tests__/test-utils'
import { pendingTransactionsStore } from '../../../src/stores/PendingTransactionsStore'
import { poolStore } from '../../../src/stores/PoolStore'
import PoolDetailScreen from './[id]'

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}))

/** The contribution fixture's params, so each case only varies the pool. */
const CONTRIBUTION_PARAMS = {
  poolId: 1,
  poolAddress: POOL_ADDRESS,
  poolName: 'Neighbourhood Fund',
  amount: '5000000000000000000',
} as const

/** Pool 1 is owned by someone else; pool 2 is owned by the mock user. */
const OTHER_OWNED = '1'
const SELF_OWNED = '2'

describe('PoolDetailScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    mockLocalSearchParams.mockReturnValue({ id: OTHER_OWNED })
    await poolStore.fetchPools()
  })

  it('renders the pool detail for the route param', () => {
    const { getByTestId, getByText } = render(<PoolDetailScreen />)

    // The pool name is header config (`Stack.Screen options`), so assert on body copy.
    expect(getByTestId('pool-detail-screen')).toBeTruthy()
    expect(getByText(poolStore.poolById(Number(OTHER_OWNED))!.description)).toBeTruthy()
  })

  it('shows the contract-derived stats', () => {
    const { getByText } = render(<PoolDetailScreen />)

    expect(getByText('500 POL')).toBeTruthy() // max loan
    expect(getByText('4.5%')).toBeTruthy() // 450 bps
    expect(getByText('30 days')).toBeTruthy()
  })

  it('shows the pool’s liquidity, summed from its contributions', () => {
    const { getByText } = render(<PoolDetailScreen />)

    expect(getByText('Liquidity')).toBeTruthy()
    // Mock mode serves no contributions, so a pool starts at zero rather than
    // showing a figure the chain has not produced.
    expect(getByText('0 POL')).toBeTruthy()
  })

  it('shows the abbreviated owner address when the user is not the owner', () => {
    const { getByText, queryByText } = render(<PoolDetailScreen />)

    expect(getByText('Managed by')).toBeTruthy()
    expect(getByText('0x3F8a…b9a0')).toBeTruthy()
    expect(queryByText('Managed by you')).toBeNull()
  })

  it('shows the admin badge when the user owns the pool', () => {
    mockLocalSearchParams.mockReturnValue({ id: SELF_OWNED })

    const { getByText } = render(<PoolDetailScreen />)

    expect(getByText('Managed by you')).toBeTruthy()
    expect(getByText('Admin')).toBeTruthy()
  })

  it('shows the membership position card', () => {
    const { getByText } = render(<PoolDetailScreen />)

    expect(getByText('Your position')).toBeTruthy()
    expect(getByText('195.4 POL')).toBeTruthy() // current balance
    expect(getByText('180 POL')).toBeTruthy() // total contributed
  })

  it('renders the pool activity feed', () => {
    const { getByText, getByTestId } = render(<PoolDetailScreen />)

    expect(getByText('Pool activity')).toBeTruthy()
    for (const tx of poolStore.transactionsFor(Number(OTHER_OWNED))) {
      expect(getByTestId(`activity-row-${tx.id}`)).toBeTruthy()
    }
  })

  it('opens the contribute screen for this pool', () => {
    const { getByTestId } = render(<PoolDetailScreen />)

    fireEvent.press(getByTestId('pool-contribute-button'))

    // The pool travels as a query parameter: `pool/contribute` is a static
    // sibling of `pool/[id]`, not a segment beneath it.
    expect(mockRouterPush).toHaveBeenCalledWith('/(auth)/pool/contribute?poolId=1')
  })

  it('still shows a coming-soon toast for loan requests', () => {
    const { getByTestId } = render(<PoolDetailScreen />)

    fireEvent.press(getByTestId('pool-request-loan-button'))

    expect(mockToast.show).toHaveBeenCalledWith({ type: 'info', text1: 'Loan request is coming soon' })
  })

  describe('contributions still in flight', () => {
    afterEach(async () => {
      await pendingTransactionsStore.reset()
    })

    it('shows a pending deposit into this pool', async () => {
      // Until the backend has indexed it, the deposit is invisible in the
      // liquidity figure — this row is the only trace of it.
      await pendingTransactionsStore.addPendingTransaction(makeContributeTransaction({ params: { ...CONTRIBUTION_PARAMS, poolId: 1 } }))

      const { getByTestId } = render(<PoolDetailScreen />)

      expect(getByTestId('pool-pending-contributions')).toBeTruthy()
      expect(getByTestId(`pending-contribution-card-${TX_HASH}`)).toBeTruthy()
    })

    it('ignores deposits into other pools', async () => {
      await pendingTransactionsStore.addPendingTransaction(makeContributeTransaction({ params: { ...CONTRIBUTION_PARAMS, poolId: 2 } }))

      const { queryByTestId } = render(<PoolDetailScreen />)

      expect(queryByTestId('pool-pending-contributions')).toBeNull()
    })

    it('ignores pool creations, which the pools list shows instead', async () => {
      await pendingTransactionsStore.addPendingTransaction(makePendingTransaction())

      const { queryByTestId } = render(<PoolDetailScreen />)

      expect(queryByTestId('pool-pending-contributions')).toBeNull()
    })

    it('opens the status modal from a pending row', async () => {
      await pendingTransactionsStore.addPendingTransaction(makeContributeTransaction({ params: { ...CONTRIBUTION_PARAMS, poolId: 1 } }))

      const { getByTestId } = render(<PoolDetailScreen />)
      fireEvent.press(getByTestId(`pending-contribution-card-${TX_HASH}`))

      expect(getByTestId('transaction-status-modal').props.visible).toBe(true)
    })
  })

  it('falls back to a not-found state for an unknown pool', () => {
    mockLocalSearchParams.mockReturnValue({ id: '9999' })

    const { getByTestId, queryByTestId } = render(<PoolDetailScreen />)

    expect(getByTestId('pool-not-found')).toBeTruthy()
    expect(queryByTestId('pool-detail-screen')).toBeNull()
  })

  it('goes back from the not-found state', () => {
    mockLocalSearchParams.mockReturnValue({ id: '9999' })

    const { getByText } = render(<PoolDetailScreen />)
    fireEvent.press(getByText('Go back'))

    expect(mockRouterBack).toHaveBeenCalled()
  })
})
