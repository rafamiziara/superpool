# SuperPool Mobile TDD Workflow

## 🔄 **Test-Driven Development Philosophy**

Test-Driven Development (TDD) ensures we build **exactly what's needed** with **high confidence**. Our TDD approach prioritizes business value and maintainable code over strict adherence to academic TDD principles.

### **Core TDD Benefits**

- **Better Design**: Writing tests first forces good architecture decisions
- **Clear Requirements**: Tests serve as executable specifications
- **Refactoring Confidence**: Comprehensive tests enable fearless code improvements
- **Reduced Debugging**: Catch issues before they become bugs

---

## 🔴🟢🔄 **Red-Green-Refactor Cycle**

### **🔴 RED: Write a Failing Test First**

```typescript
describe('WalletConnectionStore', () => {
  it('should connect to MetaMask wallet', async () => {
    // Test doesn't exist yet - this WILL fail
    const result = await walletStore.connectToMetaMask()

    expect(walletStore.isConnected).toBe(true)
    expect(walletStore.connectedWallet).toBe('metamask')
    expect(walletStore.walletAddress).toMatch(/^0x[a-fA-F0-9]{40}$/)
  })
})

// Run test: ❌ FAILS (method doesn't exist)
```

### **🟢 GREEN: Write Minimal Code to Pass**

```typescript
// Minimal implementation to make test pass
export class WalletConnectionStore {
  isConnected = false
  connectedWallet: string | null = null
  walletAddress: string | null = null

  async connectToMetaMask(): Promise<void> {
    // Simplest implementation that passes the test
    this.isConnected = true
    this.connectedWallet = 'metamask'
    this.walletAddress = '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8'
  }
}

// Run test: ✅ PASSES (hard-coded but working)
```

### **🔄 REFACTOR: Improve Without Breaking Tests**

```typescript
// Now implement properly while keeping tests green
export class WalletConnectionStore {
  isConnected = false
  connectedWallet: string | null = null
  walletAddress: string | null = null

  async connectToMetaMask(): Promise<void> {
    try {
      if (!window.ethereum) {
        throw new Error('MetaMask not installed')
      }

      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      })

      this.isConnected = true
      this.connectedWallet = 'metamask'
      this.walletAddress = accounts[0]
    } catch (error) {
      this.isConnected = false
      throw error
    }
  }
}

// Run test: ✅ STILL PASSES (real implementation)
```

---

## 🏗️ **TDD Implementation Patterns**

### **Pattern 1: Store Development**

#### **Step 1: Define Expected Behavior**

```typescript
// Start with the test - what should happen?
describe('AuthenticationStore', () => {
  it('should authenticate user with valid signature', async () => {
    const mockSignature = '0xvalidsignature...'
    const expectedUser = { id: '123', walletAddress: '0x123...' }

    mockAuthService.verifySignature.mockResolvedValue(expectedUser)

    await authStore.authenticate(mockSignature)

    expect(authStore.isAuthenticated).toBe(true)
    expect(authStore.currentUser).toEqual(expectedUser)
    expect(authStore.error).toBeNull()
  })
})
```

#### **Step 2: Create Minimal Store**

```typescript
// Make it pass with minimum code
export class AuthenticationStore {
  isAuthenticated = false
  currentUser = null
  error = null

  async authenticate(signature: string): Promise<void> {
    this.isAuthenticated = true
    this.currentUser = { id: '123', walletAddress: '0x123...' }
    this.error = null
  }
}
```

#### **Step 3: Add Real Implementation**

```typescript
// Now add proper business logic
export class AuthenticationStore {
  constructor(private authService: AuthService) {}

  isAuthenticated = false
  currentUser = null
  error = null

  async authenticate(signature: string): Promise<void> {
    try {
      const user = await this.authService.verifySignature(signature)
      this.isAuthenticated = true
      this.currentUser = user
      this.error = null
    } catch (error) {
      this.isAuthenticated = false
      this.currentUser = null
      this.error = error.message
    }
  }
}
```

### **Pattern 2: Service Development**

#### **Step 1: Test the Interface**

```typescript
describe('SignatureService', () => {
  it('should verify valid Ethereum signature', async () => {
    const message = 'Authenticate with SuperPool'
    const signature = '0xvalidsignature...'
    const expectedAddress = '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8'

    const result = await signatureService.verifySignature(message, signature)

    expect(result.isValid).toBe(true)
    expect(result.recoveredAddress).toBe(expectedAddress)
  })
})
```

