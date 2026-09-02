# Environments

Where SuperPool runs, what configures each place, and which of those settings
are load-bearing.

**There are two environments, not four.** This document was asked for as
"local / dev / test / prod"; that is not what exists. There is **local**, there
is **CI**, and there is a **production Firebase project with nothing deployed
to it yet**. No staging tier exists, and — §3 — no flag in the code could
recognise one if it did. §9 says what adding one would actually cost.

Everything below is what the repository does today, not what it should do.

---

## 1. What exists

|          | **Local**                                              | **CI**                  | **Production**               |
| -------- | ------------------------------------------------------ | ----------------------- | ---------------------------- |
| Firebase | Emulator suite, project pinned to `genesis-super-pool` | none                    | `genesis-super-pool`         |
| Backend  | Functions emulator, `:5001`                            | not run against a chain | **not deployed**             |
| Chain    | Hardhat node, `31337`                                  | in-process EDR chain    | **nothing deployed**         |
| Mobile   | Expo dev server, `__DEV__` true                        | Jest only               | no build yet                 |
| Landing  | `next dev`, `:3001`                                    | built, not deployed     | not deployed                 |
| Agents   | `mastra dev`, `:4111`                                  | **not run at all**      | no deployment target defined |

**There is exactly one Firebase project.** `config/.firebaserc` names a single
`default` — `genesis-super-pool` — with no aliases. The emulator and the real
project are therefore the _same namespace_ as far as configuration is
concerned; what separates them is only whether the emulator is running and
whether a client was told to connect to it.

Two consequences follow, and neither is obvious:

- **`firebase use` cannot put you on the wrong project, because there is no
  other project.** It can still put you on _no_ project, which is why
  `scripts/dev-environment.js` passes `--project genesis-super-pool`
  explicitly. `config/firebase.json` sets `singleProjectMode`, so the emulator
  routes every client request to whatever that one project is; an unpinned
  start silently lands data under a different namespace and issues tokens with
  a different `aud`.
- **A production deploy has no rehearsal.** There is no second project to
  deploy to first. What plays that role instead is the emulator plus the local
  Hardhat node, and the gap between them and the real thing is the risk named
  in `.dev/deployment/GOING_PUBLIC.md`.

---

## 2. Two axes, and confusing them is a real bug

**The backend environment and the chain environment are independent**, and
every combination is reachable. This is the single most useful thing to hold on
to about this project's configuration.

```
                       chain the app is pointed at
                 ┌───────────┬────────────┬──────────────┐
                 │ localhost │    Amoy    │ Polygon, …   │
  ┌──────────────┼───────────┼────────────┼──────────────┤
  │ emulator     │  normal   │ works if   │  nothing is  │
  │ backend      │  local    │ configured │  served here │
  ├──────────────┼───────────┼────────────┼──────────────┤
  │ deployed     │ pointless │    the     │  nothing is  │
  │ backend      │ (no node) │   target   │  served here │
  └──────────────┴───────────┴────────────┴──────────────┘
```

