import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { ethers } from 'hardhat'

/**
 * Utility functions for local testing and development
 */

export interface TestAccount {
  address: string
  signer: HardhatEthersSigner
  role: string
  balance: bigint
}

export interface TestPool {
  id: number
  address: string
  name: string
  owner: string
  maxLoanAmount: bigint
  interestRate: number
  loanDuration: number
}

/**
 * Get formatted test accounts with roles and balances
 */
export async function getTestAccounts(): Promise<TestAccount[]> {
  const accounts = await ethers.getSigners()
  const roles = [
    'Deployer/Admin',
    'Pool Owner 1',
    'Pool Owner 2',
    'Pool Owner 3',
    'Borrower 1',
    'Borrower 2',
    'Lender 1',
    'Lender 2',
    'Test User 1',
    'Test User 2',
  ]

  const testAccounts: TestAccount[] = []

  for (let i = 0; i < Math.min(accounts.length, 10); i++) {
    const balance = await ethers.provider.getBalance(accounts[i].address)
    testAccounts.push({
      address: accounts[i].address,
      signer: accounts[i],
      role: roles[i] || `Test User ${i + 1}`,
      balance: balance,
    })
  }

  return testAccounts
}

/**
 * Print formatted account information
 */
export async function printTestAccounts(): Promise<void> {
  const accounts = await getTestAccounts()

  console.log('\n👥 Test Accounts:')
  console.log('='.repeat(80))

  accounts.forEach((account, index) => {
    console.log(`[${index}] ${account.role}`)
    console.log(`    Address: ${account.address}`)
    console.log(`    Balance: ${ethers.formatEther(account.balance)} ETH`)
    console.log('')
  })
}

/**
 * Fund accounts with test ETH
 */
