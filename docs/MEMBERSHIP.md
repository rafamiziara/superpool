# Pool Membership

Who belongs to a pool, and who decides. Companion to
[`CONTRIBUTIONS.md`](CONTRIBUTIONS.md) and [`LOANS.md`](LOANS.md) — read this
before touching anything that gates a deposit or a loan.

## The shape of it

A membership is **not an event**. Like a loan, one document per `(pool, address)`
is rewritten by every event that touches it, and its status is read back from
`membership(address)` rather than inferred from which log arrived. That is what
makes an approval swept before its request, or a re-scan of either, land on the
right answer.

```
join.tsx / members.tsx        → requestMembership | approveMember | rejectMember
                                | removeMember | leavePool
useMembership                 → the call, from the user's own wallet
useTransactionMonitoring      → waits for the receipt, decodes the account
usePoolIndexing               → indexMembership
membershipIndexer             → one Firestore document per (pool, address)
listMembers                   → the app reads standing from it
```

## The rule everything else follows from

> **The register is written on every deposit, in both modes.**
>
> - Permissioned pool: `depositFunds` requires `Active` already.
> - Open pool: depositing with no record enrols you — `None → Active`.

Three things follow, and all three are load-bearing:

1. **There is one answer to "is this address a member"** in either mode.
   `PoolStore.memberships` reads it instead of inferring it, so the app cannot
   show two different member lists on two screens.
2. **The old semantics survive.** "Contributing makes you a member" is still
   true of an open pool; it is now a fact on chain instead of an inference off
   it.
3. **An owner can close an open pool and strand nobody**, because everyone who
   has funded it is already `Active`. That is the fact the settings screen
   states, and it is not obvious from the switch.

`Rejected` and `Removed` deliberately do **not** auto-enrol even while the gate
is off. An owner's decision to keep someone out has to survive the gate being
opened, or turning it back on would silently readmit them.

## The owner is always a member

`_transferOwnership` grants `Active` to whoever takes the pool, and
`initialize` reaches it through `__Ownable_init` — so a pool's creator is a
member from birth and the first log a pool ever emits is its own `MemberJoined`.

Before that, the owner of a **permissioned** pool could not fund it:
`depositFunds` requires `Active`, nothing had ever granted it to them, and the
only way in was to call `requestMembership` and then approve themselves.
Borrowing was shut the same way.

Three consequences:

- **The hook, not `initialize`.** Granting in `initialize` would have left a
  later `transferOwnership` handing the pool to a non-member, recreating the
  lockout on a pool that may already be permissioned. The hook is also the one
  path OpenZeppelin routes both through.
- **`removeMember` and `leavePool` refuse the owner** (`OwnerIsAlwaysAMember`),
  or the invariant could be broken from the other side. Handing a pool over is
  `transferOwnership`, not either of these.
- **`memberCount` starts at 1**, and the outgoing owner keeps their membership
  after a transfer — they may still hold a contribution, and being demoted is
  not being turned out. Anyone already `Active` is not counted twice.

`indexPool` indexes the memberships in the creation transaction as well as the
pool, best-effort, so the owner is in their own roster immediately rather than
at the next sweep.

## Rules that must not be broken

- **`withdraw` is never gated on membership.** Removal takes away what you may
  do next, not what you already put in. `repayLoan` is ungated for the same
  reason: a removed borrower must still be able to settle their debt.
- **The mobile counterpart of that.** `PoolStore.activeMemberships` does not
  filter on `ACTIVE` alone — a removed member holding a balance keeps their
  position, or the dashboard hides money the contract will happily pay out.
- **The borrow gate is `Active`, not a contribution.** A member the owner
  admitted can borrow without having lent first. This is the micro-lending
  model, not a loosening: before the register the contribution check was only
  ever a weak proxy for membership, and the contract said so in its own comment.
- **An open pool has members too, and the screen has to say so.** For a long
  while `pool/[id]` expressed membership only as a balance, which made an open
  pool look as though the concept did not apply to it — the register is written
  in both modes, and the deposit _is_ the join. `membershipNoticeFor` states
  which door the pool has and where the wallet stands with it, in both modes.
