import * as dotenv from 'dotenv'
import { ethers, network, run, upgrades } from 'hardhat'

dotenv.config()

/**
 * Verify a contract with retry logic
 */
async function verifyContract(
  contractName: string,
  address: string,
  constructorArgs: unknown[] = [],
  maxRetries: number = 3
): Promise<void> {
  // Skip verification for local networks
  if (network.name === 'localhost' || network.name === 'hardhat' || network.name === 'hardhatFork') {
    console.log(`   ⏭️ Skipping verification for ${contractName} on local network`)
    return
  }

  // Check if API key is configured
  if (!process.env.ETHERSCAN_API_KEY || process.env.ETHERSCAN_API_KEY === '') {
    console.log(`   ⚠️ ETHERSCAN_API_KEY not configured, skipping verification for ${contractName}`)
    return
  }

  console.log(`\n🔍 Verifying ${contractName} at ${address}...`)

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`   🔄 Retry attempt ${attempt}/${maxRetries}...`)
        // Wait before retry (exponential backoff)
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000))
      }

      await run('verify:verify', {
        address: address,
        constructorArguments: constructorArgs,
      })

      console.log(`   ✅ ${contractName} verified successfully`)
      return
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      if (errorMessage.toLowerCase().includes('already verified')) {
        console.log(`   ✅ ${contractName} is already verified`)
        return
      }

      if (attempt === maxRetries) {
        console.log(`   ❌ Failed to verify ${contractName}: ${errorMessage}`)
        console.log(`   🔧 Manual verification command:`)
        console.log(
          `      pnpm hardhat verify --network ${network.name} ${address}${
            constructorArgs.length > 0 ? ' ' + constructorArgs.join(' ') : ''
          }`
        )
        return
      }

      console.log(`   ⚠️ Attempt ${attempt} failed: ${errorMessage}`)
    }
  }
}

/**
 * Wait for a number of block confirmations
 */
async function waitForConfirmations(txHash: string, confirmations: number = 5): Promise<void> {
  if (network.name === 'localhost' || network.name === 'hardhat') {
    return // Skip on local networks
  }

  console.log(`   ⏳ Waiting for ${confirmations} block confirmations...`)
  const receipt = await ethers.provider.waitForTransaction(txHash, confirmations)
  console.log(`   ✅ Transaction confirmed in block ${receipt?.blockNumber}`)
}

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

    // Wait for confirmations before verification
    await waitForConfirmations(lendingPoolImplementation.deploymentTransaction()?.hash || '')

    // Verify SampleLendingPool implementation
    await verifyContract('SampleLendingPool', implementationAddress, [])

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

    // Wait for confirmations before verification
    await waitForConfirmations(poolFactory.deploymentTransaction()?.hash || '')

    // Verify PoolFactory implementation first
    await verifyContract('PoolFactory Implementation', factoryImplementationAddress, [])

    // Verify PoolFactory proxy (this might fail, but that's normal for proxies)
    await verifyContract('PoolFactory Proxy', factoryAddress, [])

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

    // Verification summary
    if (network.name !== 'localhost' && network.name !== 'hardhat' && network.name !== 'hardhatFork') {
      console.log('\n📋 Contract Verification Summary:')
      console.log(`   🔗 View contracts on Polygonscan:`)
      console.log(
        `   - SampleLendingPool: https://${network.name === 'polygonAmoy' ? 'amoy.' : ''}polygonscan.com/address/${implementationAddress}`
      )
      console.log(`   - PoolFactory: https://${network.name === 'polygonAmoy' ? 'amoy.' : ''}polygonscan.com/address/${factoryAddress}`)
      console.log(
        `   - PoolFactory Implementation: https://${
          network.name === 'polygonAmoy' ? 'amoy.' : ''
        }polygonscan.com/address/${factoryImplementationAddress}`
      )
      if (samplePoolAddress) {
        console.log(
          `   - Sample Pool: https://${network.name === 'polygonAmoy' ? 'amoy.' : ''}polygonscan.com/address/${samplePoolAddress}`
        )
      }
    }

    console.log('\nNext steps:')
    console.log('1. ✅ Contracts automatically verified (if on public network)')
    console.log('2. Create additional pools using PoolFactory.createPool()')
    console.log('3. Fund pools by calling depositFunds() with ETH')
    console.log('4. Test loan creation with createLoan()')
    console.log('5. Set up multi-sig Safe for production ownership transfer')

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
