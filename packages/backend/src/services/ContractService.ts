import { ethers } from 'ethers'
import { logger } from 'firebase-functions'
import { getFirestore } from 'firebase-admin/firestore'
import type * as FirebaseFirestore from 'firebase-admin/firestore'
import {
  createSafeTransactionHash,
  executeSafeTransaction as executeSafeTransactionUtil,
  getSafeAddresses,
  getSafeContract,
  getSafeNonce,
  SafeSignature as SafeSignatureType,
  SafeTransaction,
} from '../utils/multisig'
import { AppError } from '../utils/errorHandling'

/**
 * Re-export types for external use
 */
export type SafeSignature = SafeSignatureType

/**
 * Configuration for ContractService
 */
export interface ContractServiceConfig {
  chainId: number
  rpcUrl: string
  safeAddress: string
  privateKey: string
  poolFactoryAddress: string
}

/**
 * Transaction proposal for Safe execution
 */
export interface TransactionProposal {
  to: string
  value: string
  data: string
  operation: number
  description: string
  metadata?: Record<string, unknown>
}

/**
 * Contract function call parameters
 */
export interface ContractCall {
  contractAddress: string
  functionName: string
  abi: ethers.InterfaceAbi
  args: unknown[]
  value?: string
}

/**
 * Batch transaction request
 */
export interface BatchTransactionRequest {
  transactions: TransactionProposal[]
  description: string
  metadata?: Record<string, unknown>
}

/**
 * Transaction execution result
 */
export interface ExecutionResult {
  success: boolean
  transactionHash: string
  blockNumber?: number
  gasUsed?: string
  events?: Array<{ name: string; args: ReadonlyArray<unknown>; address: string }>
  error?: string
}

/**
 * Transaction monitoring status
 */
export interface TransactionStatus {
  id: string
  status: 'pending_signatures' | 'ready_to_execute' | 'executing' | 'completed' | 'failed' | 'expired'
  safeTransaction: SafeTransaction
  signatures: SafeSignatureType[]
  requiredSignatures: number
  currentSignatures: number
  createdAt: Date
  updatedAt: Date
  executedAt?: Date
  executionResult?: ExecutionResult
  description: string
  metadata?: Record<string, unknown>
}

/**
 * ContractService - Main service class for Safe wallet contract interactions
 *
 * This service provides a high-level interface for:
 * - Creating and managing Safe multi-sig transactions
 * - Executing contract calls through Safe wallet
 * - Monitoring transaction status and recovery
 * - Batching multiple transactions
 * - Emergency pause functionality
 */
export class ContractService {
  private config: ContractServiceConfig
  private provider: ethers.Provider
  private signer: ethers.Signer
  private safeContract: ethers.Contract
  private db: FirebaseFirestore.Firestore

  constructor(config: ContractServiceConfig) {
    this.config = config
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl)
    this.signer = new ethers.Wallet(config.privateKey, this.provider)
    this.safeContract = getSafeContract(config.safeAddress, this.provider)
    this.db = getFirestore()

