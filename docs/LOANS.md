# Loans

How money leaves a pool and comes back. Companion to
[`CONTRIBUTIONS.md`](CONTRIBUTIONS.md), which covers how it gets in.

Everything below is verified against a running Hardhat node and the Firestore
emulator, not only against mocked tests.

## The shape of it

```
BorrowForm (POL)          → wei
useLoan.borrow            → createLoan from the borrower's own wallet
useTransactionMonitoring  → waits for the receipt, decodes LoanCreated
usePoolIndexing           → indexLoan
loanIndexer               → reads getLoan, writes one document per loan
listLoans                 → the app derives its Loan shape from it
```

Repaying takes the same path with `repayLoan` and `LoanRepaid`, and lands on the
**same document**.

## Why a loan is not an event

Contributions and withdrawals are events: one log, one immutable record, keyed
`${chainId}-${txHash}-${logIndex}`. A loan is not. It is created by
`LoanCreated` and settled later by `LoanRepaid`, so one entity is described by
two logs at different blocks.

Three consequences, all load-bearing:

- **The document is keyed on the loan**, `${chainId}-${poolId}-${loanId}`, so
  both events land on it. `loanId` restarts at 1 in every pool clone, so the
  pool has to be in the key — otherwise two pools' first loans collide.
- **It is written with `set(..., { merge: true })`, not `create()`.** The other
  indexers get idempotency from `create()` rejecting an existing document, but
  here the second write is the whole point. Idempotency comes instead from
  writing chain truth and reporting no work when the stored record already
  agrees — which is what keeps a re-scan free.
- **The state is read from `getLoan`, never inferred from which log arrived.**
  A sweep sees the `LoanCreated` log on every pass forever, long after the loan
  was repaid; replaying it would resurrect a settled loan. Asking the chain makes
  the result independent of log order and makes re-scanning old blocks harmless.

That last point is the same reasoning as the pool active flag — see
[Sweeping](POOL_CREATION.md#sweeping).

## The contract implements less than the UI describes

`Loan` in `@superpool/types` describes an approval workflow that does not exist.
This is the single most important thing to know before working here:

| The app's model                    | The contract                                                       |
| ---------------------------------- | ------------------------------------------------------------------ |
| `requested → approved → disbursed` | `createLoan` disburses **immediately**, in one transaction         |
| `amountRepaid` grows               | `repayLoan` demands the **full** sum; it is 0 or everything        |
| `interestAccrued`                  | flat `amount × rate / 10000`, fixed at creation, never accrues     |
| `dueDate`, `DEFAULTED`             | `startTime + duration` is stored; **nothing on chain enforces it** |

So `LoanStatus` is only ever `DISBURSED` or `REPAID`. `PoolStore.pendingLoan`
is permanently `undefined` against real data and is kept deliberately — mock
mode still exercises that UI, and an approval step is the obvious next contract
change.

The same trap as memberships, which are derived from contributions because there
is no membership register. When the contract grows an approval step, the mapping
in `PoolStore.loans` is the one place that changes.

**Interest does not accrue**, which is worth repeating because it is
counter-intuitive: repaying on day 1 costs exactly what repaying on day 30 does.
`BorrowForm` states the total before the user signs for that reason.

## Borrowing rules, and where each is enforced

`createLoan` reverts unless all of these hold. The app checks what it can before
asking for a signature, because a reverted transaction still costs gas:

| Rule                            | Checked in the form | Caught by the estimate |
| ------------------------------- | ------------------- | ---------------------- |
| Amount above zero               | ✅                  | ✅                     |
| ≤ the pool's `maxLoanAmount`    | ✅                  | ✅                     |
| ≤ the pool's `totalFunds`       | ✅                  | ✅                     |
| Borrower has contributed        | ❌                  | ✅                     |
| No other open loan in that pool | ❌                  | ✅                     |
| Pool is active and not paused   | ❌                  | ✅                     |

The last three need chain reads the form does not have, so the pre-flight
`estimateContractGas` in `useLoan` is what turns them into a message rather than
a signature prompt for a doomed transaction.

**`available` comes from the chain, not from indexed events.** The form reads
`totalFunds` via `useReadContract`. Summing the contribution feed would both lag
and ignore money already lent out, offering liquidity that is not there.

## One screen for both directions

`pool/borrow.tsx` borrows _or_ repays, deciding from
`PoolStore.activeLoanFor(poolId)`. The contract allows one open loan per member
per pool, so with a loan outstanding there is nothing to choose between — a
separate repay screen would spend most of its life redirecting.

`activeLoanFor` returns the indexed `LoanInfo` rather than the mapped `Loan`,
because `repayLoan` takes a `loanId` and the app's `Loan` interface has no field
for one.

## Traps

- **All three parameters of `LoanCreated` and `LoanRepaid` are `indexed`**, so
  `log.data` is empty and `loanId` is `topics[1]`. The indexer reads it from
  there rather than decoding.
- **`UnauthorizedBorrower` means two different things.** On `createLoan` it
  fires when the caller has never contributed; on `repayLoan` it means the loan
  belongs to someone else. `useLoan` keeps separate message maps for that reason.
- **Pools created before the v2 implementation have no `createLoan`.** They are
  minimal-proxy clones, so an old pool silently lacks the whole loan surface —
  pools 1, 11 and 12 on the current local chain are like this. The gas estimate
  is what turns that into a message.
- **`calculateRepayment` in `useLoan` must agree with the contract's
  `calculateRepaymentAmount`.** Verified live: both give 4.3 POL for 4 POL at
  750 bps.

## Known limitations

- **No approval step**, so anyone who has contributed can borrow up to the cap
  without anyone agreeing. This is the biggest gap between the PoC and a real
  micro-lending product, and the reason the multi-sig admin story in
  `CLAUDE.md` does not yet reach loans.
- **No enforcement of the term.** `duration` is recorded and shown, and nothing
  happens when it passes — there is no liquidation, no penalty, no default.
- **Interest reaches the pool but never the members.** `repayLoan` adds
  principal plus interest to `totalFunds`, but a member can only ever withdraw
  what they put in, so `totalEarned` is 0 for everyone. See `CONTRIBUTIONS.md`.
- **The `loans` composite indexes are declared in
  `config/firestore.indexes.json`.** The emulator does not enforce them, so a
  query that works locally can still need an index in production.

## Running it locally

Same environment as pool creation — see
[`POOL_CREATION.md`](POOL_CREATION.md#running-it-locally). Borrowing needs a
pool on the v2 implementation that you have contributed to; `pnpm --filter
backend testSweep` reports loans alongside the other feeds.
