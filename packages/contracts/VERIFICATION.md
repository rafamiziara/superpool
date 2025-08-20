# Contract Verification Guide

This guide provides comprehensive instructions for verifying SuperPool smart contracts on Polygonscan using automated and manual methods.

## Table of Contents

- [Quick Start](#quick-start)
- [Automatic Verification](#automatic-verification)
- [Manual Verification](#manual-verification)
- [Proxy Contract Verification](#proxy-contract-verification)
- [Troubleshooting](#troubleshooting)
- [Environment Setup](#environment-setup)
- [API Keys](#api-keys)

## Quick Start

### Automated Verification (Recommended)

Our deployment scripts automatically verify contracts when deploying to public networks:

```bash
# Deploy to Polygon Amoy with automatic verification
pnpm deploy:amoy

# Deploy locally (verification is skipped)
pnpm deploy:local
```

### Manual Verification

If automatic verification fails or you need to verify specific contracts:

```bash
# Verify a specific contract
pnpm verify:contracts SampleLendingPool 0x123... [constructorArgs...]

# Verify a proxy contract
pnpm verify:proxy 0x123...

# Verify using Hardhat directly
pnpm verify 0x123... [constructorArgs...]
```

## Automatic Verification

### How It Works

Our deployment scripts include automatic verification that:

1. **Detects Network**: Skips verification on local networks (`localhost`, `hardhat`)
2. **Waits for Confirmations**: Ensures contracts are deployed before verification
3. **Handles Retries**: Attempts verification up to 3 times with exponential backoff
4. **Provides Fallbacks**: Shows manual verification commands if automatic fails

### Verification Flow

```
Deploy Contract → Wait for Confirmations → Verify Implementation → Verify Proxy → Report Status
```

### Networks Supported

- ✅ **Polygon Amoy Testnet** (`polygonAmoy`)
- ✅ **Polygon Mainnet** (`polygon`)
- ⏭️ **Local Networks** (verification skipped)

## Manual Verification

### Using Verification Scripts

#### 1. Verify Individual Contracts

```bash
# Basic contract verification
pnpm verify:contracts <contractName> <address>

# Contract with constructor arguments
pnpm verify:contracts SampleLendingPool 0x123... 0xOwnerAddress 1000000000000000000 500 604800

# Examples:
pnpm verify:contracts SampleLendingPool 0x742d35Cc6634C0532925a3b8D45b9F73F9d9432A
pnpm verify:contracts PoolFactory 0x5F4eC3Df9cbd43714FE2740f5E3616155c5b8419 0xOwnerAddress 0xImplementationAddress
```

#### 2. Verify Proxy Contracts

```bash
# Verify UUPS proxy with implementation
pnpm verify:proxy 0x123...

# This will:
# 1. Find the implementation address
# 2. Verify the implementation contract
# 3. Verify the proxy contract
# 4. Attempt Sourcify verification
```

#### 3. Direct Hardhat Verification

```bash
# For simple contracts
pnpm hardhat verify --network polygonAmoy 0x123...

# For contracts with constructor arguments
pnpm hardhat verify --network polygonAmoy 0x123... "arg1" "arg2" "arg3"
```

### Constructor Arguments

#### SampleLendingPool Implementation

```bash
# No constructor arguments (uses initialize instead)
pnpm verify:contracts SampleLendingPool 0x123...
```

#### PoolFactory Implementation

```bash
# No constructor arguments (uses initialize instead)
pnpm verify:contracts PoolFactory 0x123...
```

#### Sample Pool (via PoolFactory)

Sample pools are created through the factory and inherit verification from the implementation.

## Proxy Contract Verification

### Understanding Proxy Verification

SuperPool uses UUPS (Universal Upgradeable Proxy Standard) proxies:

- **Proxy Contract**: The deployed address users interact with
- **Implementation Contract**: Contains the actual logic
- **Both need verification** for full transparency

### Verification Strategy

1. **Implementation First**: Always verify the implementation contract
2. **Proxy Second**: Verify the proxy (may fail, this is normal)
3. **Sourcify Backup**: Attempt Sourcify verification as fallback

### Common Proxy Verification Issues

- ✅ **Implementation verified**: Most important for transparency
- ⚠️ **Proxy verification fails**: Common and acceptable
- 💡 **Users can still interact**: Via implementation verification

## Troubleshooting

### Common Issues and Solutions

#### 1. "Already Verified" Error

```
Solution: Contract is already verified ✅
Action: No action needed
```

#### 2. "Invalid API Key" Error

```
Error: Invalid API Key
Solution: Check ETHERSCAN_API_KEY in .env file
Action: Get API key from https://etherscan.io/apis
```

#### 3. "Contract not found" Error

```
Error: Contract source code not found
Solution: Wait for more block confirmations
Action: Wait 5-10 minutes and retry
```

#### 4. "Constructor arguments mismatch" Error

```
Error: Constructor arguments do not match
Solution: Check constructor arguments order and format
Action: Use verify:contracts script with correct args
```

#### 5. "Compilation errors" Error

```
Error: Compilation errors in verification
Solution: Ensure compiler settings match deployment
Action: Check hardhat.config.ts solidity version and optimization
```

### Debug Mode

Enable debug output by setting environment variable:

```bash
export DEBUG=true
pnpm verify:contracts ContractName 0x123...
```

### Manual Verification Commands

If all automated methods fail:

```bash
# 1. Get implementation address (for proxies)
pnpm hardhat console --network polygonAmoy
> const impl = await upgrades.erc1967.getImplementationAddress("0x123...")
> console.log(impl)

# 2. Verify implementation
pnpm hardhat verify --network polygonAmoy <implementation_address>

# 3. Try proxy verification
pnpm hardhat verify --network polygonAmoy <proxy_address>
```

## Environment Setup

### Required Environment Variables

Create or update `.env` file in `packages/contracts/`:

```bash
# Essential for verification
ETHERSCAN_API_KEY=your_etherscan_api_key_here

# Required for deployment
PRIVATE_KEY=your_private_key_without_0x_prefix
POLYGON_AMOY_RPC_URL=https://rpc-amoy.polygon.technology/

# Optional for gas reporting
COINMARKETCAP_API_KEY=your_coinmarketcap_api_key
REPORT_GAS=true
```

### Network Configuration

Verification is configured in `hardhat.config.ts`:

```typescript
etherscan: {
  apiKey: {
    polygonAmoy: process.env.ETHERSCAN_API_KEY || '',
    polygon: process.env.ETHERSCAN_API_KEY || '',
  },
  customChains: [
    {
      network: 'polygonAmoy',
      chainId: 80002,
      urls: {
        apiURL: 'https://api-amoy.polygonscan.com/api',
        browserURL: 'https://amoy.polygonscan.com',
      },
    },
  ],
}
```

## API Keys

### Etherscan API Key Setup

1. **Visit Etherscan**: Go to https://etherscan.io/apis
2. **Create Account**: Sign up or log in
3. **Generate API Key**: Create a new API key
4. **Add to Environment**: Add to `.env` file as `ETHERSCAN_API_KEY`

### Key Features

- ✅ **Multichain Support**: Works for Polygon via Etherscan API v2
- ✅ **Free Tier Available**: Basic verification included
- ✅ **Rate Limiting**: Automatic retry with backoff
- ✅ **Secure**: Never commit API keys to repository

### API Limits

- **Free Tier**: 5 requests/second, 100,000 requests/day
- **Pro Tier**: Higher limits available
- **Rate Limiting**: Scripts include automatic retry logic

## Verification Scripts Reference

### Available Scripts

| Script                  | Purpose                    | Usage                                              |
| ----------------------- | -------------------------- | -------------------------------------------------- |
| `verify:contracts`      | Verify any contract        | `pnpm verify:contracts <name> <address> [args...]` |
| `verify:proxy`          | Verify UUPS proxy          | `pnpm verify:proxy <address>`                      |
| `verify:implementation` | Alias for verify:contracts | `pnpm verify:implementation <name> <address>`      |
| `verify`                | Direct Hardhat verify      | `pnpm verify <address> [args...]`                  |

### Script Locations

- **verify-contracts.ts**: Comprehensive verification with retry logic
- **verify-proxy.ts**: Specialized proxy verification
- **deploy.ts**: Includes automatic verification
- **deploy-local.ts**: Includes verification (skipped on localhost)

## Best Practices

### During Development

1. **Test Locally First**: Always deploy and test on localhost
2. **Use Testnet**: Deploy to Polygon Amoy before mainnet
3. **Verify Immediately**: Run verification right after deployment
4. **Save Addresses**: Keep track of deployed contract addresses

### For Production

1. **Multi-sig Ownership**: Transfer ownership to multi-sig after verification
2. **Double-check Verification**: Manually verify critical contracts
3. **Document Addresses**: Maintain a record of all verified contracts
4. **Monitor Status**: Regularly check verification status

### Security Notes

- 🔒 **Never commit private keys**
- 🔒 **Use environment variables for sensitive data**
- 🔒 **Verify contracts immediately after deployment**
- 🔒 **Double-check constructor arguments**

## Support

### Getting Help

1. **Check This Guide**: Most issues are covered here
2. **Review Error Messages**: Often contain helpful information
3. **Check Network Status**: Ensure Polygon Amoy is operational
4. **Retry After Wait**: Many issues resolve with time

### Useful Links

- [Polygonscan Amoy](https://amoy.polygonscan.com/)
- [Polygonscan Mainnet](https://polygonscan.com/)
- [Etherscan API Documentation](https://docs.etherscan.io/)
- [OpenZeppelin Upgrades](https://docs.openzeppelin.com/upgrades-plugins/1.x/)
- [Hardhat Verification](https://hardhat.org/plugins/nomiclabs-hardhat-etherscan.html)

---

**Last Updated**: December 2024  
**Related Issue**: [#26 - Add contract verification automation](https://github.com/rafamiziara/superpool/issues/26)
