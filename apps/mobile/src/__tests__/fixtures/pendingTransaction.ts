import type { PendingTransaction } from '../../stores/PendingTransactionsStore'

/**
 * The one place a `PendingTransaction` is built for tests.
 *
 * Every field on the record is a field the store persists and validates, so a
 * new one has to be added here and nowhere else. Pass `overrides` for whatever
 * the test is actually about; leave the rest alone.
 */

/** A full-length hash: the store rejects anything that is not 0x + 64 hex. */
export const TX_HASH = '0xaaaa000000000000000000000000000000000000000000000000000000000001'

/** A second hash, for tests that need two records in flight. */
export const OTHER_TX_HASH = '0xbbbb000000000000000000000000000000000000000000000000000000000002'

/** Hardhat. 31337, not Viem's `localhost` 1337 — the node and every deployment use this. */
export const LOCALHOST_CHAIN_ID = 31337

/** Fixed, not `Date.now()`: an age-dependent assertion should opt in explicitly. */
export const TIMESTAMP = 1_760_000_000_000

export function makePendingTransaction(overrides: Partial<PendingTransaction> = {}): PendingTransaction {
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
