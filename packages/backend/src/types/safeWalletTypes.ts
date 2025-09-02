/**
 * Types for Safe wallet signature verification and EIP-1271 compatibility
 */

export interface SafeWalletVerification {
  signatureValidation: boolean
  ownershipVerification: boolean
  thresholdCheck: boolean
  safeVersionCompatibility: boolean
  verificationMethod: 'eip1271' | 'safe-sdk' | 'fallback'
  contractAddress?: string
}

export interface SafeWalletVerificationResult {
  isValid: boolean
  verification: SafeWalletVerification
  error?: string
  warnings?: string[]
}

export interface EIP1271VerificationParams {
  contractAddress: string
  messageHash: string
  signature: string
  provider: unknown // ethers provider
}

export interface SafeOwnershipVerification {
  isOwner: boolean
  threshold: number
  currentOwners: string[]
  requiredSignatures: number
}

export interface SafeVersionInfo {
  version: string
  isSupported: boolean
  features: {
    eip1271Support: boolean
    messageSigningSupport: boolean
    fallbackVerificationRequired: boolean
  }
}

export interface SafeWalletConfig {
  contractAddress: string
  chainId: number
  version?: string
  threshold?: number
  owners?: string[]
}

// EIP-1271 Constants
export const EIP1271_MAGIC_VALUE = '0x1626ba7e'
export const EIP1271_INTERFACE_ID = '0x1626ba7e'

// Safe wallet signature prefixes
export const SAFE_WALLET_SIGNATURE_PREFIX = 'safe-wallet:'

// Supported Safe versions (major versions that support EIP-1271)
export const SUPPORTED_SAFE_VERSIONS = ['1.0.0', '1.1.0', '1.2.0', '1.3.0', '1.4.0', '1.4.1', '1.5.0']

// Error types for Safe wallet verification
export enum SafeWalletVerificationError {
  INVALID_CONTRACT_ADDRESS = 'INVALID_CONTRACT_ADDRESS',
  CONTRACT_NOT_FOUND = 'CONTRACT_NOT_FOUND',
  NOT_A_SAFE_CONTRACT = 'NOT_A_SAFE_CONTRACT',
  UNSUPPORTED_SAFE_VERSION = 'UNSUPPORTED_SAFE_VERSION',
  INVALID_SIGNATURE_FORMAT = 'INVALID_SIGNATURE_FORMAT',
  SIGNATURE_VERIFICATION_FAILED = 'SIGNATURE_VERIFICATION_FAILED',
  OWNERSHIP_VERIFICATION_FAILED = 'OWNERSHIP_VERIFICATION_FAILED',
  THRESHOLD_CHECK_FAILED = 'THRESHOLD_CHECK_FAILED',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
}

// Safe contract ABI fragments for EIP-1271 and ownership verification
export const SAFE_CONTRACT_ABI_FRAGMENTS = [
  // EIP-1271 signature verification
  'function isValidSignature(bytes32 _dataHash, bytes _signature) external view returns (bytes4)',

  // Safe ownership and threshold information
  'function getOwners() external view returns (address[])',
  'function getThreshold() external view returns (uint256)',
  'function isOwner(address owner) external view returns (bool)',

  // Safe version information
  'function VERSION() external view returns (string)',

  // Safe domain separator (for EIP-712 compatibility)
  'function domainSeparator() external view returns (bytes32)',
]
