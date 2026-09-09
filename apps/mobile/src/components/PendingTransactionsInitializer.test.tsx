import { render, waitFor } from '@testing-library/react-native'
import {
  mockEstimateContractGas,
  mockGetTransactionReceipt,
  mockReadContract,
  mockWagmiUsePublicClient,
  mockWaitForTransactionReceipt,
} from '../__tests__/mocks'
import { pendingTransactionsStore } from '../stores/PendingTransactionsStore'
import { PendingTransactionsInitializer } from './PendingTransactionsInitializer'

/*
  The two actions are spied on where they live, rather than the store being
  replaced wholesale. That used to be impossible: MobX defined its actions as
  non-configurable, so `jest.spyOn` could not redefine them. Zustand keeps them
  as ordinary properties on a plain state object.
*/

describe('PendingTransactionsInitializer', () => {
  let warnSpy: jest.SpyInstance
  let loadFromStorage: jest.SpyInstance
  let checkPendingTransactions: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)

    loadFromStorage = jest.spyOn(pendingTransactionsStore.getState(), 'loadFromStorage').mockResolvedValue(undefined)
    checkPendingTransactions = jest.spyOn(pendingTransactionsStore.getState(), 'checkPendingTransactions').mockResolvedValue(undefined)

    mockWagmiUsePublicClient.mockReturnValue({
      chain: { id: 31337 },
      estimateContractGas: mockEstimateContractGas,
      waitForTransactionReceipt: mockWaitForTransactionReceipt,
      getTransactionReceipt: mockGetTransactionReceipt,
      readContract: mockReadContract,
    })
  })

  afterEach(() => {
    warnSpy.mockRestore()
    loadFromStorage.mockRestore()
    checkPendingTransactions.mockRestore()
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
