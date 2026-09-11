# The per-share accumulator — distributing to an unbounded set without a loop

**Project:** SuperPool — RM30, sole-authored
**Report:** `rm30/superpool.md` (*the engineering report, outside this repo*) §3, §4
**Checkout:** this repository — `packages/contracts/contracts/LendingPool.sol`
**Read from the code:** 2026-09-01 · branch `develop`

> When a loan is repaid, its interest belongs to everyone who funded the pool, in proportion
> to what each put in. The obvious implementation is a loop over the members. That loop is
> the bug.

**Filed under `algorithms/`, not `performance/`.** This is a complexity bound and a data
structure choice, not a measured optimisation — nothing here was profiled, because the
failure it prevents is not slowness. Measured optimisation work lives elsewhere (PokéMoney's
render budget is the candidate for `performance/`).

---

## 1. The forcing constraint

A repayment carries interest that belongs to *n* lenders. Distributing it by iterating them
costs gas proportional to *n*, and gas per transaction is capped by the block limit.

The consequence is worse than "slow". **The function stops working at exactly the moment the
pool succeeds.** A pool with five members repays fine; a pool with five hundred cannot be
repaid at all, by anyone, ever — the borrower is locked into a debt they are willing and able
to settle, and no amount of retrying helps. There is no degraded mode: it works, until it is
permanently bricked, and the thing that breaks it is popularity.

Worse still, the person who pays that cost is **the borrower repaying**, not the lenders
being paid. A loop makes one party fund an operation whose benefit accrues to everybody else,
and makes their cost depend on a number they do not control and cannot see.

So the question is not "how do we make the loop cheaper". It is **how do we distribute to a
set of unknown size in constant gas**, and the answer is to stop pushing.

---

## 2. Invert who pays

The accumulator is the pull half of push-versus-pull, applied to a division rather than to a
payment:

- **A repayment raises one number.** O(1), paid by the borrower.
- **Each member reads their share off it on demand.** O(1), paid by that member, when they
  choose.

Nobody iterates anything, ever. The total work is the same; it is *partitioned* differently,
and every partition is bounded.

**The precondition that makes it necessary — and possible.** The pool deliberately keeps no
member array:

```solidity
/**
 * @notice How many addresses are currently `Active`
 * @dev A counter rather than an array: nothing on chain needs to enumerate
 * members, and the app builds its list from the events.
 */
uint256 public memberCount;
```

That is a two-way decision. Not storing an array is what *forces* the accumulator — you
cannot loop over what you do not keep. It is also only affordable because the off-chain
indexer reconstructs membership from events, which is the mechanism in the
[event-indexing dive](EVENT_INDEXING.md). **The two
designs hold each other up:** the chain refuses to enumerate, so the index must; the index
does, so the chain need not.

---

## 3. The mechanism — four slots

```solidity
uint256 public accInterestPerShare;              // scaled by PRECISION; only ever increases
uint256 public totalContributions;               // the denominator
mapping(address => uint256) public interestDebt; // per-member watermark
mapping(address => uint256) public unclaimedInterest;

uint256 private constant PRECISION = 1e18;
```

**Distribution** — the whole of it:

```solidity
function _distributeInterest(uint256 _loanId, uint256 _interestPaid) private {
    if (_interestPaid == 0 || totalContributions == 0) return;

    accInterestPerShare += Math.mulDiv(_interestPaid, PRECISION, totalContributions);

    emit InterestDistributed(_loanId, _interestPaid);
}
```

**Reading a share:**

```solidity
function _accruedInterest(address _account) private view returns (uint256) {
    return Math.mulDiv(contributions[_account], accInterestPerShare, PRECISION);
}

function claimable(address _account) external view returns (uint256) {
    return unclaimedInterest[_account]
         + (_accruedInterest(_account) - interestDebt[_account]);
}
```

Two implementation notes worth having ready:

- **`PRECISION = 1e18` is not decoration.** `interest / totalContributions` is integer
  division; for any realistic pool the quotient is zero, and every distribution would credit
  nothing. The scale is what makes the per-share figure representable at all.
- **`Math.mulDiv`, not `a * b / c`.** OpenZeppelin's full-precision multiply-then-divide
  holds the intermediate product in 512 bits, so scaling by `1e18` cannot overflow on the way
  through.

---

## 4. `interestDebt` — the half that is easy to leave out

