# Backend Testing Troubleshooting Guide

## 🚨 **Common Testing Issues & Solutions for SuperPool Backend**

This guide provides solutions to common testing problems encountered when testing Firebase Cloud Functions, blockchain integration, and serverless architecture. Each issue includes symptoms, root causes, and step-by-step solutions.

---

## 🔧 **Jest & Testing Framework Issues**

### **Issue: Jest Cannot Find Modules**

**Symptoms:**

```bash
Cannot find module '@superpool/types' from 'src/functions/auth/generateAuthMessage.ts'
ENOENT: no such file or directory, open '/packages/types/dist/index.d.ts'
```

**Root Cause:** TypeScript module resolution or workspace dependency issues

**Solution:**

```bash
# 1. Rebuild shared packages
cd ../../packages/types
pnpm build

# 2. Clear Jest cache
cd ../../packages/backend
pnpm test --clearCache

# 3. Verify Jest configuration
# jest.config.js
module.exports = {
  moduleNameMapping: {
    '^@superpool/(.*)$': '<rootDir>/../../packages/$1/src',
  },
  // OR for compiled packages
  moduleNameMapping: {
    '^@superpool/(.*)$': '<rootDir>/../../packages/$1/dist',
  },
}

# 4. Check package.json workspace references
# Should have: "@superpool/types": "workspace:*"
```

### **Issue: TypeScript Compilation Errors in Tests**

**Symptoms:**

```bash
error TS2307: Cannot find module 'firebase-admin/app' or its corresponding type declarations
```

**Root Cause:** Missing or incorrect TypeScript configuration for test environment

**Solution:**

```json
// tsconfig.json
{
  "compilerOptions": {
    "moduleResolution": "node",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "types": ["jest", "node"]
  },
  "references": [
    { "path": "../types" },
    { "path": "../ui" }
  ]
}

// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  globals: {
    'ts-jest': {
      useESM: true
    }
  }
}
```

### **Issue: ES6 Modules vs CommonJS Conflicts**

**Symptoms:**

```bash
SyntaxError: Cannot use import statement outside a module
ReferenceError: exports is not defined
```

**Root Cause:** Mixed module systems between dependencies

**Solution:**

```javascript
// jest.config.js
module.exports = {
  // Transform ES6 modules to CommonJS
  transformIgnorePatterns: ['node_modules/(?!(firebase|ethers)/)'],

  // Handle ES6 imports
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    '^.+\\.jsx?$': 'babel-jest',
  },

  // Setup files for polyfills
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup/polyfills.ts'],
}

// src/__tests__/setup/polyfills.ts
import { TextEncoder, TextDecoder } from 'util'

// Node.js polyfills for browser APIs
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

// Mock fetch for Node.js
global.fetch = jest.fn()
```

---

## 🔥 **Firebase Testing Issues**

### **Issue: Firebase Admin SDK Authentication Failures**

**Symptoms:**

```bash
Error: Could not load the default credentials
Firebase App has not been initialized
```

**Root Cause:** Missing or incorrect Firebase configuration in test environment

**Solution:**

```typescript
// src/__tests__/setup/firebase.setup.ts
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app'

export async function setupFirebaseTest() {
  // Clean up existing apps
  const apps = getApps()
  await Promise.all(apps.map((app) => deleteApp(app)))

  // Set environment variables
  process.env.GCLOUD_PROJECT = 'superpool-test'
  process.env.FIREBASE_CONFIG = JSON.stringify({
    projectId: 'superpool-test',
    storageBucket: 'superpool-test.appspot.com',
  })
  process.env.FUNCTIONS_EMULATOR = 'true'

  // Initialize with test config
  const testApp = initializeApp(
    {
      projectId: 'superpool-test',
    },
    'test'
  )

  return testApp
}

// In test files
beforeAll(async () => {
  await setupFirebaseTest()
})
```

### **Issue: Firestore Emulator Connection Problems**

**Symptoms:**

```bash
Error: 14 UNAVAILABLE: Name resolution failure
Connection refused to Firestore emulator
```

**Root Cause:** Firestore emulator not running or incorrect connection settings

**Solution:**

