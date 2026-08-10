import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import React from 'react'
import type { Address } from 'viem'
import { mockRouterDismissTo } from '../../../src/__tests__/setup'
import { mockWagmiUseAccount, mockWagmiUseBalance } from '../../../src/__tests__/mocks'
import CreatePoolScreen from './create'

const WALLET_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const TX_HASH = '0xaaaa000000000000000000000000000000000000000000000000000000000001'
const LOCALHOST_CHAIN_ID = 31337

const mockCreatePool = jest.fn()
const mockWaitForTransaction = jest.fn()
const mockTriggerIndexing = jest.fn()
const mockReset = jest.fn()
let mockCreationError: string | null = null
let mockIsPreparing = false

jest.mock('../../../src/config/contracts', () => ({
  DEFAULT_CHAIN_ID: 31337,
  getPoolFactoryAddress: jest.fn((chainId: number) => (chainId === 31337 ? '0x5FbDB2315678afecb367f032d93F642f64180aa3' : undefined)),
}))

jest.mock('../../../src/hooks/pools/usePoolCreation', () => ({
  usePoolCreation: () => ({
    createPool: mockCreatePool,
    isPreparing: mockIsPreparing,
    isSubmitting: false,
    error: mockCreationError,
    reset: mockReset,
  }),
}))

jest.mock('../../../src/hooks/pools/useTransactionMonitoring', () => ({
  useTransactionMonitoring: () => ({ waitForTransaction: mockWaitForTransaction, isWaiting: false, error: null }),
}))

jest.mock('../../../src/hooks/pools/usePoolIndexing', () => ({
  usePoolIndexing: () => ({ triggerIndexing: mockTriggerIndexing, indexConfirmed: jest.fn(), isIndexing: false }),
}))

const { getPoolFactoryAddress } = jest.requireMock<{ getPoolFactoryAddress: jest.Mock }>('../../../src/config/contracts')

function fillValidForm() {
  fireEvent.changeText(screen.getByTestId('create-pool-name'), 'Neighbourhood Fund')
  fireEvent.changeText(screen.getByTestId('create-pool-description'), 'Micro-loans for the block')
  fireEvent.changeText(screen.getByTestId('create-pool-max-loan'), '100')
  fireEvent.changeText(screen.getByTestId('create-pool-interest-rate'), '5')
  fireEvent.changeText(screen.getByTestId('create-pool-loan-duration'), '30')
}

/** Fills the form and presses submit, flushing the async flow. */
async function submitForm() {
  fillValidForm()
  await act(async () => {
    fireEvent.press(screen.getByTestId('create-pool-submit'))
  })
}

