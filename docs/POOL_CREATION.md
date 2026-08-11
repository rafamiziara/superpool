# Pool Creation

How a lending pool goes from a form on someone's phone to a row in the app's
pool list, and why it is built the way it is.

This describes the system **as built**. The pre-implementation design doc and the
task tracker live in `.dev/` and are not kept in sync with the code.

---

## The problem

Creating a pool is a transaction the user signs and pays for. That is the easy
part. The hard part is everything around it:

- `PoolFactory.createPool()` is guarded by `onlyAuthorizedCreator`, so a
  first-time creator is not allowed to call it at all.
- A transaction can take seconds or minutes to mine, and the app can be closed
  in between.
- The pool exists on chain the moment it is mined, but the app lists pools from
  Firestore — so there is always a window where the pool is real and invisible.

Each of those has a specific answer below.

## Lazy whitelisting

Whitelist mode is enabled on the factory, which means spam protection works, but
a new user cannot create anything. Two ways out: whitelist everyone up front
(pointless — that is just disabling the guard), or whitelist on demand.

The app calls `preparePoolCreation` before opening the wallet. The backend checks
`isAuthorizedCreator(wallet)` and, if the answer is no, sends
`setCreatorAuthorization(wallet, true)` itself. **The backend pays that gas**, and
`setCreatorAuthorization` is `onlyOwner`, so the backend wallet must be the
factory owner — locally that is Hardhat account #0.

The user still signs and pays for their own `createPool` transaction, so the pool
is theirs: `poolOwner` is set to `msg.sender` by the contract, and there is no
parameter that could make it anything else.

## The flow

```
CreatePoolForm  ──►  usePoolCreation  ──►  wallet signs createPool
                          │                        │
                          │                        ▼
                          │              PendingTransactionsStore
                          │              (persisted to AsyncStorage)
                          ▼                        │
                 preparePoolCreation               ▼
                  (backend pays gas)     useTransactionMonitoring
                                                   │
                                          confirmed ▼
                                          usePoolIndexing
                                                   │
                                                   ▼
                                     indexPool ──► Firestore ──► listPools
```

The form takes user units (POL, percent, days) and emits contract units (wei,
basis points, seconds). Nothing downstream converts again. Contract limits live
in `src/constants/pools.ts` because the form and the hook both need them.

## Three ways a pool gets indexed

A pool that is on chain but not in Firestore is invisible to the app, so there
are three independent paths to indexing it. All three funnel into the same
`indexPoolByTxHash` / `eventIndexer` service, and all three are idempotent.

1. **Immediately**, via the `indexPool` callable, once the app sees the receipt.
   This is the fast path and the one that runs in practice.
