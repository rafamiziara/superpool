import * as dotenv from 'dotenv'
import { ethers, network, run, upgrades } from 'hardhat'

dotenv.config()

/**
 * Specialized script for verifying UUPS proxy contracts
 * Handles the complexities of proxy verification including implementation contracts
 */
async function main() {
  console.log('🔍 Starting proxy contract verification...')
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

  // Get proxy address from command line
  const args = process.argv.slice(2)
  if (args.length < 1) {
    console.log('❌ Usage: pnpm verify:proxy <proxyAddress>')
    console.log('   Example: pnpm verify:proxy 0x1234567890123456789012345678901234567890')
    process.exit(1)
  }

  const proxyAddress = args[0]

  if (!ethers.isAddress(proxyAddress)) {
    console.log('❌ Invalid proxy address provided')
    process.exit(1)
  }

  console.log(`\n🎯 Verifying proxy contract at: ${proxyAddress}`)

  try {
    // Get implementation address
    console.log('\n1️⃣ Getting implementation address...')
    const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress)
    console.log(`   Implementation: ${implementationAddress}`)

    // Get admin address (if applicable)
    try {
      const adminAddress = await upgrades.erc1967.getAdminAddress(proxyAddress)
      console.log(`   Admin: ${adminAddress}`)
    } catch (error) {
      console.log(`   Admin: N/A (UUPS proxy - self-managed)`)
    }

    // Step 1: Verify the implementation contract
    console.log('\n2️⃣ Verifying implementation contract...')
    try {
      await verifyImplementation(implementationAddress)
      console.log('   ✅ Implementation contract verified successfully')
    } catch (error: any) {
      if (error.message.toLowerCase().includes('already verified')) {
        console.log('   ✅ Implementation contract is already verified')
      } else {
        console.log(`   ⚠️ Implementation verification failed: ${error.message}`)
        console.log(`   🔧 Manual verification command:`)
        console.log(`      pnpm hardhat verify --network ${network.name} ${implementationAddress}`)
      }
    }

    // Step 2: Verify the proxy contract
    console.log('\n3️⃣ Verifying proxy contract...')
    try {
      await verifyProxy(proxyAddress, implementationAddress)
      console.log('   ✅ Proxy contract verified successfully')
    } catch (error: any) {
      if (error.message.toLowerCase().includes('already verified')) {
        console.log('   ✅ Proxy contract is already verified')
      } else {
        console.log(`   ⚠️ Proxy verification failed: ${error.message}`)
        console.log(`   💡 This is common with proxy contracts. The implementation verification is more important.`)
      }
    }

    // Step 3: Verify with OpenZeppelin's method
    console.log('\n4️⃣ Attempting OpenZeppelin proxy verification...')
    try {
      await run('verify:sourcify', { address: proxyAddress })
      console.log('   ✅ Sourcify verification completed')
    } catch (error: any) {
      console.log(`   ⚠️ Sourcify verification not available or failed`)
    }

    console.log('\n🎉 Proxy verification process completed!')
    console.log('\n📋 Verification Summary:')
    console.log(`   🏭 Proxy Address: ${proxyAddress}`)
    console.log(`   🔧 Implementation: ${implementationAddress}`)
    console.log(`   📍 Network: ${network.name}`)
    console.log(
      `   🔗 View on Polygonscan: https://${network.name === 'polygonAmoy' ? 'amoy.' : ''}polygonscan.com/address/${proxyAddress}`
    )
  } catch (error: any) {
    console.error('❌ Proxy verification failed:')
    console.error(error.message)

    console.log('\n🔧 Manual verification commands:')
    console.log(`   # Verify as regular contract:`)
    console.log(`   pnpm hardhat verify --network ${network.name} ${proxyAddress}`)
    console.log(`   
   # If that fails, you can verify the implementation directly:`)
    console.log(`   # (Get implementation address from Polygonscan's "Read Contract" tab)`)

    process.exit(1)
  }
}

/**
 * Verify implementation contract
 */
async function verifyImplementation(implementationAddress: string): Promise<void> {
  // Implementation contracts typically have no constructor arguments
  // as they use initialize() instead
  await run('verify:verify', {
    address: implementationAddress,
    constructorArguments: [],
  })
}

/**
 * Verify proxy contract with implementation reference
 */
async function verifyProxy(proxyAddress: string, implementationAddress: string): Promise<void> {
  // Proxy contracts are typically deployed with the implementation address
  // and initialization data as constructor arguments
  await run('verify:verify', {
    address: proxyAddress,
    constructorArguments: [], // ERC1967Proxy constructor args would go here if needed
  })
}

/**
 * Get proxy information for debugging
 */
async function getProxyInfo(proxyAddress: string) {
  const info: any = {}

  try {
    info.implementation = await upgrades.erc1967.getImplementationAddress(proxyAddress)
  } catch (error) {
    info.implementation = 'Unable to fetch'
  }

  try {
    info.admin = await upgrades.erc1967.getAdminAddress(proxyAddress)
  } catch (error) {
    info.admin = 'N/A (UUPS proxy)'
  }

  try {
    // Try to get the contract name by looking at the implementation
    const implementationCode = await ethers.provider.getCode(info.implementation)
    info.hasImplementation = implementationCode !== '0x'
  } catch (error) {
    info.hasImplementation = false
  }

  return info
}

/**
 * Helper to check if address is a proxy
 */
async function isProxy(address: string): Promise<boolean> {
  try {
    await upgrades.erc1967.getImplementationAddress(address)
    return true
  } catch (error) {
    return false
  }
}

// Handle errors
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Proxy verification script failed:')
    console.error(error)
    process.exit(1)
  })
