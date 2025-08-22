# SuperPool Types

Shared TypeScript types and interfaces for the SuperPool ecosystem.

## 🚀 Installation

This package is designed to be used within the SuperPool monorepo workspace:

```bash
# From any app in the monorepo
pnpm add @superpool/types
```

## 📦 Type Categories

### Authentication Types (`auth.ts`)

Types for user authentication, device management, and session handling:

```typescript
import { User, AuthMessage, ApprovedDevice } from '@superpool/types'

const user: User = {
  walletAddress: '0x123...',
  deviceId: 'device-123',
  createdAt: new Date(),
  lastLoginAt: new Date(),
}
```

**Key Types:**

- `User` - User profile and account information
- `AuthNonce` - Authentication nonces with expiration
- `ApprovedDevice` - Device approval and tracking
- `AuthMessage` - Wallet signature messages
- `SignatureVerification` - Signature validation data

### Lending Types (`lending.ts`)

Core business logic types for pools, loans, and transactions:

```typescript
import { LendingPool, Loan, MemberStatus } from '@superpool/types'

const pool: LendingPool = {
  id: 'pool-123',
  name: 'Community Pool',
  contractAddress: '0x456...',
  creator: '0x789...',
  members: ['0x123...', '0x456...'],
  maxMembers: 50,
  minimumContribution: 100n * 10n ** 18n, // 100 POL
  interestRate: 500, // 5% (500 basis points)
  // ...other properties
}
```

**Key Types:**

- `LendingPool` - Pool configuration and state
- `PoolMember` - Member information and status
- `Loan` - Loan requests and repayment tracking
- `Transaction` - All transaction types and status
- Enums: `MemberStatus`, `LoanStatus`, `TransactionType`, `TransactionStatus`

### Blockchain Types (`blockchain.ts`)

Blockchain integration, wallet connections, and smart contract events:

```typescript
import { Chain, WalletConnection, PoolCreatedEvent } from '@superpool/types'

const polygonAmoy: Chain = {
  id: 80002,
  name: 'Polygon Amoy',
  network: 'polygon-amoy',
  nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.ankr.com/polygon_amoy'] },
    public: { http: ['https://rpc.ankr.com/polygon_amoy'] },
  },
  testnet: true,
}
```

**Key Types:**

- `Chain` - Network configurations (Polygon, Amoy, localhost)
- `WalletConnection` - Wallet connection state
- `ContractConfig` - Smart contract addresses and ABIs
- `NetworkConfig` - Network-specific contract deployments
- Event types: `PoolCreatedEvent`, `MemberAddedEvent`, `ContributionEvent`, etc.

### API Types (`api.ts`)

HTTP API request/response interfaces for backend communication:

```typescript
import { ApiResponse, CreatePoolRequest, GetPoolsResponse } from '@superpool/types'

const createPoolRequest: CreatePoolRequest = {
  name: 'My Pool',
  description: 'Community lending pool',
  maxMembers: 20,
  minimumContribution: '100000000000000000000', // 100 POL as string
  interestRate: 750, // 7.5%
  loanDuration: 30 * 24 * 60 * 60, // 30 days in seconds
}

const response: ApiResponse<CreatePoolResponse> = {
  success: true,
  data: {
    poolId: 'pool-456',
    contractAddress: '0x789...',
    transactionHash: '0xabc...',
  },
  timestamp: '2024-12-01T12:00:00Z',
}
```

**Key Types:**

- `ApiResponse<T>` - Standardized API response wrapper
- `ApiError` - Error information structure
- Authentication: `GenerateAuthMessageRequest/Response`, `VerifySignatureRequest/Response`
- Pool management: `CreatePoolRequest/Response`, `GetPoolsRequest/Response`
- Loan management: `RequestLoanRequest/Response`, `GetLoansRequest/Response`
- Transaction history: `GetTransactionsRequest/Response`

## 🛠️ Usage Examples

### Type-Safe API Calls

```typescript
import { ApiResponse, CreatePoolRequest, LendingPool } from '@superpool/types'

async function createPool(data: CreatePoolRequest): Promise<ApiResponse<LendingPool>> {
  const response = await fetch('/api/pools', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return response.json()
}
```

### Smart Contract Event Handling

```typescript
import { PoolCreatedEvent, ContributionEvent } from '@superpool/types'

function handlePoolCreated(event: PoolCreatedEvent) {
  console.log(`New pool created: ${event.poolAddress}`)
  console.log(`Creator: ${event.creator}`)
  console.log(`Transaction: ${event.transactionHash}`)
}
```

### State Management

```typescript
import { User, LendingPool, WalletConnection } from '@superpool/types'

interface AppState {
  user: User | null
  wallet: WalletConnection
  pools: LendingPool[]
  isLoading: boolean
}
```

## 🔧 Development

```bash
# Build the package
pnpm build

# Watch for changes during development
pnpm dev

# Type check
pnpm type-check
```

## 📱 Cross-Platform Compatibility

These types work across all SuperPool applications:

- ✅ **Mobile App** (React Native)
- ✅ **Landing Page** (Next.js)
- ✅ **Backend** (Cloud Functions)
- ✅ **Smart Contracts** (Hardhat scripts)

## 🎯 Best Practices

1. **Use BigInt for Token Amounts**: Always use `bigint` for token amounts to handle precision correctly
2. **String Serialization**: Convert `bigint` to strings for JSON serialization
3. **Enum Values**: Use string enums for better debugging and serialization
4. **Optional Fields**: Use optional properties (`?`) for fields that may not always be present
5. **Timestamp Handling**: Use `Date` objects for timestamps, convert to ISO strings for APIs

---

**Related**: See `packages/design/README.md` for design system documentation
