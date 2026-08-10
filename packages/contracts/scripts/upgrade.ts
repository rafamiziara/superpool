import * as dotenv from 'dotenv'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { ethers, network, upgrades } from 'hardhat'
import { join } from 'path'

dotenv.config()

/**
 * Ship a new contract version to a deployed network.
 *
 * The two deployed contracts upgrade in completely different ways, and
 * confusing them is the trap this script exists to prevent:
 *
 * - **PoolFactory** is a real UUPS proxy (`upgrades.deployProxy`), so it
 *   upgrades in place and keeps its address, its storage and every pool it has
 *   recorded.
 *
 * - **Pools are EIP-1167 minimal proxies** — `PoolFactory.createPool` calls
 *   `lendingPoolImplementation.clone()`. A clone hardcodes its implementation
 *   address in its own bytecode and never reads the ERC-1967 slot, so
 *   **an existing pool can never be upgraded**. `SampleLendingPool` inherits
 *   `UUPSUpgradeable`, but for a cloned pool that machinery is inert: calling
 *   `upgradeToAndCall` on one writes a slot nothing will ever read.
 *
 *   Pointing the factory at a new implementation therefore changes what
 *   *future* pools run. Pools already created keep the code they were cloned
 *   from, for good.
 *
 * Usage:
 *
 *   UPGRADE_TARGET=pool-implementation pnpm upgrade:local   (default)
 *   UPGRADE_TARGET=factory            pnpm upgrade:local
 */

type UpgradeTarget = 'pool-implementation' | 'factory'

interface DeploymentRecord {
  network: { name: string; chainId: number; rpcUrl?: string }
  timestamp: string
  deployer: string
  contracts: {
    lendingPoolImplementation: string
    previousLendingPoolImplementations?: string[]
    poolFactory: { proxy: string; implementation: string }
  }
  [key: string]: unknown
}

function deploymentPath(): string {
  return join(__dirname, '..', 'deployments', `${network.name}.json`)
}

function readDeployment(): DeploymentRecord {
  const path = deploymentPath()

  if (!existsSync(path)) {
    throw new Error(
      `No deployment record at ${path}. Deploy to ${network.name} first — ` +
        `there is nothing to upgrade, and guessing an address is how a proxy gets pointed at the wrong implementation.`
    )
  }

  return JSON.parse(readFileSync(path, 'utf8')) as DeploymentRecord
}

function writeDeployment(record: DeploymentRecord): void {
  writeFileSync(deploymentPath(), `${JSON.stringify(record, null, 2)}\n`)
  console.log(`\n📄 Deployment record updated: ${deploymentPath()}`)
}

/**
 * Deploy a new SampleLendingPool implementation and point the factory at it.
 *
 * Only affects pools created from here on. See the note at the top of the file.
 */
