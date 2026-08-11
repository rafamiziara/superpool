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
**same document**. So do the four approval calls below — one document per loan,
whatever moved it.

## Two ways a pool lends

Each pool decides for itself, with `setRequiresApproval(bool)`, owner-only:

| `requiresApproval` | How a loan starts                                                                     |
| ------------------ | ------------------------------------------------------------------------------------- |
| `false` (default)  | `createLoan` checks and disburses in one call                                         |
| `true`             | `createLoan` reverts `ApprovalRequired`; `requestLoan` → `approveLoan` / `rejectLoan` |

The borrower can also withdraw their own request with `cancelLoanRequest`, which
matters because a pending request holds their one `activeLoanId` — until it is
resolved they can neither borrow nor ask for a different amount.

**Off by default, and not by accident.** `requiresApproval` packs into
`isActive`'s storage slot and therefore reads `false` on every pool that predates
it, which is exactly the old behaviour. That is what kept `createPool`,
`PoolParams`, the factory, the backend and the create-pool form entirely out of
the change.

**Read the flag from the chain, never from an indexed pool record.** The owner
can flip it at any moment and nothing indexes that, so a stale answer sends
`createLoan` at a pool that now reverts. `pool/borrow.tsx` and
`pool/settings.tsx` both read `poolConfig()` and take `requiresApproval` from
index **4** of the tuple.

`pool/settings.tsx` is where an owner turns it on, via `usePoolSettings`. That
hook is deliberately **outside** the `PendingTransactionsStore` machinery every
other write goes through: that machinery exists so a transaction the backend has
not seen yet still shows up, survives an app kill and gets indexed afterwards,
and none of it applies here. Nothing indexes `ApprovalRequirementChanged` — the
pool document has no `requiresApproval` field — and every screen that cares reads
the chain on render, so there is nothing to recover. The hook waits for its own
receipt instead, because a screen that claimed success before the chain agreed
would contradict the borrow screen a moment later.

The screen sends the **target value**, not a flip. Writing the value the pool
already holds is harmless (verified live), whereas a toggle would race a change
made from elsewhere.

Two things it promises that the contract guarantees, both verified live:

- **Turning approval off leaves requests already waiting exactly where they
  were.** They stay `Requested`, nothing is disbursed, and the owner can still
  approve or reject them — a request never reserved funds, so there is nothing
  for the switch to release.
- **A pool created before the approval step cannot have one turned on.** Its
  `poolConfig` does not decode against the current ABI, so the screen says so
  rather than offering a switch that reverts. `isLoading` is what separates
  "still reading" from "read, and this pool is too old" — collapsing the two
  would show the wrong message on every first render.

Where liquidity is checked differs between the two, and deliberately:
`createLoan` checks `totalFunds` up front, while `requestLoan` does not check it
at all and `approveLoan` checks it instead. What matters is whether the pool can
cover the loan when the owner decides, not when the member asks — so the borrow
form withholds `available` on an approval pool rather than refusing a request the
contract would have taken.

## Why a loan is not an event

Contributions and withdrawals are events: one log, one immutable record, keyed
`${chainId}-${txHash}-${logIndex}`. A loan is not. It is brought into existence
by `LoanCreated` **or** `LoanRequested`, moved by `LoanApproved` or
`LoanRejected`, and settled by `LoanRepaid` — so one entity is described by up to
three logs at different blocks.

