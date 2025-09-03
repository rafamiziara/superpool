# SuperPool Mobile Mock System Guide

## 🏗️ **Mock Architecture Overview**

Our centralized mock system eliminates duplication and provides consistent, maintainable mocks across all tests. The system follows Jest best practices with a pure factory pattern for maximum flexibility and performance.

---

## 📁 **Mock Directory Structure**

```
apps/mobile/__mocks__/
├── index.ts                    # Central registry - single import point
├── external/                   # External library mocks
│   ├── asyncStorage.ts       # React Native AsyncStorage
│   ├── firebase.ts           # Firebase services
│   ├── wagmi.ts              # Wagmi wallet hooks
│   └── expo.ts               # Expo modules
├── internal/                   # Internal module mocks
│   ├── stores.ts             # MobX store mocks
│   ├── services.ts           # Service layer mocks
│   └── utils.ts              # Utility function mocks
└── factories/                  # Mock factory functions (MAIN)
    ├── storeFactory.ts       # Store mock factories
    ├── serviceFactory.ts     # Service mock factories
    ├── utilFactory.ts        # Utility mock factories
    └── testFactory.ts        # Test helpers & render functions
```

## ✨ **Key Benefits**

- **🚀 Performance**: Simple factory objects vs heavy MobX instances
- **🎯 Consistency**: Single source of truth for all mocks
- **📦 Jest Compliance**: Follows `__mocks__` convention
- **🔧 Maintainable**: Easy to update and extend
- **🧪 Predictable**: Clear factory patterns everyone understands

---

## 🎭 **Mock Categories**

## 🗺️ **How to Use the Mock System**

### **Primary Import Pattern**

```typescript
// ✅ CORRECT: Import everything from the centralized system
import {
  createMockRootStore,
  renderWithStore,
  renderHookWithStore,
  waitForMobX,
  mockStorePresets,
} from '../__mocks__/factories/testFactory'

// ✅ Also correct: Import specific factories
import { createMockAuthenticationStore } from '../__mocks__/factories/storeFactory'
import { createMockFirebaseAuthManager } from '../__mocks__/factories/serviceFactory'
```

### **⚠️ Avoid These Patterns**

```typescript
// ❌ WRONG: Don't import from test-utils (removed)
import { createMockRootStore } from '../test-utils'

// ❌ WRONG: Don't create inline mocks
const mockStore = {
  auth: { isAuthenticated: false },
  wallet: { isConnected: false },
}
```

---

## 🎨 **Factory Categories**

### **1. Test Factories (testFactory.ts)** - **Your Main Tools**

Render functions and test utilities - this is what you'll use 90% of the time.

#### **Component Testing**

```typescript
import { renderWithStore, mockStorePresets } from '../__mocks__/factories/testFactory'

describe('MyComponent', () => {
  it('should render with authenticated user', () => {
    const store = mockStorePresets.authenticatedWithWallet()
    const { getByTestId } = renderWithStore(<MyComponent />, { store })

    expect(getByTestId('user-info')).toBeTruthy()
  })
})
```

#### **Hook Testing**

```typescript
import { renderHookWithStore, createMockRootStore } from '../__mocks__/factories/testFactory'

describe('useMyHook', () => {
  it('should return correct state', () => {
    const store = createMockRootStore({
      authenticationStore: { isAuthenticated: true },
    })

    const { result } = renderHookWithStore(() => useMyHook(), { store })
    expect(result.current.isAuthenticated).toBe(true)
  })
})
```

### **2. Store Factories (storeFactory.ts)**

Create mock store instances with custom configurations.

#### **Basic Store Creation**

```typescript
import { createMockRootStore } from '../__mocks__/factories/storeFactory'

// Simple store with defaults
const store = createMockRootStore()

// Store with custom authentication state
const authenticatedStore = createMockRootStore({
  authenticationStore: {
    currentStep: 'firebase-auth',
    completedSteps: new Set(['connect-wallet', 'generate-message']),
    isProgressComplete: false,
  },
  walletStore: {
    isConnected: true,
    address: '0x1234567890123456789012345678901234567890',
    chainId: 137,
  },
})
```