The accumulator alone is not enough, and the missing piece is the one a naive implementation
skips. `accInterestPerShare` is *lifetime* interest per unit of stake. Multiply it by a
member's contribution and you get everything that unit ever earned — **including repayments
that happened before they deposited.**

So each member carries a watermark: what they had already accrued the last time their stake
changed.

```solidity
/**
 * @dev The other half of the accumulator pattern, and the part that is easy
 * to leave out: without it, a deposit made after a repayment would earn a
 * share of that repayment.
 */
mapping(address => uint256) public interestDebt;
```

The name is inherited from the pattern's usual home (MasterChef-style staking) and is
slightly unfortunate — it is not a debt owed by anyone. It is a **starting line**. The
difference between "what my stake has earned over all time" and "what it had earned when I
last moved it" is exactly what accrued while the current stake was in place.

### The lifecycle: settle, mutate, restamp

Every stake change follows the same three steps, in this order:

```solidity
// depositFunds
_settle(msg.sender);                       // bank what the old stake earned
totalFunds += _amount;
contributions[msg.sender] += _amount;      // change the stake
totalContributions += _amount;
_restampDebt(msg.sender);                  // re-anchor against the new stake
```

```solidity
function _settle(address _account) private {
    uint256 accrued = _accruedInterest(_account);
    unclaimedInterest[_account] += accrued - interestDebt[_account];
    interestDebt[_account] = accrued;
}

function _restampDebt(address _account) private {
    interestDebt[_account] = _accruedInterest(_account);
}
```

**Both are required and neither is sufficient.** The contract says so plainly: settling alone
*"leaves the debt stamped against a stake that no longer exists"*. Skip the settle and a
deposit retroactively earns from past repayments; skip the restamp and the watermark is
measured against the wrong stake, so the next distribution pays on a phantom balance.

And the underflow argument, which is the kind of thing an interviewer will probe because
`accrued - interestDebt` looks unguarded:

> *"Idempotent, and the subtraction cannot underflow: `interestDebt` is only ever written as
> `_accruedInterest` at some earlier accumulator value, and `accInterestPerShare` only
> grows."*

Monotonicity of the accumulator is what makes the subtraction safe. That is the invariant to
name.

---

## 5. The denominator — the subtle one

This is the mistake that would have shipped, and the reason it is worth telling:

```solidity
/**
 * @dev **The denominator is `totalContributions`, never `totalFunds`.**
 * `totalFunds` falls when money is lent out, which is exactly when interest
 * is being earned, so dividing by it would pay roughly double on any pool
 * with a loan outstanding — and no test in which nothing is borrowed would
 * notice.
 */
```

Read that last clause again, because it is the whole lesson. `totalFunds` is the pool's
*current liquidity*; `totalContributions` is *what members put in*. They are equal in exactly
one state — nothing borrowed — which is the state every simple unit test starts in. A test
that deposits, repays, and checks the share **passes with the wrong denominator.**

The bug only appears when money is out on loan, which is the only time interest exists at
all. So the correctness question and the test's setup are inversely correlated: the more
trivial the fixture, the more certainly it agrees with the bug.

That is a transferable point about testing, not just about this contract. When two variables
coincide in the default state, a test written from the default state cannot distinguish them
— and the fix is a fixture with a loan still outstanding, which the suite has:
*`distributes correctly while another loan is still outstanding`*.

---

## 6. Consequences, chosen rather than discovered

An accumulator forces you to answer questions a loop would let you dodge. Four were decided
deliberately and each is documented at the site:

**Withdrawing your principal leaves the interest it earned claimable.** `withdraw` calls
`_settle` before shrinking the stake — *"or the accrual leaves with the principal"*. The
money was earned while it was in the pool; taking the stake back does not unearn it.

**A removed member keeps accruing.** Removal changes what you may do next; it does not touch
`contributions`, so a removed member's stake is still funding loans and still earns.
`claimInterest` is ungated for the same reason `withdraw` is:

> *"Removing a member takes away what they may do next, not what they already put in; gating
> here would let an owner strand someone else's money."*

**`claimable` is not capped by available liquidity**, unlike `withdrawableAmount` — *"an
outstanding loan should not make a dashboard's earnings figure drop."* The liquidity bound is
applied at payout, not at display.

**A claim the pool cannot cover is refused outright, never paid partially** — *"a silent
partial payment reads as a successful claim in every UI."*

