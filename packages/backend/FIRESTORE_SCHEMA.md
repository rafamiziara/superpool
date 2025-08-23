# Firestore Schema Documentation - Event Synchronization

This document outlines the Firestore collections and document structures used by the blockchain event synchronization system.

## Collections Overview

### 1. `pools` - Pool Information Collection

Stores comprehensive information about lending pools created through the PoolFactory contract.

**Document ID:** Pool ID from blockchain (e.g., "1", "2", "3")

**Structure:**
```typescript
interface PoolDocument {
  // Core pool data from blockchain
  id: string                    // Pool ID from contract
  address: string              // Pool contract address
  owner: string                // Pool owner address
  name: string                 // Pool name from event
  description?: string         // Optional description (can be updated later)
  maxLoanAmount: string        // Maximum loan amount in wei
  interestRate: number         // Interest rate in basis points
  loanDuration: number         // Loan duration in seconds
  
  // Timestamps
  createdAt: Date             // Pool creation timestamp from blockchain
  updatedAt: Date             // Last update timestamp
  
  // Blockchain metadata
  transactionHash: string     // Creation transaction hash
  blockNumber: number         // Block number of creation
  chainId: number            // Blockchain chain ID
  isActive: boolean          // Pool status
  
  // Pool statistics (updated by other functions)
  stats?: {
    totalLent: string         // Total amount lent (wei)
    totalBorrowed: string     // Total amount borrowed (wei)
    activeLoans: number       // Number of active loans
    completedLoans: number    // Number of completed loans
    defaultedLoans: number    // Number of defaulted loans
    apr: number              // Current APR percentage
    utilization: number      // Pool utilization percentage
  }
  
  // Technical metadata
  metadata: {
    eventId: string          // Unique event identifier
    logIndex: number         // Event log index
    syncedAt: Date          // When event was synced
    lastUpdated?: Date      // Last metadata update
    version: number         // Document version for updates
  }
  
  // Search and categorization
  tags?: string[]           // Pool tags for categorization
  category?: string         // Pool category
  isVerified?: boolean      // Verification status
  isFeatured?: boolean      // Featured pool status
}
```

**Indexes Required:**
- `chainId` ASC, `createdAt` DESC
- `owner` ASC, `createdAt` DESC  
- `isActive` ASC, `createdAt` DESC
- `interestRate` ASC, `maxLoanAmount` ASC
- `tags` ARRAY_CONTAINS, `createdAt` DESC

### 2. `event_sync_state` - Synchronization State Collection

Tracks the synchronization state for each contract on each blockchain.

**Document ID:** `{contractType}_{chainId}` (e.g., "poolFactory_80002")

**Structure:**
```typescript
interface EventSyncState {
  contractAddress: string      // Contract address being monitored
  chainId: number             // Blockchain chain ID
  lastProcessedBlock: number  // Last processed block number
  lastSyncAt: Date           // Timestamp of last sync operation
  totalEventsProcessed: number // Total events processed lifetime
  lastEventTimestamp?: Date   // Timestamp of last event processed
  
  // Historical sync metadata
  historicalSyncCompleted?: boolean // Whether historical sync is done
  historicalSyncRange?: string      // Block range of historical sync
  
  // Error tracking
  lastError?: {
    message: string
    timestamp: Date
    blockNumber?: number
  }
  
  // Performance metrics
  avgProcessingTime?: number   // Average processing time per event
  lastSyncDuration?: number    // Duration of last sync in ms
}
```

**Indexes Required:**
- `chainId` ASC, `lastSyncAt` DESC
- `contractAddress` ASC, `lastProcessedBlock` ASC

### 3. `event_logs` - Event Processing Audit Trail

Stores detailed logs of all processed blockchain events for auditing and debugging.

**Document ID:** `{transactionHash}_{logIndex}` (e.g., "0x123...abc_0")

**Structure:**
```typescript
interface EventLog {
  // Event identification
  eventType: string           // Type of event (e.g., "PoolCreated")
  contractAddress: string     // Source contract address
  chainId: number            // Blockchain chain ID
  
  // Blockchain data
  poolId: string             // Pool ID from event
  poolAddress: string        // Pool contract address
  poolOwner: string          // Pool owner address
  name: string              // Pool name
  maxLoanAmount: string     // Max loan amount in wei
  interestRate: number      // Interest rate in basis points
  loanDuration: number      // Loan duration in seconds
  
  // Transaction metadata
  transactionHash: string   // Transaction hash
  blockNumber: number       // Block number
  logIndex: number         // Event log index
  timestamp: number        // Block timestamp (Unix)
  
  // Processing metadata
  processedAt: Date        // When event was processed
  processedBy?: string     // User ID who triggered processing (if manual)
  
  // Validation results
  validationPassed?: boolean
  validationErrors?: string[]
}
```

**Indexes Required:**
- `eventType` ASC, `processedAt` DESC
- `chainId` ASC, `blockNumber` ASC
- `contractAddress` ASC, `timestamp` DESC

### 4. `pool_owners` - Pool Owner Index

Maintains an index of pool owners and their associated pools for efficient queries.

**Document ID:** Pool owner address (e.g., "0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a")

