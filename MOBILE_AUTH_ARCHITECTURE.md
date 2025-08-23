# SuperPool Mobile Authentication Architecture

This document provides comprehensive documentation for the SuperPool mobile app's authentication system, covering the interaction between services, hooks, and utilities.

## Overview

The authentication system is built on a **4-layer architecture**:
1. **Services Layer** - Core authentication logic and orchestration
2. **Hooks Layer** - React hooks for state management and UI integration
3. **Utils Layer** - Supporting utilities for session, error, and state management
4. **Components Layer** - UI integration (not covered in this document)

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        UI LAYER                             │
│  (Components using hooks for authentication state)          │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                     HOOKS LAYER                             │
│  useAuthentication → useAuthenticationState                 │
│  useWalletConnectionTrigger → useWalletToasts               │
│  useLogoutState                                             │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                   SERVICES LAYER                            │
│  AuthenticationOrchestrator                                 │
│  AuthErrorRecoveryService                                   │
│  SignatureService                                           │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    UTILS LAYER                              │
│  ConnectionStateManager → SessionManager                    │
│  ErrorHandling → Toast → AppCheckProvider                   │
└─────────────────────────────────────────────────────────────┘
```

## 1. Services Layer (`src/services/`)

### AuthenticationOrchestrator

**Purpose**: Main orchestrator that coordinates the entire authentication flow
**File**: `authenticationOrchestrator.ts:31`

**Key Features:**
- **Authentication Locking**: Prevents concurrent authentication attempts using `AuthenticationLock`
- **State Validation**: Ensures wallet connection state remains consistent during auth flow
- **4-Step Flow**: Message generation → Signature → Verification → Firebase login
- **Error Handling**: Comprehensive error recovery through `AuthErrorRecoveryService`

**Critical Methods:**
- `authenticate()`: Main orchestration method (`authenticationOrchestrator.ts:307`)
- `acquireAuthLock()`: Prevents race conditions (`authenticationOrchestrator.ts:39`)
- `validateStateConsistency()`: Validates connection state at checkpoints (`authenticationOrchestrator.ts:260`)

### SignatureService

**Purpose**: Handles wallet signature requests with multi-wallet support
**File**: `signatureService.ts:208`

**Key Features:**
- **Wallet Detection**: Automatically detects Safe wallets vs. regular wallets
- **Signature Strategies**: EIP-712 typed data, personal sign, and Safe wallet authentication
- **Progressive Timeouts**: Different timeout strategies for different wallet types
- **Fallback Logic**: Falls back gracefully when signature methods fail

**Signature Types:**
- `typed-data`: EIP-712 structured data signing (preferred)
- `personal-sign`: Simple message signing (fallback)
- `safe-wallet`: Special authentication token for Safe wallets

### AuthErrorRecoveryService

**Purpose**: Comprehensive error handling and recovery system
**File**: `authErrorRecoveryService.ts:20`

**Key Features:**
- **Session Error Analysis**: Detects and handles WalletConnect session errors
- **Recovery Strategies**: Different recovery approaches based on error type
- **Cleanup Operations**: Comprehensive session cleanup through `SessionManager`
- **User Feedback**: Appropriate error messaging with timing

**Error Types Handled:**
- WalletConnect session errors (most critical)
- Timeout errors
- Connector errors
- Generic authentication failures

## 2. Hooks Layer (`src/hooks/`)

### useAuthentication

**Purpose**: Main authentication hook that provides auth state to components
**File**: `useAuthentication.ts:8`

**Key Features:**
- **Orchestrator Integration**: Creates and manages `AuthenticationOrchestrator` instance
- **Connection Triggering**: Uses `useWalletConnectionTrigger` for automatic auth on new connections
- **Error State**: Provides authentication errors to UI components
- **Cleanup Handling**: Properly cleans up on wallet disconnection

### useAuthenticationState

**Purpose**: State management hook for authentication-related state
**File**: `useAuthenticationState.ts:21`

**Key Features:**
- **Error State**: Manages authentication errors
- **Lock Management**: Manages authentication lock to prevent concurrent attempts
- **Derived State**: Provides computed values like `isAuthenticating` and `authWalletAddress`

### useWalletConnectionTrigger

**Purpose**: Detects new wallet connections and triggers authentication
**File**: `useWalletConnectionTrigger.ts:9`

**Key Features:**
- **Connection Detection**: Monitors wallet connection state changes
- **Event Callbacks**: Triggers callbacks for new connections and disconnections
- **State Tracking**: Tracks previous connection state to detect changes
- **Stability Delay**: Small delay to ensure wallet connection is stable

### useLogoutState & useWalletToasts

**Supporting Hooks:**
- `useLogoutState`: Global logout state management
- `useWalletToasts`: Wallet connection/disconnection toast notifications

## 3. Utils Layer (`src/utils/`)

### ConnectionStateManager

**Purpose**: Manages atomic wallet connection state snapshots
**File**: `connectionStateManager.ts:9`

**Key Features:**
- **Atomic Snapshots**: Captures connection state at specific moments
- **State Validation**: Validates state hasn't changed during authentication
- **Sequence Tracking**: Uses sequence numbers to detect state changes

### SessionManager

**Purpose**: Manages WalletConnect and Reown AppKit sessions
**File**: `sessionManager.ts:16`

**Key Features:**
- **Comprehensive Cleanup**: Clears all WalletConnect-related storage keys
- **Session Detection**: Identifies and clears problematic sessions
- **Batch Operations**: Efficiently clears large numbers of storage keys
- **Debug Information**: Provides session debugging capabilities

**Critical Methods:**
- `clearAllWalletConnectSessions()`: Main cleanup method (`sessionManager.ts:17`)
- `forceResetAllConnections()`: Nuclear option for complete reset (`sessionManager.ts:191`)
- `clearSessionByErrorId()`: Targeted cleanup for specific session errors (`sessionManager.ts:224`)

### ErrorHandling

**Purpose**: Centralized error categorization and handling
**File**: `errorHandling.ts:36`

**Key Features:**
- **Error Categorization**: Automatically categorizes errors by type
- **User-Friendly Messages**: Provides appropriate error messages for each type
- **Error Types**: WALLET_CONNECTION, SIGNATURE_REJECTED, NETWORK_ERROR, etc.

### Toast System

**Purpose**: User feedback through toast notifications
**File**: `toast.ts:91`

**Key Features:**
- **Authentication Toasts**: Specialized toasts for auth flow steps
- **Extended Durations**: Longer durations for wallet app switching scenarios
- **Error-Specific Messaging**: Different toast styles based on error type

### AppCheckProvider

**Purpose**: Firebase App Check token provider for device verification
**File**: `appCheckProvider.ts:31`

**Key Features:**
- **Device ID Generation**: Platform-specific device identification
- **Custom Token Provider**: Integrates with backend App Check system
- **Fallback Tokens**: Provides dummy tokens when device not approved

## Authentication Flow Sequence

### Complete Authentication Flow

```mermaid
sequenceDiagram
    participant UI as UI Component
    participant Hook as useAuthentication
    participant Orch as AuthenticationOrchestrator
    participant Sig as SignatureService
    participant Backend as Firebase Functions
    participant Session as SessionManager
    participant Error as ErrorRecoveryService

    UI->>Hook: Wallet connects
    Hook->>Orch: authenticate(context)
    
    Note over Orch: Step 1: Acquire lock & validate state
    Orch->>Orch: acquireAuthLock()
    Orch->>Orch: validatePreConditions()
    
    Note over Orch: Step 2: Generate auth message
    Orch->>Backend: generateAuthMessage()
    Backend-->>Orch: {message, nonce, timestamp}
    
    Note over Orch: Step 3: Request signature
    Orch->>Sig: requestSignature()
    Sig->>Sig: detectWalletType()
    
    alt Safe Wallet
        Sig->>Sig: SafeWalletSigner.sign()
    else Regular Wallet
        Sig->>Sig: RegularWalletSigner.sign()
    end
    
    Sig-->>Orch: {signature, signatureType}
    
    Note over Orch: Step 4: Verify signature
    Orch->>Backend: verifySignatureAndLogin()
    Backend-->>Orch: {firebaseToken}
    
    Note over Orch: Step 5: Firebase authentication
    Orch->>Orch: signInWithFirebase()
    
    alt Success
        Orch-->>Hook: Success
        Hook-->>UI: Authentication complete
    else Error
        Orch->>Error: handleAuthenticationError()
        Error->>Session: clearAllWalletConnectSessions()
        Error-->>Hook: Categorized error
        Hook-->>UI: Show error state
    end
