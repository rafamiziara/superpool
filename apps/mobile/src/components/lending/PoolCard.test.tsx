import type { LoanInfo, PoolInfo } from '@superpool/types'
import React from 'react'
import { render } from '../../__tests__/test-utils'
import { MOCK_USER_ADDRESS } from '../../mocks/lending'
import { authStore } from '../../stores/AuthStore'
import { poolStore } from '../../stores/PoolStore'
import { PoolCard } from './PoolCard'

const STRANGER = '0x0000000000000000000000000000000000000042'

function makePool(overrides: Partial<PoolInfo> = {}): PoolInfo {
  return {
    poolId: 11,
    poolAddress: '0x3b9Fab925D36946000F2636a49808cD5CF56F290',
    poolOwner: MOCK_USER_ADDRESS,
    name: 'Neighbourhood Circle',
    description: 'A pool that reviews loan requests',
    maxLoanAmount: '8000000000000000000',
    interestRate: 500,
    loanDuration: 2_592_000,
    chainId: 31337,
    createdBy: MOCK_USER_ADDRESS,
    createdAt: '2026-08-11T09:00:00.000Z',
    transactionHash: '0xaaa',
    isActive: true,
    ...overrides,
  }
}

function makeRequest(overrides: Partial<LoanInfo> = {}): LoanInfo {
  return {
    id: '31337-11-1',
    loanId: 1,
    poolId: 11,
    poolAddress: makePool().poolAddress,
    borrower: STRANGER,
    amount: '3000000000000000000',
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

afterEach(() => {
  poolStore.loanRecords = []
  authStore.walletAddress = null
})

describe('PoolCard', () => {
  it('names the pool and its terms', () => {
    const { getByText } = render(<PoolCard pool={makePool()} />)

    expect(getByText('Neighbourhood Circle')).toBeTruthy()
  })

  // -------------------------------------------------------------------------
  // Requests waiting on the owner.
  //
  // Owner-side work was invisible until you opened the pool, which is the wrong
  // way round: a request costs the borrower nothing and the owner everything to
  // miss.
  // -------------------------------------------------------------------------

  it('tells the owner when a request is waiting', () => {
    poolStore.loanRecords = [makeRequest()]

    const { getByTestId, getByText } = render(<PoolCard pool={makePool()} />)

    expect(getByTestId('pool-card-awaiting-11')).toBeTruthy()
    expect(getByText('1 loan request waiting on you')).toBeTruthy()
  })

  it('counts more than one', () => {
    poolStore.loanRecords = [makeRequest(), makeRequest({ id: '31337-11-2', loanId: 2 })]

    const { getByText } = render(<PoolCard pool={makePool()} />)

    expect(getByText('2 loan requests waiting on you')).toBeTruthy()
  })

  it('says nothing to a member who cannot act on them', () => {
    // Only the owner can approve, so only the owner is told.
    authStore.walletAddress = STRANGER
    poolStore.loanRecords = [makeRequest()]

    const { queryByTestId } = render(<PoolCard pool={makePool()} />)

    expect(queryByTestId('pool-card-awaiting-11')).toBeNull()
  })

  it('ignores requests belonging to another pool', () => {
    poolStore.loanRecords = [makeRequest({ id: '31337-12-1', poolId: 12 })]

    const { queryByTestId } = render(<PoolCard pool={makePool()} />)

    expect(queryByTestId('pool-card-awaiting-11')).toBeNull()
  })

  it('ignores loans that are already decided', () => {
    poolStore.loanRecords = [
      makeRequest({ id: '31337-11-3', loanId: 3, status: 'disbursed' }),
      makeRequest({ id: '31337-11-4', loanId: 4, status: 'rejected' }),
    ]

    const { queryByTestId } = render(<PoolCard pool={makePool()} />)

    expect(queryByTestId('pool-card-awaiting-11')).toBeNull()
  })

  it('stays quiet when nothing is waiting', () => {
    const { queryByTestId } = render(<PoolCard pool={makePool()} />)

    expect(queryByTestId('pool-card-awaiting-11')).toBeNull()
  })
})
