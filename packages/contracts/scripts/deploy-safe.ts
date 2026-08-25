import { isMain } from './lib/main'
import { isLocalNetwork } from './lib/verification'
import { safeContractNetworks, safeRpcUrl } from './lib/safe'
import { signerKeyFor } from './lib/accounts'
import { ethers, network } from '../hardhat.connection'
import Safe, { PredictedSafeProps, SafeAccountConfig } from '@safe-global/protocol-kit'
import * as dotenv from 'dotenv'

dotenv.config()

interface SafeConfig {
  owners: string[]
  threshold: number
  saltNonce?: string
}

interface DeploymentResult {
  safeAddress: string
  owners: string[]
  threshold: number
  deploymentTransaction?: string
  networkName: string
  chainId: number
}

/**
 * Deploy a Safe wallet with configurable parameters
 */
async function deploySafe(config: SafeConfig): Promise<DeploymentResult> {
  console.log('🏗️  Deploying Safe wallet...')
  console.log('Configuration:')
  console.log('- Owners:', config.owners)
  console.log('- Threshold:', config.threshold)
  console.log('- Network:', network.name)

  // Validate configuration
  if (config.owners.length === 0) {
    throw new Error('At least one owner is required')
  }
  if (config.threshold > config.owners.length) {
    throw new Error('Threshold cannot be greater than number of owners')
  }
  if (config.threshold < 1) {
    throw new Error('Threshold must be at least 1')
  }

  // Validate all owners are valid addresses
  for (const owner of config.owners) {
    if (!ethers.isAddress(owner)) {
      throw new Error(`Invalid owner address: ${owner}`)
    }
  }

  // Get the deployer signer
  const [deployer] = await ethers.getSigners()
  console.log('Deployer address:', deployer.address)

  const balance = await ethers.provider.getBalance(deployer.address)
  console.log('Deployer balance:', ethers.formatEther(balance), 'ETH')

  try {
    // Prepare Safe configuration
    const safeAccountConfig: SafeAccountConfig = {
      owners: config.owners,
      threshold: config.threshold,
    }

    console.log('\n📋 Safe account configuration:')
    console.log('- Owners:', safeAccountConfig.owners)
    console.log('- Threshold:', safeAccountConfig.threshold)

    // Prepare predicted Safe configuration
    const predictedSafe: PredictedSafeProps = {
      safeAccountConfig,
      safeDeploymentConfig: {
        saltNonce: config.saltNonce,
      },
    }

    // Initialize Safe SDK with predicted Safe
    console.log('\n🚀 Initializing Safe SDK...')

    // On a chain the Safe registry does not know — a bare local node — this
    // deploys Safe onto it first and returns where. Elsewhere it is `undefined`
    // and the SDK resolves the canonical addresses itself. See `lib/safe.ts`.
    const contractNetworks = await safeContractNetworks(deployer)

    const safeSdk = await Safe.init({
      provider: safeRpcUrl(),
      signer: signerKeyFor(deployer.address),
      predictedSafe,
      contractNetworks,
    })

    // Get predicted Safe address
    const predictedSafeAddress = await safeSdk.getAddress()
    console.log('Predicted Safe address:', predictedSafeAddress)

    // Create deployment transaction
    console.log('\n🚀 Creating deployment transaction...')
    const deploymentTransaction = await safeSdk.createSafeDeploymentTransaction()

    // Execute deployment transaction
    console.log('🚀 Executing deployment transaction...')
    const txResponse = await deployer.sendTransaction({
      to: deploymentTransaction.to,
      value: deploymentTransaction.value,
      data: deploymentTransaction.data,
    })

    console.log('Deployment transaction hash:', txResponse.hash)

    // Wait for confirmation
    console.log('⏳ Waiting for transaction confirmation...')
    const receipt = await txResponse.wait()
    console.log('✅ Safe deployed in block:', receipt?.blockNumber)

    // Connect to the deployed Safe
    console.log('\n🔗 Connecting to deployed Safe...')
    const deployedSafeSdk = await safeSdk.connect({
      safeAddress: predictedSafeAddress,
    })

    const safeAddress = await deployedSafeSdk.getAddress()
    console.log('✅ Safe deployed at:', safeAddress)

    // Verify deployment
    console.log('\n🔍 Verifying Safe deployment...')
    const deployedOwners = await deployedSafeSdk.getOwners()
    const deployedThreshold = await deployedSafeSdk.getThreshold()

    console.log('Verification results:')
    console.log('- Deployed owners:', deployedOwners)
    console.log('- Deployed threshold:', deployedThreshold)
    console.log('- Safe version:', await deployedSafeSdk.getContractVersion())

    // Verify configuration matches
    if (deployedOwners.length !== config.owners.length) {
      throw new Error('Owner count mismatch')
    }
    if (deployedThreshold !== config.threshold) {
      throw new Error('Threshold mismatch')
    }

    // Check that all expected owners are present
    for (const expectedOwner of config.owners) {
      if (!deployedOwners.includes(expectedOwner)) {
        throw new Error(`Expected owner ${expectedOwner} not found in deployed Safe`)
      }
    }

    console.log('✅ Safe deployment verification successful!')

    // Get network information
    const networkInfo = await ethers.provider.getNetwork()

    const result: DeploymentResult = {
      safeAddress,
      owners: deployedOwners,
      threshold: deployedThreshold,
      deploymentTransaction: txResponse.hash,
      networkName: network.name,
      chainId: Number(networkInfo.chainId),
    }

    // Display explorer links for non-local networks
    if (!isLocalNetwork()) {
      let explorerUrl = ''
      if (network.name === 'polygonAmoy') {
        explorerUrl = `https://amoy.polygonscan.com/address/${safeAddress}`
      } else if (network.name === 'polygon') {
        explorerUrl = `https://polygonscan.com/address/${safeAddress}`
      }

      if (explorerUrl) {
        console.log(`\n🔗 View Safe on explorer: ${explorerUrl}`)
      }
    }

    return result
  } catch (error) {
    console.error('❌ Safe deployment failed:', error)
    throw error
  }
}

