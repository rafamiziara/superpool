import { isMain } from './lib/main'
import { signerKeyFor } from './lib/accounts'
import { optionalArgument, requiredArgument } from './lib/args'
import { safeContractNetworks, safeRpcUrl } from './lib/safe'
import { artifacts, ethers, network } from '../hardhat.connection'
import Safe from '@safe-global/protocol-kit'
import { MetaTransactionData } from '@safe-global/types-kit'
import * as dotenv from 'dotenv'

dotenv.config()

interface MultiSigSimulationConfig {
  safeAddress: string
  targetContract: string
  /**
   * Name of the function on `PoolFactory`, encoded from the compiled artifact.
   *
   * Not a hand-written signature. This script carried one for `createPool` that
   * described a contract that never shipped — `maxMembers`, `contributionAmount`,
   * `collateralRatio`, `requiresKYC` — so every run failed at encoding. A
   * signature written by hand is a second copy of the ABI with nothing keeping
   * it honest, which is the same drift `test/AbiSync.test.ts` exists to catch
   * for the consumers' copies.
   */
  functionName: string
  functionArgs: unknown[]
  value?: string
}

/**
 * Simulate multi-sig approval process by collecting signatures from multiple owners
 */
async function simulateMultiSigApproval(config: MultiSigSimulationConfig): Promise<void> {
  console.log('🎭 Simulating Multi-Sig Approval Process')
  console.log('=====================================')
  console.log('Safe Address:', config.safeAddress)
  console.log('Target Contract:', config.targetContract)
  console.log('Function:', config.functionName)
  console.log('Arguments:', config.functionArgs)

  if (network.name !== 'localhost' && network.name !== 'hardhat' && !network.name.includes('Fork')) {
    console.log('ℹ️  Note: Multi-sig simulation works best on local or forked networks')
    console.log('ℹ️  Current network:', network.name)
  }

  const rpcUrl = safeRpcUrl()
  // A local node has no Safe contracts on it until this puts them there.
  const contractNetworks = await safeContractNetworks()

  // Step 1: Initialize Safe with first owner
  console.log('\n📋 Step 1: Initialize Safe and prepare transaction')
  const owner1PrivateKey = signerKeyFor((await ethers.getSigners())[0].address)

  const safeSdk1 = await Safe.init({
    provider: rpcUrl,
    signer: owner1PrivateKey,
    safeAddress: config.safeAddress,
    contractNetworks,
  })

  const safeInfo = {
    address: await safeSdk1.getAddress(),
    owners: await safeSdk1.getOwners(),
    threshold: await safeSdk1.getThreshold(),
    version: await safeSdk1.getContractVersion(),
  }

  console.log('Safe Info:')
  console.log(`- Address: ${safeInfo.address}`)
  console.log(`- Owners: ${safeInfo.owners.length}`)
  console.log(`- Threshold: ${safeInfo.threshold}`)
  console.log(`- Version: ${safeInfo.version}`)

  // Step 2: Prepare transaction data
  console.log('\n📝 Step 2: Prepare transaction data')

  // Encode from the compiled artifact, so the call cannot describe a contract
  // that is not the one deployed. Read rather than attached: encoding needs the
  // ABI, not a provider, and an unknown name throws here with the real list.
  const { abi } = await artifacts.readArtifact('PoolFactory')
  const transactionData = new ethers.Interface(abi).encodeFunctionData(config.functionName, config.functionArgs)

  const safeTransaction: MetaTransactionData = {
    to: config.targetContract,
    data: transactionData,
    value: config.value || '0',
  }

  console.log('Transaction Data:')
  console.log(`- To: ${safeTransaction.to}`)
  console.log(`- Data: ${safeTransaction.data}`)
  console.log(`- Value: ${safeTransaction.value}`)

  // Step 3: Create Safe transaction
  console.log('\n🔨 Step 3: Create Safe transaction')
  const safeTransactionData = await safeSdk1.createTransaction({
    transactions: [safeTransaction],
  })

  const safeTxHash = await safeSdk1.getTransactionHash(safeTransactionData)
  console.log('Safe Transaction Hash:', safeTxHash)

  // Step 4: Collect signatures from multiple owners
  console.log('\n✍️  Step 4: Collect signatures from owners')
  let signedTransaction = safeTransactionData

  // Get the required number of signatures based on threshold
  const ownersToSign = safeInfo.owners.slice(0, safeInfo.threshold)

  for (let i = 0; i < ownersToSign.length; i++) {
    const ownerAddress = ownersToSign[i]
    let privateKey: string
    try {
      privateKey = signerKeyFor(ownerAddress)
    } catch {
      console.log(`⚠️  Warning: No private key available for owner ${ownerAddress}`)
      continue
    }

    console.log(`\n🔐 Signing with Owner ${i + 1}: ${ownerAddress}`)

    const ownerSafeSdk = await Safe.init({
      provider: rpcUrl,
      signer: privateKey,
      safeAddress: config.safeAddress,
      contractNetworks,
    })

    signedTransaction = await ownerSafeSdk.signTransaction(signedTransaction)

    // `.size`, not `Object.keys(...).length` — `signatures` is a Map, so the
    // old count was 0 however many owners had signed, and step 5 below then
    // reported "insufficient signatures" and returned on every run.
    console.log(`✅ Signature collected (${signedTransaction.signatures.size}/${safeInfo.threshold})`)
  }

  // Step 5: Verify signatures
  console.log('\n🔍 Step 5: Verify signatures')
  const finalSignatureCount = signedTransaction.signatures.size

  console.log(`Total signatures: ${finalSignatureCount}`)
  console.log(`Required threshold: ${safeInfo.threshold}`)
  console.log(`Can execute: ${finalSignatureCount >= safeInfo.threshold ? '✅ Yes' : '❌ No'}`)

  if (finalSignatureCount < safeInfo.threshold) {
    console.log('❌ Insufficient signatures for execution')
    return
  }

  // Step 6: Execute transaction
  console.log('\n🚀 Step 6: Execute transaction')

  try {
    const executeTxResponse = await safeSdk1.executeTransaction(signedTransaction)
    console.log('Execution transaction hash:', executeTxResponse.hash)

    // Wait for confirmation
    console.log('⏳ Waiting for confirmation...')
    let receipt: { blockNumber?: number } | null | undefined
    if (
      executeTxResponse.transactionResponse &&
      typeof (executeTxResponse.transactionResponse as { wait?: () => Promise<unknown> }).wait === 'function'
    ) {
      receipt = await (executeTxResponse.transactionResponse as { wait: () => Promise<{ blockNumber?: number } | null> }).wait()
    }

    console.log('✅ Multi-sig transaction executed successfully!')
    console.log('Block number:', receipt?.blockNumber)
  } catch (error) {
    console.error('❌ Execution failed:', error)
    throw error
  }
}

