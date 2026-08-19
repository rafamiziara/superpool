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
│   ├── schemas/           # What each endpoint will accept, one schema per endpoint
│   │   └── primitives.ts  # Addresses, hashes, ids, and the `optional()` wrapper
│   ├── utils/             # Shared utilities
│   │   ├── auth.ts        # Authentication helpers
│   │   ├── blockchain.ts  # Blockchain interaction utilities
│   │   ├── searchTokens.ts # Prefixes for pool search, and the query's own term
│   │   └── validation.ts  # `parseRequest` / `parseBody` — payloads, before a handler reads them
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
- **POOL*FACTORY_ADDRESS*&lt;chainId&gt; / RPC*URL*&lt;chainId&gt;**: one pair per chain
- **BACKEND_WALLET_PRIVATE_KEY**: Wallet for automated whitelisting (funded with
  gas on **every** configured chain — it is one key for all of them)

See `.env.template` for detailed configuration examples.

### Chains

The backend serves **every chain configured**, not one at a time. That was not
always true: `getChainConfig` used to match a single `ACTIVE_CHAIN_CONFIG`, so
localhost and Amoy could not both be served and the mobile app's network picker
was presentational — a user who switched networks got `Unsupported chain ID`
from every callable.

```bash
POOL_FACTORY_ADDRESS_31337=0x…      # localhost
RPC_URL_31337=http://127.0.0.1:8545

POOL_FACTORY_ADDRESS_80002=0x…      # Polygon Amoy, served at the same time
RPC_URL_80002=https://rpc-amoy.polygon.technology/
START_BLOCK_80002=9000000           # the factory's deployment block
```

Three things worth knowing:

- **The factory address is what makes a chain servable.** An RPC URL alone is
  ignored rather than half-configured.
- **The legacy `CHAIN_ID` / `RPC_URL` / `POOL_FACTORY_ADDRESS` triple still
  works** and configures one chain, because `pnpm deploy:local` prints those
  lines to paste after every redeploy. The suffixed form wins for the same id.
- **`START_BLOCK` is per chain.** One chain's deployment block applied to
  another means sweeping from far too early, or skipping its history entirely.

The scheduled sweep walks every configured chain in turn, each with its own
cursor in `event_sync_state`. One chain failing does not stop the rest — an
unreachable public RPC is ordinary, and it must not silently stop localhost
indexing too.

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

**`sendDueReminders`** (scheduled, hourly)

- The only scheduled notification in the project, and the only one nobody
  causes: a term lapsing emits no event, so there is nothing to hang off an
  indexer
- Scans each chain's open loans (`status in ['disbursed', 'defaulted']`,
  `isRepaid == false`) and sends at most **one** due-soon and **one** overdue
  reminder per loan, ever — the `notifications_sent` marker is the memory. A job
  running against a standing condition would otherwise send an hour, for as long
  as the debt stood
- **Judges on chain time, not server time.** `startedAt` is a block timestamp and
  `duration` counts chain seconds, so one `getBlock('latest')` per chain per run
  is what makes the answer right. On a local node the two clocks are unrelated
- Walks the chains in turn; one unreachable RPC does not stop the rest
- ⚠️ Scheduled functions do not fire in the emulator; use `sendDueRemindersNow`

**`sendDueRemindersNow`** (callable)

- Runs the same scan on demand. Safe to repeat: every reminder is claimed before
  it is sent
- Requires authentication except in the emulator
- `pnpm testDefaults` drives loans past their terms, declares them and runs this
  against a live local node

**`syncPoolEventsNow`** (callable)

- Runs the same sweep on demand: the only way to exercise it locally, and how a
  chain whose history predates the sync state gets backfilled
- `fromBlock: 0` re-scans from genesis; safe to repeat, since every indexer keys
  on the log
- Requires authentication except in the emulator
- `pnpm testSweep` runs the sweep against a live local node and checks the
  result against the chain

**`indexLoan`**

- Called by the mobile app after any of the seven loan actions is confirmed —
  borrow, request, approve, reject, cancel, repay or mark defaulted. One
  callable for all of them, since the record written is the loan's state
  afterwards whichever happened
- Matches all seven loan events (`LoanCreated`, `LoanRequested`, `LoanApproved`,
  `LoanRejected`, `LoanRepaymentMade`, `LoanRepaid`, `LoanDefaulted`). A
  cancellation has no event of its own — it emits `LoanRejected`, because the
  record tracks the state and not who ended the request. `LoanRepaymentMade` has
  to be in the set even though it has a collection of its own: a payment that
  does not settle the loan emits nothing else, so leaving it out would let
  `amountRepaid` sit at zero
- Reads `getLoan` rather than decoding the log, so the stored record cannot
  disagree with the chain whichever event triggered it. This also means indexing
  an **old** transaction stores the loan's state _now_, not then
- `status` comes from the Solidity enum by ordinal, and `LOAN_STATUS` must track
  it by index — `Disbursed` is 0 so that loans written before the field existed
  read as disbursed, which is what they were, and `Defaulted` is appended for
  the same reason
- `defaultedAt` is read from state rather than from the `LoanDefaulted` log, like
  `repaidAt` and for the same reason: the sweep sees the log on every pass, so a
  date taken from whichever arrived would be rewritten by the wrong one