export async function fundTestAccounts(amount: string = '100'): Promise<void> {
  const accounts = await ethers.getSigners()
  const deployer = accounts[0]
  const fundAmount = ethers.parseEther(amount)

  console.log(`\n💰 Funding test accounts with ${amount} ETH each...`)

  // Fund accounts 1-9 (skip deployer)
  for (let i = 1; i < Math.min(accounts.length, 10); i++) {
    try {
      const tx = await deployer.sendTransaction({
        to: accounts[i].address,
        value: fundAmount,
      })
      await tx.wait()
      console.log(`✅ Funded account ${i}: ${accounts[i].address}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.log(`❌ Failed to fund account ${i}:`, errorMessage)
    }
  }
}

/**
 * Create sample loan requests for testing
 */
export async function createSampleLoans(poolAddress: string, borrowers: HardhatEthersSigner[]): Promise<void> {
  const pool = await ethers.getContractAt('SampleLendingPool', poolAddress)

  const sampleLoans = [
    {
      amount: ethers.parseEther('2'),
      purpose: 'Emergency medical expenses',
      borrower: borrowers[0],
    },
    {
      amount: ethers.parseEther('5'),
      purpose: 'Small business inventory',
      borrower: borrowers[1],
    },
    {
      amount: ethers.parseEther('1.5'),
      purpose: 'Education course fees',
      borrower: borrowers[2],
    },
  ]

  console.log(`\n💳 Creating sample loan requests for pool ${poolAddress}...`)

  for (let i = 0; i < sampleLoans.length; i++) {
    const loan = sampleLoans[i]

    if (!loan.borrower) {
      console.log(`⚠️  No borrower available for loan ${i + 1}`)
      continue
    }

    try {
      const poolWithBorrower = pool.connect(loan.borrower)

      console.log(`Creating loan ${i + 1}:`)
      console.log(`  Amount: ${ethers.formatEther(loan.amount)} ETH`)
      console.log(`  Purpose: ${loan.purpose}`)
      console.log(`  Borrower: ${loan.borrower.address}`)

      const tx = await poolWithBorrower.createLoan(loan.amount)
      await tx.wait()

      console.log(`✅ Loan ${i + 1} created successfully`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.log(`❌ Failed to create loan ${i + 1}:`, errorMessage)
    }
  }
}

/**
 * Get comprehensive pool information
 */
export async function getPoolInfo(poolAddress: string): Promise<{
  address: string
  owner: string
  config: unknown
  balance: string
  version: string
  totalFunds: string
  nextLoanId: string
  maxLoanAmount: string
  interestRate: number
  loanDuration: number
  isActive: boolean
} | null> {
  const pool = await ethers.getContractAt('SampleLendingPool', poolAddress)

  try {
    const [owner, config, balance, version, totalFunds, nextLoanId] = await Promise.all([
      pool.owner(),
      pool.poolConfig(),
      ethers.provider.getBalance(poolAddress),
      pool.version(),
      pool.totalFunds(),
      pool.nextLoanId(),
    ])

    return {
      address: poolAddress,
      owner,
      config,
      balance: ethers.formatEther(balance),
      version,
      totalFunds: ethers.formatEther(totalFunds),
      nextLoanId: nextLoanId.toString(),
      maxLoanAmount: ethers.formatEther(config.maxLoanAmount),
      interestRate: config.interestRate,
      loanDuration: config.loanDuration,
      isActive: config.isActive,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`Error getting pool info for ${poolAddress}:`, errorMessage)
    return null
  }
}

/**
 * Print comprehensive pool information
 */
export async function printPoolInfo(poolAddress: string): Promise<void> {
  const info = await getPoolInfo(poolAddress)

  if (!info) {
    console.log(`❌ Could not retrieve pool information for ${poolAddress}`)
    return
  }

  console.log(`\n🏊 Pool Information: ${poolAddress}`)
  console.log('='.repeat(60))
  console.log(`Owner: ${info.owner}`)
  console.log(`Version: ${info.version}`)
  console.log(`Active: ${info.isActive}`)
  console.log(`Balance: ${info.balance} ETH`)
  console.log(`Total Funds Available: ${info.totalFunds} ETH`)
  console.log(`Max Loan Amount: ${info.maxLoanAmount} ETH`)
  console.log(`Interest Rate: ${info.interestRate / 100}%`)
  console.log(`Loan Duration: ${info.loanDuration / (24 * 60 * 60)} days`)
  console.log(`Next Loan ID: ${info.nextLoanId}`)
}

/**
 * Setup complete test environment
 */
export async function setupTestEnvironment(
  factoryAddress: string,
  createPools: boolean = true,
  fundAccounts: boolean = true
): Promise<{
  factory: unknown
  pools: TestPool[]
  accounts: TestAccount[]
}> {
  console.log('\n🚀 Setting up test environment...')

  // Get factory contract
  const factory = await ethers.getContractAt('PoolFactory', factoryAddress)

  // Get accounts
  const accounts = await getTestAccounts()

  // Fund accounts if requested
  if (fundAccounts) {
    await fundTestAccounts('50')
  }

  let pools: TestPool[] = []

  if (createPools) {
    console.log('\n🏊 Creating test pools...')

    const poolConfigs = [
      {
        poolOwner: accounts[1].address,
        maxLoanAmount: ethers.parseEther('3'),
        interestRate: 500,
        loanDuration: 7 * 24 * 60 * 60,
        name: 'Quick Cash Pool',
        description: 'Fast small loans',
      },
      {
        poolOwner: accounts[2].address,
        maxLoanAmount: ethers.parseEther('10'),
        interestRate: 750,
        loanDuration: 30 * 24 * 60 * 60,
        name: 'Business Pool',
        description: 'Business development loans',
      },
    ]

    for (let i = 0; i < poolConfigs.length; i++) {
      const config = poolConfigs[i]

      try {
        const tx = await factory.createPool(config)
        const receipt = await tx.wait()

        const poolCreatedEvent = receipt?.logs.find((log) => log.topics[0] === factory.interface.getEvent('PoolCreated').topicHash)

        if (poolCreatedEvent) {
          const decodedEvent = factory.interface.decodeEventLog('PoolCreated', poolCreatedEvent.data, poolCreatedEvent.topics)

          pools.push({
            id: i + 1,
            address: decodedEvent.poolAddress,
            name: config.name,
            owner: config.poolOwner,
            maxLoanAmount: config.maxLoanAmount,
            interestRate: config.interestRate,
            loanDuration: config.loanDuration,
          })

          console.log(`✅ Created ${config.name} at ${decodedEvent.poolAddress}`)
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.log(`❌ Failed to create pool ${config.name}:`, errorMessage)
      }
    }
  }

  console.log('\n✅ Test environment setup complete!')

  return {
    factory,
    pools,
    accounts,
  }
}

/**
 * Development console helper
 */
export function printDevHelp(): void {
  console.log('\n🔧 Development Helper Commands:')
  console.log('='.repeat(50))
  console.log('// Get test utils')
  console.log('const utils = require("./scripts/test-utils.ts");')
  console.log('')
  console.log('// Print accounts')
  console.log('await utils.printTestAccounts();')
  console.log('')
  console.log('// Setup test environment')
  console.log('const env = await utils.setupTestEnvironment("FACTORY_ADDRESS");')
  console.log('')
  console.log('// Get pool info')
  console.log('await utils.printPoolInfo("POOL_ADDRESS");')
  console.log('')
  console.log('// Create sample loans')
  console.log('await utils.createSampleLoans("POOL_ADDRESS", [signer1, signer2]);')
}
