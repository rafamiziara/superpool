import { ethers } from 'hardhat'

/**
 * Enable whitelist mode on PoolFactory
 * Run with: npx hardhat run scripts/enableWhitelist.ts --network localhost
 */
async function main() {
  const [deployer] = await ethers.getSigners()
  console.log('Enabling whitelist mode with account:', deployer.address)

  // Get PoolFactory address from deployment
  const factoryAddress = process.env.POOL_FACTORY_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3'

  const factory = await ethers.getContractAt('PoolFactory', factoryAddress)

  // Check current status
  const isEnabled = await factory.isWhitelistEnabled()
  console.log('Current whitelist mode:', isEnabled)

  if (!isEnabled) {
    // Enable whitelist mode
    const tx = await factory.setWhitelistMode(true)
    await tx.wait()
    console.log('✅ Whitelist mode enabled')
  } else {
    console.log('✅ Whitelist mode already enabled')
  }

  // Verify
  const finalStatus = await factory.isWhitelistEnabled()
  console.log('Final whitelist mode:', finalStatus)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
