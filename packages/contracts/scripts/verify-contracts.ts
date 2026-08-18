import * as dotenv from 'dotenv'
import { network } from 'hardhat'
import { manualVerifyCommand, verificationBlocker, verifyAllWithRetry, VerifyTarget } from './lib/verification'

dotenv.config()

interface ContractInfo {
  name: string
  address: string
  constructorArgs?: unknown[]
  isProxy?: boolean
  implementationAddress?: string
}

/**
 * Comprehensive contract verification script
 * Handles verification for implementation contracts, proxies, and regular contracts
 */
async function main() {
  console.log('🔍 Starting contract verification process...')
  console.log(`📍 Network: ${network.name} (${network.config.chainId})`)

  const blocker = verificationBlocker()

  if (blocker) {
    console.log(`⏭️ Nothing to verify: ${blocker}`)
    console.log('   An Etherscan API key comes from: https://etherscan.io/apis')
    return
  }

  // Get contracts to verify from command line args or use defaults
  const contractsToVerify = await getContractsToVerify()

  console.log(`\n📋 Found ${contractsToVerify.length} contracts to verify:`)
  contractsToVerify.forEach((contract, index) => {
    console.log(`   ${index + 1}. ${contract.name} at ${contract.address}`)
  })

  let successCount = 0
  let failureCount = 0

  for (let i = 0; i < contractsToVerify.length; i++) {
    const contract = contractsToVerify[i]
    console.log(`\n🔍 Verifying ${contract.name} (${i + 1}/${contractsToVerify.length})...`)

    try {
      await verifyContract(contract)
      console.log(`✅ ${contract.name} verified successfully`)
      successCount++
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.log(`❌ Failed to verify ${contract.name}:`, errorMessage)
      failureCount++

      // Provide manual verification command
      console.log(`\n🔧 Manual verification command:`)
      console.log(`   ${manualVerifyCommand(contract.address, contract.constructorArgs)}`)
    }
  }

  // Summary
  console.log(`\n📊 Verification Summary:`)
  console.log(`   ✅ Successful: ${successCount}`)
  console.log(`   ❌ Failed: ${failureCount}`)
  console.log(`   📱 Total: ${contractsToVerify.length}`)

  if (failureCount > 0) {
    console.log(`\n⚠️ Some verifications failed. You can retry manually using the provided commands above.`)
  } else {
    console.log(`\n🎉 All contracts verified successfully!`)
  }
}

/**
 * Verify one entry, implementation first where it has one.
 *
 * Throws on exhaustion so `main` can count the failure and print the manual
 * command. The retry, the backoff and the "already verified" match all live in
 * `lib/verification` now, and each target is retried on its own — see
 * `verifyAllWithRetry` for the bug that pairing them caused.
 */
async function verifyContract(contractInfo: ContractInfo): Promise<void> {
  const targets: VerifyTarget[] = []

  if (contractInfo.isProxy && contractInfo.implementationAddress) {
    targets.push({ label: `${contractInfo.name} implementation`, address: contractInfo.implementationAddress })
  }

  targets.push({ label: contractInfo.name, address: contractInfo.address, constructorArguments: contractInfo.constructorArgs })

  await verifyAllWithRetry(targets)
}

/**
 * Get contracts to verify from various sources
 */
async function getContractsToVerify(): Promise<ContractInfo[]> {
  const contracts: ContractInfo[] = []

  // Check command line arguments
  const args = process.argv.slice(2)

  if (args.length >= 2) {
    // Format: pnpm verify:contracts <contractName> <address> [constructorArgs...]
    const [contractName, address, ...constructorArgs] = args
    contracts.push({
      name: contractName,
      address: address,
      constructorArgs: constructorArgs.length > 0 ? constructorArgs : undefined,
    })
    return contracts
  }

  // If no command line args, try to find deployed contracts
  // This would typically read from deployment artifacts or a deployments file
  // For now, we'll provide instructions for manual specification

  if (contracts.length === 0) {
    console.log(`\n📝 No contracts specified. Usage options:`)
    console.log(`   1. Verify specific contract: pnpm verify:contracts <contractName> <address> [constructorArgs...]`)
    console.log(`   2. Use verify:all script to verify from deployment artifacts`)
    console.log(`   3. Use individual verification scripts like verify:implementation or verify:proxy`)
    console.log(`\nExample:`)
    console.log(`   pnpm verify:contracts LendingPool 0x123... 0xOwnerAddress 1000000000000000000 500 604800`)

    process.exit(0)
  }

  return contracts
}

// Handle errors
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Verification script failed:')
    console.error(error)
    process.exit(1)
  })
