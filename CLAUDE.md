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

**The pool's owner is `Active` from the moment they own it** — granted in
`_transferOwnership`, so `initialize` and every later transfer both go through
it. Without that, the owner of a permissioned pool could not fund their own
pool. `removeMember` and `leavePool` refuse the owner for the same reason, and
`memberCount` therefore starts at 1.

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

**A loan can be paid down in instalments.** `repayLoan` takes any amount above
zero, credits it against `amount + interest` and refunds the rest; `amountRepaid`
is the running total and `isRepaid` still means the debt is closed. Three things
follow and are easy to break:

- **The loan closes on the payment that finishes it, and not before** — that one
  write sets `isRepaid`, stamps `repaidAt` and releases `activeLoanId`. Freeing
  the slot earlier would let a borrower who paid a wei open a second loan.
- **Each payment is its own record**, in `loan_repayments`, keyed on the log like
  a contribution. The loan holds a running total and one `repaidAt` dating only
  the payment that settled it, so a debt returned in four transactions has three
  dates that live nowhere else. The activity feed reads the payments, not the
  loan.
- **Interest is distributed pro rata to what has been paid**, as a difference of
  cumulative shares. Taking `payment × rate` instead would let a borrower change
  what lenders earn by choosing how to split.

**Interest accrues per second**, on the principal still out, at
`rate × elapsed / duration`. `interestRate` still means the price of one full
term — so no pool, screen or stored figure had to be reinterpreted — but the
price is now charged by the second. Four things follow:

- **The clock does not stop at the due date.** Twice the term costs twice the
  rate, uncapped. Not a penalty: the same price applied to more time. Capping
  would be the invented rule, and it would make time free once a loan is late.
- **Paying principal down makes the rest cheaper**, which is the point.
  A payment settles accrued interest first, then principal.
- **Three figures, not one.** `calculateRepaymentAmount` is the term's price and
  never moves; `outstandingBalance` is what is owed now; `loanBalance` splits
  that into principal and interest. Only the first is a quote.
- **Sending exactly `outstandingBalance` does not settle a loan** — a block
  passes and a sliver more accrues, so the payment succeeds and the debt
  survives. Quote ahead with `outstandingBalanceAt` and let the refund return
  the difference; the app uses an hour.

A loan made before accrual reads its new fields as zero and is converted on
first touch, on the flat terms it was made under, with accrual starting from the
conversion rather than from `startTime`. In the index that shows up as an
**absent** `accruedAt`, which means "these figures are static", not "unknown".

`PoolStore.accruedInterestNow` projects the indexed snapshot for display and
runs on the device clock. Anything about to send money reads the chain.

**Late and in default are different questions, and conflating them is the bug.**
_Overdue_ is `startedAt + duration` against a clock — arithmetic, true of plenty
of loans nobody minds about, and **stored nowhere**, because anyone can work it
out. _In default_ is the owner saying so: `markDefaulted`, owner-only, stamped
with `defaultedAt`. The chain records what only the chain can witness.

A declaration is a **label, not an ending**, and five things follow that are
each their own silent bug if missed:

- **A defaulted loan is still an open debt.** `outstandingBalance`,
  `loanBalance`, `_repay`, `listLoans`'s `activeOnly` and
  `PoolStore.activeLoanFor` all admit it. Gating any of them on `Disbursed`
  alone reports the debt as **zero** and takes it off the borrower's repay
  screen at the moment it was declared.
- **Interest keeps accruing**, at the same uncapped rate. There is no penalty
  rate and no liquidation; nothing is seized, because there is no collateral.
- **The borrower's `activeLoanId` is not released.** `rejectLoan` frees it
  because a request took nothing; this has money out, and freeing it would let a
  defaulter borrow again from the pool they are in default to.
- **There is no `unmarkDefaulted`.** A loan paid off afterwards keeps
  `Defaulted` and gains `isRepaid` — that pair is what "recovered" means, and it
  is a different fact from never having been late.