2. **On a schedule**, via `syncPoolEvents`, which sweeps every SuperPool event —
   `PoolCreated`, `FundsDeposited` and `FundsWithdrawn` — from the last processed
   block to the chain head. This is the net for anything the app missed:
   a user who closed the app right after signing, a seeding script, or a pool
   created straight against the contract. See [Sweeping](#sweeping) below.
3. **At app startup**, via `PendingTransactionsInitializer`, which resolves every
   still-`submitted` transaction against the chain and hands whatever confirmed
   to `indexConfirmed()` on the pools screen.

Idempotency is what makes retrying safe: the Firestore document id is
`${chainId}-${poolId}`, so a second write for the same pool is a no-op and
reports `alreadyIndexed`. Indexing failures are deliberately silent in the UI —
the pool exists either way, and the scheduled sync will pick it up, so an error
message would report a problem the user cannot act on.

## Sweeping

`syncPoolEvents` is the only path that does not need the app to have been
watching. It is not pool-specific: balances are derived by summing deposits and
subtracting withdrawals, so a net that caught pools alone would leave every
figure computed from an incomplete history.

```
syncPoolEvents (every 5 min)          syncPoolEventsNow (callable)
        │                                        │
        └──────────────┬─────────────────────────┘
                       ▼
            syncPoolEventsHandler
        reads event_sync_state/{chainId}
                       │
       walks the gap in 500-block ranges
                       ▼
              sweepBlockRange
     PoolCreated → FundsDeposited → FundsWithdrawn
                       │
        indexPoolEvent / indexContributionEvent
              / indexWithdrawalEvent
```

Things worth knowing before changing it:

- **`FundsDeposited` and `FundsWithdrawn` are queried by topic with no address
  filter.** They are emitted by each pool contract, not the factory, and the set
  of pools is exactly what the sweep is still discovering — an address filter
  would miss a deposit into a pool created in the same range. `resolvePoolId`
  then proves the emitter is one of ours; anything the factory does not know is
  skipped silently, because a sweep sees other contracts' logs routinely.
- **The order within a range is pools → deposits → withdrawals**, so a reader
  polling mid-sweep never sees a contribution pointing at a pool it cannot find.
- **The cursor is persisted after every range**, not once at the end, and never
  moves backwards. A run that dies mid-backfill keeps what it indexed.
- **A failed `getLogs` stops the run without advancing the cursor**; a single
  undecodable log is logged and skipped, so it cannot wedge the sweep forever.
- **One invocation sweeps at most 100 ranges (50,000 blocks).** A long backfill
  converges over consecutive runs instead of running past the timeout.
- **A first run with no `START_BLOCK` sweeps a local chain from genesis** and any
  other chain from `currentBlock - 1000`, with a warning. On a real deployment,
  set `START_BLOCK` to the factory's deployment block or history older than that
  window is unreachable.

### Running it locally

Scheduled functions never fire in the Firebase emulator, so the schedule is dead
locally. Two ways to run the same sweep:

```bash
# the callable — unauthenticated in the emulator only
curl -X POST http://127.0.0.1:5001/<project>/us-central1/syncPoolEventsNow \
  -H "Content-Type: application/json" -d '{"data":{"fromBlock":0}}'

# or the integration script, which also checks the result against the chain
pnpm --filter backend testSweep
```

`fromBlock: 0` re-scans from genesis and is safe to repeat — every indexer keys
on the log, so nothing is written twice.

## What the user sees

A pool that is paid for but not yet listed still appears, as a `PendingPoolCard`
above the real ones:

| Transaction status | Card says | Means                     |
| ------------------ | --------- | ------------------------- |
| `submitted`        | Pending   | Waiting for the network   |
| `confirmed`        | Syncing   | On chain; not yet indexed |
| `failed`           | Failed    | Rejected; dismissible     |

The dashboard has no such card, so a `PendingTransactionBanner` reports the same
thing in one line there. Both open `TransactionStatusModal`, which shows the
three steps — sent, confirmed, listed — plus an explorer link where the chain has
one. Progress deliberately ends at _listed_, not at _confirmed_: the pool is not
useful to the user until it reaches their list.

A failed transaction is only ever removed by the user. Indexing removes the ones
it succeeds on; nothing else clears the record.

## Traps

Every item here was found by driving a real Hardhat node and the Firebase
emulators. None of them were visible to the mocked unit tests, which is the main
reason this section exists.

- **A `Date` cannot cross a Firebase callable.** The encoder maps objects by
  their enumerable keys, and a `Date` has none, so it arrives as `{}`.
  `PoolInfo.createdAt` is an ISO string for this reason. Never return a `Date`
  from a callable.
- **Addresses are stored lowercased.** `listPools` lowercases the `ownerAddress`
  it filters by, so the indexer stores them that way. Wallets report addresses
  checksummed. Compare case-insensitively everywhere — this has already caused
  two bugs, in `PoolCard` and on the pool detail screen.
- **The local chain is 31337**, Viem's `hardhat`, not `localhost` (1337). A
  mismatched id makes the wallet refuse every transaction sent to it.
- **ABIs drift silently.** `constants/abis.generated.ts` is rendered from the
  compiled artifacts for both backend and mobile by
  `pnpm --filter contracts abis:generate`, and `test/AbiSync.test.ts` fails on
  any drift. It compares the _full_ ABI, not a signature hash — of the five ABI
  bugs found before the guard existed, a sighash comparison would have caught
  one.
- **Viem throws for an unmined transaction.** `getTransactionReceipt` raises
  `TransactionReceiptNotFoundError` rather than returning null, and
  `receipt.status` is `'success' | 'reverted'`, not 1/0. A timeout or transport
  error therefore leaves a transaction `submitted`, so recovery can resolve it
  later — it is not a failure.

## Known limitations

- **The backend serves one chain at a time.** `getChainConfig` matches only the
  chain built from `CHAIN_ID` / `RPC_URL` / `POOL_FACTORY_ADDRESS`, so `indexPool`
  rejects any other, and localhost and Amoy cannot both be served. The mobile
  app's multi-chain support is presentational until this changes.
- **Amoy is undeployed.** Local is the only working environment; it needs a
  funded deployer key and a funded backend wallet.
- **`syncPoolEvents` has never run on its schedule.** The sweep itself is
  verified end to end against a live local node — `pnpm --filter backend
testSweep` backfilled 11 pools, 11 contributions and 4 withdrawals that the
  on-demand path had missed — but the `onSchedule` trigger only exists in a
  deployed environment, and there is not one yet.
- **No gas estimate is shown before signing.** `CreatePoolForm` accepts a
  `gasEstimate` prop that nothing feeds. The estimate still happens inside
  `usePoolCreation` before the wallet opens, so an unaffordable transaction is
  caught — it is just not previewed.

## Running it locally

Chain state is in memory: killing the node loses every pool.

```bash
# terminal 1 — keep running
pnpm --filter contracts node:local

# terminal 2 — deploys, enables whitelist mode, creates 3 sample pools
pnpm --filter contracts deploy:local

# terminal 3 — from config/
npx firebase-tools emulators:start --only functions,firestore,auth --project genesis-super-pool
```

The factory address changes on every redeploy. Update `POOL_FACTORY_ADDRESS` in
`packages/backend/.env` and `EXPO_PUBLIC_POOL_FACTORY_ADDRESS_LOCALHOST` in
`apps/mobile/.env` from the deploy output.

Set `EXPO_PUBLIC_USE_MOCK_POOLS=true` to work on the UI without any of this.
