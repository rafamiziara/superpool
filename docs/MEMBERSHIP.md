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

## What the app does not do yet

- **No membership is required to _view_ a pool.** The register gates depositing
  and borrowing, not reading — and the events are public on chain regardless, so
  a permissioned pool's roster is discoverable there whatever the app shows.
- **A request never expires.** Only the owner's decision ends it; there is no
  `cancelMembershipRequest` counterpart to `cancelLoanRequest`.
- **Membership is the owner, not the Safe.** The multi-sig story still does not
  reach it.
- **`maxMembers` is not enforced.** `memberCount` is tracked on chain and the
  field exists in `packages/types`, but nothing bounds it.
- **Rejection carries no reason.** Deliberate: free text on chain costs gas and
  is metadata. If it is wanted, it belongs in Firestore beside the record.