- **`defaultGracePeriod` is `poolConfig`-shaped in spirit: read it from the
  chain, never from an indexed record.** Owner-settable, zero by default, and
  `defaultableAt(loanId)` is the date a screen should quote.

`sendDueReminders` is the only scheduled notification in the project — a term
lapsing emits no event — and it **judges on chain time, not server time**. One
`getBlock('latest')` per chain per run; comparing a block timestamp against
`Date.now()` reports every loan on a local node as comfortably inside its term.
At most one due-soon and one overdue reminder per loan, ever.

Borrowing history — what this project has instead of a reputation score — is in
the same document. `repaidAt` is the fact it is made of, and **zero means "no
date", never 1970**: on a loan that is still running, and on one settled before
the field existed. Two rules follow from it and are easy to get wrong: a
repayment with no date is neither on time nor late, and a wallet with no loans
is a **new** borrower rather than the worst kind. There is no score, deliberately. `BorrowerHistory.defaulted` counts declarations
over a wallet's whole record, settled or not; **nothing gates on it**, and the
enforcing half stays unbuilt on purpose.

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

## Denominations

A pool lends **one asset**, chosen at creation and never changed —
`PoolConfig.loanToken`, where **`address(0)` means native POL**. That is the
zero value, so every pool made before the field existed is native with no
migration: the same retrofit as `LoanStatus.Disbursed = 0` and
`requiresApproval = false`. There is no setter, deliberately; re-denominating a
pool would reinterpret every `contributions` entry and every outstanding debt as
a quantity of something else.

Plan and the reasoning behind each decision:
[`.dev/contracts/ERC20_PLAN.md`](.dev/contracts/ERC20_PLAN.md). All five phases
are built and verified against a live node with
`pnpm --filter backend testErc20`.

**Formatting is three-way, and collapsing it to two is a factor-of-10¹² bug.**
`PoolInfo` carries `loanToken`, `tokenSymbol` and `tokenDecimals`:

- `loanToken` is the zero address → **native**. 18 decimals, and the symbol
  comes from the app's own chain config — POL on Polygon, ETH on Base, BNB on
  BSC. A native pool deliberately carries **no `tokenSymbol`**, because the
  native symbol belongs to the chain and writing one would put POL on a Base
  pool.
- `loanToken` is set and `tokenDecimals` is a number → **a token pool.**
- `loanToken` is set and `tokenDecimals` is **absent** → the backend could not
  read the token. Show the pool as **unsupported**. Never fall back to 18, which
  renders 5 USDC as 5,000,000,000,000.

Four more rules that are easy to break:

- **The token entry points are `depositTokens` and `repayLoanWithTokens`, not
  overloads of `depositFunds` / `repayLoan`.** Solidity accepts the overloads,
  but ethers then refuses to resolve either bare name — _ambiguous function
  description_ — breaking every existing native call site in the backend, the
  scripts and the tests. Do not "tidy" them back into overloads.
- **Credit the balance delta, never the requested amount.** A fee-on-transfer
  token delivers less than it was asked for, and crediting the request inflates
  `totalContributions` — the denominator every interest distribution divides by
  — diluting every other lender for the life of the pool, invisibly.
- **A token repayment needs no refund and no settlement buffer**, unlike the
  native one. The pool pulls `min(_amount, outstanding)` priced at execution
  time, so `_amount` only has to be _big enough_; the head-room moved to the
  allowance, where it costs the borrower nothing. Keep `_amount` explicit —
  inferring it from the allowance would let a leftover approval decide how much
  a later repayment took.
- **`tokenDecimals` is safe to store; almost nothing else read from a contract
  is.** Decimals and symbol are immutable for a token's lifetime. Contrast
  `requiresMembership`, which the owner can change at any moment and which must
  therefore always be read from the chain.

