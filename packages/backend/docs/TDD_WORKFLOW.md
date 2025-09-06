# SuperPool Backend TDD Workflow

## 🔄 **Test-Driven Development Philosophy for Cloud Functions**

Test-Driven Development (TDD) for Firebase Cloud Functions and blockchain integration ensures we build **reliable serverless services** with **high confidence**. Our TDD approach prioritizes production reliability and Firebase-specific patterns over academic TDD strictness.

### **Core Backend TDD Benefits**

- **Function Reliability**: Writing tests first forces proper error handling for Cloud Functions
- **Blockchain Integration**: Tests ensure contract interactions work correctly before deployment
- **Security Validation**: Authentication and authorization logic tested from the start
- **Performance Awareness**: Cold start and execution time considerations built-in

---

## 🔴🟢🔄 **Red-Green-Refactor Cycle for Backend**

### **🔴 RED: Write a Failing Cloud Function Test First**

```typescript
describe('createPool Cloud Function', () => {
  it('should create pool with valid parameters', async () => {
    // Test doesn't exist yet - this WILL fail
    const poolData = {
      poolOwner: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
      maxLoanAmount: '100',
      interestRate: 500,
      loanDuration: 86400,
      name: 'Test Pool',
      description: 'A test lending pool',
    }

    const request = { data: poolData, auth: mockAuth() }
    const result = await createPoolHandler(request)

    expect(result.success).toBe(true)
    expect(result.poolId).toBeDefined()
    expect(result.transactionHash).toMatch(/^0x[a-fA-F0-9]{64}$/)
  })
})

// Run test: ❌ FAILS (function doesn't exist)
```

### **🟢 GREEN: Write Minimal Cloud Function to Pass**

```typescript
// Minimal implementation to make test pass
export const createPoolHandler = async (request: CallableRequest<any>) => {
  // Simplest implementation that passes the test
  return {
    success: true,
    poolId: 'test-pool-123',
    transactionHash: '0x1234567890123456789012345678901234567890123456789012345678901234',
  }
}

// Run test: ✅ PASSES (hard-coded but working)
```

### **🔄 REFACTOR: Add Real Implementation While Keeping Tests Green**

```typescript
// Now implement properly while keeping tests green
import { createPool } from './createPool'
import { validatePoolCreationParams, sanitizePoolParams } from '../utils/validation'
import { ContractService } from '../services/ContractService'

export const createPoolHandler = async (request: CallableRequest<CreatePoolRequest>) => {
  try {
    // Validate authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required')
    }

    // Validate input parameters
    const validation = validatePoolCreationParams(request.data)
    if (!validation.isValid) {
      throw new HttpsError('invalid-argument', validation.errors.join(', '))
    }

    // Sanitize parameters
    const sanitizedParams = sanitizePoolParams(request.data)

    // Create pool via contract service
    const contractService = new ContractService()
    const result = await contractService.createPool(sanitizedParams)

    return {
      success: true,
      poolId: result.poolId,
      transactionHash: result.transactionHash,
      estimatedGas: result.gasUsed,
    }
  } catch (error) {
    console.error('Pool creation failed:', error)
    throw new HttpsError('internal', 'Pool creation failed')
  }
}

// Run test: ✅ STILL PASSES (real implementation)
```

---

## 🏗️ **TDD Implementation Patterns for Backend**

### **Pattern 1: Cloud Function Development**

#### **Step 1: Define Expected Behavior**

```typescript
// Start with the test - what should happen?
describe('generateAuthMessage', () => {
  it('should generate unique message for wallet authentication', async () => {
    const walletAddress = '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8'
    const request = { data: { walletAddress }, auth: null }

    mockUuidV4.mockReturnValue('test-nonce-123')
    mockFirestore.collection.mockReturnValue(mockCollection)

    const result = await generateAuthMessageHandler(request)

    expect(result.message).toContain('SuperPool Authentication')
    expect(result.nonce).toBe('test-nonce-123')
    expect(result.timestamp).toBeGreaterThan(0)
    expect(mockCollection.doc).toHaveBeenCalledWith(walletAddress)
  })
})
```

