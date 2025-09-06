# SuperPool Mobile Testing Guide

## 🎯 **Testing Philosophy & Standards**

This guide establishes our testing standards for the SuperPool mobile application. Our approach prioritizes **business value** over coverage metrics while maintaining high quality standards.

### **Core Testing Principles**

- **Business Logic First**: Test what matters to users and business outcomes
- **Maintainable Tests**: Tests should be easy to understand and maintain
- **Fast Feedback**: Tests should run quickly to support rapid development
- **Realistic Scenarios**: Test real user interactions, not implementation details

---

## 📁 **Test Organization Structure**

### **Unit Tests (Co-located)**

```
src/
├── components/
│   ├── Button.tsx
│   └── Button.test.tsx             # Component behavior tests
├── hooks/
│   ├── useAuthentication.ts
│   └── useAuthentication.test.ts   # Hook logic tests
├── services/
│   ├── AuthService.ts
│   └── AuthService.test.ts         # Service logic tests
└── stores/
    ├── AuthStore.ts
    └── AuthStore.test.ts           # Store state management tests
```

### **Integration Tests (Dedicated Directory)**

```
tests/
├── integration/                 # Cross-component interactions
│   └── useAuthenticationFlow.test.ts
├── e2e/                         # End-to-end user journeys
├── performance/                 # Performance benchmarks
└── acceptance/                  # Business requirement validation
```

---

## 🧪 **Test Types & When to Use Them**

### **1. Unit Tests** (95% of our tests)

**When**: Testing individual functions, classes, or hooks in isolation
**Focus**: Logic, state changes, error handling, edge cases
**Location**: Co-located with implementation files

```typescript
// ✅ Good Unit Test Example
describe('ValidationUtils', () => {
  describe('isValidWalletAddress', () => {
    it('should return true for valid Ethereum address', () => {
      const result = ValidationUtils.isValidWalletAddress('0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8')
      expect(result).toBe(true)
    })

    it('should return false for invalid address format', () => {
      const result = ValidationUtils.isValidWalletAddress('invalid-address')
      expect(result).toBe(false)
    })
  })
})
```

### **2. Integration Tests** (5% of our tests)

**When**: Testing how multiple components work together across boundaries
**Focus**: Data flow, component interaction, cross-service communication
**Location**: `tests/integration/`

```typescript
// ✅ Good Integration Test Example
describe('Authentication Flow Integration', () => {
  it('should complete wallet connection and Firebase authentication', async () => {
    // Test the complete flow from wallet connection to authenticated state
    const { result } = renderHookWithStore(useAuthenticationFlow, mockStore)

    await act(() => {
      result.current.connectWallet('metamask')
    })

    expect(mockStore.auth.isAuthenticated).toBe(true)
    expect(mockStore.wallet.isConnected).toBe(true)
  })
})
```

### **3. Component Tests**

**When**: Testing React Native components
**Focus**: Rendering, user interactions, prop handling
**Tools**: React Native Testing Library

```typescript
// ✅ Good Component Test Example
describe('LoadingSpinner', () => {
  it('should render with default props', () => {
    const { getByTestId } = render(<LoadingSpinner />)
    expect(getByTestId('loading-spinner')).toBeTruthy()
  })

  it('should apply custom size and color', () => {
    const { getByTestId } = render(
      <LoadingSpinner size="large" color="#ff0000" />
    )
    const spinner = getByTestId('loading-spinner')
    // Test styling or props are applied correctly
  })
})
```

---

## 🏗️ **Testing Patterns & Best Practices**

### **✅ DO: Write Clear, Descriptive Tests**

```typescript
// ✅ Good: Clear test name and focused assertion
it('should return user profile when authentication is successful', async () => {
  const mockUser = { id: '123', address: '0x123...' }
  mockAuthService.authenticate.mockResolvedValue(mockUser)

  const result = await authStore.login('valid-signature')

  expect(result).toEqual(mockUser)
  expect(authStore.currentUser).toEqual(mockUser)
})
```

### **❌ DON'T: Test Implementation Details**

```typescript
// ❌ Bad: Testing internal method calls instead of behavior
it('should call internal helper method', () => {
  const spy = jest.spyOn(component, 'internalHelper')
  component.publicMethod()
  expect(spy).toHaveBeenCalled()
})

// ✅ Good: Test the actual behavior
it('should update user profile when save is clicked', () => {
  const { getByText } = render(<UserProfile user={mockUser} />)
  fireEvent.press(getByText('Save'))
  expect(onSave).toHaveBeenCalledWith(expectedData)
})
```

### **✅ DO: Use Descriptive Test Structure**

