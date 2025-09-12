import { ethers } from 'ethers'
import { logger } from 'firebase-functions'
import { AppError } from './errorHandling'

// Safe contract ABIs (minimal required functions)
export const SAFE_ABI = [
  'function execTransaction(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes calldata signatures) external payable returns (bool success)',
  'function getThreshold() external view returns (uint256)',
  'function getOwners() external view returns (address[] memory)',
  'function approveTransaction(bytes32 _txHash) external',
  'function getTransactionHash(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 _nonce) external view returns (bytes32)',
  'function nonce() external view returns (uint256)',
  'function isOwner(address owner) external view returns (bool)',
] as const

export const SAFE_FACTORY_ABI = [
  'function createProxyWithNonce(address _singleton, bytes memory initializer, uint256 saltNonce) external returns (address)',
  'function proxyCreationCode() external pure returns (bytes memory)',
  'function calculateCreateProxyWithNonceAddress(address _singleton, bytes calldata initializer, uint256 saltNonce, address deployer) external view returns (address)',
] as const

export interface SafeTransaction {
  to: string
  value: string
  data: string
  operation: number // 0 for call, 1 for delegatecall
  safeTxGas: string
  baseGas: string
  gasPrice: string
  gasToken: string
  refundReceiver: string
  nonce: number
}

export interface SafeSignature {
  signer: string
  data: string
}

/**
 * Get Safe contract addresses for different chains
 */
export function getSafeAddresses(chainId: number) {
  const addresses = {
    80002: {
      // Polygon Amoy
      singleton: '0x3E5c63644E683549055b9Be8653de26E0B4CD36E',
      factory: '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2',
      multiSend: '0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761',
    },
    137: {
      // Polygon Mainnet
      singleton: '0x3E5c63644E683549055b9Be8653de26E0B4CD36E',
      factory: '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2',
      multiSend: '0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761',
    },
  }

  const chainAddresses = addresses[chainId as keyof typeof addresses]
  if (!chainAddresses) {
    throw new AppError(`Safe contracts not available for chain ID ${chainId}`, 'SAFE_NOT_SUPPORTED')
  }

  return chainAddresses
}

/**
 * Create a new Safe multi-sig wallet
 */
export async function deploySafe(
  provider: ethers.Provider,
  signer: ethers.Signer,
  owners: string[],
  threshold: number,
  chainId: number,
  saltNonce: number = 0
): Promise<string> {
  try {
    logger.info('Deploying Safe multi-sig wallet', {
      owners,
      threshold,
      chainId,
      saltNonce,
    })

    const addresses = getSafeAddresses(chainId)

    // Create Safe factory contract
    const safeFactory = new ethers.Contract(addresses.factory, SAFE_FACTORY_ABI, signer)

    // Prepare Safe setup data
    const safeSetupData = new ethers.Interface([
      'function setup(address[] calldata _owners, uint256 _threshold, address to, bytes calldata data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver) external',
    ]).encodeFunctionData('setup', [
      owners,
      threshold,
      ethers.ZeroAddress, // to
      '0x', // data
      ethers.ZeroAddress, // fallbackHandler
      ethers.ZeroAddress, // paymentToken
      0, // payment
      ethers.ZeroAddress, // paymentReceiver
    ])

    // Calculate predicted Safe address
    const predictedAddress = await safeFactory.calculateCreateProxyWithNonceAddress(
      addresses.singleton,
      safeSetupData,
      saltNonce,
      await signer.getAddress()
    )

    // Deploy Safe
    const tx = await safeFactory.createProxyWithNonce(addresses.singleton, safeSetupData, saltNonce)

    const receipt = await tx.wait()

    if (!receipt) {
      throw new AppError('Safe deployment transaction failed', 'SAFE_DEPLOYMENT_FAILED')
    }

    logger.info('Safe deployed successfully', {
      safeAddress: predictedAddress,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
    })

    return predictedAddress
  } catch (error) {
    logger.error('Error deploying Safe', {
      error: error instanceof Error ? error.message : String(error),
      owners,
      threshold,
      chainId,
    })

    if (error instanceof AppError) {
      throw error
    }

    throw new AppError(`Failed to deploy Safe: ${error instanceof Error ? error.message : String(error)}`, 'SAFE_DEPLOYMENT_FAILED')
  }
}

