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
2. **On a schedule**, via `syncPoolEvents`, which scans `PoolCreated` events from
   the last processed block. This is the net for anything the app missed —
   including a user who closed the app right after signing.
3. **At app startup**, via `PendingTransactionsInitializer`, which resolves every
   still-`submitted` transaction against the chain and hands whatever confirmed
   to `indexConfirmed()` on the pools screen.

Idempotency is what makes retrying safe: the Firestore document id is
`${chainId}-${poolId}`, so a second write for the same pool is a no-op and
reports `alreadyIndexed`. Indexing failures are deliberately silent in the UI —
the pool exists either way, and the scheduled sync will pick it up, so an error
message would report a problem the user cannot act on.

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
- **`syncPoolEvents` has never run against a live chain.** Only the on-demand
  path is verified end to end.
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
npx firebase-tools emulators:start --only functions,firestore,auth --project demo-superpool
```

The factory address changes on every redeploy. Update `POOL_FACTORY_ADDRESS` in
`packages/backend/.env` and `EXPO_PUBLIC_POOL_FACTORY_ADDRESS_LOCALHOST` in
`apps/mobile/.env` from the deploy output.

Set `EXPO_PUBLIC_USE_MOCK_POOLS=true` to work on the UI without any of this.
