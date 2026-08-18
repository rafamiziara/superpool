# Interest Distribution

How the interest a borrower repays reaches the people who funded the loan.
Companion to [`CONTRIBUTIONS.md`](CONTRIBUTIONS.md) and [`LOANS.md`](LOANS.md) —
read this before touching `repayLoan`, `withdraw`, or anything that reports what
a member has earned.

Before this shipped, `repayLoan` added principal _and_ interest to `totalFunds`
while `withdraw` stayed bounded by `contributions[msg.sender]`. Nothing credited
the interest to anybody, so it accumulated in the contract permanently
unclaimable and every lender's lifetime earnings were structurally zero.

## The shape of it

Interest is distributed by an **accumulator**, not by a loop. The pool keeps no
member array to walk — deliberately, see `memberCount` — and adding one would
make every repayment cost gas proportional to the membership.

```
repayLoan                     → accInterestPerShare += interest paid / totalContributions
claimable(address)            → what one account has earned and not taken out
claimInterest()               → pays it, out of totalFunds
InterestClaimed               → interestClaimIndexer → the interest_claims collection
InterestDistributed           → nothing. It moves a pool-level figure read from the chain.
```

**The interest in a payment is exact**, not apportioned. A payment settles
accrued interest before it touches principal, so what it credited to lenders is
simply the interest it covered. That is a consequence of interest accruing —
under the flat rate there was one fixed total to divide each payment against.
See [`LOANS.md`](LOANS.md#interest-accrues).

Four storage slots, all appended in v3:

| Slot                  | What                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `accInterestPerShare` | Interest per unit of contribution since the pool began, scaled by 1e18. Only ever increases. |
| `totalContributions`  | Sum of every member's outstanding contribution. **Not `totalFunds`.**                        |
| `interestDebt`        | What each member had already accrued when their stake last changed.                          |
| `unclaimedInterest`   | Credited and not yet taken out.                                                              |

## The rule everything else follows from

> **The denominator is `totalContributions`, never `totalFunds`.**

`totalFunds` falls when money is lent out — which is _precisely_ when interest is
being earned. Dividing a repayment's interest by it would pay a wildly inflated
rate on any pool with a loan outstanding, and it would not show up in any test
where nothing is borrowed. `totalContributions` is maintained in `depositFunds`
and `withdraw` and changes nowhere else; membership decisions do not touch it.

Nothing reconciles it. It is maintained, not derived, and summing the
`contributions` mapping is impossible on chain — so if it drifts, every later
distribution is wrong and nothing says so.

## Rules that must not be broken

- **Settle before any change to a stake, restamp after it.** `_settle` banks what
  the current stake has accrued; `_restampDebt` re-anchors it against the new
  one. Settling without restamping leaves the debt pointing at a stake that no
  longer exists. Without the debt at all, a deposit made after a repayment would
  retroactively earn a share of it.
- **`claimInterest` is gated on neither membership nor an outstanding loan**,
  unlike `withdraw`. Interest is earned money rather than the stake that
  borrowing locks, and it is owed for the same reason a removed member's
  contribution stays withdrawable: it was earned while the money was in the pool.
- **Removal does not settle, and must not start.** It does not touch
  `contributions`, so a removed member's stake keeps funding loans and keeps
  accruing. Someone who wants out entirely withdraws.
- **Withdrawing the principal keeps the accrual.** `withdraw` settles first, so
  taking a contribution back leaves everything it earned still claimable. A
  member who has withdrawn everything can still claim.
- **A claim the pool cannot cover is refused, not paid partially.** A silent
  partial payment reads as a successful claim in every UI, and the remainder
  would be invisible. `InsufficientLiquidity` says it is delayed, not lost.
- **Earnings are paid in whatever the pool lends.** The accumulator is unit-free
  — it divides one quantity of the pool's asset by another — so nothing in the
  arithmetic changed when pools gained denominations. What did change is that
  **earnings from different pools cannot be added.** `PoolStore.totalEarned` is
  native-only for exactly that reason, the same way `totalBalance` is: summing
  a USDC claim into a POL total is wrong by whatever the exchange rate happens
  to be, and wrong silently. Reporting per unit is the alternative to a price
  oracle, and the oracle is deliberately absent.

## `claimable` is not capped by liquidity

Unlike `withdrawableAmount`, which is `min(contribution, totalFunds)`.
`claimable` is what the account has _earned_, and an outstanding loan must not
make an earnings figure appear to shrink. The liquidity bound is applied at
payout time, by `claimInterest`, which is where it belongs.

## Two sources, deliberately

A member's lifetime earnings are **claims plus what is still claimable**, and the
two halves come from different places:

- **Claimed** — the `interest_claims` collection, an append-only log in the shape
  contributions and withdrawals use. A claim is an event and never changes.
- **Claimable** — read from the chain, per pool, per wallet. There is no event to
  index: accrual is a consequence of _other_ people's repayments and emits
  nothing naming the member it credits. `ClaimInterestCard` reads it on a pool's
  page; `ClaimableInterestSync` reads it for every pool on the dashboard, and
  both mirror it into `PoolStore.claimableByPool`.

They must be **added**, not chosen between. Claiming moves an amount from one to
the other, so reporting either alone would make lifetime earnings drop the moment
someone takes their money.

`PoolStore.claimableByPool` is empty until something reads the chain into it, so
`totalEarned` reports claims alone on a screen that has not — understating rather
than inventing.

## Edge cases that are deliberate

- **A repayment into a pool with no contributions left** distributes nothing and
  emits no `InterestDistributed`. Every member having withdrawn while a loan was
  out leaves nobody to share it with, and the interest stays in the contract as
  it did before distribution existed. Rare, and not worth a second pot.
- **Rounding dust stays in the pool.** Integer division never overpays; the
  remainder is a few wei and belongs to nobody.
- **Unclaimed interest does not itself earn.** Compounding would mean adding it
  to `contributions`, which changes what `withdraw` means. Out of scope. A
  borrower's unpaid interest does not compound either, for the same reason —
  accrual is simple, on principal alone.
- **A pool earns nothing from a loan repaid immediately.** Interest is the price
  of time, and no time has passed. Any test written before accrual that borrows
  and repays in the same breath now measures a second or two of dust, which is
  why the contract suite runs its loans to term.

## Known limitations

- **No platform fee.** Taking a cut belongs to the same arithmetic and would be
  cheap to add, but it is a product decision. `ROADMAP.md` Phase 3.
- **No per-loan attribution.** Which lender funded which loan is not tracked and
  does not need to be — the pool is fungible.
- **`totalContributions` starts at zero on an upgraded pool.** A pool already
  holding deposits when the beacon is upgraded would under-count for ever. This
  is survivable only because no pool exists outside a disposable local chain; it
  stops being survivable the moment a public chain holds pools.
- **No mixed-denomination total.** The dashboard shows the chain's own coin as
  its headline and each token beneath, rather than one figure — see the rule
  above. A single number would need prices, which would need an oracle.
- **The claim has no activity row.** `interest_claims` is indexed and listed but
  does not yet appear in the pool or wallet feeds.