### **3. Service Factories (serviceFactory.ts)**

Mock business logic services and API clients.

```typescript
import { createMockFirebaseAuthManager } from '../__mocks__/factories/serviceFactory'

// Mock Firebase auth with custom behavior
const authManager = createMockFirebaseAuthManager({
  getCurrentState: jest.fn(() => ({
    isAuthenticated: true,
    user: { uid: 'test-user' },
    walletAddress: '0x123...',
  })),
})
```

### **4. External Library Mocks**

Third-party dependencies are automatically mocked via setupTests.ts.

#### **AsyncStorage Mock**

```typescript
// Already available globally - no import needed
// __mocks__/external/asyncStorage.ts provides:
export default {
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}
```

#### **Firebase Mock**

```typescript
// __mocks__/external/firebase.ts
export const firebaseAuth = {
  signInWithCustomToken: jest.fn(),
  signOut: jest.fn(),
  onAuthStateChanged: jest.fn(),
  User: {},
}

export const firebaseFunctions = {
  httpsCallable: jest.fn(() => jest.fn()),
  getFunctions: jest.fn(),
}

export const firebaseApp = {
  initializeApp: jest.fn(),
  getApps: jest.fn(() => []),
  getApp: jest.fn(),
}
```

#### **Wagmi Hooks Mock**

```typescript
// __mocks__/external/wagmi.ts
export const useAccount = jest.fn(() => ({
  address: undefined,
  addresses: undefined,
  chain: undefined,
  chainId: undefined,
  connector: undefined,
  isConnected: false,
  isReconnecting: false,
  isConnecting: false,
  isDisconnected: true,
  status: 'disconnected' as const,
}))

export const useSignMessage = jest.fn(() => ({
  signMessage: jest.fn().mockResolvedValue('0xmockedsignature'),
  signMessageAsync: jest.fn().mockResolvedValue('0xmockedsignature'),
  data: undefined,
  error: null,
  isLoading: false,
  isError: false,
  isSuccess: false,
}))
```

### **2. Internal Module Mocks**

Basic mocks for internal modules, enhanced by factory functions.

```typescript
// __mocks__/internal/stores.ts
export const authStore = {
  isAuthenticated: false,
  user: null,
  authenticate: jest.fn(),
  logout: jest.fn(),
}

export const walletStore = {
  isConnected: false,
  address: null,
  connect: jest.fn(),
  disconnect: jest.fn(),
}
```

---

## 🏭 **Mock Factory System**

### **Why Use Factories?**

- **Flexibility**: Create mocks with specific configurations
- **Reusability**: Common mock patterns across tests
- **Consistency**: Standardized mock structure
- **Maintainability**: Single place to update mock behavior

### **Store Mock Factories**

#### **Authentication Store Factory**

```typescript
// __mocks__/factories/storeFactory.ts
export const createMockAuthStore = (
  overrides: Partial<{
    isAuthenticated: boolean
    user: unknown
    walletAddress: string | null
    isLoading: boolean
  }> = {}
) => ({
  isAuthenticated: false,
  user: null,
  walletAddress: null,
  isLoading: false,
  authenticate: jest.fn(),
  logout: jest.fn(),
  setUser: jest.fn(),
  setWalletAddress: jest.fn(),
  ...overrides,
})
```

**Usage Example:**

```typescript
// In your test file
describe('Component with Authentication', () => {
  it('should show user info when authenticated', () => {
    const mockStore = createMockAuthStore({
      isAuthenticated: true,
      user: { id: '123', name: 'Test User' },
      walletAddress: '0x742d35Cc...'
    })

    const { getByText } = renderWithStore(<UserProfile />, { auth: mockStore })
    expect(getByText('Test User')).toBeTruthy()
  })
})
```

