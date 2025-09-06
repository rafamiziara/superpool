# SuperPool Project Structure

This document provides a comprehensive overview of the SuperPool monorepo structure, detailing the organization, purpose, and relationships between all components.

## Overview

SuperPool is organized as a **pnpm workspace monorepo** with applications and shared packages. The structure follows modern monorepo patterns with TypeScript project references and workspace protocol dependencies.

```
superpool/
├── apps/                           # Applications
│   ├── landing/                    # Next.js marketing website
│   └── mobile/                     # React Native/Expo mobile app
├── packages/                       # Shared packages
│   ├── assets/                     # Brand assets and media
│   ├── backend/                    # Firebase Cloud Functions
│   ├── contracts/                  # Smart contracts
│   ├── design/                     # Design system tokens
│   ├── types/                      # Shared TypeScript types
│   └── ui/                         # Reusable UI components
├── docs/                           # Project documentation
├── coverage/                       # Test coverage reports
└── scripts/                        # Development utilities
```

## Root Configuration

### Core Files

- **`package.json`** - Root workspace configuration with pnpm workspaces
- **`pnpm-workspace.yaml`** - Defines workspace packages
- **`tsconfig.json`** - TypeScript root configuration with project references
- **`firebase.json`** - Firebase project configuration (Functions, Firestore, emulators)
- **`.gitignore`** - Git ignore patterns for all packages
- **`CLAUDE.md`** - Development guidelines and commands

### Development Infrastructure

- **`.github/`** - GitHub workflows and templates
- **`.vscode/`** - VS Code settings and extensions configuration
- **`.claude/`** - Claude Code specific configuration (tracked except \*.local.json)

## Applications (`apps/`)

### Landing Page (`apps/landing/`)

**Purpose**: Marketing website showcasing SuperPool's features and onboarding flow.

```
apps/landing/
├── src/
│   ├── app/                        # Next.js App Router pages
│   ├── components/                 # Page-specific components
│   └── lib/                        # Utilities and configurations
├── public/                         # Static assets
├── package.json                    # Dependencies and scripts
├── next.config.js                  # Next.js configuration
├── tailwind.config.js              # Extends @superpool/design
└── tsconfig.json                   # TypeScript configuration
```

**Key Technologies**:

- Next.js 15.5.0 with App Router
- React 19 support
- Tailwind CSS v4 with shared design system
- TypeScript with strict mode

**Dependencies**:

- `@superpool/ui` - Shared components
- `@superpool/design` - Design tokens
- `@superpool/assets` - Brand assets
- `@superpool/types` - Type definitions

### Mobile App (`apps/mobile/`)

**Purpose**: React Native mobile application with wallet integration and lending functionality.

```
apps/mobile/
├── src/
│   ├── app/                        # Expo Router pages
│   ├── components/                 # Mobile-specific components
│   ├── stores/                     # MobX state management
│   ├── services/                   # API and blockchain services
│   └── config/                     # App configuration
├── assets/                         # Mobile-specific assets
├── package.json                    # Dependencies and scripts
├── app.json                        # Expo configuration
├── babel.config.js                 # Babel configuration
└── tsconfig.json                   # TypeScript configuration
```

**Key Technologies**:

- React Native with Expo Router
- MobX for state management (mobx-react-lite)
- Reown AppKit for wallet connections
- NativeWind for Tailwind CSS compatibility
- FontAwesome icons via @expo/vector-icons

**State Management Architecture**:

- `AuthenticationStore` - User auth and wallet connection
- `WalletConnectionStore` - Blockchain interactions
- `PoolManagementStore` - Lending pool operations
- `RootStore` - Store composition and context provider

**Dependencies**:

- `@superpool/ui` - Shared components (adapted for mobile)
- `@superpool/design` - Design tokens
- `@superpool/assets` - Brand assets and onboarding illustrations
- `@superpool/types` - Type definitions

## Shared Packages (`packages/`)

### Smart Contracts (`packages/contracts/`)

**Purpose**: Solidity smart contracts for decentralized lending pools with multi-sig administration.

