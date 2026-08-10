import React from 'react'
import { mockWagmiUseAccount } from '../../__tests__/mocks'
import { fireEvent, render } from '../../__tests__/test-utils'
import { type PendingTransaction, pendingTransactionsStore } from '../../stores/PendingTransactionsStore'
import { PendingTransactionBanner } from './PendingTransactionBanner'

const CHAIN_ID = 31337

const buildTransaction = (overrides: Partial<PendingTransaction> = {}): PendingTransaction => ({
  txHash: '0xabc',
  chainId: CHAIN_ID,
  type: 'CREATE_POOL',
  status: 'submitted',
  timestamp: Date.now(),
  params: {
    name: 'Weekend Circle',
    description: 'A pool for the weekend crew',
    maxLoanAmount: '1000000000000000000',
    interestRate: 500,
    loanDuration: 2_592_000,
  },
  ...overrides,
})

describe('PendingTransactionBanner', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    mockWagmiUseAccount.mockReturnValue({ isConnected: true, isConnecting: false, address: undefined, chainId: CHAIN_ID })
    await pendingTransactionsStore.reset()
  })

  it('renders nothing when there is nothing in flight', () => {
    const { queryByTestId } = render(<PendingTransactionBanner />)

    expect(queryByTestId('pending-transaction-banner')).toBeNull()
  })

  it('reports a transaction still being created', async () => {
    await pendingTransactionsStore.addPendingTransaction(buildTransaction())

    const { getByText } = render(<PendingTransactionBanner />)

    expect(getByText('1 pool being created')).toBeTruthy()
  })

  it('pluralises the count', async () => {
    await pendingTransactionsStore.addPendingTransaction(buildTransaction())
    await pendingTransactionsStore.addPendingTransaction(buildTransaction({ txHash: '0xdef' }))

    const { getByText } = render(<PendingTransactionBanner />)

    expect(getByText('2 pools being created')).toBeTruthy()
  })

  it('reports syncing once a transaction is confirmed', async () => {
    await pendingTransactionsStore.addPendingTransaction(buildTransaction({ status: 'confirmed' }))

    const { getByText } = render(<PendingTransactionBanner />)

    expect(getByText('1 pool syncing')).toBeTruthy()
  })

  it('gives a failure priority over work still in progress', async () => {
    await pendingTransactionsStore.addPendingTransaction(buildTransaction())
    await pendingTransactionsStore.addPendingTransaction(buildTransaction({ txHash: '0xdef', status: 'failed' }))

    const { getByText } = render(<PendingTransactionBanner />)

    expect(getByText('1 pool creation failed')).toBeTruthy()
  })

  it('ignores transactions from another chain', async () => {
    await pendingTransactionsStore.addPendingTransaction(buildTransaction({ chainId: 80002 }))

    const { queryByTestId } = render(<PendingTransactionBanner />)

    expect(queryByTestId('pending-transaction-banner')).toBeNull()
  })

  it('hands the newest matching transaction to the press handler', async () => {
    const onPress = jest.fn()
    await pendingTransactionsStore.addPendingTransaction(buildTransaction({ timestamp: 1_000 }))
    await pendingTransactionsStore.addPendingTransaction(buildTransaction({ txHash: '0xdef', timestamp: 2_000 }))

    const { getByTestId } = render(<PendingTransactionBanner onPress={onPress} />)

    fireEvent.press(getByTestId('pending-transaction-banner'))

    expect(onPress).toHaveBeenCalledWith(expect.objectContaining({ txHash: '0xdef' }))
  })

  it('hands over the failed transaction when reporting a failure', async () => {
    const onPress = jest.fn()
    // Newest overall is the submitted one, but the banner is reporting the failure.
    await pendingTransactionsStore.addPendingTransaction(buildTransaction({ txHash: '0xdef', status: 'failed', timestamp: 1_000 }))
    await pendingTransactionsStore.addPendingTransaction(buildTransaction({ timestamp: 2_000 }))

    const { getByTestId } = render(<PendingTransactionBanner onPress={onPress} />)

    fireEvent.press(getByTestId('pending-transaction-banner'))

    expect(onPress).toHaveBeenCalledWith(expect.objectContaining({ txHash: '0xdef', status: 'failed' }))
  })
})
