import * as dotenv from 'dotenv'
import { ethers, network, run, upgrades } from 'hardhat'
import { manualVerifyCommand, verificationBlocker, verifyWithRetry } from './lib/verification'

dotenv.config()

/**
 * Specialized script for verifying UUPS proxy contracts
 * Handles the complexities of proxy verification including implementation contracts
 */
async function main() {
  console.log('🔍 Starting proxy contract verification...')
  console.log(`📍 Network: ${network.name} (${network.config.chainId})`)

  const blocker = verificationBlocker()

  if (blocker) {
    console.log(`⏭️ Nothing to verify: ${blocker}`)
    console.log('   An Etherscan API key comes from: https://etherscan.io/apis')
    return
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
    } catch {
      console.log(`   Admin: N/A (UUPS proxy - self-managed)`)
    }

    // Step 1: Verify the implementation contract
    console.log('\n2️⃣ Verifying implementation contract...')
    try {
      // Implementation contracts take no constructor arguments — they are
      // initialised through `initialize()` behind the proxy.
      const outcome = await verifyWithRetry({ label: 'Implementation', address: implementationAddress })

      console.log(
        outcome === 'already-verified'
          ? '   ✅ Implementation contract is already verified'
          : '   ✅ Implementation contract verified successfully'
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.log(`   ⚠️ Implementation verification failed: ${errorMessage}`)
      console.log(`   🔧 Manual verification command:`)
      console.log(`      ${manualVerifyCommand(implementationAddress)}`)
    }

    // Step 2: Verify the proxy contract
    console.log('\n3️⃣ Verifying proxy contract...')
    try {
      // ERC1967Proxy's constructor arguments would go here if the explorer
      // ever needed them; OpenZeppelin's plugin deploys it without any it
      // reports back, so the array stays empty.
      const outcome = await verifyWithRetry({ label: 'Proxy', address: proxyAddress })

      console.log(
        outcome === 'already-verified' ? '   ✅ Proxy contract is already verified' : '   ✅ Proxy contract verified successfully'
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.log(`   ⚠️ Proxy verification failed: ${errorMessage}`)
      console.log(`   💡 This is common with proxy contracts. The implementation verification is more important.`)
    }

    // Step 3: Verify with OpenZeppelin's method
    console.log('\n4️⃣ Attempting OpenZeppelin proxy verification...')
    try {
      await run('verify:sourcify', { address: proxyAddress })
      console.log('   ✅ Sourcify verification completed')
    } catch {
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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('❌ Proxy verification failed:')
    console.error(errorMessage)

    console.log('\n🔧 Manual verification commands:')
    console.log(`   # Verify as regular contract:`)
    console.log(`   ${manualVerifyCommand(proxyAddress)}`)
    console.log(`   
   # If that fails, you can verify the implementation directly:`)
    console.log(`   # (Get implementation address from Polygonscan's "Read Contract" tab)`)

    process.exit(1)
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
