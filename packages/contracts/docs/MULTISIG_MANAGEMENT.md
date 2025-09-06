# Multi-Sig Management and Emergency Procedures

This document outlines the procedures for managing the SuperPool PoolFactory through Safe multi-signature wallets, including ownership transfer, emergency procedures, and ongoing management.

## Table of Contents

1. [Overview](#overview)
2. [Safe Wallet Setup](#safe-wallet-setup)
3. [Ownership Transfer Process](#ownership-transfer-process)
4. [Multi-Sig Operations](#multi-sig-operations)
5. [Emergency Procedures](#emergency-procedures)
6. [Security Best Practices](#security-best-practices)
7. [Troubleshooting](#troubleshooting)

## Overview

The SuperPool PoolFactory uses OpenZeppelin's `Ownable2StepUpgradeable` pattern for secure ownership management, integrated with Safe multi-signature wallets for enhanced security and decentralized governance.

### Key Features

- **Two-Step Ownership Transfer**: Prevents accidental ownership transfers
- **Safe Multi-Sig Integration**: Requires multiple signatures for critical operations
- **Emergency Functions**: Quick response capabilities for security incidents
- **Comprehensive Verification**: Built-in ownership status checking

### Supported Networks

- **Local Development**: Hardhat/Localhost (Chain ID: 31337)
- **Testnet**: Polygon Amoy (Chain ID: 80002)
- **Mainnet**: Polygon (Chain ID: 137)

## Safe Wallet Setup

### Prerequisites

- Node.js and pnpm installed
- Safe CLI or Safe web interface access
- Multiple trusted signers with Ethereum addresses
- Sufficient POL for transaction fees

### 1. Deploy Safe Wallet

```bash
cd packages/contracts

# Deploy on localhost (for testing)
pnpm safe:deploy:local

# Deploy on Polygon Amoy (testnet)
pnpm safe:deploy:amoy

# Deploy on Polygon (mainnet)
pnpm safe:deploy
```

### 2. Configure Safe Parameters

Edit the Safe configuration in the deployment script or use environment variables:

```bash
# .env configuration
SAFE_OWNERS=0xAddress1,0xAddress2,0xAddress3
SAFE_THRESHOLD=2
SAFE_SALT_NONCE=0x1234567890abcdef
```

### 3. Verify Safe Deployment

```typescript
// Example Safe configuration
const safeConfig = {
  owners: ['0xOwner1Address', '0xOwner2Address', '0xOwner3Address'],
  threshold: 2, // 2 out of 3 signatures required
  saltNonce: '0x1234567890abcdef',
}
```

### Recommended Configurations

| Environment | Owners | Threshold | Description                     |
| ----------- | ------ | --------- | ------------------------------- |
| Development | 3      | 2         | 2-of-3 for testing              |
| Testnet     | 3-5    | 2-3       | 2-of-3 or 3-of-5 for validation |
| Mainnet     | 5-7    | 3-4       | 3-of-5 or 4-of-7 for production |

## Ownership Transfer Process

### Phase 1: Pre-Transfer Preparation

1. **Verify Current State**

   ```bash
   pnpm transfer:ownership verify <POOL_FACTORY_ADDRESS>
   ```

2. **Deploy Safe Wallet** (if not already deployed)

   ```bash
   pnpm safe:deploy:amoy  # or appropriate network
   ```

3. **Confirm Safe Configuration**
   - Verify owners and threshold
   - Test Safe functionality with small transactions
   - Ensure all signers have access

### Phase 2: Initiate Transfer

1. **Start Ownership Transfer**

   ```bash
   pnpm transfer:ownership:amoy initiate <POOL_FACTORY_ADDRESS> <SAFE_ADDRESS>
   ```

2. **Verify Pending Status**

   ```bash
   pnpm transfer:ownership verify <POOL_FACTORY_ADDRESS> <SAFE_ADDRESS>
   ```

   Expected output:

   ```
   Current Owner: 0xCurrentOwnerAddress
   Pending Owner: 0xSafeWalletAddress
   Has Pending Transfer: true
   ```

3. **Test Current Owner Functionality**
   - Current owner retains full control during pending phase
   - Safe cannot perform owner functions yet
   - Pending transfer can be modified if needed

### Phase 3: Complete Transfer

1. **Prepare Acceptance Transaction**

   ```bash
   pnpm transfer:ownership:amoy complete <POOL_FACTORY_ADDRESS> <SAFE_ADDRESS>
   ```

2. **Collect Signatures**
   - Transaction will be prepared in Safe
   - Required number of signers must approve
   - Use Safe web interface or CLI for signatures

3. **Execute Transfer**

   ```bash
   pnpm transfer:ownership:amoy complete <POOL_FACTORY_ADDRESS> <SAFE_ADDRESS> --execute
   ```

4. **Verify Completion**

   ```bash
   pnpm transfer:ownership verify <POOL_FACTORY_ADDRESS> <SAFE_ADDRESS>
   ```

   Expected output:

   ```
   Current Owner: 0xSafeWalletAddress
   Pending Owner: None
   Has Pending Transfer: false
   ```

## Multi-Sig Operations

### Pool Creation

All pool creation operations require multi-sig approval:

```solidity
function createPool(PoolParams calldata _params) external onlyOwner
```

**Process:**

1. Prepare transaction data
2. Submit to Safe for approval
3. Collect required signatures
4. Execute transaction

### Pool Management

**Deactivate Pool:**

```bash
# Prepare transaction through Safe
safe-cli tx <SAFE_ADDRESS> <POOL_FACTORY_ADDRESS> "deactivatePool(uint256)" <POOL_ID>
```

**Update Implementation:**

```bash
# Prepare transaction through Safe
safe-cli tx <SAFE_ADDRESS> <POOL_FACTORY_ADDRESS> "updateImplementation(address)" <NEW_IMPLEMENTATION>
```

### Contract Upgrades

UUPS upgrades require owner approval:

```solidity
function _authorizeUpgrade(address newImplementation) internal override onlyOwner
```

**Upgrade Process:**

1. Deploy new implementation
2. Prepare upgrade transaction through Safe
3. Collect signatures from required threshold
4. Execute upgrade

## Emergency Procedures

### Emergency Pause

For immediate response to security threats:

```bash
# Through Safe multi-sig
safe-cli tx <SAFE_ADDRESS> <POOL_FACTORY_ADDRESS> "emergencyPause()"
```

**Effect:**

- Stops all pool creation
- Prevents most contract interactions
- Allows investigation and remediation

### Emergency Unpause

After threat resolution:

```bash
# Through Safe multi-sig
safe-cli tx <SAFE_ADDRESS> <POOL_FACTORY_ADDRESS> "emergencyUnpause()"
```

### Incident Response Workflow

1. **Immediate Response (0-1 hour)**
   - Identify threat/vulnerability
   - Execute emergency pause if needed
   - Notify all signers
   - Begin investigation

2. **Assessment (1-4 hours)**
   - Analyze scope and impact
   - Determine remediation steps
   - Prepare response plan
   - Coordinate with team

3. **Remediation (4-24 hours)**
   - Implement fixes
   - Deploy updates if needed
   - Test solutions
   - Prepare for resumption

4. **Recovery (24+ hours)**
   - Execute emergency unpause
   - Monitor system health
   - Communicate status
   - Post-incident review

### Emergency Contact Protocol

| Role           | Primary Contact | Backup Contact |
| -------------- | --------------- | -------------- |
| Technical Lead | Slack/Discord   | Email/Phone    |
| Security Team  | 24/7 Hotline    | Slack          |
| Operations     | Email           | SMS Alert      |

## Security Best Practices

### Signer Management

1. **Key Security**
   - Use hardware wallets for production
   - Never share private keys
   - Regular key rotation schedule
   - Secure backup procedures

2. **Access Control**
   - Minimum required threshold
   - Geographic distribution of signers
   - Regular access reviews
   - Immediate revocation procedures

3. **Communication**
   - Secure channels for coordination
   - Clear escalation procedures
   - Regular training and drills
   - Incident response plans

### Transaction Verification

1. **Before Signing**
   - Verify transaction details
   - Confirm contract addresses
   - Check parameters and values
   - Validate against approved proposals

2. **Monitoring**
   - Real-time transaction alerts
   - Regular balance checks
   - Audit trail maintenance
   - Automated anomaly detection

### Operational Security

1. **Regular Audits**
   - Quarterly Safe configuration review
   - Annual security assessment
   - Penetration testing
   - Code review cycles

2. **Backup Procedures**
   - Safe configuration backups
   - Recovery procedures documentation
   - Test recovery processes
   - Alternative communication channels

## Troubleshooting

### Common Issues

#### 1. Pending Transfer Stuck

**Symptoms:**

- Transfer initiated but not completed
- Pending owner cannot accept ownership

**Resolution:**

```bash
# Check current status
pnpm transfer:ownership verify <FACTORY_ADDRESS> <SAFE_ADDRESS>

# If needed, initiate new transfer (overwrites pending)
pnpm transfer:ownership:amoy initiate <FACTORY_ADDRESS> <SAFE_ADDRESS>
```

#### 2. Safe Transaction Fails

**Symptoms:**

- Transaction reverts during execution
- Insufficient signatures
- Gas estimation fails

**Resolution:**

1. Verify Safe has sufficient balance for gas
2. Check all required signatures are collected
3. Validate transaction data and parameters
4. Retry with higher gas limit if needed

#### 3. Access Control Errors

**Symptoms:**

- `OwnableUnauthorizedAccount` errors
- Functions reverting for authorized users

**Resolution:**

```bash
# Verify current ownership
pnpm transfer:ownership verify <FACTORY_ADDRESS>

# Check if transfer is complete
# Ensure calling from correct Safe address
```

#### 4. Emergency Functions Not Working

**Symptoms:**

- Emergency pause/unpause fails
- Cannot execute emergency procedures

**Resolution:**

1. Verify Safe is current owner
2. Check transaction is properly formatted
3. Ensure sufficient signatures collected
4. Validate Safe has execution permissions

### Recovery Procedures

#### Lost Signer Access

1. **Immediate Steps**
   - Assess remaining signer capacity
   - Check if threshold still achievable
   - Document the incident
   - Notify other signers

2. **Threshold Still Achievable**
   - Continue operations with remaining signers
   - Plan signer replacement
   - Update Safe configuration when possible

3. **Threshold Not Achievable**
   - **CRITICAL SITUATION**
   - Contact all available signers immediately
   - Consider emergency governance procedures
   - May require contract upgrade or migration

#### Safe Compromise

1. **Immediate Response**
   - Execute emergency pause
   - Isolate compromised components
   - Secure remaining assets
   - Document all activities

2. **Assessment**
   - Determine scope of compromise
   - Identify affected systems
   - Assess potential damage
   - Plan recovery strategy

3. **Recovery**
   - Deploy new Safe if needed
   - Transfer critical functions
   - Restore operations gradually
   - Implement additional security measures

### Support Contacts

| Issue Type         | Contact Method    | Response Time |
| ------------------ | ----------------- | ------------- |
| Critical Security  | Emergency Hotline | < 1 hour      |
| Operational Issues | Slack/Discord     | < 4 hours     |
| General Questions  | Email/GitHub      | < 24 hours    |
| Documentation      | GitHub Issues     | < 48 hours    |

---

## Appendix

### Useful Commands

```bash
# Deploy Safe wallet
pnpm safe:deploy:local
pnpm safe:deploy:amoy

# Transfer ownership
pnpm transfer:ownership:local initiate <FACTORY> <SAFE>
pnpm transfer:ownership:local complete <FACTORY> <SAFE>
pnpm transfer:ownership:local verify <FACTORY> [SAFE]

# Test complete flow
npx hardhat run scripts/test-local-flow.ts --network localhost
```

### Contract Addresses

| Network         | PoolFactory | Safe |
| --------------- | ----------- | ---- |
| Localhost       | TBD         | TBD  |
| Polygon Amoy    | TBD         | TBD  |
| Polygon Mainnet | TBD         | TBD  |

### External Resources

- [Safe Documentation](https://docs.safe.global/)
- [OpenZeppelin Ownable2Step](https://docs.openzeppelin.com/contracts/4.x/api/access#Ownable2Step)
- [Polygon Network Information](https://polygon.technology/)
- [Hardhat Documentation](https://hardhat.org/docs)

---

_This document should be reviewed and updated regularly to reflect current procedures and lessons learned from operations._
