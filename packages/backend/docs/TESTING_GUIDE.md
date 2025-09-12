# SuperPool Backend Testing Guide

## 🎯 **Testing Philosophy & Standards**

This guide establishes comprehensive testing standards for SuperPool's backend services, focusing on Firebase Cloud Functions, smart contract integration, and blockchain interactions. Our approach prioritizes **business value** and **production reliability** over coverage metrics alone.

### **Core Testing Principles**

- **Cloud-First Testing**: Design tests for Firebase serverless environment
- **Blockchain Reliability**: Test contract interactions, gas optimization, and transaction handling
- **Security First**: Validate authentication, authorization, and input sanitization
- **Performance Awareness**: Monitor function timeout, memory usage, and cost optimization

---

## 📁 **Backend Test Organization Structure**

### **Unit Tests (Co-located)**

```
packages/backend/src/
├── functions/
│   ├── pools/
│   │   ├── createPool.ts
│   │   └── createPool.test.ts         # Cloud Function unit tests
│   └── auth/
│       ├── generateAuthMessage.ts
│       └── generateAuthMessage.test.ts
├── services/
│   ├── ContractService.ts
│   └── ContractService.test.ts        # Service layer unit tests
└── utils/
    ├── validation.ts
    └── validation.test.ts             # Utility function tests
```

### **Integration & E2E Tests (Dedicated Directory)**

```
packages/backend/tests/
├── integration/                       # Cross-service interactions
│   ├── poolCreationFlow.test.ts      # Functions + Firebase + Contracts
│   ├── authenticationFlow.test.ts    # Complete auth workflow
│   └── eventSynchronization.test.ts  # Event listeners + Firestore
├── e2e/                              # End-to-end user journeys
│   ├── completePoolCreation.test.ts  # API → Blockchain → Events
│   └── userAuthJourney.test.ts       # Auth → Pool → Transactions
├── contract/                         # Blockchain integration tests
│   ├── poolFactoryIntegration.test.ts
│   └── safeWalletIntegration.test.ts
└── performance/                      # Performance & load tests
    ├── functionTimeout.test.ts
    └── memoryUsage.test.ts
```

---

## 🧪 **Test Types & When to Use Them**

### **1. Unit Tests** (90% of our tests)

**When**: Testing individual Cloud Functions, services, or utilities in isolation  
**Focus**: Business logic, validation, error handling, edge cases  
**Environment**: Jest with mocked dependencies

```typescript
// ✅ Good Unit Test Example
describe('validatePoolCreationParams', () => {
  it('should reject invalid Ethereum addresses', () => {
    const invalidParams = { ...validParams, poolOwner: 'invalid-address' }

    const result = validatePoolCreationParams(invalidParams)

    expect(result.isValid).toBe(false)
    expect(result.errors).toContain('Pool owner must be a valid Ethereum address')
  })

  it('should reject amounts exceeding maximum limit', () => {
    const invalidParams = { ...validParams, maxLoanAmount: '2000000' }

    const result = validatePoolCreationParams(invalidParams)

    expect(result.isValid).toBe(false)
    expect(result.errors).toContain('Max loan amount is too large (max: 1,000,000 POL)')
  })
})
```

### **2. Integration Tests** (8% of our tests)

**When**: Testing how Cloud Functions, Firebase services, and contracts work together  
**Focus**: Data flow, service communication, transaction workflows  
**Environment**: Firebase emulators + mocked blockchain

```typescript
// ✅ Good Integration Test Example
describe('Pool Creation Integration', () => {
  it('should complete full pool creation workflow', async () => {
    // Arrange
    const poolData = createValidPoolData()
    mockContract.createPool.mockResolvedValue(mockTransactionResponse)
    mockFirestore.collection.mockReturnValue(mockCollection)

    // Act
    const result = await createPoolHandler({ data: poolData, auth: mockAuth })

    // Assert - Verify complete workflow
    expect(mockContract.createPool).toHaveBeenCalledWith(poolData)
    expect(mockCollection.add).toHaveBeenCalledWith(
      expect.objectContaining({
        poolId: result.poolId,
        status: 'pending',
      })
    )
    expect(result.success).toBe(true)
  })
})
```

### **3. Contract Integration Tests** (2% of our tests)

**When**: Testing real blockchain interactions with local/testnet contracts  
**Focus**: Contract deployment, transaction execution, event parsing  
**Environment**: Local blockchain (Hardhat) or testnet with real contracts

