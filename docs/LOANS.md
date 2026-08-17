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

Repaying takes the same path with `repayLoan`, and lands on the **same
document**. So do the four approval calls below — one document per loan,
whatever moved it. A repayment also writes a second, separate record; see
[Paying in instalments](#paying-in-instalments).

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
- **The transaction it points at is chosen, not merged.** Merging preserves only
  fields a write leaves out, and `transactionHash` and `blockNumber` are both in
  the payload — so every event would otherwise take the reference with it, and a
  settled loan would show its disbursement date beside a link to the repayment.
  `datesTheLoan` holds them back unless the event either moves the loan's date
  (`requestLoan`, `approveLoan`) or is **earlier** than what is stored while
  carrying the same date. That second half matters because logs do not have to
  arrive in order: a loan first seen at its repayment points there until the
  creation log turns up, and then corrects itself. Found live; without it the
  reference stuck to whichever transaction was indexed first, forever.
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

`Loan` in `@superpool/types` is closer than it was — the approval step is real,
and so is partial repayment — but two gaps remain:

| The app's model        | The contract                                                       |
| ---------------------- | ------------------------------------------------------------------ |
| `interestAccrued`      | flat `amount × rate / 10000`, fixed at disbursement, never accrues |
| `dueDate`, `DEFAULTED` | `startTime + duration` is stored; **nothing on chain enforces it** |

`repaidAt` is no longer one of them — see [Borrowing history](#borrowing-history)
— and neither is `amountRepaid`, which is a real running total on chain now.
See [Paying in instalments](#paying-in-instalments).

`LoanStatus.APPROVED` never occurs either: approval disburses in the same
transaction, so an approved loan is already `DISBURSED`.

**`isRepaid` only means anything once the loan was funded.** It is `false` on a
request that is still waiting, on one that was turned down, and on a loan that
has been paid down but not settled — none of which is a closed debt. Anything that reads it without checking `status` first treats a
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

## Paying in instalments

`repayLoan` takes any amount above zero and credits it against
`amount + interest`. Before this it demanded the exact total, so a borrower who
could pay half could pay nothing — `isRepaid` was a bool and there was nowhere
to record half.

```solidity
uint256 public amountRepaid;   // appended to Loan
function outstandingBalance(uint256 _loanId) external view returns (uint256);
event LoanRepaymentMade(uint256 indexed loanId, address indexed borrower, uint256 indexed amount);
```

**`isRepaid` still says whether the debt is closed**; `amountRepaid` says only
how far along it is. The two are redundant only at the ends, and every caller
asking "does this wallet owe money" wants the first.

Four rules the whole design rests on:

- **The loan closes on the payment that finishes it, and not before.** That one
  write sets `isRepaid`, stamps `repaidAt` and releases `activeLoanId`.
  Releasing the lock earlier is the expensive mistake available here: it is what
  caps a borrower at one open loan, so a borrower who paid a wei could open a
  second.
- **Interest is shared out in proportion to what has been paid**, as a
  difference of two cumulative figures rather than `payment × rate`. The parts
  therefore sum to exactly the interest a single payment produces, so a borrower
  cannot change what the pool distributes by choosing how to split. The
  per-share accumulator is the one place a split is not quite free — it divides
  by `totalContributions` once per payment — and the loss is bounded by one wei
  per payment, always downwards. Live-verified: four instalments credited a 40
  POL lender 120 wei less than one payment would, on a full POL of interest.
- **Overpaying is refunded** down to what is owed, so "pay in full" is safe
  against a balance that moved between the read and the send.
- **A request is not a debt.** `repayLoan` refuses anything whose status is not
  `Disbursed` with `LoanNotDisbursed`. Both checks it used to make — the
  borrower matches, `isRepaid` is false — pass on a request nobody approved and
  on one that was turned down, so either could be "repaid": money taken, the
  record marked settled, and nothing ever lent. Nothing in the app routes there,
  which is exactly why the contract has to be the one to refuse.

`calculateRepaymentAmount` and `outstandingBalance` are **not** the same figure
and both are worth having. The first is the loan's lifetime cost and never
moves, so everything that read it stayed correct; the second is what is owed now
and is what to send as `value`. `outstandingBalance` returns 0 for anything that
is not an open debt — a settled loan, a request, a refusal — mirroring the gate
in `repayLoan`, so a caller can send it without first working out whether the
call would revert.

### An instalment is a log; a loan is not

This is why repayments got a collection of their own, `loan_repayments`, keyed
`${chainId}-${txHash}-${logIndex}` like contributions and withdrawals.

The loan record cannot answer when a payment arrived or which transaction
carried it: it holds a running total, a single `transactionHash` belonging to
the disbursement, and one `repaidAt` that dates only the payment which closed
the debt. A loan settled in four transactions has four dates and four hashes,
and three of them have nowhere else to live.

So the two records are both needed and neither derives from the other:

| Question                      | Read                                    |
| ----------------------------- | --------------------------------------- |
| How much is still owed?       | the loan's `amountRepaid`               |
| When did each payment arrive? | `loan_repayments`                       |
| Was this request rejected?    | the loan — payments never see a refusal |

`LoanRepaymentMade` is in `LOAN_TOPICS` **as well as** having its own sweep, so
those logs are read twice on purpose. A payment that does not settle the loan
emits nothing else, so leaving it out of `LOAN_TOPICS` would let `amountRepaid`
sit at zero until some later event happened to touch the record. Same deliberate
duplication `MemberJoined` has.

`LoanRepaid` still fires only on settlement and still carries the whole debt, so
everything reading it as "this loan is over" stayed correct. The settling
payment emits both: money moved, and the debt ended, which are different facts
the moment a loan can be paid in parts.

Two more that are easy to get wrong:

- **An instalment moves `amountRepaid` and nothing else** — same status, same
  `isRepaid`, same dates, same block ordering. The indexer's currency check has
  to compare it, or a part payment is reported as already indexed and the record
  keeps claiming the whole debt is outstanding. Found live.
- **A payment must not take the transaction reference.** It moves the loan
  without moving its date, exactly as `LoanRepaid` does, so `datesTheLoan`
  already holds it back — a settled loan must not show its disbursement date
  beside a link to a repayment.

The indexers report a `repayment` transition for a payment that leaves the debt
open, distinct from `repaid`. Nothing notifies on it; it exists so that "the
record was written" and "nothing happened worth telling anybody" stay separable.
It is gated on the loan still being open, because a record written before
`amountRepaid` existed reads it as absent — without the gate, the first sweep
after the upgrade would announce a payment on every settled loan in the index.

## Borrowing rules, and where each is enforced

`createLoan` reverts unless all of these hold. The app checks what it can before
asking for a signature, because a reverted transaction still costs gas:

| Rule                            | Checked in the form | Caught by the estimate | `requestLoan` too |
| ------------------------------- | ------------------- | ---------------------- | ----------------- |
| Amount above zero               | ✅                  | ✅                     | ✅                |
| ≤ the pool's `maxLoanAmount`    | ✅                  | ✅                     | ✅                |
| ≤ the pool's `totalFunds`       | ✅                  | ✅                     | ❌ — at approval  |
| Borrower is an `Active` member  | ❌                  | ✅                     | ✅                |
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

## Where an owner finds out somebody is waiting

A request costs the borrower nothing to make and the owner everything to miss, so
it is announced in three places rather than only inside the pool:

| Surface                      | Reads                                  |
| ---------------------------- | -------------------------------------- |
| Dashboard, one card per pool | `PoolStore.poolsAwaitingMyDecision`    |
| Dashboard hero chip          | `PoolStore.requestsAwaitingMyDecision` |
| `PoolCard`, in every list    | `PoolStore.pendingLoansFor(poolId)`    |

One card per pool rather than a combined summary: the queue and the screen that
clears it are both per pool, so a single card has nowhere to go when two pools
are waiting. The card markup is `ApprovalsLink`, shared with the pool page —
written twice is how a count ends up right in one place and stale in the other.

The filter is **ownership, not membership**: you can be a member of a pool whose
requests are none of your business.

`PoolCard` is an `observer` for this. It reads the store directly rather than
taking everything as props, and loan records change without its props changing —
without it a request lands and the card carries on saying nothing.

## Borrowing history

What a wallet has done with money it borrowed before, and the whole of what this
project calls reputation. **There is no score**, on chain or off — see
[`SPRINT_PLAN.md`](SPRINT_PLAN.md) Sprint 9 for why that is a decision rather
than an omission.

It is made of one fact that did not exist until it was added: **`repaidAt`**, a
`uint64` on the `Loan` struct, written by `repayLoan` beside `isRepaid`. Before
it, the contract recorded _whether_ a loan came back and never _when_, and
neither did the index, so a borrower who settled on day 2 and one who settled on
day 400 were the same record. `LoanRepaid` could not fill the gap either: it
carries no timestamp, and a later reader cannot ask the chain for a log by loan
id.

Three things about the field are load-bearing:

- **It is declared next to `status`, not appended.** It packs into the 10 bytes
  left over in the struct's first slot, so the struct still spans five slots and
  a pool that already holds loans reads them unchanged after the upgrade. A
  contract test pins that by reading raw storage. Appending it would have
  widened the stride and shifted every existing loan's `amount` out from under
  its reader — which is why this was worth doing before anything is deployed to
  a public chain.
- **The backend reads it from `getLoan`, not from the `LoanRepaid` block.** Same
  reasoning as every other field here: the sweep sees `LoanCreated` on every
  pass, so a date taken from whichever log arrived would depend on which one
  that was.
- **Zero is an absence, not 1970.** It means "not repaid", and on a loan settled
  before the field existed it means "repaid, date unknown". `isRepaid` stays the
  authority on whether; this only answers when.

`PoolStore.borrowerHistory(address)` counts it into a `BorrowerHistory`:
borrowed, repaid, on time, late, undated, outstanding, overdue, and `isNew`.
Derived on read from the loans, like liquidity and memberships — nothing about a
borrower is stored, so nothing about a borrower can go stale.

Three refusals in it are the substance, and each one is a way of being wrong
that a score would hide:

- **A wallet with no loans is new, not bad.** `isNew` exists so the UI can say
  "first time" rather than showing a row of zeroes that reads as the worst
  possible record. This is the one that quietly makes a lending product unusable
  for the people it is for.
- **A repayment with no date is neither on time nor late.** It is counted in
  `repaid` and in `undated`, because the honest answer to when it landed is that
  nobody knows.
- **Requests and rejections are not history.** Neither is borrowing, and a
  request that was turned down says something about the owner who turned it
  down.

`BorrowerHistoryPanel` shows it in two voices: `owner`, on every card in
`pool/approvals.tsx` **above the buttons** — a record read after deciding is a
record read too late — and `self`, on the dashboard, where it is the only place
in the app that tells you what your borrowing looks like from the outside. The
self view is hidden when you have never borrowed; the owner view is not, because
"nothing to go on" is worth reading in a queue.

Two limits worth knowing before trusting a figure:

- **It is per chain.** Loan documents are keyed `${chainId}-${poolId}-${loanId}`
  and the backend resolves one chain at a time, so a borrower's record on Amoy
  and on localhost are different objects.
- **It is bounded by the page size** the feeds are fetched with. A wallet with
  more loans than that on one chain is summarised from part of its history.

And one thing that is only a trap locally: **overdue is judged against
`Date.now()`**, the device clock. That is right in production, where block
timestamps track real time, and wrong on a local node whose clock has been
pushed forward — which is exactly what producing a late repayment requires.

## Loans in the activity feed

`PoolStore.loanActivity` puts loans in the same feed as contributions and
withdrawals. A contribution is a log and dates itself; a loan is an entity with a
single transaction hash, so it is **expanded into the events that can be dated**.

- A `requested` loan is a row awaiting a decision. `TransactionStatus.PENDING`
  there means "waiting on the owner", not "not yet mined" as it does everywhere
  else: a request is on chain the moment it is made.
- A `disbursed` loan is money leaving the pool, dated when it did.
- `rejected` and cancelled requests are left out. Nothing moved, the request is
  over, and `TransactionType` has no member that says so.

**Money coming back is not derived here any more.** It used to be: one row per
settled loan, dated `repaidAt`, carrying the whole debt — exactly right while
`repayLoan` demanded the full sum in one transaction, and wrong in three ways
the moment it stopped. Instalments before the last would produce no row, the
last would claim the whole amount, and all of them would be filed at the
settlement date.

`PoolStore.loanRepaymentActivity` reads the indexed `LoanRepaymentMade` records
instead, one row per payment. Unlike every other loan row these carry a real
`txHash` and `blockNumber` — the payment's own — where the derived row had to
carry none, because the only hash on hand belonged to the borrow.

An undated repayment no longer disappears either. It used to have no honest
position in a feed ordered by time; now every payment is dated by its own block.
`borrowerHistory` still counts a loan settled before the contract stamped
`repaidAt` as `undated`, because that is a question about the loan and not about
a payment.

### The sign depends on whose feed it is

`ActivityRow` takes a `perspective`, and the two tables are exact mirrors:

| Feed                       | Perspective | A contribution | A disbursed loan | A repayment      |
| -------------------------- | ----------- | -------------- | ---------------- | ---------------- |
| Pool page, "Pool activity" | `pool`      | `+` arrives    | `−` leaves       | `+` comes back   |
| Dashboard, activity tab    | `wallet`    | `−` you sent   | `+` you received | `−` you paid out |

Which one is not cosmetic: it follows from **who the feed is about**. The pool's
page lists everything that happened to that pool, including other members', so
"did this leave my wallet" is a question most of its rows cannot answer. The
dashboard and activity tab are narrowed to the connected wallet by
`PoolStore.myActivity`, where the opposite holds — a disbursed loan there is
money the user received, and the pool's sign would mark it negative.

`myActivity` matches on **either end** of the row, because which end holds the
member depends on direction: a contribution and a repayment come from them, a
withdrawal and a disbursed loan go to them. With no wallet connected it is empty rather than
everything, since `sameAddress` refuses to match an empty address.

The default is `pool`, the only safe answer for a feed nobody has narrowed.

## Traps

- **All six loan events carry the same three `indexed` parameters**, so
  `log.data` is empty and `loanId` is `topics[1]`. The indexer reads it from
  there rather than decoding, and one extractor serves every action — but only
  if every event name is in the list it tries. A missing name yields no result,
  and "no result" is what the monitor reads as a confirmed transaction that
  produced nothing.
- **`UnauthorizedBorrower` means three different things.** On `createLoan` and
  `requestLoan` it fires when the caller is not an `Active` member — see
  [`MEMBERSHIP.md`](MEMBERSHIP.md); on `repayLoan` and `cancelLoanRequest` it
  means the loan belongs to someone else. `useLoan` keeps a message map per path
  for that reason. Note the wording is "join this pool", not "contribute to it":
  in a permissioned pool no amount of depositing helps until the owner admits
  you.
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
  750 bps, and 4.2 for 4 POL at 500 bps. Note that is the _lifetime_ cost;
  what to send is that minus `amountRepaid`, and `outstandingBalance` is the
  chain's own answer.
- **`UnauthorizedBorrower` is checked before `LoanNotDisbursed`**, so paying
  towards someone else's request reports the wrong loan rather than the wrong
  state. Both revert; only the wording differs.

## Known limitations

- **Approval is per pool and off by default**, so a pool that never turns it on
  still lets any member borrow up to the cap without anyone agreeing. The step
  exists now; adopting it is the owner's choice. In an _open_ pool that also
  means anyone at all, since funding one enrols you — the membership register is
  the other half of this gate, not a separate concern.
- **Approval is the pool owner, not the multi-sig.** `approveLoan` and
  `rejectLoan` are `onlyOwner` on the pool, so the Safe story in `CLAUDE.md`
  still does not reach loans.
- **No enforcement of the term.** `duration` is recorded and shown, and nothing
  happens when it passes — there is no liquidation, no penalty, no default.
- **A request never expires.** If the owner simply never decides, only the
  borrower's own `cancelLoanRequest` frees their slot.
- **No minimum payment, and no schedule.** Any amount above zero is accepted,
  and nothing requires a borrower to make progress — a loan can sit part-paid
  indefinitely, holding its borrower's one slot in the pool. That is the same
  gap as the unenforced term above, not a separate one.
- **The `loans` composite indexes are declared in
  `config/firestore.indexes.json`.** The emulator does not enforce them, so a
  query that works locally can still need an index in production.

## Running it locally

Same environment as pool creation — see
[`POOL_CREATION.md`](POOL_CREATION.md#running-it-locally). Borrowing needs a
pool behind the beacon that you have contributed to; `pnpm --filter backend
testSweep` reports loans alongside the other feeds.

`pnpm --filter backend testPartial` drives three loans through the node — one
settled in four uneven instalments, one in a single payment, one left part-paid
— and checks the running total, one `loan_repayments` document per payment, and
that a split credits lenders what a lump sum would. 47 checks.

`pnpm --filter backend testHistory` drives four loans through the node — one
repaid inside its term, one after it, one left running past its due date, one
still waiting on the owner — and checks that the stored records can tell them
apart. It **advances the node's clock by two hours**, which is the only way to
be late without waiting, and is irreversible for the life of the node.

To exercise the approval path you need a pool with the flag on. Open the pool as
its owner and use **Pool settings → Review requests before lending**. From a
script or an older pool, the same thing from the console:

```bash
npx hardhat console --network localhost
const pool = await ethers.getContractAt('LendingPool', '<pool address>')
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