The through-line: **the accumulator separates *what you have earned* from *what the pool can
pay you today*,** and every one of these four decisions falls out of keeping those two
questions apart. A loop-and-push design would have conflated them by construction, because
it pays at distribution time out of whatever is there.

---

## 7. Instalments and dust

When loans gained instalments, the accumulator was the one place a split was not free:

> *"It divides by `totalContributions` once per payment, so instalments leave up to one
> wei-per-share of dust each. Always downwards, and the same dust a single repayment already
> leaves once."*

Two properties are asserted alongside it: the interest parts **sum to exactly the total** at
settlement (the last difference is taken against the whole debt, so truncation cancels rather
than accumulating), and a borrower therefore **cannot change what the pool distributes by
choosing how to split their payments**. That second one is the security property — without
it, payment splitting becomes a lever on other people's earnings.

Truncation always downward means dust accumulates *in the contract*, never against it. The
pool can only ever owe slightly less than it holds, which is the safe direction.

---

## 8. What it cost

**1. `totalContributions` is maintained, not derived, and nothing can check it.** The
contract is explicit that summing the `contributions` mapping is impossible on chain, so
there is no reconciliation available — a drift would be silent and permanent. And it names
its own upgrade hazard:

> *"A pool upgraded from v2 while already holding deposits would start this at zero and
> under-count for ever — which is survivable only because no pool exists outside a disposable
> local chain yet."*

**That is an unresolved migration problem, written down rather than hidden.** These are UUPS
upgradeable proxies; storage is appended across versions. If a pool with live deposits were
upgraded into this version, its denominator would be wrong from the first repayment. Say this
before being asked — it is the strongest evidence that the design was reasoned rather than
copied, and the mitigation (an initialiser that backfills, or a guard that refuses the
upgrade on a non-empty pool) is the obvious next step.

**2. The accumulator only grows, so a distribution cannot be corrected.** There is no path to
un-distribute. An over-credit caused by a wrong denominator would be permanent and would be
paid out to whoever claimed first.

**3. Interest with nobody to receive it stays in the contract.** If every member withdraws
while a loan is out, `totalContributions == 0` and the payment's interest is stranded — no
credit, no event. Documented, deliberate, and a genuine gap: that money has no owner and no
recovery path.

**4. `claimable` can report more than the pool can pay.** The right call for a dashboard, but
it means the number a user sees is a claim on future liquidity rather than a balance. Worth
naming as a UX consequence of a correctness decision.

**5. Precision loss is per-payment, not per-pool.** Every distribution truncates once.
Bounded and downward, but it means a pool that takes a thousand small instalments leaves more
dust than one that takes a single repayment.

---

## 9. How it is tested

The invariants that would silently break are pinned individually, and the test names read as
the specification:

| Test | The property it defends |
|---|---|
| `credits the whole interest out, and never more` | Conservation |
| `distributes correctly while another loan is still outstanding` | **The denominator** (§5) — the only fixture that can catch it |
| `Should not accrue backwards` | `interestDebt` restamping (§4) |
| `keeps the accrual when the contribution is withdrawn` | Settle-before-shrink |
| `stops accruing once the stake is gone` | Restamp-after-shrink |
| `keeps accruing for a removed member whose stake is still in` | Removal ≠ divestment |
| `leaves the interest in the pool when nobody is contributing` | The `totalContributions == 0` branch |
| `refuses a claim the pool cannot cover, rather than paying part of it` | No silent partials |
| `emits InterestDistributed with the interest alone, not the repayment` | Event carries interest, not principal |
| `Should share out each instalment interest as it arrives` | Per-instalment distribution |

The removed-member test is a nice piece of arithmetic: with the lender holding 20 of 21 total
contributions, it asserts `closeTo((interest * 20n) / 21n, 100n)` — a proportional share with
a wei-scale tolerance for the truncation of §7, rather than an exact equality that would be
fragile for the wrong reason.

`claimable` is a `view`, which is what makes all of this testable as arithmetic instead of as
a sequence of payouts.

---

## 10. The 90-second version

