import Safe from '@safe-global/protocol-kit'
import { MetaTransactionData } from '@safe-global/types-kit'
import * as dotenv from 'dotenv'
import { ethers, network } from 'hardhat'
import { PoolFactory } from '../typechain-types'

dotenv.config()

/**
 * Get signer private key for different environments
 */
function getSignerPrivateKey(networkName: string, signerAddress: string): string {
  if (networkName === 'localhost' || networkName === 'hardhat') {
    // Hardhat's deterministic accounts (safe for local development only)
    const hardhatAccounts: { [address: string]: string } = {
      '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266': '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      '0x70997970C51812dc3A010C7d01b50e0d17dc79C8': '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
      '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC': '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
    }

    const privateKey = hardhatAccounts[signerAddress]
    if (!privateKey) {
      // Fallback to first account if address not found
      return hardhatAccounts['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266']
    }
    return privateKey
  }

  // For testnet/mainnet, require environment variable
  const privateKey = process.env.PRIVATE_KEY
  if (!privateKey) {
    throw new Error(`PRIVATE_KEY environment variable required for ${networkName} network`)
  }
  return privateKey
}

interface OwnershipTransferConfig {
  poolFactoryAddress: string
  safeAddress: string
  executeImmediately?: boolean // Whether to execute the transaction immediately or just prepare it
}

interface TransferResult {
  step: 'initiated' | 'completed' | 'prepared'
  transactionHash?: string
  safeTransactionHash?: string
  currentOwner: string
  pendingOwner?: string
  newOwner?: string
  networkName: string
}

/**
 * Initiate ownership transfer from current owner to Safe wallet
 */
async function initiateOwnershipTransfer(config: OwnershipTransferConfig): Promise<TransferResult> {
  console.log('🔄 Initiating PoolFactory ownership transfer to Safe...')
  console.log('Configuration:')
  console.log('- PoolFactory:', config.poolFactoryAddress)
  console.log('- Safe:', config.safeAddress)
  console.log('- Network:', network.name)

  // Validate addresses
  if (!ethers.isAddress(config.poolFactoryAddress)) {
    throw new Error('Invalid PoolFactory address')
  }
  if (!ethers.isAddress(config.safeAddress)) {
    throw new Error('Invalid Safe address')
  }

  // Get the current signer (should be current owner)
  const [signer] = await ethers.getSigners()
  console.log('Current signer:', signer.address)

  // Connect to PoolFactory
  const poolFactory = (await ethers.getContractAt('PoolFactory', config.poolFactoryAddress)) as PoolFactory

  // Verify current ownership
  const currentOwner = await poolFactory.owner()
  console.log('Current PoolFactory owner:', currentOwner)

  if (currentOwner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`Signer ${signer.address} is not the current owner ${currentOwner}`)
  }

  // Check if there's already a pending transfer
  const ownershipStatus = await poolFactory.getOwnershipStatus()
  console.log('Current ownership status:')
  console.log('- Current owner:', ownershipStatus.currentOwner)
  console.log('- Pending owner:', ownershipStatus.pendingOwnerAddress)
  console.log('- Has pending transfer:', ownershipStatus.hasPendingTransfer)

  if (ownershipStatus.hasPendingTransfer) {
    console.log('⚠️  Warning: Pending ownership transfer already exists')
    if (ownershipStatus.pendingOwnerAddress.toLowerCase() === config.safeAddress.toLowerCase()) {
      console.log('✅ Pending transfer is to the correct Safe address')
      return {
        step: 'initiated',
        currentOwner: ownershipStatus.currentOwner,
        pendingOwner: ownershipStatus.pendingOwnerAddress,
        networkName: network.name,
      }
    } else {
      throw new Error(`Pending transfer is to wrong address: ${ownershipStatus.pendingOwnerAddress}`)
    }
  }

  try {
    // Initiate ownership transfer
    console.log('\n🚀 Initiating ownership transfer...')
    const transferTx = await poolFactory.transferOwnership(config.safeAddress)
    console.log('Transfer transaction hash:', transferTx.hash)

    // Wait for confirmation
    console.log('⏳ Waiting for transaction confirmation...')
    const receipt = await transferTx.wait()
    console.log('✅ Ownership transfer initiated in block:', receipt?.blockNumber)

    // Verify the transfer was initiated
    const newOwnershipStatus = await poolFactory.getOwnershipStatus()
    console.log('\nUpdated ownership status:')
    console.log('- Current owner:', newOwnershipStatus.currentOwner)
    console.log('- Pending owner:', newOwnershipStatus.pendingOwnerAddress)
    console.log('- Has pending transfer:', newOwnershipStatus.hasPendingTransfer)

    if (!newOwnershipStatus.hasPendingTransfer) {
      throw new Error('Ownership transfer was not initiated properly')
    }

    if (newOwnershipStatus.pendingOwnerAddress.toLowerCase() !== config.safeAddress.toLowerCase()) {
      throw new Error(`Pending owner mismatch: expected ${config.safeAddress}, got ${newOwnershipStatus.pendingOwnerAddress}`)
    }

    console.log('✅ Ownership transfer successfully initiated!')

    return {
      step: 'initiated',
      transactionHash: transferTx.hash,
      currentOwner: newOwnershipStatus.currentOwner,
      pendingOwner: newOwnershipStatus.pendingOwnerAddress,
      networkName: network.name,
    }
  } catch (error) {
    console.error('❌ Failed to initiate ownership transfer:', error)
    throw error
  }
}

