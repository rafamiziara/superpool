import { TransactionStatus, TransactionType } from '@superpool/types'
import React from 'react'
import { render } from '../../../../src/__tests__/test-utils'
import { poolStore } from '../../../../src/stores/PoolStore'
import ActivityScreen from './index'

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}))

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000)
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000)

describe('ActivityScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    await poolStore.fetchPools()
  })

  it('renders a row for every non-cancelled transaction', () => {
    const { getByTestId } = render(<ActivityScreen />)

    expect(getByTestId('activity-screen')).toBeTruthy()
    for (const tx of poolStore.recentTransactions) {
      expect(getByTestId(`activity-row-${tx.id}`)).toBeTruthy()
    }
  })

  it('omits cancelled transactions', () => {
    const [first] = poolStore.transactions
    poolStore.transactions = [{ ...first, id: 'tx-cancelled', status: TransactionStatus.CANCELLED }, ...poolStore.transactions]

    const { queryByTestId } = render(<ActivityScreen />)

    expect(queryByTestId('activity-row-tx-cancelled')).toBeNull()
  })

  it('groups transactions under relative day headings', () => {
    const base = {
      poolId: '1',
      from: poolStore.userAddress,
      type: TransactionType.CONTRIBUTION,
      amount: 1n,
      status: TransactionStatus.CONFIRMED,
    }
    poolStore.transactions = [
      { ...base, id: 'tx-today', createdAt: minutesAgo(10) },
      { ...base, id: 'tx-yesterday', createdAt: daysAgo(1) },
      { ...base, id: 'tx-this-week', createdAt: daysAgo(3) },
      { ...base, id: 'tx-earlier', createdAt: daysAgo(40) },
    ]

    const { getByText } = render(<ActivityScreen />)

    expect(getByText('Today')).toBeTruthy()
    expect(getByText('Yesterday')).toBeTruthy()
    expect(getByText('This week')).toBeTruthy()
    expect(getByText('Earlier')).toBeTruthy()
  })

  it('collects same-day transactions into one group', () => {
    const base = {
      poolId: '1',
      from: poolStore.userAddress,
      type: TransactionType.CONTRIBUTION,
      amount: 1n,
      status: TransactionStatus.CONFIRMED,
    }
    poolStore.transactions = [
      { ...base, id: 'tx-a', createdAt: minutesAgo(5) },
      { ...base, id: 'tx-b', createdAt: minutesAgo(30) },
    ]

    const { getAllByText, getByTestId } = render(<ActivityScreen />)

    expect(getAllByText('Today')).toHaveLength(1)
    expect(getByTestId('activity-row-tx-a')).toBeTruthy()
    expect(getByTestId('activity-row-tx-b')).toBeTruthy()
  })
})
