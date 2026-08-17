import { Firestore } from 'firebase-admin/firestore'

const mockNotifyOnce = jest.fn()

jest.mock('./notifications', () => ({
  ...jest.requireActual('./notifications'),
  notifyOnce: (...args: unknown[]) => mockNotifyOnce(...args),
}))

import { IndexLoanResult, LoanTransition, ParsedLoan } from './loanIndexer'
import { IndexMembershipResult, MembershipTransition, ParsedMembership } from './membershipIndexer'
import { notifyLoanRequested, notifyMembershipRequested } from './poolNotifications'

const CHAIN_ID = 31337
const POOL_ID = 7
const OWNER = '0x3f8a9d21e4c09b7cd51b04e1f2a6cc7382e4b9a0'
const ASKER = '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc'

function buildFirestore(pool: object | null = { poolOwner: OWNER, name: 'Builders Guild' }) {
  const mockDoc = jest.fn().mockReturnValue({
    get: jest.fn().mockResolvedValue({ exists: pool !== null, data: () => pool }),
  })

  return { firestore: { collection: jest.fn().mockReturnValue({ doc: mockDoc }) } as unknown as Firestore, mockDoc }
}

function loanResult(transition: LoanTransition): IndexLoanResult {
  return { id: `${CHAIN_ID}-${POOL_ID}-1`, loanId: 1, poolId: POOL_ID, alreadyIndexed: false, stored: true, transition }
}

function parsedLoan(borrower = ASKER): ParsedLoan {
  return {
    loanId: 1,
    poolId: POOL_ID,
    poolAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    borrower,
    amount: '3000000000000000000',
    interestRate: 500,
    duration: 2_592_000,
    startedAt: new Date('2026-08-11T09:00:00.000Z'),
    isRepaid: false,
    amountRepaid: '0',
    principalOutstanding: '3000000000000000000',
    interestOutstanding: '0',
    status: 'requested',
    chainId: CHAIN_ID,
    transactionHash: `0x${'a'.repeat(64)}`,
    blockNumber: 120,
  }
}

function membershipResult(transition: MembershipTransition): IndexMembershipResult {
  return { id: `${CHAIN_ID}-${POOL_ID}-${ASKER}`, poolId: POOL_ID, account: ASKER, alreadyIndexed: false, stored: true, transition }
}

function parsedMembership(account = ASKER): ParsedMembership {
  return {
    poolId: POOL_ID,
    poolAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    account,
    status: 'requested',
    joinedAt: new Date('2026-08-11T09:00:00.000Z'),
    chainId: CHAIN_ID,
    transactionHash: `0x${'a'.repeat(64)}`,
    blockNumber: 120,
  }
}

beforeEach(() => {
  mockNotifyOnce.mockReset()
  mockNotifyOnce.mockResolvedValue({ sent: 1, pruned: 0, noRecipients: false })
})

// ---------------------------------------------------------------------------
// Loan requests.
// ---------------------------------------------------------------------------