`PoolFactory` gates creation on an owner-curated allowlist
(`setLoanTokenAuthorization`); `address(0)` is never on it and never needs to
be — `isAuthorizedLoanToken` answers `true` for it, so a caller checking before
creating need not special-case the one denomination that needs no permission.
Disallowing a token does **not** reach back to pools already holding balances in
it — that would strand both sides of a live loan.

### In the app

`utils/denomination.ts` is the single place a `PoolInfo` becomes a symbol and an
exponent. `formatToken(amount, decimals)` and `parseToken(value, decimals)`
both **require** the exponent; `formatAmount(amount, denomination)` adds the
symbol and renders a dash where the denomination is unknown, so the three-way
rule is applied once rather than at every call site.

Four rules that are easy to break:

- **Funding or repaying a token pool is two transactions.** The approval is a
  stage in the screen's own state machine (`useTokenApproval`), not a pending
  transaction: it displays nothing and has nothing to recover into. The
  allowance is read on submit, so a flow abandoned between the two resumes at
  the second. **Never approve `type(uint256).max`** — a bug in the pool would
  reach the member's whole balance.
- **Never sum balances across pools.** `PoolStore.balancesByDenomination`
  reports one figure per unit; `totalBalance` and `totalEarned` are native-only
  because the dashboard's headline is. Adding a USDC balance to a POL one is
  wrong by whatever the rate happens to be, and wrong silently — the app has no
  price oracle, deliberately.
- **The wallet-balance check reads the pool's asset.** `useBalance` returns the
  chain's coin only, so a token pool reads `balanceOf` itself; otherwise a
  wallet holding POL and no USDC is told it can fund a USDC pool.
- **The token allowlist is per chain and configured**
  (`config/tokens.ts`, from `EXPO_PUBLIC_USDC_ADDRESS_*`). Empty is normal: the
  create form then offers native alone, with no picker. `deploy:local` deploys a
  six-decimal mock and prints its address, and its address changes on every
  redeploy exactly as the factory's does.

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

