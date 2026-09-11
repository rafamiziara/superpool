# Event indexing — three racing paths, idempotent writes, reorg safety

**Project:** SuperPool — RM30, sole-authored
**Report:** `rm30/superpool.md` (*the engineering report, outside this repo*) §3, §5, §11
**Checkout:** this repository — backend at `packages/backend/src/`
**Read from the code:** 2026-09-01 · branch `develop` · head `f1da50e`

> An authoritative external source that cannot be queried the way an app needs, three
> independent writers racing to mirror it, and a client that computes balances by summing
> what got mirrored. This is how it stays correct — and the one bug that showed why it
> nearly wasn't.

**A note on this file's sources.** Unlike the SuperPratico dive, most of the *why* here is
recoverable directly: the code carries argued docstrings and the commits average 15.6 body
lines. Where a passage is quoted, it is quoted. What this file adds is the **system-level
argument no single file makes** — the rules that repeat across nine feeds, why they hold
together, and where they cost something.

---

## 1. The forcing constraint

A blockchain is authoritative and nearly unqueryable. You can ask it for a specific
loan, or for logs in a block range, but you cannot ask it *"which pools does this wallet
belong to, sorted by activity, matching this search text"* — which is every screen in the
app. So events get mirrored into Firestore and the app reads Firestore.

That creates four problems at once:

1. **Several writers, no coordination.** The create screen indexes its own transaction the
   moment the receipt confirms; the pools screen drains the same pending transaction; the
   scheduled sweep arrives on top. All three can write the same pool.
2. **The source can retract.** A log read from a block that later gets orphaned describes
   something that never happened.
3. **Nothing may be lost.** A transaction signed in an app that is then killed still
   happened on chain, and must still reach the index.
4. **Anything outside the app is invisible.** Seeding scripts, direct contract calls,
   a receipt the app never saw — none of it goes through the app's path at all.

And one decision, made for good reasons elsewhere, sharpens all of them:
**derived figures are summed from events rather than stored as totals.** The sprint plan
records this as settled rather than outstanding:

> *"Liquidity and balances are summed from events on read, so there is no denormalised
> total that can fall out of step with the chain. Treat this as settled, not outstanding."*

That is why an indexing bug here is not a stale number. It is a permanently wrong one.

---

## 2. The three paths

| # | Path | Trigger | Covers | Failure behaviour |
|---|---|---|---|---|
| 1 | **Immediate** | `usePoolIndexing.triggerIndexing()` on a confirmed receipt | The common case — the user sees their pool at once | **Silent.** By design |
| 2 | **Recovery** | `indexConfirmed()`, draining `PendingTransactionsStore` at startup | An app killed after signing; a receipt the app missed | Silent, retried next launch |
| 3 | **Sweep** | `syncPoolEvents`, scheduled every 5 minutes across every configured chain | Everything else — seeding, direct calls, and anything 1 and 2 dropped | Logged; cursor does not advance |

Path 1 exists only for latency. Its own docstring says so, and the reasoning is worth
having ready because it is the argument for why silent failure is correct rather than lazy:

> *"Every failure here is silent by design. Indexing is an optimisation: it makes the
> result appear immediately instead of within five minutes, when the scheduled
> `syncPoolEvents` picks it up from the chain regardless. The pool or deposit exists either
> way, so an error message would report a problem the user does not have and cannot act on."*

**Path 3 is the only one that is load-bearing.** Everything else is a latency optimisation
over it. That framing is what makes the whole design tractable: you do not have to reason
about three writers being individually reliable, only about the sweep being *complete* and
all three being *safe to repeat*.

There is also one thing only path 3 covers: pool deactivation has no on-demand path at all,
so the sweep is the only thing that ever reconciles `isActive`.

---

## 3. The five rules that make racing safe

These are not stated in one place in the codebase. They are the pattern across eight
indexer services and nine feeds, and they are the transferable part.

### Rule 1 — `create()`, never read-then-`set()`

```ts
/** Firestore's gRPC status for a `create()` against a document that exists. */
const ALREADY_EXISTS = 6

try {
  await docRef.create({ /* … */ })
} catch (error) {
  const alreadyExists = /* … */ error.code === ALREADY_EXISTS
  if (!alreadyExists) throw error
  // already indexed — repair, then report no write
}
```

The comment above it is the whole argument:

