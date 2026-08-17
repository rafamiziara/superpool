import { MemberStatus } from '@superpool/types'
import React from 'react'
import {
  makeContributeTransaction,
  makePendingTransaction,
  POOL_ADDRESS,
  TX_HASH,
} from '../../../src/__tests__/fixtures/pendingTransaction'
import { mockWagmiUseReadContract } from '../../../src/__tests__/mocks'
import { mockLocalSearchParams, mockRouterBack, mockRouterPush } from '../../../src/__tests__/setup'
import { fireEvent, render } from '../../../src/__tests__/test-utils'
import { MOCK_MEMBERSHIPS } from '../../../src/mocks/lending'
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
    const { getAllByText, getByText } = render(<PoolDetailScreen />)

    expect(getByText('Liquidity')).toBeTruthy()
    // Mock mode serves no contributions, so a pool starts at zero rather than
    // showing a figure the chain has not produced. `getAllByText` because the
    // interest card reads zero too, for the same reason.
    expect(getAllByText('0 POL').length).toBeGreaterThan(0)
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

  it('opens the borrow screen from the pool', () => {
    const { getByTestId } = render(<PoolDetailScreen />)

    fireEvent.press(getByTestId('pool-request-loan-button'))

    expect(mockRouterPush).toHaveBeenCalledWith('/(auth)/pool/borrow?poolId=1')
  })

  // -------------------------------------------------------------------------
  // The owner's queue of loan requests.
  //
  // Only pools whose owner turned review on ever produce one, so the entry
  // point is conditional on there actually being something to decide rather
  // than on the pool existing.
  // -------------------------------------------------------------------------

  describe('loan requests waiting on the owner', () => {
    afterEach(() => {
      poolStore.loanRecords = []
    })

    function pendingRequest(overrides: Record<string, unknown> = {}) {
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
        principalOutstanding: '4000000000000000000',
        interestOutstanding: '0',
        status: 'requested' as const,
        chainId: 31337,
        transactionHash: '0xaaa',
        blockNumber: 100,
        ...overrides,
      }
    }

    it('offers the queue to the owner when something is waiting', () => {
      mockLocalSearchParams.mockReturnValue({ id: SELF_OWNED })
      poolStore.loanRecords = [pendingRequest()]

      const { getByTestId } = render(<PoolDetailScreen />)

      fireEvent.press(getByTestId('pool-approvals-link'))

      expect(mockRouterPush).toHaveBeenCalledWith('/(auth)/pool/approvals?poolId=2')
    })

    it('counts every member’s request, not the owner’s own', () => {
      mockLocalSearchParams.mockReturnValue({ id: SELF_OWNED })
      poolStore.loanRecords = [pendingRequest(), pendingRequest({ id: '31337-2-6', loanId: 6 })]

      const { getByText } = render(<PoolDetailScreen />)

      expect(getByText('2 loan requests')).toBeTruthy()
    })

    it('stays hidden when nothing is waiting', () => {
      // A pool that lends on demand never produces a request, so a permanent
      // entry point would be dead weight on most pools.
      mockLocalSearchParams.mockReturnValue({ id: SELF_OWNED })

      const { queryByTestId } = render(<PoolDetailScreen />)

      expect(queryByTestId('pool-approvals-link')).toBeNull()
    })

    it('stays hidden from anyone who is not the owner', () => {
      // Deciding is `onlyOwner`; offering it to a member invites a revert.
      mockLocalSearchParams.mockReturnValue({ id: OTHER_OWNED })
      poolStore.loanRecords = [pendingRequest({ id: '31337-1-5', poolId: 1 })]

      const { queryByTestId } = render(<PoolDetailScreen />)

      expect(queryByTestId('pool-approvals-link')).toBeNull()
    })

    it('sends the borrower to their own request rather than a new one', () => {
      mockLocalSearchParams.mockReturnValue({ id: SELF_OWNED })
      poolStore.loanRecords = [pendingRequest({ borrower: poolStore.userAddress })]

      const { getByText } = render(<PoolDetailScreen />)

      expect(getByText('Your request')).toBeTruthy()
    })
  })

  describe('pool settings', () => {
    it('offers settings to the owner', () => {
      mockLocalSearchParams.mockReturnValue({ id: SELF_OWNED })

      const { getByTestId } = render(<PoolDetailScreen />)

      fireEvent.press(getByTestId('pool-settings-link'))

      expect(mockRouterPush).toHaveBeenCalledWith('/(auth)/pool/settings?poolId=2')
    })

    it('offers them even with nothing waiting', () => {
      // Unlike the approvals queue: the one setting there is decides whether a
      // queue can exist at all, so hiding it would make the feature unreachable.
      mockLocalSearchParams.mockReturnValue({ id: SELF_OWNED })

      const { getByTestId, queryByTestId } = render(<PoolDetailScreen />)

      expect(getByTestId('pool-settings-link')).toBeTruthy()
      expect(queryByTestId('pool-approvals-link')).toBeNull()
    })

    it('hides them from anyone who is not the owner', () => {
      mockLocalSearchParams.mockReturnValue({ id: OTHER_OWNED })

      const { queryByTestId } = render(<PoolDetailScreen />)

      expect(queryByTestId('pool-settings-link')).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // Membership, which the screen used to express only as a balance — leaving an
  // open pool looking like it had no membership at all, and offering a stranger
  // a borrow button the contract reverts.
  // -------------------------------------------------------------------------

  describe('membership', () => {
    /** In the mock data, and the mock user is not a member of it. */
    const STRANGER_POOL = '5'
    /** The fixtures hold the user as `pending` here, with nothing in it. */
    const PENDING_POOL = '4'

    /** How many memberships the fixtures ship, so a case can add its own. */
    const FIXTURE_MEMBERSHIPS = MOCK_MEMBERSHIPS.length

    /**
     * `poolConfig`, whose sixth member is the membership gate.
     *
     * Read from the chain and not from the indexed record, so a test has to
     * answer as the contract would rather than edit a pool fixture.
     */
    function chainSaysPermissioned(requiresMembership: boolean): void {
      mockWagmiUseReadContract.mockImplementation((config?: { functionName?: string }) => ({
        data: config?.functionName === 'poolConfig' ? [0n, 0n, 0n, true, false, requiresMembership] : undefined,
        refetch: jest.fn().mockResolvedValue({ data: undefined }),
      }))
    }

    /**
     * Put the connected wallet in a standing the fixtures do not carry.
     *
     * Mock mode serves `MOCK_MEMBERSHIPS` wholesale and never consults the
     * register, so `poolStore.memberRecords` — how the owner-side screens do
     * this — has no effect on what the user is told about themselves.
     */
    function givenStanding(poolId: string, status: MemberStatus, currentBalance = 0n): void {
      MOCK_MEMBERSHIPS.push({
        walletAddress: poolStore.userAddress,
        poolId,
        joinedAt: new Date(),
        totalContributed: currentBalance,
        currentBalance,
        isAdmin: false,
        status,
      })
    }

    afterEach(() => {
      MOCK_MEMBERSHIPS.length = FIXTURE_MEMBERSHIPS
      poolStore.loanRecords = []
      // The module default: no read has answered, which decodes to an open pool.
      mockWagmiUseReadContract.mockImplementation(() => ({
        data: undefined,
        isLoading: false,
        refetch: jest.fn().mockResolvedValue({ data: undefined }),
      }))
    })

    describe('an open pool', () => {
      it('tells a stranger that contributing is the way in', () => {
        mockLocalSearchParams.mockReturnValue({ id: STRANGER_POOL })

        const { getByTestId, getByText } = render(<PoolDetailScreen />)

        expect(getByTestId('pool-membership-notice')).toBeTruthy()
        expect(getByText('Open to anyone')).toBeTruthy()
        expect(getByText(/Contributing makes you a member/)).toBeTruthy()
      })

      it('does not sell that stranger a loan the contract would revert', () => {
        // `createLoan` is gated on `Membership.Active` in both modes, and an
        // open pool grants it on the first deposit — never on the request.
        mockLocalSearchParams.mockReturnValue({ id: STRANGER_POOL })

        const { getByTestId, getByText } = render(<PoolDetailScreen />)

        expect(getByText('Contribute to borrow')).toBeTruthy()

        fireEvent.press(getByTestId('pool-request-loan-button'))

        expect(mockRouterPush).not.toHaveBeenCalled()
      })

      it('still offers the stranger the contribute button, which does work', () => {
        mockLocalSearchParams.mockReturnValue({ id: STRANGER_POOL })

        const { getByTestId } = render(<PoolDetailScreen />)

        fireEvent.press(getByTestId('pool-contribute-button'))

        expect(mockRouterPush).toHaveBeenCalledWith('/(auth)/pool/contribute?poolId=5')
      })

      it('tells a member they are one, and lets them borrow', () => {
        const { getByTestId, getByText } = render(<PoolDetailScreen />)

        expect(getByText('You are a member')).toBeTruthy()
        expect(getByText(/Contributing to an open circle makes you one/)).toBeTruthy()

        fireEvent.press(getByTestId('pool-request-loan-button'))

        expect(mockRouterPush).toHaveBeenCalledWith('/(auth)/pool/borrow?poolId=1')
      })

      it('offers a removed member the way back in that contributing is not', () => {
        // Depositing enrols `None` and `Left` and deliberately skips `Removed`,
        // so the contribute button on this very screen will not readmit them.
        mockLocalSearchParams.mockReturnValue({ id: STRANGER_POOL })
        givenStanding(STRANGER_POOL, MemberStatus.SUSPENDED, 40n)

        const { getByTestId, getByText } = render(<PoolDetailScreen />)

        expect(getByText('No longer a member')).toBeTruthy()

        fireEvent.press(getByTestId('pool-membership-ask'))

        expect(mockRouterPush).toHaveBeenCalledWith('/(auth)/pool/join?poolId=5')
      })

      it('keeps a removed member’s withdraw button', () => {
        // Removal takes away what you may do next, not what you already put in.
        mockLocalSearchParams.mockReturnValue({ id: STRANGER_POOL })
        givenStanding(STRANGER_POOL, MemberStatus.SUSPENDED, 40n)

        const { getByTestId } = render(<PoolDetailScreen />)

        fireEvent.press(getByTestId('pool-withdraw-button'))

        expect(mockRouterPush).toHaveBeenCalledWith('/(auth)/pool/withdraw?poolId=5')
      })

      it('tells a rejected applicant that contributing will not help', () => {
        mockLocalSearchParams.mockReturnValue({ id: STRANGER_POOL })
        givenStanding(STRANGER_POOL, MemberStatus.REJECTED)

        const { getByText } = render(<PoolDetailScreen />)

        expect(getByText('Not a member')).toBeTruthy()
        expect(getByText(/turned your request down/)).toBeTruthy()
      })

      it('hides withdraw from a member holding nothing', () => {
        // The register merged into `memberships` gives an admitted member a
        // record with a zero balance, and `withdraw` reverts on them.
        mockLocalSearchParams.mockReturnValue({ id: PENDING_POOL })

        const { queryByTestId } = render(<PoolDetailScreen />)

        expect(queryByTestId('pool-withdraw-button')).toBeNull()
      })

      it('says an applicant is waiting rather than calling them a stranger', () => {
        mockLocalSearchParams.mockReturnValue({ id: PENDING_POOL })

        const { getByText } = render(<PoolDetailScreen />)

        expect(getByText('Waiting to be let in')).toBeTruthy()
      })

      it('keeps borrowing reachable for a request already made', () => {
        // `myRequest` outlives the standing that produced it, and repayment is
        // ungated for the same reason: a removed borrower still owes the pool.
        mockLocalSearchParams.mockReturnValue({ id: STRANGER_POOL })
        poolStore.loanRecords = [
          {
            id: '31337-5-1',
            loanId: 1,
            poolId: 5,
            poolAddress: poolStore.poolById(5)!.poolAddress,
            borrower: poolStore.userAddress,
            amount: '4000000000000000000',
            interestRate: 500,
            duration: 2_592_000,
            startedAt: '2026-08-11T09:00:00.000Z',
            isRepaid: false,
            amountRepaid: '0',
            principalOutstanding: '4000000000000000000',
            interestOutstanding: '0',
            status: 'requested' as const,
            chainId: 31337,
            transactionHash: '0xaaa',
            blockNumber: 100,
          },
        ]

        const { getByTestId, getByText } = render(<PoolDetailScreen />)

        expect(getByText('Your request')).toBeTruthy()

        fireEvent.press(getByTestId('pool-request-loan-button'))

        expect(mockRouterPush).toHaveBeenCalledWith('/(auth)/pool/borrow?poolId=5')
      })

      it('tells the owner nobody has to ask them', () => {
        mockLocalSearchParams.mockReturnValue({ id: SELF_OWNED })

        const { getByText } = render(<PoolDetailScreen />)

        expect(getByText(/becomes a member, without asking you/)).toBeTruthy()
      })
    })

    describe('a permissioned pool', () => {
      beforeEach(() => chainSaysPermissioned(true))

      it('offers a stranger the way in instead of the actions that revert', () => {
        mockLocalSearchParams.mockReturnValue({ id: STRANGER_POOL })

        const { getByTestId, getByText, queryByTestId } = render(<PoolDetailScreen />)

        expect(getByText('Members only')).toBeTruthy()
        expect(getByTestId('pool-join-actions')).toBeTruthy()
        expect(queryByTestId('pool-actions')).toBeNull()
      })

      it('does not invite a member to ask for what they already have', () => {
        // The register is empty in mock mode, so this is the case where the
        // merged view is the only thing that knows they are in — and the two
        // halves of the screen must not contradict each other.
        const { getByTestId, getByText, queryByTestId } = render(<PoolDetailScreen />)

        expect(getByText('You are a member')).toBeTruthy()
        expect(getByText(/The owner let you in/)).toBeTruthy()
        expect(getByTestId('pool-actions')).toBeTruthy()
        expect(queryByTestId('pool-join-actions')).toBeNull()
      })

      it('leaves the asking to the action bar rather than the notice', () => {
        mockLocalSearchParams.mockReturnValue({ id: STRANGER_POOL })
        givenStanding(STRANGER_POOL, MemberStatus.REJECTED)

        const { getByText, queryByTestId } = render(<PoolDetailScreen />)

        expect(getByText(/You asked before and were turned down/)).toBeTruthy()
        expect(queryByTestId('pool-membership-ask')).toBeNull()
      })

      it('tells a removed member their money is still theirs', () => {
        mockLocalSearchParams.mockReturnValue({ id: STRANGER_POOL })
        givenStanding(STRANGER_POOL, MemberStatus.SUSPENDED, 40n)

        const { getByText } = render(<PoolDetailScreen />)

        expect(getByText(/still yours to withdraw/)).toBeTruthy()
      })

      it('says an applicant cannot fund the pool yet either', () => {
        mockLocalSearchParams.mockReturnValue({ id: PENDING_POOL })

        const { getByText } = render(<PoolDetailScreen />)

        expect(getByText(/Until they do you cannot fund this circle/)).toBeTruthy()
      })

      it('tells the owner it is theirs to decide', () => {
        mockLocalSearchParams.mockReturnValue({ id: SELF_OWNED })

        const { getByText } = render(<PoolDetailScreen />)

        expect(getByText('You decide who joins')).toBeTruthy()
      })
    })
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