The backend serves **every chain configured in its `.env`** at once, keyed by
chain id in the variable name — see [Chains](../CLAUDE.md#chains). So "which
chain" is not a property of the environment; it is a property of one file, and
a local backend can legitimately serve Amoy alongside localhost.

**The app does not default to a chain the backend serves.**
`apps/mobile/src/config/wagmi.ts` passes `defaultChain: polygon` to AppKit, so
a fresh wallet connection starts on **Polygon mainnet** — which no
configuration in this project serves. That cell of the grid is not
hypothetical: it is exactly what produced the `listBorrowerHistories` bug found
on 2026-08-27, where seven list endpoints quietly returned empty and the one
that reads the chain reported a server fault instead.

`DEFAULT_CHAIN_ID` in `src/config/contracts.ts` is `hardhat` under `__DEV__`
and `polygonAmoy` otherwise, but that is only the fallback for _when the wallet
has not reported a chain_. A connected wallet overrides it.

---

## 3. How the code knows which environment it is in

**Two flags. That is the whole mechanism.**

**Backend — `FUNCTIONS_EMULATOR === 'true'`**, set by the Firebase emulator
itself. Four places read it:

| Where                                    | What it changes                                                                                                             |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `utils/admin.ts` → `isEmulator()`        | `requireAdmin` lets the emulator through unasked, because schedules never fire there and there is no signed-in user to name |
| `index.ts`                               | `signMessageForTesting` and `pingAgentService` are only exported at all when set (or `NODE_ENV === 'development'`)          |
| `functions/dev/signMessageForTesting.ts` | refuses outright when unset                                                                                                 |
| `functions/dev/pingAgentService.ts`      | refuses outright when unset                                                                                                 |

**Mobile — `__DEV__`**, set by Metro. Four files read it:

| Where                 | What it changes                                                                                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config/firebase.ts`  | connects Auth, Firestore and Functions to the emulators through the ngrok URLs — and **only if those URLs are set**, so a dev build with a blank `.env` talks to production |
| `config/wagmi.ts`     | adds the localhost chain to the network picker                                                                                                                              |
| `config/contracts.ts` | `DEFAULT_CHAIN_ID` is Hardhat rather than Amoy                                                                                                                              |
| `utils/logger.ts`     | log verbosity                                                                                                                                                               |

Nothing else in the project branches on an environment. There is no
`NODE_ENV`-driven config, no `.env.production`, and no environment name
anywhere in a build.

**So a staging tier is not a config change.** There is no flag that could be
set to a third value, and both existing flags are booleans owned by tooling
rather than by this project. See §9.

---

## 4. Local

### Starting it

```bash
pnpm dev          # emulators + ngrok + mobile app
pnpm dev:backend  # emulators + ngrok only
```

`scripts/dev-environment.js` does five things, in order:

1. Checks `firebase`, `ngrok` and `pnpm` are on `PATH`, and fails loudly if not.
2. Starts the emulator suite with the project pinned, then polls ports 9099,
   5001 and 8080 for up to 30 seconds.
3. Starts every ngrok tunnel in `config/ngrok.yml`.
4. Reads the tunnel URLs back from ngrok's own API on `:4040` and **rewrites
   `apps/mobile/.env`** with them — four variables, by regex, in place.
5. Spawns Expo, with `--with-app`.

| Service               | Port | Tunnelled |
| --------------------- | ---- | --------- |
| Auth emulator         | 9099 | yes       |
| Functions emulator    | 5001 | yes       |
| Firestore emulator    | 8080 | yes       |
| Emulator UI           | 4000 | no        |
| ngrok API / inspector | 4040 | —         |
| Hardhat node          | 8545 | no        |
| Landing dev server    | 3001 | no        |
| Mastra agent service  | 4111 | no        |

The tunnels exist because a phone cannot reach `127.0.0.1` on the development
machine. They are re-created on every start with **new URLs**, which is why
step 4 exists and why `apps/mobile/.env` is a partly generated file.

### Two things `pnpm dev` does not do

Both are easy to lose an hour to.

- **It does not build the backend first.** The emulator loads
  `packages/backend/lib/`, so a stale build is what runs. Run
  `pnpm --filter backend build` before starting, and after any backend edit.
- **It does not seed the index.** `syncPoolEvents` is an `onSchedule` function
  and the pubsub emulator is not running, so Firestore starts empty and every
  list endpoint honestly returns nothing.
  `pnpm --filter backend testSweep` drives the sweep handler directly and is
  the way to fill it.

The emulator also **caches `.env` at startup**, so a variable added while it is
running takes effect at the next restart and not before.

### The chain, separately

```bash
cd packages/contracts
pnpm node:local     # terminal 1 — a bare Hardhat node on :8545
pnpm deploy:local   # terminal 2 — deploys and prints the addresses
```

The node keeps no state across restarts, so **the factory address changes on
every redeploy** and has to be pasted into two places:

- `packages/backend/.env` → `POOL_FACTORY_ADDRESS_31337` (the deploy prints the
  legacy triple ready to paste; the suffixed form wins for the same chain id)
- `apps/mobile/.env` → `EXPO_PUBLIC_POOL_FACTORY_ADDRESS_LOCALHOST`

A blank or malformed address is not an error in the app — `readAddress` rejects
it and the app reports SuperPool as not deployed on that network, which is the
right failure but looks like nothing happening.

`pnpm node:fork` runs the same node forked from Amoy instead, which is the
closest thing to production that exists today.

---

## 5. CI

`.github/workflows/ci.yml`, on push and pull request to `main` and `develop`,
Node 22, three jobs:

- **quality** — `format:check`, `lint:ts`, `lint:sol`, and type-checks.
- **test** — a matrix over `backend`, `contracts`, `mobile`, `fail-fast: false`
  so one package failing does not hide the others.
- **build** — the landing page only.

**No `.env` is provisioned**, deliberately: `hardhat.config.ts` falls back to
public RPC URLs, and neither the backend nor the mobile Jest setup reads the
environment. CI is therefore a _third_ configuration shape rather than a copy
of local — and what it cannot catch is anything that only misbehaves once a
variable holds a real value.

**Three things CI does not run**, each for a different reason:

- **`packages/agents`.** Not in the matrix, and not in the root `pnpm test`
  either, so its 9 tests only ever run when somebody runs them by hand. This is
  a gap rather than a decision.
- **The Safe integration tests.** They need a live node —
  `pnpm test:safe:local` against `pnpm node:local`. Deliberate; see
  [`packages/contracts/scripts/README.md`](../packages/contracts/scripts/README.md).
- **Anything on the landing page except a build.** It has no tests.

---

## 6. Production

**Nothing is deployed.** The Firebase project exists, the functions are not on
it, and no contract is on any public chain. What "production" currently means
is a project id and a checklist:
[`.dev/deployment/GOING_PUBLIC.md`](../.dev/deployment/GOING_PUBLIC.md).

Three facts about how a deploy would be configured, worth knowing before it
happens rather than during.

**`packages/backend/.env` becomes the deployed configuration.**
`config/firebase.json` sets the functions `source` to `../packages/backend`, and
its `ignore` list names only `node_modules`, `.git`, the debug logs and
`*.local`. A `.env` shipped with a Functions deployment is part of the
function's configuration: readable by anyone with project Viewer, visible in
the console, and kept in deployment history. That is precisely why
`BACKEND_WALLET_PRIVATE_KEY` is **not** read from it — see §8.

**`service-account-key.json` must exist at the package root for the backend to
boot at all.** `src/config/firebase.ts` `require`s it unconditionally at module
load. It is gitignored, and it is not in the `ignore` list above, so it travels
with a deploy. Deployed Cloud Functions normally authenticate through
Application Default Credentials and need no key file; moving to ADC would take
a secret out of the artefact, and is the kind of change to make before the
first deploy rather than after.

**Two variables that fail closed, and must therefore be set deliberately:**

- `ADMIN_WALLETS` — **empty means nobody**, outside the emulator. Unset in
  production means the three manual schedule twins refuse everyone, which is
  the safe direction but looks exactly like the endpoints being broken.
  `requireAdmin` logs a warning naming the likely cause, for that reason.
- `APP_ID_FIREBASE` — `customAppCheckMinter` returns 500 without it. It was
  missing from the local `.env` until 2026-08-27 and nothing noticed, because
  nothing had called the minter. **Still open for the deployed config** —
  [`.dev/todo.md`](../.dev/todo.md).

`ENFORCE_APP_CHECK` is off by default, and turning it on needs a build whose
App Check provider works end to end: flip it in a dev build first, confirm the
app still gets through, then flip it in production. Turning it on blind locks
out every client.

---

## 7. Configuration inventory

Everything named `.env*` is gitignored except the templates
(`.gitignore:16-21`). Copy the template and fill it in; nothing generates one
for you except the four ngrok lines in §4.

| File                                        | Tracked | Read by                                  | Absent means                                                                                        |
| ------------------------------------------- | ------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `packages/backend/.env`                     | no      | Functions emulator, deployed functions   | no chain is servable — callables that read the chain refuse it, and the list endpoints return empty |
| `packages/backend/.env.template`            | **yes** | humans                                   | —                                                                                                   |
| `packages/backend/service-account-key.json` | no      | `src/config/firebase.ts`, at module load | the backend does not start                                                                          |
| `apps/mobile/.env`                          | no      | Expo, inlined at build                   | no Firebase, no Reown, no factory address                                                           |
| `apps/mobile/.env.template`                 | **yes** | humans                                   | —                                                                                                   |
| `packages/contracts/.env`                   | no      | `hardhat.config.ts`                      | public RPC fallbacks, and no deploy key — so `deploy:amoy` has no account                           |
| `packages/contracts/.env.template`          | **yes** | humans                                   | —                                                                                                   |
| `packages/agents/.env`                      | no      | the Mastra service                       | no model key; the `ping` workflow still works, which is what lets the seam be checked without one   |
| `packages/agents/.env.template`             | **yes** | humans                                   | —                                                                                                   |
| `config/ngrok.yml`                          | no      | `dev-environment.js`                     | ngrok starts no tunnels; the script falls back to placeholder URLs and warns                        |
| `config/ngrok.yml.template`                 | **yes** | humans                                   | —                                                                                                   |
| `config/.firebaserc`                        | **yes** | Firebase CLI                             | —                                                                                                   |
| `config/firebase.json`                      | **yes** | emulator, deploy                         | —                                                                                                   |
| `apps/landing/src/config/deployment.ts`     | **yes** | the landing page                         | it is checked in; `null` fields render deliberate "soon" states                                     |

Two things this table says quietly:

- **The landing page has no environment at all.** There is no `process.env`
  read anywhere in `apps/landing/src`; the five deployment-dependent values are
  a checked-in TypeScript file, filled in after the Amoy deploy.
- **`packages/contracts/.env` does not exist in this checkout.** Only the
  template does. Contract work against the public RPC defaults works without
  it; anything that signs does not.

There are also two stray `packages/backend/.env.bak-*` files left from the
2026-08-27 session. They are gitignored, nothing reads them, and they hold the
same shape of configuration as `.env` — worth deleting rather than leaving
beside a file that matters.

---

## 8. Secrets, in three tiers

The project keeps three kinds of secret in three places, and the distinction is
about **blast radius** rather than tidiness.

1. **Secret Manager** — `BACKEND_WALLET_PRIVATE_KEY`, declared with
   `defineSecret` in `utils/blockchain.ts` and named in the `secrets` option of
   the one deployed function that signs. A function that does not name it
   cannot read it, which makes the key's blast radius a list you can read. Set
   it with `firebase functions:secrets:set`, never in `.env`.
2. **Gitignored `.env`** — everything else the backend needs: RPC URLs, factory
   addresses, the caps, `ADMIN_WALLETS`. These become deployment configuration
   (§6), so treat them as visible to anyone with project access.
3. **Held by exactly one service** — `ANTHROPIC_API_KEY` lives in
   `packages/agents/.env` and nowhere else. The backend reaches a model only by
   asking that service over HTTP with a short-lived HS256 token, so exactly one
   thing can spend the key. `MASTRA_JWT_SECRET` must match byte for byte in
   both `.env` files; a mismatch is a 401 on every call, which the backend
   reports as the agent being _unreachable_ rather than as an auth failure.

The mobile app's `EXPO_PUBLIC_*` variables are **not secrets and cannot be**:
Expo inlines them into the bundle. The Firebase web config is public by design,
and `EXPO_PUBLIC_REOWN_PROJECT_ID` is a public identifier.

---

## 9. What a staging tier would cost

Recorded so the answer is not re-derived, and because the honest estimate is
larger than it looks.

1. **A second Firebase project**, plus aliases in `config/.firebaserc`. This is
   the easy part.
2. **A third value for a flag that does not exist.** Both discriminators (§3)
   are booleans owned by tooling — `FUNCTIONS_EMULATOR` by the emulator,
   `__DEV__` by Metro. Neither can express "staging", so the eight call sites
   that read them would each need a real environment name threaded through, and
   the mobile app would need it at _build_ time because `EXPO_PUBLIC_*` is
   inlined.
3. **A second mobile build profile that is not `__DEV__`.** `eas.json` has
   `development`, `preview` and `production`; only the first sets
   `developmentClient`. A staging build is a `preview` build pointed at a
   different Firebase project — which today means editing `.env` before
   building, because there is no per-profile environment mechanism.
4. **A second deploy key and a second Safe**, or staging shares production's,
   which defeats the point.

Against that: what a staging tier usually buys is a rehearsal for the
irreversible steps, and this project already buys that differently.
`pnpm test:safe:local` rehearses the whole ownership handover against a real
node, including the _accepting_ half of `Ownable2Step` that a threshold above 1
never exercises on a public chain. **Do not add a staging tier expecting it to
cover the Safe handover — that is already covered, and better.**

---

## 10. Known gaps

Facts, not proposals. Each is either one line in `.dev/todo.md` or nothing at
all.

- **`packages/agents` runs in no CI job and in no root test script.** Nine
  tests, only ever run by hand.
- **`APP_ID_FIREBASE` is in no deployed config**, because there is no deployed
  config yet. It will be needed the moment there is.
- **`service-account-key.json` travels with a deploy** (§6). ADC would take it
  out of the artefact.
- **Firebase spend limits are unset**, and are worth setting before anything is
  publicly reachable.
- **No environment is reachable by anyone but the developer.** There is no
  shared dev instance, no preview deploy of the landing page, and no
  internal-distribution mobile build — the last of which is what
  `DEPLOYMENT.appBuild` is waiting for.
- **Two stray `packages/backend/.env.bak-*` files** (§7).

---

## See also

- [`GETTING_STARTED.md`](GETTING_STARTED.md) — first-run setup, per package
- [`../CLAUDE.md#chains`](../CLAUDE.md#chains) — why configuration is per chain
- [`../packages/contracts/scripts/README.md`](../packages/contracts/scripts/README.md) — which scripts may point at a real chain
- `.dev/deployment/GOING_PUBLIC.md` — the Amoy checklist (untracked)
