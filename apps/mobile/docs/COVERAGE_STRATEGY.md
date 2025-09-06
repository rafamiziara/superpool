# SuperPool Mobile Coverage Strategy

## 🎯 **Coverage Philosophy**

Our coverage strategy balances **business value** with **development velocity**. We measure what matters, not just what's easy to test.

### **Coverage Principles**

- **Quality over Quantity**: 95% coverage of critical paths beats 100% coverage of trivial code
- **Business Logic Priority**: Focus on user-facing functionality and business rules
- **Risk-Based Approach**: Higher coverage for high-risk, high-impact code
- **Maintainable Thresholds**: Targets should be achievable and sustainable

---

## 📊 **Coverage Targets & Thresholds**

### **Global Targets** (All Code)

```javascript
coverageThreshold: {
  global: {
    branches: 90,      // Decision paths (if/else, switch)
    functions: 95,     // Function execution
    lines: 95,         // Code line execution
    statements: 95,    // Individual statements
  }
}
```

### **Critical Business Logic** (High Priority)

```javascript
'src/stores/**': {
  branches: 95,        // State management decisions
  functions: 95,       // All store methods
  lines: 95,          // Complete store coverage
  statements: 95,     // All statements tested
},

'src/services/**': {
  branches: 95,        // Service error handling
  functions: 95,       // All service methods
  lines: 95,          // Service logic coverage
  statements: 95,     // Complete service testing
}
```

### **Component Layer** (User Interface)

```javascript
'src/components/**': {
  branches: 90,        // Conditional rendering
  functions: 90,       // Component methods
  lines: 90,          // Component coverage
  statements: 90,     // UI logic testing
},

'src/hooks/**': {
  branches: 95,        // Hook logic paths
  functions: 95,       // Custom hook methods
  lines: 95,          // Complete hook coverage
  statements: 95,     // Hook state management
}
```

---

## 🚫 **Coverage Exclusions**

### **Files Excluded from Coverage**

```javascript
collectCoverageFrom: [
  'src/**/*.{ts,tsx}',

  // Exclusions
  '!src/**/*.d.ts',              // Type definitions
  '!src/**/*.test.{ts,tsx}',     // Test files
  '!src/**/__mocks__/**',        // Mock implementations
  '!src/app/**',                 // App router screens (for now)
  '!src/config/**',              // Configuration files
  '!src/firebase.config.ts',     // Firebase setup
  '!src/globals.d.ts',           // Global type declarations
  '!src/setupTests.ts',          // Test configuration
],
```

### **Why These Exclusions?**

#### **Configuration Files** (`src/config/**`)

- **Static data**: Constants and configuration objects
- **No business logic**: Just data declarations
- **Low risk**: Changes rarely break functionality
- **High maintenance cost**: Tests provide minimal value

```typescript
// Example: Why not test this?
export const TOAST_DURATIONS = {
  DEFAULT: 4000,
  SHORT: 3000,
  LONG: 5000,
} as const
// Testing this would just duplicate the values
```

#### **Type Definitions** (`*.d.ts` files)

- **Compile-time only**: No runtime behavior
- **TypeScript handles validation**: Compiler catches errors
- **No testable logic**: Just type annotations

#### **App Router Screens** (`src/app/**`) - Temporary

- **Complex integration**: Requires full app setup
- **High mocking overhead**: Many external dependencies
- **Future enhancement**: Will add focused integration tests later
- **Current focus**: Core business logic stability first

---

## 📈 **Coverage Quality Metrics**

### **What Good Coverage Looks Like**

#### **✅ High-Value Coverage**

```typescript
// Testing business logic and edge cases
describe('AuthenticationStore', () => {
  it('should handle concurrent authentication attempts', async () => {
    // Tests race conditions and state consistency
    const promises = [store.authenticate(signature1), store.authenticate(signature2)]

    const results = await Promise.allSettled(promises)
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
  })

  it('should clean up expired sessions', async () => {
    // Tests automatic cleanup logic
    jest.advanceTimersByTime(SESSION_TIMEOUT)
    expect(store.isAuthenticated).toBe(false)
  })
})
```

#### **❌ Low-Value Coverage**

```typescript
// Don't test implementation details
it('should call internal helper method', () => {
  const spy = jest.spyOn(service, '_internalHelper')
  service.publicMethod()
  expect(spy).toHaveBeenCalled() // This is not valuable
})

// Don't test static configuration
it('should have correct timeout value', () => {
  expect(AUTH_TIMEOUTS.DEFAULT).toBe(15000) // Just duplicates the constant
})
```