#### **Step 2: Create Minimal Function**

```typescript
// Make it pass with minimum code
export const generateAuthMessageHandler = async (request: any) => {
  return {
    message: 'SuperPool Authentication: Please sign this message',
    nonce: 'test-nonce-123',
    timestamp: Date.now(),
  }
}
```

#### **Step 3: Add Real Implementation**

```typescript
// Now add proper business logic
import { v4 as uuidv4 } from 'uuid'
import { getFirestore } from 'firebase-admin/firestore'
import { createAuthMessage } from '../utils'

export const generateAuthMessageHandler = async (request: CallableRequest<{ walletAddress: string }>) => {
  // Validate wallet address
  if (!isAddress(request.data.walletAddress)) {
    throw new HttpsError('invalid-argument', 'Invalid wallet address')
  }

  // Generate unique nonce
  const nonce = uuidv4()
  const timestamp = Date.now()

  // Store nonce in Firestore with expiration
  const db = getFirestore()
  await db
    .collection('auth_nonces')
    .doc(request.data.walletAddress)
    .set({
      nonce,
      timestamp,
      expiresAt: timestamp + 10 * 60 * 1000, // 10 minutes
    })

  // Create authentication message
  const message = createAuthMessage(request.data.walletAddress, nonce, timestamp)

  return { message, nonce, timestamp }
}
```

### **Pattern 2: Contract Service Development**

#### **Step 1: Test the Service Interface**

```typescript
describe('ContractService', () => {
  it('should deploy pool contract and return transaction details', async () => {
    const poolParams = {
      poolOwner: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
      maxLoanAmount: ethers.parseEther('100'),
      interestRate: 500,
      loanDuration: 86400,
      name: 'Test Pool',
      description: 'Test pool deployment',
    }

    mockContract.createPool.mockResolvedValue({
      hash: '0xabc123def456',
      wait: jest.fn().mockResolvedValue({
        status: 1,
        blockNumber: 12345,
        logs: [mockPoolCreatedEvent],
      }),
    })

    const contractService = new ContractService(mockConfig)
    const result = await contractService.createPool(poolParams)

    expect(result.success).toBe(true)
    expect(result.poolId).toBeDefined()
    expect(result.transactionHash).toBe('0xabc123def456')
  })
})
```

#### **Step 2: Simple Implementation**

```typescript
export class ContractService {
  async createPool(params: any): Promise<any> {
    return {
      success: true,
      poolId: 'test-pool-123',
      transactionHash: '0xabc123def456',
    }
  }
}
```

#### **Step 3: Real Contract Integration**

```typescript
import { ethers } from 'ethers'
import { PoolFactoryABI } from '../constants/abis'

export class ContractService {
  private contract: ethers.Contract
  private provider: ethers.JsonRpcProvider

  constructor(private config: ContractServiceConfig) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl)
    this.contract = new ethers.Contract(config.poolFactoryAddress, PoolFactoryABI, new ethers.Wallet(config.privateKey, this.provider))
  }

  async createPool(params: CreatePoolParams): Promise<CreatePoolResult> {
    try {
      // Estimate gas
      const gasEstimate = await this.contract.estimateGas.createPool(params)

      // Execute transaction
      const tx = await this.contract.createPool(params, {
        gasLimit: (gasEstimate * BigInt(120)) / BigInt(100), // 20% buffer
      })

      // Wait for confirmation
      const receipt = await tx.wait()

      // Parse events to get pool ID
      const poolCreatedEvent = receipt.logs.find((log) => log.topics[0] === this.contract.interface.getEventTopic('PoolCreated'))

      const parsedEvent = this.contract.interface.parseLog(poolCreatedEvent)

      return {
        success: true,
        poolId: parsedEvent.args.poolId.toString(),
        transactionHash: tx.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
      }
    } catch (error) {
      console.error('Contract deployment failed:', error)
      throw new Error(`Pool creation failed: ${error.message}`)
    }
  }
}
```