/**
 * Get Safe contract instance
 */
export function getSafeContract(safeAddress: string, provider: ethers.Provider): ethers.Contract {
  return new ethers.Contract(safeAddress, SAFE_ABI, provider)
}

/**
 * Check if address is a Safe owner
 */
export async function isSafeOwner(safeAddress: string, ownerAddress: string, provider: ethers.Provider): Promise<boolean> {
  try {
    const safe = getSafeContract(safeAddress, provider)
    return await safe.isOwner(ownerAddress)
  } catch (error) {
    logger.error('Error checking Safe ownership', {
      safeAddress,
      ownerAddress,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

/**
 * Get Safe threshold
 */
export async function getSafeThreshold(safeAddress: string, provider: ethers.Provider): Promise<number> {
  try {
    const safe = getSafeContract(safeAddress, provider)
    const threshold = await safe.getThreshold()
    return Number(threshold)
  } catch (error) {
    logger.error('Error getting Safe threshold', {
      safeAddress,
      error: error instanceof Error ? error.message : String(error),
    })
    throw new AppError(`Failed to get Safe threshold: ${error instanceof Error ? error.message : String(error)}`, 'SAFE_THRESHOLD_ERROR')
  }
}

/**
 * Get Safe owners
 */
export async function getSafeOwners(safeAddress: string, provider: ethers.Provider): Promise<string[]> {
  try {
    const safe = getSafeContract(safeAddress, provider)
    return await safe.getOwners()
  } catch (error) {
    logger.error('Error getting Safe owners', {
      safeAddress,
      error: error instanceof Error ? error.message : String(error),
    })
    throw new AppError(`Failed to get Safe owners: ${error instanceof Error ? error.message : String(error)}`, 'SAFE_OWNERS_ERROR')
  }
}

/**
 * Create transaction hash for Safe transaction
 */
export async function createSafeTransactionHash(
  safeAddress: string,
  transaction: SafeTransaction,
  provider: ethers.Provider
): Promise<string> {
  try {
    const safe = getSafeContract(safeAddress, provider)

    const txHash = await safe.getTransactionHash(
      transaction.to,
      transaction.value,
      transaction.data,
      transaction.operation,
      transaction.safeTxGas,
      transaction.baseGas,
      transaction.gasPrice,
      transaction.gasToken,
      transaction.refundReceiver,
      transaction.nonce
    )

    return txHash
  } catch (error) {
    logger.error('Error creating Safe transaction hash', {
      safeAddress,
      transaction,
      error: error instanceof Error ? error.message : String(error),
    })

    throw new AppError(`Failed to create transaction hash: ${error instanceof Error ? error.message : String(error)}`, 'SAFE_HASH_ERROR')
  }
}

/**
 * Sign Safe transaction
 */
export async function signSafeTransaction(transactionHash: string, signer: ethers.Signer): Promise<SafeSignature> {
  try {
    const signerAddress = await signer.getAddress()
    const signature = await signer.signMessage(ethers.getBytes(transactionHash))

    logger.info('Safe transaction signed', {
      signer: signerAddress,
      transactionHash,
    })

    return {
      signer: signerAddress,
      data: signature,
    }
  } catch (error) {
    logger.error('Error signing Safe transaction', {
      transactionHash,
      error: error instanceof Error ? error.message : String(error),
    })

    throw new AppError(`Failed to sign transaction: ${error instanceof Error ? error.message : String(error)}`, 'SAFE_SIGNATURE_ERROR')
  }
}

/**
 * Execute Safe transaction with signatures
 */
export async function executeSafeTransaction(
  safeAddress: string,
  transaction: SafeTransaction,
  signatures: SafeSignature[],
  signer: ethers.Signer
): Promise<ethers.TransactionResponse> {
  try {
    logger.info('Executing Safe transaction', {
      safeAddress,
      transaction,
      signatureCount: signatures.length,
    })

    const safe = new ethers.Contract(safeAddress, SAFE_ABI, signer)

    // Combine signatures (sorted by signer address)
    const sortedSignatures = signatures
      .sort((a, b) => a.signer.toLowerCase().localeCompare(b.signer.toLowerCase()))
      .map((sig) => sig.data)
      .join('')

    const tx = await safe.execTransaction(
      transaction.to,
      transaction.value,
      transaction.data,
      transaction.operation,
      transaction.safeTxGas,
      transaction.baseGas,
      transaction.gasPrice,
      transaction.gasToken,
      transaction.refundReceiver,
      '0x' + sortedSignatures
    )

    logger.info('Safe transaction executed', {
      safeAddress,
      txHash: tx.hash,
    })

    return tx
  } catch (error) {
    logger.error('Error executing Safe transaction', {
      safeAddress,
      transaction,
      error: error instanceof Error ? error.message : String(error),
    })

    throw new AppError(
      `Failed to execute Safe transaction: ${error instanceof Error ? error.message : String(error)}`,
      'SAFE_EXECUTION_ERROR'
    )
  }
}

/**
 * Get current Safe nonce
 */
export async function getSafeNonce(safeAddress: string, provider: ethers.Provider): Promise<number> {
  try {
    const safe = getSafeContract(safeAddress, provider)
    const nonce = await safe.nonce()
    return Number(nonce)
  } catch (error) {
    logger.error('Error getting Safe nonce', {
      safeAddress,
      error: error instanceof Error ? error.message : String(error),
    })

    throw new AppError(`Failed to get Safe nonce: ${error instanceof Error ? error.message : String(error)}`, 'SAFE_NONCE_ERROR')
  }
}

/**
 * Prepare Safe transaction for pool creation
 */
export async function prepareSafePoolCreationTransaction(
  poolFactoryAddress: string,
  poolParams: {
    poolOwner: string
    maxLoanAmount: string
    interestRate: number
    loanDuration: number
    name: string
    description: string
  },
  safeAddress: string,
  provider: ethers.Provider
): Promise<SafeTransaction> {
  try {
    // Encode pool creation call data
    const poolFactoryInterface = new ethers.Interface([
      'function createPool(tuple(address poolOwner, uint256 maxLoanAmount, uint256 interestRate, uint256 loanDuration, string name, string description) poolParams) external returns (uint256 poolId, address poolAddress)',
    ])

    const callData = poolFactoryInterface.encodeFunctionData('createPool', [poolParams])

    // Get Safe nonce
    const nonce = await getSafeNonce(safeAddress, provider)

    const transaction: SafeTransaction = {
      to: poolFactoryAddress,
      value: '0',
      data: callData,
      operation: 0, // CALL
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '0',
      gasToken: ethers.ZeroAddress,
      refundReceiver: ethers.ZeroAddress,
      nonce,
    }

    logger.info('Safe pool creation transaction prepared', {
      safeAddress,
      poolFactoryAddress,
      nonce,
      poolParams: { ...poolParams, poolOwner: '***' },
    })

    return transaction
  } catch (error) {
    logger.error('Error preparing Safe pool creation transaction', {
      safeAddress,
      poolFactoryAddress,
      error: error instanceof Error ? error.message : String(error),
    })

    throw new AppError(
      `Failed to prepare Safe transaction: ${error instanceof Error ? error.message : String(error)}`,
      'SAFE_TRANSACTION_PREP_ERROR'
    )
  }
}