- Also indexes the payment itself when the transaction carries one, into
  `loan_repayments`, and returns it as `repayments`. Both records at once,
  because the app confirms one transaction and should not have to know it
  produced two
- Idempotent: reports `alreadyIndexed` when the stored record already matches.
  The comparison includes `amountRepaid`, which is the sharpest case it has:
  an instalment moves that field and nothing else, so without it a part payment
  would be reported as already indexed
- Requires authentication
- **Cannot read pools created before the beacon migration.** Those clones return
  the pre-approval `Loan` struct and `getLoan` fails to decode, so a sweep skips
  them silently

**`listLoans`**

- Lists indexed loans, newest first, filterable by pool, borrower,
  `activeOnly`, `pendingOnly` and `defaultedOnly`
- `activeOnly` is `status in ['disbursed', 'defaulted'] && isRepaid == false` —
  outstanding debt. It is **not** `isRepaid == false`, which would also match a
  request the owner has not decided on, and so report money that never left the
  pool; and it is **not** `status == 'disbursed'` alone, which would drop a
  declared default — a judgement on a debt, not a settlement of one
- `pendingOnly` is `status == 'requested'` — the pool owner's queue. It is not
  filtered by borrower, because the owner is deciding on other people's requests
- `defaultedOnly` is `status == 'defaulted'`. There is deliberately no
  `overdueOnly`: a due date is `startedAt + duration`, so being late is
  arithmetic any reader can do and no field holds it
- A repaid or rejected loan stays in the list as history; `startedAt` is an
  **ISO string**, and it is rewritten on approval, so it means "requested at"
  while pending and "disbursed at" afterwards
- `repaidAt` is an ISO string too, and **absent** rather than null while the
  loan is outstanding — and also on a loan settled before the contract recorded
  a date. It dates the **settlement**, not the last payment. It is what borrowing
  history is derived from; see
  [`docs/LOANS.md`](../../docs/LOANS.md#borrowing-history)
- `amountRepaid` is a decimal wei string, the chain's running total, `'0'` on
  records indexed before instalments were possible
- `principalOutstanding` and `interestOutstanding` are the debt split in two,
  and `accruedAt` is when the interest half was measured. Interest accrues per
  second, so the stored figure is a **snapshot**: what is owed now is it
  projected forward at `interestRate` over `duration`. Carrying it means a list
  of loans can price itself without an RPC call each
- **`accruedAt` absent means the figures are static**, not unknown — a loan made
  before interest accrued keeps its flat price until its first payment converts
  it. The indexer prices those from the contract's `loanBalance` rather than
  storing the zeroes their struct reads
- Requires authentication

**`listLoanRepayments`**

- Lists payments made towards loans, newest first, filterable by pool, loan and
  borrower
- Separate from `listLoans` because neither derives from the other: a loan says
  how much is still owed, and these say when each instalment arrived and in
  which transaction. `loanId` is per-pool, so filtering on it alone would match
  one loan per pool on the chain
- Append-only, keyed `${chainId}-${txHash}-${logIndex}` like contributions — a
  payment is one immutable log, so keying on the loan would collapse a
  borrower's instalments onto one document
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

### Live verification

`scripts/test*.ts` drive real transactions against a local Hardhat node and the
Firestore emulator, then check what was indexed. They exist because mocked tests
cannot see ABI drift, ethers' read cache, or a field the chain never carried —
every one of them has found a bug green unit tests could not. Each script's
header lists the terminals it needs.

```bash
pnpm testSweep      # the scheduled sweep, and that a second one writes nothing
pnpm testSearch     # pool search: tokens written, matched, and backfilled
pnpm testReceipts   # the push receipt queue (add --probe-expo for a live call)
pnpm testDecisions  # what an owner decided, and who decided it
pnpm testErc20      # token pools end to end
```

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
- Every payload parsed before a handler reads it (see below)

### Request validation

`request.data` is JSON from the network; `CallableRequest<T>` is a compile-time
claim about it and nothing more. Every endpoint therefore parses its payload
through a schema in [`src/schemas/`](src/schemas/) before reading a field:

```ts
const data = parseRequest(listLoansSchema, request.data)
```

Each schema is annotated `satisfies z.ZodType<TheRequest>` against the
interface in `@superpool/types`, so the two cannot drift — a field that changes
type there stops compiling here. Unknown keys are stripped, so a handler cannot
read a field nobody declared.

Two things to get right when adding an endpoint:

- **Parse outside the `try`.** The catch blocks report what they catch as
  `internal`; a refusal raised inside one comes back as a server error the
  caller is invited to retry.
- **Import `parseRequest` from `../../utils/validation`, not from
  `../../utils`.** Several handler tests mock the barrel wholesale.

Domain rules stay in the handlers — whether a chain is configured, whether a
page size is over the cap. A schema says what a request _is_, not what this
backend can do about it. `customAppCheckMinter` is an `onRequest` rather than a
callable and uses `parseBody`, which returns the failure instead of throwing.

## Dependencies

- `firebase-admin` - Firestore, Auth admin SDK
- `firebase-functions` - Cloud Functions runtime
- `ethers` - Wallet signature verification and blockchain interactions
- `@superpool/types` - Shared TypeScript types
- `dotenv` - Environment variable management
- `uuid` - Unique identifier generation
- `zod` - Request payload validation (see [Request validation](#request-validation))