#### **Root Store Factory**

```typescript
export const createMockRootStore = (
  overrides: Partial<{
    auth: unknown
    wallet: unknown
    pools: unknown
  }> = {}
) => ({
  auth: createMockAuthStore(),
  wallet: createMockWalletStore(),
  pools: createMockPoolStore(),
  ...overrides,
})
```

### **Service Mock Factories**

#### **Signature Service Factory**

```typescript
// __mocks__/factories/serviceFactory.ts
export const createMockSignatureService = (
  overrides: Partial<{
    signMessage: jest.Mock
    verifySignature: jest.Mock
  }> = {}
) => ({
  signMessage: jest.fn().mockResolvedValue('0xmockedsignature'),
  verifySignature: jest.fn().mockResolvedValue(true),
  generateNonce: jest.fn().mockResolvedValue('mock-nonce'),
  ...overrides,
})
```

**Usage Example:**

```typescript
// Mock a failing signature
const mockService = createMockSignatureService({
  signMessage: jest.fn().mockRejectedValue(new Error('Signature failed')),
})
```

---

## 🎯 **Mock Usage Patterns**

### **1. Test Setup with Factories**

```typescript
describe('AuthenticationFlow', () => {
  let mockStore: ReturnType<typeof createMockRootStore>
  let mockSignatureService: ReturnType<typeof createMockSignatureService>

  beforeEach(() => {
    mockStore = createMockRootStore()
    mockSignatureService = createMockSignatureService()

    // Reset all mocks before each test
    jest.clearAllMocks()
  })

  it('should authenticate user with valid signature', async () => {
    // Test implementation using configured mocks
  })
})
```

### **2. Scenario-Specific Mock Configuration**

```typescript
describe('Error Handling', () => {
  it('should handle signature rejection gracefully', async () => {
    const mockStore = createMockRootStore({
      auth: createMockAuthStore({ isAuthenticated: false }),
    })

    const mockService = createMockSignatureService({
      signMessage: jest.fn().mockRejectedValue(new Error('User rejected')),
    })

    // Test error handling with specific mock configuration
  })
})
```

### **3. Dynamic Mock Updates**

```typescript
it('should update UI when authentication state changes', async () => {
  const mockStore = createMockRootStore()

  const { rerender } = renderWithStore(<AuthButton />, mockStore)

  // Update mock state during test
  mockStore.auth.isAuthenticated = true
  mockStore.auth.user = { id: '123' }

  rerender(<AuthButton />)
  expect(getByText('Sign Out')).toBeTruthy()
})
```

---

## 🔧 **Setup Integration**

### **Global Mock Setup** (`setupTests.ts`)

```typescript
// src/setupTests.ts
import { firebaseApp, firebaseAuth, firebaseFunctions } from '../__mocks__/external/firebase'
import asyncStorage from '../__mocks__/external/asyncStorage'
import { expoSecureStore } from '../__mocks__/external/expo'
import wagmi from '../__mocks__/external/wagmi'

// Apply centralized mocks
jest.mock('firebase/auth', () => firebaseAuth)
jest.mock('firebase/functions', () => firebaseFunctions)
jest.mock('firebase/app', () => firebaseApp)
jest.mock('@react-native-async-storage/async-storage', () => asyncStorage)
jest.mock('expo-secure-store', () => expoSecureStore)
jest.mock('wagmi', () => wagmi)
```

### **Test Utilities Integration**

```typescript
// __mocks__/factories/testFactory.ts
import { createMockRootStore } from '../__mocks__/factories/storeFactory'

export function renderWithStore(
  ui: React.ReactElement,
  initialStore = createMockRootStore()
) {
  return render(
    <StoreProvider store={initialStore}>
      {ui}
    </StoreProvider>
  )
}
```

---

## 🚫 **Mock Best Practices**

