import type {
  ContributeTransaction,
  CreatePoolTransaction,
  LoanParams,
  LoanTransaction,
  LoanTransactionType,
} from '../../stores/PendingTransactionsStore'

/**
 * The one place a `PendingTransaction` is built for tests.
 *
 * Every field on the record is a field the store persists and validates, so a
 * new one has to be added here and nowhere else. Pass `overrides` for whatever
 * the test is actually about; leave the rest alone.
 *
 * There is a builder per transaction type rather than one taking a `type`,
 * because `params` is discriminated by it — a single builder would have to
 * accept a union and every call site would lose its narrowing.
 */

/** A full-length hash: the store rejects anything that is not 0x + 64 hex. */
export const TX_HASH = '0xaaaa000000000000000000000000000000000000000000000000000000000001'

/** A second hash, for tests that need two records in flight. */
export const OTHER_TX_HASH = '0xbbbb000000000000000000000000000000000000000000000000000000000002'

/** Hardhat. 31337, not Viem's `localhost` 1337 — the node and every deployment use this. */
export const LOCALHOST_CHAIN_ID = 31337

/** Fixed, not `Date.now()`: an age-dependent assertion should opt in explicitly. */
export const TIMESTAMP = 1_760_000_000_000

/** A deployed pool's address, for contribution records. */
export const POOL_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3'

export function makePendingTransaction(overrides: Partial<CreatePoolTransaction> = {}): CreatePoolTransaction {
  return {
    txHash: TX_HASH,
    chainId: LOCALHOST_CHAIN_ID,
    type: 'CREATE_POOL',
    status: 'submitted',
    timestamp: TIMESTAMP,
    // The same pool the create-form tests build, so a rendered card reads
    // "Neighbourhood Fund / 100 POL / 5% / 30 days" everywhere.
    params: {
      name: 'Neighbourhood Fund',
      description: 'Micro-loans for the block',
      maxLoanAmount: '100000000000000000000',
      interestRate: 500,
      loanDuration: 2_592_000,
    },
    ...overrides,
  }
}

export function makeContributeTransaction(overrides: Partial<ContributeTransaction> = {}): ContributeTransaction {
  return {
    txHash: TX_HASH,
    chainId: LOCALHOST_CHAIN_ID,
    type: 'CONTRIBUTE',
    status: 'submitted',
    timestamp: TIMESTAMP,
    // Into the same pool `makePendingTransaction` creates, so the two fixtures
    // tell one story when a test uses both.
    params: {
      poolId: 1,
      poolAddress: POOL_ADDRESS,
      poolName: 'Neighbourhood Fund',
      amount: '5000000000000000000',
    },
    ...overrides,
  }
}

/** Whoever the owner is deciding about, when a fixture needs a borrower named. */
export const BORROWER_ADDRESS = '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65'

export const LOAN_PARAMS: LoanParams = {
  poolId: 1,
  poolAddress: POOL_ADDRESS,
  poolName: 'Neighbourhood Fund',
  amount: '5000000000000000000',
}

/**
 * One loan action, out of the same pool as the fixtures above.
 *
 * A single builder here rather than six, unlike the pattern above, because the
 * six share `LoanParams` exactly — the `type` is the only thing that varies, and
 * it is what the caller is usually testing.
 *
 * Defaults to a borrow, whose params carry **no** `loanId`: the contract assigns
 * it, so its absence is the normal state rather than an incomplete fixture.
 */
export function makeLoanTransaction(overrides: Partial<LoanTransaction<LoanTransactionType>> = {}): LoanTransaction<LoanTransactionType> {
  return {
    txHash: TX_HASH,
    chainId: LOCALHOST_CHAIN_ID,
    type: 'BORROW',
    status: 'submitted',
    timestamp: TIMESTAMP,
    params: LOAN_PARAMS,
    ...overrides,
  }
}
