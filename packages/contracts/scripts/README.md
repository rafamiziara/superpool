# `scripts/`

Fourteen scripts and a `lib/`. This file is the index: what each one is, which
chain it belongs on, what it needs, and what it leaves behind.

It exists because none of that was answerable from the folder. Two scripts had
never run at all, one had been reverting for five days, and nothing said which
of them may point at a real chain.

---

## The rule about arguments

**Arguments are environment variables, never positional.** `hardhat run` does
not forward positional arguments — `process.argv.slice(2)` is _Hardhat's_ own
command line (`run`, the script path, `--network`, the network), so a script
reading `args[0]` reads the literal string `run`.

This was discovered three times before it was written down. `lib/args.ts` holds
the explanation and the four helpers every script now shares; a script that
needs an argument prints its usage and exits.

## The rule about networks

The **Real chain?** column is the one to read before running anything. `no`
means the script is meaningless or refuses to act off a local node; `yes` means
it can spend gas or publish something.

`isLocalNetwork()` in `lib/verification.ts` is the shared predicate, and it
counts the forks as local — `polygonAmoyFork` answers on `127.0.0.1` while
wearing another chain's id.

---

## Deploying

| Script            | npm                                             | Network    | Arguments                                                   | Writes                        | Real chain? |
| ----------------- | ----------------------------------------------- | ---------- | ----------------------------------------------------------- | ----------------------------- | ----------- |
| `deploy.ts`       | `deploy:amoy`, `deploy:fork`                    | Amoy, fork | `BACKEND_WALLET_ADDRESS` (env, warns if unset)              | `deployments/<network>.json`  | **yes**     |
| `deploy-local.ts` | `deploy:local`                                  | localhost  | —                                                           | `deployments/localhost.json`  | no          |
| `upgrade.ts`      | `upgrade:local`, `upgrade:fork`, `upgrade:amoy` | any        | `UPGRADE_TARGET=pool-implementation` (default) or `factory` | updates the deployment record | **yes**     |

`deploy.ts` writes the **start block**, which is what stops a first sweep on a
public chain from missing every pool older than it. `deploy-local.ts` is a
different script rather than a flag: it also deploys a six-decimal mock USDC,
funds ten accounts, creates four sample pools and prints the `.env` lines to
paste into the backend and the app.

## The Safe, and handing the factory over

| Script                  | npm                                          | Network   | Arguments                                                                                               | Real chain? |
| ----------------------- | -------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------- | ----------- |
| `deploy-safe.ts`        | `safe:deploy:local`, `:fork`, `:amoy`        | any       | — (owners and threshold from `SAFE_OWNERS` / `SAFE_THRESHOLD`)                                          | **yes**     |
| `transfer-ownership.ts` | `transfer:ownership:local`, `:fork`, `:amoy` | any       | `TRANSFER=initiate\|complete\|verify\|rollback`, `POOL_FACTORY_ADDRESS`, `SAFE_ADDRESS`, `EXECUTE=true` | **yes**     |
| `simulate-multisig.ts`  | `simulate-multisig`                          | localhost | `SIMULATION=acceptOwnership\|pause\|createPool`, `SAFE_ADDRESS`, `TARGET_ADDRESS`                       | no          |

**The handover is two transactions**, because `PoolFactory` is `Ownable2Step`:
`TRANSFER=initiate` nominates and `TRANSFER=complete` accepts _through the
Safe_. With a threshold above 1, `complete` signs once and stops at `prepared` —
the other owners add their signatures in the Safe UI. That is the real workflow,
and it is why `pnpm test:safe:local` matters: a local node is the only place one
process can meet the threshold, so it is the only rehearsal of the accepting
half before it happens for real, once.

A local node has no Safe contracts on it and no entry in Safe's registry for
chain 31337. `lib/safe.ts` handles that — see below.

## Checking it works

| Script           | npm          | Network   | What it is                                                                                                                     |
| ---------------- | ------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `smoke-local.ts` | `test:local` | localhost | The core flow end to end against a node: ownership, access control, the two-step transfer, emergency functions, pool creation. |
| `smoke-safe.ts`  | `test:safe`  | fork      | The same, with the Safe half.                                                                                                  |
| `demo-safe.ts`   | `demo:safe`  | localhost | An **explanation** printed to the terminal. Deploys nothing, signs nothing.                                                    |

These are not the test suite: mocha does not collect them and they need a
running node. The assertions live in `test/`, and the Safe ones are
`pnpm test:safe:local` (bare node) or `pnpm test:integration` (fork).

They were called `test-local-flow.ts`, `test-safe-flow.ts` and
`demo-safe-workflow.ts`, which distinguished them from nothing.

## Verifying on an explorer

| Script                | npm                | Arguments                                                            |
| --------------------- | ------------------ | -------------------------------------------------------------------- |
| `verify-contracts.ts` | `verify:contracts` | `VERIFY_CONTRACT`, `VERIFY_ADDRESS`, `VERIFY_ARGS` (comma-separated) |
| `verify-proxy.ts`     | `verify:proxy`     | `PROXY_ADDRESS`                                                      |

Both need `ETHERSCAN_API_KEY`. One key covers every supported chain — Etherscan
v2 — and `verificationBlocker()` says why it is skipping rather than failing
when there is no explorer or no key.

## Everything else

| Script             | npm             | What it is                                                                                           |
| ------------------ | --------------- | ---------------------------------------------------------------------------------------------------- |
| `generate-abis.ts` | `abis:generate` | Regenerates the backend's and the app's ABI copies. `test/AbiSync.test.ts` fails if they drift.      |
| `abi-codegen.ts`   | —               | The rendering, imported by the generator _and_ by the test, so they cannot disagree.                 |
| `print-env.ts`     | `env:print`     | Reads a deployment record back as `.env` lines. Plain `node`, so it takes real positional arguments. |

---

## `lib/`

Shared because it was duplicated, one module at a time, as the duplication
became visible. Not the class hierarchy `.dev/contracts/CONTRACTS_BACKLOG.md` §5
rejected.

| Module            | What it holds                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verification.ts` | Explorer verification: the retry, the backoff, the "already verified" match, and `isLocalNetwork()`. Was written four times.                                              |
| `safe.ts`         | The Safe SDK's plumbing: the RPC URL, and `contractNetworks` — which decides between the canonical addresses, a fork's copies, and deploying Safe onto a bare local node. |
| `accounts.ts`     | Which key signs. Hardhat's test accounts are **derived**, not pasted; four scripts each carried their own map, and two of them silently fell back to account 0.           |
| `args.ts`         | The environment-variable convention above, and why positional arguments cannot work here.                                                                                 |
| `main.ts`         | `isMain()` — whether this module is the script that was asked for. `import.meta.main` is false under `hardhat run`, for exactly the scripts that need it true.            |