#### **Step 2: Simple Implementation**

```typescript
export class SignatureService {
  async verifySignature(
    message: string,
    signature: string
  ): Promise<{
    isValid: boolean
    recoveredAddress: string
  }> {
    return {
      isValid: true,
      recoveredAddress: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
    }
  }
}
```

#### **Step 3: Real Crypto Implementation**

```typescript
import { verifyMessage } from '@ethersproject/wallet'

export class SignatureService {
  async verifySignature(
    message: string,
    signature: string
  ): Promise<{
    isValid: boolean
    recoveredAddress: string
  }> {
    try {
      const recoveredAddress = verifyMessage(message, signature)
      return {
        isValid: true,
        recoveredAddress: recoveredAddress.toLowerCase(),
      }
    } catch (error) {
      return {
        isValid: false,
        recoveredAddress: '',
      }
    }
  }
}
```

### **Pattern 3: Component Development**

#### **Step 1: Test Component Behavior**

```typescript
describe('ConnectWalletButton', () => {
  it('should display connect text when disconnected', () => {
    const mockStore = createMockWalletStore({ isConnected: false })

    const { getByText } = render(
      <StoreProvider value={{ wallet: mockStore }}>
        <ConnectWalletButton />
      </StoreProvider>
    )

    expect(getByText('Connect Wallet')).toBeTruthy()
  })

  it('should call connect when pressed', () => {
    const mockStore = createMockWalletStore({ isConnected: false })

    const { getByText } = render(
      <StoreProvider value={{ wallet: mockStore }}>
        <ConnectWalletButton />
      </StoreProvider>
    )

    fireEvent.press(getByText('Connect Wallet'))
    expect(mockStore.connect).toHaveBeenCalled()
  })
})
```

#### **Step 2: Basic Component**

```typescript
export const ConnectWalletButton = () => {
  return (
    <TouchableOpacity onPress={() => {}}>
      <Text>Connect Wallet</Text>
    </TouchableOpacity>
  )
}
```

#### **Step 3: Connect to Store**

```typescript
export const ConnectWalletButton = observer(() => {
  const { wallet } = useStores()

  const handlePress = () => {
    wallet.connect()
  }

  return (
    <TouchableOpacity onPress={handlePress}>
      <Text>
        {wallet.isConnected ? 'Connected' : 'Connect Wallet'}
      </Text>
    </TouchableOpacity>
  )
})
```

---

## 🎯 **TDD for Different Scenarios**

### **Scenario 1: New Feature Development**

#### **Example: Add Wallet Balance Display**

**1. Write the Test First**

```typescript
describe('WalletStore', () => {
  describe('fetchBalance', () => {
    it('should fetch and store wallet balance', async () => {
      const mockBalance = '1.5'
      mockEthersProvider.getBalance.mockResolvedValue(ethers.parseEther(mockBalance))

      await walletStore.fetchBalance('0x123...')

      expect(walletStore.balance).toBe(mockBalance)
      expect(walletStore.isLoadingBalance).toBe(false)
    })

    it('should handle balance fetch errors', async () => {
      mockEthersProvider.getBalance.mockRejectedValue(new Error('Network error'))

      await walletStore.fetchBalance('0x123...')

      expect(walletStore.balance).toBe('0')
      expect(walletStore.balanceError).toBe('Network error')
      expect(walletStore.isLoadingBalance).toBe(false)
    })
  })
})
```

**2. Run Test (Should Fail)**

```bash
pnpm test WalletStore.test.ts
# ❌ Method fetchBalance doesn't exist
```

**3. Add Minimal Implementation**

```typescript
export class WalletStore {
  balance = '0'
  isLoadingBalance = false
  balanceError: string | null = null

  async fetchBalance(address: string): Promise<void> {
    this.balance = '1.5'
    this.isLoadingBalance = false
  }
}
```

**4. Run Test (Should Pass)**

```bash
pnpm test WalletStore.test.ts
# ✅ Tests pass
```

**5. Add Real Implementation**

```typescript
export class WalletStore {
  constructor(private provider: ethers.JsonRpcProvider) {}

  balance = '0'
  isLoadingBalance = false
  balanceError: string | null = null

  async fetchBalance(address: string): Promise<void> {
    try {
      this.isLoadingBalance = true
      this.balanceError = null

      const balanceWei = await this.provider.getBalance(address)
      this.balance = ethers.formatEther(balanceWei)
    } catch (error) {
      this.balanceError = error.message
      this.balance = '0'
    } finally {
      this.isLoadingBalance = false
    }
  }
}
```

