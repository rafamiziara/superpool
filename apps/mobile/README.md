# Mobile App

React Native/Expo application with wallet integration and lending pool management.

## Overview

Cross-platform mobile app supporting 500+ wallets via WalletConnect with MobX state management.

## Features

- 🔐 Wallet-based authentication (MetaMask, Coinbase, WalletConnect, etc.)
- 🌐 Multi-chain support (Ethereum, Polygon, Arbitrum, Base, BSC, Polygon Amoy)
- 🏊 Lending pool creation and management
- 💰 Liquidity contributions, withdrawals, borrowing and repayment
- 📱 Onboarding flow with feature showcase
- 🔄 Real-time blockchain synchronization

## Environment Setup

Create `.env` file:

```bash
# Firebase Configuration
EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSy...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
EXPO_PUBLIC_FIREBASE_APP_ID=...

# Reown/WalletConnect
EXPO_PUBLIC_REOWN_PROJECT_ID=your_reown_project_id

# Smart Contracts
EXPO_PUBLIC_POOL_FACTORY_ADDRESS=0x...

# Backend (for local development)
EXPO_PUBLIC_CLOUD_FUNCTIONS_BASE_URL=https://...
EXPO_PUBLIC_NGROK_URL_AUTH=https://...
EXPO_PUBLIC_NGROK_URL_FUNCTIONS=https://...
```

## Development

```bash
# Start Expo dev server
pnpm start

# Run on specific platform
pnpm android
pnpm ios
pnpm web

# Type checking
pnpm type-check

# Linting
pnpm lint

# Tests
pnpm test
```

## State Management

MobX singleton stores configured in `src/stores/`:

- **`AuthStore`** - User authentication, wallet state and session
- **`NavigationStore`** - Auth-driven routing decisions
- **`PoolStore`** - Pools, contributions, withdrawals and loans come from Cloud Functions in one snapshot. Memberships, positions and liquidity are derived on read rather than stored, so nothing can fall out of step with the chain. Set `EXPO_PUBLIC_USE_MOCK_POOLS=true` to run the whole screen on mocks without the Functions emulator.
- **`PendingTransactionsStore`** - Every wallet transaction that is submitted but not yet confirmed and indexed — pool creations, contributions, withdrawals and the six loan actions — persisted to AsyncStorage so they survive an app restart. Discriminated on `type`; `isDismissable` decides what the user may clear by hand

```typescript
import { authStore, poolStore } from '../src/stores'
```

## Transaction Flows

`src/hooks/pools/` drives every write, one hook per stage:

- **`usePoolCreation`** - lazy whitelisting via `preparePoolCreation`, gas estimate and balance check, then the `createPool` transaction
- **`useTransactionMonitoring`** - waits for the receipt and decodes the event for the transaction's type
- **`usePoolIndexing`** - hands confirmed transactions to the backend; `indexConfirmed()` drains whatever startup recovery resolved

The same three stages carry every other write: `useContribution`, `useWithdrawal`
and `useLoan` — which covers borrowing, repaying, requesting, approving,
rejecting and cancelling in one hook, because the contract holds a single
`activeLoanId` per member per pool. `usePoolSettings` is the exception and sits
outside the pending-transaction machinery entirely: nothing indexes a pool
setting, so there is nothing to recover and it waits for its own receipt.

Pending work is visible while it is in flight: `PendingPoolCard` on the pools
list, `PendingTransactionBanner` on the dashboard, and `TransactionStatusModal`
behind both.

**Read [`docs/POOL_CREATION.md`](../../docs/POOL_CREATION.md) before changing any
of this** — it covers the three indexing paths and the chain-shaped traps that
the mocked tests do not catch. For anything touching loans, read
[`docs/LOANS.md`](../../docs/LOANS.md) too: a loan is not an event like a
contribution, its state is re-read from `getLoan` rather than inferred from which
log arrived, and `isRepaid` means nothing until `status` is `disbursed`.

## UI

Dark-only "Abyss & Aurora" theme defined in `global.css` (Tailwind v4 `@theme` tokens: `abyss`/`surface`/`raised` depth scale, `mint`/`amber`/`iris`/`coral` accents), used by every screen including the pre-login ones (`index`, `onboarding`, `connecting`).