/**
 * Get default Safe configuration for different environments
 */
function getDefaultSafeConfig(environment: 'local' | 'testnet' | 'mainnet'): SafeConfig {
  switch (environment) {
    case 'local':
      // For local testing, use first 3 accounts from Hardhat
      return {
        owners: [
          '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', // Account 0
          '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', // Account 1
          '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', // Account 2
        ],
        threshold: 2,
        saltNonce: '0x1234567890abcdef',
      }
    case 'testnet': {
      // For testnet, use environment variables
      const testnetOwners = process.env.SAFE_OWNERS?.split(',') || []
      const testnetThreshold = parseInt(process.env.SAFE_THRESHOLD || '2')

      if (testnetOwners.length === 0) {
        throw new Error('SAFE_OWNERS environment variable not set for testnet deployment')
      }

      return {
        owners: testnetOwners,
        threshold: testnetThreshold,
        saltNonce: process.env.SAFE_SALT_NONCE,
      }
    }
    case 'mainnet': {
      // For mainnet, use environment variables with strict validation
      const mainnetOwners = process.env.SAFE_OWNERS?.split(',') || []
      const mainnetThreshold = parseInt(process.env.SAFE_THRESHOLD || '3')

      if (mainnetOwners.length === 0) {
        throw new Error('SAFE_OWNERS environment variable not set for mainnet deployment')
      }
      if (mainnetThreshold < 2) {
        throw new Error('Mainnet Safe threshold must be at least 2')
      }

      return {
        owners: mainnetOwners,
        threshold: mainnetThreshold,
        saltNonce: process.env.SAFE_SALT_NONCE,
      }
    }
    default:
      throw new Error(`Unknown environment: ${environment}`)
  }
}

async function main() {
  console.log('🛡️  Safe Wallet Deployment Script')
  console.log('================================')

  try {
    // Determine environment based on network
    let environment: 'local' | 'testnet' | 'mainnet'
    if (isLocalNetwork()) {
      environment = 'local'
    } else if (network.name === 'polygonAmoy' || network.name.includes('test')) {
      environment = 'testnet'
    } else {
      environment = 'mainnet'
    }

    console.log(`Environment: ${environment}`)
    console.log(`Network: ${network.name}`)

    // Get Safe configuration
    const safeConfig = getDefaultSafeConfig(environment)

    // Deploy Safe
    const result = await deploySafe(safeConfig)

    // Display results
    console.log('\n🎉 Safe deployment completed successfully!')
    console.log('\n📋 Deployment Summary:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`Safe Address: ${result.safeAddress}`)
    console.log(`Network: ${result.networkName} (Chain ID: ${result.chainId})`)
    console.log(`Owners: ${result.owners.length}`)
    result.owners.forEach((owner, index) => {
      console.log(`  ${index + 1}. ${owner}`)
    })
    console.log(`Threshold: ${result.threshold}`)
    if (result.deploymentTransaction) {
      console.log(`Deployment TX: ${result.deploymentTransaction}`)
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    // Save deployment info
    const deploymentInfo = {
      timestamp: new Date().toISOString(),
      network: result.networkName,
      chainId: result.chainId,
      safeAddress: result.safeAddress,
      owners: result.owners,
      threshold: result.threshold,
      deploymentTransaction: result.deploymentTransaction,
      configuration: safeConfig,
    }

    console.log('\n📄 Deployment Configuration:')
    console.log(JSON.stringify(deploymentInfo, null, 2))

    console.log('\n📝 Next Steps:')
    console.log('1. ✅ Safe wallet deployed and verified')
    console.log('2. Transfer PoolFactory ownership to Safe using transfer-ownership.ts')
    console.log('3. Test Safe functionality by executing transactions')
    console.log('4. Set up Safe management procedures and documentation')
  } catch (error) {
    console.error('❌ Script execution failed:', error)
    process.exit(1)
  }
}

// Only run if this file is executed directly
if (isMain(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}

// Export functions for use in other scripts
export { DeploymentResult, deploySafe, getDefaultSafeConfig, SafeConfig }
