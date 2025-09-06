/**
 * ContractService Test - Updated with New Mock System
 * 
 * This test demonstrates the new comprehensive mock system in action,
 * replacing the old manual mocking with centralized, reliable mocks.
 */

import { describe, beforeEach, afterEach, it, expect } from '@jest/globals'
import { ContractService, type ContractServiceConfig } from './ContractService'
import { quickSetup, MockFactory } from '../__mocks__'
import { TestData, TestHelpers } from '../__mocks__/fixtures'

describe('ContractService - Enhanced Testing', () => {
  let contractService: ContractService
  let mockConfig: ContractServiceConfig
  let testEnvironment: any
  
  beforeEach(async () => {
    // Create comprehensive test environment
    testEnvironment = MockFactory.createCloudFunctionEnvironment({
      withAuth: true,
      withFirestore: true,
      withContracts: true,
      chainName: 'local',
    })
    
    // Setup test configuration
    mockConfig = {
      chainId: TestData.networks.amoy.chainId,
      rpcUrl: TestData.networks.amoy.rpcUrl,
      safeAddress: TestData.addresses.contracts.safe,
      privateKey: '0x' + '0'.repeat(64), // Test private key
      poolFactoryAddress: TestData.addresses.contracts.poolFactory,
    }
    
    // Initialize ContractService with mocked dependencies
    contractService = new ContractService(mockConfig)
    
    // Setup Firebase environment
    await testEnvironment.functionTester.setupFirebaseEnvironment()
  })
  
  afterEach(async () => {
    await testEnvironment.functionTester.cleanupFirebaseEnvironment()
    MockFactory.resetAllMocks()
  })
  
  describe('Pool Creation via Multi-Sig', () => {
    it('should create pool creation proposal successfully', async () => {
      // Arrange
      const scenario = quickSetup.poolCreation({
        poolOwner: TestData.addresses.poolOwners[0],
        maxLoanAmount: TestData.pools.basic.maxLoanAmount,
        interestRate: TestData.pools.basic.interestRate,
        loanDuration: TestData.pools.basic.loanDuration,
        name: TestData.pools.basic.name,
      })
      
      // Setup Safe contract expectations
      scenario.mocks.blockchain.getContract('Safe').getThreshold.mockResolvedValue(BigInt(2))
      scenario.mocks.blockchain.getContract('Safe').getOwners.mockResolvedValue([
        TestData.addresses.safeOwners[0],
        TestData.addresses.safeOwners[1],
        TestData.addresses.safeOwners[2],
      ])
      scenario.mocks.blockchain.getContract('Safe').nonce.mockResolvedValue(BigInt(42))
      
      // Act
      const proposal = await contractService.createPoolProposal({
        poolOwner: TestData.addresses.poolOwners[0],
        maxLoanAmount: TestHelpers.ethToWei(TestData.pools.basic.maxLoanAmount),
        interestRate: TestData.pools.basic.interestRate,
        loanDuration: TestData.pools.basic.loanDuration,
        name: TestData.pools.basic.name,
      })
      
      // Assert
      expect(proposal).toBeDefined()
      expect(proposal.transactionHash).toBeValidTransactionHash()
      expect(proposal.safeAddress).toBeValidEthereumAddress()
      expect(proposal.requiredSignatures).toBe(2)
      expect(proposal.currentSignatures).toBe(0)
      
      // Verify Safe contract interactions
      expect(scenario.mocks.blockchain.getContract('Safe').getThreshold).toHaveBeenCalled()
      expect(scenario.mocks.blockchain.getContract('Safe').getOwners).toHaveBeenCalled()
      
      // Verify Firestore save
      expect(testEnvironment.mocks.firebase.firestore.collection).toHaveBeenCalledWith('safe_transactions')
    })
    
    it('should handle insufficient Safe owners gracefully', async () => {
      // Arrange
      const scenario = quickSetup.poolCreation()
      
      // Setup insufficient owners scenario
      scenario.mocks.blockchain.getContract('Safe').getOwners.mockResolvedValue([
        TestData.addresses.safeOwners[0], // Only 1 owner
      ])
      scenario.mocks.blockchain.getContract('Safe').getThreshold.mockResolvedValue(BigInt(2))
      
      // Act & Assert
      await expect(contractService.createPoolProposal({
        poolOwner: TestData.addresses.poolOwners[0],
        maxLoanAmount: TestHelpers.ethToWei('1000'),
        interestRate: 500,
        loanDuration: 2592000,
        name: 'Test Pool',
      })).rejects.toThrow('Insufficient Safe owners')
    })
    
    it('should validate pool parameters before creating proposal', async () => {
      // Arrange
      const scenario = quickSetup.poolCreation()
      
      // Act & Assert - Invalid pool owner
      await expect(contractService.createPoolProposal({
        poolOwner: TestData.addresses.invalid.zero,
        maxLoanAmount: TestHelpers.ethToWei('1000'),
        interestRate: 500,
        loanDuration: 2592000,
        name: 'Invalid Pool',
      })).rejects.toThrow('Invalid pool owner address')
      
      // Act & Assert - Invalid amount
      await expect(contractService.createPoolProposal({
        poolOwner: TestData.addresses.poolOwners[0],
        maxLoanAmount: '0',
        interestRate: 500,
        loanDuration: 2592000,
        name: 'Zero Amount Pool',
      })).rejects.toThrow('Invalid loan amount')
      
      // Act & Assert - Invalid interest rate
      await expect(contractService.createPoolProposal({
        poolOwner: TestData.addresses.poolOwners[0],
        maxLoanAmount: TestHelpers.ethToWei('1000'),
        interestRate: 15000, // > 100%
        loanDuration: 2592000,
        name: 'Invalid Rate Pool',
      })).rejects.toThrow('Invalid interest rate')
    })
  })
  
  describe('Signature Collection', () => {
    it('should collect and validate Safe signatures', async () => {
      // Arrange
      const scenario = quickSetup.safeTransaction()
      const transactionHash = TestData.TxHashes.SAFE_TX_HASH_1
      
      // Setup existing transaction
      scenario.mocks.firebase.seedDocument(`safe_transactions/${transactionHash}`, {
        transactionHash,
        safeAddress: TestData.addresses.contracts.safe,
        requiredSignatures: 2,
        currentSignatures: 0,
        signatures: [],
        status: 'pending_signatures',
      })
      
      // Act
      const result = await contractService.addSignature({
        transactionHash,
        signature: TestData.Signatures.OWNER_1_SIG,
        signerAddress: TestData.addresses.safeOwners[0],
      })
      
      // Assert
      expect(result.success).toBe(true)
      expect(result.currentSignatures).toBe(1)
      expect(result.readyToExecute).toBe(false) // Need 2 signatures
      
      // Verify signature storage
      const storedTx = testEnvironment.mocks.firebase.getDocument(`safe_transactions/${transactionHash}`)
      expect(storedTx.signatures).toHaveLength(1)
      expect(storedTx.signatures[0].signer).toBe(TestData.addresses.safeOwners[0])
    })
    
    it('should detect when transaction is ready for execution', async () => {
      // Arrange
      const scenario = quickSetup.safeTransaction()
      const transactionHash = TestData.TxHashes.SAFE_TX_HASH_1
      
      // Setup transaction with 1 existing signature
      scenario.mocks.firebase.seedDocument(`safe_transactions/${transactionHash}`, {
        transactionHash,
        safeAddress: TestData.addresses.contracts.safe,
        requiredSignatures: 2,
        currentSignatures: 1,
        signatures: [
          {
            signer: TestData.addresses.safeOwners[0],
            signature: TestData.Signatures.OWNER_1_SIG,
            signedAt: TestHelpers.pastDate(60000),
          },
        ],
        status: 'pending_signatures',
      })
      
      // Act - Add second signature
      const result = await contractService.addSignature({
        transactionHash,
        signature: TestData.Signatures.OWNER_2_SIG,
        signerAddress: TestData.addresses.safeOwners[1],
      })
      
      // Assert
      expect(result.success).toBe(true)
      expect(result.currentSignatures).toBe(2)
      expect(result.readyToExecute).toBe(true) // Now ready!
      
      // Verify status update
      const storedTx = testEnvironment.mocks.firebase.getDocument(`safe_transactions/${transactionHash}`)
      expect(storedTx.status).toBe('ready_to_execute')
    })
    
    it('should reject duplicate signatures', async () => {
      // Arrange
      const scenario = quickSetup.safeTransaction()
      const transactionHash = TestData.TxHashes.SAFE_TX_HASH_1
      
      // Setup transaction with existing signature from same signer
      scenario.mocks.firebase.seedDocument(`safe_transactions/${transactionHash}`, {
        transactionHash,
        safeAddress: TestData.addresses.contracts.safe,
        requiredSignatures: 2,
        currentSignatures: 1,
        signatures: [
          {
            signer: TestData.addresses.safeOwners[0],
            signature: TestData.Signatures.OWNER_1_SIG,
            signedAt: TestHelpers.pastDate(60000),
          },
        ],
        status: 'pending_signatures',
      })
      
      // Act & Assert
      await expect(contractService.addSignature({
        transactionHash,
        signature: TestData.Signatures.OWNER_1_SIG,
        signerAddress: TestData.addresses.safeOwners[0], // Same signer
      })).rejects.toThrow('Signer has already signed this transaction')
    })
  })
  
  describe('Transaction Execution', () => {
    it('should execute Safe transaction when threshold is met', async () => {
      // Arrange
      const scenario = quickSetup.safeTransaction()
      const transactionHash = TestData.TxHashes.SAFE_TX_HASH_1
      
      // Setup ready-to-execute transaction
      scenario.mocks.firebase.seedDocument(`safe_transactions/${transactionHash}`, {
        transactionHash,
        safeAddress: TestData.addresses.contracts.safe,
        requiredSignatures: 2,
        currentSignatures: 2,
        signatures: [
          {
            signer: TestData.addresses.safeOwners[0],
            signature: TestData.Signatures.OWNER_1_SIG,
            signedAt: TestHelpers.pastDate(120000),
          },
          {
            signer: TestData.addresses.safeOwners[1],
            signature: TestData.Signatures.OWNER_2_SIG,
            signedAt: TestHelpers.pastDate(60000),
          },
        ],
        status: 'ready_to_execute',
        safeTransaction: TestData.SAMPLE_SAFE_TRANSACTIONS.POOL_CREATION_TX,
        poolParams: TestData.pools.basic,
      })
      
      // Setup successful execution
      scenario.safeContract.execTransaction.mockResolvedValue({
        hash: '0xexecution123456789',
        wait: jest.fn().mockResolvedValue({
          status: 1,
          gasUsed: BigInt('200000'),
          transactionHash: '0xexecution123456789',
        }),
      })
      
      // Act
      const result = await contractService.executeTransaction({
        transactionHash,
      })
      
      // Assert
      expect(result.success).toBe(true)
      expect(result.executionTxHash).toBeValidTransactionHash()
      expect(result.poolId).toBeDefined()
      
      // Verify Safe contract execution
      expect(scenario.safeContract.execTransaction).toHaveBeenCalledWith(
        TestData.SAMPLE_SAFE_TRANSACTIONS.POOL_CREATION_TX.to,
        TestData.SAMPLE_SAFE_TRANSACTIONS.POOL_CREATION_TX.value,
        TestData.SAMPLE_SAFE_TRANSACTIONS.POOL_CREATION_TX.data,
        TestData.SAMPLE_SAFE_TRANSACTIONS.POOL_CREATION_TX.operation,
        TestData.SAMPLE_SAFE_TRANSACTIONS.POOL_CREATION_TX.safeTxGas,
        TestData.SAMPLE_SAFE_TRANSACTIONS.POOL_CREATION_TX.baseGas,
        TestData.SAMPLE_SAFE_TRANSACTIONS.POOL_CREATION_TX.gasPrice,
        TestData.SAMPLE_SAFE_TRANSACTIONS.POOL_CREATION_TX.gasToken,
        TestData.SAMPLE_SAFE_TRANSACTIONS.POOL_CREATION_TX.refundReceiver,
        expect.any(String) // Combined signatures
      )
      
      // Verify status update
      const updatedTx = testEnvironment.mocks.firebase.getDocument(`safe_transactions/${transactionHash}`)
      expect(updatedTx.status).toBe('executed')
      expect(updatedTx.executionTxHash).toBeValidTransactionHash()
    })
    
    it('should reject execution with insufficient signatures', async () => {
      // Arrange
      const scenario = quickSetup.safeTransaction()
      const transactionHash = TestData.TxHashes.SAFE_TX_HASH_1
      
      // Setup transaction with insufficient signatures
      scenario.mocks.firebase.seedDocument(`safe_transactions/${transactionHash}`, {
        transactionHash,
        safeAddress: TestData.addresses.contracts.safe,
        requiredSignatures: 3, // Need 3
        currentSignatures: 2, // Only have 2
        signatures: [
          { signer: TestData.addresses.safeOwners[0], signature: TestData.Signatures.OWNER_1_SIG },
          { signer: TestData.addresses.safeOwners[1], signature: TestData.Signatures.OWNER_2_SIG },
        ],
        status: 'pending_signatures',
      })
      
      // Act & Assert
      await expect(contractService.executeTransaction({
        transactionHash,
      })).rejects.toThrow('Insufficient signatures')
    })
  })
  
  describe('Error Handling', () => {
    it('should handle blockchain network errors gracefully', async () => {
      // Arrange
      const scenario = quickSetup.poolCreation()
      const errorScenarios = quickSetup.errors()
      
      // Simulate network error
      errorScenarios.blockchain.networkError()
      
      // Act & Assert
      await expect(contractService.createPoolProposal({
        poolOwner: TestData.addresses.poolOwners[0],
        maxLoanAmount: TestHelpers.ethToWei('1000'),
        interestRate: 500,
        loanDuration: 2592000,
        name: 'Network Error Pool',
      })).rejects.toThrow('Blockchain network unavailable')
      
      // Restore normal operation
      errorScenarios.restore()
    })
    
    it('should handle Firestore unavailability', async () => {
      // Arrange
      const scenario = quickSetup.poolCreation()
      const errorScenarios = quickSetup.errors()
      
      // Simulate Firestore error
      errorScenarios.firebase.unavailable()
      
      // Act & Assert
      await expect(contractService.createPoolProposal({
        poolOwner: TestData.addresses.poolOwners[0],
        maxLoanAmount: TestHelpers.ethToWei('1000'),
        interestRate: 500,
        loanDuration: 2592000,
        name: 'Firestore Error Pool',
      })).rejects.toThrow('Service temporarily unavailable')
      
      // Restore normal operation
      errorScenarios.restore()
    })
    
    it('should handle contract execution reverts', async () => {
      // Arrange
      const scenario = quickSetup.safeTransaction()
      const errorScenarios = quickSetup.errors()
      
      // Setup ready transaction
      scenario.mocks.firebase.seedDocument('safe_transactions/revert-test', {
        transactionHash: 'revert-test',
        safeAddress: TestData.addresses.contracts.safe,
        requiredSignatures: 2,
        currentSignatures: 2,
        status: 'ready_to_execute',
        safeTransaction: TestData.SAMPLE_SAFE_TRANSACTIONS.POOL_CREATION_TX,
      })
      
      // Simulate contract revert
      errorScenarios.blockchain.contractRevert('Invalid pool parameters')
      
      // Act & Assert
      await expect(contractService.executeTransaction({
        transactionHash: 'revert-test',
      })).rejects.toThrow('Contract execution failed: Invalid pool parameters')
      
      // Restore normal operation
      errorScenarios.restore()
    })
  })
  
  describe('Performance Testing', () => {
    it('should complete pool creation within acceptable time', async () => {
      // Arrange
      const scenario = quickSetup.poolCreation()
      
      // Act & Assert
      const { result, duration } = await testEnvironment.functionTester.measurePerformance(
        () => contractService.createPoolProposal({
          poolOwner: TestData.addresses.poolOwners[0],
          maxLoanAmount: TestHelpers.ethToWei('1000'),
          interestRate: 500,
          loanDuration: 2592000,
          name: 'Performance Test Pool',
        }),
        {}, // No request object needed for direct service call
        5000 // 5 second limit
      )
      
      expect(result).toBeDefined()
      expect(duration).toBeLessThan(1000) // Should be under 1 second with mocks
      
      console.log(`Pool creation completed in ${duration}ms`)
    })
    
    it('should handle concurrent transaction proposals efficiently', async () => {
      // Arrange
      const scenario = quickSetup.poolCreation()
      const concurrentRequests = 5
      
      const proposals = Array(concurrentRequests).fill(null).map((_, i) => 
        () => contractService.createPoolProposal({
          poolOwner: TestData.addresses.poolOwners[i % 3],
          maxLoanAmount: TestHelpers.ethToWei((1000 + i * 100).toString()),
          interestRate: 500 + (i * 50),
          loanDuration: 2592000 + (i * 86400),
          name: `Concurrent Pool ${i + 1}`,
        })
      )
      
      // Act
      const startTime = performance.now()
      const results = await Promise.all(proposals.map(fn => fn()))
      const endTime = performance.now()
      const totalTime = endTime - startTime
      
      // Assert
      expect(results).toHaveLength(concurrentRequests)
      results.forEach(result => {
        expect(result.transactionHash).toBeValidTransactionHash()
      })
      
      expect(totalTime).toBeLessThan(2000) // Should handle concurrency efficiently
      
      console.log(`${concurrentRequests} concurrent proposals completed in ${totalTime}ms`)
    })
  })
})