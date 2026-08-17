import React from 'react'
import { LOCALHOST_CHAIN_ID, makePendingTransaction } from '../../../../src/__tests__/fixtures/pendingTransaction'
import { mockWagmiUseAccount } from '../../../../src/__tests__/mocks'
import { mockRouterPush, mockRouterReplace } from '../../../../src/__tests__/setup'
import { MOCK_LOANS } from '../../../../src/mocks/lending'
import { fireEvent, render } from '../../../../src/__tests__/test-utils'
import { pendingTransactionsStore } from '../../../../src/stores/PendingTransactionsStore'
import { poolStore } from '../../../../src/stores/PoolStore'
import DashboardScreen from './index'

// Mock dependencies
jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}))

describe('DashboardScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    mockWagmiUseAccount.mockReturnValue({ isConnected: true, isConnecting: false, address: undefined, chainId: LOCALHOST_CHAIN_ID })
    await pendingTransactionsStore.reset()
    await poolStore.fetchPools()
  })

  it('renders the dashboard structure', () => {
    const { getByTestId } = render(<DashboardScreen />)

    expect(getByTestId('dashboard-screen')).toBeTruthy()
    expect(getByTestId('dashboard-hero')).toBeTruthy()
    expect(getByTestId('dashboard-pools')).toBeTruthy()
    expect(getByTestId('dashboard-actions')).toBeTruthy()
    expect(getByTestId('dashboard-activity')).toBeTruthy()
  })

  it('shows the total pool balance from the store', () => {
    const { getByText } = render(<DashboardScreen />)

    expect(getByText('601.6')).toBeTruthy()
  })

  it('says nothing about earnings when there are none', () => {
    // Earnings are no longer inferred from a balance exceeding what was
    // contributed — that was a stand-in for accounting the contract did not
    // have. With no claims and nothing read from the chain, the honest answer
    // is silence rather than a zero.
    const { queryByText } = render(<DashboardScreen />)

    expect(queryByText(/earned all-time/)).toBeNull()
  })

  it('shows lifetime earnings once a pool has credited some', () => {
    poolStore.setClaimable(1, 2_500_000_000_000_000_000n)

    const { getByText } = render(<DashboardScreen />)

    expect(getByText('+2.5 POL earned all-time')).toBeTruthy()

    poolStore.claimableByPool = {}
  })

  it('renders a macro-card per joined pool', () => {
    const { getByTestId } = render(<DashboardScreen />)

    for (const pool of poolStore.myPools) {
      expect(getByTestId(`pool-card-${pool.poolId}`)).toBeTruthy()
    }
  })

  it('shows the active loan with repay action', () => {
    const { getByTestId } = render(<DashboardScreen />)

    expect(getByTestId('dashboard-loan')).toBeTruthy()
    expect(getByTestId('repay-button')).toBeTruthy()
  })

  it('shows the user what their own borrowing record looks like', () => {
    // The same panel a pool owner sees when this wallet asks them for money.
    // The fixtures hold one loan repaid two days inside its term and one still
    // running, which is what the counts here are made of.
    const { getByTestId } = render(<DashboardScreen />)

    expect(getByTestId('dashboard-borrowing-record')).toBeTruthy()
    expect(getByTestId('dashboard-history-total')).toHaveTextContent('2')
    expect(getByTestId('dashboard-history-on-time')).toHaveTextContent('1')
  })

  it('leaves the record out for someone who has never borrowed', () => {
    // On an owner's queue "nothing to go on" is worth reading. On your own
    // dashboard it is a panel that exists to say it has nothing to say.
    poolStore.loanRecords = []
    const restore = MOCK_LOANS.splice(0, MOCK_LOANS.length)

    const { queryByTestId } = render(<DashboardScreen />)

    expect(queryByTestId('dashboard-borrowing-record')).toBeNull()

    MOCK_LOANS.push(...restore)
  })

  it('renders thumb-zone quick actions', () => {
    const { getByTestId } = render(<DashboardScreen />)

    expect(getByTestId('contribute-button')).toBeTruthy()
    expect(getByTestId('request-loan-button')).toBeTruthy()
  })

  it('sends the contribute action to the pools list, which is where a pool is chosen', () => {
    // The dashboard has no single pool in mind, so it hands over rather than
    // guessing which one the user meant.
    const { getByTestId } = render(<DashboardScreen />)

    fireEvent.press(getByTestId('contribute-button'))

    expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)/(tabs)/pools')
  })

  it('opens the borrow screen for the pool the active loan came from', () => {
    // Both buttons lead to the same screen: with a loan open there is nothing
    // to choose between borrowing and repaying, so the screen decides.
    const { getByTestId } = render(<DashboardScreen />)
    const poolId = poolStore.activeLoan!.poolId

    fireEvent.press(getByTestId('repay-button'))
    expect(mockRouterPush).toHaveBeenCalledWith(`/(auth)/pool/borrow?poolId=${poolId}`)

    fireEvent.press(getByTestId('request-loan-button'))
    expect(mockRouterPush).toHaveBeenCalledWith(`/(auth)/pool/borrow?poolId=${poolId}`)
  })

  it('sends someone with no loan to the pools list to pick one', () => {
    poolStore.loanRecords = []
    const restore = MOCK_LOANS.splice(0, MOCK_LOANS.length)

    const { getByTestId } = render(<DashboardScreen />)

    fireEvent.press(getByTestId('request-loan-button'))
    expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)/(tabs)/pools')

    MOCK_LOANS.push(...restore)
  })

  it('navigates from the "see all" links to the matching tabs', () => {
    const { getByTestId } = render(<DashboardScreen />)

    fireEvent.press(getByTestId('see-all-pools'))
    expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)/(tabs)/pools')

    fireEvent.press(getByTestId('see-all-activity'))
    expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)/(tabs)/activity')
  })

  it('opens the pool detail from a macro-card', () => {
    const { getByTestId } = render(<DashboardScreen />)

    fireEvent.press(getByTestId('pool-card-1'))

    expect(mockRouterPush).toHaveBeenCalledWith('/(auth)/pool/1')
  })

  it('hides the loan section when the user has no active loan', () => {
    // `loans` is derived now, so the fixtures behind it are what has to go.
    poolStore.loanRecords = []
    const restore = MOCK_LOANS.splice(0, MOCK_LOANS.length)

    const { queryByTestId } = render(<DashboardScreen />)

    expect(queryByTestId('dashboard-loan')).toBeNull()
    expect(queryByTestId('repay-button')).toBeNull()

    MOCK_LOANS.push(...restore)
  })

  // -------------------------------------------------------------------------
  // Requests waiting on the user.
  //
  // Owner-side work was reachable only by opening each pool in turn, so a
  // request could sit unseen indefinitely.
  // -------------------------------------------------------------------------

  describe('loan requests waiting on you', () => {
    /** Pool 2 in the mock data is the one the mock user owns. */
    function requestOnMyPool(overrides: Record<string, unknown> = {}) {
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
        status: 'requested' as const,
        chainId: 31337,
        transactionHash: '0xaaa',
        blockNumber: 100,
        ...overrides,
      }
    }

    it('surfaces them on the dashboard, not only inside the pool', () => {
      poolStore.loanRecords = [requestOnMyPool()]

      const { getByTestId } = render(<DashboardScreen />)

      expect(getByTestId('dashboard-approvals')).toBeTruthy()
      expect(getByTestId('dashboard-awaiting-chip')).toBeTruthy()
    })

    it('opens the queue for the pool the request belongs to', () => {
      poolStore.loanRecords = [requestOnMyPool()]

      const { getByTestId } = render(<DashboardScreen />)
      fireEvent.press(getByTestId('dashboard-approvals-2'))

      expect(mockRouterPush).toHaveBeenCalledWith('/(auth)/pool/approvals?poolId=2')
    })

    it('gives each waiting pool its own card', () => {
      // A single summary would have nowhere to go with two pools waiting: the
      // queue and the screen that clears it are both per pool. Only pool 2 is
      // owned by the mock user, so the second one is added here.
      const second = { ...poolStore.poolById(2)!, poolId: 99, name: 'Second Circle' }
      poolStore.pools = [...poolStore.pools, second]
      poolStore.loanRecords = [requestOnMyPool(), requestOnMyPool({ id: '31337-99-1', poolId: 99, loanId: 1 })]

      const { getByTestId } = render(<DashboardScreen />)

      expect(getByTestId('dashboard-approvals-2')).toBeTruthy()
      expect(getByTestId('dashboard-approvals-99')).toBeTruthy()
    })

    it('stays silent when nothing is waiting', () => {
      poolStore.loanRecords = []

      const { queryByTestId } = render(<DashboardScreen />)

      expect(queryByTestId('dashboard-approvals')).toBeNull()
      expect(queryByTestId('dashboard-awaiting-chip')).toBeNull()
    })
  })

  describe('pending pool creations', () => {
    it('shows no banner when nothing is in flight', () => {
      const { queryByTestId } = render(<DashboardScreen />)

      expect(queryByTestId('pending-transaction-banner')).toBeNull()
    })

    it('reports a pool being created', async () => {
      // The dashboard has no pending pool card, so without this the pool is
      // invisible here until the backend catches up.
      await pendingTransactionsStore.addPendingTransaction(makePendingTransaction())

      const { getByText } = render(<DashboardScreen />)

      expect(getByText('1 pool being created')).toBeTruthy()
    })

    it('opens the status modal from the banner', async () => {
      await pendingTransactionsStore.addPendingTransaction(makePendingTransaction())

      const { getByTestId, getByText, queryByText } = render(<DashboardScreen />)

      expect(queryByText('Creating your pool')).toBeNull()

      fireEvent.press(getByTestId('pending-transaction-banner'))

      expect(getByText('Creating your pool')).toBeTruthy()
    })
  })

  // -------------------------------------------------------------------------
  // Which chain the balance is.
  //
  // The hero figure is one chain's, and reads as everything the user owns
  // without a network against it.
  // -------------------------------------------------------------------------

  describe('the network', () => {
    it('names the connected chain beside the balance', () => {
      const { getByTestId } = render(<DashboardScreen />)

      expect(getByTestId('dashboard-network')).toBeTruthy()
    })

    it('follows the wallet rather than the default', () => {
      mockWagmiUseAccount.mockReturnValue({ isConnected: true, isConnecting: false, address: undefined, chainId: 80002 })

      const { getByText } = render(<DashboardScreen />)

      expect(getByText('Polygon Amoy')).toBeTruthy()
    })
  })
})
