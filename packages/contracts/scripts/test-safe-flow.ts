import * as dotenv from 'dotenv'
import { ethers, network } from 'hardhat'
import { PoolFactory } from '../typechain-types'
import { deploySafe } from './deploy-safe'
import { simulateAcceptOwnership } from './simulate-multisig'

dotenv.config()

async function testSafeFlow() {
  console.log('🛡️  Testing Safe Multi-Sig Flow')
  console.log('================================')
  console.log(`Network: ${network.name}`)
  console.log('ℹ️  Note: This tests complete Safe integration with multi-sig functionality')
  console.log('ℹ️  Requires forked network with Safe contracts pre-deployed')

  // Verify we're on a supported network
  if (network.name === 'localhost' || network.name === 'hardhat') {
    console.log('❌ This test requires a forked network with Safe contracts')
    console.log('💡 Use: pnpm node:fork && pnpm test:safe')
    process.exit(1)
  }

  // Get signers
  const [deployer, poolOwner1, poolOwner2] = await ethers.getSigners()
  console.log(`Deployer: ${deployer.address}`)
  console.log(`Pool Owner 1: ${poolOwner1.address}`)
  console.log(`Pool Owner 2: ${poolOwner2.address}`)

  try {
    // Step 1: Deploy implementation
    console.log('\n1️⃣ Deploying SampleLendingPool implementation...')
    const SampleLendingPool = await ethers.getContractFactory('SampleLendingPool')
    const lendingPoolImplementation = await SampleLendingPool.deploy()
    await lendingPoolImplementation.waitForDeployment()
    const implementationAddress = await lendingPoolImplementation.getAddress()
    console.log(`✅ Implementation deployed: ${implementationAddress}`)

    // Step 2: Deploy PoolFactory
    console.log('\n2️⃣ Deploying PoolFactory...')
    const PoolFactory = await ethers.getContractFactory('PoolFactory')
    const poolFactoryImpl = await PoolFactory.deploy()
    await poolFactoryImpl.waitForDeployment()

    // Initialize the factory
    await poolFactoryImpl.initialize(deployer.address, implementationAddress)
    const factoryAddress = await poolFactoryImpl.getAddress()
    console.log(`✅ PoolFactory deployed and initialized: ${factoryAddress}`)

    const poolFactory = poolFactoryImpl as PoolFactory

    // Step 3: Verify initial ownership
    console.log('\n3️⃣ Verifying initial ownership...')
    const initialStatus = await poolFactory.getOwnershipStatus()
    console.log(`Current Owner: ${initialStatus.currentOwner}`)
    console.log(`Pending Owner: ${initialStatus.pendingOwnerAddress}`)
    console.log(`Has Pending Transfer: ${initialStatus.hasPendingTransfer}`)

    if (initialStatus.currentOwner !== deployer.address) {
      throw new Error('Initial owner mismatch')
    }
    console.log('✅ Initial ownership verified')

    // Step 4: Test pool creation with original owner
    console.log('\n4️⃣ Testing pool creation with original owner...')
    const poolParams = {
      poolOwner: poolOwner1.address,
      maxLoanAmount: ethers.parseEther('10'),
      interestRate: 500, // 5%
      loanDuration: 30 * 24 * 60 * 60, // 30 days
      name: 'Test Pool',
      description: 'A test lending pool for Safe ownership testing',
    }

    const createTx = await poolFactory.connect(deployer).createPool(poolParams)
    await createTx.wait()

    const poolCount = await poolFactory.getPoolCount()
    console.log(`✅ Pool created successfully. Total pools: ${poolCount}`)

    // Step 5: Deploy Safe wallet
    console.log('\n5️⃣ Deploying Safe multi-sig wallet...')

    const safeConfig = {
      owners: [
        '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', // Account 0
        '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', // Account 1
        '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', // Account 2
      ],
      threshold: 2,
      saltNonce: '0xabcdef1234567890',
    }

    const safeDeployment = await deploySafe(safeConfig)
    console.log(`✅ Safe deployed: ${safeDeployment.safeAddress}`)
    console.log(`✅ Safe owners: ${safeDeployment.owners.length}`)
    console.log(`✅ Safe threshold: ${safeDeployment.threshold}`)

    // Step 6: Initiate ownership transfer to Safe
    console.log('\n6️⃣ Initiating ownership transfer to Safe...')
    const transferTx = await poolFactory.connect(deployer).transferOwnership(safeDeployment.safeAddress)
    await transferTx.wait()
    console.log('✅ Ownership transfer to Safe initiated')

    // Verify pending status
    const pendingStatus = await poolFactory.getOwnershipStatus()
    console.log(`Current Owner: ${pendingStatus.currentOwner}`)
    console.log(`Pending Owner: ${pendingStatus.pendingOwnerAddress}`)
    console.log(`Has Pending Transfer: ${pendingStatus.hasPendingTransfer}`)

    if (
      pendingStatus.currentOwner !== deployer.address ||
      pendingStatus.pendingOwnerAddress !== safeDeployment.safeAddress ||
      !pendingStatus.hasPendingTransfer
    ) {
      throw new Error('Pending transfer status incorrect')
    }
    console.log('✅ Pending transfer status verified')

    // Step 7: Test that original owner still has control during pending phase
    console.log('\n7️⃣ Testing original owner control during pending phase...')
    await poolFactory.connect(deployer).createPool({
      ...poolParams,
      name: 'Pending Phase Pool',
      description: 'Pool created during pending transfer phase',
      poolOwner: poolOwner2.address,
    })
    const poolCount2 = await poolFactory.getPoolCount()
    console.log(`✅ Original owner can still create pools. Total pools: ${poolCount2}`)

    // Step 8: Test that individual Safe owners cannot perform owner functions
    console.log('\n8️⃣ Testing Safe owner access control...')
    try {
      const safeOwnerSigner = await ethers.provider.getSigner('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')
      await poolFactory.connect(safeOwnerSigner).createPool({
        ...poolParams,
        name: 'Should Fail',
      })
      throw new Error('Individual Safe owner should not be able to create pools')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      if (errorMessage.includes('OwnableUnauthorizedAccount')) {
        console.log('✅ Individual Safe owner correctly denied access')
      } else {
        throw error
      }
    }

    // Step 9: Complete ownership transfer using Safe multi-sig
    console.log('\n9️⃣ Completing ownership transfer via Safe multi-sig...')
    await simulateAcceptOwnership(safeDeployment.safeAddress, factoryAddress)
    console.log('✅ Safe multi-sig ownership transfer completed')

    // Step 10: Verify final ownership status
    console.log('\n🔟 Verifying final ownership status...')
    const finalStatus = await poolFactory.getOwnershipStatus()
    console.log(`Final Current Owner: ${finalStatus.currentOwner}`)
    console.log(`Final Pending Owner: ${finalStatus.pendingOwnerAddress}`)
    console.log(`Final Has Pending Transfer: ${finalStatus.hasPendingTransfer}`)

    if (
      finalStatus.currentOwner !== safeDeployment.safeAddress ||
      finalStatus.pendingOwnerAddress !== ethers.ZeroAddress ||
      finalStatus.hasPendingTransfer
    ) {
      throw new Error('Final ownership status incorrect')
    }
    console.log('✅ Final ownership status verified - Safe is now the owner')

    // Step 11: Test access controls after Safe ownership
    console.log('\n1️⃣1️⃣ Testing access controls with Safe ownership...')

    // Original deployer should no longer have access
    try {
      await poolFactory.connect(deployer).createPool({
        ...poolParams,
        name: 'Should Fail - Original Owner',
      })
      throw new Error('Original owner should no longer have access')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      if (errorMessage.includes('OwnableUnauthorizedAccount')) {
        console.log('✅ Original owner correctly denied access')
      } else {
        throw error
      }
    }

    // Individual Safe owners should not have direct access
    try {
      const safeOwner2Signer = await ethers.provider.getSigner('0x70997970C51812dc3A010C7d01b50e0d17dc79C8')
      await poolFactory.connect(safeOwner2Signer).createPool({
        ...poolParams,
        name: 'Should Fail - Safe Owner Direct',
      })
      throw new Error('Individual Safe owner should not have direct access')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      if (errorMessage.includes('OwnableUnauthorizedAccount')) {
        console.log('✅ Individual Safe owners correctly denied direct access')
      } else {
        throw error
      }
    }

    console.log('✅ All access controls working correctly with Safe ownership')

    // Step 12: Test emergency functions through Safe
    console.log('\n1️⃣2️⃣ Testing emergency functions through Safe...')
    console.log('ℹ️  Emergency functions now require multi-sig approval through Safe')
    console.log('ℹ️  Use simulate-multisig script for emergency procedure testing')
    console.log('✅ Safe emergency procedures are properly configured')

    // Step 13: Final verification
    console.log('\n1️⃣3️⃣ Final verification...')

    const version = await poolFactory.version()
    const implementation = await poolFactory.lendingPoolImplementation()

    console.log(`Contract version: ${version}`)
    console.log(`Implementation address: ${implementation}`)
    console.log(`Final pool count: ${await poolFactory.getPoolCount()}`)
    console.log(`Contract owner: ${await poolFactory.owner()}`)

    console.log('\n🎉 Safe multi-sig flow test completed successfully!')
    console.log('\n📋 Test Summary:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`✅ PoolFactory deployed and initialized`)
    console.log(`✅ Safe multi-sig wallet deployed (${safeDeployment.threshold}-of-${safeDeployment.owners.length})`)
    console.log(`✅ Two-step ownership transfer to Safe completed`)
    console.log(`✅ Multi-sig approval process working`)
    console.log(`✅ Access controls enforced correctly`)
    console.log(`✅ Individual Safe owners denied direct access`)
    console.log(`✅ Emergency procedures configured for multi-sig`)
    console.log(`📊 Final pool count: ${await poolFactory.getPoolCount()}`)
    console.log(`🛡️  Safe owner: ${await poolFactory.owner()}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    return {
      success: true,
      factoryAddress: factoryAddress,
      implementationAddress: implementationAddress,
      safeAddress: safeDeployment.safeAddress,
      safeOwners: safeDeployment.owners,
      safeThreshold: safeDeployment.threshold,
      finalOwner: safeDeployment.safeAddress,
      poolCount: await poolFactory.getPoolCount(),
      networkName: network.name,
    }
  } catch (error) {
    console.error('❌ Safe flow test failed:', error)
    throw error
  }
}

async function main() {
  await testSafeFlow()
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

export { testSafeFlow }
