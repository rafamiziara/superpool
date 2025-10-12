# Getting Started with SuperPool

Complete setup guide for developing on the SuperPool platform.

## Prerequisites

Before starting, ensure you have:

- **Node.js** v18 or higher
- **pnpm** (`npm install -g pnpm`)
- **Git**
- **Firebase project** with Firestore, Authentication, and Cloud Functions
- **Reown Cloud account** for wallet connections ([cloud.reown.com](https://cloud.reown.com))
- **Alchemy API key** for RPC access ([alchemy.com](https://alchemy.com))
- **ngrok account** for mobile development ([ngrok.com](https://ngrok.com))

## Quick Start

```bash
# Clone and install
git clone https://github.com/rafamiziara/superpool.git
cd superpool
pnpm install
```

## Environment Configuration

Each package requires specific environment variables. See individual package documentation:

- **[Contracts Environment](../packages/contracts/README.md#environment-setup)** - Private keys, RPC URLs, Etherscan API
- **[Backend Environment](../packages/backend/README.md#environment-setup)** - Firebase config, contract addresses
- **[Mobile Environment](../apps/mobile/README.md#environment-setup)** - Firebase, Reown, contract addresses

## Development Workflows

Choose the workflow that matches your development focus:

### Full Stack Development

For complete local development with all services:

1. **[Start Local Blockchain](../packages/contracts/README.md#development)** - Local Hardhat node with test pools
2. **[Run Backend Services](../packages/backend/README.md#development)** - Firebase emulators with auth
3. **[Launch Mobile App](../apps/mobile/README.md#development)** - Expo with localhost network

### Frontend Development Only

Test with deployed contracts on testnet:

1. **[Deploy to Testnet](../packages/contracts/README.md#deployment)** - Deploy contracts to Polygon Amoy
2. **[Configure Mobile App](../apps/mobile/README.md#production-testing)** - Update contract addresses
3. Get testnet POL from [Polygon Faucet](https://faucet.polygon.technology/)

### Smart Contract Development Only

Focus on contract development and testing:

1. **[Contract Development Guide](../packages/contracts/README.md)** - Local/fork/testnet testing
2. **[Run Contract Tests](../packages/contracts/README.md#testing)** - Comprehensive test suite

### Landing Page Development

Work on the marketing website:

1. **[Landing Page Setup](../apps/landing/README.md)** - Next.js development

## All-in-One Development Command

Start everything with a single command:

```bash
# From root directory
pnpm dev
```

This starts:
- Firebase emulators (auth, functions, firestore)
- Ngrok tunnels for mobile device access
- Expo development server
- Auto-updates mobile app with ngrok URLs

## Package Documentation

Detailed setup and usage for each package:

### Applications
- **[Mobile App](../apps/mobile/README.md)** - React Native/Expo with wallet integration
- **[Landing Page](../apps/landing/README.md)** - Next.js marketing website

### Core Services
- **[Smart Contracts](../packages/contracts/README.md)** - Solidity contracts and deployment
- **[Backend](../packages/backend/README.md)** - Firebase Cloud Functions

### Shared Packages
- **[UI Components](../packages/ui/README.md)** - React component library
- **[TypeScript Types](../packages/types/README.md)** - Shared type definitions
- **[Design System](../packages/design/README.md)** - Design tokens and configuration
- **[Assets](../packages/assets/README.md)** - Brand assets and illustrations

## Common Issues

**Firebase Emulators Won't Start**
- Check that port 9099 (auth), 5001 (functions), and 8080 (firestore) are available
- Ensure service account key is in `packages/backend/service-account-key.json`

**Mobile App Can't Connect to Localhost**
- Verify local blockchain is running (`pnpm node:local` in contracts package)
- Check contract addresses are updated in mobile `.env`
- Ensure you're on same network for device testing

**Contract Deployment Fails**
- Verify `.env` has valid private key and RPC URL
- Check you have sufficient testnet tokens
- Confirm Etherscan API key is set for verification

## Additional Resources

- **[CLAUDE.md](../CLAUDE.md)** - AI development guidelines and commands
- **[Architecture Overview](../README.md#-architecture-overview)** - Project structure
- **[Sprint Planning](SPRINT_PLAN.md)** - Development roadmap
- **[Design Guidelines](SUPERDESIGN.md)** - UI/UX specifications

## Need Help?

1. Check prerequisites are installed correctly
2. Verify environment variables in package-specific `.env` files
3. Review error messages - they often contain helpful debugging info
4. Consult individual package READMEs for detailed setup
