import * as dotenv from 'dotenv'
import { ethers, upgrades } from 'hardhat'

dotenv.config()

async function main() {
  console.log('Starting deployment...')

  // Get the deployer account
  const [deployer] = await ethers.getSigners()
  console.log('Deploying contracts with account:', deployer.address)

  const balance = await ethers.provider.getBalance(deployer.address)
  console.log('Account balance:', ethers.formatEther(balance), 'ETH')

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

    // Get factory implementation address for verification
    const factoryImplementationAddress = await upgrades.erc1967.getImplementationAddress(factoryAddress)
    console.log('📋 PoolFactory implementation address:', factoryImplementationAddress)

    // Step 3: Create a sample pool through the factory
    console.log('\n3️⃣ Creating sample pool through factory...')

    const samplePoolParams = {
      poolOwner: deployer.address,
      maxLoanAmount: ethers.parseEther('10'), // 10 ETH max loan
      interestRate: 500, // 5% (in basis points)
      loanDuration: 30 * 24 * 60 * 60, // 30 days in seconds
      name: 'SuperPool Sample Lending Pool',
      description: 'A sample lending pool for testing and demonstration purposes',
    }

    console.log('Sample pool parameters:')
    console.log('- Max Loan Amount:', ethers.formatEther(samplePoolParams.maxLoanAmount), 'ETH')
    console.log('- Interest Rate:', samplePoolParams.interestRate / 100, '%')
    console.log('- Loan Duration:', samplePoolParams.loanDuration / (24 * 60 * 60), 'days')
    console.log('- Name:', samplePoolParams.name)

    const createPoolTx = await poolFactory.createPool(samplePoolParams)
    const receipt = await createPoolTx.wait()

    // Get the created pool address from the event
    const poolCreatedEvent = receipt?.logs.find((log) => log.topics[0] === poolFactory.interface.getEvent('PoolCreated').topicHash)

    let samplePoolAddress = ''
    if (poolCreatedEvent) {
      const decodedEvent = poolFactory.interface.decodeEventLog('PoolCreated', poolCreatedEvent.data, poolCreatedEvent.topics)
      samplePoolAddress = decodedEvent.poolAddress
      console.log('✅ Sample pool created at:', samplePoolAddress)
    }

    // Step 4: Verify deployments
    console.log('\n4️⃣ Verifying deployments...')

    // Verify factory
    console.log('Factory verification:')
    const factoryVersion = await poolFactory.version()
    const poolCount = await poolFactory.getPoolCount()
    console.log('- Factory version:', factoryVersion)
    console.log('- Total pools created:', poolCount.toString())
    console.log('- Implementation address:', await poolFactory.lendingPoolImplementation())

    // Verify sample pool if created
    if (samplePoolAddress) {
      const samplePool = await ethers.getContractAt('SampleLendingPool', samplePoolAddress)
      const poolConfig = await samplePool.poolConfig()
      console.log('\nSample pool verification:')
      console.log('- Pool owner:', await samplePool.owner())
      console.log('- Pool active:', poolConfig.isActive)
      console.log('- Max loan amount:', ethers.formatEther(poolConfig.maxLoanAmount), 'ETH')
      console.log('- Interest rate:', poolConfig.interestRate, 'basis points')
      console.log('- Loan duration:', poolConfig.loanDuration, 'seconds')
      console.log('- Pool version:', await samplePool.version())
    }

    console.log('\n🎉 All deployments completed successfully!')
    console.log('\nNext steps:')
    console.log('1. Verify contracts on Polygonscan:')
    console.log(`   pnpm verify ${implementationAddress}`)
    console.log(`   pnpm verify ${factoryImplementationAddress}`)
    console.log('2. Create additional pools using PoolFactory.createPool()')
    console.log('3. Fund pools by calling depositFunds() with ETH')
    console.log('4. Test loan creation with createLoan()')

    // Save comprehensive deployment info
    const deploymentInfo = {
      network: await ethers.provider.getNetwork(),
      timestamp: new Date().toISOString(),
      deployer: deployer.address,
      contracts: {
        lendingPoolImplementation: implementationAddress,
        poolFactory: {
          proxy: factoryAddress,
          implementation: factoryImplementationAddress,
        },
        samplePool: samplePoolAddress || null,
      },
      samplePoolParameters: samplePoolParams,
    }

    console.log('\n📄 Deployment Info:')
    console.log(JSON.stringify(deploymentInfo, null, 2))
  } catch (error) {
    console.error('❌ Deployment failed:')
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