> *"`create()` rather than read-then-`set()`: the indexing paths race. The create screen
> indexes the transaction it just saw confirmed while the pools screen drains the same hash,
> and the scheduled sync can arrive on top. A read-then-write lets every caller observe
> 'absent' and write, so each one reports a first-time store and a doc written elsewhere in
> between is lost. Rejection on an existing document is what makes the guarantee atomic."*

The second-order benefit is the one people miss: because only a genuine first write
succeeds, **`stored` counts are truthful**. A sweep over settled history reports zero work
rather than re-reporting the whole chain, which is what makes the counters usable as a
signal at all.

### Rule 2 — the document id comes from the log, not from the content

`${chainId}-${poolId}` for a pool. For a contribution, `${chainId}-${txHash}-${logIndex}`,
and the reason for the third component is recorded in `docs/CONTRIBUTIONS.md`: two deposits
can occur in one transaction, and **a hash-only key would merge them**. (With a trap
attached: ethers v6 renamed `Log.logIndex` to `Log.index`, and reading the v5 name gives
`undefined` — which would produce one key for every log in the transaction.)

Deterministic ids derived from chain facts are what make re-scanning a range a no-op
instead of a duplication.

### Rule 3 — re-read the state; never infer it from which event arrived

This appears three times and is the most important rule in the system.

- **Loans.** All five loan topics take one path: `indexLoanFromLog` re-reads `getLoan`
  and stores the state afterwards. Seven distinct user actions map to **one callable**.
- **Memberships.** Six membership topics, one path, `membership(address)` re-read.
- **Pool status.** `PoolDeactivated` / `PoolReactivated` carry no state, so the sweep asks
  `isPoolActive` rather than replaying events in order.

The consequence, stated in `fetchPoolActive`:

> *"Two things fall out of that: the result does not depend on the order logs happen to be
> processed in, and re-scanning old blocks is harmless, because it writes today's truth
> rather than the truth as of some block in the past."*

**Order-independence is bought, not assumed.** An approval swept before its request still
lands on the right answer, because neither log is being used as a state transition — they
are being used as *notifications that a thing is worth re-reading*. That is the difference
between an event-sourced projection (which must be ordered and complete) and this, which
must be neither.

### Rule 4 — failures degrade by consequence, not uniformly

Three different policies, chosen per field by blast radius. `fetchPoolMetadata`:

> *"**The two facts degrade differently, and that difference is the point.** A description
> is cosmetic, so a failed read stores an empty string rather than losing the pool. Decimals
> are not: rendering a 6-decimal balance as an 18-decimal one is a factor of a trillion, so
> a token whose metadata cannot be read leaves `tokenSymbol` and `tokenDecimals` **absent**
> — which the app is required to treat as 'unsupported', never as 'assume 18'. The pool is
> still stored either way; losing it would be worse than showing it as unreadable."*

And the opposite policy, in `sweepLoanDecisions`, where a failure must *not* be worked
around:

```ts
// Before the pool lookup: an unreadable sender is the one failure that
// must not be worked around, since a refusal and a withdrawal are the
// same log and only this separates them.
const sender = await getSender(log.transactionHash, provider, caches)
```

Three policies — **substitute a harmless default** (description), **omit the field and let
the reader refuse** (decimals), **fail the record** (sender) — each argued from what a wrong
value would do. This is the part to talk about when someone asks how you handle errors,
because "we log and continue" is what everyone says.

### Rule 5 — never store what has a setter

> *"Safe to store, unlike most things read from a contract: both are immutable for the life
> of an ERC-20. `requiresMembership` is the counter-example the codebase already has — the
> owner can change it at any moment, so it must always be read from the chain and never from
> an indexed record."*

A rule with a **named counter-example in the same sentence** is worth more than the rule.
The index holds facts that cannot change (a token's decimals, a pool's terms at creation,
that a deposit happened); the chain answers everything with a setter behind it.

---

## 4. The reorg bug — the best story in this codebase

Commit `7995f5e`, 2026-08-20: *"stop indexing blocks the chain can still take back."*

**The bug.** The sweep read up to `getBlockNumber()` and moved its cursor past it. Correct
on a Hardhat node, where the chain never reorganises. Wrong on every real one.

**Why it is unrecoverable rather than merely wrong** — this is the part worth understanding,
because it is a *composition* failure, not a local one:

1. A log is read from a block that is later orphaned.
2. It is written to Firestore.
3. The cursor advances past that range.
4. **The range is never looked at again.** Nothing will ever contradict the document.
5. Balances are summed from events (§1), so there is no stored total to recompute against.

Step 5 is what turns a transient read error into permanent corruption. The commit body puts
it exactly:

