# SuperPool Backend API Documentation

## Pool Creation Cloud Functions

This document describes the Cloud Functions for managing lending pool creation via the PoolFactory smart contract.

### Overview

The pool creation system consists of three main Cloud Functions:

1. **createPool** - Create a new lending pool
2. **poolStatus** - Check the status of a pool creation transaction  
3. **listPools** - List existing pools with pagination and filtering

All functions are deployed as Firebase Cloud Functions and can be called from the mobile application using the Firebase SDK.

---

## createPool

Creates a new lending pool via the PoolFactory smart contract.

### Endpoint
```
https://us-central1-<project-id>.cloudfunctions.net/createPool
```

### Authentication
- **Required**: User must be authenticated with Firebase Auth
- **Permissions**: Any authenticated user can create pools (subject to smart contract authorization)

### Request Parameters

```typescript
interface CreatePoolRequest {
  poolOwner: string        // Ethereum address of the pool owner
  maxLoanAmount: string    // Maximum loan amount in POL (e.g., "1.5")
  interestRate: number     // Interest rate in basis points (e.g., 500 = 5%)
  loanDuration: number     // Loan duration in seconds (e.g., 86400 = 1 day)
  name: string            // Pool name (3-100 characters)
  description: string     // Pool description (10-1000 characters)
  chainId?: number        // Optional: 80002 (Polygon Amoy) or 137 (Polygon Mainnet)
}
```

### Response

```typescript
interface CreatePoolResponse {
  success: boolean
  transactionHash: string  // Transaction hash for tracking
  poolId?: number         // Pool ID assigned by PoolFactory
  poolAddress?: string    // Address of the deployed pool contract
  estimatedGas?: string   // Gas estimate used for the transaction
  message: string         // Success/error message
}
```

### Example Usage

```javascript
import { getFunctions, httpsCallable } from 'firebase/functions'

const functions = getFunctions()
const createPool = httpsCallable(functions, 'createPool')

try {
  const result = await createPool({
    poolOwner: '0x1234567890123456789012345678901234567890',
    maxLoanAmount: '10.0',
    interestRate: 750,      // 7.5%
    loanDuration: 2592000,  // 30 days
    name: 'My DeFi Pool',
    description: 'A lending pool for small business loans',
    chainId: 80002
  })
  
  console.log('Pool created:', result.data)
} catch (error) {
  console.error('Pool creation failed:', error)
}
```

### Validation Rules

| Field | Rules |
|-------|-------|
| poolOwner | Valid Ethereum address |
| maxLoanAmount | > 0, ≤ 1,000,000 POL |
| interestRate | 0-10000 basis points (0-100%) |
| loanDuration | 3600-31536000 seconds (1 hour - 1 year) |
| name | 3-100 characters |
| description | 10-1000 characters |
| chainId | 80002 or 137 (if provided) |

### Error Codes

- `unauthenticated` - User not logged in
- `invalid-argument` - Validation failed
- `failed-precondition` - Insufficient funds or contract conditions not met
- `internal` - Smart contract execution failed
- `unavailable` - Network/RPC error

---

## poolStatus

Checks the status of a pool creation transaction.

### Endpoint
```
https://us-central1-<project-id>.cloudfunctions.net/poolStatus
```

### Authentication
- **Required**: None (public endpoint)

### Request Parameters

```typescript
interface PoolStatusRequest {
  transactionHash: string  // Transaction hash to check
  chainId?: number        // Optional: chain ID for the transaction
}
```

### Response

```typescript
interface PoolStatusResponse {
  transactionHash: string
  status: 'pending' | 'completed' | 'failed' | 'not_found'
  poolId?: number         // Available when status is 'completed'
  poolAddress?: string    // Available when status is 'completed'
  blockNumber?: number    // Block number when transaction was mined
  gasUsed?: string       // Gas used by the transaction
  error?: string         // Error message when status is 'failed'
  createdAt?: Date       // When transaction was submitted
  completedAt?: Date     // When transaction was confirmed
}
```

### Example Usage

```javascript
const poolStatus = httpsCallable(functions, 'poolStatus')

const result = await poolStatus({
  transactionHash: '0x1234567890123456789012345678901234567890123456789012345678901234'
})

console.log('Transaction status:', result.data.status)
```

---