```typescript
// ✅ Good Contract Integration Test Example
describe('PoolFactory Contract Integration', () => {
  let poolFactory: ethers.Contract
  let signer: ethers.Wallet

  beforeAll(async () => {
    // Connect to local blockchain
    const provider = new ethers.JsonRpcProvider('http://localhost:8545')
    signer = new ethers.Wallet(TEST_PRIVATE_KEY, provider)
    poolFactory = new ethers.Contract(POOL_FACTORY_ADDRESS, PoolFactoryABI, signer)
  })

  it('should deploy pool and emit PoolCreated event', async () => {
    const poolParams = {
      poolOwner: signer.address,
      maxLoanAmount: ethers.parseEther('100'),
      interestRate: 500, // 5%
      loanDuration: 86400, // 1 day
      name: 'Test Pool',
      description: 'Integration test pool',
    }

    const tx = await poolFactory.createPool(poolParams)
    const receipt = await tx.wait()

    expect(receipt.status).toBe(1)

    const poolCreatedEvent = receipt.logs.find((log) => log.topics[0] === poolFactory.interface.getEventTopic('PoolCreated'))

    expect(poolCreatedEvent).toBeDefined()
    const parsedEvent = poolFactory.interface.parseLog(poolCreatedEvent)
    expect(parsedEvent.args.name).toBe('Test Pool')
  })
})
```

---

## 🏗️ **Backend Testing Patterns & Best Practices**

### **✅ DO: Test Cloud Function Error Scenarios**

```typescript
describe('createPool Cloud Function', () => {
  it('should handle Firebase timeout gracefully', async () => {
    // Simulate Firebase timeout
    mockFirestore.collection.mockImplementation(() => {
      throw new Error('deadline-exceeded')
    })

    const request = { data: validPoolData, auth: mockAuth }

    await expect(createPoolHandler(request)).rejects.toThrow('Failed to save pool data. Please try again.')
  })

  it('should handle contract revert with user-friendly message', async () => {
    // Simulate contract revert
    mockContract.createPool.mockRejectedValue(new Error('execution reverted: Insufficient balance'))

    const request = { data: validPoolData, auth: mockAuth }

    await expect(createPoolHandler(request)).rejects.toThrow('Pool creation failed: Insufficient balance for transaction')
  })
})
```

### **✅ DO: Test Authentication and Authorization**

```typescript
describe('Pool Creation Authorization', () => {
  it('should reject unauthenticated requests', async () => {
    const request = { data: validPoolData, auth: null }

    await expect(createPoolHandler(request)).rejects.toThrow('Authentication required')
  })

  it('should validate user permissions for pool creation', async () => {
    const unauthorizedAuth = { uid: 'user123', token: { role: 'viewer' } }
    const request = { data: validPoolData, auth: unauthorizedAuth }

    await expect(createPoolHandler(request)).rejects.toThrow('Insufficient permissions for pool creation')
  })
})
```

### **✅ DO: Test Gas Estimation and Optimization**

```typescript
describe('Gas Optimization', () => {
  it('should estimate gas before transaction execution', async () => {
    mockContract.estimateGas.createPool.mockResolvedValue(BigInt('150000'))

    const result = await createPoolHandler({ data: validPoolData, auth: mockAuth })

    expect(mockContract.estimateGas.createPool).toHaveBeenCalledWith(validPoolData)
    expect(result.estimatedGas).toBe('150000')
  })

  it('should use fallback gas limit when estimation fails', async () => {
    mockContract.estimateGas.createPool.mockRejectedValue(new Error('estimation failed'))

    const result = await createPoolHandler({ data: validPoolData, auth: mockAuth })

    expect(result.gasLimit).toBe(DEFAULT_GAS_LIMIT)
  })
})
```

### **❌ DON'T: Test Firebase/Ethers Implementation Details**

```typescript
// ❌ Bad: Testing Firebase internals
it('should call Firestore collection method', () => {
  createPoolHandler(request)
  expect(mockFirestore.collection).toHaveBeenCalledWith('pools')
})

// ✅ Good: Test business behavior
it('should save pool data to database', async () => {
  const result = await createPoolHandler(request)

  expect(result.poolId).toBeDefined()
  expect(result.status).toBe('created')
})
```

### **❌ DON'T: Test Configuration Values**

