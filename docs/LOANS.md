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
enum LoanStatus { Disbursed, Requested, Rejected, Defaulted }
```

**`Disbursed` is ordinal 0 on purpose.** A struct field that did not exist reads
as zero, so every loan written before the field must mean "disbursed" — which is
what they all were. Reordering the enum silently relabels history. A contract
test pins it, and the backend's `LOAN_STATUS` array must track the Solidity enum
by index.

`Defaulted` was **appended** for the same reason, and appending is the only safe
place for it: the three before it keep their ordinals, so no stored loan is
relabelled.

A rejection and a cancellation both land on `Rejected`: the record tracks where
the request ended up, not who ended it.

## The contract implements what the UI describes

`Loan` in `@superpool/types` is now the shape the app always described.
`repaidAt` stopped being a gap with borrowing history, `amountRepaid` with
[instalments](#paying-in-instalments), `interestAccrued` with
[accrual](#interest-accrues), and `DEFAULTED` with
[default handling](#late-and-in-default-are-different-questions).

`dueDate` is still the one thing the contract does **not** store, and
deliberately: it is `startTime + duration`, so anyone with a clock can work it
out. See the section below for why that distinction is the whole design.

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

**Interest accrues per second** on the principal still out — see
[Interest accrues](#interest-accrues). `BorrowForm` states the cost of the full
term before the user signs, which is a ceiling a borrower can beat rather than a
fixed price.

## Late and in default are different questions

The one place this document most rewards reading slowly, because conflating the
two is how a screen ends up branding a borrower who is three days late.

- **Overdue** is arithmetic. `startTime + duration` against a clock, true the
  second the term lapses, true of plenty of loans nobody minds about, and
  **nothing on chain records it** — there is no due-date field, no keeper, no
  event when a term passes. It needs no transaction because anyone can work it
  out.
- **In default** is the pool owner _saying so_. `markDefaulted`, owner-only, a
  judgement made at a moment and put on the public record where a later lender
  can read it against the same borrower's history.

That asymmetry is the design: **the chain stores what only the chain can
witness.** A date anybody can compute is computed; a decision somebody made is
recorded, with `defaultedAt` stamping when.

### A declaration is a label, not an ending

Everything about the debt survives it, and each of these is a place where the
obvious implementation is wrong:

- **The money is still owed.** `outstandingBalance`, `outstandingBalanceAt` and
  `loanBalance` all admit a defaulted loan. They used to be gated on `Disbursed`
  alone, and leaving them that way would have reported the debt as **zero** the
  moment it was declared — telling a borrower it had vanished and handing the
  repay screen nothing to send.
- **Interest goes on accruing**, at the same uncapped rate. A default changes
  nothing about how long the money has been out. It is not a penalty rate, and
  there is no penalty rate.
- **`repayLoan` still takes payment.** Refusing it would make declaring a
  default the act that forgave it.
- **The borrower's `activeLoanId` is still held.** `rejectLoan` frees the slot
  because a refused request never took anything; this one has money out, and
  freeing it would let a defaulter open a second loan at the pool they are
  already in default to.
- **Nothing is seized.** There is no collateral in this project, so there is
  nothing a default could take. An owner reaching for the button expecting
  recovery is the reader the confirmation copy is written for.

### It cannot be undone, and paying is what recovery looks like

There is no `unmarkDefaulted`, so the record says what actually happened. A loan
settled after a declaration keeps `Defaulted` **and** gains `isRepaid` — and
that pair is what "recovered" means. It is a different fact from never having
been late, and a more useful one to a later lender than either half alone.
`PoolStore` maps such a loan's status to `REPAID` and keeps `defaultedAt`
beside it, which is why the app's `Loan` carries both.

### The grace period is the owner's own promise

`defaultGracePeriod`, owner-only, **zero by default** — the same retrofit as
`Disbursed = 0` and `requiresApproval = false`, so a pool that predates it may
be acted on the moment a term lapses. It bounds the _owner_, not the borrower:
interest has been accruing since the due date either way, so lengthening it
costs the borrower nothing and buys them a promise they can check.

`defaultableAt(loanId)` returns `startTime + duration + defaultGracePeriod`, so
a screen states the date rather than restating the arithmetic. **Read the period
from the chain, never from an indexed pool record** — like `requiresMembership`
and `requiresApproval`, the owner can change it at any moment and nothing
indexes it.

### What the index carries

`status: 'defaulted'` and `defaultedAt`, both read from `getLoan` rather than
from the `LoanDefaulted` log — the same rule as `repaidAt`, and for the same
reason: the sweep sees the log on every pass forever, so a date taken from
whichever log arrived would be rewritten by the wrong one. `defaultedAt` is on
chain at all so that a loan first indexed _after_ it defaulted can still say
when.

`listLoans`'s `activeOnly` filters `status in ['disbursed', 'defaulted']`, since
both are money that is out. `defaultedOnly` narrows to declarations; there is no
`overdueOnly`, because that would be a query for something no field holds.

### Where it appears in the app

- **`pool/overdue.tsx`** is the owner's list — every loan past its term,
  longest-overdue first, with `outstandingBalance` read from the chain per card
  because the indexed snapshot is stalest on exactly these loans. The
  declaration sits behind a confirmation whose copy is a list of things it does
  _not_ do.
- **`OverdueLink`** on the pool page, coral rather than the approvals queue's
  amber: nobody is waiting on the owner, and there may be nothing to do today.
- **`LoanDueNotice`** on the borrow screen tells the borrower, leading with the
  cost of waiting rather than the label — that interest keeps adding up at the
  same rate is the part they are least likely to know.
- **`LoanDueBadge`** and `utils/lateness.ts` are the shared judgement.
  `latenessOf` runs on the **device clock**, which is right for a badge and
  wrong for anything about to send money.
- **`BorrowerHistoryPanel`** counts declarations over the wallet's whole record,
  settled or not, on a line of their own beneath the overdue one.

### The reminders nobody causes

`sendDueReminders` is the only scheduled notification in the project, because a
term lapsing emits nothing. It scans open loans hourly and sends at most **one**
due-soon and **one** overdue reminder per loan, ever — a job running against a
standing condition would otherwise send an hour, for as long as the debt stood.

**It judges on chain time, not server time.** `startedAt` is a block timestamp
and `duration` counts chain seconds, so a due date is a fact in chain time; one
`getBlock('latest')` per chain per run buys the right answer. On a local node
the two clocks are unrelated — the verification script pushes the chain eight
days ahead of the wall clock and checks the scan still finds the late loans.

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
- **A payment settles interest first, then principal**, so the interest it
  carries is exactly the interest it covered — no apportioning. Under the flat
  rate this had to be a share of a fixed total; with accrual the split is simply
  read off the debt. See [Interest accrues](#interest-accrues).
- **Overpaying is refunded** down to what is owed, so "pay in full" is safe
  against a balance that moved between the read and the send.
- **A request is not a debt.** `repayLoan` refuses anything whose status is not
  `Disbursed` with `LoanNotDisbursed`. Both checks it used to make — the
  borrower matches, `isRepaid` is false — pass on a request nobody approved and
  on one that was turned down, so either could be "repaid": money taken, the
  record marked settled, and nothing ever lent. Nothing in the app routes there,
  which is exactly why the contract has to be the one to refuse.

`outstandingBalance` returns 0 for anything that is not an open debt — a settled
loan, a request, a refusal — mirroring the gate in `repayLoan`, so a caller can
read it without first working out whether the call would revert. How it relates
to `calculateRepaymentAmount`, and why sending it exactly does not settle a
loan, is in [Interest accrues](#interest-accrues).

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

## Interest accrues

`interestRate` is the price of **one full term**. It always was — what changed
is that the price is now charged per second rather than in one lump the moment
the loan exists. A pool's stated rate therefore means what it always meant, and
no existing pool, screen or figure had to be reinterpreted.

```
interest owed = principal still out × rate × seconds held / (10000 × duration)
```

Four properties, and each is a decision:

- **It accrues on the principal still out**, not on what was borrowed. Handing
  some back makes the rest cheaper, which is the whole point and the thing a
  flat rate could not express. Live-verified: half the principal returned at the
  halfway mark costs a quarter of the term's interest, not a half.
- **The clock never stops at the due date.** A loan held twice its term costs
  twice its rate, three times for three. There is no cap, deliberately — a cap
  is a rule that has to be invented, and it says time is free after day 30,
  which leaves a borrower no reason ever to settle. This is the closest thing
  the project has to a consequence for running late, and it is not a penalty:
  it is the same price applied to more time.
- **Simple, not compounding.** Unpaid interest does not itself accrue. Same
  reasoning as unclaimed interest not earning — see [`INTEREST.md`](INTEREST.md).
- **A payment settles interest before principal.** Not a convention borrowed for
  its own sake: interest is the price of time already used, and letting a
  payment cut principal while interest stands would let a borrower reduce what
  they owe for time they have not paid for. It also makes the lenders' share
  _exact_ — the interest in a payment is simply the interest it covered, where
  the flat model had to apportion each payment across a fixed total.

### Three figures, and they are not interchangeable

| Call                       | Answers                                     | Moves?      |
| -------------------------- | ------------------------------------------- | ----------- |
| `calculateRepaymentAmount` | what the loan costs held exactly its term   | no          |
| `outstandingBalance`       | what is owed **right now**                  | every block |
| `loanBalance`              | the same, split into principal and interest | every block |

`calculateRepaymentAmount` is unchanged, arithmetic and all, so everything that
read it stayed correct — it was "what you will pay" and is now "what you will
pay if you take the whole term". It is the borrow form's quote. It is **not**
the figure to send.

### Settling needs a quote for later, not for now

The trap this creates, and it is a quiet one. Send exactly what
`outstandingBalance` reports and the block mines a second or two later, by which
time a sliver more has accrued. The payment is credited, the loan stays open,
and **it looks like success** — no revert, no error, just a debt that survived
being paid off.

So anything meaning to close a loan quotes slightly ahead and lets the refund
return the difference. `outstandingBalanceAt(loanId, when)` is the contract's
own answer; the app uses an hour of head-room, which on a 30-day loan is worth
about 0.014% of principal and is refunded anyway. `RepayForm` says so rather
than surprising the wallet with a larger number than the one on screen.

Overpaying remains free: `repayLoan` credits only what is owed.

### A token repayment needs no buffer, because nothing is overpaid

The pleasant half of denominations, and worth knowing before wondering why the
two repayment paths read differently.

With the chain's own coin the borrower must send value up front, so `repayLoan`
takes whatever arrives and refunds the excess — which is the whole reason for
the quote above. With a token the pool **pulls**: `repayLoanWithTokens(loanId,
amount)` takes `min(amount, outstanding)` priced at execution time, so there is
no overshoot, no refund, and `amount` only has to be _big enough_.

The head-room does not vanish; it moves to the **allowance**, which is the right
place for it. An allowance larger than the debt costs the borrower nothing,
where an over-payment costs them a refund transfer.

Two things follow:

- **`amount` stays an explicit argument.** Inferring it from the allowance would
  let a leftover approval — from an abandoned deposit, say — decide how much a
  later repayment took. An allowance is a ceiling, which is what an allowance is
  for.
- **The copy differs, and has to.** Telling a token borrower that the extra
  "comes straight back" describes a refund that never happens. `RepayForm` says
  the pool only takes what is owed.

### Storage, and loans made before it

Two words were appended to `Loan`: `principalOutstanding`, and
`interestOutstanding` packed with `accruedAt` — a snapshot and the moment it was
taken. Nothing between payments moves them, because nothing but `repayLoan`
calls `_accrue`.

**A loan made before accrual reads all three as zero**, none of the fields
having existed when it was written — and reading `principalOutstanding`
literally would say the principal is already back. Such a loan is converted on
its first touch, on exactly the terms it was made under: it was priced flat and
`amountRepaid` was applied across principal and that flat interest pro rata, so
that is how it is split. No money is invented and none forgiven. Accrual then
starts **from the conversion**, not from `startTime`, or the loan would be
charged twice for time its flat interest already covered.

`accruedAt == 0` is the flag, and it survives into the index as an _absent_
`accruedAt` — which is what tells the app the figures are static rather than
unknown.

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

## Why the money is wanted, and why it was refused

A loan carries no purpose on chain and never will: free text costs gas
proportional to its length, forever, and a sentence somebody typed is the
opposite of what the chain is for here. Both live in the `notes` collection —
see [Notes](../CLAUDE.md#notes) for the mechanism and
[`.dev/old/NOTES_PLAN.md`](../.dev/old/NOTES_PLAN.md) for why each
call went the way it did.

Four things about them that touch loans specifically:

- **A purpose has no loan to attach to when it is written.** `requestLoan` and
  `createLoan` assign the id when they are mined, so the app stages the note
  under the transaction and `indexLoanFromLog` moves it — on the `requested`
  and absent-to-`disbursed` transitions, the two that bring a loan into
  existence, and nowhere else.
- **It must not be joined through `loan.transactionHash`.** That field moves:
  `datesTheLoan` points the record at the transaction that set the loan's
  current `startTime`, and `approveLoan` rewrites `startTime`. So a purpose
  keyed to the requesting transaction reads correctly right up until the owner
  approves — the moment the loan starts to matter — and then silently belongs
  to nobody. The note is keyed on the loan's own document id for that reason,
  and `testNotes` asserts it survives an approval.
- **A decision reason is written before the transaction that makes the
  decision.** That is what lets `notifyLoanDecided` quote it, so the borrower
  reads "declined — the pool is fully lent out until March" rather than
  "declined". Because it is keyed on the _outcome_, a reason the owner typed
  and then thought better of is never asked for: approving after drafting a
  rejection carries nothing.
- **The purpose is shown wherever the owner is judging.** The approvals queue
  above `BorrowerHistoryPanel`, and `pool/overdue.tsx` beside what is owed —
  which is the one fact on a late loan the owner cannot work out themselves.

Neither is ever required, and **neither is ever read to decide anything**. A
loan with no purpose is an ordinary loan.

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
  750 bps, and 4.2 for 4 POL at 500 bps. Both are the _term's price_; what to
  send is `outstandingBalance`, or a quote a little ahead of it.
- **A short term makes lateness expensive fast.** Accrual is uncapped and the
  denominator is the term, so a one-minute loan held two hours owes a hundred
  and twenty times its rate. That is the model working, and it is why
  `testBorrowerHistory` cannot repay with the term's price any more.
- **`PoolStore.accruedInterestNow` runs on the device clock**, the contract on
  block time. Right for a figure in a list; wrong for one about to be signed
  for, which is why `pool/borrow.tsx` reads `loanBalance` from the chain.
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
- **A default is recorded, not enforced.** `markDefaulted` puts a judgement on
  the record and stops there: there is no liquidation, no penalty rate, and no
  collateral to seize. What actually presses a late borrower is accrual, which
  charges them for the extra time.
- **A default is the owner's decision, and nothing prompts it.** No keeper marks
  a loan automatically, deliberately — a term lapsing is not evidence that
  anyone considers the debt bad.
- **A request never expires.** If the owner simply never decides, only the
  borrower's own `cancelLoanRequest` frees their slot.
- **No minimum payment, and no schedule.** Any amount above zero is accepted,
  and nothing requires a borrower to make progress — a loan can sit part-paid
  indefinitely, holding its borrower's one slot in the pool. Its debt does keep
  growing now, which is a pressure rather than an enforcement.
- **Reputation observes defaults; nothing acts on them.** `BorrowerHistory`
  counts them, and no gate anywhere reads that count. The enforcing half is
  deliberately unbuilt — see
  [`.dev/features/REPUTATION_PLAN.md`](../.dev/features/REPUTATION_PLAN.md) §7.
- **A borrower is reminded once per loan per kind, ever.** Somebody who ignores
  the overdue push hears nothing further from the app.
- **A loan is denominated in whatever its pool lends**, and there is no
  conversion anywhere: `amount`, `amountRepaid` and every interest figure are
  quantities of that one asset, in its own smallest unit. The exponent comes
  from the pool — see [`CONTRIBUTIONS.md`](CONTRIBUTIONS.md) — and a pool whose
  token the app cannot read shows no figures at all rather than guessed ones.
- **The `loans` composite indexes are declared in
  `config/firestore.indexes.json`.** The emulator does not enforce them, so a
  query that works locally can still need an index in production.

## Running it locally

Same environment as pool creation — see
[`POOL_CREATION.md`](POOL_CREATION.md#running-it-locally). Borrowing needs a
pool behind the beacon that you have contributed to; `pnpm --filter backend
testSweep` reports loans alongside the other feeds.

`pnpm --filter backend testDefaults` drives loans past their terms, declares
them, pays one off afterwards and runs the reminder scan — 36 checks, including
that the chain's clock and this machine's genuinely disagree and the scan
follows the chain's.

`pnpm --filter backend testAccrual` drives loans through the node and moves its
clock — half a term, a full term, well past it, and one paid down early — then
checks what the contract charges, what the indexer stores, and that the app's
own projection of the stored snapshot agrees with the chain to the wei. 36
checks, including a loan whose accrual fields are blanked to simulate one made
before any of this existed.

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
