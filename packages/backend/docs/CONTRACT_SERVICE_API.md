# ContractService API Documentation

This document provides comprehensive documentation for the `ContractService` class, a service layer for managing Safe multi-signature wallet contract interactions in the SuperPool backend.

## Overview

The `ContractService` is a TypeScript class that provides a high-level interface for:

- Creating and managing Safe multi-sig transactions
- Executing contract calls through Safe wallet
- Monitoring transaction status and recovery
- Batching multiple transactions
- Emergency pause functionality

## Architecture

```
Cloud Functions → ContractService → Safe Wallet → Smart Contracts
                ↓
            Firestore (State Management)
```

The service acts as an abstraction layer between Firebase Cloud Functions and Safe wallet operations, providing:

- **Type Safety**: Full TypeScript support with comprehensive interfaces
- **State Management**: Firestore integration for transaction tracking
- **Error Handling**: Structured error handling with recovery mechanisms
- **Logging**: Comprehensive logging for audit and debugging
- **Validation**: Input validation and security checks

## Installation & Setup

### Environment Configuration

```bash
# Required environment variables
POLYGON_AMOY_RPC_URL=https://rpc-amoy.polygon.technology
POLYGON_MAINNET_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/...
SAFE_ADDRESS_AMOY=0x...     # Safe wallet address on Amoy
SAFE_ADDRESS_POLYGON=0x...  # Safe wallet address on Mainnet
POOL_FACTORY_ADDRESS_AMOY=0x...    # PoolFactory contract on Amoy
POOL_FACTORY_ADDRESS_POLYGON=0x... # PoolFactory contract on Mainnet
PRIVATE_KEY=0x...           # Backend execution private key
```

### Usage

```typescript
import { createContractService, ContractService } from './services/ContractService'

// Create service instance
const contractService = createContractService(80002) // Polygon Amoy

// Or create manually
const service = new ContractService({
  chainId: 80002,
  rpcUrl: 'https://rpc-amoy.polygon.technology',
  safeAddress: '0x...',
  privateKey: '0x...',
  poolFactoryAddress: '0x...',
})
```

## Core Interfaces

### ContractServiceConfig

Configuration interface for service initialization:

```typescript
interface ContractServiceConfig {
  chainId: number // Network chain ID (80002 for Amoy, 137 for Polygon)
  rpcUrl: string // RPC endpoint URL
  safeAddress: string // Safe wallet address
  privateKey: string // Backend execution private key
  poolFactoryAddress: string // PoolFactory contract address
}
```

### TransactionProposal

Interface for basic transaction proposals:

```typescript
interface TransactionProposal {
  to: string // Target contract address
  value: string // ETH value to send (in wei)
  data: string // Encoded function call data
  operation: number // 0 = CALL, 1 = DELEGATECALL
  description: string // Human-readable description
  metadata?: any // Optional metadata for tracking
}
```

### ContractCall

Interface for smart contract function calls:

```typescript
interface ContractCall {
  contractAddress: string // Target contract address
  functionName: string // Function name to call
  abi: any[] // Contract ABI (function definitions)
  args: any[] // Function arguments
  value?: string // Optional ETH value
}
```

### TransactionStatus

Interface for transaction state tracking:

```typescript
interface TransactionStatus {
  id: string // Transaction hash/ID
  status: TransactionStatusType // Current status
  safeTransaction: SafeTransaction // Safe transaction details
  signatures: SafeSignature[] // Collected signatures
  requiredSignatures: number // Signatures needed
  currentSignatures: number // Signatures collected
  createdAt: Date // Creation timestamp
  updatedAt: Date // Last update timestamp
  executedAt?: Date // Execution timestamp
  executionResult?: ExecutionResult // Execution details
  description: string // Transaction description
  metadata?: any // Optional metadata
}
```

### Status Types

```typescript
type TransactionStatusType =
  | 'pending_signatures' // Awaiting signatures
  | 'ready_to_execute' // Threshold met, ready for execution
  | 'executing' // Currently being executed
  | 'completed' // Successfully executed
  | 'failed' // Execution failed
  | 'expired' // Transaction expired
```

## Class Methods

### Transaction Creation

#### proposeTransaction()

Creates a basic Safe transaction proposal.

```typescript
async proposeTransaction(
  proposal: TransactionProposal,
  createdBy: string
): Promise<TransactionStatus>
```