```bash
# 1. Install Firebase tools
npm install -g firebase-tools

# 2. Start emulators
cd packages/backend
firebase emulators:start --only firestore

# 3. Update test configuration
# jest.config.js
module.exports = {
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup/firestore.setup.ts']
}

// src/__tests__/setup/firestore.setup.ts
import { connectFirestoreEmulator, getFirestore } from 'firebase-admin/firestore'

beforeAll(() => {
  // Connect to emulator
  const db = getFirestore()
  if (!db._settings?.host?.includes('localhost')) {
    connectFirestoreEmulator(db, 'localhost', 8080)
  }
})
```

### **Issue: Firebase Functions Context Missing**

**Symptoms:**

```bash
TypeError: Cannot read property 'auth' of undefined
req.rawRequest is not defined
```

**Root Cause:** Incomplete CallableRequest mock setup

**Solution:**

```typescript
// Enhanced CallableRequest mock
export function createCompleteCallableRequest<T>(data: T, uid?: string): CallableRequest<T> {
  const mockRequest = {
    data,
    auth: uid
      ? {
          uid,
          token: {
            firebase: {
              identities: {},
              sign_in_provider: 'wallet',
            },
            uid,
            email_verified: true,
            aud: 'superpool-test',
            exp: Math.floor(Date.now() / 1000) + 3600,
            iat: Math.floor(Date.now() / 1000),
          },
        }
      : null,
    app: {
      name: '[DEFAULT]',
      options: {
        projectId: 'superpool-test',
      },
    },
    rawRequest: {
      headers: {
        'content-type': 'application/json',
        'user-agent': 'firebase-functions-test',
        authorization: uid ? `Bearer test-token-${uid}` : undefined,
      },
      method: 'POST',
      url: '/test-function',
      ip: '127.0.0.1',
      get: jest.fn((header) => mockRequest.rawRequest.headers[header.toLowerCase()]),
      header: jest.fn((header) => mockRequest.rawRequest.headers[header.toLowerCase()]),
    },
  } as CallableRequest<T>

  return mockRequest
}
```

---

## ⛓️ **Blockchain Integration Issues**

### **Issue: Ethers.js Provider Connection Failures**

**Symptoms:**

```bash
Error: could not detect network (event="noNetwork", code=NETWORK_ERROR)
Error: missing response (requestId="1", url="http://localhost:8545")
```

**Root Cause:** Local blockchain not running or incorrect RPC URL

**Solution:**

```bash
# 1. Check if local blockchain is running
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  http://localhost:8545

# 2. Start local blockchain (if using Hardhat)
cd packages/contracts
pnpm node:local

# 3. Configure fallback provider
// src/__tests__/setup/blockchain.setup.ts
export function createTestProvider(chainName: string = 'local') {
  const config = TEST_CHAINS[chainName]

  try {
    return new JsonRpcProvider(config.rpcUrl, {
      chainId: config.chainId,
      name: config.name
    })
  } catch (error) {
    console.warn(`Failed to connect to ${chainName}, using mock provider`)
    return createMockProvider()
  }
}

function createMockProvider() {
  return {
    getNetwork: () => Promise.resolve({ chainId: 31337, name: 'hardhat' }),
    getBlockNumber: () => Promise.resolve(1234567),
    // ... other mock methods
  } as any
}
```

### **Issue: Contract ABI Loading Failures**

**Symptoms:**

```bash
Error: Contract ABI not found
TypeError: Cannot read property 'abi' of undefined
```

**Root Cause:** Missing or incorrectly loaded contract artifacts

**Solution:**