## listPools

Lists existing pools with pagination and filtering options.

### Endpoint
```
https://us-central1-<project-id>.cloudfunctions.net/listPools
```

### Authentication
- **Required**: None (public endpoint)

### Request Parameters

```typescript
interface ListPoolsRequest {
  page?: number           // Page number (default: 1)
  limit?: number          // Items per page (default: 20, max: 100)
  ownerAddress?: string   // Filter by pool owner address
  chainId?: number        // Filter by chain ID (default: 80002)
  activeOnly?: boolean    // Show only active pools (default: true)
}
```

### Response

```typescript
interface ListPoolsResponse {
  pools: PoolInfo[]       // Array of pool information
  totalCount: number      // Total number of pools matching filters
  page: number           // Current page number
  limit: number          // Items per page
  hasNextPage: boolean   // Whether there are more pages
  hasPreviousPage: boolean // Whether there are previous pages
}

interface PoolInfo {
  poolId: number
  poolAddress: string
  poolOwner: string
  name: string
  description: string
  maxLoanAmount: string   // In wei
  interestRate: number    // In basis points
  loanDuration: number    // In seconds
  chainId: number
  createdBy: string       // Firebase UID of creator
  createdAt: Date
  transactionHash: string
  isActive: boolean
}
```

### Example Usage

```javascript
const listPools = httpsCallable(functions, 'listPools')

// Get first page of all pools
const result = await listPools({
  page: 1,
  limit: 10,
  activeOnly: true
})

console.log(`Found ${result.data.totalCount} pools`)
console.log('Pools:', result.data.pools)

// Filter by owner
const ownerPools = await listPools({
  ownerAddress: '0x1234567890123456789012345678901234567890',
  page: 1,
  limit: 50
})
```

---

## Environment Configuration

The following environment variables must be configured for the Cloud Functions:

### Required for All Functions
```bash
# RPC URLs
POLYGON_AMOY_RPC_URL=https://rpc-amoy.polygon.technology
POLYGON_MAINNET_RPC_URL=https://polygon-rpc.com

# Contract Addresses
POOL_FACTORY_ADDRESS_AMOY=0x...
POOL_FACTORY_ADDRESS_POLYGON=0x...

# Transaction Signing (for createPool only)
PRIVATE_KEY=0x...
```

### Security Notes

- The private key should have sufficient POL for gas fees
- Private key should be stored securely in Firebase Functions configuration
- RPC URLs should be from reliable providers (Alchemy, Infura, etc.)
- Contract addresses must be verified and match deployed contracts

---

## Error Handling

All functions implement comprehensive error handling with:

- **Structured logging** for debugging and monitoring
- **User-friendly error messages** for client consumption
- **Proper HTTP status codes** following Firebase Functions conventions
- **Retry logic** for transient network errors
- **Validation** at multiple levels (input, blockchain, business logic)

### Common Error Patterns

```javascript
try {
  const result = await createPool(params)
  // Handle success
} catch (error) {
  switch (error.code) {
    case 'invalid-argument':
      // Show validation errors to user
      break
    case 'failed-precondition':
      // Show business logic errors (e.g., insufficient funds)
      break
    case 'unavailable':
      // Show network errors, suggest retry
      break
    case 'internal':
      // Show generic error, log for investigation
      break
  }
}
```

---

## Testing

### Unit Tests
All functions include comprehensive unit tests covering:
- Input validation
- Success scenarios
- Error conditions
- Edge cases
- Mock integrations

Run tests:
```bash
cd packages/backend
npm test
```

### Integration Tests
Integration tests are available for testing against Polygon Amoy testnet:
```bash
npm run test:integration
```

### Manual Testing
Use the Firebase Functions shell for manual testing:
```bash
npm run shell
```

---

## Monitoring and Logging

All functions include structured logging for:
- **Request tracking** with unique identifiers
- **Performance metrics** (gas usage, execution time)
- **Error reporting** with full context
- **Business metrics** (pools created, transaction volumes)

Logs can be viewed in:
- Firebase Console → Functions → Logs
- Google Cloud Console → Logging

### Key Metrics to Monitor

- **Success rate** of pool creation transactions
- **Average gas usage** for different pool configurations
- **Transaction confirmation times** across different networks
- **Error rates** by error type and function