### **✅ DO: Use Factories for Complex Scenarios**

```typescript
// ✅ Good: Factory provides flexibility
const mockStore = createMockAuthStore({
  isAuthenticated: true,
  user: mockUser,
  walletAddress: '0x123...',
})
```

### **✅ DO: Mock External Dependencies Only**

```typescript
// ✅ Good: Mock third-party libraries
jest.mock('firebase/auth')
jest.mock('wagmi')

// ❌ Bad: Don't mock your own business logic
jest.mock('./AuthenticationStore') // This hides bugs!
```

### **✅ DO: Keep Mocks Simple and Focused**

```typescript
// ✅ Good: Simple, focused mock
const mockSignature = jest.fn().mockResolvedValue('0xsignature')

// ❌ Bad: Over-complicated mock
const mockSignature = jest.fn().mockImplementation(async (message) => {
  if (message.includes('error')) throw new Error()
  return await realSignatureFunction(message) // Why mock then?
})
```

### **✅ DO: Reset Mocks Between Tests**

```typescript
beforeEach(() => {
  jest.clearAllMocks() // Reset all mock calls and state
})
```

### **❌ DON'T: Mock Everything**

```typescript
// ❌ Bad: Too much mocking loses test value
jest.mock('./service1')
jest.mock('./service2')
jest.mock('./service3')
jest.mock('./component1')
// What are we actually testing at this point?
```

### **❌ DON'T: Share Mock State Between Tests**

```typescript
// ❌ Bad: Shared state causes test interdependence
const sharedMockStore = createMockRootStore() // Don't do this!

// ✅ Good: Fresh mocks for each test
beforeEach(() => {
  mockStore = createMockRootStore() // Fresh instance each time
})
```

---

## 🔍 **Mock Debugging**

### **Inspecting Mock Calls**

```typescript
it('should call authentication service', async () => {
  await authStore.login('signature')

  // Check if mock was called
  expect(mockAuthService.authenticate).toHaveBeenCalled()

  // Check call arguments
  expect(mockAuthService.authenticate).toHaveBeenCalledWith({
    signature: 'signature',
    timestamp: expect.any(Number),
  })

  // Check call count
  expect(mockAuthService.authenticate).toHaveBeenCalledTimes(1)
})
```

### **Mock Call History**

```typescript
// Get detailed call information
const mockFn = mockAuthService.authenticate
console.log(mockFn.mock.calls) // All call arguments
console.log(mockFn.mock.results) // All return values
console.log(mockFn.mock.instances) // All 'this' contexts
```

---

## 🧪 **Testing Mock Reliability**

### **Verify Mock Assumptions**

```typescript
describe('Mock System Integrity', () => {
  it('should provide consistent mock structure', () => {
    const store1 = createMockAuthStore()
    const store2 = createMockAuthStore()

    // Ensure factories create consistent structure
    expect(Object.keys(store1)).toEqual(Object.keys(store2))

    // Ensure functions are properly mocked
    expect(jest.isMockFunction(store1.authenticate)).toBe(true)
  })
})
```

---

## 🔄 **Mock Maintenance**

### **Regular Maintenance Tasks**

- **Review mock usage**: Remove unused mocks
- **Update mock interfaces**: Keep in sync with real implementations
- **Consolidate duplicates**: Merge similar mock patterns
- **Document complex mocks**: Explain unusual mock behavior

### **When to Update Mocks**

- External library updates change interfaces
- Internal service signatures change
- New common mock patterns emerge
- Mock complexity becomes unwieldy

---

## 🔗 **Related Documentation**

- [Testing Guide](./TESTING_GUIDE.md) - Overall testing philosophy
- [Coverage Strategy](./COVERAGE_STRATEGY.md) - Coverage requirements
- [Troubleshooting](./TROUBLESHOOTING.md) - Common mock issues

---

_Keep mocks simple, focused, and maintainable. They should enhance test reliability, not become a maintenance burden._