```typescript
// ❌ Bad: Testing static configuration
it('should use correct contract address', () => {
  expect(POOL_FACTORY_ADDRESS).toBe('0x123...')
})

// ✅ Good: Test configuration usage
it('should connect to configured contract', async () => {
  const result = await contractService.deployPool(poolData)
  expect(result.contractAddress).toMatch(/^0x[a-fA-F0-9]{40}$/)
})
```

---

## 🔧 **Backend Mock Strategy**

### **Use Centralized Backend Mock System**

```typescript
// ✅ Import from centralized backend mocks
import { createMockFirestore, createMockContract, createMockTransaction, mockFirebaseContext } from '../__mocks__/factories/testFactory'

describe('Pool Creation Service', () => {
  let mockDb: ReturnType<typeof createMockFirestore>
  let mockContract: ReturnType<typeof createMockContract>

  beforeEach(() => {
    mockDb = createMockFirestore({
      pools: { exists: false },
      transactions: { exists: false },
    })

    mockContract = createMockContract({
      createPool: jest.fn().mockResolvedValue(mockTransactionResponse),
    })
  })
})
```

### **Firebase-Specific Mock Patterns**

```typescript
// Mock Cloud Functions context
const mockCloudFunctionContext = mockFirebaseContext({
  auth: { uid: 'test-user-123', token: { role: 'admin' } },
  app: mockFirebaseApp(),
  rawRequest: mockHttpRequest(),
})

// Mock Firestore operations
const mockFirestoreWithData = createMockFirestore({
  'pools/pool-123': {
    exists: true,
    data: () => ({ name: 'Test Pool', owner: '0x123...' }),
  },
})
```

---

## 📊 **Coverage Guidelines for Backend**

### **Coverage Targets**

- **Global**: 95% lines/functions/statements, 90% branches
- **Critical Services** (ContractService, auth): 95% across all metrics
- **Cloud Functions**: 95% lines, focus on error handling paths
- **Utilities**: 90% lines, comprehensive edge case testing

### **Files Excluded from Coverage**

- Configuration files (`src/constants/`, `firebase.config.ts`)
- Type definitions (`.d.ts` files)
- Build outputs (`lib/`, compiled files)
- Test files (`*.test.ts`)
- Index files that only re-export (`index.ts`)

### **Priority Coverage Areas**

1. **Authentication & Authorization** - 95% all metrics
2. **Pool Creation Workflow** - 95% all metrics
3. **Contract Interaction Layer** - 95% all metrics
4. **Validation & Sanitization** - 95% all metrics
5. **Error Handling & Recovery** - 90% branches minimum

---

## 🚀 **Running Backend Tests**

### **Development Commands**

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run tests with coverage
pnpm test --coverage

# Run specific test file
pnpm test ContractService.test.ts

# Run integration tests only
pnpm test tests/integration

# Run tests matching pattern
pnpm test --testNamePattern="pool creation"

