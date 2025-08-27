# SuperPool Smart Contracts

This package contains the smart contracts for the SuperPool decentralized micro-lending platform, built using Hardhat and deployed on Polygon.

## Features

- 🔐 **Upgradeable Contracts** - Using OpenZeppelin's UUPS proxy pattern
- 🛡️ **Security** - Comprehensive access control, pausability, and reentrancy protection
- ⚡ **Modern Solidity** - Built with Solidity ^0.8.22 for optimal compatibility
- 🧪 **Full Test Coverage** - Comprehensive test suite with gas reporting
- 📊 **Gas Optimization** - Optimized contracts with detailed gas reporting
- 🌍 **Multi-Network** - Configured for Polygon mainnet and Amoy testnet
- 🔧 **Modern Tooling** - Hardhat v2.22.18 with latest plugins and TypeScript support

## Hardhat Version Notes

Currently using **Hardhat v2.22.18** for maximum stability and plugin compatibility. While Hardhat v3 is available, it's still in beta and some plugins (like OpenZeppelin Upgrades, gas reporter, and coverage tools) haven't been updated for full compatibility yet.

**Migration to Hardhat v3 will be done when:**

- All essential plugins support Hardhat v3
- The ecosystem is fully stable
- ESM migration is properly tested

## Solidity Version Configuration

The project uses **Solidity 0.8.22** throughout for:

- ✅ **Full compatibility** with latest OpenZeppelin contracts (v5.4.0)
- ✅ **Simplified configuration** - single compiler version
- ✅ **Modern language features** with excellent stability
- ✅ **Hardhat support** - fully supported with all tooling

## Prerequisites

- Node.js 22+
- pnpm (package manager)
- Git

## Quick Start

### 1. Install Dependencies

```bash
cd packages/contracts
pnpm install
```

### 2. Environment Setup

Copy the environment template and configure your variables:

```bash
cp .env.template .env
```

Edit `.env` with your configuration:

```env
# Private key for deploying contracts (without 0x prefix)
PRIVATE_KEY=your_private_key_here

# RPC URLs
POLYGON_AMOY_RPC_URL=https://rpc-amoy.polygon.technology/
POLYGON_RPC_URL=https://polygon-rpc.com/

# Etherscan API key for contract verification (works for all chains including Polygon)
ETHERSCAN_API_KEY=your_etherscan_api_key

# Optional: CoinMarketCap API key for gas reporter
COINMARKETCAP_API_KEY=your_coinmarketcap_api_key
```

### 3. Compile Contracts

```bash
pnpm compile
```

### 4. Run Tests

```bash
# Run all tests
pnpm test

# Run tests with gas reporting
pnpm test:gas

# Generate coverage report
pnpm coverage
```

### 5. Deploy to Polygon Amoy Testnet

```bash
pnpm deploy:amoy
```

### 6. Verify Contracts

```bash
pnpm verify <IMPLEMENTATION_ADDRESS>
```

## Available Scripts

| Command            | Description                                          |
| ------------------ | ---------------------------------------------------- |
| `pnpm compile`     | Compile all Solidity contracts                       |
| `pnpm test`        | Run the complete test suite                          |
| `pnpm test:gas`    | Run tests with gas usage reporting                   |
| `pnpm coverage`    | Generate test coverage report                        |
| `pnpm deploy:amoy` | Deploy contracts to Polygon Amoy testnet             |
| `pnpm verify`      | Verify contracts using Etherscan API v2 (multichain) |
| `pnpm lint`        | Run Solidity and TypeScript linting                  |
| `pnpm clean`       | Clean compilation artifacts                          |

## Project Structure

```
packages/contracts/
├── contracts/              # Solidity smart contracts
│   └── SampleLendingPool.sol
├── scripts/                # Deployment and utility scripts
│   └── deploy.ts
├── test/                   # Test files
│   └── SampleLendingPool.test.ts
├── typechain-types/        # Generated TypeScript types
├── hardhat.config.ts       # Hardhat configuration
├── tsconfig.json          # TypeScript configuration
├── .env.template          # Environment template
└── README.md              # This file
```

## Contract Architecture

### SampleLendingPool

A fully upgradeable lending pool contract that demonstrates the core functionality:

- **Upgradeable Pattern**: Uses OpenZeppelin's UUPS proxy for safe upgrades
- **Access Control**: Owner-based permissions for administrative functions
- **Pausable**: Emergency pause functionality
- **Reentrancy Protection**: Safeguards against reentrancy attacks
- **Loan Management**: Create and repay loans with configurable interest rates
- **Pool Management**: Deposit funds, configure parameters

#### Key Functions

- `initialize()` - Initialize the contract (replaces constructor)
- `depositFunds()` - Add funds to the lending pool
- `createLoan()` - Borrow funds from the pool
- `repayLoan()` - Repay a loan with interest
- `updatePoolConfig()` - Update pool parameters (owner only)
- `pause()/unpause()` - Emergency controls (owner only)

## Network Configuration

### Polygon Amoy Testnet

- **Chain ID**: 80002
- **RPC URL**: https://rpc-amoy.polygon.technology/
- **Explorer**: https://amoy.polygonscan.com/

### Polygon Mainnet

- **Chain ID**: 137
- **RPC URL**: https://polygon-rpc.com/
- **Explorer**: https://polygonscan.com/

## Security Features

1. **Upgradeable Contracts** - UUPS pattern for safe contract upgrades
2. **Access Control** - Owner-based permissions with OpenZeppelin's Ownable
3. **Pausable Operations** - Emergency pause functionality
4. **Reentrancy Protection** - Guards against reentrancy attacks
5. **Input Validation** - Comprehensive validation of all inputs
6. **Error Handling** - Custom errors for gas-efficient error reporting

## Development Workflow

1. **Write Contracts** - Implement in `contracts/`
2. **Add Tests** - Create comprehensive tests in `test/`
3. **Compile** - `pnpm compile` to generate artifacts and types
4. **Test** - `pnpm test` to run the test suite
5. **Deploy** - `pnpm deploy:amoy` for testnet deployment
6. **Verify** - `pnpm verify <address>` to verify on explorer

## Gas Optimization

The contracts are optimized for gas efficiency:

- Custom errors instead of require strings
- Efficient storage packing
- Minimal external calls
- Gas reporter integration for monitoring

Run gas reports with: `pnpm test:gas`

## Testing

The test suite covers:

- ✅ Contract deployment and initialization
- ✅ All core functionality (deposits, loans, repayments)
- ✅ Access control and permissions
- ✅ Error conditions and edge cases
- ✅ Upgradeable functionality
- ✅ Gas usage optimization

## Contributing

1. Follow the existing code style and patterns
2. Add comprehensive tests for new functionality
3. Update documentation as needed
4. Ensure all tests pass before submitting
5. Use proper commit message formatting (see root CLAUDE.md)

## License

ISC License - See package.json for details.
