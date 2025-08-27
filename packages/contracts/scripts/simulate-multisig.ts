import Safe from '@safe-global/protocol-kit'
import { MetaTransactionData } from '@safe-global/types-kit'
import * as dotenv from 'dotenv'
import { ethers, network } from 'hardhat'

dotenv.config()

// ⚠️  SECURITY WARNING: DEVELOPMENT ONLY SCRIPT ⚠️
//
// This script contains hardcoded Hardhat private keys that are:
// - PUBLICLY KNOWN test keys from Hardhat documentation
// - NEVER to be used on mainnet or with real funds
// - ONLY safe for localhost/testnet development
//
// For production deployments:
// - Use environment variables for private keys
// - Use hardware wallets or secure key management
// - Never commit private keys to version control
//
// These test keys are widely known and funds can be stolen!

/**
 * Hardhat's deterministic accounts for local development
 * @dev WARNING: Contains hardcoded test keys - DEVELOPMENT ONLY
 */
const HARDHAT_ACCOUNTS = {
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266': '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', // Account 0
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8': '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', // Account 1
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC': '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', // Account 2
}

interface MultiSigSimulationConfig {
  safeAddress: string
  targetContract: string
  functionSignature: string
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
  console.log('Function:', config.functionSignature)
  console.log('Arguments:', config.functionArgs)

  if (network.name !== 'localhost' && network.name !== 'hardhat' && !network.name.includes('Fork')) {
    console.log('ℹ️  Note: Multi-sig simulation works best on local or forked networks')
    console.log('ℹ️  Current network:', network.name)
  }

  const rpcUrl = 'http://127.0.0.1:8545'

  // Step 1: Initialize Safe with first owner
  console.log('\n📋 Step 1: Initialize Safe and prepare transaction')
  const owner1PrivateKey = HARDHAT_ACCOUNTS['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266']

  const safeSdk1 = await Safe.init({
    provider: rpcUrl,
    signer: owner1PrivateKey,
    safeAddress: config.safeAddress,
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

  // Encode function call
  const contractInterface = new ethers.Interface([config.functionSignature])
  const functionName = config.functionSignature.split('(')[0]
  const transactionData = contractInterface.encodeFunctionData(functionName, config.functionArgs)

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
    const privateKey = HARDHAT_ACCOUNTS[ownerAddress as keyof typeof HARDHAT_ACCOUNTS]

    if (!privateKey) {
      console.log(`⚠️  Warning: No private key found for owner ${ownerAddress}`)
      continue
    }

    console.log(`\n🔐 Signing with Owner ${i + 1}: ${ownerAddress}`)

    const ownerSafeSdk = await Safe.init({
      provider: rpcUrl,
      signer: privateKey,
      safeAddress: config.safeAddress,
    })

    signedTransaction = await ownerSafeSdk.signTransaction(signedTransaction)

    const signatures = signedTransaction.signatures
    const signatureCount = signatures ? Object.keys(signatures).length : 0
    console.log(`✅ Signature collected (${signatureCount}/${safeInfo.threshold})`)
  }

  // Step 5: Verify signatures
  console.log('\n🔍 Step 5: Verify signatures')
  const finalSignatures = signedTransaction.signatures
  const finalSignatureCount = finalSignatures ? Object.keys(finalSignatures).length : 0

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
    let receipt
    if (executeTxResponse.transactionResponse && typeof (executeTxResponse.transactionResponse as { wait?: () => Promise<unknown> }).wait === 'function') {
      receipt = await (executeTxResponse.transactionResponse as { wait: () => Promise<unknown> }).wait()
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
    functionSignature: 'acceptOwnership()',
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
    functionSignature:
      'function createPool((string name, string description, uint256 maxMembers, uint256 contributionAmount, uint256 maxLoanAmount, uint256 interestRate, uint256 loanTerm, uint256 collateralRatio, bool requiresKYC) params)',
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
    functionSignature: 'pause()',
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

  // Parse command line arguments
  const args = process.argv.slice(2)
  const command = args[0]
  const safeAddress = args[1]
  const targetAddress = args[2]

  if (!command || !safeAddress) {
    console.log('Usage:')
    console.log('  pnpm simulate-multisig acceptOwnership <safeAddress> <poolFactoryAddress>')
    console.log('  pnpm simulate-multisig pause <safeAddress> <poolFactoryAddress>')
    console.log('  pnpm simulate-multisig createPool <safeAddress> <poolFactoryAddress>')
    process.exit(1)
  }

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

        // Example pool parameters
        const poolParams: Record<string, unknown> = {
          name: 'Demo Pool',
          description: 'Multi-sig simulation demo pool',
          maxMembers: 10,
          contributionAmount: ethers.parseEther('100'),
          maxLoanAmount: ethers.parseEther('1000'),
          interestRate: 500, // 5%
          loanTerm: 30 * 24 * 60 * 60, // 30 days
          collateralRatio: 15000, // 150%
          requiresKYC: false,
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
if (require.main === module) {
  runDemo()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
