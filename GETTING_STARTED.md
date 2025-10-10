# 🚀 Getting Started with SuperPool

This guide will walk you through setting up the SuperPool development environment on your local machine.

## Prerequisites

Before you begin, ensure you have the following installed and configured:

- Node.js (v18 or higher)
- pnpm (install via `npm install -g pnpm`)
- Git
- A wallet with testnet tokens for your target chain (e.g., Polygon Amoy, Ethereum Sepolia, Arbitrum Sepolia)
- A Firebase project set up with Firestore, Authentication, and Cloud Functions enabled.
- A Reown Cloud account and project ID for wallet connections (sign up at [cloud.reown.com](https://cloud.reown.com)).
- **Alchemy account and API key** (sign up at [alchemy.com](https://alchemy.com) for blockchain RPC access - required for contract deployment and forked network testing).
- **ngrok account and authtoken** (sign up at [ngrok.com](https://ngrok.com) for local development with mobile devices).

## 1. Clone the Repository

```bash
git clone https://github.com/rafamiziara/superpool.git
cd superpool
```

## 2. Install Dependencies

Install dependencies for all packages in the monorepo:

```bash
pnpm install
```

## 3. Environment Variables (Crucial!)

**NEVER commit your `.env` files or any sensitive information to Git.**

Create `.env` files in the following locations and populate them with your credentials. **These files are already in** `.gitignore`.

- `packages/contracts/.env`

```
# For deploying contracts (use a testnet key!)
PRIVATE_KEY=[YOUR_TESTNET_DEPLOYER_PRIVATE_KEY]

# Polygon Amoy RPC URL (e.g., Alchemy, Infura)
POLYGON_AMOY_RPC_URL=https://polygon-amoy.g.alchemy.com/v2/[YOUR_ALCHEMY_KEY]
ETHERSCAN_API_KEY=[YOUR_ETHERSCAN_API_KEY] # For contract verification (works for all chains)
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

# Reown/WalletConnect Project ID (required for wallet connections)
EXPO_PUBLIC_REOWN_PROJECT_ID=[YOUR_REOWN_PROJECT_ID]

# Ngrok URL for Firebase Emulators (for local development)
EXPO_PUBLIC_NGROK_URL_AUTH=...
EXPO_PUBLIC_NGROK_URL_FUNCTIONS=...
EXPO_PUBLIC_NGROK_URL_FIRESTORE=...

# Cloud Functions Base URL
EXPO_PUBLIC_CLOUD_FUNCTIONS_BASE_URL=https://[HOST]:[PORT]/[YOUR_PROJECT_ID]/[YOUR_REGION]/

# Contract addresses deployed to Amoy
EXPO_PUBLIC_POOL_FACTORY_ADDRESS=[DEPLOYED_POOL_FACTORY_ADDRESS_ON_AMOY]
```

## 4. Smart Contract Development

You have multiple options for smart contract development and testing:

### Option A: Local Development (Recommended for Development)

**Fastest iteration for development and testing:**

```bash
# Terminal 1: Start local Hardhat node
cd packages/contracts
pnpm node:local

# Terminal 2: Deploy contracts with test data
pnpm deploy:local

# Terminal 3: Interactive testing
pnpm console:local
```

**What you get:**

- ✅ 3 pre-configured test pools with different parameters
- ✅ 10 funded test accounts with clear roles (deployer, pool owners, borrowers, lenders)
- ✅ 50 POL funding per pool for immediate testing
- ✅ Complete deployment info for mobile app integration
- ✅ Instant transactions, free gas, full control

### Option B: Forked Development (Most Realistic Testing)

**Test against real network state:**

```bash
# Terminal 1: Start forked node (requires POLYGON_AMOY_RPC_URL in .env)
cd packages/contracts
pnpm node:fork

# Terminal 2: Deploy to forked network
pnpm deploy:fork

# Terminal 3: Test against real network state
pnpm test:fork
```

### Option C: Testnet Deployment (Pre-Production Testing)

**Deploy to Polygon Amoy testnet:**

```bash
cd packages/contracts
pnpm deploy:amoy
```

- **Important:** Note the deployed `PoolFactory` address. You will need this for your `backend` and `mobile` `.env` files.
- **Multi-sig Setup:** After `PoolFactory` is deployed, set up your multi-sig Safe (e.g., Gnosis Safe on Polygon Amoy) and transfer ownership of the `PoolFactory` to your Safe.

## 5. Mobile App Integration

The mobile app automatically supports localhost development:

- **Localhost Network**: Automatically available in development mode (Chain ID 31337)
- **Network Switching**: Appears in wallet connection UI when `__DEV__` is true
- **Contract Integration**: Connect to `http://127.0.0.1:8545` to interact with local contracts

**Quick Mobile Testing:**

1. Start local contracts: `pnpm node:local` → `pnpm deploy:local`
2. Note the Factory Address from deployment output
3. Run mobile app: `pnpm start` (in apps/mobile/)
4. Connect wallet and select "Localhost" network
5. Interact with your local contracts instantly!

## 6. Deploy Backend Cloud Functions

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

## 7. Set Up Wallet Connection (Reown Cloud)

Before running the mobile app, you need to set up wallet connection capabilities:

1. **Create a Reown Cloud Account:**
   - Visit [cloud.reown.com](https://cloud.reown.com) and create an account.
   - Create a new project and note your **Project ID**.

2. **Update Environment Variables:**
   - Add your Reown Project ID to `apps/mobile/.env`:

   ```
   EXPO_PUBLIC_REOWN_PROJECT_ID=your_project_id_here
   ```

3. **Configure Supported Networks:**
   - The app currently supports: Mainnet, Polygon, Arbitrum, Base, BSC, and Polygon Amoy.
   - Networks are configured in `apps/mobile/src/config/wagmi.ts`.

## 8. Set Up Ngrok for Local Development (Mobile Device Testing)

For testing the mobile app on a physical device with local Firebase emulators, you'll need ngrok:

1. **Configure Ngrok:**

   ```bash
   # Copy the template
   cp ngrok.yml.template ngrok.yml

   # Edit ngrok.yml and add your authtoken
   # Get your authtoken from: https://dashboard.ngrok.com/get-started/your-authtoken
   ```

2. **Add your authtoken to `ngrok.yml`:**
   ```yaml
   authtoken: your_ngrok_authtoken_here
   ```

## 9. Complete Development Workflow

### Quick Start (All-in-One)

```bash
# Start everything with one command
pnpm dev
```

This command will:

- ✅ Start Firebase emulators (auth, functions, firestore)
- ✅ Launch ngrok tunnels for mobile device access
- ✅ Automatically update mobile app environment variables with ngrok URLs
- ✅ Start the Expo development server

### Landing Page Development

To work on the Next.js landing page:

```bash
# Start the landing page (runs on port 3001)
cd apps/landing
pnpm dev

# Or run alongside mobile app
pnpm dev  # Mobile app (port 8081)
cd apps/landing && pnpm dev  # Landing page (port 3001)
```

The landing page automatically uses the shared design system and showcases all four SuperPool features with responsive design.

### Smart Contract Development Workflow

```bash
# Terminal 1: Start local blockchain
cd packages/contracts
pnpm node:local

# Terminal 2: Deploy with test data
pnpm deploy:local

# Terminal 3: Interactive testing (optional)
pnpm console:local

# Terminal 4: Start mobile app
cd apps/mobile
pnpm start
```

### Manual Backend Setup (if needed)

```bash
# Start Firebase emulators
cd packages/backend
firebase emulators:start

# In another terminal, start ngrok
ngrok start --all

# Update mobile/.env with ngrok URLs, then start mobile app
cd apps/mobile
pnpm start
```

**Testing Options:**

- **Local Contracts:** Instant testing with localhost network
- **Mobile Device:** Scan QR code with Expo Go app
- **Simulator:** Use Android/iOS simulator
- **Wallet Connection:** MetaMask Mobile, Coinbase Wallet, WalletConnect-compatible wallets
- **Network Switching:** Test with localhost, Polygon Amoy, or mainnet

---

## Additional Resources

- **[CLAUDE.md](CLAUDE.md)** - Detailed guidance for working with this codebase using Claude Code
- **[PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md)** - Complete project architecture and file organization
- **[HYBRID_TESTING_STRATEGY.md](packages/contracts/docs/HYBRID_TESTING_STRATEGY.md)** - Smart contract testing approaches

---

## Need Help?

If you encounter any issues during setup:

1. Check that all prerequisites are properly installed
2. Verify environment variables are correctly configured
3. Ensure you're using Node.js v18 or higher
4. Try running `pnpm install` again from the root directory
5. Review the error messages carefully - they often contain helpful debugging information

For project-specific questions, refer to [CLAUDE.md](CLAUDE.md) or open an issue on GitHub.
