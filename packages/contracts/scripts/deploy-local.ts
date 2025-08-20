import * as dotenv from 'dotenv'
import { ethers, upgrades } from 'hardhat'

dotenv.config()

async function main() {
  console.log('🚀 Starting LOCAL deployment...')

  // Get all available accounts for local development
  const accounts = await ethers.getSigners()
  const deployer = accounts[0]

  console.log('📋 Available accounts for testing:')
  for (let i = 0; i < Math.min(accounts.length, 10); i++) {
    const balance = await ethers.provider.getBalance(accounts[i].address)
    console.log(`  [${i}] ${accounts[i].address} - ${ethers.formatEther(balance)} ETH`)
  }

  console.log(`\n🔧 Deploying with account: ${deployer.address}`)
  const deployerBalance = await ethers.provider.getBalance(deployer.address)
  console.log(`💰 Deployer balance: ${ethers.formatEther(deployerBalance)} ETH`)

  try {
    // Step 1: Deploy SampleLendingPool Implementation
    console.log('\n1️⃣ Deploying SampleLendingPool implementation...')
    const SampleLendingPool = await ethers.getContractFactory('SampleLendingPool')
    const lendingPoolImplementation = await SampleLendingPool.deploy()
    await lendingPoolImplementation.waitForDeployment()
    const implementationAddress = await lendingPoolImplementation.getAddress()

    console.log('✅ SampleLendingPool implementation deployed to:', implementationAddress)

    // Step 2: Deploy PoolFactory
    console.log('\n2️⃣ Deploying PoolFactory...')
    const PoolFactory = await ethers.getContractFactory('PoolFactory')

    const poolFactory = await upgrades.deployProxy(
      PoolFactory,
      [
        deployer.address, // factory owner
        implementationAddress, // lending pool implementation
      ],
      {
        initializer: 'initialize',
        kind: 'uups',
      }
    )

    await poolFactory.waitForDeployment()
    const factoryAddress = await poolFactory.getAddress()

    console.log('✅ PoolFactory deployed to:', factoryAddress)

    // Get factory implementation address
    const factoryImplementationAddress = await upgrades.erc1967.getImplementationAddress(factoryAddress)
    console.log('📋 PoolFactory implementation address:', factoryImplementationAddress)

    // Step 3: Create multiple sample pools for testing
    console.log('\n3️⃣ Creating sample pools for local testing...')

    const samplePools = [
      {
        poolOwner: accounts[1].address, // Different owner for testing
        maxLoanAmount: ethers.parseEther('5'),
        interestRate: 500, // 5%
        loanDuration: 7 * 24 * 60 * 60, // 7 days
        name: 'Quick Loans Pool',
        description: 'Short-term loans with fast approval',
      },
      {
        poolOwner: accounts[2].address,
        maxLoanAmount: ethers.parseEther('20'),
        interestRate: 750, // 7.5%
        loanDuration: 30 * 24 * 60 * 60, // 30 days
        name: 'Medium Term Pool',
        description: 'Medium-term loans for moderate amounts',
      },
      {
        poolOwner: deployer.address,
        maxLoanAmount: ethers.parseEther('100'),
        interestRate: 1000, // 10%
        loanDuration: 90 * 24 * 60 * 60, // 90 days
        name: 'Large Loan Pool',
        description: 'High-value loans with extended terms',
      },
    ]

    const createdPools = []

    for (let i = 0; i < samplePools.length; i++) {
      const poolParams = samplePools[i]
      console.log(`\n   Creating pool ${i + 1}: ${poolParams.name}`)
      console.log(`   - Owner: ${poolParams.poolOwner}`)
      console.log(`   - Max Loan: ${ethers.formatEther(poolParams.maxLoanAmount)} ETH`)
      console.log(`   - Interest: ${poolParams.interestRate / 100}%`)
      console.log(`   - Duration: ${poolParams.loanDuration / (24 * 60 * 60)} days`)

      const createPoolTx = await poolFactory.createPool(poolParams)
      const receipt = await createPoolTx.wait()

      // Get the created pool address from the event
      const poolCreatedEvent = receipt?.logs.find((log) => log.topics[0] === poolFactory.interface.getEvent('PoolCreated').topicHash)

      if (poolCreatedEvent) {
        const decodedEvent = poolFactory.interface.decodeEventLog('PoolCreated', poolCreatedEvent.data, poolCreatedEvent.topics)
        const poolAddress = decodedEvent.poolAddress
        createdPools.push({
          id: i + 1,
          address: poolAddress,
          name: poolParams.name,
          owner: poolParams.poolOwner,
        })
        console.log(`   ✅ Pool created at: ${poolAddress}`)
      }
    }

    // Step 4: Fund pools with test liquidity
    console.log('\n4️⃣ Funding pools with test liquidity...')

    for (let i = 0; i < createdPools.length; i++) {
      const pool = createdPools[i]
      const poolContract = await ethers.getContractAt('SampleLendingPool', pool.address)

      // Get the pool owner account
      const ownerAccount = accounts.find((acc) => acc.address === pool.owner) || deployer
      const poolWithOwner = poolContract.connect(ownerAccount)

      // Fund each pool with some test ETH
      const fundAmount = ethers.parseEther('50') // 50 ETH per pool

      console.log(`   Funding ${pool.name} with ${ethers.formatEther(fundAmount)} ETH...`)

      try {
        const fundTx = await poolWithOwner.depositFunds({ value: fundAmount })
        await fundTx.wait()
        console.log(`   ✅ ${pool.name} funded successfully`)
      } catch (error: any) {
        console.log(`   ⚠️  Could not fund ${pool.name}:`, error.message)
      }
    }

    // Step 5: Display comprehensive deployment info
    console.log('\n5️⃣ Deployment Summary')
    console.log('================================')

    const network = await ethers.provider.getNetwork()
    const totalPools = await poolFactory.getPoolCount()

    console.log(`📍 Network: ${network.name} (${network.chainId})`)
    console.log(`🏭 Factory Address: ${factoryAddress}`)
    console.log(`📊 Total Pools Created: ${totalPools}`)

    console.log(`\n📋 Created Pools:`)
    for (const pool of createdPools) {
      console.log(`   ${pool.id}. ${pool.name}`)
      console.log(`      Address: ${pool.address}`)
      console.log(`      Owner: ${pool.owner}`)
    }

    // Step 6: Create test accounts summary
    console.log(`\n👥 Test Accounts Summary:`)
    console.log(`   Deployer (Account 0): ${deployer.address}`)
    console.log(`   Pool Owner 1 (Account 1): ${accounts[1]?.address || 'N/A'}`)
    console.log(`   Pool Owner 2 (Account 2): ${accounts[2]?.address || 'N/A'}`)
    console.log(`   Test User 1 (Account 3): ${accounts[3]?.address || 'N/A'}`)
    console.log(`   Test User 2 (Account 4): ${accounts[4]?.address || 'N/A'}`)

    console.log(`\n🔧 Quick Test Commands:`)
    console.log(`   # Connect to your local node`)
    console.log(`   npx hardhat console --network localhost`)
    console.log(``)
    console.log(`   # Get factory instance`)
    console.log(`   const factory = await ethers.getContractAt("PoolFactory", "${factoryAddress}");`)
    console.log(``)
    console.log(`   # Get pool instance`)
    console.log(`   const pool = await ethers.getContractAt("SampleLendingPool", "${createdPools[0]?.address}");`)

    console.log('\n🎉 LOCAL deployment completed successfully!')
    console.log('\n📱 Mobile App Configuration:')
    console.log(`   Add to your mobile app's network configuration:`)
    console.log(`   - Network: Localhost`)
    console.log(`   - RPC URL: http://localhost:8545`)
    console.log(`   - Chain ID: 31337`)
    console.log(`   - Factory Address: ${factoryAddress}`)

    // Save deployment info for mobile app
    const deploymentInfo = {
      network: {
        name: 'localhost',
        chainId: 31337,
        rpcUrl: 'http://localhost:8545',
      },
      timestamp: new Date().toISOString(),
      deployer: deployer.address,
      contracts: {
        lendingPoolImplementation: implementationAddress,
        poolFactory: {
          proxy: factoryAddress,
          implementation: factoryImplementationAddress,
        },
      },
      samplePools: createdPools,
      testAccounts: {
        deployer: deployer.address,
        poolOwners: [accounts[1]?.address, accounts[2]?.address].filter(Boolean),
        testUsers: [accounts[3]?.address, accounts[4]?.address, accounts[5]?.address].filter(Boolean),
      },
    }

    console.log('\n📄 Deployment Info (save this for mobile app):')
    console.log(JSON.stringify(deploymentInfo, null, 2))
  } catch (error) {
    console.error('❌ LOCAL deployment failed:')
    console.error(error)
    process.exit(1)
  }
}

// Handle errors
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