### **Scenario 2: Bug Fixing with TDD**

#### **Bug Report: "App crashes when connecting to wallet with no accounts"**

**1. Write a Failing Test (Reproduce the Bug)**

```typescript
describe('WalletStore Bug Fix', () => {
  it('should handle empty accounts array gracefully', async () => {
    // Reproduce the bug scenario
    mockEthereum.request.mockResolvedValue([]) // Empty accounts

    // This should not throw an error
    await expect(walletStore.connect()).resolves.not.toThrow()

    expect(walletStore.isConnected).toBe(false)
    expect(walletStore.error).toBe('No accounts available')
  })
})
```

**2. Run Test (Should Fail - Bug Still Exists)**

```bash
pnpm test "should handle empty accounts array"
# ❌ Test fails - app still crashes
```

**3. Fix the Bug**

```typescript
export class WalletStore {
  async connect(): Promise<void> {
    try {
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      })

      // Add bug fix - handle empty accounts
      if (!accounts || accounts.length === 0) {
        this.error = 'No accounts available'
        this.isConnected = false
        return
      }

      this.walletAddress = accounts[0]
      this.isConnected = true
      this.error = null
    } catch (error) {
      this.error = error.message
      this.isConnected = false
    }
  }
}
```

**4. Run Test (Should Pass - Bug Fixed)**

```bash
pnpm test "should handle empty accounts array"
# ✅ Test passes - bug is fixed
```

### **Scenario 3: Refactoring with TDD**

#### **Refactoring: Extract Authentication Logic into Separate Service**

**1. Ensure Comprehensive Test Coverage First**

```typescript
describe('AuthenticationStore - Before Refactoring', () => {
  it('should authenticate with valid signature', async () => {
    // Test current behavior before refactoring
  })

  it('should handle invalid signatures', async () => {
    // Ensure all edge cases are covered
  })

  it('should clean up on logout', async () => {
    // Test cleanup behavior
  })
})

// Run tests: ✅ All green before refactoring
```

**2. Create New Service with Tests**

```typescript
describe('AuthenticationService', () => {
  it('should verify signature and return user data', async () => {
    // Test the extracted service
    const service = new AuthenticationService()
    const result = await service.authenticate(mockSignature)

    expect(result.user).toBeDefined()
    expect(result.isValid).toBe(true)
  })
})
```

**3. Implement New Service**

```typescript
export class AuthenticationService {
  async authenticate(signature: string): Promise<{
    user: User | null
    isValid: boolean
  }> {
    // Move authentication logic here
  }
}
```

**4. Update Store to Use Service**

```typescript
export class AuthenticationStore {
  constructor(private authService: AuthenticationService) {}

  async authenticate(signature: string): Promise<void> {
    const result = await this.authService.authenticate(signature)

    if (result.isValid) {
      this.currentUser = result.user
      this.isAuthenticated = true
    } else {
      this.error = 'Authentication failed'
    }
  }
}
```

**5. Run All Tests (Should Still Pass)**

```bash
pnpm test AuthenticationStore
# ✅ All tests pass - refactoring successful
```

---

## 🚀 **TDD Best Practices for SuperPool**

### **✅ DO: Start with the Simplest Test**

```typescript
// ✅ Good: Start simple
describe('UserService', () => {
  it('should create a new user service', () => {
    const service = new UserService()
    expect(service).toBeDefined()
  })
})

// Then gradually add complexity
it('should validate email format', () => {
  expect(service.isValidEmail('test@example.com')).toBe(true)
  expect(service.isValidEmail('invalid')).toBe(false)
})
```

### **✅ DO: Test One Thing at a Time**

```typescript
// ✅ Good: One assertion per test
it('should set user as authenticated on successful login', () => {
  store.authenticate('valid-signature')
  expect(store.isAuthenticated).toBe(true)
})

it('should store user data on successful login', () => {
  store.authenticate('valid-signature')
  expect(store.currentUser).toEqual(expectedUser)
})

// ❌ Bad: Multiple concerns in one test
it('should handle login correctly', () => {
  store.authenticate('valid-signature')
  expect(store.isAuthenticated).toBe(true)
  expect(store.currentUser).toEqual(expectedUser)
  expect(store.error).toBeNull()
  expect(store.loginAttempts).toBe(1)
})
```

### **✅ DO: Use Descriptive Test Names**

