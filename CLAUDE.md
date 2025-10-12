# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SuperPool is a proof-of-concept multi-chain decentralized micro-lending platform under active development. It's a monorepo with shared packages for consistent development across multiple EVM-compatible blockchains:

### Applications

- **Landing Page** (`apps/landing/`) - Next.js 15.5.0 marketing website
- **Mobile App** (`apps/mobile/`) - React Native/Expo app with wallet integration

### Core Services

- **Smart Contracts** (`packages/contracts/`) - Solidity contracts for lending pools
- **Backend** (`packages/backend/`) - Firebase Cloud Functions for off-chain logic

### Shared Packages

- **Design System** (`packages/design/`) - Design tokens, colors, typography, Tailwind config
- **Assets** (`packages/assets/`) - Brand assets, illustrations, onboarding images
- **UI Components** (`packages/ui/`) - Reusable React components (Button, Card, Input)
- **Types** (`packages/types/`) - Shared TypeScript interfaces for all applications

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

#### Design System (`packages/design/`)

```bash
# No build needed - contains CSS tokens and Tailwind config
# Used by importing: @superpool/design/tokens.css
```

#### Assets (`packages/assets/`)

```bash
# No build needed - contains static assets
# Used by importing: @superpool/assets/images/...
```

#### UI Components (`packages/ui/`)

```bash
pnpm build           # Build components library
pnpm dev             # Watch mode for development
pnpm type-check      # TypeScript type checking
pnpm lint            # ESLint
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
- [UI Components](packages/ui/README.md) | [Types](packages/types/README.md) | [Design System](packages/design/README.md) | [Assets](packages/assets/README.md)

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

- **Design System** (`@superpool/design`): DeFi Blue palette, Contemporary Tech typography, Tailwind configuration
- **Assets** (`@superpool/assets`): Onboarding illustrations, brand assets, shared media
- **UI Components** (`@superpool/ui`): Button, Card, Input components with TypeScript support
- **Types** (`@superpool/types`): Authentication, lending, blockchain, and API interfaces

**Landing Page** (Next.js 15.5.0):

- **Framework**: Next.js with App Router and React 19 support
- **Styling**: Tailwind CSS v4 with shared design system integration
- **Components**: Uses shared UI components from `@superpool/ui`
- **Features**: Responsive design showcasing SuperPool's 4 core features

**Mobile Application:**

- **Wallet Integration**: Reown AppKit with WalletConnect for multi-wallet support (500+ wallets)
- **State Management**: MobX reactive stores with centralized state management
- **Styling**: NativeWind for Tailwind CSS compatibility with shared design tokens
- **Icons**: FontAwesome via `@expo/vector-icons` (wallet, users, shield, etc.)
- **Chain Support**: Ethereum Mainnet, Polygon, Arbitrum, Base, BSC, Polygon Amoy, Localhost (dev mode)
- **Firebase Integration**: Authentication, Firestore, Cloud Functions
- **Architecture**: Expo Router with TypeScript and shared type definitions
- **Store Architecture**: AuthenticationStore, WalletConnectionStore, PoolManagementStore, RootStore pattern
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

- **Test Utilities**: Use `scripts/test-utils.ts` for comprehensive testing helpers
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

### Design System (`@superpool/design`)

Contains the core design tokens and configurations:

- **Colors**: DeFi Blue palette (#2563eb primary, #06b6d4 accent, #0f172a secondary)
- **Typography**: Plus Jakarta Sans (primary), Space Mono (monospace), Geist (accent)
- **Tailwind Config**: Shared configuration extending base design tokens
- **Usage**: Import `@superpool/design/tokens.css` and extend Tailwind config

### UI Components (`@superpool/ui`)

Reusable React components with consistent styling:

- **Button**: Multiple variants (primary, secondary, ghost), sizes, loading states
- **Card**: Container component with header, content, footer sub-components
- **Input**: Form inputs with validation states and addon support
- **Usage**: `import { Button, Card, Input } from '@superpool/ui'`

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
- **Frontend**: Next.js 15.5.0, React Native, Expo, Wagmi, Viem, Reown AppKit
- **State Management**: MobX, mobx-react-lite for reactive state management
- **Styling**: Tailwind CSS v4, NativeWind, shared design system
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

## UI & Frontend Interface Design

For UI & frontend interface design tasks, refer to the comprehensive guidelines in [`docs/SUPERDESIGN.md`](docs/SUPERDESIGN.md).

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