> *"What survives is a contribution, a loan or a membership that no chain agrees happened.
> Balances here are summed from events rather than stored, so one of those quietly inflates
> somebody's position for as long as the pool exists."*

**Two design decisions, each individually good, that were dangerous together.** Summing from
events removed a whole class of drift bug — no denormalised total can fall out of step. It
also removed the redundancy that would have made a phantom event survivable. Being able to
say that out loud is worth more than the fix.

**The fix.**

```ts
const CONFIRMATIONS = 128
const LOCAL_CHAIN_ID = 31337

export function safeHeadFor(currentBlock: number, chainId: number): number {
  if (chainId === LOCAL_CHAIN_ID) return currentBlock
  return Math.max(0, currentBlock - CONFIRMATIONS)
}
```

Three details in eight lines, each of which is a question an interviewer would ask:

- **Why 128?** Polygon PoS reorganises a few blocks deep routinely; 128 is comfortably past
  that. A number chosen against a named chain's observed behaviour, not a round figure.
- **Why zero locally?** On a chain that is a few dozen blocks deep, a 128-block lag means
  *nothing is ever indexed at all*. The correct confirmation depth for a chain that cannot
  reorganise is zero, and hard-coding 128 would have broken every local test.
- **Why `Math.max(0, …)`?** A chain shorter than the confirmation depth has nothing settled;
  `fromBlock > safeHead` then short-circuits the run rather than querying a negative range.

And the knock-on that shows the fix was thought through rather than patched in:
`caughtUp` is measured against `safeHead`, not the head — *"otherwise every successful run
would report `false`"*, since the last 128 blocks are deliberately left alone.

**The cost, and why it is affordable.** 128 blocks on Polygon is roughly four to five
minutes of added latency before the sweep sees anything. That is only tolerable because path
1 exists:

> *"The immediate path buys responsiveness; this one buys correctness."*

Two paths with **different correctness properties, deliberately**, is the design. Neither is
a fallback for the other; each is doing a job the other cannot.

---

## 5. Cursor discipline

The sweep's failure modes are all in how the cursor moves.

```ts
const MAX_BLOCK_RANGE = 500        // public RPCs cap a single getLogs span
const MAX_RANGES_PER_RUN = 100     // 50,000 blocks per invocation; timeout is 300s
```

| Situation | What happens | Why |
|---|---|---|
| `sweepBlockRange` throws | `break` — cursor stays put | Next run retries that exact range |
| A single log fails to decode | Logged, skipped, sweep continues | *"one undecodable event must not wedge the sweep forever"* |
| Cursor write fails | Logged, **not** thrown | *"the events are indexed either way; only the cursor is at risk, and a repeated range is harmless because every indexer keys on the log"* |
| Run hits its 100-range budget | Stops, cursor persisted | A backfill *"converges over consecutive runs rather than in one heroic pass"* |
| One chain's RPC is unreachable | Caught per chain, others continue | *"a flaky Amoy endpoint silently stopping localhost indexing too"* |

Two subtleties:

**Progress is persisted per range, not at the end.** A run that dies mid-backfill keeps
everything it indexed.

**The cursor never moves backwards:**

```ts
lastProcessedBlock: Math.max(toBlock, lastProcessedBlock ?? toBlock)
```

An explicit `fromBlock` re-scan is idempotent and therefore safe — but letting it rewind the
stored cursor would make the *scheduled* sweep redo every block in between afterwards. Manual
re-scan and automatic progress share one field, and the `max` is what keeps them from
fighting.

---

## 6. Three things worth having ready

### 6.1 Dependency ordering inside a range

`sweepBlockRange` runs its nine feeds in a fixed order: pools → status → memberships →
contributions → withdrawals → interest claims → loans → repayments → decisions. So a pool
created and funded in the same range is stored before its deposits land, and a payment never
points at a loan the index has not heard of.

**Say the honest part too**, because the code does: *"Nothing enforces that order
downstream."* It is a best-effort ordering that makes a mid-sweep reader see something
coherent, not an invariant. Order-independence (Rule 3) is what actually guarantees
correctness; this only makes the intermediate states tidier.

### 6.2 Deliberate double-indexing

Three log types are swept twice on purpose. `MemberJoined` is both a membership and a
contribution; `LoanRepaymentMade` is both a payment record and a reason to refresh the loan;
the decision topics are both a decision record and a loan-status refresh. The justification:

> *"A payment cannot be derived from the loan (which holds only a running total, dated once
> at settlement) and the loan cannot be derived from the payments (which never see a
> rejection or an approval), so neither sweep can be dropped in favour of the other."*

