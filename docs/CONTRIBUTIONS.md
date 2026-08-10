# Liquidity Contributions

How a deposit gets from a wallet into a pool's liquidity figure. Companion to
[`POOL_CREATION.md`](POOL_CREATION.md), which this flow deliberately mirrors —
read that one first if you have not.

Everything below is verified against a running Hardhat node and the Firestore
emulator, not only against mocked tests.

## The shape of it

A contribution is one `FundsDeposited` event. That is the whole model: there is
no separate deposit record, no running total, and nothing to reconcile.

```
ContributeForm (POL)          → wei
useContribution               → depositFunds{value} from the user's own wallet
useTransactionMonitoring      → waits for the receipt, decodes FundsDeposited
usePoolIndexing               → indexContribution
contributionIndexer           → one Firestore document per log
listContributions             → the app sums them
```

## Why there is no membership flow

`SampleLendingPool` has no membership register. There is nothing on chain to
join, no `addMember`, no approval. So the app treats **contributing to a pool as
what makes you a member of it**, and `PoolStore.memberships` is derived from
`contributions` rather than stored.

That is not a shortcut around a missing feature — it is the only model the
contracts can actually support today. When a real register arrives, this getter
is the one place that changes.

The same reasoning applies to a pool's liquidity and a member's balance: both
are summed from the events on read. There is no denormalised total, so there is
nothing that can fall out of step with the chain.

## Why there is no preparation step

Pool creation calls `preparePoolCreation` first, because `PoolFactory` runs a
creator whitelist and the backend pays the gas to add the user to it.

Deposits need none of that. `depositFunds` is open to anyone — the whitelist
governs who may _create_ a pool, not who may fund one — so the flow goes
straight to the wallet.

## Resolving the pool

`FundsDeposited(address indexed depositor, uint256 indexed amount)` carries no
pool identifier. The contract that emitted it _is_ the pool, so the address comes
from `log.address`, and the id is read back from the factory's
`poolAddressToId` via `getPoolId`.

Reading it from the chain rather than from Firestore does double duty: an address
the factory does not know is not a SuperPool pool, and `getPoolId` returning 0 —
ids start at 1 — is how a deposit into a stranger's contract is refused. Anyone
can call `depositFunds` on any contract that has it, so this check is load-bearing.

## Traps

Every item here was found by driving a real node. None were visible to the
mocked tests.

- **Both `FundsDeposited` parameters are `indexed`.** The values live entirely
  in `log.topics` and `log.data` is empty. A decoder that reads only `data`
  returns zero for every deposit, and a hand-written test fixture that puts the
  amount in `data` will happily agree with it. Encode fixtures through the
  shipped ABI.
- **ethers v6 renamed `Log.logIndex` to `Log.index`.** Reading the v5 name gives
  `undefined`, which collapses every log in a transaction onto one document id
  and silently drops all but one.
- **One transaction can carry several deposits.** Documents are keyed
  `${chainId}-${txHash}-${logIndex}` for that reason; a hash-only key would merge
  them. `indexContribution` reports `alreadyIndexed` only when it wrote nothing
  at all, since a transaction with one new log out of two is not "already
  indexed".
- **Addresses are stored lowercased**, as in the pool indexer, and
  `listContributions` lowercases the `contributor` it filters by. A checksummed
  filter matches nothing — verified against the emulator.
- **A `Date` cannot cross a Firebase callable.** `ContributionInfo.contributedAt`
  is an ISO string. Same rule as `PoolInfo.createdAt`.
- **The result extractor is chosen by transaction type.** Startup recovery has
  only the stored `type` to tell a deposit from a pool creation, so
  `extractResult` dispatches on it. Running the wrong extractor finds no log,
  and "no log" is what the monitor reads as failure — every recovered deposit
  would have been marked failed.

## What the user sees

- **The contribute screen** (`app/(auth)/pool/contribute.tsx`), reached from a
  pool's detail screen, with the pool as a query parameter.
- **A Liquidity stat** on the pool detail screen, summed from indexed
  contributions.
- **Your position**, the member's balance and total contributed.
- **A pending row per in-flight deposit**, beneath the pool. Until the backend
  has indexed one, that row is its only trace — the liquidity figure does not
  move yet.

Pending rows need no dedupe against indexed contributions, unlike the pool
cards on the pools screen: `triggerIndexing` drops the local record only after
the refresh that lists the contribution has already landed.

An amount above the wallet balance is a **warning, not a validation failure**.
The balance read can be stale and gas comes out of it too, so the definitive
answer is the pre-flight `estimateContractGas` inside `useContribution` — which
includes the `value`, so an unaffordable deposit is caught before the signature
prompt rather than after it.

## Known limitations

- **Native currency only.** ERC-20 deposits need contract work.
- **Nothing can be withdrawn.** `SampleLendingPool` has no withdrawal function,
  so a member's balance only ever grows. `currentBalance` equals
  `totalContributed` for that reason, and `totalEarned` is 0 — no interest
  accrues to anyone yet.
- **No scheduled sync for deposits.** `syncPoolEvents` covers `PoolCreated`
  only, so a contribution whose immediate indexing fails waits for the user to
  reopen the app, where startup recovery drains it. The pool-creation net does
  not catch this one.
- **The backend serves one chain at a time**, exactly as for pool creation.
- The `contributions` composite indexes are declared in
  `config/firestore.indexes.json`. The emulator does not enforce them, so a
  query that works locally can still need an index in production.

## Running it locally

Same environment as pool creation — see
[`POOL_CREATION.md`](POOL_CREATION.md#running-it-locally). On a fresh node the
deploy creates pools 1–3; any funded Hardhat account can contribute to any of
them, since deposits need no whitelisting.
