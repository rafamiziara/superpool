import { BatchTransactionRequest, ContractCall, ContractService, ContractServiceConfig, TransactionProposal } from './ContractService'
import { AppError } from '../utils/errorHandling'
import { jest } from '@jest/globals'

// Import centralized mock system (MOCK_SYSTEM.md compliant)
import { 
  FunctionsMock, 
  firebaseAdminMock, 
  ethersMock,
  ContractMock,
  MockFactory 
} from '../__mocks__'

// Mock dependencies using centralized system
jest.mock('firebase-functions')
jest.mock('../utils/multisig')
jest.mock('../utils/blockchain')

describe('ContractService', () => {
  let contractService: ContractService
  let mockConfig: ContractServiceConfig
  let mockProvider: any
  let mockSigner: any
  let mockSafeContract: any
  let mockDb: any

  beforeEach(() => {
    // ✅ MOCK_SYSTEM.md Requirement: Use centralized mock resets
    firebaseAdminMock.resetAllMocks()
    ethersMock.resetAllMocks()
    MockFactory.resetAllMocks()
    jest.clearAllMocks()

    // Mock configuration
    mockConfig = {
      chainId: 80002,
      rpcUrl: 'https://rpc-amoy.polygon.technology',
      safeAddress: '0x123456789abcdef',
      privateKey: '0xprivatekey123',
      poolFactoryAddress: '0x987654321fedcba',
    }

    // Use centralized ethers mock system
    mockProvider = ethersMock.provider
    mockSigner = ethersMock.wallet
    
    // Setup Safe contract mock using centralized system
    mockSafeContract = ContractMock.createSafeMock()

    // Use centralized Firestore mock system
    mockDb = firebaseAdminMock.firestore

    // Ethers mocks are handled by centralized ethersMock system
    // Setup specific ethers functions used by ContractService
    ethers.toBeHex = jest.fn<(value: any) => string>().mockImplementation((value: any) => {
      if (value === undefined || value === null) return '0x0'
      if (typeof value === 'string') return value.startsWith('0x') ? value : `0x${value}`
      return `0x${value.toString(16)}`
    })
    ethers.zeroPadValue = jest.fn<(value: any, length: number) => string>().mockImplementation((value: any, length: number) => {
      if (value === undefined || value === null) value = '0x0'
      let hex = typeof value === 'string' ? value : `0x${value.toString(16)}`
      if (!hex.startsWith('0x')) hex = `0x${hex}`
      // Ensure proper padding to exact length
      const targetLength = length * 2 + 2 // +2 for '0x' prefix
      if (hex.length < targetLength) {
        hex = hex + '0'.repeat(targetLength - hex.length)
      }
      return hex
    })
    ethers.dataLength = jest.fn<(data: string) => number>().mockImplementation((data: string) => {
      if (!data || data === '0x') return 0
      return (data.length - 2) / 2
    })

    // Mock multisig utilities
    const multisig = require('../utils/multisig')
    multisig.getSafeContract = jest.fn<() => any>().mockReturnValue(mockSafeContract)
    multisig.createSafeTransactionHash = jest.fn<(params: any) => Promise<string>>().mockResolvedValue('0xtxhash123')
    multisig.getSafeNonce = jest.fn<() => Promise<number>>().mockResolvedValue(5)
    multisig.executeSafeTransaction = jest.fn<(params: any) => Promise<any>>().mockResolvedValue({
      hash: '0xexecutiontxhash',
      wait: jest.fn<() => Promise<any>>().mockResolvedValue({
        status: 1,
        blockNumber: 12345,
        gasUsed: { toString: () => '150000' },
        logs: [],
      }),
    })
    multisig.getSafeAddresses = jest.fn<() => any>().mockReturnValue({
      multiSend: '0xmultisendaddress',
    })

    // Mock Firestore
    const firestore = require('firebase-admin/firestore')
    firestore.getFirestore = jest.fn().mockReturnValue(mockDb)

    // Initialize ContractService
    contractService = new ContractService(mockConfig)
  })

  describe('Constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(contractService).toBeInstanceOf(ContractService)
      expect(contractService['config']).toEqual(mockConfig)
    })
  })

  describe('proposeTransaction', () => {
    it('should create a transaction proposal successfully', async () => {
      const mockDoc = {
        exists: false,
      }
      mockDb.get.mockResolvedValue(mockDoc)

      const proposal: TransactionProposal = {
        to: '0xcontractaddress',
        value: '0',
        data: '0xdata123',
        operation: 0,
        description: 'Test transaction',
        metadata: { test: true },
      }

      const result = await contractService.proposeTransaction(proposal, 'user123')

      expect(result).toMatchObject({
        id: '0xtxhash123',
        status: 'pending_signatures',
        requiredSignatures: 2,
        currentSignatures: 0,
        description: 'Test transaction',
      })

      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '0xtxhash123',
          status: 'pending_signatures',
          description: 'Test transaction',
          createdBy: 'user123',
          chainId: 80002,
        })
      )
    })

    it('should handle errors during proposal creation', async () => {
      mockDb.set.mockRejectedValue(new Error('Firestore error'))

      const proposal: TransactionProposal = {
        to: '0xcontractaddress',
        value: '0',
        data: '0xdata123',
        operation: 0,
        description: 'Test transaction',
      }

      await expect(contractService.proposeTransaction(proposal, 'user123')).rejects.toThrow(AppError)
    })
  })

  describe('proposeContractCall', () => {
    it('should create a contract call proposal successfully', async () => {
      const mockDoc = {
        exists: false,
      }
      mockDb.get.mockResolvedValue(mockDoc)

      const contractCall: ContractCall = {
        contractAddress: '0xcontractaddress',
        functionName: 'testFunction',
        abi: [{ name: 'testFunction', inputs: [] }],
        args: [],
        value: '0',
      }

      const result = await contractService.proposeContractCall(contractCall, 'Test contract call', 'user123', { test: true })

      expect(result).toMatchObject({
        id: '0xtxhash123',
        status: 'pending_signatures',
        description: 'Test contract call',
      })

      expect(result.metadata).toMatchObject({
        test: true,
        functionName: 'testFunction',
        contractAddress: '0xcontractaddress',
      })
    })

    it('should handle ABI encoding errors', async () => {
      // Create a spy to track the call and then make it throw
      const ethers = require('ethers')
      const originalInterface = ethers.Interface
      const mockInterface = jest.fn().mockImplementation(() => ({
        encodeFunctionData: jest.fn().mockImplementation(() => {
          throw new Error('ABI encoding failed')
        }),
      }))
      ethers.Interface = mockInterface

      const contractCall: ContractCall = {
        contractAddress: '0xcontractaddress',
        functionName: 'testFunction',
        abi: [{ name: 'testFunction', inputs: [] }],
        args: [],
      }

      await expect(contractService.proposeContractCall(contractCall, 'Test contract call', 'user123')).rejects.toThrow(AppError)

      // Restore the original mock
      ethers.Interface = originalInterface
    })
  })

  describe('proposeBatchTransaction', () => {
    it('should create a batch transaction proposal successfully', async () => {
      const mockDoc = {
        exists: false,
      }
      mockDb.get.mockResolvedValue(mockDoc)

      const batchRequest: BatchTransactionRequest = {
        transactions: [
          {
            to: '0xcontract1',
            value: '0',
            data: '0xdata1',
            operation: 0,
            description: 'Transaction 1',
          },
          {
            to: '0xcontract2',
            value: '0',
            data: '0xdata2',
            operation: 0,
            description: 'Transaction 2',
          },
        ],
        description: 'Batch transaction test',
        metadata: { batch: true },
      }

      const result = await contractService.proposeBatchTransaction(batchRequest, 'user123')

      expect(result).toMatchObject({
        id: '0xtxhash123',
        status: 'pending_signatures',
        description: 'Batch transaction test',
      })

      expect(result.metadata).toMatchObject({
        batch: true,
        batchSize: 2,
      })
    })

    it('should handle empty batch transactions', async () => {
      const mockDoc = {
        exists: false,
      }
      mockDb.get.mockResolvedValue(mockDoc)

      const batchRequest: BatchTransactionRequest = {
        transactions: [],
        description: 'Empty batch',
      }

      // The service allows empty batches - this is valid MultiSend behavior
      const result = await contractService.proposeBatchTransaction(batchRequest, 'user123')

      expect(result).toMatchObject({
        id: '0xtxhash123',
        status: 'pending_signatures',
        description: 'Empty batch',
      })

      expect(result.metadata).toMatchObject({
        batchSize: 0,
      })
    })
  })

  describe('addSignature', () => {
    it('should add signature to pending transaction successfully', async () => {
      const mockTxDoc = {
        exists: true,
        data: () => ({
          id: '0xtxhash123',
          status: 'pending_signatures',
          signatures: [],
          requiredSignatures: 2,
          currentSignatures: 0,
          safeTransaction: { to: '0xcontract', data: '0xdata' },
          description: 'Test transaction',
        }),
      }
      mockDb.get.mockResolvedValue(mockTxDoc)

      const ethers = require('ethers')
      ethers.verifyMessage.mockReturnValue('0xowner1')

      const signature = {
        signer: '0xowner1',
        data: '0xsignature123',
      }

      const result = await contractService.addSignature('0xtxhash123', signature)

      expect(result.currentSignatures).toBe(1)
      expect(result.status).toBe('pending_signatures')
      expect(mockDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          signatures: [signature],
          currentSignatures: 1,
        })
      )
    })

    it('should update status to ready_to_execute when threshold is met', async () => {
      const mockTxDoc = {
        exists: true,
        data: () => ({
          id: '0xtxhash123',
          status: 'pending_signatures',
          signatures: [{ signer: '0xowner1', data: '0xsig1' }],
          requiredSignatures: 2,
          currentSignatures: 1,
        }),
      }
      mockDb.get.mockResolvedValue(mockTxDoc)

      const ethers = require('ethers')
      ethers.verifyMessage.mockReturnValue('0xowner2')

      const signature = {
        signer: '0xowner2',
        data: '0xsignature456',
      }

      const result = await contractService.addSignature('0xtxhash123', signature)

      expect(result.currentSignatures).toBe(2)
      expect(result.status).toBe('ready_to_execute')
      expect(mockDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ready_to_execute',
          readyAt: expect.any(Date),
        })
      )
    })

    it('should reject duplicate signatures', async () => {
      const mockTxDoc = {
        exists: true,
        data: () => ({
          status: 'pending_signatures',
          signatures: [{ signer: '0xowner1', data: '0xsig1' }],
          requiredSignatures: 2,
        }),
      }
      mockDb.get.mockResolvedValue(mockTxDoc)

      const signature = {
        signer: '0xowner1',
        data: '0xsignature123',
      }

      await expect(contractService.addSignature('0xtxhash123', signature)).rejects.toThrow(AppError)
    })

    it('should reject invalid signature format', async () => {
      const mockTxDoc = {
        exists: true,
        data: () => ({
          status: 'pending_signatures',
          signatures: [],
          requiredSignatures: 2,
        }),
      }
      mockDb.get.mockResolvedValue(mockTxDoc)

      const ethers = require('ethers')
      ethers.verifyMessage.mockReturnValue('0xdifferentaddress')

      const signature = {
        signer: '0xsigneraddress',
        data: '0xsignature123',
      }

      await expect(contractService.addSignature('0xtxhash123', signature)).rejects.toThrow(AppError)
    })
  })

  describe('executeTransaction', () => {
    it('should execute transaction successfully', async () => {
      const mockTxDoc = {
        exists: true,
        data: () => ({
          status: 'ready_to_execute',
          signatures: [
            { signer: '0xowner1', data: '0xsig1' },
            { signer: '0xowner2', data: '0xsig2' },
          ],
          requiredSignatures: 2,
          safeTransaction: {
            to: '0xcontract',
            data: '0xdata',
          },
        }),
      }
      mockDb.get.mockResolvedValue(mockTxDoc)

      const result = await contractService.executeTransaction('0xtxhash123')

      expect(result.success).toBe(true)
      expect(result.transactionHash).toBe('0xexecutiontxhash')
      expect(result.blockNumber).toBe(12345)
      expect(mockDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          executionResult: expect.objectContaining({
            success: true,
            transactionHash: '0xexecutiontxhash',
          }),
        })
      )
    })

    it('should reject execution of non-ready transactions', async () => {
      const mockTxDoc = {
        exists: true,
        data: () => ({
          status: 'pending_signatures',
          signatures: [{ signer: '0xowner1', data: '0xsig1' }],
          requiredSignatures: 2,
        }),
      }
      mockDb.get.mockResolvedValue(mockTxDoc)

      await expect(contractService.executeTransaction('0xtxhash123')).rejects.toThrow(AppError)
    })

    it('should handle execution failures', async () => {
      const mockTxDoc = {
        exists: true,
        data: () => ({
          status: 'ready_to_execute',
          signatures: [
            { signer: '0xowner1', data: '0xsig1' },
            { signer: '0xowner2', data: '0xsig2' },
          ],
          requiredSignatures: 2,
          safeTransaction: { to: '0xcontract', data: '0xdata' },
        }),
      }
      mockDb.get.mockResolvedValue(mockTxDoc)

      const multisig = require('../utils/multisig')
      multisig.executeSafeTransaction.mockRejectedValue(new Error('Execution failed'))

      await expect(contractService.executeTransaction('0xtxhash123')).rejects.toThrow(AppError)

      expect(mockDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
        })
      )
    })
  })

  describe('getTransactionStatus', () => {
    it('should return transaction status successfully', async () => {
      const mockTxDoc = {
        exists: true,
        data: () => ({
          id: '0xtxhash123',
          status: 'pending_signatures',
          signatures: [{ signer: '0xowner1', data: '0xsig1' }],
          requiredSignatures: 2,
          currentSignatures: 1,
          createdAt: { toDate: () => new Date('2023-01-01') },
          updatedAt: { toDate: () => new Date('2023-01-02') },
          description: 'Test transaction',
          safeTransaction: { to: '0xcontract' },
        }),
      }
      mockDb.get.mockResolvedValue(mockTxDoc)

      const result = await contractService.getTransactionStatus('0xtxhash123')

      expect(result).toMatchObject({
        id: '0xtxhash123',
        status: 'pending_signatures',
        currentSignatures: 1,
        requiredSignatures: 2,
        description: 'Test transaction',
      })
    })

    it('should return null for non-existent transaction', async () => {
      const mockTxDoc = { exists: false }
      mockDb.get.mockResolvedValue(mockTxDoc)

      const result = await contractService.getTransactionStatus('0xtxhash123')

      expect(result).toBeNull()
    })
  })

  describe('listTransactions', () => {
    it('should list transactions with pagination', async () => {
      const mockCountSnapshot = {
        data: () => ({ count: 25 }),
      }
      const mockTransactions = [
        {
          data: () => ({
            id: '0xtx1',
            status: 'pending_signatures',
            signatures: [],
            requiredSignatures: 2,
            currentSignatures: 0,
            createdAt: { toDate: () => new Date('2023-01-01') },
            updatedAt: { toDate: () => new Date('2023-01-01') },
            description: 'Transaction 1',
            safeTransaction: { to: '0xcontract1' },
          }),
        },
        {
          data: () => ({
            id: '0xtx2',
            status: 'completed',
            signatures: [{ signer: '0xowner1' }, { signer: '0xowner2' }],
            requiredSignatures: 2,
            currentSignatures: 2,
            createdAt: { toDate: () => new Date('2023-01-02') },
            updatedAt: { toDate: () => new Date('2023-01-03') },
            executedAt: { toDate: () => new Date('2023-01-03') },
            description: 'Transaction 2',
            safeTransaction: { to: '0xcontract2' },
          }),
        },
      ]

      mockDb.get.mockResolvedValueOnce(mockCountSnapshot)
      mockDb.get.mockResolvedValueOnce({ docs: mockTransactions })

      const result = await contractService.listTransactions({
        limit: 10,
        offset: 0,
      })

      expect(result.transactions).toHaveLength(2)
      expect(result.total).toBe(25)
      expect(result.transactions[0].id).toBe('0xtx1')
      expect(result.transactions[1].id).toBe('0xtx2')
    })

    it('should apply status filter', async () => {
      const mockCountSnapshot = {
        data: () => ({ count: 1 }),
      }
      mockDb.get.mockResolvedValueOnce(mockCountSnapshot)
      mockDb.get.mockResolvedValueOnce({ docs: [] })

      await contractService.listTransactions({
        status: 'pending_signatures',
      })

      expect(mockDb.where).toHaveBeenCalledWith('status', '==', 'pending_signatures')
    })
  })

  describe('emergencyPause', () => {
    it('should create emergency pause transaction', async () => {
      const mockDoc = {
        exists: false,
      }
      mockDb.get.mockResolvedValue(mockDoc)

      const result = await contractService.emergencyPause('0xcontractaddress', 'user123', 'Critical security vulnerability detected')

      expect(result).toMatchObject({
        id: '0xtxhash123',
        status: 'pending_signatures',
        description: 'EMERGENCY PAUSE: Critical security vulnerability detected',
      })

      expect(result.metadata).toMatchObject({
        emergency: true,
        reason: 'Critical security vulnerability detected',
        pausedContract: '0xcontractaddress',
      })
    })
  })

  describe('Error handling', () => {
    it('should wrap generic errors in AppError', async () => {
      mockDb.set.mockRejectedValue(new Error('Generic database error'))

      const proposal: TransactionProposal = {
        to: '0xcontractaddress',
        value: '0',
        data: '0xdata123',
        operation: 0,
        description: 'Test transaction',
      }

      await expect(contractService.proposeTransaction(proposal, 'user123')).rejects.toThrow(AppError)
    })

    it('should preserve AppError instances', async () => {
      const appError = new AppError('Custom error', 'CUSTOM_ERROR')
      mockDb.set.mockRejectedValue(appError)

      const proposal: TransactionProposal = {
        to: '0xcontractaddress',
        value: '0',
        data: '0xdata123',
        operation: 0,
        description: 'Test transaction',
      }

      await expect(contractService.proposeTransaction(proposal, 'user123')).rejects.toThrow('Custom error')
    })
  })
})