```typescript
describe('AuthenticationStore', () => {
  describe('login', () => {
    describe('when signature is valid', () => {
      it('should authenticate user and update state', () => {
        // Test implementation
      })
    })

    describe('when signature is invalid', () => {
      it('should throw authentication error', () => {
        // Test implementation
      })
    })
  })
})
```

---

## 🔧 **Mock Strategy**

### **Use Our Centralized Mock System**

```typescript
// ✅ Import from centralized mocks
import { createMockAuthStore, createMockRootStore } from '../__mocks__/factories/storeFactory'

// ✅ Use factory functions for consistent mocks
const mockStore = createMockAuthStore({
  isAuthenticated: true,
  user: mockUser,
})
```

### **Mock External Dependencies Only**

```typescript
// ✅ Mock external services
jest.mock('firebase/auth')
jest.mock('wagmi')

// ❌ Don't mock internal business logic
jest.mock('./AuthenticationStore') // This hides bugs!
```

---

## 📊 **Coverage Guidelines**

### **Coverage Targets**

- **Global**: 95% lines/functions/statements, 90% branches
- **Critical Areas** (Stores, Services): 95% across all metrics
- **Components**: 90% lines, focus on user interactions

### **Files Excluded from Coverage**

- Configuration files (`config/`, `firebase.config.ts`)
- Type definitions (`.d.ts` files)
- App screens (`app/`) - for now
- Static assets and exports

### **Quality Over Quantity**

- 100% coverage of critical business paths
- Focus on edge cases and error scenarios
- Ignore trivial getters/setters unless they have logic

---

## 🚀 **Running Tests**

### **Development Commands**

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run tests with coverage
pnpm test --coverage

# Run specific test file
pnpm test AuthenticationStore.test.ts

# Run tests matching pattern
pnpm test --testNamePattern="authentication"
```

### **Coverage Reports**

- **Text output**: Displayed in terminal
- **HTML report**: `../../coverage/mobile/lcov-report/index.html`
- **CI integration**: Coverage reports uploaded for PR reviews

---

## 🎯 **Test-Driven Development (TDD)**

### **Red-Green-Refactor Cycle**

1. **Red**: Write a failing test first
2. **Green**: Write minimal code to pass
3. **Refactor**: Improve code while keeping tests green

### **TDD Example**

```typescript
// 1. RED: Write failing test
describe('UserService', () => {
  it('should validate user email format', () => {
    expect(UserService.isValidEmail('test@example.com')).toBe(true)
    expect(UserService.isValidEmail('invalid-email')).toBe(false)
  })
})

// 2. GREEN: Implement minimal solution
export class UserService {
  static isValidEmail(email: string): boolean {
    return email.includes('@') && email.includes('.')
  }
}

// 3. REFACTOR: Improve implementation
export class UserService {
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }
}
```

---

## 📋 **Code Review Checklist**

### **Before Submitting PR**

- [ ] All tests pass locally
- [ ] Coverage targets met for new code
- [ ] Test names clearly describe behavior
- [ ] No tests for implementation details
- [ ] Mocks are minimal and focused

### **Reviewing Tests**

- [ ] Tests verify business requirements
- [ ] Edge cases and error scenarios covered
- [ ] Tests are readable and maintainable
- [ ] No duplicate test logic
- [ ] Appropriate test type used (unit vs integration)

---

## 🆘 **Common Anti-Patterns to Avoid**

### **❌ Testing Configuration Values**

```typescript
// ❌ Bad: Testing static configuration
it('should have correct chain ID', () => {
  expect(CHAIN_CONFIG.id).toBe(137)
})
```

### **❌ Testing Third-Party Libraries**

```typescript
// ❌ Bad: Testing React Native or Firebase behavior
it('should call AsyncStorage.setItem', () => {
  // Don't test external library behavior
})
```

### **❌ Excessive Mocking**

```typescript
// ❌ Bad: Mocking everything breaks test value
jest.mock('./service1')
jest.mock('./service2')
jest.mock('./service3')
// At this point, what are we actually testing?
```

### **❌ Brittle Tests**

```typescript
// ❌ Bad: Test breaks with UI changes
expect(container.querySelector('.auth-button-wrapper > button')).toBeInTheDocument()

// ✅ Good: Test semantic meaning
expect(getByRole('button', { name: 'Sign In' })).toBeInTheDocument()
```

---

## 🔗 **Related Documentation**

- [Mock System Guide](./MOCK_SYSTEM.md) - Detailed mock architecture
- [Coverage Strategy](./COVERAGE_STRATEGY.md) - Coverage requirements
- [TDD Workflow](./TDD_WORKFLOW.md) - Test-driven development process
- [Troubleshooting](./TROUBLESHOOTING.md) - Common issues and solutions

---

_This guide is a living document. Update it as our testing practices evolve and improve._
