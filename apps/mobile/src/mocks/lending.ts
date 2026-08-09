import type { Loan, PoolInfo, PoolMember, Transaction } from '@superpool/types'
import { LoanStatus, MemberStatus, TransactionStatus, TransactionType } from '@superpool/types'
import { parseEther } from 'viem'

/**
 * Mock data for UX/UI validation.
 * Shapes mirror the real backend/contract payloads exactly:
 * - PoolInfo   -> `listPools` Cloud Function response (PoolFactory.PoolInfo)
 * - Loan/PoolMember/Transaction -> shared @superpool/types used by Firestore sync
 * TODO: replace with httpsCallable('listPools') + Firestore listeners when wiring the backend.
 */

// TODO: stand-in for authStore.walletAddress until real data replaces mocks
export const MOCK_USER_ADDRESS = '0x7c3eD3a184BAab1DAF35F5387bA23736C7cd18A6'

const CHAIN_ID = 80002 // Polygon Amoy

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000)
const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000)
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000)

export const MOCK_POOLS: PoolInfo[] = [
  {
    poolId: 1,
    poolAddress: '0x91bC24Da032F32d94F7A0AE55a3f11b8A85e0d31',
    poolOwner: '0x3F8a9d21E4C09b7cd51B04E1F2a6cC7382E4b9a0',
    name: 'Builders Guild',
    description: 'Working capital for indie devs shipping on Polygon. Short cycles, fair terms.',
    maxLoanAmount: parseEther('500').toString(),
    interestRate: 450,
    loanDuration: 30 * 86_400,
    chainId: CHAIN_ID,
    createdBy: '0x3F8a9d21E4C09b7cd51B04E1F2a6cC7382E4b9a0',
    createdAt: daysAgo(92),
    transactionHash: '0x5f0e8c1a9b2d374650f8ee12ab34cd56ef7890a1b2c3d4e5f60718293a4b5c6d',
    isActive: true,
  },
  {
    poolId: 2,
    poolAddress: '0xB44e91C7a2De83F05C619b8De7cD10aF29385c12',
    poolOwner: MOCK_USER_ADDRESS,
    name: 'Family Circle',
    description: 'Our private safety net. Zero drama, quick help between people who trust each other.',
    maxLoanAmount: parseEther('200').toString(),
    interestRate: 250,
    loanDuration: 14 * 86_400,
    chainId: CHAIN_ID,
    createdBy: MOCK_USER_ADDRESS,
    createdAt: daysAgo(210),
    transactionHash: '0x1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809',
    isActive: true,
  },
  {
    poolId: 3,
    poolAddress: '0x6D20Ff18e5B934cd7A2E9C4b81f3Da60C5e7A844',
    poolOwner: '0xE19C4f7B2a35D80cA6b1F92dE43700B5c8Fa2d17',
    name: 'Mercado Vecinal',
    description: 'Neighborhood merchants funding inventory together — restock now, repay after the weekend rush.',
    maxLoanAmount: parseEther('1000').toString(),
    interestRate: 800,
    loanDuration: 60 * 86_400,
    chainId: CHAIN_ID,
    createdBy: '0xE19C4f7B2a35D80cA6b1F92dE43700B5c8Fa2d17',
    createdAt: daysAgo(45),
    transactionHash: '0x9e8d7c6b5a493827160f5e4d3c2b1a09f8e7d6c5b4a3928170f6e5d4c3b2a190',
    isActive: true,
  },
  {
    poolId: 4,
    poolAddress: '0x0Aa731eD9C24B6f8E3d15C97a40Fb2D6E8391B55',
    poolOwner: '0x52D8c1E93BfA6704e2C7d90A1b34F8Ce6D5a0F28',
    name: 'Campus Fund',
    description: 'Students covering tuition gaps and laptop emergencies. Vouched members only.',
    maxLoanAmount: parseEther('150').toString(),
    interestRate: 300,
    loanDuration: 21 * 86_400,
    chainId: CHAIN_ID,
    createdBy: '0x52D8c1E93BfA6704e2C7d90A1b34F8Ce6D5a0F28',
    createdAt: daysAgo(12),
    transactionHash: '0x2f3e4d5c6b7a8091f2e3d4c5b6a798012f3e4d5c6b7a8091f2e3d4c5b6a79801',
    isActive: true,
  },
]

