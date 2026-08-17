import * as dotenv from 'dotenv'
import { mkdirSync, writeFileSync } from 'fs'
import { ethers, network, run, upgrades } from 'hardhat'
import { join } from 'path'

dotenv.config()

/**
 * Hardhat's first default account. This key is published in Hardhat's own docs
 * and funded only on throwaway local chains — it is printed here so local
 * backend setup is copy-pasteable. Never use it on a live network.
 */
const HARDHAT_ACCOUNT_0_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

/**
 * Verify a contract with retry logic (skips on localhost)
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
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000))
      }

      await run('verify:verify', {
        address: address,
        constructorArguments: constructorArgs,
      })

      console.log(`   ✅ ${contractName} verified successfully`)
      return
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      if (errorMessage.toLowerCase().includes('already verified')) {
        console.log(`   ✅ ${contractName} is already verified`)
        return
      }

      if (attempt === maxRetries) {
        console.log(`   ❌ Failed to verify ${contractName}: ${errorMessage}`)
        return
      }

      console.log(`   ⚠️ Attempt ${attempt} failed: ${errorMessage}`)
    }
  }
}

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
    // Step 1: Deploy LendingPool Implementation
    console.log('\n1️⃣ Deploying LendingPool implementation...')
    const LendingPool = await ethers.getContractFactory('LendingPool')
    const lendingPoolImplementation = await LendingPool.deploy()
    await lendingPoolImplementation.waitForDeployment()
    const implementationAddress = await lendingPoolImplementation.getAddress()

    console.log('✅ LendingPool implementation deployed to:', implementationAddress)

    // Verify LendingPool implementation
    await verifyContract('LendingPool', implementationAddress, [])

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

    // Verify PoolFactory implementation
    await verifyContract('PoolFactory Implementation', factoryImplementationAddress, [])

    // Verify PoolFactory proxy (will skip on localhost)
    await verifyContract('PoolFactory Proxy', factoryAddress, [])

    // Step 3: Enable whitelist mode and authorize the sample creators
    //
    // This mirrors production: `createPool` is guarded by `onlyAuthorizedCreator`,
    // and in the real flow the backend authorizes a wallet on demand (lazy
    // whitelisting) before the user sends their own creation transaction. Doing
    // the same here means the local chain exercises the same authorization path
    // instead of letting the factory owner bypass it.
    console.log('\n3️⃣ Enabling whitelist mode and authorizing sample creators...')

    const whitelistTx = await poolFactory.setWhitelistMode(true)
    await whitelistTx.wait()
    console.log('   ✅ Whitelist mode enabled')

    // Step 4: Create sample pools, each from its own creator account
    //
    // `PoolParams` no longer carries `poolOwner` — the factory sets
    // `poolOwner = msg.sender` — so ownership is decided by who sends the
    // transaction, not by a field in the struct.
    console.log('\n4️⃣ Creating sample pools for local testing...')

    const samplePools = [
      {
        creator: accounts[1], // Different owner for testing
        maxLoanAmount: ethers.parseEther('5'),
        interestRate: 500, // 5%
        loanDuration: 7 * 24 * 60 * 60, // 7 days
        name: 'Quick Loans Pool',
        description: 'Short-term loans with fast approval',
        requiresMembership: false,
        loanToken: ethers.ZeroAddress,
      },
      {
        creator: accounts[2],
        maxLoanAmount: ethers.parseEther('20'),
        interestRate: 750, // 7.5%
        loanDuration: 30 * 24 * 60 * 60, // 30 days
        name: 'Medium Term Pool',
        description: 'Medium-term loans for moderate amounts',
        requiresMembership: false,
        loanToken: ethers.ZeroAddress,
      },
      {
        creator: deployer,
        maxLoanAmount: ethers.parseEther('100'),
        interestRate: 1000, // 10%
        loanDuration: 90 * 24 * 60 * 60, // 90 days
        name: 'Large Loan Pool',
        description: 'High-value loans with extended terms',
        requiresMembership: false,
        loanToken: ethers.ZeroAddress,
      },
    ]

    // Authorize every non-owner creator up front (the factory owner is always
    // authorized, so the deployer needs no explicit entry).
    for (const { creator } of samplePools) {
      if (creator.address === deployer.address) continue
      const authTx = await poolFactory.setCreatorAuthorization(creator.address, true)
      await authTx.wait()
      console.log(`   ✅ Authorized creator ${creator.address}`)
    }

    const createdPools = []

    for (let i = 0; i < samplePools.length; i++) {
      const { creator, ...poolParams } = samplePools[i]
      console.log(`\n   Creating pool ${i + 1}: ${poolParams.name}`)
      console.log(`   - Owner (tx sender): ${creator.address}`)
      console.log(`   - Max Loan: ${ethers.formatEther(poolParams.maxLoanAmount)} ETH`)
      console.log(`   - Interest: ${poolParams.interestRate / 100}%`)
      console.log(`   - Duration: ${poolParams.loanDuration / (24 * 60 * 60)} days`)

      const createPoolTx = await poolFactory.connect(creator).createPool(poolParams)
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
          owner: creator.address,
        })
        console.log(`   ✅ Pool created at: ${poolAddress}`)
      }
    }

    // Step 5: Fund pools with test liquidity
    console.log('\n5️⃣ Funding pools with test liquidity...')

    for (let i = 0; i < createdPools.length; i++) {
      const pool = createdPools[i]
      const poolContract = await ethers.getContractAt('LendingPool', pool.address)

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
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.log(`   ⚠️  Could not fund ${pool.name}:`, errorMessage)
      }
    }

    // Step 6: Display comprehensive deployment info
    console.log('\n6️⃣ Deployment Summary')
    console.log('================================')

    // Renamed to avoid shadowing hardhat's `network` import, which the
    // deployment record below needs for the target network's name.
    const providerNetwork = await ethers.provider.getNetwork()
    const totalPools = await poolFactory.getPoolCount()

    console.log(`📍 Network: ${providerNetwork.name} (${providerNetwork.chainId})`)
    console.log(`🏭 Factory Address: ${factoryAddress}`)
    console.log(`📊 Total Pools Created: ${totalPools}`)

    console.log(`\n📋 Created Pools:`)
    for (const pool of createdPools) {
      console.log(`   ${pool.id}. ${pool.name}`)
      console.log(`      Address: ${pool.address}`)
      console.log(`      Owner: ${pool.owner}`)
    }

    // Step 7: Create test accounts summary
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
    console.log(`   const pool = await ethers.getContractAt("LendingPool", "${createdPools[0]?.address}");`)

    console.log('\n🎉 LOCAL deployment completed successfully!')
    console.log('\n📱 Mobile App Configuration:')
    console.log(`   Add to your mobile app's network configuration:`)
    console.log(`   - Network: Localhost`)
    console.log(`   - RPC URL: http://localhost:8545`)
    console.log(`   - Chain ID: 31337`)
    console.log(`   - Factory Address: ${factoryAddress}`)

    // Step 8: Persist the deployment record
    //
    // Printing the addresses is not enough — the backend and the mobile app
    // both need the PoolFactory address, and re-reading scrollback to find it
    // is how deployment state ends up untracked. Write it to a file the rest
    // of the monorepo can read.
    const deploymentInfo = {
      network: {
        name: 'localhost',
        chainId: Number(providerNetwork.chainId),
        rpcUrl: 'http://127.0.0.1:8545',
      },
      timestamp: new Date().toISOString(),
      deployer: deployer.address,
      whitelistMode: await poolFactory.isWhitelistEnabled(),
      contracts: {
        lendingPoolImplementation: implementationAddress,
        // Every pool proxies through this; upgrading it upgrades them all.
        poolBeacon: await poolFactory.poolBeacon(),
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

    const deploymentsDir = join(__dirname, '..', 'deployments')
    mkdirSync(deploymentsDir, { recursive: true })
    const deploymentPath = join(deploymentsDir, `${network.name}.json`)
    writeFileSync(deploymentPath, `${JSON.stringify(deploymentInfo, null, 2)}\n`)

    console.log(`\n📄 Deployment record written to: ${deploymentPath}`)
    console.log('\n🔑 Backend configuration (packages/backend/.env):')
    console.log(`   CHAIN_ID=${deploymentInfo.network.chainId}`)
    console.log(`   CHAIN_NAME=Localhost`)
    console.log(`   RPC_URL=${deploymentInfo.network.rpcUrl}`)
    console.log(`   POOL_FACTORY_ADDRESS=${factoryAddress}`)
    console.log(`   BACKEND_WALLET_PRIVATE_KEY=${HARDHAT_ACCOUNT_0_PRIVATE_KEY}`)
    console.log('')
    console.log(`   The backend wallet must be the factory owner (${deployer.address},`)
    console.log('   Hardhat account #0): lazy whitelisting calls setCreatorAuthorization,')
    console.log('   which is onlyOwner. The key above is the well-known Hardhat test key —')
    console.log('   it is safe here and must never be used on a live network.')
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
