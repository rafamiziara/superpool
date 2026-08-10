import { render, waitFor } from '@testing-library/react-native'
import React from 'react'
import {
  mockEstimateContractGas,
  mockGetTransactionReceipt,
  mockWagmiUsePublicClient,
  mockWaitForTransactionReceipt,
} from '../__tests__/mocks'
import { pendingTransactionsStore } from '../stores/PendingTransactionsStore'
import { PendingTransactionsInitializer } from './PendingTransactionsInitializer'

// The store is replaced wholesale rather than spied on: MobX defines its actions
// as non-configurable, so `jest.spyOn` cannot redefine them.
jest.mock('../stores/PendingTransactionsStore', () => ({
  pendingTransactionsStore: {
    loadFromStorage: jest.fn(),
    checkPendingTransactions: jest.fn(),
  },
}))

const loadFromStorage = jest.mocked(pendingTransactionsStore.loadFromStorage)
const checkPendingTransactions = jest.mocked(pendingTransactionsStore.checkPendingTransactions)

describe('PendingTransactionsInitializer', () => {
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)

    loadFromStorage.mockResolvedValue(undefined)
    checkPendingTransactions.mockResolvedValue(undefined)

    mockWagmiUsePublicClient.mockReturnValue({
      chain: { id: 31337 },
      estimateContractGas: mockEstimateContractGas,
      waitForTransactionReceipt: mockWaitForTransactionReceipt,
      getTransactionReceipt: mockGetTransactionReceipt,
    })
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('restores storage, then resolves what the chain has decided', async () => {
    render(<PendingTransactionsInitializer />)

    await waitFor(() => expect(checkPendingTransactions).toHaveBeenCalled())

    expect(loadFromStorage).toHaveBeenCalledTimes(1)
    expect(loadFromStorage.mock.invocationCallOrder[0]).toBeLessThan(checkPendingTransactions.mock.invocationCallOrder[0])
  })

  it('renders nothing', () => {
    const { toJSON } = render(<PendingTransactionsInitializer />)

    expect(toJSON()).toBeNull()
  })

  it('still restores storage when no client is available', async () => {
    mockWagmiUsePublicClient.mockReturnValue(undefined)

    render(<PendingTransactionsInitializer />)

    await waitFor(() => expect(loadFromStorage).toHaveBeenCalled())
    expect(checkPendingTransactions).not.toHaveBeenCalled()
  })

  it('survives a recovery failure instead of taking down the app', async () => {
    loadFromStorage.mockRejectedValue(new Error('storage exploded'))

    render(<PendingTransactionsInitializer />)

    await waitFor(() => expect(warnSpy).toHaveBeenCalledWith('Failed to recover pending transactions:', expect.any(Error)))
    expect(checkPendingTransactions).not.toHaveBeenCalled()
  })

  it('does not check after unmounting mid-restore', async () => {
    let releaseLoad = () => {}
    loadFromStorage.mockReturnValue(
      new Promise<void>((resolve) => {
        releaseLoad = resolve
      })
    )

    const { unmount } = render(<PendingTransactionsInitializer />)
    unmount()
    releaseLoad()

    await waitFor(() => expect(loadFromStorage).toHaveBeenCalled())
    expect(checkPendingTransactions).not.toHaveBeenCalled()
  })
})