### **Pattern 3: Validation Utility Development**

#### **Step 1: Test Validation Logic**

```typescript
describe('validatePoolCreationParams', () => {
  it('should validate all pool parameters correctly', () => {
    const validParams = {
      poolOwner: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
      maxLoanAmount: '100',
      interestRate: 500,
      loanDuration: 86400,
      name: 'Valid Pool',
      description: 'A valid pool for testing purposes',
    }

    const result = validatePoolCreationParams(validParams)

    expect(result.isValid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should reject invalid parameters with specific error messages', () => {
    const invalidParams = {
      poolOwner: 'invalid-address',
      maxLoanAmount: '-100',
      interestRate: -5,
      loanDuration: 100,
      name: '',
      description: '',
    }

    const result = validatePoolCreationParams(invalidParams)

    expect(result.isValid).toBe(false)
    expect(result.errors).toContain('Pool owner must be a valid Ethereum address')
    expect(result.errors).toContain('Max loan amount must be greater than 0')
  })
})
```

#### **Step 2: Basic Validation**

```typescript
export const validatePoolCreationParams = (params: any) => {
  return {
    isValid: true,
    errors: [],
  }
}
```

#### **Step 3: Complete Validation Logic**

```typescript
import { ethers } from 'ethers'

export const validatePoolCreationParams = (params: CreatePoolRequest): ValidationResult => {
  const errors: string[] = []

  // Validate wallet address
  if (!params.poolOwner || !ethers.isAddress(params.poolOwner)) {
    errors.push('Pool owner must be a valid Ethereum address')
  }

  // Validate amount
  if (!params.maxLoanAmount || parseFloat(params.maxLoanAmount) <= 0) {
    errors.push('Max loan amount must be greater than 0')
  }

  // Validate interest rate
  if (typeof params.interestRate !== 'number' || params.interestRate < 0) {
    errors.push('Interest rate cannot be negative')
  }

  // Validate duration
  if (typeof params.loanDuration !== 'number' || params.loanDuration < 3600) {
    errors.push('Loan duration must be at least 1 hour (3600 seconds)')
  }

  // Validate strings
  if (!params.name || params.name.trim().length < 3) {
    errors.push('Pool name must be at least 3 characters long')
  }

  if (!params.description || params.description.trim().length < 10) {
    errors.push('Pool description must be at least 10 characters long')
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}
```

---

## 🎯 **TDD for Different Backend Scenarios**

### **Scenario 1: New Firebase Function Development**

#### **Example: Add Pool Status Check Function**

**1. Write the Test First**

```typescript
describe('getPoolStatus Cloud Function', () => {
  describe('for existing pool', () => {
    it('should return pool status and statistics', async () => {
      const poolId = 'pool-123'
      const mockPoolData = {
        name: 'Test Pool',
        isActive: true,
        totalLiquidity: '1000',
        availableLiquidity: '800',
        totalLoans: 5,
        activeLoans: 3,
      }

      mockFirestore.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => mockPoolData,
          }),
        }),
      })

      const request = { data: { poolId }, auth: mockAuth() }
      const result = await getPoolStatusHandler(request)

      expect(result.success).toBe(true)
      expect(result.pool.name).toBe('Test Pool')
      expect(result.pool.isActive).toBe(true)
      expect(result.statistics.utilizationRate).toBe(20) // 200/1000 * 100
    })
  })

  describe('for non-existent pool', () => {
    it('should return not found error', async () => {
      mockFirestore.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: false }),
        }),
      })

      const request = { data: { poolId: 'nonexistent' }, auth: mockAuth() }

      await expect(getPoolStatusHandler(request)).rejects.toThrow('Pool not found')
    })
  })
})
```

**2. Run Test (Should Fail)**

