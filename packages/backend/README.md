# Backend Package

Firebase Cloud Functions for authentication, App Check, and blockchain event monitoring.

## Overview

Handles wallet-based authentication, device verification, and off-chain data management for SuperPool.

## Structure

```
packages/backend/
├── src/
│   ├── functions/          # Cloud Function implementations
│   │   ├── auth/          # Wallet authentication functions
│   │   ├── app-check/     # Device verification functions
│   │   ├── pools/         # Pool management functions
│   │   └── dev/           # Development/testing functions
│   ├── services/          # Business logic services
│   ├── utils/             # Shared utilities
│   │   ├── auth.ts        # Authentication helpers
│   │   └── blockchain.ts  # Blockchain interaction utilities
│   ├── config/            # Firebase configuration
│   ├── constants/         # ABIs, chain configs, Firestore collections
│   │   ├── abis.ts        # Smart contract ABIs
│   │   ├── chains.ts      # Blockchain network configs
│   │   └── firestore.ts   # Firestore collection names
│   └── __tests__/         # Test mocks and setup
├── scripts/               # Development utilities
│   ├── generateKey.ts     # Generate dev wallet keys
│   └── signMessage.ts     # Sign auth messages
└── test/                  # Jest test suite (root level)
```

## Environment Setup

Copy `.env.template` to `.env` and configure:

```bash
cp .env.template .env
```

Then update values in `.env`:
- **APP_ID_FIREBASE**: Your Firebase app ID
- **CHAIN_ID/RPC_URL/POOL_FACTORY_ADDRESS**: Blockchain configuration (localhost or Polygon Amoy)
- **BACKEND_WALLET_PRIVATE_KEY**: Wallet for automated whitelisting (funded with gas)

See `.env.template` for detailed configuration examples.

### Service Account Key

Required for local development and Firebase Admin SDK:

1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate new private key"
3. Save as `service-account-key.json` in `packages/backend/`
4. File is automatically gitignored

## Core Functions

### Authentication

**`generateAuthMessage`**

- Generates nonce and timestamp for wallet signature
- 10-minute nonce expiry

**`verifySignatureAndLogin`**

- Verifies wallet signature
- Creates/updates user in Firestore
- Auto-approves device for App Check

### App Check

**`customAppCheckMinter`**

- Issues App Check tokens for approved devices
- Hybrid approval system (wallet auth or manual approval)

### Pool Management

**`preparePoolCreation`**

- Verifies user authentication via Firebase Auth
- Checks if whitelist mode is enabled on PoolFactory
- Checks if wallet is already whitelisted
- Whitelists user automatically (backend pays gas)
- Returns whitelisting status and transaction details

**`listPools`**

- Lists pools from Firestore with pagination
- Filters by chain ID, owner address, active status
- Returns pool metadata with pagination info

### Development Functions

**`signMessageForTesting`** (Emulator only)

- Dev-only function for testing authentication flow
- Signs messages with test wallet private key
- Only available when `FUNCTIONS_EMULATOR=true`
- Never deployed to production

## Development

```bash
# Install dependencies (from root)
pnpm install

# Build TypeScript
pnpm build

# Start Firebase emulators
pnpm serve

# Run tests
pnpm test

# Type checking
pnpm type-check
```

## Testing Scripts

Located in `scripts/` for testing authentication flow:

```bash
# Generate development wallet
pnpm generateKey

# Sign a message with generated key
pnpm signMessage <nonce> <timestamp>
```

**Workflow:**

1. Call `generateAuthMessage` to get nonce/timestamp
2. Use `pnpm signMessage` to generate signature
3. Call `verifySignatureAndLogin` with signature

## Deployment

```bash
# Set Firebase project
firebase use your-project-id

# Deploy functions
pnpm deploy

# View logs
pnpm logs
```

## Blockchain Utilities

Located in `utils/blockchain.ts`:

**`getProvider(chainId)`** - Get JSON-RPC provider for a chain

**`getBackendWallet(chainId)`** - Get backend wallet instance for transactions

**`getPoolFactoryContract(chainId)`** - Get PoolFactory contract connected to backend wallet

**`isWhitelistModeEnabled(chainId)`** - Check if whitelist mode is enabled

**`isWalletWhitelisted(walletAddress, chainId)`** - Check if wallet is authorized creator

**`whitelistWallet(walletAddress, chainId)`** - Whitelist wallet for pool creation (backend pays gas)

## Security

- Device approval required for App Check tokens
- Nonce-based authentication prevents replay attacks
- Service account key never committed (gitignored)
- Environment variables for sensitive config
- Backend wallet private key securely stored
- Whitelist mode enforcement for pool creation
- Dev-only functions blocked in production

## Dependencies

- `firebase-admin` - Firestore, Auth admin SDK
- `firebase-functions` - Cloud Functions runtime
- `ethers` - Wallet signature verification and blockchain interactions
- `@superpool/types` - Shared TypeScript types
- `dotenv` - Environment variable management
- `uuid` - Unique identifier generation
