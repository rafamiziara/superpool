# 🚀 SuperPool Smart Contract Interaction Guide

This comprehensive guide covers all the ways to interact with your SuperPool smart contracts during development and production.

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Method 1: Hardhat Console (Recommended)](#method-1-hardhat-console-recommended)
3. [Method 2: Custom Scripts](#method-2-custom-scripts)
4. [Method 3: Mobile App Integration](#method-3-mobile-app-integration)
5. [Method 4: Test Utilities](#method-4-test-utilities)
6. [Method 5: Frontend Integration](#method-5-frontend-integration)
7. [Common Workflows](#common-workflows)
8. [Monitoring & Debugging](#monitoring--debugging)
9. [Reference](#reference)

---

## Quick Start

### 🏃‍♂️ Local Development Setup

```bash
# Terminal 1: Start local Hardhat node
cd packages/contracts
pnpm node:local

# Terminal 2: Deploy contracts with test data
pnpm deploy:local

# Terminal 3: Interactive console
pnpm console:local
```

Your local environment will have:

- ✅ 3 pre-configured test pools
- ✅ 10 funded test accounts with roles
- ✅ 50 ETH per pool for immediate testing

---

## Method 1: Hardhat Console (Recommended)

The Hardhat console is the most powerful tool for development and testing.

### 🔧 Basic Setup

```javascript
// Get all available accounts
const accounts = await ethers.getSigners()
const [deployer, poolOwner1, poolOwner2, borrower1, borrower2, lender1, lender2] = accounts

// Connect to deployed contracts (get addresses from deploy output)
const factoryAddress = '0x...' // From deploy:local output
const factory = await ethers.getContractAt('PoolFactory', factoryAddress)

// Get first pool address
const poolAddress = await factory.getPoolAddress(1)
const pool = await ethers.getContractAt('SampleLendingPool', poolAddress)
```

### 🏭 PoolFactory Interactions

```javascript
// === POOL CREATION ===
const poolParams = {
  poolOwner: poolOwner1.address,
  maxLoanAmount: ethers.parseEther('25'),
  interestRate: 750, // 7.5% (in basis points)
  loanDuration: 60 * 24 * 60 * 60, // 60 days in seconds
  name: 'Business Development Pool',
  description: 'Loans for small business growth',
}

const createTx = await factory.createPool(poolParams)
const receipt = await createTx.wait()
console.log('Pool created! Gas used:', receipt.gasUsed.toString())

// === POOL QUERIES ===
// Get total number of pools
const poolCount = await factory.getPoolCount()
console.log(`Total pools: ${poolCount}`)

// Get pool information
for (let i = 1; i <= poolCount; i++) {
  const info = await factory.getPoolInfo(i)
  console.log(`Pool ${i}: ${info.name} - Owner: ${info.poolOwner}`)
  console.log(`  Address: ${info.poolAddress}`)
  console.log(`  Max Loan: ${ethers.formatEther(info.maxLoanAmount)} ETH`)
  console.log(`  Interest: ${info.interestRate / 100}%`)
  console.log(`  Duration: ${info.loanDuration / (24 * 60 * 60)} days\n`)
}

// Get pools by specific owner
const ownerPools = await factory.getPoolsByOwner(poolOwner1.address)
console.log(
  `${poolOwner1.address} owns pools:`,
  ownerPools.map((id) => id.toString())
)

// Get all pool addresses
const allPools = await factory.getAllPoolAddresses()
console.log('All pool addresses:', allPools)
```

### 🏊 LendingPool Interactions

```javascript
// === DEPOSIT FUNDS (Lenders) ===
const depositAmount = ethers.parseEther('100')
const depositTx = await pool.connect(lender1).depositFunds({ value: depositAmount })
await depositTx.wait()
console.log(`Deposited ${ethers.formatEther(depositAmount)} ETH`)

// Check pool balance
const totalFunds = await pool.totalFunds()
console.log(`Pool has ${ethers.formatEther(totalFunds)} ETH available`)

// === CREATE LOANS (Borrowers) ===
const loanAmount = ethers.parseEther('10')
const loanTx = await pool.connect(borrower1).createLoan(loanAmount)
const loanReceipt = await loanTx.wait()

// Get loan ID from event
const loanEvent = loanReceipt.logs.find((log) => log.topics[0] === pool.interface.getEvent('LoanCreated').topicHash)
const decodedEvent = pool.interface.decodeEventLog('LoanCreated', loanEvent.data, loanEvent.topics)
const loanId = decodedEvent.loanId
console.log(`Loan created with ID: ${loanId}`)

// === LOAN QUERIES ===
const loan = await pool.getLoan(loanId)
console.log('Loan details:')
console.log(`  Borrower: ${loan.borrower}`)
console.log(`  Amount: ${ethers.formatEther(loan.amount)} ETH`)
console.log(`  Interest Rate: ${loan.interestRate}bp`)
console.log(`  Start Time: ${new Date(Number(loan.startTime) * 1000)}`)
console.log(`  Is Repaid: ${loan.isRepaid}`)

// Calculate repayment amount
const repaymentAmount = await pool.calculateRepaymentAmount(loanId)
console.log(`Total repayment needed: ${ethers.formatEther(repaymentAmount)} ETH`)

// === REPAY LOANS ===
const repayTx = await pool.connect(borrower1).repayLoan(loanId, {
  value: repaymentAmount,
})
await repayTx.wait()
console.log('Loan repaid successfully!')

// === POOL CONFIGURATION (Pool Owner Only) ===
const newConfig = {
  maxLoanAmount: ethers.parseEther('50'),
  interestRate: 600, // 6%
  loanDuration: 45 * 24 * 60 * 60, // 45 days
}

await pool.connect(poolOwner1).updatePoolConfig(newConfig.maxLoanAmount, newConfig.interestRate, newConfig.loanDuration)
console.log('Pool configuration updated!')

// Toggle pool status
await pool.connect(poolOwner1).togglePoolStatus()
const config = await pool.poolConfig()
console.log(`Pool is now ${config.isActive ? 'active' : 'inactive'}`)
```

### 👥 Account Management

```javascript
// Check account balances
for (let i = 0; i < 5; i++) {
  const balance = await ethers.provider.getBalance(accounts[i].address)
  console.log(`Account ${i}: ${ethers.formatEther(balance)} ETH`)
}

// Fund an account (useful for testing)
const fundTx = await deployer.sendTransaction({
  to: borrower2.address,
  value: ethers.parseEther('10'),
})
await fundTx.wait()
console.log('Account funded!')

// Impersonate any address (local development only)
await ethers.provider.send('hardhat_impersonateAccount', [someAddress])
const impersonatedSigner = await ethers.getSigner(someAddress)
```

---

## Method 2: Custom Scripts

Create reusable scripts for common operations.

### 📄 Create Interaction Scripts

**`scripts/create-pool.ts`**

```typescript
import { ethers } from 'hardhat'
import * as dotenv from 'dotenv'

dotenv.config()

async function main() {
  const factoryAddress = process.env.FACTORY_ADDRESS || '0x...'
  const factory = await ethers.getContractAt('PoolFactory', factoryAddress)

  const [deployer] = await ethers.getSigners()

  const poolParams = {
    poolOwner: deployer.address,
    maxLoanAmount: ethers.parseEther(process.argv[2] || '10'), // Max loan amount from CLI
    interestRate: parseInt(process.argv[3] || '500'), // Interest rate from CLI
    loanDuration: parseInt(process.argv[4] || '30') * 24 * 60 * 60, // Days from CLI
    name: process.argv[5] || 'Default Pool',
    description: process.argv[6] || 'A lending pool created via script',
  }

  console.log('Creating pool with parameters:', {
    maxLoanAmount: ethers.formatEther(poolParams.maxLoanAmount),
    interestRate: poolParams.interestRate / 100 + '%',
    loanDuration: poolParams.loanDuration / (24 * 60 * 60) + ' days',
    name: poolParams.name,
  })

  const tx = await factory.createPool(poolParams)
  const receipt = await tx.wait()

  // Get pool address from event
  const poolCreatedEvent = receipt?.logs.find((log) => log.topics[0] === factory.interface.getEvent('PoolCreated').topicHash)

  if (poolCreatedEvent) {
    const decodedEvent = factory.interface.decodeEventLog('PoolCreated', poolCreatedEvent.data, poolCreatedEvent.topics)
    console.log(`✅ Pool created successfully!`)
    console.log(`   Pool ID: ${decodedEvent.poolId}`)
    console.log(`   Pool Address: ${decodedEvent.poolAddress}`)
    console.log(`   Pool Owner: ${decodedEvent.poolOwner}`)
  }
}

main().catch(console.error)
```

**Usage:**

```bash
# Create pool with custom parameters
npx hardhat run scripts/create-pool.ts --network localhost 25 750 60 "Enterprise Pool" "For large business loans"

# Create pool with defaults
npx hardhat run scripts/create-pool.ts --network localhost
```

**`scripts/fund-pool.ts`**

```typescript
import { ethers } from 'hardhat'

async function main() {
  const poolAddress = process.argv[2]
  const amount = process.argv[3] || '50'

  if (!poolAddress) {
    console.error('Usage: npx hardhat run scripts/fund-pool.ts --network localhost POOL_ADDRESS [AMOUNT]')
    process.exit(1)
  }

  const [funder] = await ethers.getSigners()
  const pool = await ethers.getContractAt('SampleLendingPool', poolAddress)

  const fundAmount = ethers.parseEther(amount)
  console.log(`Funding pool ${poolAddress} with ${amount} ETH...`)

  const tx = await pool.connect(funder).depositFunds({ value: fundAmount })
  await tx.wait()

  const totalFunds = await pool.totalFunds()
  console.log(`✅ Pool funded! Total available: ${ethers.formatEther(totalFunds)} ETH`)
}

main().catch(console.error)
```

**`scripts/pool-status.ts`**

```typescript
import { ethers } from 'hardhat'

async function main() {
  const factoryAddress = process.env.FACTORY_ADDRESS || process.argv[2]

  if (!factoryAddress) {
    console.error('Set FACTORY_ADDRESS env var or provide as argument')
    process.exit(1)
  }

  const factory = await ethers.getContractAt('PoolFactory', factoryAddress)
  const poolCount = await factory.getPoolCount()

  console.log(`\n🏊 SuperPool Status Report`)
  console.log(`=`.repeat(50))
  console.log(`Total Pools: ${poolCount}\n`)

  for (let i = 1; i <= poolCount; i++) {
    const info = await factory.getPoolInfo(i)
    const pool = await ethers.getContractAt('SampleLendingPool', info.poolAddress)
    const totalFunds = await pool.totalFunds()
    const nextLoanId = await pool.nextLoanId()

    console.log(`Pool ${i}: ${info.name}`)
    console.log(`  Address: ${info.poolAddress}`)
    console.log(`  Owner: ${info.poolOwner}`)
    console.log(`  Status: ${info.isActive ? '🟢 Active' : '🔴 Inactive'}`)
    console.log(`  Available Funds: ${ethers.formatEther(totalFunds)} ETH`)
    console.log(`  Max Loan: ${ethers.formatEther(info.maxLoanAmount)} ETH`)
    console.log(`  Interest Rate: ${info.interestRate / 100}%`)
    console.log(`  Loan Duration: ${info.loanDuration / (24 * 60 * 60)} days`)
    console.log(`  Total Loans Created: ${Number(nextLoanId) - 1}`)
    console.log('')
  }
}

main().catch(console.error)
```

### 🏃‍♂️ Running Scripts

```bash
# Add to package.json scripts
"pool:create": "hardhat run scripts/create-pool.ts --network localhost",
"pool:fund": "hardhat run scripts/fund-pool.ts --network localhost",
"pool:status": "hardhat run scripts/pool-status.ts --network localhost"

# Usage
pnpm pool:create 15 600 45 "Startup Pool" "For early stage startups"
pnpm pool:fund 0x1234... 25
pnpm pool:status
```

---

## Method 3: Mobile App Integration

### 📱 React Native Integration

**Network Configuration (already done):**

```typescript
// apps/mobile/src/config/chains.ts
export const localhost = defineChain({
  id: 31337,
  name: 'Localhost',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
  testnet: true,
})
```

**Contract Interactions:**

```typescript
// Example hook for pool factory
import { useReadContract, useWriteContract } from 'wagmi';
import { FACTORY_ADDRESS, FACTORY_ABI } from '../constants/contracts';

export function usePoolFactory() {
  // Read pool count
  const { data: poolCount } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'getPoolCount',
  });

  // Create pool
  const { writeContract: createPool } = useWriteContract();

  const handleCreatePool = async (poolParams: PoolParams) => {
    try {
      await createPool({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: 'createPool',
        args: [poolParams],
      });
    } catch (error) {
      console.error('Pool creation failed:', error);
    }
  };

  return {
    poolCount: poolCount ? Number(poolCount) : 0,
    createPool: handleCreatePool,
  };
}

// Example pool component
export function PoolList() {
  const { poolCount } = usePoolFactory();
  const [pools, setPools] = useState([]);

  const loadPools = async () => {
    const poolData = [];
    for (let i = 1; i <= poolCount; i++) {
      const info = await readContract({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: 'getPoolInfo',
        args: [i],
      });
      poolData.push(info);
    }
    setPools(poolData);
  };

  useEffect(() => {
    if (poolCount > 0) loadPools();
  }, [poolCount]);

  return (
    <View>
      {pools.map((pool, index) => (
        <PoolCard key={index} pool={pool} />
      ))}
    </View>
  );
}
```

### 🌐 Web3 Configuration

**Environment Variables:**

```bash
# apps/mobile/.env
EXPO_PUBLIC_LOCALHOST_FACTORY_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
EXPO_PUBLIC_LOCALHOST_RPC_URL=http://127.0.0.1:8545
```

---

## Method 4: Test Utilities

Use our custom test utility functions for comprehensive testing.

### 🛠️ Available Utilities

```javascript
// In Hardhat console
const utils = require('./scripts/test-utils.ts')

// === ACCOUNT MANAGEMENT ===
// Display all test accounts with roles and balances
await utils.printTestAccounts()

// Fund all test accounts with ETH
await utils.fundTestAccounts('100') // 100 ETH each

// === ENVIRONMENT SETUP ===
// Setup complete test environment
const env = await utils.setupTestEnvironment(
  'FACTORY_ADDRESS',
  true, // createPools
  true // fundAccounts
)

console.log(`Setup complete! Created ${env.pools.length} pools`)
console.log(`Available accounts: ${env.accounts.length}`)

// === POOL INFORMATION ===
// Get detailed pool information
await utils.printPoolInfo('POOL_ADDRESS')

// Get pool data programmatically
const poolInfo = await utils.getPoolInfo('POOL_ADDRESS')
if (poolInfo) {
  console.log(`Pool has ${poolInfo.totalFunds} ETH available`)
  console.log(`Next loan ID will be: ${poolInfo.nextLoanId}`)
}

// === LOAN CREATION ===
// Create sample loans for testing
const borrowers = env.accounts.slice(4, 7).map((acc) => acc.signer) // Get borrower accounts
await utils.createSampleLoans('POOL_ADDRESS', borrowers)

// === DEVELOPMENT HELP ===
// Show available commands
utils.printDevHelp()
```

### 🔄 Complete Test Workflow

```javascript
// 1. Setup environment
const env = await utils.setupTestEnvironment('FACTORY_ADDRESS')

// 2. Get a pool to work with
const testPool = env.pools[0]
console.log(`Working with pool: ${testPool.name} at ${testPool.address}`)

// 3. Fund the pool
const pool = await ethers.getContractAt('SampleLendingPool', testPool.address)
const lender = env.accounts[6].signer // Get lender account
await pool.connect(lender).depositFunds({ value: ethers.parseEther('100') })

// 4. Create loans
const borrowers = env.accounts.slice(4, 6).map((acc) => acc.signer)
await utils.createSampleLoans(testPool.address, borrowers)

// 5. Check pool status
await utils.printPoolInfo(testPool.address)

// 6. Repay a loan
const borrower = borrowers[0]
const loanId = 1 // First loan
const repaymentAmount = await pool.calculateRepaymentAmount(loanId)
await pool.connect(borrower).repayLoan(loanId, { value: repaymentAmount })

console.log('✅ Complete workflow executed!')
```

---

## Method 5: Frontend Integration

### 🌐 Web Integration with ethers.js

```javascript
import { ethers } from 'ethers'

class PoolManager {
  constructor(providerUrl = 'http://localhost:8545') {
    this.provider = new ethers.JsonRpcProvider(providerUrl)
    this.factoryAddress = process.env.FACTORY_ADDRESS
  }

  async connect(privateKey) {
    this.signer = new ethers.Wallet(privateKey, this.provider)
    this.factory = new ethers.Contract(this.factoryAddress, FACTORY_ABI, this.signer)
  }

  async createPool(poolParams) {
    const tx = await this.factory.createPool(poolParams)
    const receipt = await tx.wait()

    // Parse events
    const poolCreatedEvent = receipt.logs.find((log) => log.topics[0] === this.factory.interface.getEvent('PoolCreated').topicHash)

    if (poolCreatedEvent) {
      const event = this.factory.interface.decodeEventLog('PoolCreated', poolCreatedEvent.data, poolCreatedEvent.topics)
      return {
        poolId: event.poolId,
        poolAddress: event.poolAddress,
        transactionHash: receipt.hash,
      }
    }
  }

  async getPoolInfo(poolId) {
    return await this.factory.getPoolInfo(poolId)
  }

  async connectToPool(poolAddress) {
    return new ethers.Contract(poolAddress, POOL_ABI, this.signer)
  }
}

// Usage
const poolManager = new PoolManager()
await poolManager.connect(process.env.PRIVATE_KEY)

const result = await poolManager.createPool({
  poolOwner: await poolManager.signer.getAddress(),
  maxLoanAmount: ethers.parseEther('10'),
  interestRate: 500,
  loanDuration: 30 * 24 * 60 * 60,
  name: 'Web Pool',
  description: 'Created from web interface',
})

console.log('Pool created:', result)
```

### 🎯 Event Monitoring

```javascript
// Listen for real-time events
async function setupEventListeners() {
  const factory = await ethers.getContractAt('PoolFactory', factoryAddress)

  // Pool creation events
  factory.on('PoolCreated', (poolId, poolAddress, owner, name, event) => {
    console.log(`🏊 New pool created: ${name}`)
    console.log(`   ID: ${poolId}`)
    console.log(`   Address: ${poolAddress}`)
    console.log(`   Owner: ${owner}`)
    console.log(`   Block: ${event.blockNumber}`)
  })

  // Pool status changes
  factory.on('PoolDeactivated', (poolId, poolAddress) => {
    console.log(`🔴 Pool ${poolId} deactivated: ${poolAddress}`)
  })

  factory.on('PoolReactivated', (poolId, poolAddress) => {
    console.log(`🟢 Pool ${poolId} reactivated: ${poolAddress}`)
  })
}

// Query historical events
async function getPoolHistory() {
  const factory = await ethers.getContractAt('PoolFactory', factoryAddress)

  // Get all pool creation events
  const filter = factory.filters.PoolCreated()
  const events = await factory.queryFilter(filter, 0, 'latest')

  console.log(`Found ${events.length} pool creation events:`)
  events.forEach((event, index) => {
    const { poolId, poolAddress, poolOwner, name } = event.args
    console.log(`${index + 1}. ${name} (ID: ${poolId})`)
    console.log(`   Address: ${poolAddress}`)
    console.log(`   Owner: ${poolOwner}`)
    console.log(`   Block: ${event.blockNumber}\n`)
  })
}
```

---

## Common Workflows

### 🔄 Complete Pool Lifecycle

```javascript
// === 1. POOL CREATION ===
const [deployer, poolOwner, lender1, lender2, borrower1, borrower2] = await ethers.getSigners();

const poolParams = {
  poolOwner: poolOwner.address,
  maxLoanAmount: ethers.parseEther("20"),
  interestRate: 600, // 6%
  loanDuration: 30 * 24 * 60 * 60, // 30 days
  name: "Community Pool",
  description: "For community members"
};

const createTx = await factory.createPool(poolParams);
const createReceipt = await createTx.wait();
const poolAddress = /* extract from event */;
const pool = await ethers.getContractAt("SampleLendingPool", poolAddress);

// === 2. POOL FUNDING ===
// Multiple lenders fund the pool
await pool.connect(lender1).depositFunds({ value: ethers.parseEther("50") });
await pool.connect(lender2).depositFunds({ value: ethers.parseEther("75") });

console.log(`Pool funded with ${ethers.formatEther(await pool.totalFunds())} ETH`);

// === 3. LOAN LIFECYCLE ===
// Borrower requests loan
const loanAmount = ethers.parseEther("15");
const loanTx = await pool.connect(borrower1).createLoan(loanAmount);
const loanReceipt = await loanTx.wait();
const loanId = /* extract from event */;

// Check loan details
const loan = await pool.getLoan(loanId);
console.log(`Loan created: ${ethers.formatEther(loan.amount)} ETH`);

// Calculate and repay loan
const repaymentAmount = await pool.calculateRepaymentAmount(loanId);
console.log(`Repayment needed: ${ethers.formatEther(repaymentAmount)} ETH`);

// Borrower repays after some time
await pool.connect(borrower1).repayLoan(loanId, { value: repaymentAmount });
console.log("Loan repaid successfully!");

// === 4. POOL MANAGEMENT ===
// Owner can update pool configuration
await pool.connect(poolOwner).updatePoolConfig(
  ethers.parseEther("25"), // New max loan amount
  550, // New interest rate (5.5%)
  45 * 24 * 60 * 60 // New duration (45 days)
);

// Pause pool if needed
await pool.connect(poolOwner).pause();
console.log("Pool paused for maintenance");

// Unpause when ready
await pool.connect(poolOwner).unpause();
console.log("Pool reactivated");
```

### 💡 Advanced Scenarios

```javascript
// === MULTI-POOL OPERATIONS ===
async function manageMutiplePools() {
  const poolCount = await factory.getPoolCount()

  for (let i = 1; i <= poolCount; i++) {
    const poolInfo = await factory.getPoolInfo(i)
    const pool = await ethers.getContractAt('SampleLendingPool', poolInfo.poolAddress)

    // Get pool statistics
    const totalFunds = await pool.totalFunds()
    const nextLoanId = await pool.nextLoanId()
    const config = await pool.poolConfig()

    console.log(`Pool ${i}: ${poolInfo.name}`)
    console.log(`  Funds: ${ethers.formatEther(totalFunds)} ETH`)
    console.log(`  Loans: ${Number(nextLoanId) - 1} created`)
    console.log(`  Status: ${config.isActive ? 'Active' : 'Inactive'}`)

    // Example: Auto-fund pools with low liquidity
    if (totalFunds < ethers.parseEther('10') && config.isActive) {
      console.log(`  🚨 Low liquidity! Auto-funding...`)
      await pool.connect(deployer).depositFunds({ value: ethers.parseEther('20') })
    }
  }
}

// === LOAN MONITORING ===
async function monitorLoans() {
  const poolAddress = '0x...'
  const pool = await ethers.getContractAt('SampleLendingPool', poolAddress)

  // Listen for new loans
  pool.on('LoanCreated', async (loanId, borrower, amount, event) => {
    console.log(`📝 New loan: ${loanId}`)
    console.log(`   Borrower: ${borrower}`)
    console.log(`   Amount: ${ethers.formatEther(amount)} ETH`)

    // Auto-approve logic could go here
    // Send notifications, update databases, etc.
  })

  // Listen for repayments
  pool.on('LoanRepaid', (loanId, borrower, amount, event) => {
    console.log(`💰 Loan repaid: ${loanId}`)
    console.log(`   Amount: ${ethers.formatEther(amount)} ETH`)
  })
}
```

---

## Monitoring & Debugging

### 🔍 Gas Usage Analysis

```javascript
// Track gas usage for operations
async function analyzeGasUsage() {
  const operations = []

  // Pool creation
  const createTx = await factory.createPool(poolParams)
  const createReceipt = await createTx.wait()
  operations.push({ name: 'Pool Creation', gas: createReceipt.gasUsed })

  // Deposit funds
  const depositTx = await pool.depositFunds({ value: ethers.parseEther('10') })
  const depositReceipt = await depositTx.wait()
  operations.push({ name: 'Deposit Funds', gas: depositReceipt.gasUsed })

  // Create loan
  const loanTx = await pool.createLoan(ethers.parseEther('5'))
  const loanReceipt = await loanTx.wait()
  operations.push({ name: 'Create Loan', gas: loanReceipt.gasUsed })

  // Repay loan
  const repayTx = await pool.repayLoan(1, { value: ethers.parseEther('5.25') })
  const repayReceipt = await repayTx.wait()
  operations.push({ name: 'Repay Loan', gas: repayReceipt.gasUsed })

  console.log('\n⛽ Gas Usage Analysis:')
  console.log('='.repeat(40))
  operations.forEach((op) => {
    console.log(`${op.name}: ${op.gas.toLocaleString()} gas`)
  })

  const totalGas = operations.reduce((sum, op) => sum + Number(op.gas), 0)
  console.log(`Total: ${totalGas.toLocaleString()} gas`)
}
```

### 🚨 Error Handling

```javascript
// Common error scenarios and handling
async function handleErrors() {
  try {
    // This will fail - exceeds max loan amount
    await pool.createLoan(ethers.parseEther('1000'))
  } catch (error) {
    if (error.reason?.includes('ExceedsMaxLoanAmount')) {
      console.log('❌ Loan amount exceeds pool maximum')
      const config = await pool.poolConfig()
      console.log(`   Max allowed: ${ethers.formatEther(config.maxLoanAmount)} ETH`)
    }
  }

  try {
    // This will fail - insufficient funds in pool
    await pool.createLoan(ethers.parseEther('10'))
  } catch (error) {
    if (error.reason?.includes('InsufficientFunds')) {
      console.log('❌ Pool has insufficient funds')
      const available = await pool.totalFunds()
      console.log(`   Available: ${ethers.formatEther(available)} ETH`)
    }
  }

  try {
    // This will fail - wrong borrower trying to repay
    await pool.connect(wrongAccount).repayLoan(1, { value: ethers.parseEther('5') })
  } catch (error) {
    if (error.reason?.includes('UnauthorizedBorrower')) {
      console.log('❌ Only the borrower can repay their loan')
    }
  }
}
```

### 📊 Pool Analytics

```javascript
// Generate pool analytics
async function generatePoolAnalytics() {
  const poolCount = await factory.getPoolCount()
  const analytics = {
    totalPools: Number(poolCount),
    activePools: 0,
    totalFunds: BigInt(0),
    totalLoans: 0,
    averageInterestRate: 0,
    poolsByOwner: {},
  }

  let totalInterestRate = 0

  for (let i = 1; i <= poolCount; i++) {
    const info = await factory.getPoolInfo(i)
    const pool = await ethers.getContractAt('SampleLendingPool', info.poolAddress)

    const totalFunds = await pool.totalFunds()
    const nextLoanId = await pool.nextLoanId()

    if (info.isActive) analytics.activePools++
    analytics.totalFunds += totalFunds
    analytics.totalLoans += Number(nextLoanId) - 1
    totalInterestRate += Number(info.interestRate)

    // Track pools by owner
    if (!analytics.poolsByOwner[info.poolOwner]) {
      analytics.poolsByOwner[info.poolOwner] = 0
    }
    analytics.poolsByOwner[info.poolOwner]++
  }

  analytics.averageInterestRate = totalInterestRate / Number(poolCount)

  console.log('\n📊 SuperPool Analytics:')
  console.log('='.repeat(50))
  console.log(`Total Pools: ${analytics.totalPools}`)
  console.log(`Active Pools: ${analytics.activePools}`)
  console.log(`Total Liquidity: ${ethers.formatEther(analytics.totalFunds)} ETH`)
  console.log(`Total Loans Created: ${analytics.totalLoans}`)
  console.log(`Average Interest Rate: ${analytics.averageInterestRate / 100}%`)
  console.log('\nPools by Owner:')
  Object.entries(analytics.poolsByOwner).forEach(([owner, count]) => {
    console.log(`  ${owner}: ${count} pool(s)`)
  })

  return analytics
}
```

---

## Reference

### 📋 Contract Addresses

After running `pnpm deploy:local`, you'll get output like:

```
🏭 Factory Address: 0x5FbDB2315678afecb367f032d93F642f64180aa3
📊 Total Pools Created: 3

📋 Created Pools:
   1. Quick Loans Pool
      Address: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
      Owner: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
   2. Medium Term Pool
      Address: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
      Owner: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
```

### 🔧 Function Signatures

**PoolFactory Key Functions:**

```solidity
function createPool(PoolParams calldata _params) external returns (uint256 poolId, address poolAddress)
function getPoolCount() external view returns (uint256)
function getPoolInfo(uint256 _poolId) external view returns (PoolInfo memory)
function getPoolAddress(uint256 _poolId) external view returns (address)
function getPoolsByOwner(address _owner) external view returns (uint256[] memory)
function getAllPoolAddresses() external view returns (address[] memory)
function deactivatePool(uint256 _poolId) external
function reactivatePool(uint256 _poolId) external
```

**SampleLendingPool Key Functions:**

```solidity
function depositFunds() external payable
function createLoan(uint256 _amount) external returns (uint256)
function repayLoan(uint256 _loanId) external payable
function getLoan(uint256 _loanId) external view returns (Loan memory)
function calculateRepaymentAmount(uint256 _loanId) external view returns (uint256)
function updatePoolConfig(uint256 _maxLoanAmount, uint256 _interestRate, uint256 _loanDuration) external
function togglePoolStatus() external
function poolConfig() external view returns (PoolConfig memory)
function totalFunds() external view returns (uint256)
function nextLoanId() external view returns (uint256)
```

### 📡 Events

**PoolFactory Events:**

```solidity
event PoolCreated(uint256 indexed poolId, address indexed poolAddress, address indexed poolOwner, string name, uint256 maxLoanAmount, uint256 interestRate, uint256 loanDuration)
event PoolDeactivated(uint256 indexed poolId, address indexed poolAddress)
event PoolReactivated(uint256 indexed poolId, address indexed poolAddress)
event ImplementationUpdated(address indexed oldImplementation, address indexed newImplementation)
```

**SampleLendingPool Events:**

```solidity
event PoolConfigured(uint256 maxLoanAmount, uint256 interestRate, uint256 loanDuration)
event FundsDeposited(address indexed depositor, uint256 amount)
event LoanCreated(uint256 indexed loanId, address indexed borrower, uint256 amount)
event LoanRepaid(uint256 indexed loanId, address indexed borrower, uint256 amount)
```

### ⚠️ Error Codes

**PoolFactory Errors:**

- `InvalidPoolOwner()` - Pool owner address is zero
- `InvalidMaxLoanAmount()` - Max loan amount is zero
- `InvalidInterestRate()` - Interest rate exceeds 100%
- `InvalidLoanDuration()` - Loan duration is zero
- `PoolNotFound()` - Pool ID doesn't exist
- `EmptyName()` - Pool name is empty
- `ImplementationNotSet()` - Implementation address is zero

**SampleLendingPool Errors:**

- `InsufficientFunds()` - Pool doesn't have enough liquidity
- `LoanAlreadyRepaid()` - Attempting to repay already repaid loan
- `UnauthorizedBorrower()` - Non-borrower trying to repay loan
- `ExceedsMaxLoanAmount()` - Loan amount exceeds pool maximum

### 🎯 Quick Reference Commands

```bash
# Start local development
pnpm node:local                    # Start local blockchain
pnpm deploy:local                  # Deploy with test data
pnpm console:local                 # Interactive console

# Common console commands
const factory = await ethers.getContractAt("PoolFactory", "FACTORY_ADDRESS")
const pool = await ethers.getContractAt("SampleLendingPool", "POOL_ADDRESS")
const [deployer, owner, borrower, lender] = await ethers.getSigners()

# Quick operations
await factory.getPoolCount()                                    # Get total pools
await factory.getPoolInfo(1)                                   # Get pool 1 info
await pool.totalFunds()                                        # Check pool balance
await pool.connect(lender).depositFunds({ value: ethers.parseEther("10") })  # Fund pool
await pool.connect(borrower).createLoan(ethers.parseEther("5"))              # Create loan
await pool.calculateRepaymentAmount(1)                         # Calculate repayment
await pool.connect(borrower).repayLoan(1, { value: repaymentAmount })        # Repay loan
```

---

## 🎉 Happy Building!

This guide covers all the essential ways to interact with your SuperPool smart contracts. Whether you're debugging in the console, building a frontend, or creating automated scripts, you now have comprehensive examples for every scenario.

For more advanced use cases or specific questions, check the contract source code or create custom scripts based on these patterns.

**Remember:** Always test on localhost first before deploying to testnets or mainnet!
