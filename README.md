# 🚀 **SuperPool: Decentralized Micro-Lending Pools**

![GitHub repo size](https://img.shields.io/github/repo-size/rafamiziara/superpool)
![GitHub last commit](https://img.shields.io/github/last-commit/rafamiziara/superpool)
![License](https://img.shields.io/github/license/rafamiziara/superpool)

## 🌟 Project Overview

**SuperPool** is a proof-of-concept decentralized micro-lending platform built on the **Polygon (PoS)** network. It aims to showcase a community-driven lending model where users can create and manage their own lending "pools," contribute liquidity, and request loans within a trusted environment.

This project serves as a comprehensive portfolio piece demonstrating expertise across blockchain smart contract development, modern mobile application development (React Native), and robust backend cloud infrastructure (Firebase Cloud Functions).

### Key Features:

- **Multi-Pool Architecture:** Supports the creation of multiple independent lending pools, each with its own members and potentially unique parameters.
- **Permissioned Membership:** Pool administrators (initially controlled by a multi-sig Safe) approve members before they can contribute or borrow.
- **Liquidity Contribution:** Pool members can contribute MATIC (or a custom ERC-20 token) to provide liquidity for loans.
- **Loan Request & Approval:** Members can request loans from their pool. Loan requests are initially reviewed by an off-chain AI agent (mocked/basic implementation) and then approved by the pool admin.
- **Loan Repayment & Management:** Borrowers can repay loans. Admins can manage defaults.
- **Multi-Sig Administration:** Core protocol contracts (like the Pool Factory) are controlled by a [e.g., 2-of-3] multi-signature Safe for enhanced security and progressive decentralization. Individual pools are managed by their respective admin.
- **Monorepo Structure:** A streamlined development environment encompassing all project components in a single repository.

## ⚙️ Tech Stack

**Blockchain / Smart Contracts:**

- **Solidity:** Smart contract language.
- **Hardhat:** Ethereum development environment for testing, compiling, and deploying contracts.
- **OpenZeppelin Contracts:** Secure, community-audited smart contract libraries (ERC-20, UUPS Proxies, Ownable).
- **Polygon (PoS):** Layer 2 scaling solution for low-cost, fast transactions.

**Mobile Application (Frontend):**

- **React Native / Expo:** Cross-platform framework for iOS and Android.
- **TypeScript:** Type-safe JavaScript.
- **Wagmi:** React Hooks for Ethereum.
- **Viem:** TypeScript interface for Ethereum.
- **WalletConnect:** For connecting user wallets (e.g., MetaMask Mobile, Trust Wallet).

**Backend / Cloud Infrastructure:**

- **Firebase / Google Cloud Functions:** Serverless functions for off-chain logic (e.g., AI loan assessment, sending notifications, database interactions, bridging on-chain events).
- **Firebase Firestore:** NoSQL database for off-chain data storage (e.g., user profiles, pool metadata, pending loan requests, AI assessment results).
- **Firebase Authentication:** User authentication (email/password, social logins).

**Monorepo Management:**

- **pnpm Workspaces:** For managing dependencies and scripts across packages.
- **Typechain:** Generates TypeScript bindings for smart contracts.

## 🏗️ Architecture Overview

The project is structured as a monorepo, allowing for seamless development and type-sharing across different layers.

```
superpool-dapp/
├── apps/
│ └── mobile/ # React Native / Expo application
├── packages/
│ ├── contracts/ # Solidity smart contracts (PoolFactory, LendingPool)
│ └── backend/ # Firebase Cloud Functions & backend logic
├── .gitignore
├── pnpm-workspace.yaml
├── README.md
└── package.json (root)
```

**Workflow:**

1.  **Smart Contracts:** Deployed on Polygon, managing core lending logic, liquidity, and membership. The `PoolFactory` is controlled by a multi-sig Safe, which deploys upgradable `LendingPool` instances.
2.  **Backend (Cloud Functions):** Acts as a bridge between the mobile app and smart contracts. It handles user authentication, stores off-chain data, processes loan assessment requests (AI agent), sends notifications, and interacts with smart contracts for specific admin-controlled actions (via multi-sig).
3.  **Mobile App:** Provides the user interface for interacting with the platform, connecting wallets, initiating transactions, and viewing data fetched from the backend.

## 🚀 Getting Started

Follow these steps to set up and run the SuperPool project locally.

### Prerequisites

- Node.js (v18 or higher)
- pnpm (install via `npm install -g pnpm`)
- Git
- A Polygon (Amoy Testnet recommended) wallet with some MATIC for gas.
- A Firebase project set up with Firestore, Authentication, and Cloud Functions enabled.

### 1. Clone the Repository

```bash
git clone https://github.com/rafamiziara/superpool.git
cd superpool
```

### 2. Install Dependencies

Install dependencies for all packages in the monorepo:

```bash
pnpm install
```

### 3. Environment Variables (Crucial!)

**NEVER commit your `.env` files or any sensitive information to Git.**

Create `.env` files in the following locations and populate them with your credentials. **These files are already in** `.gitignore`.

- `packages/contracts/.env`

```
# For deploying contracts (use a testnet key!)
PRIVATE_KEY=[YOUR_TESTNET_DEPLOYER_PRIVATE_KEY]

# Polygon Amoy RPC URL (e.g., Alchemy, Infura)
POLYGON_AMOY_RPC_URL=https://polygon-amoy.g.alchemy.com/v2/[YOUR_ALCHEMY_KEY]
POLYGONSCAN_API_KEY=[YOUR_POLYGONSCAN_API_KEY] # For contract verification
```

- `packages/backend/.env`

```
# For appCheck.createToken
APP_ID_FIREBASE=[YOUR_FIREBASE_APP_ID]

# Contract addresses deployed to Amoy
POOL_FACTORY_ADDRESS=[DEPLOYED_POOL_FACTORY_ADDRESS_ON_AMOY]
```

_Note: For actual Firebase Functions deployment, you should use `firebase functions:config:set` for secrets, not `.env`._

- `apps/mobile/.env`

```
# Public Firebase config (safe to be here, but still use .env for consistency)
EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSy...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
EXPO_PUBLIC_FIREBASE_APP_ID=...
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=...

# Ngrok URL for Firebase Emulators (for local development)
EXPO_PUBLIC_NGROK_URL_AUTH=...
EXPO_PUBLIC_NGROK_URL_FUNCTIONS=...
EXPO_PUBLIC_NGROK_URL_FIRESTORE=...

# Cloud Functions Base URL
EXPO_PUBLIC_CLOUD_FUNCTIONS_BASE_URL=https://[HOST]:[PORT]/[YOUR_PROJECT_ID]/[YOUR_REGION]/

# Contract addresses deployed to Amoy
EXPO_PUBLIC_POOL_FACTORY_ADDRESS=[DEPLOYED_POOL_FACTORY_ADDRESS_ON_AMOY]
```

### 4. Deploy Smart Contracts (Testnet)

Navigate to the `contracts` package and deploy:

```bash
cd packages/contracts
pnpm deploy:amoy # This command should be defined in your package.json scripts
```

- **Important:** Note the deployed `PoolFactory` address. You will need this for your `backend` and `mobile` `.env` files.

- **Multi-sig Setup:** After `PoolFactory` is deployed, set up your multi-sig Safe (e.g., Gnosis Safe on Polygon Amoy) and transfer ownership of the `PoolFactory` to your Safe. All subsequent calls to `createPool` from your backend should be initiated via the Safe.

### 5. Deploy Backend Cloud Functions

---

To run the backend functions locally, you need to provide the Firebase Admin SDK with credentials via a service account key.

1.  **Generate a Service Account Key:**

    - Navigate to your Firebase Console.
    - Go to **Project settings > Service accounts**.
    - Click the **Generate new private key** button and download the JSON file.

2.  **Add the Key to the Project:**

    - Rename the downloaded JSON file to `service-account-key.json`.
    - Place this file in the **`packages/backend/`** directory.

3.  **Secure the Key:**

    - **Crucially**, add `service-account-key.json` to the `.gitignore` file in your `packages/backend` directory. This prevents sensitive credentials from being committed to the repository.

    ```
    # packages/backend/.gitignore

    # Firebase Service Account Key
    service-account-key.json
    ```

After completing these steps, the Firebase Functions emulator will be able to start and run your backend functions locally.

---

Navigate to the `backend` package and deploy your Firebase Functions:

```bash
cd packages/backend

# Set Firebase project if you haven't already
firebase use [YOUR_FIREBASE_PROJECT_ID]

# Set config variables (e.g., contract addresses, any private API keys)
firebase functions:config:set contracts.pool_factory_address="[DEPLOYED_POOL_FACTORY_ADDRESS_ON_AMOY]"

# Deploy
firebase deploy --only functions
```

- **Important:** Note the base URL for your deployed Cloud Functions. Update `EXPO_PUBLIC_CLOUD_FUNCTIONS_BASE_URL` in `packages/mobile/.env`.

---

### Development & Testing Tools

To facilitate local testing of the authentication and signature verification flow, we use two utility scripts located in the `packages/backend/scripts` directory.

#### 1. Generating a Key Pair

The `generateKey` script creates a new public/private key pair used for signing messages during local development.

- **Purpose**: Generates `privateKey.pem` and `publicKey.pem` files in the `scripts` directory. The private key is used by the `signMessage` script, and the public key is used by the backend to verify signatures.
- **Usage**:
  ```bash
  pnpm generateKey
  ```
- **Note**: These files are automatically added to `.gitignore` and should **never** be committed to the repository.

#### 2. Signing a Message

The `signMessage` script signs a message using the generated private key and the `nonce` and `timestamp` from your backend.

- **Purpose**: Creates a cryptographic signature that you can use to test the `verifySignatureAndLogin` backend function.
- **Usage**:
  ```bash
  pnpm signMessage <nonce> <timestamp>
  ```
- **Output**: The script will print the generated signature, which you can then use in your test requests (e.g., Postman).

#### 3. Testing Workflow

Here is the complete workflow to test your authentication functions:

1.  Call your `generateAuthMessage` backend function to get a unique `nonce` and `timestamp`.
2.  Run the `signMessage` script with the `nonce` and `timestamp` values from the previous step.
3.  Use the `signature` from the script's output, along with the original `walletAddress`, to call the `verifySignatureAndLogin` backend function.

---

### 6. Run the Mobile Application

Navigate to the `mobile` package and start the Expo development server:

```bash
cd packages/mobile
pnpm start
```

- This will open the Expo Dev Tools in your browser. You can then scan the QR code with your phone (using the Expo Go app) or run it on an Android/iOS simulator.

## 🤝 Multi-Sig Administration

This project utilizes a multi-signature wallet (Safe) to control critical protocol-level actions, such as deploying new `LendingPool` contract versions via the `PoolFactory`. This demonstrates enhanced security and a step towards decentralized governance.

To interact with actions requiring multi-sig approval (e.g., initiating a `createPool` call via the backend), the transaction will be proposed on your Safe. The configured owners will then need to confirm the transaction via the Safe web or mobile app.

## 🛡️ Security Disclaimer

**This project is a personal portfolio piece and proof-of-concept. It is NOT intended for production use without comprehensive security audits, bug bounties, and significant hardening.**

- **Unaudited Contracts:** The smart contracts in this repository have **NOT been formally audited by a professional security firm.** They may contain vulnerabilities.
- **No Guarantees:** There are no guarantees of security, correctness, or functionality for real-world financial transactions.
- **Use at Your Own Risk:** Any interaction with the deployed smart contracts on any network (testnet or mainnet) is done at your own risk.
- **Testnet Keys Only:** Always use dedicated testnet private keys for development and testing. **NEVER use your mainnet private keys or seed phrases with this codebase.**
- **AI Agent:** The AI loan assessment component is a basic implementation for demonstration purposes and does not replace robust financial risk assessment.

## 🛣️ Roadmap: Beyond the MVP

Our current MVP for SuperPool focuses on establishing core decentralized micro-lending functionalities. However, we envision a robust platform with advanced features for enhanced user experience, security, and decentralized governance.

Here’s a glimpse of what's next for SuperPool:

### Lending & Liquidity Enhancements

- **Loan Collateral Management:** Enable loans to be secured by on-chain collateral (e.g., ERC-20 tokens), with mechanisms for deposit, withdrawal, and liquidation.
- **Flexible Repayment Schedules:** Allow for partial loan repayments and customizable repayment frequencies (e.g., weekly, monthly).
- **Dynamic Interest Rates:** Implement interest rates that adjust based on pool utilization, supply/demand, or external market data via oracles.

### Community & Governance

- **DAO Integration:** Transition protocol-level decisions (e.g., new pool parameters, fee structure) to a decentralized autonomous organization (DAO) governed by token holders.
- **Community Feedback & Reporting:** Allow users to report issues or provide feedback on pool members, contributing to reputation.

### Security & Operations

- **Decentralized Liquidation:** Explore automated, decentralized liquidation processes using Chainlink Automation (Keepers) instead of relying solely on admin intervention.
- **Insurance Fund:** Implement a mechanism to collect a small portion of loan interest into an insurance fund to cover potential defaults.

For a more detailed breakdown of these and other potential features, refer to our [Full Project Roadmap](ROADMAP.md).

## 📝 License

This project is licensed under the [MIT License](LICENSE).

---

## 📞 Contact

- **Rafael Miziara** - contact@rm30.dev
- **GitHub:** github.com/rafamiziara
- **LinkedIn:** linkedin.in/rafamiziara

---