```typescript
// src/__tests__/utils/contractLoader.ts
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export function loadContractABI(contractName: string): any[] {
  const artifactPaths = [
    // Hardhat artifacts
    join(__dirname, `../../../contracts/artifacts/contracts/${contractName}.sol/${contractName}.json`),
    // Compiled artifacts
    join(__dirname, `../../../contracts/deployments/${contractName}.json`),
    // Test fixtures
    join(__dirname, `../fixtures/abis/${contractName}.json`),
  ]

  for (const path of artifactPaths) {
    if (existsSync(path)) {
      try {
        const artifact = JSON.parse(readFileSync(path, 'utf8'))
        return artifact.abi || artifact
      } catch (error) {
        console.warn(`Failed to load ABI from ${path}:`, error)
      }
    }
  }

  // Fallback to minimal ABI for testing
  return getMinimalABI(contractName)
}

function getMinimalABI(contractName: string): any[] {
  const minimalABIs = {
    PoolFactory: [
      'function createPool(address,uint256,uint256,uint256,string) returns (uint256)',
      'function pools(uint256) view returns (address,address,string,uint256,uint256,uint256,bool)',
      'event PoolCreated(uint256 indexed,address indexed,address indexed,string,uint256,uint256,uint256)',
    ],
    Safe: [
      'function getOwners() view returns (address[])',
      'function getThreshold() view returns (uint256)',
      'function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) returns (bool)',
    ],
  }

  return minimalABIs[contractName] || []
}
```

### **Issue: Gas Estimation Failures**

**Symptoms:**

```bash
Error: execution reverted (estimateGas)
Error: intrinsic gas too low
```

**Root Cause:** Insufficient gas limits or contract execution failures

**Solution:**

```typescript
// Enhanced gas estimation with fallbacks
export async function estimateGasWithFallback(contract: Contract, methodName: string, args: any[]): Promise<bigint> {
  try {
    // Try normal estimation
    const estimate = await contract[methodName].estimateGas(...args)
    return (estimate * BigInt(120)) / BigInt(100) // Add 20% buffer
  } catch (error) {
    console.warn(`Gas estimation failed for ${methodName}:`, error)

    // Try static call first to check if method would succeed
    try {
      await contract[methodName].staticCall(...args)
      // If static call succeeds, use fallback gas limit
      return getFallbackGasLimit(methodName)
    } catch (staticError) {
      console.error(`Static call failed for ${methodName}:`, staticError)
      throw new Error(`Contract call would fail: ${staticError.message}`)
    }
  }
}

function getFallbackGasLimit(methodName: string): bigint {
  const gasLimits = {
    createPool: BigInt('500000'),
    transferOwnership: BigInt('100000'),
    execTransaction: BigInt('800000'),
    // Default
    default: BigInt('300000'),
  }

  return gasLimits[methodName] || gasLimits.default
}
```

---

## 🧪 **Mock System Issues**

### **Issue: Mock Implementations Not Working**

**Symptoms:**

```bash
TypeError: mockFunction.mockResolvedValue is not a function
Jest mock not being called in test
```

**Root Cause:** Incorrect mock setup or timing issues

**Solution:**

```typescript
// Ensure mocks are setup before imports
// src/__tests__/example.test.ts

// 1. Mock at the top level, before imports
jest.mock('firebase-admin/app')
jest.mock('ethers')

// 2. Import after mocking
import { createPoolHandler } from '../functions/pools/createPool'
import { firebaseAdminMock } from '../__mocks__/firebase/FirebaseAdminMock'

describe('Test Suite', () => {
  beforeEach(() => {
    // 3. Reset mocks before each test
    jest.clearAllMocks()
    firebaseAdminMock.resetAllMocks()
  })

  it('should use mocks correctly', async () => {
    // 4. Setup mock return values
    firebaseAdminMock.firestore.collection('pools').doc().set.mockResolvedValue(undefined)

    // 5. Verify mock was called
    await createPoolHandler(mockRequest)

    expect(firebaseAdminMock.firestore.collection).toHaveBeenCalledWith('pools')
  })
})
```

### **Issue: Mock State Leaking Between Tests**

**Symptoms:**

```bash
Test passes when run alone but fails in suite
Mock returns unexpected values from previous test
```

**Root Cause:** Shared mock state not being reset

**Solution:**

