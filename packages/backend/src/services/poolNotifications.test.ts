import { Firestore } from 'firebase-admin/firestore'

const mockNotifyOnce = jest.fn()

jest.mock('./notifications', () => ({
  ...jest.requireActual('./notifications'),
  notifyOnce: (...args: unknown[]) => mockNotifyOnce(...args),
}))

import { IndexLoanResult, LoanTransition, ParsedLoan } from './loanIndexer'
import { IndexMembershipResult, MembershipTransition, ParsedMembership } from './membershipIndexer'
import { notifyLoanDecided, notifyLoanRequested, notifyMembershipDecided, notifyMembershipRequested } from './poolNotifications'

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

// ---------------------------------------------------------------------------
// Answers to the borrower.
// ---------------------------------------------------------------------------

/** A provider whose transactions were all sent by somebody other than the borrower. */
function ownerSentIt() {
  return { getTransaction: jest.fn().mockResolvedValue({ from: OWNER }) }
}

/** A provider reporting that the borrower sent the transaction themselves. */
function borrowerSentIt() {
  return { getTransaction: jest.fn().mockResolvedValue({ from: ASKER }) }
}

describe('notifyLoanDecided', () => {
  it('tells a borrower their loan was approved', async () => {
    const { firestore } = buildFirestore()

    await notifyLoanDecided(loanResult('approved'), parsedLoan(), ownerSentIt() as never, firestore)

    expect(mockNotifyOnce).toHaveBeenCalledWith(
      `${CHAIN_ID}-${POOL_ID}-1-loan_approved`,
      ASKER,
      expect.objectContaining({
        title: 'Loan approved',
        data: expect.objectContaining({ kind: 'loan_approved', loanId: '1', poolId: String(POOL_ID) }),
      }),
      firestore
    )
  })

  it('tells a borrower their debt was declared in default', async () => {
    const { firestore } = buildFirestore()

    await notifyLoanDecided(loanResult('defaulted'), parsedLoan(), ownerSentIt() as never, firestore)

    const [, recipient, notification] = mockNotifyOnce.mock.calls[0]

    expect(recipient).toBe(ASKER)
    // Says what is still true, not only that something bad happened: the debt
    // is open and paying it is still the way out.
    expect(notification.body).toContain('still owed')
  })

  it('does not congratulate a borrower on a loan they took themselves', async () => {
    // `createLoan` reaches `disbursed` with nobody having decided anything.
    // That is the `disbursed` transition, and it is not an answer to anyone.
    const { firestore } = buildFirestore()

    await notifyLoanDecided(loanResult('disbursed'), parsedLoan(), ownerSentIt() as never, firestore)

    expect(mockNotifyOnce).not.toHaveBeenCalled()
  })

  it.each(['requested', 'repayment', 'repaid', null] as LoanTransition[])('stays quiet on the %s transition', async (transition) => {
    const { firestore } = buildFirestore()

    await notifyLoanDecided(loanResult(transition), parsedLoan(), ownerSentIt() as never, firestore)

    expect(mockNotifyOnce).not.toHaveBeenCalled()
  })

  describe('a rejection the borrower caused themselves', () => {
    it('tells a borrower the owner turned them down', async () => {
      const { firestore } = buildFirestore()

      await notifyLoanDecided(loanResult('rejected'), parsedLoan(), ownerSentIt() as never, firestore)

      expect(mockNotifyOnce).toHaveBeenCalledWith(expect.any(String), ASKER, expect.objectContaining({ title: 'Loan declined' }), firestore)
    })

    it('does not tell a borrower they were declined when they cancelled', async () => {
      // `cancelLoanRequest` emits `LoanRejected` and leaves the loan in exactly
      // the state `rejectLoan` does, so the record cannot tell the two apart.
      // Only the transaction's sender can.
      const { firestore } = buildFirestore()

      await notifyLoanDecided(loanResult('rejected'), parsedLoan(), borrowerSentIt() as never, firestore)

      expect(mockNotifyOnce).not.toHaveBeenCalled()
    })

    it('stays quiet rather than guessing when the node cannot be reached', async () => {
      // Fails closed: a missed courtesy is cheaper than telling somebody they
      // were refused when they changed their own mind. The claim is never made,
      // so a later sweep can still send it.
      const { firestore } = buildFirestore()
      const provider = { getTransaction: jest.fn().mockRejectedValue(new Error('no rpc')) }

      await notifyLoanDecided(loanResult('rejected'), parsedLoan(), provider as never, firestore)

      expect(mockNotifyOnce).not.toHaveBeenCalled()
    })

    it('stays quiet when the transaction cannot be found', async () => {
      const { firestore } = buildFirestore()
      const provider = { getTransaction: jest.fn().mockResolvedValue(null) }

      await notifyLoanDecided(loanResult('rejected'), parsedLoan(), provider as never, firestore)

      expect(mockNotifyOnce).not.toHaveBeenCalled()
    })

    it('does not read the sender on any transition but a rejection', async () => {
      // One `getTransaction` per rejection, not one per loan event.
      const { firestore } = buildFirestore()
      const provider = ownerSentIt()

      await notifyLoanDecided(loanResult('approved'), parsedLoan(), provider as never, firestore)

      expect(provider.getTransaction).not.toHaveBeenCalled()
    })
  })

  it('does not tell an owner about a decision on their own loan', async () => {
    const { firestore } = buildFirestore()

    await notifyLoanDecided(loanResult('approved'), parsedLoan(OWNER), ownerSentIt() as never, firestore)

    expect(mockNotifyOnce).not.toHaveBeenCalled()
  })

  it('stays quiet when the pool was never indexed', async () => {
    const { firestore } = buildFirestore(null)

    await notifyLoanDecided(loanResult('approved'), parsedLoan(), ownerSentIt() as never, firestore)

    expect(mockNotifyOnce).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Answers to the applicant.
// ---------------------------------------------------------------------------

describe('notifyMembershipDecided', () => {
  it('tells an applicant they are in', async () => {
    const { firestore } = buildFirestore()

    await notifyMembershipDecided(membershipResult('active'), parsedMembership(), firestore)

    expect(mockNotifyOnce).toHaveBeenCalledWith(
      `${CHAIN_ID}-${POOL_ID}-${ASKER}-membership_approved`,
      ASKER,
      expect.objectContaining({ title: 'Request approved' }),
      firestore
    )
  })

  it('tells an applicant they were turned down', async () => {
    const { firestore } = buildFirestore()

    await notifyMembershipDecided(membershipResult('rejected'), parsedMembership(), firestore)

    expect(mockNotifyOnce).toHaveBeenCalledWith(
      expect.any(String),
      ASKER,
      expect.objectContaining({ title: 'Request declined' }),
      firestore
    )
  })

  it.each(['requested', 'removed', 'left', null] as MembershipTransition[])('stays quiet on the %s transition', async (transition) => {
    // `removed` and `left` are deliberately not decisions on anything the
    // member asked for; `left` is self-authored besides.
    const { firestore } = buildFirestore()

    await notifyMembershipDecided(membershipResult(transition), parsedMembership(), firestore)

    expect(mockNotifyOnce).not.toHaveBeenCalled()
  })

  it('does not tell an owner they admitted themselves', async () => {
    const { firestore } = buildFirestore()

    await notifyMembershipDecided(membershipResult('active'), parsedMembership(OWNER), firestore)

    expect(mockNotifyOnce).not.toHaveBeenCalled()
  })

  it('stays quiet when the pool was never indexed', async () => {
    const { firestore } = buildFirestore(null)

    await notifyMembershipDecided(membershipResult('active'), parsedMembership(), firestore)

    expect(mockNotifyOnce).not.toHaveBeenCalled()
  })
})
