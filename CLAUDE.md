# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SuperPool is a proof-of-concept multi-chain decentralized micro-lending platform under active development. It's a monorepo with shared packages for consistent development across multiple EVM-compatible blockchains:

### Applications

- **Landing Page** (`apps/landing/`) - Next.js 16 marketing website
- **Mobile App** (`apps/mobile/`) - React Native/Expo app with wallet integration

### Core Services

- **Smart Contracts** (`packages/contracts/`) - Solidity contracts for lending pools
- **Backend** (`packages/backend/`) - Firebase Cloud Functions for off-chain logic

### Shared Packages

- **Assets** (`packages/assets/`) - Brand assets, illustrations, onboarding images
- **Types** (`packages/types/`) - Shared TypeScript interfaces for all applications

There is no shared UI or design-token package: each app owns its own theme (see
[UI & Frontend Interface Design](#ui--frontend-interface-design) below).

## Common Commands

### Root Level

```bash
pnpm install          # Install all dependencies across workspaces
```

### Smart Contracts (`packages/contracts/`)

```bash
# Local Development
pnpm node:local       # Start local Hardhat node
pnpm deploy:local     # Deploy to localhost (requires node:local running)
pnpm console:local    # Interactive console connected to localhost

# Forked Development (Polygon Amoy)
pnpm node:fork        # Start Hardhat node forked from Polygon Amoy
pnpm deploy:fork      # Deploy to forked network
pnpm console:fork     # Interactive console connected to forked network
pnpm test:fork        # Run tests against forked network

# Testing & Deployment
pnpm compile          # Compile contracts
pnpm test             # Run tests on ephemeral Hardhat network
pnpm test:gas         # Run tests with gas reporting
pnpm deploy:amoy      # Deploy to Polygon Amoy testnet
pnpm coverage         # Generate test coverage report
pnpm lint             # Lint Solidity and TypeScript files
```

### Backend (`packages/backend/`)

```bash
pnpm build           # TypeScript compilation
pnpm lint            # ESLint
pnpm test            # Jest tests
pnpm serve           # Start Firebase emulators
pnpm deploy          # Deploy to Firebase
pnpm generateKey     # Generate dev keys for backend testing
pnpm signMessage     # Sign test messages for backend auth
```

### Landing Page (`apps/landing/`)

```bash
pnpm dev             # Start Next.js development server (port 3001)
pnpm build           # Build for production
pnpm start           # Start production server
pnpm lint            # ESLint
pnpm type-check      # TypeScript type checking
```

### Mobile App (`apps/mobile/`)

```bash
pnpm start           # Start Expo development server (with MobX stores)
pnpm android         # Run on Android
pnpm ios             # Run on iOS
pnpm web             # Run on web
# MobX stores auto-configure on app startup via mobxConfig.ts
```

### Shared Packages

#### Assets (`packages/assets/`)

```bash
# No build needed - contains static assets
# Used by importing: @superpool/assets/images/...
```

#### Types (`packages/types/`)

```bash
pnpm build           # Build TypeScript definitions
pnpm dev             # Watch mode for development
pnpm type-check      # TypeScript type checking
```

## Architecture

For project structure overview, see the [Architecture section in README.md](README.md#-architecture-overview). Each package has detailed documentation in its own README:

- [Mobile App](apps/mobile/README.md) | [Landing Page](apps/landing/README.md)
- [Smart Contracts](packages/contracts/README.md) | [Backend](packages/backend/README.md)
- [Types](packages/types/README.md) | [Assets](packages/assets/README.md)

**IMPORTANT**: When making structural changes to a package, always update its README to reflect the changes.

### Monorepo Structure

- Uses **pnpm workspaces** for dependency management
- **TypeScript project references** for coordinated builds and type checking
- **Shared packages** with workspace protocol dependencies (`workspace:*`)
- **Firebase** (`firebase.json`) configures Cloud Functions, Firestore, and emulators
- **Design system** ensures brand consistency across web and mobile

### Key Components

**Smart Contract Layer:**

- `PoolFactory` - Deploys lending pools (controlled by multi-sig Safe)
- `LendingPool` - Individual pool contracts with membership and lending logic
- Upgradeable proxies pattern for contract updates

**Backend Services:**

- **Authentication**: `generateAuthMessage`, `verifySignatureAndLogin` for wallet-based auth
- **App Check**: Custom token minting with device verification for Firebase security
- **Device Verification**: Hybrid approval system linking devices to authenticated wallets
- **Event Listeners**: Monitor blockchain events and sync to Firestore
- **Multi-sig Integration**: Admin actions through Safe contracts

**Shared Package System:**

- **Assets** (`@superpool/assets`): Onboarding illustrations, brand assets, shared media
- **Types** (`@superpool/types`): Authentication, lending, blockchain, and API interfaces

**Landing Page** (Next.js 16):

- **Framework**: Next.js with App Router and React 19 support
- **Styling**: Tailwind CSS v4, theme tokens in `src/app/globals.css`
- **Components**: Local components under `src/components/`
- **Features**: Responsive design showcasing SuperPool's 4 core features

**Mobile Application:**

- **Wallet Integration**: Reown AppKit with WalletConnect for multi-wallet support (500+ wallets)
- **State Management**: MobX reactive stores with centralized state management
- **Styling**: Uniwind (Tailwind CSS v4) with theme tokens in global.css
- **Icons**: FontAwesome via `@expo/vector-icons` (wallet, users, shield, etc.)
- **Chain Support**: Ethereum Mainnet, Polygon, Arbitrum, Base, BSC, Polygon Amoy, Localhost (dev mode)
- **Firebase Integration**: Authentication, Firestore, Cloud Functions
- **Architecture**: Expo Router with TypeScript and shared type definitions
- **Store Architecture**: AuthStore, NavigationStore, PoolStore, PendingTransactionsStore singletons in `src/stores/`
- **React Integration**: mobx-react-lite with observer components and React Context
- **Configuration**: React Native batching, development mode validation
- **Assets**: References shared onboarding illustrations and brand assets

### Development Flow

#### Hybrid Testing Strategy (Recommended)

**Fast Local Development** (Core Contract Logic):

1. **Local Blockchain**: Start with `pnpm node:local` for instant development
2. **Core Testing**: Use `pnpm test:local` for fast contract logic validation
3. **Basic Ownership**: Test 2-step ownership transfer with regular addresses
4. **Emergency Functions**: Test pause/unpause and basic admin functions
5. **Mobile Testing**: Connect to localhost network for immediate testing

**Comprehensive Safe Integration** (Multi-Sig Testing):

1. **Forked Network**: Use `pnpm node:fork` for realistic network conditions
2. **Safe Testing**: Use `pnpm test:safe` for complete multi-sig workflow
3. **Real Safe Contracts**: Test with actual Safe SDK and contracts
4. **Multi-Sig Simulation**: Full signature collection and execution process
5. **Emergency Procedures**: Test emergency functions through Safe multi-sig

**Combined Testing**:

```bash
# Test everything (local + Safe integration)
pnpm test:full

# Individual test scenarios
pnpm test:local    # Fast core contract testing
pnpm test:safe     # Complete Safe multi-sig testing
```

**Benefits of Hybrid Approach**:

- ✅ **Fast Iteration**: Local testing for rapid development cycles
- ✅ **Comprehensive Coverage**: Full Safe integration testing
- ✅ **Realistic Conditions**: Forked network mirrors production environment
- ✅ **Emergency Procedures**: Multi-sig approval simulation for critical functions

#### Production Deployment

1. Smart contracts deployable to multiple EVM-compatible chains (Polygon, Ethereum, Arbitrum, Base, BSC)
2. Backend Cloud Functions handle off-chain logic and Safe interactions
3. Mobile app connects wallets and interfaces with both backend and contracts
4. Device approval happens automatically after successful wallet authentication
5. All admin actions (pool creation, member approval, loan decisions) go through multi-sig Safe

### Security Architecture

**Device Verification Flow:**

1. User attempts to access Firebase services (App Check token required)
2. If device not approved → authentication required
3. User authenticates with wallet signature
4. Upon successful wallet auth → device automatically approved
5. Future App Check tokens issued for approved devices only

**Collections:**

- `approved_devices` - Stores device-to-wallet mappings with approval timestamps
- `auth_nonces` - Time-limited nonces for wallet authentication (10 min expiry)
- `users` - User profiles linked to wallet addresses

## Environment Setup

**Critical Security Notes:**

- Never commit `.env` files or service account keys
- Use testnet keys only for development
- All production secrets managed via Firebase Functions config

**Required Environment Files:**

- `packages/contracts/.env` - Deployment keys, RPC URLs, Etherscan API key
- `packages/backend/.env` - Firebase config, contract addresses
- `apps/mobile/.env` - Public Firebase config, contract addresses
- `packages/backend/service-account-key.json` - Firebase Admin SDK (gitignored)

**API Keys and Contract Verification:**

- Get a single **Etherscan API key** from https://etherscan.io/apis (not Polygonscan)
- This unified API key works across all supported chains including Polygon (chain ID 137)
- Use `ETHERSCAN_API_KEY` in contracts/.env for Hardhat verification
- Etherscan API v2 provides multichain access - no separate Polygonscan key needed
- V1 API will be disabled after May 31, 2025 - all new integrations use v2

**Safe Multi-Sig Configuration:**

- `SAFE_OWNERS` - Comma-separated owner addresses (e.g., `0xAddr1,0xAddr2,0xAddr3`)
- `SAFE_THRESHOLD` - Required signatures (recommended: 2+ for testnet, 3+ for mainnet)
- `SAFE_SALT_NONCE` - Optional deterministic deployment nonce

## Development Workflow

### Local Smart Contract Development

#### Option 1: Pure Local Development (Fastest)

```bash
# Terminal 1: Start local Hardhat node
cd packages/contracts
pnpm node:local

# Terminal 2: Deploy contracts to localhost
pnpm deploy:local

# Terminal 3: Interactive testing
pnpm console:local
```

#### Option 2: Forked Network Development (Most Realistic)

```bash
# Terminal 1: Start forked node (requires POLYGON_AMOY_RPC_URL in .env)
cd packages/contracts
pnpm node:fork

# Terminal 2: Deploy to forked network
pnpm deploy:fork

# Terminal 3: Test against real network state
pnpm test:fork
```

#### Mobile App Integration with Local Network

The mobile app automatically includes localhost (chain ID 31337) in development mode:

- Network appears in wallet connection UI when `__DEV__` is true
- Connect to `http://127.0.0.1:8545` to interact with local contracts
- Deploy contracts locally first, then update mobile app with contract addresses
- Instant testing without testnet POL or network delays
- Full control over blockchain state for comprehensive testing scenarios

#### Advanced Local Development Features

- **Pre-funded Accounts**: 10 accounts with defined roles (deployer, pool owners, borrowers, lenders)
- **Sample Data**: 3 pools automatically created with different configurations
- **Interactive Guide**: Complete `INTERACTION_GUIDE.md` with examples for all interaction methods

### Testing Backend Functions

From the `packages/backend` directory:

1. Generate development keys: `pnpm generateKey`
2. Get auth message from `generateAuthMessage` function
3. Sign with `pnpm signMessage <nonce> <timestamp>`
4. Test authentication with `verifySignatureAndLogin`

**Note**: Keys are saved in `packages/backend/scripts/` and automatically ignored by git.

### Firebase Emulator Setup

```bash
cd packages/backend
pnpm serve  # Starts auth:9099, functions:5001, firestore:8080
```

### Safe Multi-Sig Testing Strategy

SuperPool uses a **hybrid testing approach** for Safe multi-signature wallet integration:

#### Local Development (Recommended for Daily Work)

```bash
pnpm test:local        # Fast contract testing without Safe dependency
pnpm demo:safe         # Educational Safe workflow demonstration
pnpm deploy:local      # Local deployment for frontend integration
```

**Benefits:**

- Instant feedback loop for development
- Tests all core contract functionality
- No external dependencies or rate limits
- Perfect for CI/CD and unit testing

#### Safe Integration (Production Validation)

```bash
pnpm safe:deploy:amoy  # Deploy Safe wallet on testnet
pnpm transfer:ownership:amoy  # Transfer PoolFactory ownership to Safe
```

**Use Cases:**

- Final production validation
- Multi-sig workflow testing
- Security model verification
- Testnet/mainnet deployment

#### Documentation

- See `packages/contracts/docs/HYBRID_TESTING_STRATEGY.md` for complete details
- Local testing covers 95% of development needs
- Safe integration reserved for production-critical validation

### Contract Development Best Practices

- **Local Testing**: Use `pnpm test:local` for fast development iteration
- **Safe Demo**: Use `pnpm demo:safe` to understand multi-sig workflow
- **Integration Testing**: Use forked networks when stable RPC access available
- **Mobile Testing**: Deploy locally with `pnpm deploy:local` for frontend integration
- **Pre-Production**: Deploy to Polygon Amoy with `pnpm deploy:amoy`
- **Verification**: Use Etherscan API v2 (supports Polygon chain ID 137)
- **Security**: Transfer ownership to multi-sig Safe post-deployment

## Shared Package Development

### Shared Assets (`@superpool/assets`)

Brand assets and media files:

- **Onboarding**: 4 illustration files showcasing core SuperPool features
- **Organization**: Structured directories (logos/, icons/, illustrations/, onboarding/)
- **Usage**: Direct imports or via `@superpool/assets/images/...` paths

### TypeScript Types (`@superpool/types`)

Comprehensive interfaces for type safety:

- **Authentication**: User, AuthNonce, ApprovedDevice, SignatureVerification
- **Lending**: LendingPool, Loan, Transaction, Member with status enums
- **Blockchain**: Chain configs, ContractConfig, WalletConnection, event types
- **API**: Request/response interfaces for all backend endpoints

## Key Technologies

- **Blockchain**: Solidity, Hardhat, OpenZeppelin, Multi-chain (Polygon, Ethereum, Arbitrum, Base, BSC)
- **Backend**: Firebase Cloud Functions, TypeScript, Ethers.js
- **Frontend**: Next.js 16, React Native, Expo, Wagmi, Viem, Reown AppKit
- **State Management**: MobX, mobx-react-lite for reactive state management
- **Styling**: Tailwind CSS v4 (web + mobile via Uniwind), shared design system
- **Icons**: FontAwesome (@expo/vector-icons for mobile)
- **Development**: pnpm workspaces, TypeScript project references, Jest

## Git & Version Control

Add and commit automatically whenever an entire task is finished
Use descriptive commit messages that capture the full scope of changes
Follow this pattern for all commits: `<type>(<scope>): <description>`

**Types:**

- `feat` - New features
- `fix` - Bug fixes
- `refactor` - Code refactoring
- `test` - Adding/updating tests
- `docs` - Documentation changes
- `chore` - Maintenance tasks

**Scopes:**

- `backend` - Backend/Cloud Functions changes
- `mobile` - Mobile app changes
- `contracts` - Smart contract changes
- `multi` - Changes affecting multiple packages
- `config` - Configuration changes

**Examples:**

```
feat(mobile): implement wallet connection with Reown AppKit
fix(backend): add nonce expiration to prevent authentication replay attacks
test(backend): add unit tests for all backend functions
refactor(contracts): reorganize contract structure for upgradability
```

## Multi-Sig Administration

Critical protocol actions require multi-sig approval:

- Pool creation via `PoolFactory`
- Pool parameter updates
- Emergency pause mechanisms
- All admin-level decisions go through Safe contracts for enhanced security

---

## Code Examples & Documentation

When users request code examples, setup instructions, configuration steps, or library/API documentation, use the **Ref MCP Server** to provide up-to-date, accurate information from official sources rather than potentially outdated examples.

## Sprint Planning & Feature Development

For sprint planning, feature prioritization, and development roadmap tasks, refer to [`docs/SPRINT_PLAN.md`](docs/SPRINT_PLAN.md).

## Pool Creation

For anything touching pool creation, indexing or pending transactions, read
[`docs/POOL_CREATION.md`](docs/POOL_CREATION.md) first. It documents the three
indexing paths, the idempotency guarantees, and the chain-shaped traps that
mocked tests do not catch.

## Contributions

For anything touching deposits or pool liquidity, read
[`docs/CONTRIBUTIONS.md`](docs/CONTRIBUTIONS.md). Note especially that liquidity
and balances are summed from events rather than stored, so nothing can fall out
of step with the chain.

## Membership

For anything touching who belongs to a pool, read
[`docs/MEMBERSHIP.md`](docs/MEMBERSHIP.md). The register is on chain now and is
**written on every deposit in both modes** — an open pool enrols whoever funds
it, a permissioned one requires `Active` first. That is what keeps one answer to
"is this address a member", and why an owner can close an open pool without
stranding anyone.

Two rules that are easy to break and hard to notice:

- **Never gate `withdraw` or `repayLoan` on membership.** Removal takes away
  what you may do next, not what you already put in. `PoolStore.activeMemberships`
  follows the same rule and keeps a removed member's position.
- **`memberships` and `memberRecords` are not interchangeable.** The first
  merges the register with the events and defaults an unswept contributor to
  active — right for showing someone their own position. The second is the
  register alone — right for anything the owner acts on, and the only one that
  can tell a rejected applicant from a stranger.

`requiresMembership` is `poolConfig[5]`. Read it from the chain, never from an
indexed pool record — the owner can change it at any moment and nothing indexes it.

## Loans

For anything touching borrowing, repayment, loan approval or the `loans`
collection, read [`docs/LOANS.md`](docs/LOANS.md). Note especially that a loan is
**not** an event like a contribution: one document is rewritten by every event
that touches it, and its state is read back from `getLoan` rather than inferred
from which log arrived — so re-indexing an old transaction reports the loan as it
is _now_.

Each pool chooses whether to review requests before lending
(`setRequiresApproval`, owner-only, **off by default**). With it on, `createLoan`
reverts and the flow is `requestLoan` → `approveLoan` / `rejectLoan`, plus
`cancelLoanRequest` for the borrower. Read that flag from the chain, never from
an indexed pool record — the owner can change it at any moment and nothing
indexes it.

Borrowing is gated on **membership**, not on having contributed: a member the
owner admitted can borrow without having lent first. See
[`docs/MEMBERSHIP.md`](docs/MEMBERSHIP.md).

`isRepaid` is meaningless unless `status` is `disbursed`: it is `false` on a
pending request too, so anything that reads it without checking `status` first
treats a request as an outstanding debt.

Borrowing history — what this project has instead of a reputation score — is in
the same document. `repaidAt` is the fact it is made of, and **zero means "no
date", never 1970**: on a loan that is still running, and on one settled before
the field existed. Two rules follow from it and are easy to get wrong: a
repayment with no date is neither on time nor late, and a wallet with no loans
is a **new** borrower rather than the worst kind. There is no score, deliberately.

## Interest

For anything touching what a member has earned, read
[`docs/INTEREST.md`](docs/INTEREST.md). Interest is distributed by an
accumulator rather than a loop — the pool keeps no member list to walk.

Three things that are easy to break:

- **The denominator is `totalContributions`, never `totalFunds`.** `totalFunds`
  falls when money is lent out, which is exactly when interest is earned, so
  using it pays roughly double on any pool with a loan outstanding — and no test
  where nothing is borrowed will notice.
- **Settle before any change to a stake, restamp after it.** That is what stops a
  deposit made after a repayment from earning a share of it.
- **Never gate `claimInterest` on membership or on an outstanding loan.**
  Interest is earned money, not the stake that borrowing locks. Removal and
  withdrawal both leave the accrual claimable.

`claimable(address)` is deliberately **not** capped by free liquidity, unlike
`withdrawableAmount` — an outstanding loan must not make an earnings figure
appear to shrink. The bound is applied by `claimInterest` at payout.

`PoolStore.totalEarned` is claims **plus** what `claimable` reports, added rather
than chosen between: claiming moves an amount from one to the other. Claims are
indexed; accrual is not an event at all and has to be read from the chain per
pool per wallet.

## Chains

The backend serves **every chain configured**, not one at a time. Configuration
is per chain, keyed by chain id in the variable name
(`POOL_FACTORY_ADDRESS_80002`, `RPC_URL_80002`, `START_BLOCK_80002`); the
factory address is what makes a chain servable. The legacy single-chain
`CHAIN_ID` / `RPC_URL` / `POOL_FACTORY_ADDRESS` triple still configures one
chain, because `pnpm deploy:local` prints those lines to paste after every
redeploy — the suffixed form wins for the same id.

This was `getChainConfig` matching a single `ACTIVE_CHAIN_CONFIG` until
2026-08-12, which is why the app's network picker was presentational: switching
networks made every callable answer `Unsupported chain ID`.

Two consequences worth holding on to:

- **Every feed is per chain, by construction.** Documents are keyed
  `${chainId}-…`, `listPools` and friends filter on it, and the sweep keeps a
  cursor per chain in `event_sync_state`. So a wallet on Amoy sees Amoy's pools
  and nothing else — including in Discover. A cross-chain view would be a
  deliberate feature, not a filter that was forgotten.
- **`NetworkBadge` goes one per screen, never one per card.** It follows from
  the line above: every list is already narrowed to the connected chain, so a
  badge on each card would repeat one fact as many times as there are pools.
  It sits on the Pools and Discover headers and beside the dashboard balance —
  which is a per-chain figure that reads as everything the user owns without
  it. The empty states name the chain for the same reason: with several
  networks configured, "no circles" is as likely to mean the wrong network as
  it is to mean nothing is there.
- **Anything that loads per chain must re-run when the chain changes.**
  `AuthLayout` depends on `authStore.chainId` as well as authentication;
  without that the store kept serving the chain the user had just left. Note
  `observer` wraps a component in `React.memo`, so a test that mocks a store as
  a plain object cannot exercise this — the mock has to be observable or the
  test passes either way.
- **The sweep walks the chains in turn and one failure does not stop the rest.**
  An unreachable public RPC is ordinary and must not silently stop localhost
  indexing too.

`ACTIVE_CHAIN_CONFIG` still exists for callers that have not moved; anything
reading it is by definition unable to serve a second chain.

## Notifications

Push goes through **Expo's push service**, not FCM: `firebase/messaging` in the
JS SDK is web-only, so the alternative was a second, native Firebase SDK beside
the one the app already uses. The backend gains no messaging dependency — it
POSTs to `exp.host`. `messagingSenderId` in the mobile Firebase config is inert.

Only two notifications exist, both **owner-facing**: somebody asked to join, and
somebody asked to borrow. They are the ones that cost the asker nothing to make
and the owner everything to miss. Plan and the reasoning for what is left out:
[`.dev/features/NOTIFICATIONS_PLAN.md`](.dev/features/NOTIFICATIONS_PLAN.md).

Four rules that are easy to break:

- **`stored` is not news.** The loan indexer rewrites a document when only its
  transaction reference moved to an earlier block, so triggering on `stored`
  would announce a request every time a sweep tidied up a hash. Notify on the
  `transition` the indexers now report, which is `null` for exactly that write.
- **Send at most once per (record, transition).** `syncPoolEvents` re-scans
  ranges deliberately and re-scanning genesis is supported, so `notifyOnce`
  claims a marker in `notifications_sent` with `create()` **before** sending.
  A thrown send releases the claim; a per-device rejection keeps it.
- **A token belongs to a device, a recipient is a wallet.** Send to every token
  for the wallet, and give the token back on disconnect _and_ on a wallet
  switch — otherwise the next wallet on that phone receives the previous one's
  requests. `push_tokens` is its own collection because
  `DeviceVerificationService.approveDevice` writes `approved_devices` with
  `set()` and no merge, which happens on every cold start.
- **The permission prompt is spent once.** Asked only after a pool is created,
  where the user has just built an expectation of being told something. Not
  when joining or borrowing: those askers have no notifications yet, so the
  prompt would buy a channel that delivers them nothing.

Dispatch is wired into `indexLoanFromLog` / `indexMembershipFromLog` rather than
the callables, so the sweep notifies too — a request made while the app was
closed is exactly the one the owner needs. Failures there are swallowed:
indexing is the job, push is an enhancement.

**Not verified end to end.** The emulator does not deliver push; the last mile
needs a dev build, an APNs key and an FCM v1 service account uploaded to EAS.

## Activity feeds

`ActivityRow` takes a `perspective`, and picking the wrong one marks money the
user received as negative. It follows from **who the feed is about**:

- **`pool`** (the default) for `pool/[id]`, which lists everything that happened
  to that pool including other members' — so "did this leave my wallet" is a
  question most of its rows cannot answer.
- **`wallet`** for the dashboard and activity tab, which are narrowed to the
  connected wallet by `PoolStore.myActivity`.

A feed that has not been narrowed must use `pool`. `PoolStore.recentTransactions`
is pool-wide by construction, because every source it merges covers all members.

## Discovery

The Pools and Discover tabs **partition** the chain's pools:
`PoolStore.discoverablePools` is defined as the complement of `myPools`, so one
rule decides both and nothing appears in both lists. That deliberately covers
more than membership — a pool the user has asked to join, been rejected from or
been removed from has a record, and all of them belong on the tab that can say
what happened rather than in a list of strangers.

Two things to keep in mind:

- **The list is one page, not the chain.** `listPools` has no text filter and
  Firestore cannot match a substring, so search is client-side over the newest
  `DEFAULT_PAGE_SIZE` (50) pools. Honest at this scale, wrong at a larger one;
  the fix is search tokens written onto the pool document by the indexer, not a
  bigger page.
- **Discover shows no open/private badge on purpose.** `requiresMembership` is
  `poolConfig[5]` and has to be read from the chain (see
  [Membership](#membership)) — one RPC call per card is not a price a scrolling
  list should pay. `pool/[id]` reads it and shows the right action there.

`DiscoverPoolCard` is separate from `PoolCard` because a non-member has no
position to report: its footer carries the pool's own size (liquidity and
`memberCountFor`) where `PoolCard` carries "your balance".

## UI & Frontend Interface Design

There is **no shared design package**. Each app owns its theme, and the two are
not interchangeable — they reuse some token names with different values, so
never copy a value across:

- **Mobile** ships the dark "Abyss & Aurora" theme. Tokens are in
  `apps/mobile/global.css` (Tailwind v4 `@theme`, applied via uniwind classNames)
  with raw values mirrored in `apps/mobile/src/constants/palette.ts` for props
  that cannot take a className. Match the surrounding screens.
- **Landing** has its own darker palette in `apps/landing/src/app/globals.css`
  (Tailwind v4, plain classNames).

Reconciling the two is the job of the workspace-level design overhaul
(`../DESIGN_OVERHAUL.md`); until then, follow whichever applies to the app you
are in rather than introducing a third.

## EXTREMELY IMPORTANT: Testing & Code Quality Requirements

### **MANDATORY: Test-Writer-Fixer Agent Usage**

**ALWAYS use the test-writer-fixer agent for ALL testing-related work:**

- **Creating tests** - New test files, test suites, or test cases
- **Updating tests** - Modifying existing tests or test configurations
- **Fixing tests** - Resolving test failures or debugging test issues
- **Improving tests** - Enhancing test coverage, performance, or reliability
- **Refactoring tests** - Restructuring test code or test organization
- **Cleaning up tests** - Removing deprecated tests or consolidating test files
- **Any other testing work** - Test utilities, mocks, test setup, etc.

The test-writer-fixer agent has comprehensive knowledge of all project-specific testing standards, mock systems, and documentation. It ensures consistency across all packages and applications.

**Usage**: Use the `Task` tool with `subagent_type: "test-writer-fixer"` for any testing task.

### **Code Quality Checks**

**ALWAYS execute the following commands IN ORDER before completing any task:**

1. **TypeScript Type Checking** (MANDATORY):
   - Run `pnpm type-check` in the specific package/app worked on
   - Fix ALL TypeScript errors before proceeding
   - NEVER use `any` or `unknown` types - always provide proper typing

2. **Code Formatting** (MANDATORY):
   - Run `pnpm format` in the specific package/app worked on
   - If working across multiple packages, run `pnpm format` from root
   - Ensure all code follows consistent formatting standards

3. **Linting** (MANDATORY):
   - Run `pnpm lint` in the specific package/app worked on
   - Fix ALL linting errors and warnings before proceeding
   - Follow ESLint rules and project coding standards
   - If any code was changed/fixed during linting, run step 2 (formatting) again to ensure proper formatting

**CRITICAL TypeScript Rule**: NEVER use `any` or `unknown` types when working with TypeScript/JavaScript. Always provide proper, specific typing for variables, function parameters, return types, and object properties.

These steps are MANDATORY and must NEVER be skipped when working on any code-related task.
