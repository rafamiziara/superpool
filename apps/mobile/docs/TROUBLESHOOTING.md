# SuperPool Mobile Testing Troubleshooting

## 🚨 **Common Testing Issues & Solutions**

This guide addresses the most frequent testing problems encountered in SuperPool mobile development and provides actionable solutions.

---

## 🔧 **Jest & Test Runner Issues**

### **Problem: Tests Not Found or Not Running**

#### **Symptoms**

```bash
$ pnpm test
No tests found
```

#### **Common Causes & Solutions**

**1. Jest Configuration Issues**

```javascript
// ❌ Bad: Missing test patterns
module.exports = {
  // No testMatch or testRegex specified
}

// ✅ Fix: Add proper test patterns
module.exports = {
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}', '<rootDir>/tests/**/*.test.{ts,tsx}'],
}
```

**2. File Naming Conventions**

```bash
# ❌ Bad: Jest can't find these
AuthStore.spec.ts
test-auth-service.ts
auth.tests.ts

# ✅ Good: Jest finds these automatically
AuthStore.test.ts
AuthService.test.ts
auth-utils.test.ts
```

**3. TypeScript Configuration Conflicts**

```bash
# Check TypeScript configuration
npx tsc --showConfig

# Common issue: Conflicting tsconfig.json files
apps/mobile/tsconfig.json          # App-specific config
apps/mobile/jest.config.js         # May override TS settings
```

**Solution:**

```javascript
// jest.config.js - Ensure TypeScript integration
module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|expo|@expo|@unimodules|unimodules|sentry-expo|react-native-svg)/)',
  ],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
}
```

**4. Dependency Cache Issues After Updates**

```bash
# Symptoms: Tests suddenly stop running after dependency updates
$ pnpm test
No tests found, exiting with code 1

# Common after: pnpm update, adding/removing packages, version changes
```

**Solution: Clean Install**

```bash
# 1. Remove all cached dependencies (from project root)
rm -rf node_modules
rm pnpm-lock.yaml

# On Windows
rmdir /s node_modules
del pnpm-lock.yaml

# 2. Clean install all dependencies
pnpm install

# 3. Clear Jest cache if still having issues
pnpm test --clearCache
```

**Why This Works:**

- Dependency updates can create inconsistent cache states
- Monorepo workspaces especially prone to cache conflicts
- Clean install ensures consistent dependency resolution
- Jest cache may reference old module locations

### **Problem: Tests Fail with Module Import Errors**

#### **Symptoms**

```bash
Cannot resolve module '@/stores/RootStore'
SyntaxError: Unexpected token 'export'
```

#### **Solutions**

**1. Fix Import Path Resolution**

```typescript
// ❌ Bad: Relative imports get messy
import { RootStore } from '../../../stores/RootStore'
import { AuthService } from '../../services/AuthService'

// ✅ Good: Use absolute imports with proper aliases
import { RootStore } from '@/stores/RootStore'
import { AuthService } from '@/services/AuthService'
```

**2. Update Jest Module Mapping**

```javascript
// jest.config.js
module.exports = {
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@superpool/(.*)$': '<rootDir>/../../packages/$1',
  },
}
```

**3. Configure TypeScript Path Mapping**

```json
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@superpool/*": ["../../packages/*"]
    }
  }
}
```

---

## 🎭 **Mock-Related Issues**

### **Problem: Mocks Not Working or Being Ignored**

#### **Symptoms**

```bash
TypeError: Cannot read property 'mockResolvedValue' of undefined
Real Firebase is being called instead of mock
```

#### **Solutions**

**1. Mock Hoisting Issues**

```typescript
// ❌ Bad: Mock defined after import
import { FirebaseService } from '@/services/FirebaseService'
const mockFirebase = jest.mock('@/services/FirebaseService')

// ✅ Good: Hoist mock before imports
jest.mock('@/services/FirebaseService')
import { FirebaseService } from '@/services/FirebaseService'
```

**2. Incorrect Mock Implementation**