# Run tests with Firebase emulator
pnpm test:integration
```

### **Coverage Reports**

- **Text output**: Displayed in terminal with threshold enforcement
- **HTML report**: `../../coverage/backend/lcov-report/index.html`
- **CI integration**: Coverage reports uploaded for PR reviews
- **Quality gates**: Tests fail if coverage drops below thresholds

---

## 🔥 **Firebase-Specific Testing Patterns**

### **Cloud Functions Testing**

```typescript
describe('generateAuthMessage Cloud Function', () => {
  const mockRequest = {
    data: { walletAddress: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8' },
    auth: mockFirebaseContext().auth,
  }

  it('should generate authentication message with nonce', async () => {
    mockUuidV4.mockReturnValue('test-nonce-123')
    mockCreateAuthMessage.mockReturnValue('Sign this message: test-nonce-123')

    const result = await generateAuthMessageHandler(mockRequest)

    expect(result).toEqual({
      message: 'Sign this message: test-nonce-123',
      nonce: 'test-nonce-123',
      timestamp: expect.any(Number),
    })
  })
})
```

### **Firestore Integration Testing**

```typescript
describe('Pool Data Persistence', () => {
  it('should save pool data to Firestore with proper structure', async () => {
    const poolData = { name: 'Test Pool', owner: '0x123...' }

    await savePoolToFirestore(poolData)

    expect(mockFirestore.collection).toHaveBeenCalledWith('pools')
    expect(mockFirestore.doc).toHaveBeenCalledWith(expect.any(String))
    expect(mockFirestore.set).toHaveBeenCalledWith({
      ...poolData,
      createdAt: expect.any(Date),
      status: 'active',
    })
  })
})
```

---

## ⛓️ **Blockchain Testing Patterns**

### **Contract Interaction Testing**

```typescript
describe('ContractService', () => {
  it('should handle contract deployment with proper parameters', async () => {
    const deploymentParams = {
      maxLoanAmount: ethers.parseEther('100'),
      interestRate: 500,
      loanDuration: 86400,
    }

    mockContract.createPool.mockResolvedValue({
      hash: '0xabc123',
      wait: jest.fn().mockResolvedValue({
        status: 1,
        logs: [mockPoolCreatedEvent],
      }),
    })

    const result = await contractService.deployPool(deploymentParams)

    expect(result.transactionHash).toBe('0xabc123')
    expect(result.poolId).toBeDefined()
  })
})
```

### **Transaction Monitoring Testing**

```typescript
describe('Transaction Monitoring', () => {
  it('should track transaction status until confirmation', async () => {
    const txHash = '0xabc123'

    // Mock pending transaction
    mockProvider.getTransactionReceipt
      .mockResolvedValueOnce(null) // First call - pending
      .mockResolvedValueOnce({
        // Second call - confirmed
        status: 1,
        blockNumber: 12345,
      })

    const result = await monitorTransaction(txHash)

    expect(result.status).toBe('confirmed')
    expect(result.blockNumber).toBe(12345)
  })
})
```

---

## 🎯 **Code Review Checklist**

### **Before Submitting PR**

- [ ] All tests pass locally (`pnpm test`)
- [ ] Coverage targets met for new/modified code
- [ ] Firebase emulator tests pass (if applicable)
- [ ] Contract integration tests pass (if applicable)
- [ ] Error scenarios covered for new functions
- [ ] Authentication/authorization tests included
- [ ] Performance implications considered

### **Reviewing Backend Tests**

- [ ] Tests verify business requirements, not implementation
- [ ] Error scenarios and edge cases covered
- [ ] Firebase-specific patterns followed correctly
- [ ] Contract interaction properly mocked/tested
- [ ] Security validations included
- [ ] Tests are readable and maintainable
- [ ] Proper use of centralized mock system

---

## 🆘 **Common Backend Testing Anti-Patterns**

### **❌ Testing Firebase SDK Implementation**

```typescript
// ❌ Bad: Testing Firebase internals
it('should call getFirestore', () => {
  firebaseService.getData()
  expect(getFirestore).toHaveBeenCalled()
})

// ✅ Good: Test business behavior
it('should retrieve user data from database', async () => {
  const userData = await firebaseService.getUserData('user123')
  expect(userData.id).toBe('user123')
})
```

### **❌ Testing Ethers.js Library Behavior**

```typescript
// ❌ Bad: Testing ethers internals
it('should call ethers parseEther', () => {
  validateAmount('1.5')
  expect(ethers.parseEther).toHaveBeenCalledWith('1.5')
})

// ✅ Good: Test validation logic
it('should validate ether amounts correctly', () => {
  expect(validateAmount('1.5')).toBe(true)
  expect(validateAmount('-1')).toBe(false)
})
```

### **❌ Over-Mocking Business Logic**

```typescript
// ❌ Bad: Mocking everything
jest.mock('./poolService')
jest.mock('./contractService')
jest.mock('./validationService')
// What are we actually testing?

// ✅ Good: Mock external dependencies only
jest.mock('firebase-admin/firestore')
jest.mock('ethers')
// Test actual business logic
```

---

## 🔗 **Related Documentation**

- [TDD Workflow](./TDD_WORKFLOW.md) - Test-driven development for Cloud Functions
- [Mock System Guide](./MOCK_SYSTEM.md) - Centralized Firebase/blockchain mocks
- [Coverage Strategy](./COVERAGE_STRATEGY.md) - Backend coverage requirements
- [Firebase Testing](./FIREBASE_TESTING.md) - Cloud Functions testing patterns
- [Contract Testing](./CONTRACT_TESTING.md) - Blockchain integration testing
- [Troubleshooting](./TROUBLESHOOTING.md) - Common backend testing issues

---

_This guide establishes backend testing practices that ensure reliable, secure, and performant Firebase Cloud Functions with robust blockchain integration._