> When a loan is repaid, the interest belongs to everyone who funded the pool in proportion to
> what they put in. The obvious implementation loops over the members — and that loop is
> unbounded gas, so the repay function stops working at exactly the point the pool becomes
> popular. Not slowly: it works, and then it is permanently unusable, and the borrower is
> locked into a debt they are trying to settle.
>
> So instead of pushing, the pool keeps **one number — interest accrued per unit of
> contribution since the pool began** — and a repayment raises it. Each member's share is read
> off it on demand, in constant time, paid for by them when they claim. The pool deliberately
> keeps no member array to walk, which is both why the accumulator is necessary and what makes
> it affordable — the app builds its member lists from indexed events instead.
>
> The half that is easy to miss is a per-member watermark. The accumulator is *lifetime*
> interest per unit of stake, so without one, a deposit made today would earn a share of every
> repayment that ever happened. Each stake change settles what the old stake earned, then
> re-anchors against the new one.
>
> The bug I'd tell you about is the denominator. It has to be total *contributions*, never the
> pool's current funds — because funds fall when money is lent out, which is exactly when
> interest is being earned, so it would pay about double. And the reason that one is dangerous
> is that the two figures are identical whenever nothing is borrowed, which is how every
> simple test starts. The test that catches it is the one with a loan still outstanding.

---

## 11. Questions you would be asked, and the answers

**"Why not just loop?"** — Unbounded gas. It doesn't degrade, it bricks, and it bricks the
borrower's repayment rather than the lenders' claim. §1.

**"What if you cap the member count?"** — Then the product has a hard ceiling chosen by the
block gas limit rather than by the design, and the cap has to be low enough for the worst-case
repayment. The accumulator removes the question instead of answering it.

**"How does someone who joins later not earn from earlier repayments?"** — `interestDebt`, a
per-member watermark restamped on every stake change. §4.

**"Why is the subtraction in `claimable` safe?"** — `interestDebt` is only ever written as
`_accruedInterest` at some earlier accumulator value, and the accumulator only increases.
Monotonicity is the invariant.

**"What's the denominator, and why?"** — `totalContributions`, never `totalFunds`. §5, and
say why the naive test passes with the wrong one.

**"What happens to someone the owner removes?"** — They keep accruing while their stake is
still in the pool, and they can still withdraw and still claim. Removal governs what you may
do next, not what your money is doing. §6.

**"Where does precision go?"** — One truncation per distribution, always downward, so dust
stays in the contract. Instalments cost up to one wei-per-share each. §7.

**"What's unresolved?"** — `totalContributions` is maintained with nothing to reconcile
against, and upgrading a pool that already holds deposits would start it at zero and
under-count for ever. It's affordable only because nothing is deployed beyond a local node.
§8.1.

---

## 12. Where to look

| What | `packages/contracts/contracts/LendingPool.sol` (2,162 lines) |
|---|---|
| The four slots, with their reasoning | lines 292–361 |
| `_distributeInterest` — the whole distribution | ~1667 |
| `claimable` · `claimInterest` | ~911 · ~934 |
| `_settle` · `_restampDebt` · `_accruedInterest` | ~962 · ~969 · ~974 |
| Settle-mutate-restamp in `depositFunds` | ~824 |
| Settle-mutate-restamp in `withdraw`, and why it is ungated | ~840–885 |
| `removeMember` — why nothing is settled | ~1176 |
| Instalment dust and the split-invariance argument | ~1498–1520 |
| Tests | `packages/contracts/test/LendingPool.test.ts` ~2074–2320 · `TokenPool.test.ts` |

**The commits, in order:**

| Commit | Subject |
|---|---|
| `d8b5bc6` · 2026-08-10 | feat(contracts): let members withdraw their contributions |
| `4476d73` · 2026-08-12 | **feat(contracts): credit repaid interest to the people who funded the loan** — the accumulator, with the three-things-easy-to-get-wrong list in its body |
| `c7ff3cb` · 2026-08-12 | feat(contracts): let a member take their earned interest out |
| `4271833` · 2026-08-17 | feat(multi): let a loan be paid down in instalments |
| `e86d0c0` · 2026-08-17 | feat(contracts): accrue interest per second, on the principal still out |

`4476d73` is worth reading in full before an interview. It states the problem it fixed
(interest *"piled up in the contract permanently unclaimable — the contract said so itself in
withdraw's docstring"*), why an accumulator rather than a loop, and the three failure modes
the tests exist for.

**Related:** `rm30/superpool.md` (*the engineering report, outside this repo*) §3 (the constraint as the report
frames it), §4 (the contracts and their security posture). The
[event-indexing dive](EVENT_INDEXING.md) is the other side
of §2's decision not to enumerate members on chain.
