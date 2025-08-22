import { ethers } from 'ethers'
import { logger } from 'firebase-functions'
import { AppError } from './errorHandling'

export interface TransactionOptions {
  gasLimit?: bigint
  gasPrice?: bigint
  maxFeePerGas?: bigint
  maxPriorityFeePerGas?: bigint
  value?: bigint
}

/**
 * Estimate gas for a contract function call
 */
export async function estimateGas(
  contract: ethers.Contract,
  functionName: string,
  args: any[],
  overrides: any = {}
): Promise<bigint> {
  try {
    logger.info('Estimating gas', { functionName, contractAddress: contract.target })
    
    const gasEstimate = await contract[functionName].estimateGas(...args, overrides)
    
    // Add 20% buffer to gas estimate for safety
    const gasWithBuffer = (gasEstimate * BigInt(120)) / BigInt(100)
    
    logger.info('Gas estimation completed', {
      functionName,
      originalEstimate: gasEstimate.toString(),
      estimateWithBuffer: gasWithBuffer.toString()
    })
    
    return gasWithBuffer
  } catch (error) {
    logger.error('Gas estimation failed', {
      functionName,
      error: error instanceof Error ? error.message : String(error)
    })
    
    throw new AppError(
      `Gas estimation failed for ${functionName}: ${error instanceof Error ? error.message : String(error)}`,
      'GAS_ESTIMATION_FAILED'
    )
  }
}

/**
 * Execute a contract transaction with proper error handling and logging
 */
export async function executeTransaction(
  contract: ethers.Contract,
  functionName: string,
  args: any[],
  options: TransactionOptions = {}
): Promise<ethers.ContractTransactionResponse> {
  try {
    logger.info('Executing transaction', {
      functionName,
      contractAddress: contract.target,
      gasLimit: options.gasLimit?.toString(),
      gasPrice: options.gasPrice?.toString()
    })
    
    // Execute the transaction
    const tx = await contract[functionName](...args, options)
    
    logger.info('Transaction submitted', {
      functionName,
      txHash: tx.hash,
      gasLimit: options.gasLimit?.toString()
    })
    
    return tx
  } catch (error) {
    logger.error('Transaction execution failed', {
      functionName,
      error: error instanceof Error ? error.message : String(error)
    })
    
    // Parse common error types
    if (error instanceof Error) {
      if (error.message.includes('insufficient funds')) {
        throw new AppError('Insufficient funds for transaction', 'INSUFFICIENT_FUNDS')
      }
      
      if (error.message.includes('nonce too low')) {
        throw new AppError('Transaction nonce too low', 'NONCE_TOO_LOW')
      }
      
      if (error.message.includes('replacement transaction underpriced')) {
        throw new AppError('Replacement transaction underpriced', 'UNDERPRICED_TRANSACTION')
      }
      
      if (error.message.includes('execution reverted')) {
        throw new AppError('Transaction reverted', 'TRANSACTION_REVERTED')
      }
    }
    
    throw new AppError(
      `Transaction execution failed for ${functionName}: ${error instanceof Error ? error.message : String(error)}`,
      'TRANSACTION_EXECUTION_FAILED'
    )
  }
}

/**
 * Wait for transaction confirmation with timeout
 */
export async function waitForConfirmation(
  provider: ethers.Provider,
  txHash: string,
  confirmations: number = 1,
  timeoutMs: number = 300000 // 5 minutes
): Promise<ethers.TransactionReceipt> {
  try {
    logger.info('Waiting for transaction confirmation', {
      txHash,
      confirmations,
      timeoutMs
    })
    
    const receipt = await provider.waitForTransaction(txHash, confirmations, timeoutMs)
    
    if (!receipt) {
      throw new AppError('Transaction receipt not found', 'RECEIPT_NOT_FOUND')
    }
    
    if (receipt.status === 0) {
      throw new AppError('Transaction failed', 'TRANSACTION_FAILED')
    }
    
    logger.info('Transaction confirmed', {
      txHash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString()
    })
    
    return receipt
  } catch (error) {
    logger.error('Transaction confirmation failed', {
      txHash,
      error: error instanceof Error ? error.message : String(error)
    })
    
    if (error instanceof AppError) {
      throw error
    }
    
    throw new AppError(
      `Transaction confirmation failed: ${error instanceof Error ? error.message : String(error)}`,
      'CONFIRMATION_FAILED'
    )
  }
}

/**
 * Get current gas price with fallback
 */
export async function getGasPrice(provider: ethers.Provider): Promise<bigint> {
  try {
    const feeData = await provider.getFeeData()
    
    // Prefer EIP-1559 gas pricing if available
    if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
      return feeData.maxFeePerGas
    }
    
    // Fallback to legacy gas pricing
    if (feeData.gasPrice) {
      return feeData.gasPrice
    }
    
    throw new Error('No gas price data available')
  } catch (error) {
    logger.error('Failed to get gas price', {
      error: error instanceof Error ? error.message : String(error)
    })
    
    // Fallback to a reasonable default (20 gwei)
    return ethers.parseUnits('20', 'gwei')
  }
}

/**
 * Check if transaction is mined
 */
export async function isTransactionMined(
  provider: ethers.Provider,
  txHash: string
): Promise<boolean> {
  try {
    const receipt = await provider.getTransactionReceipt(txHash)
    return receipt !== null
  } catch (error) {
    logger.error('Error checking transaction status', {
      txHash,
      error: error instanceof Error ? error.message : String(error)
    })
    return false
  }
}

/**
 * Get transaction status
 */
export async function getTransactionStatus(
  provider: ethers.Provider,
  txHash: string
): Promise<'pending' | 'success' | 'failed' | 'not_found'> {
  try {
    const receipt = await provider.getTransactionReceipt(txHash)
    
    if (!receipt) {
      return 'pending'
    }
    
    return receipt.status === 1 ? 'success' : 'failed'
  } catch (error) {
    logger.error('Error getting transaction status', {
      txHash,
      error: error instanceof Error ? error.message : String(error)
    })
    return 'not_found'
  }
}

/**
 * Parse contract event logs
 */
export function parseEventLogs(
  contract: ethers.Contract,
  logs: ethers.Log[],
  eventName: string
): ethers.LogDescription[] {
  const parsedEvents: ethers.LogDescription[] = []
  
  for (const log of logs) {
    try {
      const parsed = contract.interface.parseLog(log)
      if (parsed && parsed.name === eventName) {
        parsedEvents.push(parsed)
      }
    } catch {
      // Ignore logs that can't be parsed by this contract
      continue
    }
  }
  
  return parsedEvents
}

/**
 * Validate contract address
 */
export async function validateContractAddress(
  provider: ethers.Provider,
  address: string
): Promise<boolean> {
  try {
    if (!ethers.isAddress(address)) {
      return false
    }
    
    const code = await provider.getCode(address)
    return code !== '0x'
  } catch (error) {
    logger.error('Error validating contract address', {
      address,
      error: error instanceof Error ? error.message : String(error)
    })
    return false
  }
}