**Structure:**
```typescript
interface PoolOwnerIndex {
  address: string           // Owner address
  poolIds: string[]        // Array of pool IDs owned by this address
  lastPoolCreated: Date    // Timestamp of most recent pool creation
  totalPools: number       // Total number of pools owned
  
  // Statistics
  stats?: {
    totalValueLocked: string  // Total value across all pools (wei)
    avgInterestRate: number   // Average interest rate across pools
    successRate: number       // Success rate of pool operations
  }
}
```

**Indexes Required:**
- `totalPools` DESC, `lastPoolCreated` DESC
- `lastPoolCreated` DESC

### 5. `pool_search` - Search Index Collection

Optimized collection for pool search and filtering functionality.

**Document ID:** Pool ID (e.g., "1", "2", "3")

**Structure:**
```typescript
interface PoolSearchIndex {
  poolId: string              // Pool ID
  name: string               // Lowercase pool name for search
  owner: string              // Lowercase owner address
  tags: string[]             // Search tags
  interestRate: number       // Interest rate for filtering
  maxLoanAmount: number      // Max loan amount in ETH (converted from wei)
  createdAt: Date           // Creation timestamp
  chainId: number           // Blockchain chain ID
  isActive: boolean         // Pool status
  
  // Search optimization fields
  nameTokens?: string[]     // Tokenized name for better search
  description?: string      // Searchable description
  category?: string         // Pool category
}
```

**Indexes Required:**
- `tags` ARRAY_CONTAINS, `interestRate` ASC
- `interestRate` ASC, `maxLoanAmount` DESC
- `createdAt` DESC, `isActive` ASC
- `chainId` ASC, `name` ASC

## Collection Security Rules

### Basic Security Rules (firestore.rules)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Pools collection - read for all, write for system only
    match /pools/{poolId} {
      allow read: if true;
      allow write: if isSystemUser() || isAdmin();
    }
    
    // Event sync state - admin only
    match /event_sync_state/{stateId} {
      allow read, write: if isAdmin();
    }
    
    // Event logs - read for admins, write for system
    match /event_logs/{eventId} {
      allow read: if isAdmin();
      allow write: if isSystemUser() || isAdmin();
    }
    
    // Pool owners index - read for all, write for system
    match /pool_owners/{ownerAddress} {
      allow read: if true;
      allow write: if isSystemUser() || isAdmin();
    }
    
    // Pool search index - read for all, write for system
    match /pool_search/{poolId} {
      allow read: if true;
      allow write: if isSystemUser() || isAdmin();
    }
    
    // Helper functions
    function isAdmin() {
      return request.auth != null && 
             resource.data.adminUsers != null &&
             request.auth.uid in resource.data.adminUsers;
    }
    
    function isSystemUser() {
      // System calls from Cloud Functions
      return request.auth == null || request.auth.uid == "system";
    }
  }
}
```

## Performance Optimization

### 1. Composite Indexes

Create composite indexes in Firebase Console or firestore.indexes.json:

```json
{
  "indexes": [
    {
      "collectionGroup": "pools",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "chainId", "order": "ASCENDING"},
        {"fieldPath": "createdAt", "order": "DESCENDING"}
      ]
    },
    {
      "collectionGroup": "pools", 
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "owner", "order": "ASCENDING"},
        {"fieldPath": "createdAt", "order": "DESCENDING"}
      ]
    },
    {
      "collectionGroup": "pools",
      "queryScope": "COLLECTION", 
      "fields": [
        {"fieldPath": "isActive", "order": "ASCENDING"},
        {"fieldPath": "interestRate", "order": "ASCENDING"},
        {"fieldPath": "createdAt", "order": "DESCENDING"}
      ]
    },
    {
      "collectionGroup": "pool_search",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "tags", "arrayConfig": "CONTAINS"},
        {"fieldPath": "interestRate", "order": "ASCENDING"}
      ]
    }
  ]
}
```

### 2. Data Partitioning Strategy

- **By Chain ID**: Separate queries by blockchain to improve performance
- **By Time Ranges**: Use time-based partitioning for historical data
- **By Owner**: Efficient owner-based queries using dedicated index collection

### 3. Caching Strategy

- **Pool Data**: Cache frequently accessed pools in Redis or Firestore cache
- **Search Results**: Cache popular search queries
- **Sync State**: Cache sync state to reduce Firestore reads

## Monitoring and Alerting

### Key Metrics to Monitor

1. **Event Processing Rate**: Events processed per minute
2. **Sync Lag**: Time difference between blockchain and Firestore
3. **Error Rate**: Failed event processing percentage
4. **Collection Growth**: Document count growth over time
5. **Query Performance**: Average query response time

### Recommended Alerts

1. **Sync Lag Alert**: Trigger if sync lag > 10 minutes
2. **Error Rate Alert**: Trigger if error rate > 5%
3. **Missing Events Alert**: Trigger if no events for > 1 hour during active periods
4. **Storage Usage Alert**: Trigger if approaching Firestore limits

This schema provides a robust foundation for blockchain event synchronization with excellent query performance, comprehensive auditing, and efficient search capabilities.