/**
 * Complete ownership transfer by accepting ownership from Safe wallet
 */
async function completeOwnershipTransfer(config: OwnershipTransferConfig): Promise<TransferResult> {
  console.log('✅ Completing PoolFactory ownership transfer from Safe...')
  console.log('Configuration:')
  console.log('- PoolFactory:', config.poolFactoryAddress)
  console.log('- Safe:', config.safeAddress)
  console.log('- Network:', network.name)

  // Get the current signer (for Safe operations)
  const [signer] = await ethers.getSigners()
  console.log('Signer address:', signer.address)

  // Connect to PoolFactory
  const poolFactory = (await ethers.getContractAt('PoolFactory', config.poolFactoryAddress)) as PoolFactory

  // Verify current ownership status
  const ownershipStatus = await poolFactory.getOwnershipStatus()
  console.log('Current ownership status:')
  console.log('- Current owner:', ownershipStatus.currentOwner)
  console.log('- Pending owner:', ownershipStatus.pendingOwnerAddress)
  console.log('- Has pending transfer:', ownershipStatus.hasPendingTransfer)

  if (!ownershipStatus.hasPendingTransfer) {
    throw new Error('No pending ownership transfer found')
  }

  if (ownershipStatus.pendingOwnerAddress.toLowerCase() !== config.safeAddress.toLowerCase()) {
    throw new Error(`Pending owner mismatch: expected ${config.safeAddress}, got ${ownershipStatus.pendingOwnerAddress}`)
  }

  try {
    // Initialize Safe SDK
    console.log('\n🛡️  Initializing Safe SDK...')

    // Get RPC URL for the current network
    let rpcUrl: string
    if (network.name === 'localhost' || network.name === 'hardhat') {
      rpcUrl = 'http://127.0.0.1:8545'
    } else if (network.name === 'polygonAmoy') {
      rpcUrl = process.env.POLYGON_AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology/'
    } else if (network.name === 'polygon') {
      rpcUrl = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'
    } else {
      throw new Error(`Unsupported network: ${network.name}`)
    }

    const safeSdk = await Safe.init({
      provider: rpcUrl,
      signer: getSignerPrivateKey(network.name, signer.address),
      safeAddress: config.safeAddress,
    })

    console.log('Safe address:', await safeSdk.getAddress())
    console.log('Safe owners:', await safeSdk.getOwners())
    console.log('Safe threshold:', await safeSdk.getThreshold())

    // Prepare the acceptOwnership transaction
    console.log('\n📝 Preparing acceptOwnership transaction...')
    const acceptOwnershipData = ethers.id('acceptOwnership()').slice(0, 10)

    const safeTransaction: MetaTransactionData = {
      to: config.poolFactoryAddress,
      data: acceptOwnershipData,
      value: '0',
    }

    console.log('Transaction data:', safeTransaction)

    // Create Safe transaction
    const safeTransactionData = await safeSdk.createTransaction({
      transactions: [safeTransaction],
    })

    console.log('Safe transaction created')
    const safeTxHash = await safeSdk.getTransactionHash(safeTransactionData)
    console.log('Safe transaction hash:', safeTxHash)

    if (config.executeImmediately) {
      // Sign and execute the transaction
      console.log('\n🔐 Signing Safe transaction...')
      const signedSafeTransaction = await safeSdk.signTransaction(safeTransactionData)
      console.log('Transaction signed')

      // Check if we have enough signatures to execute
      const threshold = await safeSdk.getThreshold()
      const signatures = signedSafeTransaction.signatures
      const signatureCount = signatures ? Object.keys(signatures).length : 0

      console.log(`Signatures: ${signatureCount}/${threshold}`)

      if (signatureCount >= threshold) {
        console.log('\n🚀 Executing Safe transaction...')
        const executeTxResponse = await safeSdk.executeTransaction(signedSafeTransaction)
        console.log('Execution transaction hash:', executeTxResponse.hash)

        // Wait for confirmation
        console.log('⏳ Waiting for transaction confirmation...')
        let receipt
        if (executeTxResponse.transactionResponse && typeof (executeTxResponse.transactionResponse as any).wait === 'function') {
          receipt = await (executeTxResponse.transactionResponse as any).wait()
        }
        console.log('✅ Transaction confirmed in block:', receipt?.blockNumber)

        // Verify ownership transfer completion
        const finalOwnershipStatus = await poolFactory.getOwnershipStatus()
        console.log('\nFinal ownership status:')
        console.log('- Current owner:', finalOwnershipStatus.currentOwner)
        console.log('- Pending owner:', finalOwnershipStatus.pendingOwnerAddress)
        console.log('- Has pending transfer:', finalOwnershipStatus.hasPendingTransfer)

        if (finalOwnershipStatus.currentOwner.toLowerCase() !== config.safeAddress.toLowerCase()) {
          throw new Error('Ownership transfer was not completed properly')
        }

        if (finalOwnershipStatus.hasPendingTransfer) {
          throw new Error('Pending transfer should be cleared after completion')
        }

        console.log('🎉 Ownership transfer completed successfully!')

        return {
          step: 'completed',
          transactionHash: executeTxResponse.hash,
          safeTransactionHash: safeTxHash,
          currentOwner: finalOwnershipStatus.currentOwner,
          newOwner: finalOwnershipStatus.currentOwner,
          networkName: network.name,
        }
      } else {
        console.log('⚠️  Not enough signatures to execute. Transaction prepared for additional signatures.')
        return {
          step: 'prepared',
          safeTransactionHash: safeTxHash,
          currentOwner: ownershipStatus.currentOwner,
          pendingOwner: ownershipStatus.pendingOwnerAddress,
          networkName: network.name,
        }
      }
    } else {
      console.log('✅ Transaction prepared. Use Safe interface to collect signatures and execute.')
      return {
        step: 'prepared',
        safeTransactionHash: safeTxHash,
        currentOwner: ownershipStatus.currentOwner,
        pendingOwner: ownershipStatus.pendingOwnerAddress,
        networkName: network.name,
      }
    }
  } catch (error) {
    console.error('❌ Failed to complete ownership transfer:', error)
    throw error
  }
}