---

## 🎯 **Branch Coverage Deep Dive**

Branch coverage is **the most important metric** for SuperPool's business logic.

### **Why Branch Coverage Matters Most**

- **Decision Points**: Tests all code paths (if/else, switch, ternary)
- **Error Handling**: Ensures all error scenarios are tested
- **State Management**: Covers all possible state transitions
- **Edge Cases**: Forces testing of boundary conditions

### **Branch Coverage Examples**

#### **✅ Good Branch Coverage**

```typescript
// Service with comprehensive error handling
export class AuthService {
  async authenticate(signature: string): Promise<User> {
    try {
      // Branch 1: Signature validation
      if (!this.isValidSignature(signature)) {
        throw new Error('Invalid signature format')
      }

      // Branch 2: Network request
      const user = await this.verifyWithBackend(signature)

      // Branch 3: User data validation
      if (!user || !user.walletAddress) {
        throw new Error('Invalid user data received')
      }

      return user
    } catch (error) {
      // Branch 4: Error handling
      if (error.code === 'NETWORK_ERROR') {
        throw new NetworkError('Authentication service unavailable')
      }
      throw error
    }
  }
}

// Test covering all branches
describe('AuthService.authenticate', () => {
  it('should reject invalid signature format', async () => {
    await expect(service.authenticate('invalid')).rejects.toThrow('Invalid signature format')
  })

  it('should handle network errors gracefully', async () => {
    mockVerifyBackend.mockRejectedValue({ code: 'NETWORK_ERROR' })
    await expect(service.authenticate(validSig)).rejects.toThrow('Authentication service unavailable')
  })

  it('should reject invalid user data', async () => {
    mockVerifyBackend.mockResolvedValue({ walletAddress: null })
    await expect(service.authenticate(validSig)).rejects.toThrow('Invalid user data received')
  })

  it('should return valid user on success', async () => {
    mockVerifyBackend.mockResolvedValue(mockUser)
    const result = await service.authenticate(validSig)
    expect(result).toEqual(mockUser)
  })
})
```

---

## 🏃‍♂️ **Coverage Monitoring & Reporting**

### **Local Development**

```bash
# Generate coverage report
pnpm test --coverage

# View detailed HTML report
# Opens: ../../coverage/mobile/lcov-report/index.html
start coverage/mobile/lcov-report/index.html
```

### **Coverage Report Structure**

```
coverage/mobile/
├── lcov-report/
│   ├── index.html           # Overview dashboard
│   ├── src/
│   │   ├── stores/
│   │   │   └── AuthStore.ts.html    # File-level coverage
│   │   └── services/
│   └── coverage-final.json  # Machine-readable results
└── lcov.info               # CI integration format
```

### **CI/CD Integration**

- Coverage reports automatically uploaded on PR creation
- Failed builds if coverage drops below thresholds
- PR comments show coverage changes for modified files
- Historical coverage tracking to prevent regression

---

## 🔍 **Coverage Analysis Workflow**

### **1. Identify Coverage Gaps**

```bash
# Run coverage and identify low-coverage files
pnpm test --coverage --coverageReporters=text-lcov | grep -E "(branches|functions|lines|statements).*[0-8][0-9]%"
```

### **2. Analyze Uncovered Code**

```typescript
// Example: Uncovered branch in store
export class WalletStore {
  async connect(walletType: WalletType): Promise<void> {
    switch (walletType) {
      case 'metamask':
        return this.connectMetamask()
      case 'walletconnect':
        return this.connectWalletConnect()
      default:
        // ❌ This branch might be uncovered
        throw new Error(`Unsupported wallet: ${walletType}`)
    }
  }
}

// ✅ Add test for uncovered branch
it('should reject unsupported wallet types', async () => {
  await expect(store.connect('unsupported' as WalletType)).rejects.toThrow('Unsupported wallet')
})
```

### **3. Prioritize Coverage Improvements**

1. **Critical Business Paths**: Authentication, wallet connection, transaction flows
2. **Error Handling**: Network failures, validation errors, timeout scenarios
3. **Edge Cases**: Boundary conditions, race conditions, cleanup logic
4. **State Transitions**: Store state changes, component lifecycle events

---

## 📊 **Coverage Anti-Patterns to Avoid**

