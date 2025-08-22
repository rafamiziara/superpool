// Blockchain and wallet related types

export interface Chain {
  id: number
  name: string
  network: string
  nativeCurrency: {
    name: string
    symbol: string
    decimals: number
  }
  rpcUrls: {
    public: { http: string[] }
    default: { http: string[] }
  }
  blockExplorers?: {
    default: {
      name: string
      url: string
    }
  }
  contracts?: {
    multicall3?: {
      address: string
      blockCreated?: number
    }
  }
  testnet?: boolean
}

export interface WalletConnection {
  address: string
  chainId: number
  isConnected: boolean
  connector?: string
}

export interface ContractConfig {
  address: string
  abi: any[]
  deployedAt?: number
}

export interface NetworkConfig {
  chainId: number
  name: string
  rpcUrl: string
  blockExplorerUrl?: string
  contracts: {
    poolFactory: ContractConfig
    multiSig?: ContractConfig
  }
}

// Smart contract event types
export interface PoolCreatedEvent {
  poolAddress: string
  creator: string
  poolId: string
  name: string
  blockNumber: number
  transactionHash: string
  timestamp: Date
}

export interface MemberAddedEvent {
  poolAddress: string
  member: string
  addedBy: string
  blockNumber: number
  transactionHash: string
  timestamp: Date
}

export interface ContributionEvent {
  poolAddress: string
  contributor: string
  amount: bigint
  blockNumber: number
  transactionHash: string
  timestamp: Date
}

export interface LoanRequestEvent {
  poolAddress: string
  borrower: string
  amount: bigint
  loanId: string
  blockNumber: number
  transactionHash: string
  timestamp: Date
}

export interface LoanApprovedEvent {
  poolAddress: string
  borrower: string
  amount: bigint
  loanId: string
  approvedBy: string
  blockNumber: number
  transactionHash: string
  timestamp: Date
}
