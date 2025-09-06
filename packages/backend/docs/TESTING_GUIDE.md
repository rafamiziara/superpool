# SuperPool Backend Testing Guide

## 🔥 **Firebase Cloud Functions Testing Philosophy**

Our backend testing strategy focuses on **serverless reliability** and **Firebase integration** while maintaining fast development cycles for critical business logic.

### **Core Testing Principles**

- **Function Isolation**: Test Cloud Functions independently and as integrated flows
- **Firebase Integration**: Validate Firestore, Auth, and Cloud Function interactions
- **Performance Awareness**: Monitor cold starts, execution time, and memory usage
- **Security First**: Validate authentication, authorization, and data sanitization

---

## 📁 **Test Organization Structure**

### **Unit Tests (Co-located)**

```
src/
├── functions/
│   ├── auth/
│   │   ├── generateAuthMessage.ts
│   │   └── generateAuthMessage.test.ts    # Function logic tests
│   ├── verification/
│   │   ├── verifySignature.ts
│   │   └── verifySignature.test.ts        # Crypto validation tests
└── services/
    ├── FirebaseService.ts
    └── FirebaseService.test.ts            # Service integration tests
```

### **Integration Tests**

```
tests/
├── integration/                    # Firebase service interactions
│   ├── authenticationFlow.test.ts  # End-to-end auth testing
│   └── databaseOperations.test.ts  # Firestore CRUD operations
├── performance/                    # Function performance tests
└── security/                      # Auth and data validation tests
```

---

## 🧪 **Test Types & Patterns**

### **1. Cloud Function Unit Tests** (80% of tests)

**Focus**: Individual function logic, input validation, error handling

```typescript
// ✅ Good Cloud Function Test
describe('generateAuthMessage', () => {
  beforeEach(() => {
    // Clean function environment
    process.env.ENVIRONMENT = 'test'
  })

  it('should generate valid auth message for wallet address', async () => {
    const request = createMockRequest({
      body: { walletAddress: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8' },
    })
    const response = createMockResponse()

    await generateAuthMessage(request, response)

    expect(response.status).toHaveBeenCalledWith(200)
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: {
        message: expect.stringContaining('SuperPool Authentication'),
        nonce: expect.stringMatching(/^[a-f0-9]{32}$/),
        timestamp: expect.any(Number),
      },
    })
  })

  it('should reject invalid wallet address format', async () => {
    const request = createMockRequest({
      body: { walletAddress: 'invalid-address' },
    })
    const response = createMockResponse()

    await generateAuthMessage(request, response)

    expect(response.status).toHaveBeenCalledWith(400)
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      error: 'INVALID_WALLET_ADDRESS',
    })
  })
})
```

### **2. Firebase Integration Tests** (15% of tests)

**Focus**: Firestore operations, Authentication flows, real Firebase interactions

```typescript
// ✅ Firebase Integration Test
describe('Authentication Flow Integration', () => {
  let testDb: admin.firestore.Firestore

  beforeAll(async () => {
    // Initialize test Firebase project
    testDb = admin.firestore()
  })

  afterEach(async () => {
    // Clean up test data
    await cleanTestCollections(testDb)
  })

  it('should complete full authentication cycle', async () => {
    const walletAddress = '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8'

    // 1. Generate auth message
    const authMessage = await generateAuthMessage({ walletAddress })

    // 2. Simulate signature verification
    const signature = await createTestSignature(authMessage.message)

    // 3. Verify and create user
    const result = await verifySignatureAndLogin({
      walletAddress,
      signature,
      message: authMessage.message,
    })

    // 4. Verify Firestore state
    const userDoc = await testDb.collection('users').doc(walletAddress).get()
    expect(userDoc.exists).toBe(true)
    expect(result.customToken).toBeDefined()
  })
})
```

### **3. Performance Tests** (5% of tests)

**Focus**: Execution time, memory usage, cold start optimization

```typescript
// ✅ Performance Test Example
describe('Function Performance', () => {
  it('should execute generateAuthMessage within 2 seconds', async () => {
    const startTime = Date.now()

    const request = createValidAuthRequest()
    const response = createMockResponse()

    await generateAuthMessage(request, response)

    const executionTime = Date.now() - startTime
    expect(executionTime).toBeLessThan(2000) // 2 second limit
  })

  it('should handle concurrent requests efficiently', async () => {
    const requests = Array(10)
      .fill(null)
      .map(() => generateAuthMessage(createValidAuthRequest(), createMockResponse()))

    const startTime = Date.now()
    await Promise.all(requests)
    const totalTime = Date.now() - startTime

    expect(totalTime).toBeLessThan(5000) // 5 seconds for 10 concurrent requests
  })
})
```