```bash
pnpm test getPoolStatus.test.ts
# ❌ Function getPoolStatusHandler doesn't exist
```

**3. Add Minimal Implementation**

```typescript
export const getPoolStatusHandler = async (request: any) => {
  return {
    success: true,
    pool: {
      name: 'Test Pool',
      isActive: true,
    },
    statistics: {
      utilizationRate: 20,
    },
  }
}
```

**4. Run Test (Should Pass)**

```bash
pnpm test getPoolStatus.test.ts
# ✅ Tests pass
```

**5. Add Real Implementation**

```typescript
export const getPoolStatusHandler = async (request: CallableRequest<{ poolId: string }>) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required')
  }

  const { poolId } = request.data

  if (!poolId) {
    throw new HttpsError('invalid-argument', 'Pool ID is required')
  }

  const db = getFirestore()
  const poolDoc = await db.collection('pools').doc(poolId).get()

  if (!poolDoc.exists) {
    throw new HttpsError('not-found', 'Pool not found')
  }

  const poolData = poolDoc.data()

  // Calculate utilization rate
  const utilizationRate =
    poolData.totalLiquidity > 0 ? ((poolData.totalLiquidity - poolData.availableLiquidity) / poolData.totalLiquidity) * 100 : 0

  return {
    success: true,
    pool: {
      id: poolId,
      name: poolData.name,
      isActive: poolData.isActive,
      totalLiquidity: poolData.totalLiquidity,
      availableLiquidity: poolData.availableLiquidity,
    },
    statistics: {
      totalLoans: poolData.totalLoans || 0,
      activeLoans: poolData.activeLoans || 0,
      utilizationRate: Math.round(utilizationRate * 100) / 100,
    },
  }
}
```

### **Scenario 2: Bug Fixing with TDD**

#### **Bug Report: "Authentication fails for valid signatures"**

**1. Write a Failing Test (Reproduce the Bug)**

```typescript
describe('verifySignatureAndLogin Bug Fix', () => {
  it('should handle EIP-712 signatures correctly', async () => {
    // Reproduce the specific bug scenario
    const walletAddress = '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8'
    const message = 'SuperPool Authentication: 1234567890'
    const validSignature = '0x1234...valid_eip712_signature'

    // Mock ethers.verifyMessage to return the correct address
    mockEthers.verifyMessage.mockReturnValue(walletAddress)

    // This should not throw an error
    const result = await verifySignatureAndLogin({
      walletAddress,
      message,
      signature: validSignature,
    })

    expect(result.success).toBe(true)
    expect(result.customToken).toBeDefined()
  })
})
```

**2. Run Test (Should Fail - Bug Still Exists)**

```bash
pnpm test "should handle EIP-712 signatures"
# ❌ Test fails - signature verification still broken
```

**3. Fix the Bug**

```typescript
export const verifySignatureAndLogin = async (params: VerifyParams) => {
  try {
    // Bug fix: Handle both regular and EIP-712 signatures
    let recoveredAddress: string

    try {
      // Try standard message verification first
      recoveredAddress = ethers.verifyMessage(params.message, params.signature)
    } catch (error) {
      // If standard verification fails, try EIP-712
      recoveredAddress = ethers.utils.recoverAddress(ethers.utils.hashMessage(params.message), params.signature)
    }

    // Compare addresses (case-insensitive)
    if (recoveredAddress.toLowerCase() !== params.walletAddress.toLowerCase()) {
      throw new HttpsError('invalid-argument', 'Invalid signature')
    }

    // Create Firebase custom token
    const customToken = await admin.auth().createCustomToken(params.walletAddress)

    return {
      success: true,
      customToken,
      walletAddress: params.walletAddress,
    }
  } catch (error) {
    throw new HttpsError('invalid-argument', 'Signature verification failed')
  }
}
```

**4. Run Test (Should Pass - Bug Fixed)**