describe('CreatePoolScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCreationError = null
    mockIsPreparing = false

    mockWagmiUseAccount.mockReturnValue({
      isConnected: true,
      isConnecting: false,
      address: WALLET_ADDRESS as Address,
      chainId: LOCALHOST_CHAIN_ID,
    })
    mockWagmiUseBalance.mockReturnValue({ data: { value: 1_000_000_000_000_000_000n } })
    getPoolFactoryAddress.mockImplementation((chainId: number) =>
      chainId === LOCALHOST_CHAIN_ID ? '0x5FbDB2315678afecb367f032d93F642f64180aa3' : undefined
    )

    mockCreatePool.mockResolvedValue(TX_HASH)
    mockWaitForTransaction.mockResolvedValue({ poolId: 7, poolAddress: '0x9fE4', txHash: TX_HASH })
    mockTriggerIndexing.mockResolvedValue(undefined)
  })

  it('shows the form on a supported network', () => {
    render(<CreatePoolScreen />)

    expect(screen.getByTestId('create-pool-screen')).toBeTruthy()
    expect(screen.getByTestId('create-pool-form')).toBeTruthy()
  })

  it('refuses a network SuperPool is not deployed on', () => {
    mockWagmiUseAccount.mockReturnValue({ isConnected: true, isConnecting: false, address: WALLET_ADDRESS as Address, chainId: 80002 })

    render(<CreatePoolScreen />)

    expect(screen.getByTestId('create-pool-unsupported-chain')).toBeTruthy()
    expect(screen.queryByTestId('create-pool-form')).toBeNull()
  })

  describe('pre-flight', () => {
    it('warns about an empty wallet without blocking creation', () => {
      mockWagmiUseBalance.mockReturnValue({ data: { value: 0n } })

      render(<CreatePoolScreen />)

      expect(screen.getByTestId('create-pool-no-funds')).toBeTruthy()
      expect(screen.getByTestId('create-pool-form')).toBeTruthy()
    })

    it('says nothing while the balance is unknown', () => {
      mockWagmiUseBalance.mockReturnValue({})

      render(<CreatePoolScreen />)

      expect(screen.queryByTestId('create-pool-no-funds')).toBeNull()
    })
  })

  describe('the full flow', () => {
    it('creates, confirms and indexes in order', async () => {
      render(<CreatePoolScreen />)

      await submitForm()

      expect(mockCreatePool).toHaveBeenCalledWith({
        name: 'Neighbourhood Fund',
        description: 'Micro-loans for the block',
        maxLoanAmount: 100_000_000_000_000_000_000n,
        interestRate: 500,
        loanDuration: 2_592_000,
      })
      expect(mockWaitForTransaction).toHaveBeenCalledWith(TX_HASH, 'CREATE_POOL')
      expect(mockTriggerIndexing).toHaveBeenCalledWith(TX_HASH, 'CREATE_POOL')

      expect(mockCreatePool.mock.invocationCallOrder[0]).toBeLessThan(mockWaitForTransaction.mock.invocationCallOrder[0])
      expect(mockWaitForTransaction.mock.invocationCallOrder[0]).toBeLessThan(mockTriggerIndexing.mock.invocationCallOrder[0])
    })

    it('reports the new pool once it is live', async () => {
      render(<CreatePoolScreen />)

      await submitForm()

      await waitFor(() => expect(screen.getByTestId('create-pool-success')).toBeTruthy())
      expect(screen.getByText('Pool #7 is ready for members to join.')).toBeTruthy()
    })

    it('goes to the pools list from the success screen', async () => {
      render(<CreatePoolScreen />)
      await submitForm()
      await waitFor(() => expect(screen.getByTestId('create-pool-success')).toBeTruthy())

      fireEvent.press(screen.getByTestId('create-pool-view-pools'))

      expect(mockRouterDismissTo).toHaveBeenCalledWith('/(auth)/(tabs)/pools')
    })

    it('still reports success when the pool id could not be read', async () => {
      mockWaitForTransaction.mockResolvedValue({ poolId: 0, poolAddress: '0x9fE4', txHash: TX_HASH })

      render(<CreatePoolScreen />)
      await submitForm()

      await waitFor(() => expect(screen.getByTestId('create-pool-success')).toBeTruthy())
    })
  })

  describe('progress', () => {
    it('shows nothing before the first submission', () => {
      render(<CreatePoolScreen />)

      expect(screen.queryByTestId('create-pool-status')).toBeNull()
    })

    it('asks the user to sign while the wallet is open', async () => {
      let releaseCreate: (hash: string) => void = () => {}
      mockCreatePool.mockReturnValue(new Promise((resolve) => (releaseCreate = resolve)))

      render(<CreatePoolScreen />)
      fillValidForm()
      fireEvent.press(screen.getByTestId('create-pool-submit'))

      await waitFor(() => expect(screen.getByTestId('create-pool-status')).toBeTruthy())
      expect(screen.getByText('Approve the transaction in your wallet')).toBeTruthy()

      await act(async () => {
        releaseCreate(TX_HASH)
      })
    })

    it('explains the whitelisting step while the backend is working', async () => {
      mockIsPreparing = true
      let releaseCreate: (hash: string) => void = () => {}
      mockCreatePool.mockReturnValue(new Promise((resolve) => (releaseCreate = resolve)))

      render(<CreatePoolScreen />)
      fillValidForm()
      fireEvent.press(screen.getByTestId('create-pool-submit'))

      await waitFor(() => expect(screen.getByText('Authorising your wallet to create pools')).toBeTruthy())

      await act(async () => {
        releaseCreate(TX_HASH)
      })
    })

    it('reports waiting on the network while confirming', async () => {
      let releaseWait: (result: { poolId: number; poolAddress: string; txHash: string }) => void = () => {}
      mockWaitForTransaction.mockReturnValue(new Promise((resolve) => (releaseWait = resolve)))

      render(<CreatePoolScreen />)
      fillValidForm()
      await act(async () => {
        fireEvent.press(screen.getByTestId('create-pool-submit'))
      })

      expect(screen.getByText('Waiting for the network to confirm')).toBeTruthy()

      await act(async () => {
        releaseWait({ poolId: 7, poolAddress: '0x9fE4', txHash: TX_HASH })
      })
    })
  })

  describe('failures', () => {
    it('returns to the form when the wallet rejects the transaction', async () => {
      mockCreatePool.mockRejectedValue(new Error('Transaction cancelled'))

      render(<CreatePoolScreen />)
      await submitForm()

      expect(screen.getByTestId('create-pool-error')).toHaveTextContent('Transaction cancelled')
      expect(screen.getByTestId('create-pool-form')).toBeTruthy()
      expect(mockWaitForTransaction).not.toHaveBeenCalled()
      expect(screen.queryByTestId('create-pool-status')).toBeNull()
    })

    it('returns to the form when confirmation fails, without indexing', async () => {
      mockWaitForTransaction.mockRejectedValue(new Error('Transaction was reverted'))

      render(<CreatePoolScreen />)
      await submitForm()

      expect(screen.getByTestId('create-pool-error')).toHaveTextContent('Transaction was reverted')
      expect(mockTriggerIndexing).not.toHaveBeenCalled()
      expect(screen.queryByTestId('create-pool-success')).toBeNull()
    })

    it('clears the previous failure when the form is resubmitted', async () => {
      mockCreatePool.mockRejectedValueOnce(new Error('Transaction cancelled'))

      render(<CreatePoolScreen />)
      await submitForm()
      expect(screen.getByTestId('create-pool-error')).toBeTruthy()

      await act(async () => {
        fireEvent.press(screen.getByTestId('create-pool-submit'))
      })

      await waitFor(() => expect(screen.getByTestId('create-pool-success')).toBeTruthy())
      expect(mockReset).toHaveBeenCalled()
    })

    it('succeeds even when indexing quietly fails', async () => {
      mockTriggerIndexing.mockResolvedValue(undefined)

      render(<CreatePoolScreen />)
      await submitForm()

      await waitFor(() => expect(screen.getByTestId('create-pool-success')).toBeTruthy())
    })
  })
})