    logger.info('ContractService initialized', {
      chainId: config.chainId,
      safeAddress: config.safeAddress,
      poolFactoryAddress: config.poolFactoryAddress,
    })
  }

  /**
   * Create a transaction proposal for Safe execution
   */
  async proposeTransaction(proposal: TransactionProposal, createdBy: string): Promise<TransactionStatus> {
    try {
      logger.info('Creating transaction proposal', {
        to: proposal.to,
        description: proposal.description,
        createdBy,
      })

      // Get current Safe nonce
      const nonce = await getSafeNonce(this.config.safeAddress, this.provider)

      // Create Safe transaction
      const safeTransaction: SafeTransaction = {
        to: proposal.to,
        value: proposal.value,
        data: proposal.data,
        operation: proposal.operation,
        safeTxGas: '0',
        baseGas: '0',
        gasPrice: '0',
        gasToken: ethers.ZeroAddress,
        refundReceiver: ethers.ZeroAddress,
        nonce,
      }

      // Create transaction hash
      const transactionHash = await createSafeTransactionHash(this.config.safeAddress, safeTransaction, this.provider)

      // Get Safe configuration
      const [requiredSignatures] = await Promise.all([this.safeContract.getThreshold()])

      // Create transaction status record
      const transactionStatus: TransactionStatus = {
        id: transactionHash,
        status: 'pending_signatures',
        safeTransaction,
        signatures: [],
        requiredSignatures: Number(requiredSignatures),
        currentSignatures: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        description: proposal.description,
        metadata: proposal.metadata,
      }

      // Store in Firestore
      await this.db
        .collection('contract_transactions')
        .doc(transactionHash)
        .set({
          ...transactionStatus,
          createdBy,
          chainId: this.config.chainId,
          safeAddress: this.config.safeAddress,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        })

      logger.info('Transaction proposal created', {
        transactionHash,
        requiredSignatures: transactionStatus.requiredSignatures,
      })

      return transactionStatus
    } catch (error) {
      logger.error('Error creating transaction proposal', {
        error: error instanceof Error ? error.message : String(error),
        proposal,
      })
      throw new AppError(
        `Failed to create transaction proposal: ${error instanceof Error ? error.message : String(error)}`,
        'PROPOSAL_CREATION_FAILED'
      )
    }
  }

  /**
   * Add signature to a pending transaction
   */
  async addSignature(transactionId: string, signature: SafeSignatureType): Promise<TransactionStatus> {
    try {
      logger.info('Adding signature to transaction', {
        transactionId,
        signer: signature.signer,
      })

      const txDoc = await this.db.collection('contract_transactions').doc(transactionId).get()

      if (!txDoc.exists) {
        throw new AppError('Transaction not found', 'TRANSACTION_NOT_FOUND')
      }

      const txData = txDoc.data()!

      if (txData.status !== 'pending_signatures') {
        throw new AppError(`Cannot add signature, transaction status is ${txData.status}`, 'INVALID_STATUS')
      }

      // Check if signer already signed
      const existingSignatures = txData.signatures || []
      const existingSignature = existingSignatures.find(
        (sig: SafeSignatureType) => sig.signer.toLowerCase() === signature.signer.toLowerCase()
      )

      if (existingSignature) {
        throw new AppError('Address has already signed this transaction', 'ALREADY_SIGNED')
      }

      // Verify signature
      const transactionHash = transactionId
      const recoveredAddress = ethers.verifyMessage(ethers.getBytes(transactionHash), signature.data)

      if (recoveredAddress.toLowerCase() !== signature.signer.toLowerCase()) {
        throw new AppError('Invalid signature', 'INVALID_SIGNATURE')
      }

      // Add signature
      const updatedSignatures = [...existingSignatures, signature]
      const readyToExecute = updatedSignatures.length >= txData.requiredSignatures

      const updateData: Record<string, unknown> = {
        signatures: updatedSignatures,
        currentSignatures: updatedSignatures.length,
        updatedAt: new Date(),
      }

      if (readyToExecute) {
        updateData.status = 'ready_to_execute'
        updateData.readyAt = new Date()
      }

      await this.db.collection('contract_transactions').doc(transactionId).update(updateData)

      const updatedTxData = { ...txData, ...updateData }

      logger.info('Signature added successfully', {
        transactionId,
        currentSignatures: updatedSignatures.length,
        requiredSignatures: txData.requiredSignatures,
        readyToExecute,
      })

      return this.mapToTransactionStatus(updatedTxData)
    } catch (error) {
      logger.error('Error adding signature', {
        error: error instanceof Error ? error.message : String(error),
        transactionId,
      })

      if (error instanceof AppError) {
        throw error
      }

      throw new AppError(`Failed to add signature: ${error instanceof Error ? error.message : String(error)}`, 'SIGNATURE_ADDITION_FAILED')
    }
  }

  /**
   * Execute a Safe transaction once enough signatures are collected
   */
  async executeTransaction(transactionId: string): Promise<ExecutionResult> {
    try {
      logger.info('Executing Safe transaction', { transactionId })

      const txDoc = await this.db.collection('contract_transactions').doc(transactionId).get()

      if (!txDoc.exists) {
        throw new AppError('Transaction not found', 'TRANSACTION_NOT_FOUND')
      }

      const txData = txDoc.data()!

      if (txData.status !== 'ready_to_execute') {
        throw new AppError(`Transaction not ready for execution, status: ${txData.status}`, 'NOT_READY')
      }

      if (txData.signatures.length < txData.requiredSignatures) {
        throw new AppError('Insufficient signatures', 'INSUFFICIENT_SIGNATURES')
      }

      // Update status to executing
      await this.db.collection('contract_transactions').doc(transactionId).update({
        status: 'executing',
        updatedAt: new Date(),
      })

      // Execute the Safe transaction
      const executionTx = await executeSafeTransactionUtil(
        this.config.safeAddress,
        txData.safeTransaction as SafeTransaction,
        txData.signatures as SafeSignatureType[],
        this.signer
      )

      // Wait for confirmation
      const receipt = await executionTx.wait()
      if (!receipt) {
        throw new AppError('Transaction execution failed - no receipt', 'EXECUTION_FAILED')
      }

      const executionResult: ExecutionResult = {
        success: receipt.status === 1,
        transactionHash: executionTx.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        events: this.parseTransactionEvents(receipt),
      }

      // Update status
      const updateData = {
        status: executionResult.success ? 'completed' : 'failed',
        executedAt: new Date(),
        executionResult,
        updatedAt: new Date(),
      }

      if (!executionResult.success) {
        updateData.status = 'failed'
      }

      await this.db.collection('contract_transactions').doc(transactionId).update(updateData)

      logger.info('Transaction executed successfully', {
        transactionId,
        executionTxHash: executionTx.hash,
        success: executionResult.success,
      })

      return executionResult
    } catch (error) {
      logger.error('Error executing transaction', {
        error: error instanceof Error ? error.message : String(error),
        transactionId,
      })

      // Update status to failed
      try {
        await this.db
          .collection('contract_transactions')
          .doc(transactionId)
          .update({
            status: 'failed',
            executionResult: {
              success: false,
              transactionHash: '',
              error: error instanceof Error ? error.message : String(error),
            },
            updatedAt: new Date(),
          })
      } catch (updateError) {
        logger.error('Failed to update transaction status', { updateError })
      }

      if (error instanceof AppError) {
        throw error
      }

      throw new AppError(`Transaction execution failed: ${error instanceof Error ? error.message : String(error)}`, 'EXECUTION_FAILED')
    }
  }

  /**
   * Create a contract function call proposal
   */
  async proposeContractCall(
    call: ContractCall,
    description: string,
    createdBy: string,
    metadata?: Record<string, unknown>
  ): Promise<TransactionStatus> {
    try {
      logger.info('Creating contract call proposal', {
        contractAddress: call.contractAddress,
        functionName: call.functionName,
        description,
      })

      // Encode function call
      const contractInterface = new ethers.Interface(call.abi)
      const callData = contractInterface.encodeFunctionData(call.functionName, call.args)

      const proposal: TransactionProposal = {
        to: call.contractAddress,
        value: call.value || '0',
        data: callData,
        operation: 0, // CALL
        description,
        metadata: {
          ...metadata,
          functionName: call.functionName,
          args: call.args,
          contractAddress: call.contractAddress,
        },
      }

      return await this.proposeTransaction(proposal, createdBy)
    } catch (error) {
      logger.error('Error creating contract call proposal', {
        error: error instanceof Error ? error.message : String(error),
        call,
      })

      throw new AppError(
        `Failed to create contract call proposal: ${error instanceof Error ? error.message : String(error)}`,
        'CONTRACT_CALL_PROPOSAL_FAILED'
      )
    }
  }

  /**
   * Create a batch transaction proposal
   */
  async proposeBatchTransaction(batch: BatchTransactionRequest, createdBy: string): Promise<TransactionStatus> {
    try {
      logger.info('Creating batch transaction proposal', {
        transactionCount: batch.transactions.length,
        description: batch.description,
      })

      // Get MultiSend contract address
      const safeAddresses = getSafeAddresses(this.config.chainId)

      // Encode batch transaction data
      const batchData = this.encodeBatchTransaction(batch.transactions)

      const proposal: TransactionProposal = {
        to: safeAddresses.multiSend,
        value: '0',
        data: batchData,
        operation: 1, // DELEGATECALL for MultiSend
        description: batch.description,
        metadata: {
          ...batch.metadata,
          batchSize: batch.transactions.length,
          transactions: batch.transactions,
        },
      }

      return await this.proposeTransaction(proposal, createdBy)
    } catch (error) {
      logger.error('Error creating batch transaction proposal', {
        error: error instanceof Error ? error.message : String(error),
        batch,
      })

      throw new AppError(
        `Failed to create batch transaction proposal: ${error instanceof Error ? error.message : String(error)}`,
        'BATCH_PROPOSAL_FAILED'
      )
    }
  }

  /**
   * Get transaction status by ID
   */
  async getTransactionStatus(transactionId: string): Promise<TransactionStatus | null> {
    try {
      const txDoc = await this.db.collection('contract_transactions').doc(transactionId).get()

      if (!txDoc.exists) {
        return null
      }

      return this.mapToTransactionStatus(txDoc.data()!)
    } catch (error) {
      logger.error('Error getting transaction status', {
        error: error instanceof Error ? error.message : String(error),
        transactionId,
      })
      return null
    }
  }

  /**
   * List transactions with filtering and pagination
   */
  async listTransactions(
    options: {
      status?: string
      limit?: number
      offset?: number
      createdBy?: string
    } = {}
  ): Promise<{ transactions: TransactionStatus[]; total: number }> {
    try {
      let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = this.db
        .collection('contract_transactions')
        .where('chainId', '==', this.config.chainId)
        .where('safeAddress', '==', this.config.safeAddress)

      if (options.status) {
        query = query.where('status', '==', options.status)
      }

      if (options.createdBy) {
        query = query.where('createdBy', '==', options.createdBy)
      }

      // Get total count
      const countSnapshot = await query.count().get()
      const total = countSnapshot.data().count

      // Apply pagination and ordering
      query = query.orderBy('createdAt', 'desc')

      if (options.offset) {
        query = query.offset(options.offset)
      }

      if (options.limit) {
        query = query.limit(options.limit)
      }

      const snapshot = await query.get()
      const transactions = snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>) =>
        this.mapToTransactionStatus(doc.data())
      )

      return { transactions, total }
    } catch (error) {
      logger.error('Error listing transactions', {
        error: error instanceof Error ? error.message : String(error),
        options,
      })
      throw new AppError(
        `Failed to list transactions: ${error instanceof Error ? error.message : String(error)}`,
        'LIST_TRANSACTIONS_FAILED'
      )
    }
  }

  /**
   * Emergency pause functionality - creates an immediate pause transaction
   */
  async emergencyPause(contractAddress: string, createdBy: string, reason: string): Promise<TransactionStatus> {
    try {
      logger.warn('Emergency pause requested', {
        contractAddress,
        createdBy,
        reason,
      })

      // Encode pause function call
      const pauseInterface = new ethers.Interface(['function pause() external'])
      const pauseCallData = pauseInterface.encodeFunctionData('pause', [])

      const proposal: TransactionProposal = {
        to: contractAddress,
        value: '0',
        data: pauseCallData,
        operation: 0, // CALL
        description: `EMERGENCY PAUSE: ${reason}`,
        metadata: {
          emergency: true,
          reason,
          pausedContract: contractAddress,
          timestamp: new Date().toISOString(),
        },
      }

      const transaction = await this.proposeTransaction(proposal, createdBy)

      logger.warn('Emergency pause transaction created', {
        transactionId: transaction.id,
        contractAddress,
        reason,
      })

      return transaction
    } catch (error) {
      logger.error('Error creating emergency pause transaction', {
        error: error instanceof Error ? error.message : String(error),
        contractAddress,
        reason,
      })

      throw new AppError(
        `Failed to create emergency pause: ${error instanceof Error ? error.message : String(error)}`,
        'EMERGENCY_PAUSE_FAILED'
      )
    }
  }

  /**
   * Private helper methods
   */

  private encodeBatchTransaction(transactions: TransactionProposal[]): string {
    const multiSendInterface = new ethers.Interface(['function multiSend(bytes transactions) external'])

    // Encode each transaction
    let transactionsData = '0x'
    for (const tx of transactions) {
      // Pack transaction data according to MultiSend format
      // operation(1) + to(20) + value(32) + dataLength(32) + data(dynamic)
      const operation = ethers.zeroPadValue(ethers.toBeHex(tx.operation), 1)
      const to = ethers.zeroPadValue(tx.to, 20)
      const value = ethers.zeroPadValue(ethers.toBeHex(tx.value), 32)
      const dataLength = ethers.zeroPadValue(ethers.toBeHex(ethers.dataLength(tx.data)), 32)
      const data = tx.data

      transactionsData += operation.slice(2) + to.slice(2) + value.slice(2) + dataLength.slice(2) + data.slice(2)
    }

    return multiSendInterface.encodeFunctionData('multiSend', [transactionsData])
  }

  private parseTransactionEvents(
    receipt: ethers.TransactionReceipt
  ): Array<{ name: string; args: ReadonlyArray<unknown>; address: string }> {
    const events: Array<{ name: string; args: ReadonlyArray<unknown>; address: string }> = []

    try {
      // Parse PoolFactory events if applicable
      if (receipt.logs) {
        for (const log of receipt.logs) {
          try {
            // Try to parse with various contract interfaces
            const poolFactoryInterface = new ethers.Interface([
              'event PoolCreated(uint256 indexed poolId, address indexed poolAddress, address indexed poolOwner, string name, uint256 maxLoanAmount, uint256 interestRate, uint256 loanDuration)',
            ])

            const parsed = poolFactoryInterface.parseLog(log)
            if (parsed) {
              events.push({
                name: parsed.name,
                args: Array.from(parsed.args),
                address: log.address,
              })
            }
          } catch {
            // Ignore parsing errors for unknown events
          }
        }
      }
    } catch (error) {
      logger.warn('Error parsing transaction events', {
        error: error instanceof Error ? error.message : String(error),
      })
    }

    return events
  }

  private mapToTransactionStatus(data: Record<string, unknown>): TransactionStatus {
    const createdAt = data.createdAt as FirebaseFirestore.Timestamp | undefined
    const updatedAt = data.updatedAt as FirebaseFirestore.Timestamp | undefined
    const executedAt = data.executedAt as FirebaseFirestore.Timestamp | undefined

    return {
      id: String(data.id || ''),
      status:
        (data.status as string) === 'pending_signatures' ||
        (data.status as string) === 'ready_to_execute' ||
        (data.status as string) === 'executing' ||
        (data.status as string) === 'completed' ||
        (data.status as string) === 'failed' ||
        (data.status as string) === 'expired'
          ? (data.status as TransactionStatus['status'])
          : 'pending_signatures',
      safeTransaction: (data.safeTransaction as SafeTransaction) || { to: '', value: '0', data: '0x', operation: 0 },
      signatures: Array.isArray(data.signatures) ? (data.signatures as SafeSignature[]) : [],
      requiredSignatures: Number(data.requiredSignatures) || 0,
      currentSignatures: Number(data.currentSignatures) || 0,
      createdAt: createdAt ? createdAt.toDate() : new Date(),
      updatedAt: updatedAt ? updatedAt.toDate() : new Date(),
      executedAt: executedAt ? executedAt.toDate() : undefined,
      executionResult: data.executionResult as ExecutionResult | undefined,
      description: String(data.description || ''),
      metadata: data.metadata as Record<string, unknown> | undefined,
    }
  }
}