/**
 * Verify ownership transfer status
 */
async function verifyOwnershipStatus(poolFactoryAddress: string, expectedSafeAddress?: string): Promise<void> {
  console.log('🔍 Verifying PoolFactory ownership status...')

  if (!ethers.isAddress(poolFactoryAddress)) {
    throw new Error('Invalid PoolFactory address')
  }

  const poolFactory = (await ethers.getContractAt('PoolFactory', poolFactoryAddress)) as PoolFactory

  const ownershipStatus = await poolFactory.getOwnershipStatus()
  console.log('\nOwnership Status:')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Current Owner: ${ownershipStatus.currentOwner}`)
  console.log(`Pending Owner: ${ownershipStatus.pendingOwnerAddress || 'None'}`)
  console.log(`Has Pending Transfer: ${ownershipStatus.hasPendingTransfer}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  if (expectedSafeAddress) {
    if (!ethers.isAddress(expectedSafeAddress)) {
      throw new Error('Invalid expected Safe address')
    }

    const isOwnedBySafe = ownershipStatus.currentOwner.toLowerCase() === expectedSafeAddress.toLowerCase()
    const isPendingToSafe = ownershipStatus.pendingOwnerAddress.toLowerCase() === expectedSafeAddress.toLowerCase()

    console.log('\nSafe Ownership Verification:')
    console.log(`Expected Safe: ${expectedSafeAddress}`)
    console.log(`Owned by Safe: ${isOwnedBySafe ? '✅ Yes' : '❌ No'}`)
    console.log(`Pending to Safe: ${isPendingToSafe ? '✅ Yes' : '❌ No'}`)

    if (isOwnedBySafe) {
      console.log('🎉 PoolFactory is successfully owned by the Safe!')
    } else if (isPendingToSafe) {
      console.log('⏳ Ownership transfer to Safe is pending completion')
    } else {
      console.log('⚠️  PoolFactory is not owned or pending to the expected Safe')
    }
  }

  // Additional contract info
  console.log('\nContract Information:')
  console.log(`Version: ${await poolFactory.version()}`)
  console.log(`Paused: ${await poolFactory.paused()}`)
  console.log(`Pool Count: ${await poolFactory.getPoolCount()}`)
}

