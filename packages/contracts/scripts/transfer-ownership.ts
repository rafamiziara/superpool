import { isMain } from './lib/main'
import { isLocalNetwork } from './lib/verification'
import { safeContractNetworks, safeRpcUrl } from './lib/safe'
import { signerKeyFor } from './lib/accounts'
import { ethers, network } from '../hardhat.connection'
import Safe from '@safe-global/protocol-kit'
import { MetaTransactionData, SafeTransaction } from '@safe-global/types-kit'
import * as dotenv from 'dotenv'
import { PoolFactory } from '../typechain-types'

dotenv.config()

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
 * Sign the Safe transaction, and locally keep signing until the threshold is met.
 *
 * On a public network there is one key. It signs, and if the Safe needs a second
 * signature that second signature belongs to another person — so the script
 * stops, reports the hash, and the co-signers do their part in the Safe UI.
 * That is the real workflow and this does not try to automate it.
 *
 * On a local node every Safe owner is a Hardhat account whose key is derivable,
 * so the threshold can genuinely be reached. That is the whole difference
 * between rehearsing this step and merely preparing it: the accepting half of
 * `Ownable2Step` only actually runs when the Safe executes.
 *
 * The executor is returned alongside because it has to be one of the SDK
 * instances that signed — `executeTransaction` sends from its own signer, and
 * the caller's default signer is not necessarily an owner at all.
 */
async function collectSignatures(
  safeSdk: Safe,
  transaction: SafeTransaction,
  threshold: number
): Promise<{ transaction: SafeTransaction; executor: Safe }> {
  const owners = await safeSdk.getOwners()
  const signerAddress = await (await safeSdk.getSafeProvider()).getSignerAddress()
  const isOwner = owners.some((owner) => owner.toLowerCase() === signerAddress?.toLowerCase())

  // A non-owner's signature is worth nothing, and on a local node the owners
  // are test accounts — so sign as one of them rather than failing.
  let executor = isOwner || !isLocalNetwork() ? safeSdk : await safeSdk.connect({ signer: signerKeyFor(owners[0]) })
  let signed = await executor.signTransaction(transaction)

  if (!isLocalNetwork()) return { transaction: signed, executor }

  for (const owner of owners) {
    if (signed.signatures.size >= threshold) break
    if (signed.signatures.has(owner.toLowerCase())) continue

    const asOwner = await safeSdk.connect({ signer: signerKeyFor(owner) })
    signed = await asOwner.signTransaction(signed)
    executor = asOwner
  }

  return { transaction: signed, executor }
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

    const contractNetworks = await safeContractNetworks()

    const safeSdk = await Safe.init({
      provider: safeRpcUrl(),
      signer: signerKeyFor(signer.address),
      safeAddress: config.safeAddress,
      contractNetworks,
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
      const threshold = await safeSdk.getThreshold()
      const { transaction: signedSafeTransaction, executor } = await collectSignatures(safeSdk, safeTransactionData, threshold)
      console.log('Transaction signed')

      // `signatures` is a Map. `Object.keys(map).length` — which this read
      // before — is 0 for every Map there has ever been, so the count never
      // reached the threshold and the branch below was unreachable even on a
      // 1-of-1 Safe.
      const signatureCount = signedSafeTransaction.signatures.size

      console.log(`Signatures: ${signatureCount}/${threshold}`)

      if (signatureCount >= threshold) {
        console.log('\n🚀 Executing Safe transaction...')
        const executeTxResponse = await executor.executeTransaction(signedSafeTransaction)
        console.log('Execution transaction hash:', executeTxResponse.hash)

        // Wait for confirmation
        console.log('⏳ Waiting for transaction confirmation...')
        let receipt: { blockNumber?: number } | null | undefined
        if (
          executeTxResponse.transactionResponse &&
          typeof (executeTxResponse.transactionResponse as { wait?: () => Promise<unknown> }).wait === 'function'
        ) {
          receipt = await (executeTxResponse.transactionResponse as { wait: () => Promise<{ blockNumber?: number } | null> }).wait()
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

  /*
   * Arguments come from the environment, not from `process.argv` — the same
   * correction `simulate-multisig.ts` carries, for the same reason.
   *
   * `hardhat run` does not forward positional arguments. `process.argv.slice(2)`
   * is *Hardhat's* command line, so `args[0]` was the literal string `run` and
   * every one of these commands exited on `Unknown command: run`. That includes
   * `pnpm transfer:ownership:amoy`, which is a step on the Amoy checklist: the
   * script for the least reversible action in the project could not be started.
   */
  const command = process.env.TRANSFER
  const poolFactoryAddress = process.env.POOL_FACTORY_ADDRESS
  const safeAddress = process.env.SAFE_ADDRESS
  const executeImmediately = process.env.EXECUTE === 'true'

  if (!command) {
    console.log('Usage — arguments are environment variables:')
    console.log('  TRANSFER=initiate POOL_FACTORY_ADDRESS=0x… SAFE_ADDRESS=0x… pnpm transfer:ownership:amoy')
    console.log('  TRANSFER=complete POOL_FACTORY_ADDRESS=0x… SAFE_ADDRESS=0x… EXECUTE=true pnpm transfer:ownership:amoy')
    console.log('  TRANSFER=verify   POOL_FACTORY_ADDRESS=0x… [SAFE_ADDRESS=0x…] pnpm transfer:ownership:amoy')
    console.log('  TRANSFER=rollback POOL_FACTORY_ADDRESS=0x… pnpm transfer:ownership:amoy')
    process.exit(1)
  }

  try {
    const requireFactory = (): string => {
      if (!poolFactoryAddress) throw new Error('POOL_FACTORY_ADDRESS is required')

      return poolFactoryAddress
    }

    const requireSafe = (): string => {
      if (!safeAddress) throw new Error('SAFE_ADDRESS is required')

      return safeAddress
    }

    switch (command) {
      case 'initiate': {
        const result = await initiateOwnershipTransfer({
          poolFactoryAddress: requireFactory(),
          safeAddress: requireSafe(),
        })

        console.log('\n📋 Transfer Initiated:')
        console.log(JSON.stringify(result, null, 2))
        break
      }

      case 'complete': {
        const result = await completeOwnershipTransfer({
          poolFactoryAddress: requireFactory(),
          safeAddress: requireSafe(),
          executeImmediately,
        })

        console.log('\n📋 Transfer Result:')
        console.log(JSON.stringify(result, null, 2))
        break
      }

      case 'verify': {
        await verifyOwnershipStatus(requireFactory(), safeAddress)
        break
      }

      case 'rollback': {
        await emergencyRollback(requireFactory())
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
if (isMain(import.meta.url)) {
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