**Parameters:**

- `proposal`: Transaction details
- `createdBy`: Firebase UID of the user creating the proposal

**Returns:**

- `TransactionStatus`: Created transaction with ID and signature requirements

**Example:**

```typescript
const proposal = {
  to: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
  value: '0',
  data: '0xa9059cbb000000000000000000000000742d35cc6670c74288c2e768dc1e574a0b7dbe7a0000000000000000000000000000000000000000000000000de0b6b3a7640000',
  operation: 0,
  description: 'Transfer 1 ETH to user',
  metadata: { type: 'token_transfer' },
}

const transaction = await contractService.proposeTransaction(proposal, 'user123')
console.log(`Transaction ${transaction.id} requires ${transaction.requiredSignatures} signatures`)
```

#### proposeContractCall()

Creates a proposal for a smart contract function call.

```typescript
async proposeContractCall(
  call: ContractCall,
  description: string,
  createdBy: string,
  metadata?: any
): Promise<TransactionStatus>
```

**Example:**

```typescript
const poolCreation = {
  contractAddress: '0x...', // PoolFactory address
  functionName: 'createPool',
  abi: [
    {
      name: 'createPool',
      type: 'function',
      inputs: [
        { name: 'poolOwner', type: 'address' },
        { name: 'maxLoanAmount', type: 'uint256' },
        { name: 'interestRate', type: 'uint256' },
        { name: 'loanDuration', type: 'uint256' },
        { name: 'name', type: 'string' },
        { name: 'description', type: 'string' },
      ],
    },
  ],
  args: [
    '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
    '1000000000000000000000', // 1000 ETH
    500, // 5%
    2592000, // 30 days
    'Business Loans',
    'SME lending pool',
  ],
}

const transaction = await contractService.proposeContractCall(poolCreation, 'Create Business Loans pool', 'admin123', {
  poolType: 'business',
})
```

#### proposeBatchTransaction()

Creates a proposal for multiple transactions to be executed atomically.

```typescript
async proposeBatchTransaction(
  batch: BatchTransactionRequest,
  createdBy: string
): Promise<TransactionStatus>
```

**Example:**

```typescript
const batchRequest = {
  transactions: [
    {
      to: '0xPoolFactory',
      value: '0',
      data: '0x...', // createPool call data
      operation: 0,
      description: 'Create pool 1',
    },
    {
      to: '0xPoolFactory',
      value: '0',
      data: '0x...', // createPool call data
      operation: 0,
      description: 'Create pool 2',
    },
  ],
  description: 'Create multiple lending pools',
  metadata: { batchType: 'pool_creation' },
}

const transaction = await contractService.proposeBatchTransaction(batchRequest, 'admin123')
```

### Signature Management

#### addSignature()

Adds a signature to a pending transaction.

```typescript
async addSignature(
  transactionId: string,
  signature: SafeSignature
): Promise<TransactionStatus>
```

**Example:**

```typescript
const signature = {
  signer: '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
  data: '0x...', // Signature data from wallet
}

const status = await contractService.addSignature('0xtxhash123', signature)

if (status.currentSignatures >= status.requiredSignatures) {
  console.log('Transaction ready to execute!')
}
```

### Transaction Execution

#### executeTransaction()

Executes a Safe transaction once enough signatures are collected.

```typescript
async executeTransaction(transactionId: string): Promise<ExecutionResult>
```

**Returns:**

- `ExecutionResult`: Execution details including transaction hash and events

**Example:**

```typescript
const result = await contractService.executeTransaction('0xtxhash123')

if (result.success) {
  console.log(`Executed: ${result.transactionHash}`)
  console.log(`Gas used: ${result.gasUsed}`)
  console.log(`Events: ${result.events?.length || 0}`)
}
```

### Status Monitoring

#### getTransactionStatus()

Retrieves current status of a transaction.

```typescript
async getTransactionStatus(transactionId: string): Promise<TransactionStatus | null>
```

**Example:**

```typescript
const status = await contractService.getTransactionStatus('0xtxhash123')

if (status) {
  console.log(`Status: ${status.status}`)
  console.log(`Signatures: ${status.currentSignatures}/${status.requiredSignatures}`)
  console.log(`Description: ${status.description}`)
}
```

#### listTransactions()

