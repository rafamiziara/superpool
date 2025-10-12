<div align="center">
  <img src="packages/assets/images/logos/with_padding.png" alt="SuperPool Logo" height="auto" />
</div>

# 🚀 **SuperPool: Decentralized Micro-Lending Pools**

![GitHub repo size](https://img.shields.io/github/repo-size/rafamiziara/superpool)
![GitHub last commit](https://img.shields.io/github/last-commit/rafamiziara/superpool)
![License](https://img.shields.io/github/license/rafamiziara/superpool)

> ⚠️ **DEVELOPMENT STATUS**: SuperPool is currently under active development as a proof-of-concept. The smart contracts have NOT been audited and should NOT be used with real funds on mainnet. Always use testnet deployments and dedicated test wallets. For development and testing purposes only.

## 🌟 Project Overview

**SuperPool** is a proof-of-concept multi-chain decentralized micro-lending platform. It showcases a community-driven lending model where users can create and manage their own lending "pools," contribute liquidity, and request loans within a trusted environment across multiple blockchain networks.

The platform is designed with a modular architecture supporting deployment on multiple EVM-compatible chains, including Polygon, Ethereum, Arbitrum, Base, BSC, and other networks, providing flexibility and scalability for decentralized lending operations.

### Why SuperPool?

SuperPool explores community-driven micro-lending through blockchain technology:

- **Permissioned Trust Circles:** Create private lending pools with people you trust, enabling community-based financial networks
- **Multi-Chain Flexibility:** Deploy on any EVM chain to minimize transaction costs and maximize accessibility
- **Progressive Decentralization:** Multi-sig governance with a clear path toward full DAO control
- **Transparent Operations:** All lending activity recorded immutably on-chain for complete auditability

Ideal for exploring DeFi lending mechanics, studying trust-based financial networks, or learning modern Web3 development patterns with a production-grade monorepo structure.

### Key Features:

- **🔐 Wallet-Based Authentication:** Secure signature-based login system supporting 500+ wallet providers through WalletConnect protocol.
- **🌐 Multi-Chain Support:** Compatible with Ethereum Mainnet, Polygon, Arbitrum, Base, BSC, and Polygon Amoy testnet.
- **📱 Cross-Platform Mobile App:** React Native/Expo application with comprehensive user onboarding flow.
- **🏗️ Multi-Pool Architecture:** Create multiple independent lending pools, each with its own members and unique parameters.
- **👥 Permissioned Membership:** Pool administrators approve members before they can contribute or borrow.
- **💰 Liquidity Contribution:** Pool members can contribute native tokens or ERC-20 tokens to provide liquidity for loans.
- **📋 Loan Request & Approval:** Members request loans which are reviewed by an AI agent and approved by pool admins.
- **💸 Loan Repayment & Management:** Borrowers can repay loans while admins manage defaults and pool health.
- **🔐 Multi-Sig Administration:** Core protocol contracts controlled by multi-signature Safe for enhanced security and decentralization.
- **📦 Monorepo Structure:** Streamlined development environment with all project components in a single repository.

## ⚙️ Tech Stack

- **Smart Contracts:** Solidity, Hardhat, OpenZeppelin (ERC-20, UUPS Proxies, Ownable)
- **Multi-Chain Deployment:** EVM-compatible chains including Polygon, Ethereum, Arbitrum, Base, and BSC
- **Frontend - Landing Page:** Next.js 15.5, React 19, Tailwind CSS v4
- **Frontend - Mobile App:** React Native/Expo, NativeWind, MobX state management
- **Wallet Integration:** Reown AppKit with WalletConnect protocol supporting 500+ wallets
- **Blockchain Interaction:** Wagmi hooks, Viem, Typechain for type-safe contract bindings
- **Backend:** Firebase Cloud Functions, Firestore, wallet-based authentication
- **Shared Packages:** Design system (`@superpool/design`), UI components (`@superpool/ui`), TypeScript types (`@superpool/types`)
- **Monorepo Management:** pnpm workspaces, TypeScript project references
- **Testing:** Jest, Hardhat test suite with local/forked network support

## 🏗️ Architecture Overview

The project is structured as a monorepo, allowing for seamless development and type-sharing across different layers.

```
superpool/
├── apps/
│ ├── mobile/           # React Native / Expo application
│ └── landing/          # Next.js 15.5.0 landing page
├── packages/
│ ├── contracts/        # Solidity smart contracts (PoolFactory, LendingPool)
│ ├── backend/          # Firebase Cloud Functions & backend logic
│ ├── design/           # Design system tokens and configuration
│ ├── assets/           # Shared brand assets and media
│ ├── ui/               # Shared React components library
│ └── types/            # Shared TypeScript interfaces
├── .gitignore
├── pnpm-workspace.yaml
├── tsconfig.json
├── tsconfig.base.json
├── README.md
├── CLAUDE.md
└── package.json (root)
```

The monorepo structure enables seamless development with shared packages for design, UI components, and TypeScript types across web and mobile applications. Smart contracts are deployable on multiple EVM chains, with backend Cloud Functions handling wallet authentication and off-chain data storage.

## Package Documentation

Detailed documentation for each component:

**Applications:**
- [Mobile App](apps/mobile/README.md) - React Native/Expo with wallet integration
- [Landing Page](apps/landing/README.md) - Next.js marketing website

**Core Services:**
- [Smart Contracts](packages/contracts/README.md) - Solidity contracts and deployment
- [Backend](packages/backend/README.md) - Firebase Cloud Functions

**Shared Packages:**
- [UI Components](packages/ui/README.md) - React component library
- [TypeScript Types](packages/types/README.md) - Shared type definitions
- [Design System](packages/design/README.md) - Design tokens and configuration
- [Assets](packages/assets/README.md) - Brand assets and illustrations

## 🚀 Getting Started

### Quick Start

```bash
# Clone the repository
git clone https://github.com/rafamiziara/superpool.git
cd superpool

# Install dependencies
pnpm install

# View all available commands
pnpm run
```

### Full Setup Required

SuperPool requires several services to be configured before running:

- Firebase project with Cloud Functions, Firestore, and Authentication
- Reown Cloud account for wallet connections
- Environment variables for all packages
- Firebase CLI and ngrok for local development

**👉 Complete setup instructions: [Getting Started Guide](docs/GETTING_STARTED.md)**

Once configured, start the full development environment with `pnpm dev`.

## 🛡️ Security Disclaimer

**This project is a proof-of-concept under active development. It is NOT intended for production use with real funds without comprehensive security audits, bug bounties, and significant hardening.**

- **Unaudited Contracts:** The smart contracts in this repository have **NOT been formally audited by a professional security firm.** They may contain vulnerabilities.
- **Development Phase:** SuperPool is currently in active development. Features and security measures are continuously evolving.
- **No Guarantees:** There are no guarantees of security, correctness, or functionality for real-world financial transactions.
- **Use at Your Own Risk:** Any interaction with deployed smart contracts is done at your own risk. **Only use testnet deployments.**
- **Testnet Only:** Always use dedicated testnet private keys for development and testing. **NEVER use mainnet private keys or real funds.**
- **AI Agent:** The AI loan assessment component is a basic implementation for demonstration purposes and does not replace robust financial risk assessment.

**For Developers:** This codebase is intended for educational and development purposes. Comprehensive security audits, bug bounties, and significant hardening are required before any production deployment.

## 🛣️ Roadmap

Future enhancements being explored:

- **Collateral Management:** Enable secured loans with on-chain collateral, including deposit, withdrawal, and automated liquidation mechanisms
- **Flexible Repayment Schedules:** Support partial repayments and customizable frequencies (weekly, monthly)
- **Dynamic Interest Rates:** Oracle-based rates that adjust to pool utilization and market conditions
- **DAO Governance:** Transition protocol decisions to community-driven governance via token holders
- **Decentralized Liquidation:** Automated liquidation processes using Chainlink Keepers
- **Insurance Fund:** Collect loan interest into an insurance pool for default protection

See the [Full Roadmap](ROADMAP.md) for detailed feature plans and timelines.

## 📝 License

This project is licensed under the [MIT License](LICENSE).

---

## 📞 Contact

- **Rafael Miziara** - contact@rm30.dev
- **GitHub:** github.com/rafamiziara
- **LinkedIn:** linkedin.in/rafamiziara

---
