import * as dotenv from 'dotenv'
import { network, run } from 'hardhat'

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

  // Skip verification for local networks
  if (network.name === 'localhost' || network.name === 'hardhat' || network.name === 'hardhatFork') {
    console.log('⏭️ Skipping verification on local network')
    return
  }

  // Check if API key is configured
  if (!process.env.ETHERSCAN_API_KEY || process.env.ETHERSCAN_API_KEY === '') {
    console.log('❌ ETHERSCAN_API_KEY not configured. Please set it in your .env file')
    console.log('   Get your API key from: https://etherscan.io/apis')
    process.exit(1)
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
      console.log(
        `   pnpm hardhat verify --network ${network.name} ${contract.address}${
          contract.constructorArgs ? ' ' + contract.constructorArgs.join(' ') : ''
        }`
      )
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
 * Verify a single contract with retry logic
 */
async function verifyContract(contractInfo: ContractInfo, maxRetries: number = 3): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`   🔄 Retry attempt ${attempt}/${maxRetries}...`)
        // Wait before retry (exponential backoff)
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000))
      }

      if (contractInfo.isProxy && contractInfo.implementationAddress) {
        // For proxy contracts, verify the implementation first if provided
        await run('verify:verify', {
          address: contractInfo.implementationAddress,
          constructorArguments: [],
        })
        console.log(`   ✅ Implementation verified at ${contractInfo.implementationAddress}`)
      }

      // Verify the main contract
      await run('verify:verify', {
        address: contractInfo.address,
        constructorArguments: contractInfo.constructorArgs || [],
      })

      return // Success
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      if (errorMessage.toLowerCase().includes('already verified')) {
        console.log(`   ✅ ${contractInfo.name} is already verified`)
        return
      }

      if (attempt === maxRetries) {
        throw error // Re-throw on final attempt
      }

      console.log(`   ⚠️ Attempt ${attempt} failed: ${errorMessage}`)
    }
  }
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
    console.log(`   pnpm verify:contracts SampleLendingPool 0x123... 0xOwnerAddress 1000000000000000000 500 604800`)

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
