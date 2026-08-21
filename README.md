<div align="center">
  <img src="packages/assets/images/logos/with_padding.png" alt="SuperPool Logo" height="auto" />
</div>

# 🚀 **SuperPool: Decentralized Micro-Lending Pools**

[![CI](https://github.com/rm30-dev/superpool/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/rm30-dev/superpool/actions/workflows/ci.yml)
![GitHub repo size](https://img.shields.io/github/repo-size/rm30-dev/superpool)
![GitHub last commit](https://img.shields.io/github/last-commit/rm30-dev/superpool)
![License](https://img.shields.io/github/license/rm30-dev/superpool)

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

### What Works Today

These are implemented end to end and verified against a live chain:

- **🔐 Wallet-Based Authentication:** Signature-based login through WalletConnect (Reown AppKit), with nonce expiry and replay protection.
- **📲 Device Verification:** Firebase App Check tokens issued only to devices linked to an authenticated wallet.
- **🏗️ Pool Creation:** A user creates their own lending pool from the mobile app — form → `PoolFactory.createPool` → receipt parsing → an indexed Firestore document, with three independent indexing paths and idempotent writes ([how it works](docs/POOL_CREATION.md)).
- **💰 Liquidity Contribution:** A member deposits native currency into a pool — form → `depositFunds` → `FundsDeposited` indexed into Firestore → the pool's liquidity and the member's position, both summed from the events rather than stored as totals ([how it works](docs/CONTRIBUTIONS.md)).
- **⏳ Pending Transaction Tracking:** Submitted transactions of every kind survive an app restart; startup recovery resolves them and drains them into the pool list. A settled record can be cleared by hand — the chain has it either way, so the sweep re-derives it.
- **👥 Permissioned Membership:** Each pool chooses at creation whether its owner admits members (`requiresMembership`, changeable later). With it on, joining is `requestMembership` → `approveMember` / `rejectMember`, and nobody can fund the pool or borrow from it until they are let in; with it off, funding a pool is what makes you a member of it. The register is written either way, so an owner can close an open pool without stranding anyone ([how it works](docs/MEMBERSHIP.md)).
- **📋 Loan Request & Approval:** Each pool chooses whether to review requests before lending (`setRequiresApproval`, owner-only, off by default). With it on, borrowing is `requestLoan` → `approveLoan` / `rejectLoan`, plus `cancelLoanRequest` for the borrower; with it off, `createLoan` disburses in one call to any member who has contributed. Owners get a queue, members get a status ([how it works](docs/LOANS.md)).
- **💸 Loan Repayment:** Principal plus flat interest in one transaction — interest is fixed at disbursement and does not accrue, so repaying early costs the same.
- **📈 Interest Distribution:** A repayment's interest is shared out to the members who funded the pool, in proportion to what each put in, through a per-share accumulator rather than a loop over a member list. `claimable(address)` says what you have earned and `claimInterest()` pays it; withdrawing your contribution leaves the accrual claimable, and so does being removed from the pool ([how it works](docs/INTEREST.md)).
- **📱 Cross-Platform Mobile App:** React Native/Expo application with onboarding, wallet connection and a live pool list.
- **🔐 Multi-Sig Administration:** `PoolFactory` ownership transfers to a Safe; admin actions are executed through it.
- **📦 Monorepo Structure:** pnpm workspaces with shared types, CI running lint, type-check and the test matrix.

### Planned

Designed and partly scaffolded, but **not** functional yet — the mobile screens for these are placeholders:

- **🪙 ERC-20 Liquidity:** Contributions are native currency only; token deposits need contract work.
- **💸 Default Handling & Pool Health:** A loan's term is recorded and shown, but nothing on chain enforces it — there is no liquidation, no penalty and no default state.
- **🌐 Multi-Chain Support:** The contracts are chain-agnostic and the wallet offers Ethereum, Polygon, Arbitrum, Base and BSC, but the backend currently resolves exactly one configured chain at a time. Only a local Hardhat node is deployed today; Polygon Amoy is next.

## ⚙️ Tech Stack

- **Smart Contracts:** Solidity, Hardhat, OpenZeppelin (ERC-20, UUPS Proxies, Ownable)
- **Multi-Chain Deployment:** EVM-compatible chains including Polygon, Ethereum, Arbitrum, Base, and BSC
- **Frontend - Landing Page:** Next.js 16, React 19, Tailwind CSS v4
- **Frontend - Mobile App:** React Native/Expo, Uniwind (Tailwind CSS v4), MobX state management
- **Wallet Integration:** Reown AppKit with WalletConnect protocol supporting 500+ wallets
- **Blockchain Interaction:** Wagmi hooks, Viem, Typechain for type-safe contract bindings
- **Backend:** Firebase Cloud Functions, Firestore, wallet-based authentication
- **Shared Packages:** TypeScript types (`@superpool/types`), brand assets (`@superpool/assets`)
- **Monorepo Management:** pnpm workspaces, TypeScript project references
- **Testing:** Jest, Hardhat test suite with local/forked network support

## 🏗️ Architecture Overview

The project is structured as a monorepo, allowing for seamless development and type-sharing across different layers.

```
superpool/
├── apps/
│ ├── mobile/           # React Native / Expo application
│ └── landing/          # Next.js 16 landing page
├── packages/
│ ├── contracts/        # Solidity smart contracts (PoolFactory, LendingPool)
│ ├── backend/          # Firebase Cloud Functions & backend logic
│ ├── assets/           # Shared brand assets and media
│ └── types/            # Shared TypeScript interfaces
├── .gitignore
├── pnpm-workspace.yaml
├── tsconfig.json
├── tsconfig.base.json
├── README.md
├── CLAUDE.md
└── package.json (root)
```

The monorepo structure enables seamless development with shared TypeScript types and brand assets across web and mobile applications. Smart contracts are deployable on multiple EVM chains, with backend Cloud Functions handling wallet authentication and off-chain data storage.

Each app owns its own styling: the mobile app's dark theme lives in `apps/mobile/global.css`, the landing page's in `apps/landing/src/app/globals.css`. Unifying them is the job of the workspace-level design overhaul.

## Package Documentation

Detailed documentation for each component:

**Applications:**

- [Mobile App](apps/mobile/README.md) - React Native/Expo with wallet integration
- [Landing Page](apps/landing/README.md) - Next.js marketing website

**Core Services:**

- [Smart Contracts](packages/contracts/README.md) - Solidity contracts and deployment
- [Backend](packages/backend/README.md) - Firebase Cloud Functions

**Shared Packages:**

- [TypeScript Types](packages/types/README.md) - Shared type definitions
- [Assets](packages/assets/README.md) - Brand assets and illustrations

**Guides:**

- [Getting Started](docs/GETTING_STARTED.md) - Full setup walkthrough
- [Pool Creation](docs/POOL_CREATION.md) - How a pool goes from a form to a listed pool, end to end
- [Sprint Plan](docs/SPRINT_PLAN.md) - What is built and what is next
- [Roadmap](docs/ROADMAP.md) - Post-MVP direction

## 🚀 Getting Started

### Quick Start

```bash
# Clone the repository
git clone https://github.com/rm30-dev/superpool.git
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