describe('notifyLoanRequested', () => {
  it('tells the pool owner when somebody asks to borrow', async () => {
    const { firestore } = buildFirestore()

    await notifyLoanRequested(loanResult('requested'), parsedLoan(), firestore)

    expect(mockNotifyOnce).toHaveBeenCalledWith(
      `${CHAIN_ID}-${POOL_ID}-1-loan_requested`,
      OWNER,
      expect.objectContaining({
        data: expect.objectContaining({ kind: 'loan_requested', poolId: '7', poolName: 'Builders Guild', actor: ASKER }),
      }),
      firestore
    )
  })

  // The trap this exists for: `stored` is not news. The loan indexer rewrites a
  // document to correct its transaction reference, and triggering on that would
  // announce a request every time a sweep tidied up a hash.
  it('says nothing for a write that changed no state', async () => {
    const { firestore } = buildFirestore()

    await notifyLoanRequested(loanResult(null), parsedLoan(), firestore)

    expect(mockNotifyOnce).not.toHaveBeenCalled()
  })

  it.each<LoanTransition>(['disbursed', 'rejected', 'repaid'])(
    'says nothing about a %s loan, which is not owner-facing',
    async (transition) => {
      const { firestore } = buildFirestore()

      await notifyLoanRequested(loanResult(transition), parsedLoan(), firestore)

      expect(mockNotifyOnce).not.toHaveBeenCalled()
    }
  )

  // Nobody needs telling about their own action.
  it('does not tell an owner they borrowed from their own pool', async () => {
    const { firestore } = buildFirestore()

    await notifyLoanRequested(loanResult('requested'), parsedLoan(OWNER), firestore)

    expect(mockNotifyOnce).not.toHaveBeenCalled()
  })

  it('compares the owner and the borrower case-insensitively', async () => {
    // Addresses are stored lowercased; a checksummed one must still match.
    const { firestore } = buildFirestore({ poolOwner: OWNER, name: 'Builders Guild' })

    await notifyLoanRequested(loanResult('requested'), parsedLoan(OWNER.toUpperCase().replace('0X', '0x')), firestore)

    expect(mockNotifyOnce).not.toHaveBeenCalled()
  })

  // No owner to notify and no name for the body; inventing either is worse
  // than staying quiet, and the sweep will index the pool.
  it('stays quiet when the pool was never indexed', async () => {
    const { firestore } = buildFirestore(null)

    await notifyLoanRequested(loanResult('requested'), parsedLoan(), firestore)

    expect(mockNotifyOnce).not.toHaveBeenCalled()
  })

  it('reads the pool by chain and id', async () => {
    const { firestore, mockDoc } = buildFirestore()

    await notifyLoanRequested(loanResult('requested'), parsedLoan(), firestore)

    expect(mockDoc).toHaveBeenCalledWith(`${CHAIN_ID}-${POOL_ID}`)
  })

  it('falls back to a plain name rather than an empty one', async () => {
    const { firestore } = buildFirestore({ poolOwner: OWNER, name: '' })

    await notifyLoanRequested(loanResult('requested'), parsedLoan(), firestore)

    expect(mockNotifyOnce).toHaveBeenCalledWith(
      expect.any(String),
      OWNER,
      expect.objectContaining({ data: expect.objectContaining({ poolName: 'pool #7' }) }),
      firestore
    )
  })
})

// ---------------------------------------------------------------------------
// Membership requests.
// ---------------------------------------------------------------------------

describe('notifyMembershipRequested', () => {
  it('tells the pool owner when somebody asks to join', async () => {
    const { firestore } = buildFirestore()

    await notifyMembershipRequested(membershipResult('requested'), parsedMembership(), firestore)

    expect(mockNotifyOnce).toHaveBeenCalledWith(
      `${CHAIN_ID}-${POOL_ID}-${ASKER}-membership_requested`,
      OWNER,
      expect.objectContaining({
        data: expect.objectContaining({ kind: 'membership_requested', poolId: '7', actor: ASKER }),
      }),
      firestore
    )
  })

  // An open pool enrolling whoever deposited. Nobody decided anything, so there
  // is nothing to tell the owner — and the indexer reports it as no transition.
  it('says nothing when a deposit enrolled somebody automatically', async () => {
    const { firestore } = buildFirestore()

    await notifyMembershipRequested(membershipResult(null), parsedMembership(), firestore)

    expect(mockNotifyOnce).not.toHaveBeenCalled()
  })

  it.each<MembershipTransition>(['active', 'rejected', 'removed', 'left'])(
    'says nothing about a %s standing, which is not owner-facing',
    async (transition) => {
      const { firestore } = buildFirestore()

      await notifyMembershipRequested(membershipResult(transition), parsedMembership(), firestore)

      expect(mockNotifyOnce).not.toHaveBeenCalled()
    }
  )

  it('does not tell an owner they asked to join their own pool', async () => {
    const { firestore } = buildFirestore()

    await notifyMembershipRequested(membershipResult('requested'), parsedMembership(OWNER), firestore)

    expect(mockNotifyOnce).not.toHaveBeenCalled()
  })

  it('stays quiet when the pool was never indexed', async () => {
    const { firestore } = buildFirestore(null)

    await notifyMembershipRequested(membershipResult('requested'), parsedMembership(), firestore)

    expect(mockNotifyOnce).not.toHaveBeenCalled()
  })

  // "Nobody" must not match "nobody": an empty actor is not the owner, and
  // treating it as one would silence a notification rather than send a wrong one.
  it('does not read a blank actor as the owner', async () => {
    const { firestore } = buildFirestore()

    await notifyMembershipRequested(membershipResult('requested'), parsedMembership(''), firestore)

    expect(mockNotifyOnce).toHaveBeenCalled()
  })

  it('stays quiet when the indexed pool has no owner recorded', async () => {
    const { firestore } = buildFirestore({ name: 'Builders Guild' })

    await notifyMembershipRequested(membershipResult('requested'), parsedMembership(), firestore)

    expect(mockNotifyOnce).not.toHaveBeenCalled()
  })
})
