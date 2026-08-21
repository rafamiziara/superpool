import type { LoanInfo } from '@superpool/types'
import { QUEUE_ORDERS, sortLoanQueue } from './loanQueue'

function makeRequest(overrides: Partial<LoanInfo> = {}): LoanInfo {
  return {
    id: '31337-1-1',
    loanId: 1,
    poolId: 1,
    poolAddress: '0x3b9Fab925D36946000F2636a49808cD5CF56F290',
    borrower: '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc',
    amount: '1000000000000000000',
    interestRate: 450,
    duration: 2_592_000,
    startedAt: '2026-08-10T09:00:00.000Z',
    isRepaid: false,
    amountRepaid: '0',
    principalOutstanding: '1000000000000000000',
    interestOutstanding: '0',
    status: 'requested',
    chainId: 31337,
    transactionHash: '0xaaa',
    blockNumber: 100,
    ...overrides,
  }
}

const oldest = makeRequest({ id: 'a', loanId: 1, amount: '2000000000000000000', startedAt: '2026-08-01T09:00:00.000Z' })
const middle = makeRequest({ id: 'b', loanId: 2, amount: '9000000000000000000', startedAt: '2026-08-05T09:00:00.000Z' })
const newest = makeRequest({ id: 'c', loanId: 3, amount: '500000000000000000', startedAt: '2026-08-09T09:00:00.000Z' })

describe('sortLoanQueue', () => {
  it('should answer the longest wait first', () => {
    // Arrange & Act
    const result = sortLoanQueue([newest, oldest, middle], 'waiting')

    // Assert — the default, and the reason it is the default: a queue served
    // newest-first leaves whoever asked earliest waiting indefinitely.
    expect(result.map((request) => request.id)).toEqual(['a', 'b', 'c'])
  })

  it('should order by amount, largest first', () => {
    // Act
    const result = sortLoanQueue([newest, oldest, middle], 'largest')

    // Assert
    expect(result.map((request) => request.id)).toEqual(['b', 'a', 'c'])
  })

  it('should order by amount, smallest first', () => {
    // Act
    const result = sortLoanQueue([newest, oldest, middle], 'smallest')

    // Assert
    expect(result.map((request) => request.id)).toEqual(['c', 'a', 'b'])
  })

  it('should compare amounts as bigints, not as numbers', () => {
    // Arrange — two amounts that differ only past the 17th digit. As numbers
    // both round to the same float and the comparison returns 0, so a queue of
    // ordinary wei figures would be ordered by rounding error.
    const smaller = makeRequest({ id: 'small', amount: '1000000000000000001' })
    const larger = makeRequest({ id: 'large', amount: '1000000000000000002' })

    // Act
    const result = sortLoanQueue([smaller, larger], 'largest')

    // Assert
    expect(Number(smaller.amount) === Number(larger.amount)).toBe(true)
    expect(result.map((request) => request.id)).toEqual(['large', 'small'])
  })

  it('should break a tie on amount by how long the request has waited', () => {
    // Arrange
    const early = makeRequest({ id: 'early', amount: '5', startedAt: '2026-08-01T09:00:00.000Z' })
    const late = makeRequest({ id: 'late', amount: '5', startedAt: '2026-08-08T09:00:00.000Z' })

    // Act
    const result = sortLoanQueue([late, early], 'largest')

    // Assert
    expect(result.map((request) => request.id)).toEqual(['early', 'late'])
  })

  it('should not reorder the array it was given', () => {
    // Arrange — the store's list is observable, and sorting it in place would
    // change what every other screen reads.
    const requests = [newest, oldest, middle]

    // Act
    sortLoanQueue(requests, 'waiting')

    // Assert
    expect(requests.map((request) => request.id)).toEqual(['c', 'a', 'b'])
  })

  it('should handle an empty queue', () => {
    // Act & Assert
    expect(sortLoanQueue([], 'waiting')).toEqual([])
  })
})

describe('QUEUE_ORDERS', () => {
  it('should offer only orders that are facts about the request', () => {
    // Assert — nothing here ranks borrowers. An order by assessment band or by
    // borrowing history is a score with the arithmetic hidden, and this
    // project refused to build a score.
    expect(QUEUE_ORDERS).toEqual(['waiting', 'largest', 'smallest'])
  })
})