Notifications come in three groups. Two are **owner-facing** — somebody asked to
join, somebody asked to borrow — and they are the reason the feature exists: they
cost the asker nothing to make and the owner everything to miss. Five are
**borrower-facing** answers to those questions (`loan_approved`,
`loan_rejected`, `loan_defaulted`, `membership_approved`,
`membership_rejected`). Two more come from the **clock** rather than from anyone
(`loan_due_soon`, `loan_overdue`); see [Loans](#loans). Plan and the reasoning
for what is left out:
[`.dev/features/NOTIFICATIONS_PLAN.md`](.dev/features/NOTIFICATIONS_PLAN.md).

Deliberately absent: being **removed** from a pool, which is not a decision on
anything the member asked for, and **leaving**, which is self-authored.

Five rules that are easy to break:

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

- **A rejection and a cancellation are the same state.** `cancelLoanRequest`
  emits `LoanRejected` and leaves the loan exactly as `rejectLoan` does, so the
  record cannot tell them apart and the **transaction's sender** has to —
  `notifyLoanDecided` reads it, on the rejected path only, and fails closed. A
  borrower told they were declined when they withdrew it themselves is worse
  than silence. For the same reason the loan indexer reports `approved` and
  `disbursed` as different transitions: both end at `disbursed`, but only one is
  an answer to somebody.

Dispatch is wired into `indexLoanFromLog` / `indexMembershipFromLog` rather than
the callables, so the sweep notifies too — a request made while the app was
closed is exactly the one the owner needs. Failures there are swallowed:
indexing is the job, push is an enhancement. The two clock-driven reminders are
the exception: they come from `sendDueReminders`, a schedule, because nothing on
chain fires when a term lapses.

**Not verified end to end.** The emulator does not deliver push; the last mile
needs a dev build, an APNs key and an FCM v1 service account uploaded to EAS.

## Notes

Why a loan was wanted, and why a decision went the way it did. Three
deferrals — a membership reason (Sprint 4), a loan purpose (Sprint 6), a
decision reason (Sprint 10) — were one missing mechanism, built together on
2026-08-18. Plan and the reasoning for each decision:
[`.dev/old/NOTES_PLAN.md`](.dev/old/NOTES_PLAN.md). Verified live
with `pnpm --filter backend testNotes` (26 checks).

**A note is never load-bearing.** Nothing in the protocol, the indexer or an
eligibility check may read one to decide anything. The indexer moves one and
the notification service quotes one; neither branches on what it says. If a
note ever gates a transaction, this design is wrong.

Nothing here is on chain, and that is the point rather than a saving: free
text costs gas forever on a product whose amounts are small by definition, and
**permanence is a misfeature** for a sentence about a person — on chain a
rejection reason is public and unretractable to everyone, where in Firestore
it is visible to the two parties and can be deleted if it turns out to be
abusive.

Six rules that are easy to break:

- **Keyed on (record id, outcome), never on a transaction hash.**
  `notes/${recordId}:${kind}`, mirroring `notificationKey`. `indexLoan` moves
  a loan's `transactionHash` to the earliest event that dates it, and
  `approveLoan` rewrites `startTime` — so a purpose keyed to the requesting
  transaction attaches correctly right up until the loan is approved, then
  **silently** detaches. Keying on the outcome rather than on "a decision" is
  what also makes a stale reason invisible: the owner types theirs _before_
  sending, so one they thought better of sits under a key nobody asks for.
- **Written before the transaction, so the push can carry it.** That ordering
  is the whole value of the feature — a refusal with a reason is a different
  thing from a refusal. It is also why a decision note keys on a record that
  already exists, and why a _purpose_ cannot: the contract assigns the loan id
  when the transaction is mined. A purpose is therefore **staged** in
  `staged_notes` under `tx:${chainId}:${txHash}` and moved by
  `indexLoanFromLog`, on the two transitions that create a loan and nowhere
  else. That also means the sweep attaches it, so a phone that dies mid-flow
  still gets its purpose across.
- **Write-once, through `create()`.** A reason that can be rewritten after the
  borrower has read it is a draft, not a record of what was said. There is no
  edit and no delete; deletion is an operator action through the console,
  which is the right weight for the one case that justifies it.
- **Backend-only in both directions, unlike every other collection here.**
  `notes` is the first one that does not mirror the chain, so "public because
  the chain is public" — the reasoning behind every other read rule — does not
  apply. Reads go through `listNotes`: a pool's owner sees the notes on their
  pool, everybody else sees the notes about themselves, and an unentitled
  caller gets an **empty list rather than an error**, because refusing would
  confirm a note exists. Other members of a pool are excluded deliberately;
  widening that later is a one-line change, narrowing it after people have
  written things is not.
- **A staged note's entitlement cannot be checked when it is written**, because
  its loan does not exist. What is stored is a claim on a transaction hash,
  honoured by `resolveStagedNote` only if that transaction turns out to have
  produced the claimant's own loan. Every other kind is checked against the
  indexed record, and the author always comes from `request.auth.uid`.
- **Nothing is ever required.** A mandatory purpose turns a working borrow flow
  into a form; a mandatory reason has owners typing "no" to get past it, which
  is worse than the silence it replaced.

**A removal reason reaches nobody by push**, and that is not an oversight:
being removed is not a decision on anything the member asked for, so it has no
notification (see [Notifications](#notifications)). It waits on `pool/[id]`
until they next open it — still more than the nothing they were told before.

Deliberately absent, so it is not re-proposed: no editing, no deletion, no
threads or replies, no notes on contributions, withdrawals or repayments, no
moderation, and no note anywhere in the protocol.

## Assessment

The assistant's reading of a loan request, for the pool owner deciding on it.
Sprint 6's AI half and the two blocked parts of Sprint 10, built 2026-08-18 on
[Mastra](https://mastra.ai). Plan and the reasoning for every decision:
[`.dev/features/AI_ASSESSMENT_PLAN.md`](.dev/features/AI_ASSESSMENT_PLAN.md).
Verified with `pnpm --filter backend testAssessment` (17 checks, real model
calls) and `pnpm --filter agents eval` (7 cases, 4 gates).

**An assessment is never load-bearing** — the same rule notes ship under, and
for a stronger reason. Nothing in the protocol, the indexer or an eligibility
check may read one. There is no auto-approval and no setting that would add
one. If an assessment ever gates a transaction, this design is wrong.

**It is not there to reveal a fact.** The owner can already see the amount, the
term price, the record and the purpose — all four are on the card. It exists to
do the reading nobody has time for with six requests waiting.

### Where it runs

`packages/agents` is a Mastra service, packaged and deployed like
`superwallet/packages/agents` — but **its only client is `packages/backend`,
never the app**. The backend gathers the facts, checks the caller owns the
pool, and calls the agent over HTTP with a short-lived HS256 service token
(`MastraJwtAuth`, shared `MASTRA_JWT_SECRET`). So `packages/agents` reads no
Firestore, no chain, and nothing about a pool or a wallet — if it ever needs
to, the entitlement rules have leaked into a second place.

`ANTHROPIC_API_KEY` lives with the agent and nowhere else: exactly one thing
can spend it.

Seven rules that are easy to break:

- **Bands, never a score.** `low | medium | high`, which cannot be averaged,
  sorted or thresholded into a gate. A 0–100 number would read as a credit
  rating, which is the product [`REPUTATION_PLAN`](.dev/old/REPUTATION_PLAN.md)
  §7 refused to build — a model producing it does not make it a different
  thing.
- **No recommendation field, ever.** It says what it notices; the button is the
  owner's. A `recommendation: 'approve'` is one product decision away from
  being the button.
- **A first-time borrower is new, not risky.** `isNew` must never on its own
  produce `high`. Stated in the instructions _and_ in the facts prose, and
  gated by an eval — it is the one failure that would make the app unusable for
  exactly the people it exists for.
- **Nothing is said about the person.** Only the request, the pool and the
  wallet's counts. A purpose like "rent is due" invites a reading of somebody's
  life, and the model knows nothing of it. An LLM judge gates this, because the
  failure is a tone rather than a word.
- **The owner alone may read one.** Narrower than a note, deliberately: a note
  is a sentence a person stood behind, so its subject deserves it; this is a
  machine's reading of somebody's record, and showing it to them turns a
  lending decision into an argument with a model nobody can answer for.
  `getAssessment` answers _nothing_ rather than refusing — an error would
  confirm one exists.
- **Stored once, read back.** An LLM judgement is not reproducible, so a
  decision surface that recomputed on every open would say something different
  each time. Recomputed only on the owner's explicit ask, or when liquidity has
  drifted 25% — `approveLoan` checks liquidity at approval, not at request
  time, so that is the figure that moves under a stored reading.
- **Do not put character caps on model prose.** A `.max(140)` per observation
  cost a whole reading the first time a model wrote 141: structured-output
  validation rejects the _entire_ response, and the owner sees nothing for a
  reading that was fine. Brevity belongs in the instructions. Array counts are
  fine — those are structural.

Every figure reaches the agent in **whole units, formatted by the backend** —
never wei, and never with the exponent left for it to apply. A pool whose token
the backend could not read is refused outright rather than defaulting to 18.

### Deliberately not built

No score. No recommendation. Nothing shown to the borrower. No assessment of
membership requests — that is a judgement about a person with no transaction
attached. No chat: the `questions` field exists so the owner asks the
**borrower**, which is the conversation that should be happening. No
cross-chain reading. And no dataset of decisions fed back into the model, which
is how an advisory feature quietly becomes a scoring system nobody chose.

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

Repayment rows come from `PoolStore.loanRepaymentActivity` — the indexed
`LoanRepaymentMade` logs — and **not** from the loan record. Deriving them there
gave one row per settled loan carrying the whole debt, which stopped being true
the moment a loan could be paid in parts.

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
