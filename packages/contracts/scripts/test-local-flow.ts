import * as dotenv from 'dotenv'
import { ethers, network } from 'hardhat'
import { PoolFactory } from '../typechain-types'

dotenv.config()

async function testLocalFlow() {
  console.log('🧪 Testing Local Flow (Core Contract Logic)')
  console.log('==========================================')
  console.log(`Network: ${network.name}`)
  console.log('ℹ️  Note: This tests core contract functionality without Safe integration')
  console.log('ℹ️  For full Safe multi-sig testing, use test-safe-flow.ts on forked network')

  // Get signers
  const [deployer, newOwner, poolOwner1] = await ethers.getSigners()
  console.log(`Deployer: ${deployer.address}`)
  console.log(`New Owner: ${newOwner.address}`)
  console.log(`Pool Owner: ${poolOwner1.address}`)

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
      description: 'A test lending pool for ownership transfer testing',
    }

    const createTx = await poolFactory.connect(deployer).createPool(poolParams)
    await createTx.wait()

    const poolCount = await poolFactory.getPoolCount()
    console.log(`✅ Pool created successfully. Total pools: ${poolCount}`)

    // Step 5: Test ownership verification functions
    console.log('\n5️⃣ Testing ownership verification functions...')

    const isCurrentOwner = await poolFactory.isCurrentOwner(deployer.address)
    const isNotCurrentOwner = await poolFactory.isCurrentOwner(newOwner.address)
    const isPendingOwner = await poolFactory.isPendingOwner(newOwner.address)

    console.log(`Deployer is current owner: ${isCurrentOwner}`)
    console.log(`NewOwner is current owner: ${isNotCurrentOwner}`)
    console.log(`NewOwner is pending owner: ${isPendingOwner}`)

    if (!isCurrentOwner || isNotCurrentOwner || isPendingOwner) {
      throw new Error('Ownership verification failed')
    }
    console.log('✅ Ownership verification functions working correctly')

    // Step 6: Test two-step ownership transfer (regular address)
    console.log('\n6️⃣ Testing two-step ownership transfer...')

    // Initiate transfer to regular address (not Safe)
    console.log('Initiating ownership transfer to new owner...')
    const transferTx = await poolFactory.connect(deployer).transferOwnership(newOwner.address)
    await transferTx.wait()
    console.log('✅ Ownership transfer initiated')

    // Verify pending status
    const pendingStatus = await poolFactory.getOwnershipStatus()
    console.log(`Current Owner: ${pendingStatus.currentOwner}`)
    console.log(`Pending Owner: ${pendingStatus.pendingOwnerAddress}`)
    console.log(`Has Pending Transfer: ${pendingStatus.hasPendingTransfer}`)

    if (
      pendingStatus.currentOwner !== deployer.address ||
      pendingStatus.pendingOwnerAddress !== newOwner.address ||
      !pendingStatus.hasPendingTransfer
    ) {
      throw new Error('Pending transfer status incorrect')
    }
    console.log('✅ Pending transfer status verified')

    // Test that original owner still has control
    console.log('Testing original owner still has control...')
    await poolFactory.connect(deployer).createPool({
      ...poolParams,
      name: 'Test Pool 2',
      description: 'Second test pool',
    })
    const poolCount2 = await poolFactory.getPoolCount()
    console.log(`✅ Original owner can still create pools. Total pools: ${poolCount2}`)

    // Test that pending owner cannot perform owner functions yet
    console.log('Testing pending owner cannot perform owner functions yet...')
    try {
      await poolFactory.connect(newOwner).createPool({
        ...poolParams,
        name: 'Should Fail',
      })
      throw new Error('Pending owner should not be able to create pools')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      if (errorMessage.includes('OwnableUnauthorizedAccount')) {
        console.log('✅ Pending owner correctly denied access')
      } else {
        throw error
      }
    }

    // Complete the transfer
    console.log('Completing ownership transfer...')
    const acceptTx = await poolFactory.connect(newOwner).acceptOwnership()
    await acceptTx.wait()
    console.log('✅ Ownership transfer completed')

    // Verify final status
    const finalStatus = await poolFactory.getOwnershipStatus()
    console.log(`Final Current Owner: ${finalStatus.currentOwner}`)
    console.log(`Final Pending Owner: ${finalStatus.pendingOwnerAddress}`)
    console.log(`Final Has Pending Transfer: ${finalStatus.hasPendingTransfer}`)

    if (
      finalStatus.currentOwner !== newOwner.address ||
      finalStatus.pendingOwnerAddress !== ethers.ZeroAddress ||
      finalStatus.hasPendingTransfer
    ) {
      throw new Error('Final ownership status incorrect')
    }
    console.log('✅ Final ownership status verified')

    // Step 7: Test new owner functionality
    console.log('\n7️⃣ Testing new owner functionality...')

    // New owner should be able to create pools
    await poolFactory.connect(newOwner).createPool({
      ...poolParams,
      name: 'New Owner Pool',
      description: 'Pool created by new owner',
    })
    const finalPoolCount = await poolFactory.getPoolCount()
    console.log(`✅ New owner can create pools. Total pools: ${finalPoolCount}`)

    // Original owner should no longer have access
    try {
      await poolFactory.connect(deployer).createPool({
        ...poolParams,
        name: 'Should Fail 2',
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

    // Step 8: Test emergency functions
    console.log('\n8️⃣ Testing emergency functions...')

    // Test emergency pause
    const pausedBefore = await poolFactory.paused()
    console.log(`Paused before: ${pausedBefore}`)

    await poolFactory.connect(newOwner).emergencyPause()
    const pausedAfter = await poolFactory.paused()
    console.log(`Paused after emergency pause: ${pausedAfter}`)

    if (!pausedAfter) {
      throw new Error('Emergency pause failed')
    }

    // Test emergency unpause
    await poolFactory.connect(newOwner).emergencyUnpause()
    const unpausedAfter = await poolFactory.paused()
    console.log(`Paused after emergency unpause: ${unpausedAfter}`)

    if (unpausedAfter) {
      throw new Error('Emergency unpause failed')
    }
    console.log('✅ Emergency functions working correctly')

    // Step 9: Final verification
    console.log('\n9️⃣ Final verification...')

    const version = await poolFactory.version()
    const implementation = await poolFactory.lendingPoolImplementation()

    console.log(`Contract version: ${version}`)
    console.log(`Implementation address: ${implementation}`)
    console.log(`Final pool count: ${await poolFactory.getPoolCount()}`)
    console.log(`Contract owner: ${await poolFactory.owner()}`)

    console.log('\n🎉 All tests passed successfully!')
    console.log('\n📋 Test Summary:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`✅ PoolFactory deployed and initialized`)
    console.log(`✅ Ownable2Step functionality verified`)
    console.log(`✅ Two-step ownership transfer completed`)
    console.log(`✅ Access control working correctly`)
    console.log(`✅ Emergency functions operational`)
    console.log(`✅ Pool creation and management functional`)
    console.log(`📊 Final pool count: ${await poolFactory.getPoolCount()}`)
    console.log(`👑 Final owner: ${await poolFactory.owner()}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    return {
      success: true,
      factoryAddress: factoryAddress,
      implementationAddress: implementationAddress,
      finalOwner: newOwner.address,
      poolCount: await poolFactory.getPoolCount(),
    }
  } catch (error) {
    console.error('❌ Test failed:', error)
    throw error
  }
}

async function main() {
  await testLocalFlow()
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

export { testLocalFlow }