Two records answering different questions, both idempotent. Idempotency is what makes the
duplication cost nothing — which is the reward for Rules 1 and 2.

### 6.3 The event that was deliberately not changed

When pools gained a denomination, `PoolCreated` was **left alone**, and the denomination is
read back through `getPoolInfo` instead:

> *"adding a field changes the event's topic hash and breaks every indexer at once,
> including this one mid-upgrade."*

An event signature is a wire format with an unknown number of readers you cannot deploy
atomically. This is the same reasoning as never removing a field from a published API
response, and it generalises well beyond chains — worth using as the example when someone
asks about schema evolution.

---

## 7. What it cost

**1. The sweep must `getPoolId` on every deposit-shaped log on the chain.** Pool contracts
emit `FundsDeposited`, so there is no address to filter on — and the set of pools is exactly
what the sweep is discovering. Querying by topic alone catches deposits into pools it has not
seen yet, but it also catches every unrelated contract emitting a same-shaped log, and each
one costs a `resolvePoolId` call before it can be discarded. Cached per run
(`SweepCaches.poolIds`), so it is bounded per range — but on a busy public chain this is the
first thing that would need a rethink. Nothing has met a busy public chain yet.

**2. Summed balances are only correct if the lists are complete**, and they are paged:

```ts
// Clamped because the two lists are paged independently: a withdrawal can
// be indexed while the deposit that funded it has fallen off the page,
// and a negative liquidity figure is worse than a low one.
const remaining = deposited - withdrawn
return remaining > 0n ? remaining : 0n
```

A clamp is a defensible answer to an undefendable subtraction, and the comment says as much.
But it means the client-side liquidity figure is an approximation whose error is invisible.
The docstring is careful about a second limitation too: this is *"what members are owed, not
what the pool can pay today"* — a screen needing the payable figure has to read the chain.
**Summing from events removed drift and bought a paging problem.** Both halves belong in the
answer.

**3. `repairPool` costs a read on every already-indexed log.** The narrow exception to
write-once: a pool stored while a token read was failing would keep that gap for ever, which
is not cosmetic — *"unsupported in the app, permanently, because of one RPC hiccup"*. So
every `ALREADY_EXISTS` triggers a `get()`. It repairs in one direction only (absent → known,
never overwriting a good value with a later failed read), which is the right shape. It is
still a read per duplicate log on every re-scan.

**4. Chains are swept sequentially.** Deliberate — parallel sweeps would multiply RPC
pressure and make the per-run budget meaningless — but one slow chain delays the others
within a run.

**5. None of this has met a real reorg.** The contracts are deployed to a local Hardhat node
only; Polygon Amoy is next. The 128-block depth is reasoned from Polygon's documented
behaviour and tested against a fake head, **not observed**. Say this before being asked. The
reasoning is the deliverable; claiming operational experience you do not have would be the
one way to lose the credit for it.

---

## 8. How it is tested