export const MOCK_MEMBERSHIPS: PoolMember[] = [
  {
    walletAddress: MOCK_USER_ADDRESS,
    poolId: '1',
    joinedAt: daysAgo(88),
    totalContributed: parseEther('180'),
    currentBalance: parseEther('195.4'),
    isAdmin: false,
    status: MemberStatus.ACTIVE,
  },
  {
    walletAddress: MOCK_USER_ADDRESS,
    poolId: '2',
    joinedAt: daysAgo(210),
    totalContributed: parseEther('320'),
    currentBalance: parseEther('331.2'),
    isAdmin: true,
    status: MemberStatus.ACTIVE,
  },
  {
    walletAddress: MOCK_USER_ADDRESS,
    poolId: '3',
    joinedAt: daysAgo(30),
    totalContributed: parseEther('75'),
    currentBalance: parseEther('75'),
    isAdmin: false,
    status: MemberStatus.ACTIVE,
  },
  {
    walletAddress: MOCK_USER_ADDRESS,
    poolId: '4',
    joinedAt: daysAgo(2),
    totalContributed: 0n,
    currentBalance: 0n,
    isAdmin: false,
    status: MemberStatus.PENDING,
  },
]

export const MOCK_LOANS: Loan[] = [
  {
    id: 'loan-1',
    poolId: '3',
    borrower: MOCK_USER_ADDRESS,
    amount: parseEther('120'),
    interestRate: 800,
    duration: 60 * 86_400,
    status: LoanStatus.DISBURSED,
    amountRepaid: parseEther('45'),
    interestAccrued: parseEther('3.2'),
    requestedAt: daysAgo(20),
    approvedAt: daysAgo(19),
    disbursedAt: daysAgo(18),
    dueDate: daysFromNow(42),
  },
  {
    id: 'loan-2',
    poolId: '1',
    borrower: MOCK_USER_ADDRESS,
    amount: parseEther('60'),
    interestRate: 450,
    duration: 30 * 86_400,
    status: LoanStatus.REQUESTED,
    amountRepaid: 0n,
    interestAccrued: 0n,
    requestedAt: hoursAgo(6),
  },
  {
    id: 'loan-3',
    poolId: '2',
    borrower: MOCK_USER_ADDRESS,
    amount: parseEther('80'),
    interestRate: 250,
    duration: 14 * 86_400,
    status: LoanStatus.REPAID,
    amountRepaid: parseEther('80.8'),
    interestAccrued: parseEther('0.8'),
    requestedAt: daysAgo(58),
    approvedAt: daysAgo(57),
    disbursedAt: daysAgo(56),
    dueDate: daysAgo(42),
    repaidAt: daysAgo(44),
  },
]

export const MOCK_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx-1',
    poolId: '2',
    from: MOCK_USER_ADDRESS,
    type: TransactionType.CONTRIBUTION,
    amount: parseEther('25'),
    status: TransactionStatus.PENDING,
    createdAt: new Date(Date.now() - 2 * 60_000),
  },
  {
    id: 'tx-2',
    poolId: '3',
    from: MOCK_USER_ADDRESS,
    type: TransactionType.LOAN_REPAYMENT,
    amount: parseEther('15'),
    status: TransactionStatus.CONFIRMED,
    txHash: '0xa1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
    blockNumber: 15_482_031,
    createdAt: hoursAgo(5),
    confirmedAt: hoursAgo(5),
  },
  {
    id: 'tx-3',
    poolId: '1',
    from: MOCK_USER_ADDRESS,
    type: TransactionType.CONTRIBUTION,
    amount: parseEther('40'),
    status: TransactionStatus.CONFIRMED,
    txHash: '0xb2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1',
    blockNumber: 15_431_882,
    createdAt: daysAgo(1),
    confirmedAt: daysAgo(1),
  },
  {
    id: 'tx-4',
    poolId: '3',
    from: '0x6D20Ff18e5B934cd7A2E9C4b81f3Da60C5e7A844',
    to: MOCK_USER_ADDRESS,
    type: TransactionType.LOAN_DISBURSEMENT,
    amount: parseEther('120'),
    status: TransactionStatus.CONFIRMED,
    txHash: '0xc3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2',
    blockNumber: 15_204_117,
    createdAt: daysAgo(18),
    confirmedAt: daysAgo(18),
  },
  {
    id: 'tx-5',
    poolId: '2',
    from: MOCK_USER_ADDRESS,
    type: TransactionType.WITHDRAWAL,
    amount: parseEther('50'),
    status: TransactionStatus.CONFIRMED,
    txHash: '0xd4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3',
    blockNumber: 15_101_559,
    createdAt: daysAgo(9),
    confirmedAt: daysAgo(9),
  },
  {
    id: 'tx-6',
    poolId: '2',
    from: MOCK_USER_ADDRESS,
    type: TransactionType.POOL_CREATION,
    amount: 0n,
    status: TransactionStatus.CONFIRMED,
    txHash: '0x1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809',
    blockNumber: 12_990_004,
    createdAt: daysAgo(210),
    confirmedAt: daysAgo(210),
  },
]