```bash
pnpm test "should handle EIP-712 signatures"
# ✅ Test passes - bug is fixed
```

### **Scenario 3: Refactoring with TDD**

#### **Refactoring: Extract Contract Interaction into Separate Service**

**1. Ensure Comprehensive Test Coverage First**

```typescript
describe('createPool - Before Refactoring', () => {
  it('should create pool with contract interaction', async () => {
    // Test current behavior before refactoring
    const result = await createPoolHandler(validRequest)
    expect(result.success).toBe(true)
  })

  it('should handle contract errors gracefully', async () => {
    // Ensure all edge cases are covered
    mockContract.createPool.mockRejectedValue(new Error('Contract error'))
    await expect(createPoolHandler(validRequest)).rejects.toThrow()
  })
})

// Run tests: ✅ All green before refactoring
```

**2. Create New Service with Tests**

```typescript
describe('PoolContractService', () => {
  it('should deploy pool contract with proper parameters', async () => {
    const service = new PoolContractService(mockConfig)
    const result = await service.deployPool(mockParams)

    expect(result.poolId).toBeDefined()
    expect(result.transactionHash).toMatch(/^0x[a-fA-F0-9]{64}$/)
  })
})
```

**3. Implement New Service**

```typescript
export class PoolContractService {
  constructor(private config: ContractConfig) {}

  async deployPool(params: PoolParams): Promise<PoolDeploymentResult> {
    // Move contract logic here from Cloud Function
    const contract = new ethers.Contract(/* ... */)
    const tx = await contract.createPool(params)
    const receipt = await tx.wait()

    return {
      poolId: this.extractPoolId(receipt),
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
    }
  }
}
```

**4. Update Cloud Function to Use Service**

```typescript
export const createPoolHandler = async (request: CallableRequest<any>) => {
  // Validation stays in Cloud Function
  const validation = validatePoolCreationParams(request.data)
  if (!validation.isValid) {
    throw new HttpsError('invalid-argument', validation.errors.join(', '))
  }

  // Contract interaction moved to service
  const contractService = new PoolContractService(contractConfig)
  const deploymentResult = await contractService.deployPool(request.data)

  // Response formatting stays in Cloud Function
  return {
    success: true,
    poolId: deploymentResult.poolId,
    transactionHash: deploymentResult.transactionHash,
  }
}
```

**5. Run All Tests (Should Still Pass)**

```bash
pnpm test createPool
# ✅ All tests pass - refactoring successful
```

---

## 🚀 **TDD Best Practices for SuperPool Backend**

### **✅ DO: Start with Authentication Tests**

```typescript
// ✅ Good: Test auth requirements first
describe('createPool Authentication', () => {
  it('should require authentication', async () => {
    const request = { data: validPoolData, auth: null }

    await expect(createPoolHandler(request)).rejects.toThrow('Authentication required')
  })
})

// Then build the feature with auth baked in
```

### **✅ DO: Test Firebase Integration Points**

```typescript
// ✅ Good: Test Firestore operations
it('should save pool data to correct collection', async () => {
  await createPoolHandler(validRequest)

  expect(mockFirestore.collection).toHaveBeenCalledWith('pools')
  expect(mockFirestore.doc().set).toHaveBeenCalledWith(
    expect.objectContaining({
      name: validRequest.data.name,
      createdAt: expect.any(Date),
    })
  )
})
```

### **✅ DO: Test Contract Error Scenarios**

```typescript
// ✅ Good: Test blockchain failure handling
it('should handle contract revert gracefully', async () => {
  mockContract.createPool.mockRejectedValue(new Error('execution reverted: Insufficient balance'))

  await expect(createPoolHandler(validRequest)).rejects.toThrow('Pool creation failed: Insufficient balance')
})
```

### **❌ DON'T: Skip the Red Phase**

