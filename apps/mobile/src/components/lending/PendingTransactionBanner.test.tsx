import React from 'react'
import { LOCALHOST_CHAIN_ID, makePendingTransaction, OTHER_TX_HASH } from '../../__tests__/fixtures/pendingTransaction'
import { mockWagmiUseAccount } from '../../__tests__/mocks'
import { fireEvent, render } from '../../__tests__/test-utils'
import { pendingTransactionsStore } from '../../stores/PendingTransactionsStore'
import { PendingTransactionBanner } from './PendingTransactionBanner'

describe('PendingTransactionBanner', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    mockWagmiUseAccount.mockReturnValue({ isConnected: true, isConnecting: false, address: undefined, chainId: LOCALHOST_CHAIN_ID })
    await pendingTransactionsStore.reset()
  })

  it('renders nothing when there is nothing in flight', () => {
    const { queryByTestId } = render(<PendingTransactionBanner />)

    expect(queryByTestId('pending-transaction-banner')).toBeNull()
  })

  it('reports a transaction still being created', async () => {
    await pendingTransactionsStore.addPendingTransaction(makePendingTransaction())

    const { getByText } = render(<PendingTransactionBanner />)

    expect(getByText('1 pool being created')).toBeTruthy()
  })

  it('pluralises the count', async () => {
    await pendingTransactionsStore.addPendingTransaction(makePendingTransaction())
    await pendingTransactionsStore.addPendingTransaction(makePendingTransaction({ txHash: OTHER_TX_HASH }))

    const { getByText } = render(<PendingTransactionBanner />)

    expect(getByText('2 pools being created')).toBeTruthy()
  })

  it('reports syncing once a transaction is confirmed', async () => {
    await pendingTransactionsStore.addPendingTransaction(makePendingTransaction({ status: 'confirmed' }))

    const { getByText } = render(<PendingTransactionBanner />)

    expect(getByText('1 pool syncing')).toBeTruthy()
  })

  it('gives a failure priority over work still in progress', async () => {
    await pendingTransactionsStore.addPendingTransaction(makePendingTransaction())
    await pendingTransactionsStore.addPendingTransaction(makePendingTransaction({ txHash: OTHER_TX_HASH, status: 'failed' }))

    const { getByText } = render(<PendingTransactionBanner />)

    expect(getByText('1 pool creation failed')).toBeTruthy()
  })

  it('ignores transactions from another chain', async () => {
    await pendingTransactionsStore.addPendingTransaction(makePendingTransaction({ chainId: 80002 }))

    const { queryByTestId } = render(<PendingTransactionBanner />)

    expect(queryByTestId('pending-transaction-banner')).toBeNull()
  })

  it('hands the newest matching transaction to the press handler', async () => {
    const onPress = jest.fn()
    await pendingTransactionsStore.addPendingTransaction(makePendingTransaction({ timestamp: 1_000 }))
    await pendingTransactionsStore.addPendingTransaction(makePendingTransaction({ txHash: OTHER_TX_HASH, timestamp: 2_000 }))

    const { getByTestId } = render(<PendingTransactionBanner onPress={onPress} />)

    fireEvent.press(getByTestId('pending-transaction-banner'))

    expect(onPress).toHaveBeenCalledWith(expect.objectContaining({ txHash: OTHER_TX_HASH }))
  })

  it('hands over the failed transaction when reporting a failure', async () => {
    const onPress = jest.fn()
    // Newest overall is the submitted one, but the banner is reporting the failure.
    await pendingTransactionsStore.addPendingTransaction(
      makePendingTransaction({ txHash: OTHER_TX_HASH, status: 'failed', timestamp: 1_000 })
    )
    await pendingTransactionsStore.addPendingTransaction(makePendingTransaction({ timestamp: 2_000 }))

    const { getByTestId } = render(<PendingTransactionBanner onPress={onPress} />)

    fireEvent.press(getByTestId('pending-transaction-banner'))

    expect(onPress).toHaveBeenCalledWith(expect.objectContaining({ txHash: OTHER_TX_HASH, status: 'failed' }))
  })
})