```typescript
// ❌ Bad: Mock doesn't match actual interface
jest.mock('firebase/auth', () => ({
  signInWithCustomToken: jest.fn(), // Missing other methods
}))

// ✅ Good: Complete mock implementation
jest.mock('firebase/auth', () => ({
  signInWithCustomToken: jest.fn(),
  signOut: jest.fn(),
  onAuthStateChanged: jest.fn(),
  getAuth: jest.fn(),
}))
```

**3. Mock Not Applied in Setup**

```typescript
// setupTests.ts - Ensure mocks are properly applied
import { firebaseAuth } from '../__mocks__/external/firebase'

// ❌ Bad: Missing mock application
// Mock is defined but never applied

// ✅ Good: Explicitly apply mock
jest.mock('firebase/auth', () => firebaseAuth)
```

### **Problem: Mock State Leaking Between Tests**

#### **Symptoms**

```bash
Test A passes when run alone, fails when run after Test B
Mock function was called with unexpected arguments
```

#### **Solutions**

**1. Proper Mock Cleanup**

```typescript
describe('AuthStore', () => {
  beforeEach(() => {
    // ✅ Reset all mocks before each test
    jest.clearAllMocks()

    // ✅ Reset mock implementations if needed
    mockAuthService.authenticate.mockResolvedValue(mockUser)
  })

  afterEach(() => {
    // ✅ Clean up any timers or async operations
    jest.clearAllTimers()
    jest.useRealTimers()
  })
})
```

**2. Isolate Mock State**

```typescript
// ❌ Bad: Shared mock state
const globalMockStore = createMockAuthStore()

describe('Component A', () => {
  // Uses globalMockStore - state shared!
})

// ✅ Good: Fresh mock per test
describe('Component A', () => {
  let mockStore: ReturnType<typeof createMockAuthStore>

  beforeEach(() => {
    mockStore = createMockAuthStore() // Fresh instance
  })
})
```

---

## 📱 **React Native Testing Issues**

### **Problem: React Native Components Not Rendering**

#### **Symptoms**

```bash
ReferenceError: View is not defined
Cannot read property 'Text' of undefined
```

#### **Solutions**

**1. Missing React Native Testing Library Setup**

```typescript
// ❌ Bad: Using React Testing Library (web)
import { render } from '@testing-library/react'

// ✅ Good: Using React Native Testing Library
import { render } from '@testing-library/react-native'
```

**2. Missing Native Component Mocks**

```javascript
// jest.config.js - Add React Native preset
module.exports = {
  preset: 'jest-expo', // Includes RN mocks

  // Or manually mock native components
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
}
```

**3. Custom Component Mock Setup**

```typescript
// setupTests.ts
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}))

jest.mock('@expo/vector-icons', () => {
  const MockIcon = ({ name, size, color, ...props }) => React.createElement('Text', { ...props }, name)

  return {
    FontAwesome: MockIcon,
    MaterialIcons: MockIcon,
  }
})
```

### **Problem: Async Component Updates Not Working**

#### **Symptoms**

```bash
Warning: An update to Component was not wrapped in act(...)
Expected element to be present, but it wasn't
```

#### **Solutions**

**1. Proper `act()` Usage**

```typescript
import { act } from '@testing-library/react-native'

it('should update after async operation', async () => {
  const { getByText } = render(<AsyncComponent />)

  // ✅ Wrap async state updates in act()
  await act(async () => {
    fireEvent.press(getByText('Load Data'))
  })

  expect(getByText('Loading complete')).toBeTruthy()
})
```

**2. Wait for Async Updates**

```typescript
import { waitFor } from '@testing-library/react-native'

it('should show data after loading', async () => {
  const { getByText, queryByText } = render(<DataComponent />)

  fireEvent.press(getByText('Load'))

  // ✅ Wait for async updates
  await waitFor(() => {
    expect(queryByText('Loading...')).toBeNull()
  })

  expect(getByText('Data loaded')).toBeTruthy()
})
```

---

## 🏪 **MobX Store Testing Issues**

### **Problem: Store State Not Updating in Tests**