```typescript
// src/__mocks__/mockReset.ts
export class MockStateManager {
  private static originalMocks = new Map()

  static captureOriginalState() {
    // Capture original mock implementations
    this.originalMocks.set('firestore.collection', firebaseAdminMock.firestore.collection)
    this.originalMocks.set('auth.verifyIdToken', firebaseAdminMock.auth.verifyIdToken)
  }

  static resetToOriginalState() {
    // Reset to captured implementations
    this.originalMocks.forEach((originalImpl, path) => {
      const [service, method] = path.split('.')
      firebaseAdminMock[service][method] = originalImpl
    })
  }

  static resetAllMocks() {
    // Complete reset
    jest.clearAllMocks()
    firebaseAdminMock.resetAllMocks()
    ethersMock.resetAllMocks()
  }
}

// In test setup
beforeAll(() => {
  MockStateManager.captureOriginalState()
})

beforeEach(() => {
  MockStateManager.resetAllMocks()
})
```

### **Issue: Async Mock Timing Issues**

**Symptoms:**

```bash
Test finishes before async mock resolves
Promise-based mock doesn't execute
```

**Root Cause:** Test not waiting for async operations

**Solution:**

```typescript
// Proper async mock handling
describe('Async Mock Tests', () => {
  it('should wait for async operations', async () => {
    // 1. Setup async mock
    const mockPromise = Promise.resolve({ success: true })
    firebaseAdminMock.firestore.collection('pools').doc().set.mockReturnValue(mockPromise)

    // 2. Execute function and await result
    const result = await createPoolHandler(mockRequest)

    // 3. Verify async operations completed
    expect(result).toBeDefined()
    expect(firebaseAdminMock.firestore.collection).toHaveBeenCalled()

    // 4. Wait for all pending promises
    await new Promise((resolve) => setImmediate(resolve))
  })

  it('should handle rejected promises', async () => {
    // Setup rejected mock
    const mockError = new Error('Mock async error')
    firebaseAdminMock.firestore.collection('pools').doc().set.mockRejectedValue(mockError)

    // Test error handling
    await expect(createPoolHandler(mockRequest)).rejects.toThrow('Mock async error')
  })
})
```

---

## 📊 **Coverage Issues**

### **Issue: Low Coverage Despite Tests**

**Symptoms:**

```bash
Coverage threshold not met: branches (85%) < 90%
Functions show as uncovered but have tests
```

**Root Cause:** Coverage not detecting all execution paths

**Solution:**

```javascript
// jest.config.js - Enhanced coverage configuration
module.exports = {
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/__mocks__/**',
    '!src/__tests__/**',
    '!src/index.ts', // Firebase Functions entry point
  ],

  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov'
  ],

  coverageThreshold: {
    global: {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95
    },
    // Per-file thresholds for critical functions
    'src/functions/pools/**/*.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    }
  }
}

// Add coverage debugging
// package.json
{
  "scripts": {
    "test:coverage:debug": "jest --coverage --verbose --collectCoverageFrom='src/functions/pools/**/*.ts'"
  }
}
```

### **Issue: Coverage Excluding Important Files**

**Symptoms:**

```bash
Important functions not appearing in coverage report
Coverage percentage seems artificially high
```

**Root Cause:** Incorrect file inclusion/exclusion patterns

**Solution:**

```javascript
// Fix coverage collection patterns
module.exports = {
  collectCoverageFrom: [
    // Include all source files
    'src/**/*.{ts,js}',

    // Explicitly exclude only what shouldn't be covered
    '!src/**/*.d.ts',
    '!src/**/*.test.{ts,js}',
    '!src/**/__tests__/**',
    '!src/**/__mocks__/**',
    '!src/index.ts',

    // Don't exclude constants - they should be covered if used
    // '!src/constants/**', // REMOVE THIS LINE

    // Don't exclude utils - they should be tested
    // '!src/utils/**', // REMOVE THIS LINE
  ],

  // Debug what files are being considered
  verbose: true,

  // Generate detailed reports
  coverageReporters: [
    'text-summary',
    'html',
    ['text', { skipFull: true }], // Only show files with missing coverage
  ],
}
```

---

## ⚡ **Performance Issues**

### **Issue: Slow Test Execution**

**Symptoms:**

```bash
Tests take >30 seconds to run
Individual tests timeout
Jest runs out of memory
```

**Root Cause:** Inefficient test setup or too many real API calls

**Solution:**