```

## Error Recovery Strategies

### Session Error Recovery

When WalletConnect session errors occur:

1. **Detection**: `AuthErrorRecoveryService.analyzeSessionError()` identifies session errors
2. **Cleanup**: `SessionManager.clearAllWalletConnectSessions()` removes all related storage
3. **Disconnection**: Wallet is disconnected to force fresh connection
4. **User Feedback**: Specific session error toast is shown

### Generic Error Recovery

For other authentication errors:

1. **Categorization**: `categorizeError()` determines error type
2. **Recovery Decision**: Determine if wallet should be disconnected
3. **Timing**: Error feedback shown after appropriate delays
4. **Cleanup**: Firebase signout if needed

## Configuration Points

### Timeouts
- **Regular Wallets**: 15 seconds for signature requests
- **Safe Wallets**: 20 seconds for signature requests
- **Firebase Retry**: 3 attempts with increasing delays

### Session Storage Keys Cleared
- `@walletconnect/*` - WalletConnect core sessions
- `@reown/*` - Reown AppKit sessions
- `wagmi.*` - Wagmi cache and connection data
- Session ID patterns (`[a-f0-9]{64}`)

### Error Delay Strategies
- **User Cancellation**: 1.5 second delay
- **Technical Failures**: 2 second delay (after disconnect toast)
- **Session Errors**: 1.5 second delay with specific messaging

## Common Issues & Solutions

### Issue: "No matching key" Errors
**Cause**: Orphaned WalletConnect sessions in storage
**Solution**: `SessionManager.forceResetAllConnections()` provides comprehensive cleanup

### Issue: Safe Wallet Authentication Failures
**Cause**: Safe wallets can't sign standard messages
**Solution**: `SignatureService` automatically falls back to ownership verification tokens

### Issue: Concurrent Authentication Attempts
**Cause**: Multiple wallet connection events firing simultaneously
**Solution**: `AuthenticationLock` prevents concurrent attempts with proper cleanup

### Issue: Connection State Changes During Auth
**Cause**: User switches networks/wallets during authentication
**Solution**: `ConnectionStateManager` validates state consistency at checkpoints

## Testing Considerations

The authentication system includes several testing utilities:

1. **State Management Tests**: `useAuthenticationState.test.ts`
2. **Error Recovery Tests**: `authErrorRecoveryService.simple.test.ts`
3. **Signature Service Tests**: `signatureService.test.ts`
4. **Connection State Tests**: `connectionStateManager.test.ts`

## Security Features

1. **Firebase App Check**: Device verification before authentication
2. **Atomic State Management**: Prevents race conditions and state inconsistencies
3. **Session Isolation**: Complete session cleanup prevents cross-authentication contamination
4. **Error Categorization**: Prevents sensitive error information leakage
5. **Signature Validation**: Multiple signature verification strategies

---

## Refactoring Recommendations

Based on the current architecture analysis, here are key areas that may need attention for the auth flow refactor:

1. **State Consistency**: The current system has complex state validation - consider simplifying
2. **Session Management**: Very aggressive session clearing - may need more targeted cleanup
3. **Error Recovery**: Comprehensive but complex - could benefit from consolidation
4. **Lock Management**: Authentication locking is effective but could be more React-friendly
5. **Safe Wallet Handling**: Special-casing throughout the system - consider more unified approach

The architecture is well-designed for handling complex wallet authentication scenarios but may benefit from simplification in certain areas during refactoring.