async function upgradePoolImplementation(record: DeploymentRecord): Promise<void> {
  const [signer] = await ethers.getSigners()
  const factoryAddress = record.contracts.poolFactory.proxy
  const currentImplementation = record.contracts.lendingPoolImplementation

  console.log('\n1️⃣ Validating the new implementation...')
  const SampleLendingPool = await ethers.getContractFactory('SampleLendingPool')

  // Catches constructors, immutables, delegatecall and selfdestruct — anything
  // that makes a contract unusable behind a proxy — before it is deployed.
  await upgrades.validateImplementation(SampleLendingPool, { kind: 'uups' })
  console.log('   ✅ Safe to use behind a proxy')

  console.log('\n2️⃣ Deploying the new implementation...')
  const implementation = await SampleLendingPool.deploy()
  await implementation.waitForDeployment()
  const newImplementation = await implementation.getAddress()
  console.log(`   ✅ Deployed to ${newImplementation}`)
  console.log(`   Version: ${await implementation.version()}`)

  if (newImplementation.toLowerCase() === currentImplementation.toLowerCase()) {
    console.log('\n⏭️  The factory already points here. Nothing to do.')
    return
  }

  console.log('\n3️⃣ Pointing the factory at it...')
  const poolFactory = await ethers.getContractAt('PoolFactory', factoryAddress)
  const factoryOwner = await poolFactory.owner()

  if (factoryOwner.toLowerCase() !== signer.address.toLowerCase()) {
    // Expected on any network where ownership has been handed to a Safe.
    const calldata = poolFactory.interface.encodeFunctionData('updateImplementation', [newImplementation])

    console.log(`   ⚠️ ${signer.address} does not own the factory — ${factoryOwner} does.`)
    console.log('   The implementation is deployed; the factory still has to be pointed at it.')
    console.log('\n   Submit this through the owner (a Safe, if ownership was transferred):')
    console.log(`     to:    ${factoryAddress}`)
    console.log(`     data:  ${calldata}`)
    console.log(`     value: 0`)
    console.log('\n   Re-run this script once that transaction executes to update the deployment record.')
    return
  }

  const tx = await poolFactory.updateImplementation(newImplementation)
  console.log(`   ⏳ ${tx.hash}`)
  await tx.wait()
  console.log('   ✅ Factory updated')

  record.contracts.previousLendingPoolImplementations = [
    ...(record.contracts.previousLendingPoolImplementations ?? []),
    currentImplementation,
  ]
  record.contracts.lendingPoolImplementation = newImplementation
  record.timestamp = new Date().toISOString()
  writeDeployment(record)

  const poolCount = await poolFactory.getPoolCount()
  console.log('\n⚠️  Pools are minimal-proxy clones and cannot be upgraded.')
  console.log(`   ${poolCount} existing pool(s) still run ${currentImplementation}.`)
  console.log('   Only pools created from now on get the new implementation.')
}

/**
 * Upgrade the PoolFactory UUPS proxy in place.
 */
async function upgradeFactory(record: DeploymentRecord): Promise<void> {
  const [signer] = await ethers.getSigners()
  const proxyAddress = record.contracts.poolFactory.proxy

  console.log('\n1️⃣ Validating the upgrade against the deployed storage layout...')
  const PoolFactory = await ethers.getContractFactory('PoolFactory')

  // Fails on a layout-breaking change *before* anything touches the proxy.
  await upgrades.validateUpgrade(proxyAddress, PoolFactory, { kind: 'uups' })
  console.log('   ✅ Storage layout is compatible')

  const deployed = await ethers.getContractAt('PoolFactory', proxyAddress)
  const owner = await deployed.owner()

  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    console.log(`   ⚠️ ${signer.address} does not own the proxy — ${owner} does.`)
    console.log('   _authorizeUpgrade is onlyOwner, so this upgrade has to go through the owner.')
    console.log('   Deploy the implementation separately and submit upgradeToAndCall through the Safe.')
    return
  }

  console.log('\n2️⃣ Upgrading the proxy...')
  const upgraded = await upgrades.upgradeProxy(proxyAddress, PoolFactory, { kind: 'uups' })
  await upgraded.waitForDeployment()

  const newImplementation = await upgrades.erc1967.getImplementationAddress(proxyAddress)
  console.log(`   ✅ Proxy ${proxyAddress} now runs ${newImplementation}`)
  console.log(`   Version: ${await deployed.version()}`)

  record.contracts.poolFactory.implementation = newImplementation
  record.timestamp = new Date().toISOString()
  writeDeployment(record)
}

async function main() {
  const target = (process.env.UPGRADE_TARGET ?? 'pool-implementation') as UpgradeTarget

  if (target !== 'pool-implementation' && target !== 'factory') {
    throw new Error(`Unknown UPGRADE_TARGET "${target}". Use "pool-implementation" or "factory".`)
  }

  const [signer] = await ethers.getSigners()
  const record = readDeployment()

  console.log(`🔧 Upgrading ${target} on ${network.name}`)
  console.log(`   Signer:  ${signer.address}`)
  console.log(`   Balance: ${ethers.formatEther(await ethers.provider.getBalance(signer.address))} ETH`)
  console.log(`   Factory: ${record.contracts.poolFactory.proxy}`)

  if (target === 'factory') {
    await upgradeFactory(record)
  } else {
    await upgradePoolImplementation(record)
  }

  console.log('\n🎉 Done.')
}

main().catch((error) => {
  console.error('\n❌ Upgrade failed:', error)
  process.exitCode = 1
})
