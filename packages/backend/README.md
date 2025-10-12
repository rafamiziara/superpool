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
│   │   └── pools/         # Pool-related functions
│   ├── services/          # Business logic services
│   ├── utils/             # Shared utilities
│   ├── config/            # Firebase configuration
│   ├── constants/         # ABIs, Firestore collections
│   ├── types/             # TypeScript type definitions
│   └── __tests__/         # Test mocks and setup
├── scripts/               # Development utilities
│   ├── generateKey.ts     # Generate dev wallet keys
│   └── signMessage.ts     # Sign auth messages
└── test/                  # Jest test suite (root level)
```

## Environment Setup

Create `.env` file:

```bash
# Firebase App ID for App Check
APP_ID_FIREBASE=your_firebase_app_id
```

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

**`mintAppCheckToken`**

- Issues App Check tokens for approved devices
- Hybrid approval system (wallet auth or manual approval)

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

## Security

- Device approval required for App Check tokens
- Nonce-based authentication prevents replay attacks
- Service account key never committed (gitignored)
- Environment variables for sensitive config

## Dependencies

- `firebase-admin` - Firestore, Auth admin SDK
- `firebase-functions` - Cloud Functions runtime
- `ethers` - Wallet signature verification
- `@superpool/types` - Shared TypeScript types