### **❌ Coverage for Coverage's Sake**

```typescript
// Bad: Testing getter methods just for coverage
it('should return user when getter called', () => {
  store.user = mockUser
  expect(store.user).toBe(mockUser) // No business value
})

// Bad: Testing trivial mappers
it('should map user data correctly', () => {
  const result = mapUserData(input)
  expect(result.id).toBe(input.id)
  expect(result.name).toBe(input.name) // Just testing the mapping definition
})
```

### **❌ Ignoring Important Branches**

```typescript
// Bad: Not testing error conditions
export class PaymentService {
  async processPayment(amount: number): Promise<void> {
    if (amount <= 0) {
      throw new Error('Amount must be positive') // ❌ Often uncovered
    }

    if (amount > MAX_AMOUNT) {
      throw new Error('Amount exceeds limit') // ❌ Often uncovered
    }

    // Success path gets tested, error paths ignored
    await this.sendPayment(amount)
  }
}
```

### **❌ Mock-Heavy Tests**

```typescript
// Bad: So much mocking that nothing real is tested
jest.mock('./service1')
jest.mock('./service2')
jest.mock('./service3')
jest.mock('./component')

// What are we actually testing at this point?
// High coverage but low confidence
```

---

## 🎯 **Coverage Improvement Strategies**

### **Strategy 1: Error Path Testing**

Focus on uncovered error handling branches:

```typescript
describe('Error Scenarios', () => {
  it('should handle network timeouts', async () => {
    mockAxios.mockRejectedValue(new Error('timeout'))
    await expect(service.fetchData()).rejects.toThrow('timeout')
  })

  it('should handle malformed responses', async () => {
    mockAxios.mockResolvedValue({ data: null })
    await expect(service.fetchData()).rejects.toThrow('Invalid response')
  })
})
```

### **Strategy 2: State Transition Testing**

Cover all possible state changes:

```typescript
describe('Store State Transitions', () => {
  it('should transition from loading to success', async () => {
    const promise = store.loadData()
    expect(store.isLoading).toBe(true)

    await promise
    expect(store.isLoading).toBe(false)
    expect(store.data).toBeDefined()
  })

  it('should transition from loading to error', async () => {
    mockService.mockRejectedValue(new Error('failed'))
    const promise = store.loadData()

    expect(store.isLoading).toBe(true)
    await promise
    expect(store.isLoading).toBe(false)
    expect(store.error).toBeDefined()
  })
})
```

### **Strategy 3: Edge Case Discovery**

Systematically test boundary conditions:

```typescript
describe('Validation Edge Cases', () => {
  it.each([
    ['empty string', ''],
    ['whitespace only', '   '],
    ['very long input', 'x'.repeat(1000)],
    ['special characters', '!@#$%^&*()'],
    ['unicode characters', '🚀📱💼'],
  ])('should handle %s', (description, input) => {
    const result = validator.validate(input)
    expect(typeof result).toBe('boolean')
  })
})
```

---

## 🔗 **Integration with Development Workflow**

### **Pre-Commit Coverage Checks**

```bash
# Git hook: Ensure coverage doesn't drop
#!/bin/bash
current_coverage=$(pnpm test --coverage --silent | grep "All files" | awk '{print $10}' | sed 's/%//')
if [ "$current_coverage" -lt 90 ]; then
  echo "Coverage below threshold: ${current_coverage}%"
  exit 1
fi
```

### **PR Review Coverage Guidelines**

- **New Features**: Must include comprehensive tests achieving target coverage
- **Bug Fixes**: Must include tests reproducing the bug and validating the fix
- **Refactoring**: Coverage must not decrease
- **Critical Code Changes**: Require additional reviewer approval if coverage drops

### **Coverage Debt Management**

- Track files with coverage below targets as "coverage debt"
- Include coverage improvements in sprint planning
- Prioritize coverage debt for high-risk, frequently changed code
- Set team goals for reducing coverage debt over time

---

## 🔗 **Related Documentation**

- [Testing Guide](./TESTING_GUIDE.md) - Overall testing philosophy and patterns
- [Mock System Guide](./MOCK_SYSTEM.md) - Mock architecture and usage
- [TDD Workflow](./TDD_WORKFLOW.md) - Test-driven development process
- [Troubleshooting](./TROUBLESHOOTING.md) - Common issues and solutions

---

_Coverage is a tool for quality, not a goal in itself. Focus on testing what matters to users and business outcomes._
