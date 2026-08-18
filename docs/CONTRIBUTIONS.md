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
ContributeForm (POL or USDC)  → the token's own smallest unit
useTokenApproval              → approve, on a token pool only, and waits for it
useContribution               → depositFunds{value}, or depositTokens(amount)
useTransactionMonitoring      → waits for the receipt, decodes FundsDeposited
usePoolIndexing               → indexContribution
contributionIndexer           → one Firestore document per log
listContributions             → the app sums them
```

## A pool takes one asset, and the app has to know which

`PoolConfig.loanToken` says what a pool lends, with `address(0)` meaning the
chain's own coin. The two deposit paths are separate entry points rather than
overloads of one name — `depositFunds` is payable and native-only,
`depositTokens(uint256)` pulls, and each reverts against the wrong kind of pool.
See [`../.dev/contracts/ERC20_PLAN.md`](../.dev/contracts/ERC20_PLAN.md) §3.1
for why the overload does not work.

Three rules follow, and each has cost something to learn:

- **Decimals come from the pool, never from a default.** `denominationFor` in
  the app resolves a `PoolInfo` into a symbol and an exponent, and returns
  `undefined` for a pool whose token the backend could not read — which the
  screens show as unsupported rather than formatting with a guess. Eighteen
  against USDC renders 5 as five trillion.
- **Funding a token pool is two transactions.** The approval is a stage in the
  contribute screen's own state machine, not a pending transaction: it changes
  nothing the app displays and has nothing to recover into. The allowance is
  read on submit, so a flow abandoned between the two resumes at the deposit.
  The amount is approved and never `type(uint256).max` — the convenient thing
  means a bug in the pool can reach the rest of the member's balance.
- **The pool credits what arrived, not what was asked for.** A fee-on-transfer
  token delivers less, and crediting the request inflates `totalContributions`
  — the denominator every interest distribution divides by — diluting every
  other lender for the life of the pool, invisibly. Verified with a mock fee
  token in `pnpm --filter backend testErc20`, and confirmed by mutation: credit
  the request instead and exactly two checks there fail.

## Membership is a register now, not an inference

**This section used to say the opposite.** Until the membership milestone
`LendingPool` had nothing to join, so the app treated contributing as what
made you a member and `PoolStore.memberships` derived that from
`contributions`. It now reads a real register — see
[`MEMBERSHIP.md`](MEMBERSHIP.md).

What matters here is that **depositing still enrols you in an open pool**. The
contract writes the register on every deposit in both modes, so the old
semantics are preserved exactly; they are just an on-chain fact instead of an
off-chain inference. In a permissioned pool the order reverses — `depositFunds`
reverts for anyone who is not `Active`, so joining comes first.

`PoolStore.memberships` therefore merges two sources: standing from the
register, money from the events. Keep the split. A contributor the sweep has not
reached yet still reads as active, which is what depositing has always meant.

The liquidity half is unchanged: a pool's liquidity and a member's balance are
summed from the events on read. There is no denormalised total, so there is
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

The balance it warns against is **the pool's own unit**: a wallet holding POL
and no USDC would otherwise be told it can fund a USDC pool. `useBalance` reads
the chain's coin only — wagmi v2 dropped its `token` argument — so a token pool
reads `balanceOf` itself.

## Known limitations

- **One asset per pool, chosen at creation and never changed.** There is no
  setter on `loanToken`, deliberately: re-denominating a pool would reinterpret
  every stored contribution as a quantity of something else. A group wanting to
  lend a different token creates a different pool.
- **The token allowlist is small and configured, not discovered.** Localhost
  gets a mock deployed by `deploy:local`; Amoy's test USDC is still unconfirmed,
  so the create form there offers native alone until
  `EXPO_PUBLIC_USDC_ADDRESS_AMOY` is set. A pool denominated in a token the app
  cannot format is unusable, and an arbitrary-token pool is a rug vector.
- **A contribution is not earnings.** Members can withdraw
  (`LendingPool.withdraw` → `FundsWithdrawn` → the `withdrawals`
  collection), and `currentBalance` is deposits minus withdrawals, while
  `totalContributed` stays lifetime deposits — so someone who withdrew
  everything still reads as a past member. Interest is credited separately and
  never lands in either figure; `totalEarned` is claims plus what the chain says
  is still claimable. See [`INTEREST.md`](INTEREST.md).
- **The scheduled sweep has never run on its schedule.** `syncPoolEvents` does
  now cover `FundsDeposited` and `FundsWithdrawn` alongside `PoolCreated`, so a
  contribution whose immediate indexing fails is caught by the net rather than
  waiting for the user to reopen the app. But scheduled functions do not fire in
  the emulator and nothing is deployed yet, so locally the sweep only runs when
  something triggers it: the `syncPoolEventsNow` callable, or `pnpm testSweep`
  from `packages/backend`. See [Sweeping](POOL_CREATION.md#sweeping).
- **The backend serves one chain at a time**, exactly as for pool creation.
- The `contributions` composite indexes are declared in
  `config/firestore.indexes.json`. The emulator does not enforce them, so a
  query that works locally can still need an index in production.

## Running it locally

Same environment as pool creation — see
[`POOL_CREATION.md`](POOL_CREATION.md#running-it-locally). On a fresh node the
deploy creates pools 1–3; any funded Hardhat account can contribute to any of
them, since deposits need no whitelisting.