/**
 * Factory function to create ContractService instances
 */
export function createContractService(chainId: number): ContractService {
  const config = getContractServiceConfig(chainId)
  return new ContractService(config)
}

/**
 * Get configuration for ContractService based on chain ID
 */
function getContractServiceConfig(chainId: number): ContractServiceConfig {
  const rpcUrlKey = chainId === 80002 ? 'POLYGON_AMOY_RPC_URL' : 'POLYGON_MAINNET_RPC_URL'
  const safeAddressKey = chainId === 80002 ? 'SAFE_ADDRESS_AMOY' : 'SAFE_ADDRESS_POLYGON'
  const poolFactoryAddressKey = chainId === 80002 ? 'POOL_FACTORY_ADDRESS_AMOY' : 'POOL_FACTORY_ADDRESS_POLYGON'

  const rpcUrl = process.env[rpcUrlKey]
  const safeAddress = process.env[safeAddressKey]
  const poolFactoryAddress = process.env[poolFactoryAddressKey]
  const privateKey = process.env.PRIVATE_KEY

  if (!rpcUrl) {
    throw new AppError(`RPC URL not configured for chain ID ${chainId}`, 'RPC_URL_NOT_CONFIGURED')
  }

  if (!safeAddress) {
    throw new AppError(`Safe address not configured for chain ID ${chainId}`, 'SAFE_ADDRESS_NOT_CONFIGURED')
  }

  if (!poolFactoryAddress) {
    throw new AppError(`PoolFactory address not configured for chain ID ${chainId}`, 'POOL_FACTORY_ADDRESS_NOT_CONFIGURED')
  }

  if (!privateKey) {
    throw new AppError('Private key not configured', 'PRIVATE_KEY_NOT_CONFIGURED')
  }

  return {
    chainId,
    rpcUrl,
    safeAddress,
    privateKey,
    poolFactoryAddress,
  }
}
