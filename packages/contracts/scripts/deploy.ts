import { ethers, network, upgrades } from '../hardhat.connection'
import * as dotenv from 'dotenv'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { isLocalNetwork, verifyContract } from './lib/verification'

dotenv.config()

/**
 * Wait for a number of block confirmations
 */
async function waitForConfirmations(txHash: string, confirmations: number = 5): Promise<void> {
  // Every local network, not just the two that were named here: a fork mines
  // on demand, so waiting for five confirmations on `polygonAmoyFork` waits
  // for blocks nothing is going to produce.
  if (isLocalNetwork()) {
    return
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
    // Step 1: Deploy LendingPool Implementation
    console.log('\n1️⃣ Deploying LendingPool implementation...')
    const LendingPool = await ethers.getContractFactory('LendingPool')
    const lendingPoolImplementation = await LendingPool.deploy()
    await lendingPoolImplementation.waitForDeployment()
    const implementationAddress = await lendingPoolImplementation.getAddress()

    console.log('✅ LendingPool implementation deployed to:', implementationAddress)

    // Wait for confirmations before verification
    await waitForConfirmations(lendingPoolImplementation.deploymentTransaction()?.hash || '')

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

    // Get factory implementation address for verification
    const factoryImplementationAddress = await upgrades.erc1967.getImplementationAddress(factoryAddress)
    console.log('📋 PoolFactory implementation address:', factoryImplementationAddress)

    // Wait for confirmations before verification
    await waitForConfirmations(poolFactory.deploymentTransaction()?.hash || '')

    // Verify PoolFactory implementation first
    await verifyContract('PoolFactory Implementation', factoryImplementationAddress, [])

    // Verify PoolFactory proxy (this might fail, but that's normal for proxies)
    await verifyContract('PoolFactory Proxy', factoryAddress, [])

    /*
     * Step 3: turn the whitelist on, and hand the key to it to the backend.
     *
     * Neither of these was here, and the deployment did not work without them.
     *
     * `setWhitelistMode(true)` is what `deploy-local.ts` has always done and
     * this script never did — and with it off, `onlyAuthorizedCreator` admits
     * the owner and nobody else. So `preparePoolCreation` refuses every user
     * with "pool creation is currently restricted to administrators", and the
     * app's main flow is dead on arrival.
     *
     * `setPoolCreatorAdmin` is what lets the Safe own this factory afterwards.
     * The backend adds a wallet to the creator list on demand and pays the gas,
     * so it has to be able to call `setCreatorAuthorization` — which used to be
     * `onlyOwner`, and therefore required the backend's hot key to *be* the
     * owner: the key that authorises a UUPS upgrade and can repoint the beacon
     * at new pool logic for every pool at once. Appointing the narrow role
     * first means `transfer:ownership:amoy` no longer breaks pool creation.
     */
    console.log('\n3️⃣ Configuring pool creation...')

    const backendWallet = process.env.BACKEND_WALLET_ADDRESS

    const whitelistTx = await poolFactory.setWhitelistMode(true)
    await whitelistTx.wait()
    console.log('✅ Whitelist mode enabled (lazy whitelisting via the backend)')

    if (backendWallet) {
      if (!ethers.isAddress(backendWallet)) {
        throw new Error(`BACKEND_WALLET_ADDRESS is not an address: ${backendWallet}`)
      }

      const adminTx = await poolFactory.setPoolCreatorAdmin(backendWallet)
      await adminTx.wait()
      console.log('✅ Pool creator admin set to:', backendWallet)
    } else {
      console.warn(
        [
          '⚠️  BACKEND_WALLET_ADDRESS is not set, so no pool creator admin was appointed.',
          '   Until one is, only the factory owner can whitelist creators — which means',
          '   `preparePoolCreation` will fail as soon as ownership moves to the Safe.',
          '   Set it and re-run, or call setPoolCreatorAdmin(<backend wallet>) before',
          '   transferring ownership.',
        ].join('\n')
      )
    }

    // Step 4: Create a sample pool through the factory
    console.log('\n4️⃣ Creating sample pool through factory...')

    const samplePoolParams = {
      poolOwner: deployer.address,
      maxLoanAmount: ethers.parseEther('10'), // 10 ETH max loan
      interestRate: 500, // 5% (in basis points)
      loanDuration: 30 * 24 * 60 * 60, // 30 days in seconds
      name: 'SuperPool Sample Lending Pool',
      description: 'A sample lending pool for testing and demonstration purposes',
      requiresMembership: false,
      loanToken: ethers.ZeroAddress,
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

    // Step 5: Verify deployments
    console.log('\n5️⃣ Verifying deployments...')

    // Verify factory
    console.log('Factory verification:')
    const factoryVersion = await poolFactory.version()
    const poolCount = await poolFactory.getPoolCount()
    console.log('- Factory version:', factoryVersion)
    console.log('- Total pools created:', poolCount.toString())
    console.log('- Implementation address:', await poolFactory.lendingPoolImplementation())

    // Verify sample pool if created
    if (samplePoolAddress) {
      const samplePool = await ethers.getContractAt('LendingPool', samplePoolAddress)
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
    if (!isLocalNetwork()) {
      console.log('\n📋 Contract Verification Summary:')
      console.log(`   🔗 View contracts on Polygonscan:`)
      console.log(
        `   - LendingPool: https://${network.name === 'polygonAmoy' ? 'amoy.' : ''}polygonscan.com/address/${implementationAddress}`
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
    console.log('5. Appoint the backend wallet: setPoolCreatorAdmin(<backend wallet>) — before the next step')
    console.log('6. Transfer ownership to the multi-sig Safe: pnpm transfer:ownership:amoy')

    /*
     * Persist the deployment record.
     *
     * This used to `console.log(JSON.stringify(...))` and stop there, so the
     * only network that ever produced a `deployments/<network>.json` was
     * localhost — the one whose addresses matter least, because they are
     * regenerated on demand. Amoy's went to scrollback.
     *
     * The record also could not have said which chain it was for: `network`
     * held ethers' `Network` object, whose name and chain id are private
     * fields, so `JSON.stringify` rendered it as `{}`.
     */
    const providerNetwork = await ethers.provider.getNetwork()
    const factoryReceipt = await poolFactory.deploymentTransaction()?.wait()

    const deploymentInfo = {
      network: {
        name: network.name,
        chainId: Number(providerNetwork.chainId),
        rpcUrl: 'url' in network.config ? network.config.url : '',
      },
      timestamp: new Date().toISOString(),
      deployer: deployer.address,
      /*
       * Where a first event sweep should start. Without it the backend falls
       * back to a short lookback on a public chain, which silently misses every
       * pool created before the backend was pointed at it.
       */
      startBlock: factoryReceipt?.blockNumber ?? 0,
      whitelistMode: await poolFactory.isWhitelistEnabled(),
      contracts: {
        lendingPoolImplementation: implementationAddress,
        // Every pool proxies through this; upgrading it upgrades them all.
        poolBeacon: await poolFactory.poolBeacon(),
        poolFactory: {
          proxy: factoryAddress,
          implementation: factoryImplementationAddress,
        },
        samplePool: samplePoolAddress || null,
      },
      samplePoolParameters: {
        ...samplePoolParams,
        maxLoanAmount: samplePoolParams.maxLoanAmount.toString(),
      },
    }

    const deploymentsDir = join(import.meta.dirname, '..', 'deployments')
    mkdirSync(deploymentsDir, { recursive: true })
    const deploymentPath = join(deploymentsDir, `${network.name}.json`)
    writeFileSync(
      deploymentPath,
      `${JSON.stringify(deploymentInfo, null, 2)}
`
    )

    console.log(`
📄 Deployment record written to: ${deploymentPath}`)
    console.log(`   Emit the .env lines for it with: pnpm env:print --network ${network.name}`)
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