/**
 * Example: Simulate accepting ownership of PoolFactory
 */
async function simulateAcceptOwnership(safeAddress: string, poolFactoryAddress: string): Promise<void> {
  console.log('🎯 Simulating PoolFactory ownership acceptance...')

  await simulateMultiSigApproval({
    safeAddress,
    targetContract: poolFactoryAddress,
    functionName: 'acceptOwnership',
    functionArgs: [],
    value: '0',
  })
}

/**
 * Example: Simulate pool creation
 */
async function simulatePoolCreation(safeAddress: string, poolFactoryAddress: string, poolParams: Record<string, unknown>): Promise<void> {
  console.log('🏊 Simulating pool creation...')

  await simulateMultiSigApproval({
    safeAddress,
    targetContract: poolFactoryAddress,
    functionName: 'createPool',
    functionArgs: [poolParams],
    value: '0',
  })
}

/**
 * Example: Simulate emergency pause
 */
async function simulateEmergencyPause(safeAddress: string, poolFactoryAddress: string): Promise<void> {
  console.log('⏸️  Simulating emergency pause...')

  await simulateMultiSigApproval({
    safeAddress,
    targetContract: poolFactoryAddress,
    functionName: 'pause',
    functionArgs: [],
    value: '0',
  })
}

/**
 * Interactive demo of multi-sig simulation
 */
async function runDemo(): Promise<void> {
  console.log('🎭 Multi-Sig Simulation Demo')
  console.log('============================')

  // Arguments come from the environment; see `lib/args.ts` for why a script
  // started by `hardhat run` cannot read positional ones. The sibling
  // `upgrade.ts` already takes `UPGRADE_TARGET` this way.
  const usage = [
    'SIMULATION=acceptOwnership SAFE_ADDRESS=0x… TARGET_ADDRESS=0x… pnpm simulate-multisig',
    'SIMULATION=pause           SAFE_ADDRESS=0x… TARGET_ADDRESS=0x… pnpm simulate-multisig',
    'SIMULATION=createPool      SAFE_ADDRESS=0x… TARGET_ADDRESS=0x… pnpm simulate-multisig',
  ]
  const command = requiredArgument('SIMULATION', usage)
  const safeAddress = requiredArgument('SAFE_ADDRESS', usage)
  const targetAddress = optionalArgument('TARGET_ADDRESS')

  try {
    switch (command) {
      case 'acceptOwnership':
        if (!targetAddress) {
          throw new Error('poolFactoryAddress required for acceptOwnership')
        }
        await simulateAcceptOwnership(safeAddress, targetAddress)
        break

      case 'pause':
        if (!targetAddress) {
          throw new Error('poolFactoryAddress required for pause')
        }
        await simulateEmergencyPause(safeAddress, targetAddress)
        break

      case 'createPool': {
        if (!targetAddress) {
          throw new Error('poolFactoryAddress required for createPool')
        }

        // `PoolFactory.PoolParams`, in its declared order — ethers encodes a
        // tuple positionally, so the order is load-bearing, not cosmetic.
        const poolParams: Record<string, unknown> = {
          maxLoanAmount: ethers.parseEther('1000'),
          interestRate: 500, // 5%
          loanDuration: 30 * 24 * 60 * 60, // 30 days
          name: 'Demo Pool',
          description: 'Multi-sig simulation demo pool',
          requiresMembership: false,
          loanToken: ethers.ZeroAddress,
        }

        await simulatePoolCreation(safeAddress, targetAddress, poolParams)
        break
      }
      default:
        throw new Error(`Unknown command: ${command}`)
    }

    console.log('\n🎉 Multi-sig simulation completed successfully!')
  } catch (error) {
    console.error('❌ Simulation failed:', error)
    process.exit(1)
  }
}

// Export functions for use in other scripts
export { simulateAcceptOwnership, simulateEmergencyPause, simulateMultiSigApproval, simulatePoolCreation }

// Run demo if executed directly
if (isMain(import.meta.url)) {
  runDemo()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
