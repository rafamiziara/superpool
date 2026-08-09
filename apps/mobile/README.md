# Mobile App

React Native/Expo application with wallet integration and lending pool management.

## Overview

Cross-platform mobile app supporting 500+ wallets via WalletConnect with MobX state management.

## Features

- 🔐 Wallet-based authentication (MetaMask, Coinbase, WalletConnect, etc.)
- 🌐 Multi-chain support (Ethereum, Polygon, Arbitrum, Base, BSC, Polygon Amoy)
- 🏊 Lending pool creation and management
- 💰 Liquidity contributions and loan requests
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
- **`PoolStore`** - Lending pools, memberships, loans and transactions (currently mock data shaped on the real backend/contract payloads — `listPools` Cloud Function `PoolInfo`, shared `@superpool/types`)

```typescript
import { authStore, poolStore } from '../src/stores'
```

## Post-login UI

Dark-first "Abyss & Aurora" theme defined in `global.css` (Tailwind v4 `@theme` tokens: `abyss`/`surface`/`raised` depth scale, `mint`/`amber`/`iris`/`coral` accents). Screens live under `app/(auth)/`:

- **`(tabs)/dashboard`** - Balance hero, horizontal pool macro-cards, active loan, quick actions
- **`(tabs)/pools`** - Pool list + create-pool placeholder
- **`(tabs)/activity`** - Transaction feed grouped by day
- **`pool/[id]`** - Pool detail with stats, your position, thumb-zone action bar

Navigation uses Expo Router **NativeTabs** (SF Symbols on iOS, Material icons on Android) with a per-tab native **Stack**: the dashboard header shows the SuperPool logo + `AppKitButton`, Pools/Activity use native large titles, and pool detail pushes over the tabs with a native back button. Shared header styling lives in `src/constants/navigation.ts`.

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

> The mobile app does not consume `@superpool/ui` (React DOM components) or
> `@superpool/design` (Tailwind v3 config + web tokens). Its theme lives in
> `global.css` — see [Post-login UI](#post-login-ui).

> **Jest stays on 29 here while `packages/backend` is on 30.** This is a
> toolchain constraint, not drift: `jest-expo` builds on jest 29 internals
> (`@jest/globals`, `babel-jest`, `jest-snapshot`, `jest-environment-jsdom` are
> all pinned to `^29.2.1`), and that is still true of `jest-expo@57`. Mobile can
> move to jest 30 only when Expo's preset does.