145 test cases across the four core files, measured today: `eventIndexer` 50,
`eventSweeper` 44, `syncPoolEvents` 30, `indexPool` 21 — within a backend suite of roughly a
thousand (the report's §2 carries the authoritative total).

The shape worth describing: `safeHeadFor` and `resolveInitialFromBlock` are **exported pure
functions**, so the reorg logic and the cold-start logic are unit-testable without a chain at
all. Extracting them is what makes "does the cursor stop 128 short of the head" a two-line
test instead of an integration scenario. Beyond mocks, the project runs live-node checks
against a Hardhat node and the Firebase emulators.

---

## 9. The 90-second version

> The chain is authoritative but you cannot query it the way an app needs, so events get
> mirrored into Firestore. Three independent paths write that mirror — the app indexes its
> own transaction the moment the receipt confirms, a startup recovery drains anything a
> killed app left behind, and a sweep every five minutes catches everything else, including
> things that never went through the app at all. They race, and that is fine, because every
> write is a `create()` on a document id derived from the log, so only a genuine first write
> succeeds and everything else is a no-op.
>
> The rule that makes it work is that **nothing infers state from which event arrived**. A
> loan event does not mean "apply this transition" — it means "this loan is worth re-reading",
> and the indexer calls `getLoan` and stores what it says. So an approval processed before its
> request still lands on the right answer, and re-scanning old blocks writes today's truth
> rather than a stale one. Seven loan actions go to one callable because of it.
>
> The bug I would tell you about is that the sweep originally indexed up to the chain head and
> moved its cursor past it. That is correct on a local node and wrong on a real chain: a log
> from a block that gets orphaned is written once and never revisited, because the cursor has
> gone past it. And because balances are summed from events rather than stored, there is no
> total to recompute against — the phantom deposit inflates somebody's position for as long as
> the pool exists. Two decisions that were each fine on their own. It stops 128 blocks short of
> the head now, and the immediate path is what pays for the latency: one path buys
> responsiveness, the other buys correctness.

---

## 10. Questions you would be asked, and the answers

**"Why not one writer?"** — Because the three cover different failure domains. The immediate
path cannot cover an app that was killed; recovery cannot cover a transaction that never went
through the app; only the sweep covers pool deactivation, which has no on-demand path at all.
Making them safe to race was cheaper than making one of them reliable enough to be alone.

**"How do you know a re-scan doesn't duplicate?"** — Document ids are derived from chain
facts (`chainId-poolId`, `chainId-txHash-logIndex`), and every write is `create()`, which
Firestore rejects atomically with gRPC status 6 on an existing document. §3, Rules 1–2.

**"What happens if two deposits are in one transaction?"** — They get separate documents,
because the id includes the log index. A hash-only key would have merged them — and the ethers
v6 rename of `logIndex` to `index` is the trap that would silently reintroduce it.

**"Why 128 confirmations, and why zero locally?"** — Polygon PoS reorganises a few blocks deep
routinely. Zero locally because a Hardhat chain is a few dozen blocks deep and a 128-block lag
would mean nothing is ever indexed. §4.

**"Isn't summing from events expensive and fragile?"** — It removed denormalised totals that
can drift, which was the point. It bought a paging problem: the figure is only right if both
lists are complete, and the code clamps a negative result rather than showing one. And it is
what made the reorg bug unrecoverable rather than merely wrong. §7.2.

**"Have you seen a reorg in production?"** — No. Nothing is deployed to a public chain. The
depth is reasoned from Polygon's documented behaviour and tested against a synthetic head.

**"What would you change?"** — The unfiltered topic queries are the scaling ceiling: on a busy
chain, every deposit-shaped log from any contract costs a lookup before it can be discarded.
The fix is to maintain the known pool-address set in Firestore and filter `getLogs` by address
once the set is warm, falling back to topic-only scanning for ranges that might contain
undiscovered pools.

---

## 11. Where to look

| What | Path, from the checkout root |
|---|---|
| Pool indexer — `create()`, repair, metadata degradation | `packages/backend/src/services/eventIndexer.ts` (371 lines) |
| The sweep — nine feeds, caches, dependency order | `packages/backend/src/services/eventSweeper.ts` (507) |
| Scheduled sync — cursor, confirmations, per-chain loop | `packages/backend/src/functions/events/syncPoolEvents.ts` (346) |
| Local trigger (scheduled fns don't fire in the emulator) | `packages/backend/src/functions/events/syncPoolEventsNow.ts` |
| The other seven indexers | `packages/backend/src/services/{contribution,interestClaim,loan,loanDecision,loanRepayment,membership,withdrawal}Indexer.ts` |
| The six on-demand callables | `packages/backend/src/functions/pools/index{Pool,Contribution,Withdrawal,InterestClaim,Loan,Membership}.ts` |
| Path 1 and 2, client side | `apps/mobile/src/hooks/pools/usePoolIndexing.ts` · `apps/mobile/src/stores/PendingTransactionsStore.ts` |
| Summing from events | `apps/mobile/src/stores/PoolStore.ts:605` — `poolLiquidity` |
| Written narrative per flow | `docs/CONTRIBUTIONS.md` · `docs/LOANS.md` · `docs/MEMBERSHIP.md` · `docs/POOL_CREATION.md` |

**The commits to read**, in this order:

| Commit | Subject |
|---|---|
| `7995f5e` | fix(backend): stop indexing blocks the chain can still take back |
| `ecf83ec` | feat(backend): serve every configured chain, not one at a time |
| `4757bb9` | feat(multi): search Discover across the chain, not one page of fifty |
| `86e4668` | feat(backend): record what was decided, by whom, and when |
| `a25af17` | feat(multi): index what a pool is denominated in |

**Related:** `rm30/superpool.md` (*the engineering report, outside this repo*) §3 (the constraints as stated by
the report), §5 (backend and agent), §11 (what it demonstrates). The per-share accumulator in
§4 of that report is the other half of "designing around real distributed-systems
constraints" and is a candidate for its own dive under `performance/`.
