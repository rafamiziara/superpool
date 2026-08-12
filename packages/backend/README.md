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
│   │   ├── events/        # Scheduled chain-event sync
│   │   ├── notifications/ # Push token registration
│   │   └── dev/           # Development/testing functions
│   ├── services/          # Business logic services
│   │   └── eventIndexer.ts # Shared pool indexing, used by both indexing paths
│   ├── utils/             # Shared utilities
│   │   ├── auth.ts        # Authentication helpers
│   │   └── blockchain.ts  # Blockchain interaction utilities
│   ├── config/            # Firebase configuration
│   ├── constants/         # ABIs, chain configs, Firestore collections
│   │   ├── abis.ts        # Import surface for the contract ABIs
│   │   ├── abis.generated.ts # Generated — do not edit (see below)
│   │   ├── chains.ts      # Blockchain network configs
│   │   └── firestore.ts   # Firestore collection names
│   └── __tests__/         # Test mocks and setup
├── scripts/               # Development utilities
│   ├── generateKey.ts     # Generate dev wallet keys
│   └── signMessage.ts     # Sign auth messages
└── test/                  # Jest test suite (root level)
```

## Contract ABIs

`constants/abis.generated.ts` is generated from the compiled contract artifacts and must
not be hand-edited — that is exactly how the backend's ABIs silently drifted from the
contracts in five places. After any change to a contract's interface, run:

```bash
pnpm --filter contracts abis:generate
```

The contracts test suite (`test/AbiSync.test.ts`) fails if the file has drifted. The
mobile app receives a byte-identical copy from the same generator.

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

**`indexPool`**

- Called by the mobile app as soon as a creation transaction is confirmed
- Fetches the receipt, parses the `PoolCreated` event, writes the pool to Firestore
- Idempotent: the document id is `${chainId}-${poolId}`, so re-indexing an
  already-stored pool reports `alreadyIndexed` and writes nothing
- Requires authentication

**`syncPoolEvents`** (scheduled, every 5 minutes)

- Backfills anything the immediate path missed — a user who closed the app, a
  failed callable, a transaction confirmed while offline, a seeding script
- Sweeps `PoolCreated`, `PoolDeactivated`/`PoolReactivated`, `FundsDeposited`,
  `FundsWithdrawn`, `LoanCreated` and `LoanRepaid` from the last processed block
  to the chain head, in 500-block ranges, updating `event_sync_state` per chain
  after each one
- The only thing that reconciles a pool's `isActive`: it is written `true` at
  creation and no on-demand callable revisits it, so a pool deactivated on chain
  keeps being listed until a sweep runs
- Shares `services/eventIndexer.ts`, `contributionIndexer.ts` and
  `withdrawalIndexer.ts` with the on-demand callables, so every path agrees
- Set `START_BLOCK` on a deployed chain — a first run without it only looks back
  1000 blocks
- ⚠️ Scheduled functions do not fire in the emulator; use `syncPoolEventsNow`

**`syncPoolEventsNow`** (callable)

- Runs the same sweep on demand: the only way to exercise it locally, and how a
  chain whose history predates the sync state gets backfilled
- `fromBlock: 0` re-scans from genesis; safe to repeat, since every indexer keys
  on the log
- Requires authentication except in the emulator
- `pnpm testSweep` runs the sweep against a live local node and checks the
  result against the chain

**`indexLoan`**

- Called by the mobile app after any of the six loan actions is confirmed —
  borrow, request, approve, reject, cancel or repay. One callable for all of
  them, since the record written is the loan's state afterwards whichever
  happened
- Matches all five loan events (`LoanCreated`, `LoanRequested`, `LoanApproved`,
  `LoanRejected`, `LoanRepaid`). A cancellation has no event of its own — it
  emits `LoanRejected`, because the record tracks the state and not who ended
  the request
- Reads `getLoan` rather than decoding the log, so the stored record cannot
  disagree with the chain whichever event triggered it. This also means indexing
  an **old** transaction stores the loan's state _now_, not then
- `status` comes from the Solidity enum by ordinal, and `LOAN_STATUS` must track
  it by index — `Disbursed` is 0 so that loans written before the field existed
  read as disbursed, which is what they were
- Idempotent: reports `alreadyIndexed` when the stored record already matches
- Requires authentication
- **Cannot read pools created before the beacon migration.** Those clones return
  the pre-approval `Loan` struct and `getLoan` fails to decode, so a sweep skips
  them silently

**`listLoans`**

- Lists indexed loans, newest first, filterable by pool, borrower,
  `activeOnly` and `pendingOnly`
- `activeOnly` is `status == 'disbursed' && isRepaid == false` — outstanding
  debt. It is **not** `isRepaid == false`, which would also match a request the
  owner has not decided on, and so report money that never left the pool
- `pendingOnly` is `status == 'requested'` — the pool owner's queue. It is not
  filtered by borrower, because the owner is deciding on other people's requests
- A repaid or rejected loan stays in the list as history; `startedAt` is an
  **ISO string**, and it is rewritten on approval, so it means "requested at"
  while pending and "disbursed at" afterwards
- `repaidAt` is an ISO string too, and **absent** rather than null while the
  loan is outstanding — and also on a loan settled before the contract recorded
  a date. It is what borrowing history is derived from; see
  [`docs/LOANS.md`](../../docs/LOANS.md#borrowing-history)
- Requires authentication

**`listPools`**

- Lists pools from Firestore with pagination
- Filters by chain ID, owner address, active status
- Returns pool metadata with pagination info
- `createdAt` is an **ISO string, not a `Date`** — the callable encoder maps
  objects by their enumerable keys, and a `Date` has none, so it would arrive as
  `{}`. Addresses come back **lowercased**; compare them case-insensitively.

See [`docs/POOL_CREATION.md`](../../docs/POOL_CREATION.md) for how these fit
together with the mobile app.

### Notifications

**`registerPushToken`** / **`unregisterPushToken`**

- Store and forget this device's Expo push token, in the `push_tokens`
  collection keyed by the token itself
- The wallet comes from `request.auth.uid` — the auth function mints a token
  whose UID **is** the address — so a caller cannot register against somebody
  else's wallet and receive their notifications
- **Not** kept on `approved_devices`: `DeviceVerificationService.approveDevice`
  writes that document with `set()` and no merge, which happens on every cold
  start and would wipe the token
- Unregistering is called on wallet **disconnect and switch**, not only
  sign-out; a token left behind sends the next wallet the previous one's
  requests

Sending is not a function but a service pair: `services/notifications.ts` POSTs
to Expo (`exp.host`) and prunes a token on a `DeviceNotRegistered` receipt, and
`services/poolNotifications.ts` decides which indexer transition is worth a push
and to whom. Both are driven from `indexLoanFromLog` / `indexMembershipFromLog`,
so the scheduled sweep notifies as well as the on-demand callables.

See the Notifications section in [`CLAUDE.md`](../../CLAUDE.md) for why Expo
rather than FCM, and why `stored` is not a safe trigger.

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