- **The borrow button is gated on `Active`, never on the pool being
  permissioned.** An open pool grants membership on the first deposit, so a
  stranger there has a Contribute button that works and a Borrow button that
  reverts with `UnauthorizedBorrower`. It reads "Contribute to borrow" and is
  disabled — except when a loan or a live request already exists, because
  `repayLoan` is ungated and a removed borrower must still be able to settle.
- **Withdraw follows the balance, not the membership record.** Since the
  register was merged into `PoolStore.memberships`, an admitted member who has
  not funded anything holds a record with a zero balance, and `withdraw` reverts
  on them.
- **`Membership.None` is enum ordinal 0 and that is the correct zero** — an
  address nobody has heard of has no membership. Note this is the _opposite_ of
  `LoanStatus.Disbursed`, which sits at zero only because it was retrofitted
  onto pools already holding loans. The backend's `MEMBERSHIP_STATUS` array
  tracks the Solidity enum by index; an unknown ordinal throws rather than
  reading as `none`, because quietly dropping somebody out of their pool is
  worse than failing.

## Reading the flag

`requiresMembership` is `poolConfig`'s **sixth** member (`config[5]`),
`requiresApproval` its fifth. Read it **from the chain, never from an indexed
pool record** — the owner can change it at any moment through
`setRequiresMembership` and nothing indexes it. A pool that predates the field
decodes to nothing, and open is the right answer for those.

Same rule, same reason, as `requiresApproval` in [`LOANS.md`](LOANS.md).

## Two sources, deliberately

`PoolStore` exposes both, and picking the wrong one is the mistake this section
exists to prevent:

- **`memberships`** merges the register with the events: standing from one,
  balances from the other, and a contributor the sweep has not reached defaults
  to `ACTIVE`. Right for showing somebody their own position.
- **`memberRecords`** is the register alone, via `pendingMembersFor` and
  `registerStandingFor`. Right for anything the owner acts on, and for telling a
  rejected applicant from a stranger — `removeMember` reverts for anyone the
  register does not hold as `active`, and only this can tell them apart.

## Why a decision went the way it did

Rejection, approval and removal each carry an optional reason, in the `notes`
collection rather than on chain — exactly where the original deferral said it
belonged. See [Notes](../CLAUDE.md#notes) for the mechanism.

Two things specific to membership:

- **The note is keyed on the membership record and the outcome**,
  `${chainId}-${poolId}-${account}:${kind}`, so an address whose standing
  changes over time carries one sentence per decision rather than one in total.
  It is the register's own document id, so `memberRecords` and the note always
  agree on whom they are about.
- **A removal reason reaches nobody by push.** Removal has no notification and
  should not have one — it is not a decision on anything the member asked for
  (see [Notifications](../CLAUDE.md#notifications)) — so the reason waits on
  `pool/[id]`, under the standing notice, until they next open the pool. That
  is the whole reason it was worth building: today they are told nothing at
  all, ever.

The reason is written **before** the transaction, so the applicant's rejection
or approval push can quote it. Nothing requires one, and nothing reads one to
decide anything.

## What the app does not do yet

- **No membership is required to _view_ a pool.** The register gates depositing
  and borrowing, not reading — and the events are public on chain regardless, so
  a permissioned pool's roster is discoverable there whatever the app shows.
- **A request never expires.** Only the owner's decision ends it; there is no
  `cancelMembershipRequest` counterpart to `cancelLoanRequest`.
- **Membership is the owner, not the Safe.** The multi-sig story still does not
  reach it.
- **A pool has no member cap.** `memberCount` is tracked on chain but nothing
  bounds it. There was a `maxMembers` field in `packages/types` promising
  otherwise; it was deleted rather than implemented, because no screen ever
  collected a cap and no pool has ever had one.
- **A reason is never required, and never load-bearing.** It is a courtesy
  attached to a decision, not part of it — see the section above.