Lists transactions with filtering and pagination.

```typescript
async listTransactions(options?: {
  status?: string
  limit?: number
  offset?: number
  createdBy?: string
}): Promise<{ transactions: TransactionStatus[], total: number }>
```

**Example:**

```typescript
// Get pending transactions
const { transactions, total } = await contractService.listTransactions({
  status: 'pending_signatures',
  limit: 10,
  offset: 0,
})

console.log(`Found ${total} pending transactions`)
transactions.forEach((tx) => {
  console.log(`${tx.description}: ${tx.currentSignatures}/${tx.requiredSignatures}`)
})
```

### Emergency Functions

#### emergencyPause()

Creates an emergency pause transaction for a contract.

```typescript
async emergencyPause(
  contractAddress: string,
  createdBy: string,
  reason: string
): Promise<TransactionStatus>
```

**Example:**

```typescript
const pauseTransaction = await contractService.emergencyPause(
  '0xPoolFactoryAddress',
  'security_admin',
  'Critical vulnerability detected in pool creation logic'
)

console.log(`Emergency pause created: ${pauseTransaction.id}`)
```

## Cloud Function Integration

The ContractService integrates with Firebase Cloud Functions through dedicated endpoints:

### proposeTransaction

```typescript
const proposeTransaction = onCall(async (request) => {
  const contractService = createContractService(request.data.chainId)
  return await contractService.proposeTransaction(request.data.proposal, request.auth.uid)
})
```

### addSignature

```typescript
const addSignature = onCall(async (request) => {
  const contractService = createContractService(request.data.chainId)
  return await contractService.addSignature(request.data.transactionId, request.data.signature)
})
```

### executeTransaction

```typescript
const executeTransaction = onCall(async (request) => {
  const contractService = createContractService(request.data.chainId)
  return await contractService.executeTransaction(request.data.transactionId)
})
```

## Error Handling

The service uses structured error handling with `AppError` instances:

```typescript
try {
  const transaction = await contractService.proposeTransaction(proposal, userId)
} catch (error) {
  if (error instanceof AppError) {
    console.log(`Service error: ${error.message} (${error.code})`)
  } else {
    console.log(`Unexpected error: ${error.message}`)
  }
}
```

### Common Error Codes

- `PROPOSAL_CREATION_FAILED`: Failed to create transaction proposal
- `TRANSACTION_NOT_FOUND`: Transaction ID not found
- `INVALID_STATUS`: Transaction in invalid state for operation
- `ALREADY_SIGNED`: Signer has already signed transaction
- `INVALID_SIGNATURE`: Signature verification failed
- `INSUFFICIENT_SIGNATURES`: Not enough signatures to execute
- `EXECUTION_FAILED`: Transaction execution failed on-chain
- `EMERGENCY_PAUSE_FAILED`: Emergency pause creation failed

## Database Schema

The service uses Firestore for transaction state management:

### contract_transactions Collection

```typescript
{
  // Document ID: transaction hash
  id: string
  status: TransactionStatusType
  safeTransaction: SafeTransaction
  signatures: SafeSignature[]
  requiredSignatures: number
  currentSignatures: number
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
  executedAt?: Timestamp
  executionResult?: ExecutionResult
  description: string
  metadata?: any
  chainId: number
  safeAddress: string
  expiresAt: Timestamp  // 7 days from creation
}
```

### Firestore Indexes

Required composite indexes:

```javascript
// List transactions by chain and safe
chainId ASC, safeAddress ASC, createdAt DESC

// Filter by status
chainId ASC, safeAddress ASC, status ASC, createdAt DESC

// Filter by creator
chainId ASC, safeAddress ASC, createdBy ASC, createdAt DESC
```

## Security Considerations

### Signature Verification

- All signatures are cryptographically verified
- Only Safe owners can sign transactions
- Duplicate signatures are prevented
- Signature replay attacks are mitigated

### Access Control

- Only authenticated users can create transactions
- Safe owner verification for signatures
- Admin-only functions for emergency operations
- Backend private key secured in environment

### Transaction Expiry

- Transactions expire after 7 days
- Expired transactions cannot be executed
- Automatic cleanup of expired transactions

### Data Validation

- All inputs are validated and sanitized
- Ethereum address format validation
- ABI and function call validation
- Batch transaction size limits (max 20)

## Performance Optimization