```javascript
// jest.config.js - Performance optimization
module.exports = {
  // Parallel execution
  maxWorkers: '50%', // Use half CPU cores

  // Faster test discovery
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts', '<rootDir>/src/**/*.test.ts'],

  // Cache configuration
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',

  // Timeout settings
  testTimeout: 10000, // 10 seconds max per test

  // Memory optimization
  workerIdleMemoryLimit: '512MB',

  // Setup/teardown optimization
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup/performance.setup.ts'],
}

// src/__tests__/setup/performance.setup.ts
// Optimize test setup
beforeAll(() => {
  // One-time expensive setup
  setupTestEnvironment()
})

beforeEach(() => {
  // Only reset what's necessary
  jest.clearAllMocks() // Fast
  // Don't recreate entire mock instances each time
})

afterAll(() => {
  // Cleanup resources
  cleanupTestEnvironment()
})
```

### **Issue: Memory Leaks in Tests**

**Symptoms:**

```bash
Jest out of memory
Tests become progressively slower
Node.js heap size exceeded
```

**Root Cause:** Uncleaned test resources or circular references

**Solution:**

```typescript
// Memory leak prevention
describe('Memory-Safe Tests', () => {
  let testResources: any[] = []

  beforeEach(() => {
    testResources = []
  })

  afterEach(() => {
    // Clean up test resources
    testResources.forEach(resource => {
      if (resource && typeof resource.cleanup === 'function') {
        resource.cleanup()
      }
    })
    testResources.length = 0

    // Force garbage collection in tests if available
    if (global.gc) {
      global.gc()
    }
  })

  it('should not leak memory', async () => {
    // Create test resource with cleanup
    const testProvider = createTestProvider()
    testResources.push(testProvider)

    // Use resource
    await testProvider.getNetwork()

    // Cleanup will happen in afterEach
  })
})

// Enable garbage collection in test runs
// package.json
{
  "scripts": {
    "test": "node --expose-gc ./node_modules/.bin/jest",
    "test:memory": "node --expose-gc --max-old-space-size=4096 ./node_modules/.bin/jest"
  }
}
```

---

## 🔍 **Debugging Strategies**

### **Debug Test Failures**

```bash
# Run single test with full output
pnpm test --verbose --no-cache src/functions/pools/createPool.test.ts

# Debug with Node.js inspector
node --inspect-brk ./node_modules/.bin/jest --runInBand --no-cache

# Enable detailed error logging
DEBUG=* pnpm test

# Generate test report
pnpm test --outputFile=test-results.json --json
```

### **Debug Mock Issues**

```typescript
// Add debug logging to mocks
export const debugFirebaseMock = {
  logAllCalls: true,

  collection: jest.fn().mockImplementation((name) => {
    if (debugFirebaseMock.logAllCalls) {
      console.log(`🔍 Firestore.collection called with: ${name}`)
    }
    return mockCollection
  }),
}

// Inspect mock call history
afterEach(() => {
  if (process.env.DEBUG_MOCKS) {
    console.log('Mock call summary:')
    console.log('Firestore calls:', firebaseAdminMock.firestore.collection.mock.calls)
    console.log('Auth calls:', firebaseAdminMock.auth.verifyIdToken.mock.calls)
  }
})
```

### **Debug Contract Integration**

```typescript
// Enhanced contract debugging
export function debugContractCall(contract: Contract, methodName: string, args: any[]) {
  console.log(`📞 Contract call: ${methodName}`)
  console.log(`📊 Arguments:`, args)
  console.log(`🏠 Contract address:`, contract.target)
  console.log(`🌐 Provider:`, contract.provider?.connection?.url || 'No provider')
}

// Use in tests
beforeEach(() => {
  if (process.env.DEBUG_CONTRACTS) {
    // Wrap contract methods with debugging
    const originalCreatePool = contractTester.createPool
    contractTester.createPool = async function (params) {
      debugContractCall(this.blockchain.poolFactory, 'createPool', Object.values(params))
      return originalCreatePool.call(this, params)
    }
  }
})
```

This troubleshooting guide addresses the most common backend testing issues and provides practical, tested solutions for maintaining a robust testing environment.