---

## 🔧 **Mock Strategy for Backend**

### **Firebase Service Mocks**

```typescript
// ✅ Mock Firebase Admin SDK
jest.mock('firebase-admin', () => ({
  firestore: () => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        set: jest.fn().mockResolvedValue(undefined),
        get: jest.fn().mockResolvedValue({ exists: true, data: () => ({}) }),
        update: jest.fn().mockResolvedValue(undefined),
      })),
    })),
  }),
  auth: () => ({
    createCustomToken: jest.fn().mockResolvedValue('mock-custom-token'),
  }),
}))
```

### **HTTP Request/Response Mocks**

```typescript
export const createMockRequest = (overrides = {}) => ({
  body: {},
  headers: {},
  method: 'POST',
  query: {},
  ...overrides,
})

export const createMockResponse = () => {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
  }
  return response
}
```

---

## 🎯 **Coverage Targets**

### **Function-Specific Coverage**

- **Critical Functions** (auth, verification): 100% lines, 95% branches
- **Utility Functions**: 95% lines, 90% branches
- **Configuration/Setup**: 80% lines (focus on error paths)

### **Integration Coverage**

- **Happy Path Flows**: 100% coverage
- **Error Scenarios**: 95% coverage
- **Edge Cases**: 90% coverage

---

## 🚀 **Running Backend Tests**

### **Development Commands**

```bash
# Run all backend tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run with coverage
pnpm test --coverage

# Run integration tests only
pnpm test --testPathPattern=integration

# Test specific function
pnpm test generateAuthMessage.test.ts
```

### **Firebase Emulator Testing**

```bash
# Start Firebase emulators
pnpm serve

# Run tests against emulators
FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm test

# Integration tests with full Firebase stack
pnpm test:integration
```

---

## 🔐 **Security Testing Patterns**

### **Authentication Validation**

```typescript
describe('Security: Authentication', () => {
  it('should reject requests without App Check token', async () => {
    const request = createMockRequest({
      headers: {}, // Missing X-Firebase-AppCheck header
    })

    const response = createMockResponse()
    await secureFunction(request, response)

    expect(response.status).toHaveBeenCalledWith(401)
  })

  it('should validate signature against message', async () => {
    const invalidSignature = '0xwrongsignature'

    const result = await verifySignature(walletAddress, message, invalidSignature)
    expect(result.valid).toBe(false)
  })
})
```

### **Data Sanitization Tests**

```typescript
describe('Security: Data Sanitization', () => {
  it('should sanitize user input for database storage', () => {
    const maliciousInput = '<script>alert("xss")</script>'
    const sanitized = sanitizeUserInput(maliciousInput)

    expect(sanitized).not.toContain('<script>')
    expect(sanitized).not.toContain('alert')
  })
})
```

---

## 📊 **Error Handling Standards**

### **Structured Error Responses**

```typescript
// ✅ Consistent error format
export const createErrorResponse = (error: AppError) => ({
  success: false,
  error: {
    code: error.code,
    message: error.message,
    details: error.details || null,
    timestamp: Date.now(),
  },
})

// ✅ Test error handling
it('should handle database connection errors gracefully', async () => {
  mockFirestore.collection.mockRejectedValue(new Error('Connection failed'))

  const response = await createUser(mockRequest, mockResponse)

  expect(response.status).toHaveBeenCalledWith(500)
  expect(response.json).toHaveBeenCalledWith(
    expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        code: 'DATABASE_ERROR',
      }),
    })
  )
})
```

---

## 🆘 **Common Backend Anti-Patterns**

### **❌ Don't Test Firebase SDK Behavior**

```typescript
// ❌ Bad: Testing Firebase internals
it('should call firestore.collection with correct parameters', () => {
  expect(mockFirestore.collection).toHaveBeenCalledWith('users')
})

// ✅ Good: Test business logic outcome
it('should create user document in database', async () => {
  const result = await createUser(userData)
  expect(result.success).toBe(true)
})
```

### **❌ Don't Mock Everything**

```typescript
// ❌ Bad: Over-mocking loses test value
jest.mock('../services/AuthService')
jest.mock('../services/DatabaseService')
jest.mock('../utils/validation')

// ✅ Good: Mock external dependencies only
jest.mock('firebase-admin')
jest.mock('crypto')
```

---

## 🔗 **Related Documentation**

- [Firebase Testing Guide](https://firebase.google.com/docs/functions/unit-testing)
- [Cloud Functions Best Practices](https://firebase.google.com/docs/functions/best-practices)
- [Security Rules Testing](https://firebase.google.com/docs/rules/unit-tests)

---

_Backend testing should ensure reliable serverless operations while maintaining fast development velocity._