### Caching Strategy

- Transaction status cached in Firestore
- Safe configuration cached during service lifetime
- ABI interfaces cached for repeated calls

### Batch Operations

- Multiple signatures can be collected simultaneously
- Batch transactions execute atomically
- Optimized Firestore queries with pagination

### Gas Optimization

- Gas estimation for all transactions
- Dynamic gas price adjustment
- Batch operations reduce individual transaction costs

## Monitoring & Logging

### Structured Logging

All operations include structured logging:

```typescript
{
  "level": "INFO",
  "function": "ContractService.proposeTransaction",
  "transactionId": "0x...",
  "safeAddress": "0x...",
  "chainId": 80002,
  "createdBy": "user123",
  "description": "Create lending pool",
  "requiredSignatures": 3,
  "timestamp": "2023-12-01T12:00:00Z"
}
```

### Key Metrics

- Transaction creation rate
- Signature collection time
- Execution success rate
- Error frequencies
- Gas usage patterns

### Alerting

Recommended alerts:

- Failed transaction executions
- High error rates
- Unusual signature patterns
- Expired transaction buildup
- Emergency pause activations

## Testing

### Unit Tests

Comprehensive unit test coverage:

```bash
cd packages/backend
pnpm test src/services/ContractService.test.ts
```

Test scenarios:

- ✅ Transaction proposal creation
- ✅ Signature addition and validation
- ✅ Transaction execution
- ✅ Batch transaction handling
- ✅ Error handling and edge cases
- ✅ Emergency pause functionality

### Integration Tests

Full workflow testing with actual Safe:

```bash
cd packages/backend
pnpm test:integration
```

Integration scenarios:

- Complete signature collection workflow
- Multi-chain deployment testing
- Safe contract interaction validation
- Gas estimation accuracy
- Event parsing verification

## Migration Guide

### From Direct Safe Integration

If migrating from direct Safe wallet interactions:

```typescript
// Old approach
const safeTransaction = await prepareSafeTransaction(...)
const signatures = await collectSignatures(...)
const result = await executeSafeTransaction(...)

// New approach with ContractService
const contractService = createContractService(chainId)
const proposal = await contractService.proposeTransaction(...)
const status = await contractService.addSignature(...)
const result = await contractService.executeTransaction(...)
```

### Version Compatibility

- Node.js 18+
- TypeScript 4.5+
- Firebase Functions 4.0+
- Ethers.js 6.0+

## API Reference Summary

| Method                      | Description                  | Auth Required | Returns               |
| --------------------------- | ---------------------------- | ------------- | --------------------- |
| `proposeTransaction()`      | Create basic transaction     | Yes           | `TransactionStatus`   |
| `proposeContractCall()`     | Create contract call         | Yes           | `TransactionStatus`   |
| `proposeBatchTransaction()` | Create batch transaction     | Yes           | `TransactionStatus`   |
| `addSignature()`            | Add signature to transaction | Yes           | `TransactionStatus`   |
| `executeTransaction()`      | Execute ready transaction    | Yes           | `ExecutionResult`     |
| `getTransactionStatus()`    | Get transaction status       | Optional      | `TransactionStatus`   |
| `listTransactions()`        | List transactions            | Optional      | `TransactionStatus[]` |
| `emergencyPause()`          | Emergency pause contract     | Yes           | `TransactionStatus`   |

## Troubleshooting

### Common Issues

**Transaction Creation Fails**

```typescript
// Check Safe configuration
const threshold = await safeContract.getThreshold()
const owners = await safeContract.getOwners()
console.log(`Safe: ${owners.length} owners, ${threshold} threshold`)
```

**Signature Rejection**

```typescript
// Verify signature format and signer
const recovered = ethers.verifyMessage(messageHash, signature)
console.log(`Recovered: ${recovered}, Expected: ${signerAddress}`)
```

**Execution Failures**

```typescript
// Check transaction status and signatures
const status = await contractService.getTransactionStatus(txId)
console.log(`Status: ${status.status}, Sigs: ${status.currentSignatures}/${status.requiredSignatures}`)
```

### Debug Mode

Enable detailed logging:

```bash
export DEBUG=contract-service:*
```

This comprehensive ContractService provides a robust, type-safe, and secure foundation for managing Safe multi-signature wallet operations in the SuperPool backend infrastructure.