`cancelLoanRequest` has no event of its own: it emits `LoanRejected`, because the
record tracks the state and not who ended the request.

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
[Sweeping](POOL_CREATION.md#sweeping). It is also why **indexing an old
transaction reports the loan's state now, not then**: re-indexing the request
transaction of a loan that has since been approved and repaid correctly writes
`disbursed`/`isRepaid`. Verified live; do not "fix" it into a replay.

## `LoanStatus` is an on-chain enum, and its order is load-bearing

```solidity
enum LoanStatus { Disbursed, Requested, Rejected }
```

**`Disbursed` is ordinal 0 on purpose.** A struct field that did not exist reads
as zero, so every loan written before the field must mean "disbursed" — which is
what they all were. Reordering the enum silently relabels history. A contract
test pins it, and the backend's `LOAN_STATUS` array must track the Solidity enum
by index.

A rejection and a cancellation both land on `Rejected`: the record tracks where
the request ended up, not who ended it.

## The contract still implements less than the UI describes

`Loan` in `@superpool/types` is closer than it was — the approval step is real
now — but three gaps remain:

| The app's model        | The contract                                                       |
| ---------------------- | ------------------------------------------------------------------ |
| `amountRepaid` grows   | `repayLoan` demands the **full** sum; it is 0 or everything        |
| `interestAccrued`      | flat `amount × rate / 10000`, fixed at disbursement, never accrues |
| `dueDate`, `DEFAULTED` | `startTime + duration` is stored; **nothing on chain enforces it** |

`LoanStatus.APPROVED` never occurs either: approval disburses in the same
transaction, so an approved loan is already `DISBURSED`.

**`isRepaid` only means anything once the loan was funded.** It is `false` on a
request that is still waiting and on one that was turned down, neither of which
is a debt. Anything that reads it without checking `status` first treats a
request as an outstanding loan — which is exactly the bug `activeLoanFor` had.
`PoolStore` reads `status` first everywhere now:

| Getter                    | Matches                                               |
| ------------------------- | ----------------------------------------------------- |
| `activeLoanFor(poolId)`   | `disbursed` and not repaid — the debt                 |
| `pendingLoanFor(poolId)`  | the user's own `requested`                            |
| `pendingLoansFor(poolId)` | **every** member's `requested`, for the owner's queue |
| `outstandingDebt(poolId)` | principal of `disbursed` and not repaid               |

`listLoans` mirrors that split on the backend: `activeOnly` filters
`status == 'disbursed' && !isRepaid`, `pendingOnly` filters
`status == 'requested'`.

**`startTime` is rewritten on approval.** It is set when the request is made and
set again when the owner approves, so a `LoanInfo` carries one timestamp that
means "requested at" while pending and "disbursed at" afterwards. `PoolStore`
leaves `approvedAt`, `disbursedAt` and `dueDate` undefined until the loan is
disbursed rather than pretending to know them.

**Interest does not accrue**, which is worth repeating because it is
counter-intuitive: repaying on day 1 costs exactly what repaying on day 30 does.
`BorrowForm` states the total before the user signs for that reason.

## Borrowing rules, and where each is enforced

`createLoan` reverts unless all of these hold. The app checks what it can before
asking for a signature, because a reverted transaction still costs gas:

| Rule                            | Checked in the form | Caught by the estimate | `requestLoan` too |
| ------------------------------- | ------------------- | ---------------------- | ----------------- |
| Amount above zero               | ✅                  | ✅                     | ✅                |
| ≤ the pool's `maxLoanAmount`    | ✅                  | ✅                     | ✅                |
| ≤ the pool's `totalFunds`       | ✅                  | ✅                     | ❌ — at approval  |
| Borrower has contributed        | ❌                  | ✅                     | ✅                |
| No other open loan in that pool | ❌                  | ✅                     | ✅                |
| Pool is active and not paused   | ❌                  | ✅                     | ✅                |

The last three need chain reads the form does not have, so the pre-flight
`estimateContractGas` in `useLoan` is what turns them into a message rather than
a signature prompt for a doomed transaction. The estimate is also what catches
`LoanNotPending` on a decision someone else already made.

**`available` comes from the chain, not from indexed events.** The form reads
`totalFunds` via `useReadContract`. Summing the contribution feed would both lag
and ignore money already lent out, offering liquidity that is not there.

## One screen for the borrower, one for the owner

`pool/borrow.tsx` has three states, mutually exclusive by construction because
the contract holds a single `activeLoanId` per member per pool — whatever is in
that slot is the only thing there is to act on:

| State                        | From                     | Action                |
| ---------------------------- | ------------------------ | --------------------- |
| Outstanding loan             | `activeLoanFor(poolId)`  | repay                 |
| Request waiting on the owner | `pendingLoanFor(poolId)` | withdraw the request  |
| Neither                      | —                        | borrow **or** request |

`activeLoanFor` and `pendingLoanFor` return the indexed `LoanInfo` rather than the
mapped `Loan`, because `repayLoan` and `cancelLoanRequest` take a `loanId` and the
app's `Loan` interface has no field for one.

`pool/approvals.tsx` is the owner's side, and the first screen in the app for
acting _on_ a pool rather than within one. It is reachable from the pool page only
when something is waiting, refuses anyone who is not the owner rather than
inviting an `onlyOwner` revert, and **serialises decisions**: each is a separate
transaction from the same wallet, and two signature prompts in flight race for one
nonce — the second replaces the first rather than following it.

`pool/settings.tsx` is the third owner-facing surface, and the only one always
offered: the setting it carries decides whether a queue can exist at all, so
hiding it until something happens would make the feature unreachable. The
approvals link, by contrast, appears only when a request is waiting.

## Traps

- **All five loan events carry the same three `indexed` parameters**, so
  `log.data` is empty and `loanId` is `topics[1]`. The indexer reads it from
  there rather than decoding, and one extractor serves every action — but only
  if every event name is in the list it tries. A missing name yields no result,
  and "no result" is what the monitor reads as a confirmed transaction that
  produced nothing.
- **`UnauthorizedBorrower` means three different things.** On `createLoan` and
  `requestLoan` it fires when the caller has never contributed; on `repayLoan`
  and `cancelLoanRequest` it means the loan belongs to someone else. `useLoan`
  keeps a message map per path for that reason.
- **`LoanNotPending` is a race, not a fault.** It is what a borrower cancelling
  while the owner's decision is in flight looks like, and it is the error the
  approvals screen will actually hit.
- **Pools created before the beacon migration are stranded.** They are
  minimal-proxy clones with the implementation hardcoded, so nothing can upgrade
  them — pools 1–17 of the pre-beacon factory on the local chain are like this.
  Worse, **the backend can no longer index their loans at all**: they return the
  pre-approval `Loan` struct and `getLoan` fails to decode against the shipped
  ABI, so a sweep silently skips them. Verified live.
- **`calculateRepayment` in `useLoan` must agree with the contract's
  `calculateRepaymentAmount`.** Verified live: both give 4.3 POL for 4 POL at
  750 bps, and 4.2 for 4 POL at 500 bps.

## Known limitations

- **Approval is per pool and off by default**, so a pool that never turns it on
  still lets anyone who has contributed borrow up to the cap without anyone
  agreeing. The step exists now; adopting it is the owner's choice.
- **Approval is the pool owner, not the multi-sig.** `approveLoan` and
  `rejectLoan` are `onlyOwner` on the pool, so the Safe story in `CLAUDE.md`
  still does not reach loans.
- **No enforcement of the term.** `duration` is recorded and shown, and nothing
  happens when it passes — there is no liquidation, no penalty, no default.
- **A request never expires.** If the owner simply never decides, only the
  borrower's own `cancelLoanRequest` frees their slot.
- **Interest reaches the pool but never the members.** `repayLoan` adds
  principal plus interest to `totalFunds`, but a member can only ever withdraw
  what they put in, so `totalEarned` is 0 for everyone. See `CONTRIBUTIONS.md`.
- **The `loans` composite indexes are declared in
  `config/firestore.indexes.json`.** The emulator does not enforce them, so a
  query that works locally can still need an index in production.

## Running it locally

Same environment as pool creation — see
[`POOL_CREATION.md`](POOL_CREATION.md#running-it-locally). Borrowing needs a
pool behind the beacon that you have contributed to; `pnpm --filter backend
testSweep` reports loans alongside the other feeds.

To exercise the approval path you need a pool with the flag on. Open the pool as
its owner and use **Pool settings → Review requests before lending**. From a
script or an older pool, the same thing from the console:

```bash
npx hardhat console --network localhost
const pool = await ethers.getContractAt('SampleLendingPool', '<pool address>')
const owner = (await ethers.getSigners())[1]   // whoever created the pool
await pool.connect(owner).setRequiresApproval(true)
```

**Verification scripts write to the emulator with the service account's project
id.** `packages/backend/src/config/firebase.ts` initialises with
`cert(serviceAccountKey)`, and that project wins over `FIREBASE_CONFIG`,
`GCLOUD_PROJECT` and `GOOGLE_CLOUD_PROJECT` — so a throwaway script cannot be
isolated by setting those, and will read and write the same `genesis-super-pool`
data the app uses. Pass an explicitly-constructed `Firestore` into the indexer
functions if you need a separate namespace, and never let a script clear a
collection to get a clean slate.
