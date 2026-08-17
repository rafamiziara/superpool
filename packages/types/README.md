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
import { Loan, MemberStatus, PoolInfo } from '@superpool/types'

const pool: PoolInfo = {
  poolId: 12,
  poolAddress: '0x456...',
  poolOwner: '0x789...',
  name: 'Community Pool',
  description: 'A neighbourhood lending circle',
  maxLoanAmount: '1000000000000000000000', // wei as a string; JSON has no bigint
  interestRate: 500, // 5% (500 basis points)
  chainId: 80002,
  // ...other properties
}
```

**Key Types:**

- `PoolInfo` (in `api.ts`) - A pool as the indexer records it
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
import { ListPoolsRequest, ListPoolsResponse } from '@superpool/types'

const request: ListPoolsRequest = {
  chainId: 80002,
  activeOnly: true,
  limit: 50,
}

const response: ListPoolsResponse = {
  pools: [],
  totalCount: 0,
  limit: 50,
}
```

Pools are **not** created through the backend: the wallet calls `createPool` on
`PoolFactory` directly, and `indexPool` records the result. `preparePoolCreation`
is the callable that supports that flow.

**Key Types:**

- `ApiResponse<T>` - Standardized API response wrapper
- `ApiError` - Error information structure
- Authentication: `GenerateAuthMessageRequest/Response`, `VerifySignatureRequest/Response`
- Pool management: `ListPoolsRequest/Response`, `IndexPoolRequest/Response`
- Loan management: `RequestLoanRequest/Response`, `GetLoansRequest/Response`
- Transaction history: `GetTransactionsRequest/Response`

## 🛠️ Usage Examples

### Type-Safe API Calls

The backend is Firebase callables, not REST — so a call goes through
`httpsCallable` with the request and response types on either side:

```typescript
import { ListPoolsRequest, ListPoolsResponse } from '@superpool/types'
import { httpsCallable } from 'firebase/functions'

async function listPools(request: ListPoolsRequest): Promise<ListPoolsResponse> {
  const callable = httpsCallable<ListPoolsRequest, ListPoolsResponse>(functions, 'listPools')
  const response = await callable(request)

  return response.data
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
import { PoolInfo, User, WalletConnection } from '@superpool/types'

interface AppState {
  user: User | null
  wallet: WalletConnection
  pools: PoolInfo[]
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

**Related**: See the [root README](../../README.md) for how the packages fit together.
