import { expect } from '@jest/globals'
import { ethers } from 'ethers'
import { AppError } from './errorHandling'
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

// Mock ethers
jest.mock('ethers')
jest.mock('firebase-functions', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}))

describe('blockchain utilities', () => {
  let mockContract: any
  let mockProvider: any

  beforeEach(() => {
    jest.clearAllMocks()

    mockContract = {
      target: '0x123456789',
      testFunction: {
        estimateGas: jest.fn(),
      },
      interface: {
        parseLog: jest.fn(),
      },
    }

    mockProvider = {
      waitForTransaction: jest.fn(),
      getFeeData: jest.fn(),
      getTransactionReceipt: jest.fn(),
      getCode: jest.fn(),
    }
  })

  describe('estimateGas', () => {
    it('should estimate gas and add 20% buffer', async () => {
      const gasEstimate = BigInt('100000')
      const expectedWithBuffer = BigInt('120000') // 100000 * 120 / 100

      mockContract.testFunction.estimateGas.mockResolvedValue(gasEstimate)

      const result = await estimateGas(mockContract, 'testFunction', [])

      expect(result).toBe(expectedWithBuffer)
      expect(mockContract.testFunction.estimateGas).toHaveBeenCalledWith({})
    })

    it('should pass arguments and overrides to contract function', async () => {
      const args = ['arg1', 'arg2']
      const overrides = { value: BigInt('1000') }
      mockContract.testFunction.estimateGas.mockResolvedValue(BigInt('100000'))

      await estimateGas(mockContract, 'testFunction', args, overrides)

      expect(mockContract.testFunction.estimateGas).toHaveBeenCalledWith('arg1', 'arg2', overrides)
    })

    it('should throw AppError on estimation failure', async () => {
      mockContract.testFunction.estimateGas.mockRejectedValue(new Error('Gas estimation failed'))

      await expect(estimateGas(mockContract, 'testFunction', [])).rejects.toThrow(AppError)
      await expect(estimateGas(mockContract, 'testFunction', [])).rejects.toThrow('GAS_ESTIMATION_FAILED')
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
    })

    it('should handle insufficient funds error', async () => {
      mockContract.testFunction.mockRejectedValue(new Error('insufficient funds'))

      await expect(executeTransaction(mockContract, 'testFunction', [])).rejects.toThrow(AppError)
      await expect(executeTransaction(mockContract, 'testFunction', [])).rejects.toThrow('INSUFFICIENT_FUNDS')
    })

    it('should handle nonce too low error', async () => {
      mockContract.testFunction.mockRejectedValue(new Error('nonce too low'))

      await expect(executeTransaction(mockContract, 'testFunction', [])).rejects.toThrow(AppError)
      await expect(executeTransaction(mockContract, 'testFunction', [])).rejects.toThrow('NONCE_TOO_LOW')
    })

    it('should handle underpriced transaction error', async () => {
      mockContract.testFunction.mockRejectedValue(new Error('replacement transaction underpriced'))

      await expect(executeTransaction(mockContract, 'testFunction', [])).rejects.toThrow(AppError)
      await expect(executeTransaction(mockContract, 'testFunction', [])).rejects.toThrow('UNDERPRICED_TRANSACTION')
    })

    it('should handle execution reverted error', async () => {
      mockContract.testFunction.mockRejectedValue(new Error('execution reverted'))

      await expect(executeTransaction(mockContract, 'testFunction', [])).rejects.toThrow(AppError)
      await expect(executeTransaction(mockContract, 'testFunction', [])).rejects.toThrow('TRANSACTION_REVERTED')
    })

    it('should handle generic errors', async () => {
      mockContract.testFunction.mockRejectedValue(new Error('Unknown error'))

      await expect(executeTransaction(mockContract, 'testFunction', [])).rejects.toThrow(AppError)
      await expect(executeTransaction(mockContract, 'testFunction', [])).rejects.toThrow('TRANSACTION_EXECUTION_FAILED')
    })
  })

  describe('waitForConfirmation', () => {
    it('should wait for transaction confirmation successfully', async () => {
      const mockReceipt = {
        status: 1,
        blockNumber: 12345,
        gasUsed: BigInt('150000'),
      }

      mockProvider.waitForTransaction.mockResolvedValue(mockReceipt)

      const result = await waitForConfirmation(mockProvider, '0xabc123', 1, 300000)

      expect(result).toBe(mockReceipt)
      expect(mockProvider.waitForTransaction).toHaveBeenCalledWith('0xabc123', 1, 300000)
    })

    it('should throw error if receipt not found', async () => {
      mockProvider.waitForTransaction.mockResolvedValue(null)

      await expect(waitForConfirmation(mockProvider, '0xabc123')).rejects.toThrow(AppError)
      await expect(waitForConfirmation(mockProvider, '0xabc123')).rejects.toThrow('RECEIPT_NOT_FOUND')
    })

    it('should throw error if transaction failed', async () => {
      const mockReceipt = { status: 0 }
      mockProvider.waitForTransaction.mockResolvedValue(mockReceipt)

      await expect(waitForConfirmation(mockProvider, '0xabc123')).rejects.toThrow(AppError)
      await expect(waitForConfirmation(mockProvider, '0xabc123')).rejects.toThrow('TRANSACTION_FAILED')
    })

    it('should handle timeout errors', async () => {
      mockProvider.waitForTransaction.mockRejectedValue(new Error('Timeout'))

      await expect(waitForConfirmation(mockProvider, '0xabc123')).rejects.toThrow(AppError)
      await expect(waitForConfirmation(mockProvider, '0xabc123')).rejects.toThrow('CONFIRMATION_FAILED')
    })
  })

  describe('getGasPrice', () => {
    it('should return EIP-1559 gas price when available', async () => {
      const mockFeeData = {
        maxFeePerGas: BigInt('30000000000'),
        maxPriorityFeePerGas: BigInt('2000000000'),
        gasPrice: BigInt('25000000000'),
      }

      mockProvider.getFeeData.mockResolvedValue(mockFeeData)

      const result = await getGasPrice(mockProvider)

      expect(result).toBe(mockFeeData.maxFeePerGas)
    })

    it('should fallback to legacy gas price when EIP-1559 not available', async () => {
      const mockFeeData = {
        maxFeePerGas: null,
        maxPriorityFeePerGas: null,
        gasPrice: BigInt('25000000000'),
      }

      mockProvider.getFeeData.mockResolvedValue(mockFeeData)

      const result = await getGasPrice(mockProvider)

      expect(result).toBe(mockFeeData.gasPrice)
    })

    it('should use default gas price when no data available', async () => {
      mockProvider.getFeeData.mockResolvedValue({
        maxFeePerGas: null,
        maxPriorityFeePerGas: null,
        gasPrice: null,
      })

      // Mock ethers.parseUnits
      const mockParseUnits = jest.fn().mockReturnValue(BigInt('20000000000'))
      ;(ethers as any).parseUnits = mockParseUnits

      const result = await getGasPrice(mockProvider)

      expect(mockParseUnits).toHaveBeenCalledWith('20', 'gwei')
      expect(result).toBe(BigInt('20000000000'))
    })

    it('should handle getFeeData errors gracefully', async () => {
      mockProvider.getFeeData.mockRejectedValue(new Error('Network error'))

      const mockParseUnits = jest.fn().mockReturnValue(BigInt('20000000000'))
      ;(ethers as any).parseUnits = mockParseUnits

      const result = await getGasPrice(mockProvider)

      expect(result).toBe(BigInt('20000000000'))
    })
  })

  describe('isTransactionMined', () => {
    it('should return true when transaction is mined', async () => {
      const mockReceipt = { status: 1 }
      mockProvider.getTransactionReceipt.mockResolvedValue(mockReceipt)

      const result = await isTransactionMined(mockProvider, '0xabc123')

      expect(result).toBe(true)
    })

    it('should return false when transaction is not mined', async () => {
      mockProvider.getTransactionReceipt.mockResolvedValue(null)

      const result = await isTransactionMined(mockProvider, '0xabc123')

      expect(result).toBe(false)
    })

    it('should return false on error', async () => {
      mockProvider.getTransactionReceipt.mockRejectedValue(new Error('Network error'))

      const result = await isTransactionMined(mockProvider, '0xabc123')

      expect(result).toBe(false)
    })
  })

  describe('getTransactionStatus', () => {
    it('should return success for successful transactions', async () => {
      const mockReceipt = { status: 1 }
      mockProvider.getTransactionReceipt.mockResolvedValue(mockReceipt)

      const result = await getTransactionStatus(mockProvider, '0xabc123')

      expect(result).toBe('success')
    })

    it('should return failed for failed transactions', async () => {
      const mockReceipt = { status: 0 }
      mockProvider.getTransactionReceipt.mockResolvedValue(mockReceipt)

      const result = await getTransactionStatus(mockProvider, '0xabc123')

      expect(result).toBe('failed')
    })

    it('should return pending for unmined transactions', async () => {
      mockProvider.getTransactionReceipt.mockResolvedValue(null)

      const result = await getTransactionStatus(mockProvider, '0xabc123')

      expect(result).toBe('pending')
    })

    it('should return not_found on error', async () => {
      mockProvider.getTransactionReceipt.mockRejectedValue(new Error('Network error'))

      const result = await getTransactionStatus(mockProvider, '0xabc123')

      expect(result).toBe('not_found')
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
    })

    it('should handle parsing errors gracefully', () => {
      const mockLogs = [{ topics: ['0xevent1'] }]

      mockContract.interface.parseLog.mockImplementation(() => {
        throw new Error('Parse error')
      })

      const result = parseEventLogs(mockContract, mockLogs as any, 'TargetEvent')

      expect(result).toHaveLength(0)
    })

    it('should return empty array for no matching events', () => {
      const mockLogs = [{ topics: ['0xevent1'] }]

      mockContract.interface.parseLog.mockReturnValue({
        name: 'DifferentEvent',
      })

      const result = parseEventLogs(mockContract, mockLogs as any, 'TargetEvent')

      expect(result).toHaveLength(0)
    })
  })

  describe('validateContractAddress', () => {
    beforeEach(() => {
      // Mock ethers.isAddress
      ;(ethers as any).isAddress = jest.fn()
    })

    it('should return true for valid contract address', async () => {
      ;(ethers as any).isAddress.mockReturnValue(true)
      mockProvider.getCode.mockResolvedValue('0x608060405234801561001057600080fd5b50...')

      const result = await validateContractAddress(mockProvider, '0x123456')

      expect(result).toBe(true)
    })

    it('should return false for invalid address format', async () => {
      ;(ethers as any).isAddress.mockReturnValue(false)

      const result = await validateContractAddress(mockProvider, 'invalid-address')

      expect(result).toBe(false)
      expect(mockProvider.getCode).not.toHaveBeenCalled()
    })

    it('should return false for EOA (no contract code)', async () => {
      ;(ethers as any).isAddress.mockReturnValue(true)
      mockProvider.getCode.mockResolvedValue('0x')

      const result = await validateContractAddress(mockProvider, '0x123456')

      expect(result).toBe(false)
    })

    it('should return false on network error', async () => {
      ;(ethers as any).isAddress.mockReturnValue(true)
      mockProvider.getCode.mockRejectedValue(new Error('Network error'))

      const result = await validateContractAddress(mockProvider, '0x123456')

      expect(result).toBe(false)
    })
  })
})