```typescript
// ✅ Good: Clear, descriptive names
describe('WalletConnectionStore', () => {
  describe('when MetaMask is not installed', () => {
    it('should throw MetaMask not found error', () => {
      // Test implementation
    })
  })

  describe('when user rejects connection request', () => {
    it('should set connection status to rejected', () => {
      // Test implementation
    })
  })
})
```

### **❌ DON'T: Skip the Red Phase**

```typescript
// ❌ Bad: Writing implementation first
export class NewService {
  doSomething() {
    return 'result'
  }
}

// Then writing a test
it('should do something', () => {
  expect(service.doSomething()).toBe('result')
})

// ✅ Good: Test first, then implementation
it('should do something', () => {
  expect(service.doSomething()).toBe('result') // This SHOULD fail first
})
```

### **❌ DON'T: Write Tests for Implementation Details**

```typescript
// ❌ Bad: Testing internal methods
it('should call internal validation method', () => {
  const spy = jest.spyOn(service, '_validate')
  service.processData(data)
  expect(spy).toHaveBeenCalled()
})

// ✅ Good: Testing behavior
it('should reject invalid data', () => {
  expect(() => service.processData(invalidData)).toThrow('Invalid data')
})
```

---

## 🔄 **TDD Workflow Integration**

### **Daily TDD Routine**

1. **Pick a User Story**: Select smallest valuable increment
2. **Write Failing Test**: Start with red (failing test)
3. **Make It Pass**: Write minimal code (green)
4. **Refactor**: Improve code quality while keeping tests green
5. **Repeat**: Move to next small increment

### **TDD with Git Workflow**

```bash
# 1. Create feature branch
git checkout -b feature/wallet-balance-display

# 2. Write failing test and commit
git add WalletStore.test.ts
git commit -m "test: add failing test for wallet balance display"

# 3. Make test pass and commit
git add WalletStore.ts
git commit -m "feat: add basic wallet balance display"

# 4. Refactor and commit
git add WalletStore.ts
git commit -m "refactor: improve balance fetching with error handling"

# 5. Final commit with full implementation
git commit -m "feat(wallet): complete wallet balance display with loading states"
```

### **TDD in Code Reviews**

- **Green Build Required**: All tests must pass before review
- **Test Coverage**: New code requires comprehensive test coverage
- **Test Quality**: Review tests as carefully as implementation code
- **Red-Green Evidence**: PR should show the TDD cycle (failing test → implementation)

---

## 🎯 **Common TDD Scenarios**

### **Adding New Store Actions**

```typescript
// 1. Test the behavior you want
it('should update pool data when refresh is called', async () => {
  mockPoolService.fetchPools.mockResolvedValue([mockPool])

  await poolStore.refreshPools()

  expect(poolStore.pools).toContain(mockPool)
  expect(poolStore.lastUpdated).toBeGreaterThan(0)
})

// 2. Implement minimal action
async refreshPools(): Promise<void> {
  this.pools = [mockPool]
  this.lastUpdated = Date.now()
}

// 3. Add real service integration
async refreshPools(): Promise<void> {
  this.isLoading = true
  try {
    this.pools = await this.poolService.fetchPools()
    this.lastUpdated = Date.now()
  } finally {
    this.isLoading = false
  }
}
```

### **Error Handling Development**

```typescript
// 1. Test error scenarios first
it('should handle network errors gracefully', async () => {
  mockService.fetchData.mockRejectedValue(new Error('Network error'))

  await store.loadData()

  expect(store.error).toBe('Network error')
  expect(store.data).toBeNull()
  expect(store.isLoading).toBe(false)
})

// 2. Implement error handling
async loadData(): Promise<void> {
  this.isLoading = true
  try {
    this.data = await this.service.fetchData()
    this.error = null
  } catch (error) {
    this.error = error.message
    this.data = null
  } finally {
    this.isLoading = false
  }
}
```

---

## 🔗 **Related Documentation**

- [Testing Guide](./TESTING_GUIDE.md) - Overall testing philosophy and patterns
- [Mock System Guide](./MOCK_SYSTEM.md) - Mock architecture for TDD
- [Coverage Strategy](./COVERAGE_STRATEGY.md) - Coverage requirements and metrics
- [Troubleshooting](./TROUBLESHOOTING.md) - Common TDD issues and solutions

---

_TDD is not about perfect adherence to rules—it's about building confidence through tests and creating maintainable, well-designed code._
