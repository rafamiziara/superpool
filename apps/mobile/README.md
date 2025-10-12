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

MobX stores configured in `src/stores/`:

- **`AuthenticationStore`** - User authentication and session
- **`WalletConnectionStore`** - Blockchain wallet connections
- **`PoolManagementStore`** - Lending pool operations
- **`RootStore`** - Store composition and context provider

Access via React Context:

```typescript
import { useStores } from './stores/RootStore'

const { authStore, walletStore } = useStores()
```

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
- **NativeWind** - Tailwind CSS for React Native
- **@superpool/ui** - Shared components
- **@superpool/design** - Design tokens
- **@superpool/types** - TypeScript types