/**
 * Emergency ownership rollback (if something goes wrong)
 */
async function emergencyRollback(poolFactoryAddress: string): Promise<void> {
  console.log('🚨 Emergency ownership rollback...')

  const [signer] = await ethers.getSigners()
  const poolFactory = (await ethers.getContractAt('PoolFactory', poolFactoryAddress)) as PoolFactory

  const ownershipStatus = await poolFactory.getOwnershipStatus()

  if (!ownershipStatus.hasPendingTransfer) {
    console.log('ℹ️  No pending transfer to rollback')
    return
  }

  // Only current owner can renounce/rollback
  if (ownershipStatus.currentOwner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error('Only current owner can perform emergency rollback')
  }

  console.log('⚠️  WARNING: This will cancel the pending ownership transfer!')
  console.log(`Current owner: ${ownershipStatus.currentOwner}`)
  console.log(`Pending owner: ${ownershipStatus.pendingOwnerAddress}`)

  // Note: OpenZeppelin Ownable2Step doesn't have a direct "cancel" function
  // The pending transfer will expire naturally or the current owner could transfer to themselves
  console.log('💡 To rollback: Call transferOwnership to current owner or wait for natural expiry')
}

async function main() {
  console.log('🔄 PoolFactory Ownership Transfer Script')
  console.log('======================================')

  // Parse command line arguments
  const args = process.argv.slice(2)
  const command = args[0]

  if (!command) {
    console.log('Usage:')
    console.log('  pnpm transfer-ownership initiate <poolFactoryAddress> <safeAddress>')
    console.log('  pnpm transfer-ownership complete <poolFactoryAddress> <safeAddress> [--execute]')
    console.log('  pnpm transfer-ownership verify <poolFactoryAddress> [safeAddress]')
    console.log('  pnpm transfer-ownership rollback <poolFactoryAddress>')
    process.exit(1)
  }

  try {
    switch (command) {
      case 'initiate': {
        const poolFactoryAddress = args[1]
        const safeAddress = args[2]

        if (!poolFactoryAddress || !safeAddress) {
          throw new Error('Both poolFactoryAddress and safeAddress are required')
        }

        const result = await initiateOwnershipTransfer({
          poolFactoryAddress,
          safeAddress,
        })

        console.log('\n📋 Transfer Initiated:')
        console.log(JSON.stringify(result, null, 2))
        break
      }

      case 'complete': {
        const poolFactoryAddress = args[1]
        const safeAddress = args[2]
        const executeImmediately = args.includes('--execute')

        if (!poolFactoryAddress || !safeAddress) {
          throw new Error('Both poolFactoryAddress and safeAddress are required')
        }

        const result = await completeOwnershipTransfer({
          poolFactoryAddress,
          safeAddress,
          executeImmediately,
        })

        console.log('\n📋 Transfer Result:')
        console.log(JSON.stringify(result, null, 2))
        break
      }

      case 'verify': {
        const poolFactoryAddress = args[1]
        const expectedSafeAddress = args[2]

        if (!poolFactoryAddress) {
          throw new Error('poolFactoryAddress is required')
        }

        await verifyOwnershipStatus(poolFactoryAddress, expectedSafeAddress)
        break
      }

      case 'rollback': {
        const poolFactoryAddress = args[1]

        if (!poolFactoryAddress) {
          throw new Error('poolFactoryAddress is required')
        }

        await emergencyRollback(poolFactoryAddress)
        break
      }

      default:
        throw new Error(`Unknown command: ${command}`)
    }
  } catch (error) {
    console.error('❌ Script execution failed:', error)
    process.exit(1)
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}

// Export functions for use in other scripts
export {
  completeOwnershipTransfer,
  emergencyRollback,
  initiateOwnershipTransfer,
  OwnershipTransferConfig,
  TransferResult,
  verifyOwnershipStatus,
}
