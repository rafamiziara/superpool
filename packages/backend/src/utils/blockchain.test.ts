/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect } from '@jest/globals'
import type { Provider } from 'ethers'
import { AppError } from './errorHandling'
import { ethersMock, mockEthersUtils } from '../__mocks__/blockchain/EthersMock'
import {
  estimateGas,
  executeTransaction,
  getGasPrice,
  getTransactionStatus,
  isTransactionMined,
  parseEventLogs,
  validateContractAddress,
  waitForConfirmation,
} from './blockchain'

describe('blockchain utilities', () => {
  let mockContract: any

  // Helper function to cast mock provider to proper ethers Provider type
  const getMockProvider = (): Provider => ethersMock.provider as any

  beforeEach(() => {
    // Reset centralized mocks for test isolation
    ethersMock.resetAllMocks()

    // Use centralized mock instances with specific test configurations
    mockContract = {
      target: '0x123456789',
      testFunction: jest.fn(),
      interface: {
        parseLog: jest.fn(),
      },
    } as any

    // Add estimateGas as a property of the function mock
    mockContract.testFunction.estimateGas = jest.fn()

    // Note: parseUnits mock is handled by the centralized EthersMock system
  })

  describe('estimateGas', () => {
    it('should estimate gas and add 20% buffer', async () => {
      const gasEstimate = BigInt('100000')
      const expectedWithBuffer = BigInt('120000') // 100000 * 120 / 100

      mockContract.testFunction.estimateGas.mockResolvedValue(gasEstimate)

      const result = await estimateGas(mockContract, 'testFunction', [])

      expect(result).toBe(expectedWithBuffer)
      expect(mockContract.testFunction.estimateGas).toHaveBeenCalledWith({})
      expect(mockContract.testFunction.estimateGas).toHaveBeenCalledTimes(1)
    })

    it('should pass arguments and overrides to contract function', async () => {
      const args = ['arg1', 'arg2']
      const overrides = { value: BigInt('1000') }
      mockContract.testFunction.estimateGas.mockResolvedValue(BigInt('100000'))

      await estimateGas(mockContract, 'testFunction', args, overrides)

      expect(mockContract.testFunction.estimateGas).toHaveBeenCalledWith('arg1', 'arg2', overrides)
      expect(mockContract.testFunction.estimateGas).toHaveBeenCalledTimes(1)
    })

    it('should throw AppError on estimation failure', async () => {
      const mockError = new Error('Gas estimation failed')
      mockContract.testFunction.estimateGas.mockRejectedValue(mockError)

      await expect(estimateGas(mockContract, 'testFunction', [])).rejects.toThrow(AppError)

      try {
        await estimateGas(mockContract, 'testFunction', [])
      } catch (error: any) {
        expect(error.code).toBe('GAS_ESTIMATION_FAILED')
      }

      expect(mockContract.testFunction.estimateGas).toHaveBeenCalledTimes(2)
    })
  })

  describe('executeTransaction', () => {
    it('should execute transaction with provided options', async () => {
      const mockTx = { hash: '0xabc123' }
      const options = { gasLimit: BigInt('200000'), gasPrice: BigInt('20000000000') }

      mockContract.testFunction.mockResolvedValue(mockTx)

      const result = await executeTransaction(mockContract, 'testFunction', ['arg1'], options)

      expect(result).toBe(mockTx)
      expect(mockContract.testFunction).toHaveBeenCalledWith('arg1', options)
      expect(mockContract.testFunction).toHaveBeenCalledTimes(1)
    })

    it('should handle insufficient funds error', async () => {
      const mockError = new Error('insufficient funds')
      mockContract.testFunction.mockRejectedValue(mockError)

      await expect(executeTransaction(mockContract, 'testFunction', [])).rejects.toThrow(AppError)

      try {
        await executeTransaction(mockContract, 'testFunction', [])
      } catch (error: any) {
        expect(error.code).toBe('INSUFFICIENT_FUNDS')
      }

      expect(mockContract.testFunction).toHaveBeenCalledTimes(2)
    })

    it('should handle nonce too low error', async () => {
      const mockError = new Error('nonce too low')
      mockContract.testFunction.mockRejectedValue(mockError)

      await expect(executeTransaction(mockContract, 'testFunction', [])).rejects.toThrow(AppError)

      try {
        await executeTransaction(mockContract, 'testFunction', [])
      } catch (error: any) {
        expect(error.code).toBe('NONCE_TOO_LOW')
      }

      expect(mockContract.testFunction).toHaveBeenCalledTimes(2)
    })

    it('should handle underpriced transaction error', async () => {
      const mockError = new Error('replacement transaction underpriced')
      mockContract.testFunction.mockRejectedValue(mockError)

      await expect(executeTransaction(mockContract, 'testFunction', [])).rejects.toThrow(AppError)

      try {
        await executeTransaction(mockContract, 'testFunction', [])
      } catch (error: any) {
        expect(error.code).toBe('UNDERPRICED_TRANSACTION')
      }

      expect(mockContract.testFunction).toHaveBeenCalledTimes(2)
    })

    it('should handle execution reverted error', async () => {
      const mockError = new Error('execution reverted')
      mockContract.testFunction.mockRejectedValue(mockError)

      await expect(executeTransaction(mockContract, 'testFunction', [])).rejects.toThrow(AppError)

      try {
        await executeTransaction(mockContract, 'testFunction', [])
      } catch (error: any) {
        expect(error.code).toBe('TRANSACTION_REVERTED')
      }

      expect(mockContract.testFunction).toHaveBeenCalledTimes(2)
    })

    it('should handle generic errors', async () => {
      const mockError = new Error('Unknown error')
      mockContract.testFunction.mockRejectedValue(mockError)

      await expect(executeTransaction(mockContract, 'testFunction', [])).rejects.toThrow(AppError)

      try {
        await executeTransaction(mockContract, 'testFunction', [])
      } catch (error: any) {
        expect(error.code).toBe('TRANSACTION_EXECUTION_FAILED')
      }

      expect(mockContract.testFunction).toHaveBeenCalledTimes(2)
    })
  })

  describe('waitForConfirmation', () => {
    it('should wait for transaction confirmation successfully', async () => {
      const mockReceipt = {
        transactionHash: '0xabc123',
        blockNumber: 12345,
        blockHash: '0xblock123',
        transactionIndex: 0,
        gasUsed: BigInt('150000'),
        effectiveGasPrice: BigInt('20000000000'),
        status: 1,
        logs: [],
      }

      ethersMock.provider.waitForTransaction.mockResolvedValue(mockReceipt as any)

      const result = await waitForConfirmation(getMockProvider(), '0xabc123', 1, 300000)

      expect(result).toBe(mockReceipt)
      expect(ethersMock.provider.waitForTransaction).toHaveBeenCalledWith('0xabc123', 1, 300000)
      expect(ethersMock.provider.waitForTransaction).toHaveBeenCalledTimes(1)
    })

    it('should throw error if receipt not found', async () => {
      ethersMock.provider.waitForTransaction.mockResolvedValue(null as any)

      await expect(waitForConfirmation(getMockProvider(), '0xabc123')).rejects.toThrow(AppError)

      try {
        await waitForConfirmation(getMockProvider(), '0xabc123')
      } catch (error: any) {
        expect(error.code).toBe('RECEIPT_NOT_FOUND')
      }

      expect(ethersMock.provider.waitForTransaction).toHaveBeenCalledTimes(2)
    })

    it('should throw error if transaction failed', async () => {
      const mockReceipt = {
        transactionHash: '0xabc123',
        blockNumber: 12345,
        blockHash: '0xblock123',
        transactionIndex: 0,
        gasUsed: BigInt('150000'),
        effectiveGasPrice: BigInt('20000000000'),
        status: 0,
        logs: [],
      }
      ethersMock.provider.waitForTransaction.mockResolvedValue(mockReceipt as any)

      await expect(waitForConfirmation(getMockProvider(), '0xabc123')).rejects.toThrow(AppError)

      try {
        await waitForConfirmation(getMockProvider(), '0xabc123')
      } catch (error: any) {
        expect(error.code).toBe('TRANSACTION_FAILED')
      }

      expect(ethersMock.provider.waitForTransaction).toHaveBeenCalledTimes(2)
    })

    it('should handle timeout errors', async () => {
      const mockError = new Error('Timeout')
      ethersMock.provider.waitForTransaction.mockRejectedValue(mockError)

      await expect(waitForConfirmation(getMockProvider(), '0xabc123')).rejects.toThrow(AppError)

      try {
        await waitForConfirmation(getMockProvider(), '0xabc123')
      } catch (error: any) {
        expect(error.code).toBe('CONFIRMATION_FAILED')
      }

      expect(ethersMock.provider.waitForTransaction).toHaveBeenCalledTimes(2)
    })
  })

  describe('getGasPrice', () => {
    it('should return EIP-1559 gas price when available', async () => {
      const mockFeeData = {
        maxFeePerGas: BigInt('30000000000'),
        maxPriorityFeePerGas: BigInt('2000000000'),
        gasPrice: BigInt('25000000000'),
      }

      ethersMock.provider.getFeeData.mockResolvedValue(mockFeeData)

      const result = await getGasPrice(getMockProvider())

      expect(result).toBe(mockFeeData.maxFeePerGas)
      expect(ethersMock.provider.getFeeData).toHaveBeenCalledTimes(1)
    })

    it('should fallback to legacy gas price when EIP-1559 not available', async () => {
      const mockFeeData = {
        maxFeePerGas: null,
        maxPriorityFeePerGas: null,
        gasPrice: BigInt('25000000000'),
      }

      ethersMock.provider.getFeeData.mockResolvedValue(mockFeeData as any)

      const result = await getGasPrice(getMockProvider())

      expect(result).toBe(mockFeeData.gasPrice)
      expect(ethersMock.provider.getFeeData).toHaveBeenCalledTimes(1)
    })

    it('should use default gas price when no data available', async () => {
      ethersMock.provider.getFeeData.mockResolvedValue({
        maxFeePerGas: null as any,
        maxPriorityFeePerGas: null as any,
        gasPrice: null as any,
      } as any)

      // The parseUnits mock is already handled by the centralized EthersMock
      const result = await getGasPrice(getMockProvider())

      // Verify the parseUnits mock was called correctly through centralized system
      expect(result).toBe(BigInt('20000000000'))
      expect(ethersMock.provider.getFeeData).toHaveBeenCalledTimes(1)
    })

    it('should handle getFeeData errors gracefully', async () => {
      ethersMock.provider.getFeeData.mockRejectedValue(new Error('Network error'))

      // The parseUnits fallback is handled by centralized EthersMock
      const result = await getGasPrice(getMockProvider())

      expect(result).toBe(BigInt('20000000000'))
      expect(ethersMock.provider.getFeeData).toHaveBeenCalledTimes(1)
    })
  })

  describe('isTransactionMined', () => {
    it('should return true when transaction is mined', async () => {
      const mockReceipt = {
        transactionHash: '0xabc123',
        blockNumber: 12345,
        blockHash: '0xblock123',
        transactionIndex: 0,
        gasUsed: BigInt('150000'),
        effectiveGasPrice: BigInt('20000000000'),
        status: 1,
        logs: [],
      }
      ethersMock.provider.getTransactionReceipt.mockResolvedValue(mockReceipt as any)

      const result = await isTransactionMined(getMockProvider(), '0xabc123')

      expect(result).toBe(true)
      expect(ethersMock.provider.getTransactionReceipt).toHaveBeenCalledWith('0xabc123')
      expect(ethersMock.provider.getTransactionReceipt).toHaveBeenCalledTimes(1)
    })

    it('should return false when transaction is not mined', async () => {
      ethersMock.provider.getTransactionReceipt.mockResolvedValue(null as any)

      const result = await isTransactionMined(getMockProvider(), '0xabc123')

      expect(result).toBe(false)
      expect(ethersMock.provider.getTransactionReceipt).toHaveBeenCalledWith('0xabc123')
      expect(ethersMock.provider.getTransactionReceipt).toHaveBeenCalledTimes(1)
    })

    it('should return false on error', async () => {
      const mockError = new Error('Network error')
      ethersMock.provider.getTransactionReceipt.mockRejectedValue(mockError)

      const result = await isTransactionMined(getMockProvider(), '0xabc123')

      expect(result).toBe(false)
      expect(ethersMock.provider.getTransactionReceipt).toHaveBeenCalledWith('0xabc123')
      expect(ethersMock.provider.getTransactionReceipt).toHaveBeenCalledTimes(1)
    })
  })

  describe('getTransactionStatus', () => {
    it('should return success for successful transactions', async () => {
      const mockReceipt = {
        transactionHash: '0xabc123',
        blockNumber: 12345,
        blockHash: '0xblock123',
        transactionIndex: 0,
        gasUsed: BigInt('150000'),
        effectiveGasPrice: BigInt('20000000000'),
        status: 1,
        logs: [],
      }
      ethersMock.provider.getTransactionReceipt.mockResolvedValue(mockReceipt as any)

      const result = await getTransactionStatus(getMockProvider(), '0xabc123')

      expect(result).toBe('success')
      expect(ethersMock.provider.getTransactionReceipt).toHaveBeenCalledWith('0xabc123')
      expect(ethersMock.provider.getTransactionReceipt).toHaveBeenCalledTimes(1)
    })

    it('should return failed for failed transactions', async () => {
      const mockReceipt = {
        transactionHash: '0xabc123',
        blockNumber: 12345,
        blockHash: '0xblock123',
        transactionIndex: 0,
        gasUsed: BigInt('150000'),
        effectiveGasPrice: BigInt('20000000000'),
        status: 0,
        logs: [],
      }
      ethersMock.provider.getTransactionReceipt.mockResolvedValue(mockReceipt as any)

      const result = await getTransactionStatus(getMockProvider(), '0xabc123')

      expect(result).toBe('failed')
      expect(ethersMock.provider.getTransactionReceipt).toHaveBeenCalledWith('0xabc123')
      expect(ethersMock.provider.getTransactionReceipt).toHaveBeenCalledTimes(1)
    })

    it('should return pending for unmined transactions', async () => {
      ethersMock.provider.getTransactionReceipt.mockResolvedValue(null as any)

      const result = await getTransactionStatus(getMockProvider(), '0xabc123')

      expect(result).toBe('pending')
      expect(ethersMock.provider.getTransactionReceipt).toHaveBeenCalledWith('0xabc123')
      expect(ethersMock.provider.getTransactionReceipt).toHaveBeenCalledTimes(1)
    })

    it('should return not_found on error', async () => {
      const mockError = new Error('Network error')
      ethersMock.provider.getTransactionReceipt.mockRejectedValue(mockError)

      const result = await getTransactionStatus(getMockProvider(), '0xabc123')

      expect(result).toBe('not_found')
      expect(ethersMock.provider.getTransactionReceipt).toHaveBeenCalledWith('0xabc123')
      expect(ethersMock.provider.getTransactionReceipt).toHaveBeenCalledTimes(1)
    })
  })

  describe('parseEventLogs', () => {
    it('should parse matching event logs', () => {
      const mockLogs = [{ topics: ['0xevent1'] }, { topics: ['0xevent2'] }, { topics: ['0xevent3'] }]

      const mockParsedEvent = {
        name: 'TargetEvent',
        args: { param1: 'value1' },
      }

      mockContract.interface.parseLog
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(mockParsedEvent)
        .mockReturnValueOnce({ name: 'DifferentEvent' })

      const result = parseEventLogs(mockContract, mockLogs as any, 'TargetEvent')

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(mockParsedEvent)
      expect(mockContract.interface.parseLog).toHaveBeenCalledTimes(3)
    })

    it('should handle parsing errors gracefully', () => {
      const mockLogs = [{ topics: ['0xevent1'] }]
      const mockError = new Error('Parse error')

      mockContract.interface.parseLog.mockImplementation(() => {
        throw mockError
      })

      const result = parseEventLogs(mockContract, mockLogs as any, 'TargetEvent')

      expect(result).toHaveLength(0)
      expect(mockContract.interface.parseLog).toHaveBeenCalledTimes(1)
    })

    it('should return empty array for no matching events', () => {
      const mockLogs = [{ topics: ['0xevent1'] }]

      mockContract.interface.parseLog.mockReturnValue({
        name: 'DifferentEvent',
      })

      const result = parseEventLogs(mockContract, mockLogs as any, 'TargetEvent')

      expect(result).toHaveLength(0)
      expect(mockContract.interface.parseLog).toHaveBeenCalledTimes(1)
    })
  })

  describe('validateContractAddress', () => {
    it('should return true for valid contract address', async () => {
      // Mock both isAddress and getCode for successful validation
      const mockProvider = getMockProvider()

      // The getCode mock should return contract bytecode for valid contract addresses
      ;(mockProvider.getCode as jest.MockedFunction<typeof mockProvider.getCode>).mockResolvedValue(
        '0x608060405234801561001057600080fd5b50...'
      )

      const result = await validateContractAddress(mockProvider, '0x1234567890123456789012345678901234567890')

      expect(result).toBe(true)
      expect(mockProvider.getCode).toHaveBeenCalledWith('0x1234567890123456789012345678901234567890')
    })

    it('should return false for invalid address format', async () => {
      // Mock isAddress to return false for invalid addresses
      mockEthersUtils.isAddress.mockReturnValueOnce(false)

      const result = await validateContractAddress(getMockProvider(), 'invalid-address')

      expect(result).toBe(false)
      // getCode should not be called for invalid address format
      expect(getMockProvider().getCode).not.toHaveBeenCalled()
    })

    it('should return false for EOA (no contract code)', async () => {
      // Mock valid address but no contract code
      const mockProvider = getMockProvider()
      ;(mockProvider.getCode as jest.MockedFunction<typeof mockProvider.getCode>).mockResolvedValue('0x')

      const result = await validateContractAddress(mockProvider, '0x1234567890123456789012345678901234567890')

      expect(result).toBe(false)
      expect(mockProvider.getCode).toHaveBeenCalledWith('0x1234567890123456789012345678901234567890')
    })

    it('should return false on network error', async () => {
      // Mock network error
      const mockProvider = getMockProvider()
      ;(mockProvider.getCode as jest.MockedFunction<typeof mockProvider.getCode>).mockRejectedValue(new Error('Network error'))

      const result = await validateContractAddress(mockProvider, '0x1234567890123456789012345678901234567890')

      expect(result).toBe(false)
      expect(mockProvider.getCode).toHaveBeenCalledWith('0x1234567890123456789012345678901234567890')
    })
  })
})