The app never follows the device colour scheme. Three things pin it, and all three are needed — dropping any one leaves a white flash or a light system bar:

- `userInterfaceStyle: "dark"` in `app.json` resolves native chrome (status bar, tab bar, sheets) dark, and the splash background matches `abyss`.
- Every navigator sets `contentStyle.backgroundColor` to `abyss`, so a screen has the right background before it renders.
- `createAppKit({ themeMode: 'dark' })` pins the wallet modal, which would otherwise follow the system. Its accent stays AppKit's own indigo: their buttons hardcode white label text, which `mint` cannot carry.

Post-login screens live under `app/(auth)/`:

- **`(tabs)/dashboard`** - Balance hero, horizontal pool macro-cards, active loan, quick actions,
  pending-transaction banner, and a card per pool with loan requests waiting on you
- **`(tabs)/pools`** - Pool list with pending/syncing cards, loading/empty/error states, and a
  pull-to-refresh that sweeps the chain before reloading, so pools created outside this app appear
- **`(tabs)/activity`** - The connected wallet's own transactions, grouped by day
- **`pool/[id]`** - Pool detail with stats, your position, the pool's own activity, thumb-zone
  action bar, and the owner's entry points to approvals and settings
- **`pool/create`** - Create-pool form and submission flow
- **`pool/contribute`** / **`pool/withdraw`** - Depositing into a pool and taking it back out
- **`pool/borrow`** - Three states in one screen, mutually exclusive because the contract holds a
  single `activeLoanId` per member per pool: repay an outstanding loan, withdraw a request waiting
  on the owner, or borrow — sent as `createLoan` or `requestLoan` depending on the pool
- **`pool/approvals`** - Owner only. The queue of loan requests, approved or declined one at a
  time, since two signature prompts from one wallet race for a nonce
- **`pool/settings`** - Owner only. Whether this pool reviews requests before lending

The activity feed is signed from the pool's side on `pool/[id]` and from the
wallet's on the dashboard and activity tab — see
[`docs/LOANS.md`](../../docs/LOANS.md#the-sign-depends-on-whose-feed-it-is).

Navigation uses Expo Router **NativeTabs** (SF Symbols on iOS, Material icons on Android) with a per-tab native **Stack**. All three tabs share one header — SuperPool logo left, `AppKitButton` right, no per-tab title, since the tab bar already names the screen. Pool detail pushes over the tabs with a native back button. The shared header and its styling are `brandHeader` / `darkHeader` in `src/constants/navigation.tsx`.

## Network Configuration

Configured in `src/config/wagmi.ts`:

**Testnet:**

- Polygon Amoy (80002)
- Localhost (31337) - Dev mode only

**Mainnet:**

- Ethereum (1)
- Polygon (137)
- Arbitrum (42161)
- Base (8453)
- BSC (56)

## Local Testing with Localhost

1. Start local blockchain: `cd packages/contracts && pnpm node:local`
2. Deploy contracts: `pnpm deploy:local`
3. Note contract addresses from deployment
4. Start mobile app: `pnpm start`
5. Connect wallet and select "Localhost" network

## Production Testing

1. Deploy to Polygon Amoy: `cd packages/contracts && pnpm deploy:amoy`
2. Update `EXPO_PUBLIC_POOL_FACTORY_ADDRESS` in `.env`
3. Get testnet POL from [Polygon Faucet](https://faucet.polygon.technology/)
4. Start app: `pnpm start`

## Dependencies

- **Expo Router** - File-based navigation
- **Reown AppKit** - Wallet connection UI
- **Wagmi/Viem** - Ethereum interactions
- **MobX** - Reactive state management
- **Uniwind** - Tailwind CSS v4 for React Native
- **@superpool/types** - Shared TypeScript types
- **@superpool/assets** - Shared logos and onboarding illustrations

> There is no shared UI or design-token package in this repo. The app's theme
> lives in `global.css` — see [UI](#ui).

> **Jest stays on 29 here while `packages/backend` is on 30.** This is a
> toolchain constraint, not drift: `jest-expo` builds on jest 29 internals
> (`@jest/globals`, `babel-jest`, `jest-snapshot`, `jest-environment-jsdom` are
> all pinned to `^29.2.1`), and that is still true of `jest-expo@57`. Mobile can
> move to jest 30 only when Expo's preset does.