#### **Symptoms**

```bash
Store action was called but state didn't change
Expected store.isLoading to be false, received true
```

#### **Solutions**

**1. Missing Observer Wrapper**

```typescript
// ❌ Bad: Component not observing store changes
const TestComponent = () => {
  const { auth } = useStores()
  return <Text>{auth.isAuthenticated ? 'Logged in' : 'Logged out'}</Text>
}

// ✅ Good: Component wrapped with observer
const TestComponent = observer(() => {
  const { auth } = useStores()
  return <Text>{auth.isAuthenticated ? 'Logged in' : 'Logged out'}</Text>
})
```

**2. Incorrect Async Action Handling**

```typescript
// ❌ Bad: Not waiting for async actions
it('should authenticate user', () => {
  store.authenticate('signature') // Async action
  expect(store.isAuthenticated).toBe(true) // Fails - too early
})

// ✅ Good: Wait for async actions
it('should authenticate user', async () => {
  await store.authenticate('signature')
  expect(store.isAuthenticated).toBe(true)
})
```

**3. Store Context Issues**

```typescript
// ✅ Proper store context setup
const renderWithStore = (ui: React.ReactElement, store = mockStore) => {
  return render(
    <StoreProvider value={store}>
      {ui}
    </StoreProvider>
  )
}
```

### **Problem: MobX Actions Not Being Tracked**

#### **Solutions**

**1. Ensure Actions Are Defined**

```typescript
// ❌ Bad: Missing action decorator
export class AuthStore {
  async authenticate(signature: string) {
    this.isAuthenticated = true // Won't trigger updates
  }
}

// ✅ Good: Proper action definition
export class AuthStore {
  @action
  async authenticate(signature: string) {
    this.isAuthenticated = true
  }

  // Or using makeAutoObservable
  constructor() {
    makeAutoObservable(this)
  }
}
```

---

## 🔥 **Firebase Testing Issues**

### **Problem: Firebase Functions Called in Tests**

#### **Symptoms**

```bash
Firebase App named '[DEFAULT]' already exists
Network request failed - calling real Firebase
```

#### **Solutions**

**1. Complete Firebase Mock**

```typescript
// __mocks__/external/firebase.ts
export const firebaseAuth = {
  signInWithCustomToken: jest.fn(),
  signOut: jest.fn(),
  onAuthStateChanged: jest.fn((callback) => {
    // Mock user state
    callback({ uid: 'test-user', email: 'test@example.com' })
    return jest.fn() // Unsubscribe function
  }),
}

export const firebaseFunctions = {
  httpsCallable: jest.fn((functionName) => {
    return jest.fn().mockResolvedValue({ data: 'mock-result' })
  }),
}
```

**2. Proper Mock Application**

```typescript
// setupTests.ts
jest.mock('firebase/auth', () => require('../__mocks__/external/firebase').firebaseAuth)
jest.mock('firebase/functions', () => require('../__mocks__/external/firebase').firebaseFunctions)
```

---

## 🌐 **Wagmi & Web3 Testing Issues**

### **Problem: Wallet Connection Mocks Not Working**

#### **Solutions**

**1. Comprehensive Wagmi Mock**

```typescript
// __mocks__/external/wagmi.ts
export const useAccount = jest.fn(() => ({
  address: undefined,
  isConnected: false,
  isReconnecting: false,
  status: 'disconnected' as const,
}))

export const useConnect = jest.fn(() => ({
  connect: jest.fn(),
  connectors: [],
  isLoading: false,
  error: null,
}))

export const useDisconnect = jest.fn(() => ({
  disconnect: jest.fn(),
}))
```

**2. Dynamic Mock Configuration**

```typescript
// In tests - configure mock behavior
beforeEach(() => {
  ;(useAccount as jest.Mock).mockReturnValue({
    address: '0x123...',
    isConnected: true,
    status: 'connected',
  })
})
```

---

## 📊 **Coverage Issues**

### **Problem: Coverage Reports Missing or Incorrect**

#### **Symptoms**