```
packages/contracts/
├── contracts/                      # Solidity source files
│   ├── PoolFactory.sol            # Main factory contract
│   ├── LendingPool.sol            # Individual pool logic
│   └── interfaces/                # Contract interfaces
├── scripts/                       # Deployment and interaction scripts
├── test/                          # Comprehensive test suite
├── docs/                          # Contract documentation
├── deployments/                   # Deployment artifacts (gitignored)
├── hardhat.config.ts              # Hardhat configuration
└── package.json                   # Dependencies and npm scripts
```

**Key Features**:

- Upgradeable proxy pattern
- Multi-sig Safe integration
- Emergency pause mechanisms
- Comprehensive test coverage

**Development Commands**:

- Local: `pnpm node:local`, `pnpm deploy:local`
- Forked: `pnpm node:fork`, `pnpm deploy:fork`
- Testing: `pnpm test`, `pnpm test:gas`, `pnpm coverage`
- Production: `pnpm deploy:amoy`

### Backend Services (`packages/backend/`)

**Purpose**: Firebase Cloud Functions for off-chain logic, authentication, and blockchain event monitoring.

```
packages/backend/
├── src/
│   ├── functions/                  # Cloud Function implementations
│   │   ├── auth/                  # Authentication functions
│   │   ├── appcheck/              # App Check token verification
│   │   └── events/                # Blockchain event listeners
│   ├── types/                     # Backend-specific types
│   └── utils/                     # Shared utilities
├── test/                          # Jest test suite
├── service-account-key.json       # Firebase Admin SDK (gitignored)
└── package.json                   # Dependencies and scripts
```

**Core Functions**:

- `generateAuthMessage` - Wallet authentication challenges
- `verifySignatureAndLogin` - Signature verification and user creation
- `mintAppCheckToken` - Device verification tokens
- Event listeners for pool creation, loans, and member management

**Security Architecture**:

- Device approval system
- Nonce-based authentication (10min expiry)
- App Check integration for request validation

### Design System (`packages/design/`)

**Purpose**: Centralized design tokens, colors, typography, and Tailwind configuration.

```
packages/design/
├── tokens.css                     # CSS custom properties
├── tailwind.config.js             # Base Tailwind configuration
├── colors.js                      # Color palette definitions
├── typography.js                  # Font and sizing tokens
└── package.json                   # Package metadata
```

**Design Tokens**:

- **Colors**: DeFi Blue palette (#2563eb primary, #06b6d4 accent, #0f172a secondary)
- **Typography**: Plus Jakarta Sans (primary), Space Mono (monospace), Geist (accent)
- **Spacing**: Consistent scale for margins, padding, and layouts
- **Breakpoints**: Responsive design breakpoints

**Usage Pattern**:

```javascript
// In consuming packages
import '@superpool/design/tokens.css'
// Extend tailwind config
module.exports = {
  presets: [require('@superpool/design/tailwind.config.js')],
  // Additional configuration
}
```

### Shared Assets (`packages/assets/`)

**Purpose**: Brand assets, illustrations, and media files used across applications.

```
packages/assets/
├── images/
│   ├── logos/                     # SuperPool branding
│   ├── icons/                     # UI icons and symbols
│   ├── illustrations/             # Feature illustrations
│   └── onboarding/                # Mobile onboarding flow images
├── fonts/                         # Custom font files (if any)
└── package.json                   # Package metadata
```

**Asset Categories**:

- **Onboarding**: 4 illustrations showcasing core SuperPool features
- **Branding**: Logos, wordmarks, and brand elements
- **Icons**: Functional icons for UI components
- **Illustrations**: Feature explanations and empty states

**Usage Pattern**:

```javascript
// Direct imports
import heroImage from '@superpool/assets/images/illustrations/hero.png'
// Or via path reference
;<img src="@superpool/assets/images/onboarding/step1.png" />
```

### UI Components (`packages/ui/`)

**Purpose**: Reusable React components with consistent styling and behavior.

```
packages/ui/
├── src/
│   ├── components/
│   │   ├── Button/                # Button component with variants
│   │   ├── Card/                  # Container component
│   │   ├── Input/                 # Form input component
│   │   └── index.ts               # Component exports
│   ├── types/                     # Component prop types
│   └── utils/                     # Component utilities
├── dist/                          # Built components (gitignored)
├── package.json                   # Dependencies and build scripts
└── tsconfig.json                  # TypeScript configuration
```

**Component Library**:

- **Button**: Multiple variants (primary, secondary, ghost), sizes, loading states
- **Card**: Container with header, content, footer sub-components
- **Input**: Form inputs with validation states and addon support

**Build System**:

- TypeScript compilation with declaration files
- CSS processing for component styles
- Watch mode for development (`pnpm dev`)

### TypeScript Types (`packages/types/`)

**Purpose**: Shared TypeScript interfaces and type definitions for all applications.

```
packages/types/
├── src/
│   ├── auth.ts                    # Authentication types
│   ├── lending.ts                 # Lending and pool types
│   ├── blockchain.ts              # Blockchain and contract types
│   ├── api.ts                     # API request/response types
│   └── index.ts                   # Type exports
├── dist/                          # Built types (gitignored)
└── package.json                   # Dependencies and build scripts
```

**Type Categories**:

- **Authentication**: User, AuthNonce, ApprovedDevice, SignatureVerification
- **Lending**: LendingPool, Loan, Transaction, Member with status enums
- **Blockchain**: Chain configs, ContractConfig, WalletConnection, event types
- **API**: Request/response interfaces for all backend endpoints

## Documentation (`docs/`)

### Documentation Files

- **`SPRINT_PLAN.md`** - Development roadmap and sprint planning
- **`SUPERDESIGN.md`** - UI/UX design guidelines and component specifications
- **`PROJECT_STRUCTURE.md`** - This file - comprehensive project structure documentation
- **`ROADMAP.md`** - Long-term project roadmap and feature planning

## Development Infrastructure

### Coverage Reports (`coverage/`)

Aggregated test coverage from all packages:

```
coverage/
├── mobile/                        # Mobile app coverage
├── contracts/                     # Smart contract coverage
├── backend/                       # Backend function coverage
└── merged/                        # Combined coverage report
```

### Development Scripts (`scripts/`)

Utility scripts for development and testing:

- `merge-coverage.js` - Combines coverage from all packages
- `test-utils.ts` - Shared testing utilities
- Wallet management utilities for development

## Dependency Management

### Workspace Protocol

All internal dependencies use `workspace:*` protocol:

```json
{
  "dependencies": {
    "@superpool/ui": "workspace:*",
    "@superpool/types": "workspace:*",
    "@superpool/design": "workspace:*"
  }
}
```

### TypeScript Project References

Coordinated builds and type checking across packages:

```json
{
  "references": [{ "path": "./packages/types" }, { "path": "./packages/ui" }, { "path": "./apps/landing" }, { "path": "./apps/mobile" }]
}
```

## Build and Development Flow

### Development Workflow

1. **Install Dependencies**: `pnpm install` (root level)
2. **Build Shared Packages**: Automatic via TypeScript project references
3. **Start Development**: Package-specific commands (see CLAUDE.md)

### Package Build Order

1. **types** - Base type definitions
2. **design** - Design tokens and configuration
3. **assets** - Static assets (no build required)
4. **ui** - React components (depends on types, design)
5. **contracts** - Smart contracts (independent)
6. **backend** - Cloud Functions (depends on types)
7. **Applications** - Landing page and mobile app (depend on all shared packages)

### Testing Strategy

- **Unit Tests**: Each package maintains its own test suite
- **Integration Tests**: Cross-package functionality testing
- **Coverage**: Aggregated coverage reports with merge tooling
- **CI/CD**: Automated testing on all packages

## Security Considerations

### Gitignore Patterns

- Environment files (`.env*`)
- Service account keys
- Private keys and wallet information
- Build artifacts and caches
- Coverage reports (but keep structure)

### Environment Management

- Development: Local `.env` files (gitignored)
- Production: Firebase Functions configuration
- API Keys: Centralized in contracts package
- Service Keys: Firebase Admin SDK (gitignored)

## Future Expansion

The monorepo structure supports easy addition of:

- **New Applications**: Additional apps/ entries
- **Shared Packages**: New packages/ for utilities, hooks, etc.
- **Testing Tools**: Dedicated testing package
- **Documentation Tools**: Storybook or similar for component documentation
- **CLI Tools**: Command-line utilities for development

This structure ensures maintainability, type safety, and consistent development experience across the entire SuperPool ecosystem.