```typescript
// ❌ Bad: Writing implementation first
export const newFunction = async () => {
  return { success: true }
}

// Then writing a test
it('should return success', () => {
  expect(newFunction()).resolves.toEqual({ success: true })
})

// ✅ Good: Test first, then implementation
it('should return success', async () => {
  const result = await newFunction() // This SHOULD fail first
  expect(result.success).toBe(true)
})
```

### **❌ DON'T: Mock Firebase Business Logic**

```typescript
// ❌ Bad: Mocking our own services
jest.mock('./PoolService') // This hides bugs!

// ✅ Good: Mock external Firebase SDK only
jest.mock('firebase-admin/firestore')
```

---

## 🔄 **TDD Workflow Integration**

### **Daily TDD Routine for Backend**

1. **Pick a Cloud Function**: Select smallest deployable function
2. **Write Failing Test**: Start with red (failing test)
3. **Make It Pass**: Write minimal Firebase function (green)
4. **Refactor**: Improve code quality while keeping tests green
5. **Deploy**: Deploy function to Firebase with confidence
6. **Repeat**: Move to next function or feature

### **TDD with Firebase Development**

```bash
# 1. Start Firebase emulators
pnpm serve

# 2. Create feature branch
git checkout -b feature/pool-status-check

# 3. Write failing test and commit
git add getPoolStatus.test.ts
git commit -m "test: add failing test for pool status check"

# 4. Make test pass and commit
git add getPoolStatus.ts
git commit -m "feat: add basic pool status endpoint"

# 5. Refactor and commit
git add getPoolStatus.ts
git commit -m "refactor: improve error handling and validation"

# 6. Final commit with full implementation
git commit -m "feat(pools): complete pool status check with statistics"
```

### **TDD in Code Reviews**

- **Green Build Required**: All tests must pass before review
- **Firebase Emulator Tests**: Integration tests must pass with emulators
- **Test Coverage**: New Cloud Functions require comprehensive coverage
- **Contract Integration**: Blockchain interactions must be tested
- **Security Validation**: Auth and input validation tests mandatory

---

## 🎯 **Common TDD Scenarios for Backend**

### **Adding New Cloud Functions**

```typescript
// 1. Test the function signature and basic behavior
it('should handle valid request and return expected response', async () => {
  const result = await newCloudFunction(validRequest)
  expect(result.success).toBe(true)
})

// 2. Implement minimal function
export const newCloudFunction = async () => ({ success: true })

// 3. Add real Firebase and contract integration
```

### **Contract Integration Development**

```typescript
// 1. Test contract interaction expectations
it('should call contract method with correct parameters', async () => {
  await contractService.someMethod(params)
  expect(mockContract.someMethod).toHaveBeenCalledWith(params)
})

// 2. Add minimal contract service method
someMethod = async () => mockResult

// 3. Add real ethers.js implementation
```

### **Error Handling Development**

```typescript
// 1. Test all failure scenarios first
it('should handle network timeouts', async () => {
  mockFirestore.get.mockRejectedValue(new Error('timeout'))
  await expect(myFunction()).rejects.toThrow('Service temporarily unavailable')
})

// 2. Implement error handling
try {
  await firestore.operation()
} catch (error) {
  if (error.message.includes('timeout')) {
    throw new HttpsError('unavailable', 'Service temporarily unavailable')
  }
  throw error
}
```

---

## 🔗 **Related Documentation**

- [Testing Guide](./TESTING_GUIDE.md) - Overall backend testing philosophy
- [Mock System Guide](./MOCK_SYSTEM.md) - Firebase and contract mocking
- [Firebase Testing](./FIREBASE_TESTING.md) - Cloud Functions testing patterns
- [Contract Testing](./CONTRACT_TESTING.md) - Blockchain integration testing
- [Coverage Strategy](./COVERAGE_STRATEGY.md) - Coverage requirements and metrics
- [Troubleshooting](./TROUBLESHOOTING.md) - Common TDD issues and solutions

---

_TDD for backend services ensures reliable Firebase Cloud Functions with robust blockchain integration and comprehensive error handling._