```bash
Coverage report shows 0% coverage
Files missing from coverage report
```

#### **Solutions**

**1. Correct Coverage Configuration**

```javascript
// jest.config.js
module.exports = {
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/**/*.test.{ts,tsx}', '!src/**/__mocks__/**'],
  coverageDirectory: '../../coverage/mobile',
  coverageReporters: ['text', 'lcov', 'html'],
}
```

**2. File Path Issues**

```bash
# Check if files are being excluded unintentionally
pnpm test --coverage --verbose
```

### **Problem: Coverage Thresholds Failing**

#### **Solutions**

**1. Identify Uncovered Code**

```bash
# Run coverage with detailed output
pnpm test --coverage --verbose

# Check specific file coverage
pnpm test --coverage AuthStore.test.ts
```

**2. Add Missing Tests**

```typescript
// Focus on uncovered branches and functions
describe('AuthStore - Edge Cases', () => {
  it('should handle concurrent authentication attempts', async () => {
    // Test race conditions
  })

  it('should cleanup expired sessions', () => {
    // Test cleanup logic
  })
})
```

---

## 🐛 **Debug Strategies**

### **Test Debugging Workflow**

**1. Isolate the Problem**

```bash
# Run single test file
pnpm test AuthStore.test.ts

# Run specific test
pnpm test --testNamePattern="should authenticate user"

# Run with verbose output
pnpm test --verbose
```

**2. Add Debug Output**

```typescript
it('should update store state', async () => {
  console.log('Before:', store.isAuthenticated)
  await store.authenticate('signature')
  console.log('After:', store.isAuthenticated)

  expect(store.isAuthenticated).toBe(true)
})
```

**3. Check Mock Behavior**

```typescript
it('should call service method', () => {
  store.authenticate('signature')

  // Debug mock calls
  console.log('Mock calls:', mockService.authenticate.mock.calls)
  console.log('Mock results:', mockService.authenticate.mock.results)

  expect(mockService.authenticate).toHaveBeenCalledWith('signature')
})
```

### **Common Debug Commands**

```bash
# Clear Jest cache
pnpm test --clearCache

# Update snapshots
pnpm test --updateSnapshot

# Run tests with no cache
pnpm test --no-cache

# Debug test configuration
node --inspect-brk node_modules/.bin/jest --runInBand
```

---

## 📚 **Quick Reference**

### **Essential Mock Imports**

```typescript
// Centralized mocks
import { createMockAuthStore, createMockRootStore } from '../__mocks__/factories/storeFactory'
import { createMockSignatureService } from '../__mocks__/factories/serviceFactory'
import asyncStorage from '../__mocks__/external/asyncStorage'
import { firebaseAuth, firebaseFunctions } from '../__mocks__/external/firebase'
```

### **Common Test Patterns**

```typescript
// Store testing
const mockStore = createMockAuthStore({ isAuthenticated: true })

// Component testing
const { getByText, getByTestId } = render(
  <StoreProvider value={{ auth: mockStore }}>
    <TestComponent />
  </StoreProvider>
)

// Async testing
await waitFor(() => {
  expect(getByText('Success')).toBeTruthy()
})

// Mock cleanup
beforeEach(() => {
  jest.clearAllMocks()
})
```

### **Coverage Commands**

```bash
# Generate coverage report
pnpm test --coverage

# Open HTML coverage report
start coverage/mobile/lcov-report/index.html

# Check specific threshold
pnpm test --coverage --coverageThreshold='{"global":{"branches":90}}'
```

---

## 🔗 **Related Documentation**

- [Testing Guide](./TESTING_GUIDE.md) - Overall testing philosophy and standards
- [Mock System Guide](./MOCK_SYSTEM.md) - Mock architecture and patterns
- [Coverage Strategy](./COVERAGE_STRATEGY.md) - Coverage requirements and metrics
- [TDD Workflow](./TDD_WORKFLOW.md) - Test-driven development process

---

_When in doubt, start with the simplest reproduction case and gradually add complexity until you identify the root cause._
