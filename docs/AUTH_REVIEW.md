# Authentication — review

**Date**: 2026-08-27 · **Scope**: `packages/backend/src/functions/auth`, `packages/backend/src/functions/app-check`, `packages/backend/src/services/deviceVerification.ts`, `apps/mobile/src/hooks/auth`, `apps/mobile/src/stores/AuthStore.ts`, `apps/mobile/src/utils/{deviceId,appCheckProvider}.ts`, `apps/mobile/app/connecting.tsx`, `config/firestore.rules`.

**Nothing was changed.** This is a reading.

---

## 0. The short version

The intuition is right, but not for the reason it usually is. The _protocol_ is
sound and close to the industry standard — nonce, sign, verify, mint a Firebase
custom token. What is too complex is the **mobile orchestration around it**:
about 800 lines of non-test code and 1,600 lines of tests wrapped around a flow
whose actual work is roughly forty lines and three awaits.

The complexity is not merely ornamental. It is hiding **six real defects**, two
of which are user-visible today:

| #   | Finding                                                                                      | Severity |
| --- | -------------------------------------------------------------------------------------------- | -------- |
| 1   | A failed sign-in is a permanent dead end — no retry path exists                              | **High** |
| 2   | The App Check token is minted fresh on **every single Firebase call**                        | **High** |
| 3   | The wallet-disconnect effect is a render loop                                                | **High** |
| 4   | "Verify Signature ✓" is shown before verification is attempted                               | Medium   |
| 5   | The EIP-712 path is unreachable from the app; `safe-wallet` is accepted and silently ignored | Medium   |
| 6   | Smart-contract wallets (Safe, ERC-4337) cannot log in at all, by regex                       | Medium   |

Plus roughly 300 lines of API surface that has no caller.

The modernisation worth doing is **SIWE (EIP-4361) + EIP-1271**, not a change of
auth provider. Firebase custom tokens are the correct shape here and should
stay.

---

## 1. What the flow actually is

Traced end to end, ignoring the ceremony:

```
app boot
 └─ config/firebase.ts:24   initializeAppCheck(CustomProvider)
       └─ POST customAppCheckMinter { deviceId }
             └─ approved_devices/{deviceId} exists?  → mint 24h token : 403
                                                     (403 → client returns a
                                                      "dummy-token" and carries on)

wallet connects (wagmi/AppKit)
 └─ WalletListener → authStore.updateWalletState()
 └─ NavigationStore reaction → router.replace('/connecting')

connecting.tsx → useAutoAuth()
 ├─ 1. generateAuthMessage({ walletAddress })
 │       backend: uuid nonce → auth_nonces/{address}.set({nonce, ts, expiresAt+10m})
 │                returns { message, nonce, timestamp }
 ├─ 2. wagmi signMessageAsync({ message })       ← personal_sign, always
 └─ 3. verifySignatureAndLogin({ walletAddress, signature, deviceId, platform })
         backend: claimAuthNonce()   ← atomic read+delete, spent on the attempt
                  createAuthMessage() re-derived server-side  ← good
                  ethers verifyMessage() → compare addresses
                  users/{address} upsert
                  approved_devices/{deviceId}.set()   ← best-effort, never blocks
                  auth.createCustomToken(walletAddress)
         client:  signInWithCustomToken() → onAuthStateChanged
                  → FirebaseInitializer → authStore.setUser()
                  → NavigationStore reaction → router.replace('/(auth)/dashboard')
                  → void registerForPushNotifications()
```

The security core of this is right, and worth stating explicitly before the
criticism: **the message is re-derived on the server from a nonce the server
generated**, so the three fields the client thinks it is carrying (`message`,
`nonce`, `timestamp`) are decorative and the client cannot influence what was
signed. The nonce is claimed in a transaction and spent on the attempt rather
than the success (`utils/auth.ts:46`) — the 2026-08-20 fix. The Firestore rules
are default-deny and close `auth_nonces`, `approved_devices` and `push_tokens`
in both directions. None of that needs touching.

---

## 2. Defects

### 2.1 — A failed sign-in is a permanent dead end · **High**

`apps/mobile/src/hooks/auth/useAutoAuth.ts:22-29`

```ts
if (… || authStore.isAuthenticating || authStore.error) return
```

`authStore.error` is set by the catch at line 114. After that the guard refuses
to run again. The only two things that clear it are `authStore.startStep()` —
which is inside the block the guard just refused to enter — and
`authStore.reset()`, called from `NavigationStore.handleWalletDisconnection`
and from the disconnect effect at line 135.

So: **the user declines the signature prompt once (or the wallet times out, or
the RPC hiccups) and the connecting screen becomes terminal.** `connecting.tsx`
has no retry control — the only interactive element on it is the AppKit pill
(line 77), so the escape is to disconnect the wallet entirely and start over.

Signature rejection is not an edge case. It is the single most common failure in
any wallet flow: the user taps out to the wallet app, gets distracted, comes
back. The help text at line 152 ("try a different wallet or network") is telling
them to do the one thing that happens to work, without saying so.

**Fix**: a `Retry` button that calls `authStore.resetProgress()` (which already
exists at `AuthStore.ts:164` and has never been called), plus distinguishing
user-cancelled from failed so a cancellation reads as "waiting for you" rather
than "Authentication Failed".

### 2.2 — The App Check token is minted on every Firebase call · **High**

`packages/backend/src/functions/app-check/customAppCheckMinter.ts:60-68`

```ts
const appCheckToken = await appCheck.createToken(FIREBASE_APP_ID, { ttlMillis: 1000*60*60*24 })
…
expireTimeMillis: appCheckToken.ttlMillis
```

`AppCheckToken.ttlMillis` from the Admin SDK is a **duration** — 86,400,000. The
`AppCheckToken.expireTimeMillis` the Firebase JS SDK expects back from a
`CustomProvider` is an **absolute local timestamp** ("the local timestamp after
which the token will expire"). 86,400,000 as an epoch is 2 January 1970.

The SDK therefore treats every minted token as long expired and re-invokes
`getToken` on essentially every call. Each invocation is:

- `getUniqueDeviceId()` — on web, a SecureStore round trip
- an unauthenticated HTTPS function cold-start candidate
- `DeviceVerificationService.isDeviceApproved` → a Firestore **read**
- …**and a Firestore write**, because `isDeviceApproved` updates `lastUsed` on
  every check (`services/deviceVerification.ts:23`)
- `appCheck.createToken`

That is a document write per Firebase operation on a hot document, on a code
path that runs before the user has done anything. It is also the reason
enforcement has never felt safe to turn on: the chain is doing far more work
than anyone thinks it is.

The correct value is `Date.now() + appCheckToken.ttlMillis`. Note the backend
test at `customAppCheckMinter.test.ts:65` **pins the current behaviour**
(`expireTimeMillis: expectedToken.ttlMillis`), so the test will have to be
changed with it — the test is describing the bug, not a decision. The mobile
test at `appCheckProvider.test.ts:76` asserts `expireTimeMillis > Date.now()`
against a hand-made fixture, so it never sees what the server actually sends.

Secondary: `services/deviceVerification.ts:23` writes `lastUsed` inside a read.
Even with the expiry fixed, that should be `void`-ed or dropped — nothing reads
`lastUsed`.

### 2.3 — The disconnect effect is a render loop · **High**

`apps/mobile/src/hooks/auth/useAutoAuth.ts:132-143`

```ts
useEffect(() => {
  if (!authStore.isWalletConnected) {
    authStore.reset()
    messageGeneration.clearState()
  }
}, [authStore.isWalletConnected, messageGeneration])
```

`messageGeneration` is `{ ...state, generateMessage, clearState }`
(`useMessageGeneration.ts:75-79`) — a **new object on every render**. So the
dependency array changes every render, unconditionally. And `clearState` calls
`setState` with a freshly-built object, which React cannot bail out of (it
compares with `Object.is`), so it schedules another render.

While the connecting screen is mounted with no wallet connected, that is:
render → effect → `clearState` → setState → render → effect → … until
`NavigationStore` finishes its `setTimeout(…, 50)` and replaces the route. Every
turn of it also calls `authStore.reset()`, mutating four observables and waking
every `observer` subscribed to them.

The same instability applies to the main auth effect at line 129, where
`messageGeneration`, `signatureHandling` and `firebaseAuth` are all in the deps.
It survives only because the guards at 22-29 bounce it — which is to say the
guard clause is load-bearing for a reason it was not written for.

**Why the tests do not catch it**: `useAutoAuth.test.ts:23-55` mocks all three
hooks as module-level constant objects, so identity is stable in the test and
unstable in the app. This is the classic failure mode of mocking a hook's
_shape_ rather than its behaviour.

**Fix**: the sub-hooks should return stable identities (`useMemo`/`useCallback`
over a ref'd state), or — better, see §4 — stop being hooks at all.

### 2.4 — The step list reports a verification that has not happened · Medium

`apps/mobile/src/hooks/auth/useAutoAuth.ts:61-63`

```ts
authStore.startStep('verify-signature')
authStore.completeStep('verify-signature')
```

Nothing between them. Verification happens inside step 6
(`verifySignatureAndLogin`). So an invalid signature shows the user
**"Verify Signature ✓ Verifying with server..."** in green and then fails on
"Complete Auth", which is not where it failed.

Three of the six steps are like this. `connect-wallet` and `acquire-lock`
(lines 42-48) are also start-then-immediately-complete. The progress bar
therefore reads 50% before a single network call is made, and the step list
narrates a process with half the detail invented.

The honest list is three steps: **Request challenge → Sign in your wallet →
Verify**. That is also what makes the UI useful, because "Sign in your wallet"
is the only step where the user has something to do, and it is currently the
fourth of six.

Related: `AuthStore.completeStep` special-cases `step === 'firebase-auth'`
(line 98) to clear `currentStep` — a string comparison against whatever happens
to be last in `AUTH_STEPS`. Reorder the array and it breaks silently.

### 2.5 — The EIP-712 path is unreachable; `safe-wallet` is accepted and ignored · Medium

`apps/mobile/src/hooks/auth/useFirebaseAuth.ts:38-39` sends
`chainId: authData.chainId` and `signatureType: authData.signatureType`. The
only construction site of `AuthenticationData` is
`useAutoAuth.ts:83-91`, which **sets neither**. Both arrive as `null` (the
callable SDK's encoding of `undefined`), the schema's `optional()` turns them
back into `undefined`, and the handler defaults to `personal-sign`.

So `verifySignatureAndLogin.ts:74-118` — the entire EIP-712 branch, its domain,
its type definition and the long comment justifying `chainId` coming from the
caller — is dead from the app's point of view. It is only reachable by hand-built
callable requests.

Worse: the schema accepts `signatureType: 'safe-wallet'`
(`schemas/auth.ts:29`) and the handler has **no branch for it**
(`verifySignatureAndLogin.ts:74`, an if/else). A caller naming `safe-wallet` is
silently verified as `personal-sign`. Safe wallet support was explicitly removed
in `4d2fa53` (2025-10-12) and the enum value was left behind. An enum member
that means something different from what it says is worse than no enum.

`useAutoAuth` also builds `message`, `nonce` and `timestamp` into
`AuthenticationData` (lines 86-88), `useFirebaseAuth` validates their presence
(line 20), and then does not send them. That validation cannot fail in any way
that matters and the fields cannot influence anything — which is correct
security, expressed as three dead fields on a shared type.

### 2.6 — Smart-contract wallets cannot log in, by regex · Medium

`packages/backend/src/schemas/auth.ts:14`

```ts
z.string().regex(/^0x[0-9a-fA-F]{130}$/, 'must be a 65-byte hex signature')
```

That is an ECDSA signature and nothing else. A Safe, or any ERC-4337 smart
account, produces an EIP-1271 signature of arbitrary length that is verified by
calling `isValidSignature` on the account contract. The regex refuses them at
the door, before any of the logic that might have handled them.

For a **multi-chain lending product whose own admin model is a Safe**, "no
smart-contract wallet may hold an account" is a strategic limitation, not a
detail. It also makes the `safe-wallet` enum value doubly hollow: even if the
handler branched on it, the schema would have rejected the request first.

### 2.7 — Lesser findings

- **`generateAuthMessage` is unauthenticated, uncapped, and writes a document
  per address asked about** (`generateAuthMessage.ts:26`). No App Check, no rate
  limit, no TTL policy on `auth_nonces` in `config/`. Abandoned challenges are
  never collected — only a subsequent successful `claimAuthNonce` deletes one.
  Someone iterating addresses creates documents without bound. Low stakes for a
  PoC, cheap to fix: a Firestore TTL policy on `expiresAt`, and
  `enforceAppCheck()` on this callable once §2.2 makes that safe.
- **The full nonce is logged at `info`** (`generateAuthMessage.ts:34-38`) while
  it is still live. Log access is internal, so this is minor, but it is the one
  secret in the flow and there is no reason to print it.
- **`generateAuthMessage` has no `cors: true`** while `verifySignatureAndLogin`
  does (line 208). Asymmetric; it will bite the first web client that tries to
  sign in.
- **`FirebaseInitializer.tsx:33-38` fabricates a `User`** on session restore
  with `createdAt: Date.now()` and `deviceId: ''`. Nothing currently reads
  either, but the store's `user` is a mixture of real backend data (fresh login)
  and invented data (restored session), which is a trap for whatever reads it
  next. The backend never returns `deviceId` on `User` anyway
  (`verifySignatureAndLogin.ts:152`), so `useFirebaseAuth.ts:60`'s
  `user.deviceId || ''` is always `''`.
- **Address casing is unnormalised.** The `walletAddress` primitive accepts any
  case (`schemas/primitives.ts:50`) and the value is used verbatim as the
  `auth_nonces` doc id, the `users` doc id, and **the Firebase UID**. wagmi
  hands over checksummed addresses so it is consistent in practice, but a
  lowercase caller gets a second user document and a second Firebase identity.
  The rules already compensate with `.lower()` everywhere
  (`firestore.rules:28`), which is the compensation telling you where the
  problem is. Normalising to lowercase at the schema boundary would remove a
  whole class of future bug — though note it is a **migration**, since existing
  UIDs are checksummed.
- **`useFirebaseAuth().logout` is never called** anywhere in the app; the only
  sign-out is `NavigationStore.handleWalletDisconnection` (line 240). Wallet
  disconnect ends the session locally, but the Firebase refresh token is not
  revoked server-side, so the session is only as ended as the device says it is.
  Acceptable for the threat model — worth knowing.
- **The App Check failure path returns a fake token**
  (`appCheckProvider.ts:41-44`). Sensible while enforcement is off; the moment
  `ENFORCE_APP_CHECK=true` it converts a diagnosable 403 into an opaque
  "unauthenticated" on an unrelated callable. It needs a log loud enough to find
  and a plan for what the app does when attestation genuinely fails.

---

## 3. The complexity itself

| File                                                     |   Lines |     Tests |
| -------------------------------------------------------- | ------: | --------: |
| `hooks/auth/useAutoAuth.ts`                              |     144 |       467 |
| `hooks/auth/useFirebaseAuth.ts`                          |     113 |       239 |
| `hooks/auth/useMessageGeneration.ts`                     |      80 |       222 |
| `hooks/auth/useSignatureHandling.ts`                     |      66 |       290 |
| `stores/AuthStore.ts`                                    |     199 |       167 |
| `types/auth.ts`                                          |      51 |         — |
| `constants/authSteps.ts`                                 |      43 |         — |
| `utils/appCheckProvider.ts`                              |      50 |       120 |
| `app/connecting.tsx`                                     |     161 |       357 |
| **mobile total**                                         | **907** | **1,862** |
| `functions/auth/*` + `utils/auth.ts` + `schemas/auth.ts` |     370 |       969 |

Two structural causes, both worth naming because they will recur elsewhere in
the app if they are not:

**Three hooks that are secretly just functions.** `useMessageGeneration`,
`useSignatureHandling` and `useFirebaseAuth` each keep a full
`{ data, isLoading, error }` state machine. Every one of those states is
**written and never read** — `useAutoAuth` calls the imperative method and puts
the result into `authStore`, and no component consumes the hooks directly
(verified: `useAutoAuth` is their only importer, and its only importer is
`connecting.tsx`). That is three duplicated state machines, ~180 lines,
750 lines of tests, and the render-loop hazard in §2.3, all so that state can be
kept twice and read once from the copy in MobX.

Only `useSignatureHandling` needs to be a hook at all, because `useSignMessage`
is one. The other two are plain async functions with a `httpsCallable` in them.

**Dead API surface**, none of which has a caller:

- `AuthStore`: `resetProgress`, `resetWalletState`, `resetInitialization`,
  `isAuthenticatingForWallet`, and the `requestId` parameter on
  `acquireAuthLock`
- `useFirebaseAuth`: `logout`, `clearError`, `user`, `isAuthenticating`, `error`
- `useSignatureHandling`: `clearSignature`, `signature`, `error`
- `useMessageGeneration`: `message`, `nonce`, `timestamp`, `isGenerating`,
  `error`
- `types/auth.ts`: `AutoAuthState` (defined, imported nowhere)
- `AuthenticationData`: `message`, `nonce`, `timestamp` are sent nowhere;
  `chainId` and `signatureType` are never populated
- The `safe-wallet` enum member, in both the type and the schema

Roughly 300 lines. `resetProgress` is the sharpest example: the exact method
§2.1 needs was written, tested, and never wired to anything.

---

## 4. What "more modern" actually means here

### Keep: Firebase custom tokens

This is the right shape and there is no better one available. The alternatives —
rolling session JWTs, or a third-party auth provider with a wallet connector —
are both strictly more moving parts for a project that already depends on
Firebase Auth for Firestore rules and callable identity. The `request.auth.uid`
= wallet address convention is clean and the rules are built on it. **Do not
change this.**

The one improvement worth considering: add a **custom claim** (`wallet`, always
lowercase) alongside the UID, so the rules stop calling `.lower()` on a UID and
so the UID can later become opaque without rewriting every rule.

### Adopt: SIWE / EIP-4361, via `viem/siwe`

`viem@2.37` is already a dependency of the mobile app. `ethers@6` on the
backend can verify a SIWE message with `verifyMessage` unchanged — SIWE is a
`personal_sign` payload with a specified _format_, not a different signing
scheme. So this is a **message-format change, not a protocol change**, and it
removes rather than adds code:

- `utils/auth.ts:createAuthMessage` → `createSiweMessage` / `parseSiweMessage`
- the `domain`, `uri`, `chainId`, `issuedAt` and `expirationTime` fields carry
  the binding that the current bespoke string does not have. The current message
  names no domain and no expiry, so a signature harvested by a phishing site
  that reuses the string is replayable against this backend for the ten minutes
  the nonce lives.
- the EIP-712 branch (§2.5) **deletes entirely**. Its whole justification was
  giving the domain and chain a place to live; SIWE gives them one in the
  `personal_sign` payload, so one code path serves everything.
- wallets recognise SIWE and render it as a sign-in rather than as an opaque
  blob, which is a real UX gain at the exact step where users bail (§2.1).

Keep the server-generated nonce and the atomic claim. SIWE has a `nonce` field
precisely for it, and the current implementation of that half is good.

### Adopt: EIP-1271 verification

Fixes §2.6 and costs little: the backend already has per-chain providers
(`utils/blockchain.ts:getProvider`). The shape is — recover with `verifyMessage`
first; on failure, or when the address has code, call `isValidSignature` on the
account contract. `viem`'s `verifyMessage`/`verifySiweMessage` do both
automatically given a public client, and there is an ethers-6 equivalent.

This is what makes `signatureType` unnecessary rather than dead: the verifier
decides how to verify from the _address_, which is a fact, instead of from a
field the caller asserts.

Note the interaction with `chainId`: EIP-1271 needs a chain to make the call on,
and the current comment at `verifySignatureAndLogin.ts:78-90` argues correctly
that login is not a per-chain act. Both can hold — verify a contract signature
on the chain the SIWE message names, and let the session serve every configured
chain regardless.

### Consider: Reown AppKit SIWX

AppKit ships a sign-in-with-X layer that owns the nonce/sign/verify round trip
and hands back a verified session, which would delete most of `useAutoAuth`.
**Unverified for `@reown/appkit-wagmi-react-native@1.3.2`** — the RN package
lags the web one, so confirm it exists on this version before planning around
it. If it does not, the hand-rolled flow at ~40 lines is perfectly reasonable
and this is not worth waiting for.

### Replace: the App Check custom provider

`utils/appCheck.ts` already says this out loud — a device is approved on the
caller's say-so, so the custom provider raises the cost of automation and
establishes nothing. That is what App Check's **real** attestation providers are
for: Play Integrity on Android, App Attest/DeviceCheck on iOS. Both need a
native build — the same dev build push notifications are already waiting on.

When that build exists, the whole custom chain — `customAppCheckMinter`,
`approved_devices`, `DeviceVerificationService`, `appCheckProvider`,
`getUniqueDeviceId`, and their ~450 lines of code and tests — can be deleted and
replaced with the platform providers plus `enforceAppCheck: true`. That is the
single largest simplification available in this area, and it is gated on
infrastructure rather than on code.

Until then, fix §2.2 so the current chain is not doing a Firestore write per
Firebase call.

---

## 5. Suggested order of work

Phased so each step is independently shippable and independently revertable.

**Phase 1 — the two user-visible bugs** _(small, do first)_

1. `expireTimeMillis: Date.now() + ttlMillis`; update
   `customAppCheckMinter.test.ts:65`, which pins the bug. Drop the `lastUsed`
   write from `isDeviceApproved`.
2. Add a retry to `connecting.tsx` calling `authStore.resetProgress()`.
   Distinguish "user cancelled" from "failed".

**Phase 2 — collapse the mobile hooks** _(the bulk of the simplification)_

3. Fold `useMessageGeneration` and `useFirebaseAuth` into plain async
   functions in `src/services/auth.ts`. Keep `useSignatureHandling` as a thin
   hook over `useSignMessage`, returning stable identities.
4. `useAutoAuth` keeps the lock, the guards and the step reporting; its
   dependency array becomes `[isWalletConnected, walletAddress, error]` and
   nothing else — which fixes §2.3.
5. Reduce `AUTH_STEPS` to the three real steps; delete the invented ones and
   the `'firebase-auth'` string special-case.
6. Delete the dead surface listed in §3. Rewrite the tests against behaviour —
   expect this phase to _remove_ roughly a thousand lines of test.

**Phase 3 — SIWE + EIP-1271** _(the modernisation)_

7. Swap `createAuthMessage` for `createSiweMessage`; keep the nonce and
   `claimAuthNonce` exactly as they are.
8. Verify with EIP-1271 fallback. Delete the EIP-712 branch, the
   `signatureType` field and the `safe-wallet` enum member; relax the 65-byte
   regex to a hex-string check.
9. Normalise addresses to lowercase at the schema boundary — **migration**,
   because existing Firebase UIDs are checksummed. Plan it as one.

**Phase 4 — real attestation** _(gated on the dev build)_

10. Play Integrity + App Attest, `ENFORCE_APP_CHECK=true`, delete the custom
    provider chain. Add a TTL policy on `auth_nonces.expiresAt` and
    `enforceAppCheck()` on `generateAuthMessage` at the same time.

Phases 1 and 2 are worth doing regardless of whether 3 and 4 ever happen.

---

## 6. Do not change

- **The nonce claim.** `claimAuthNonce` is transactional and spends the
  challenge on the attempt. It is correct and the reasoning at
  `utils/auth.ts:24-45` is worth preserving verbatim through any refactor.
- **Server-side message re-derivation.** The client's `message`/`nonce`/
  `timestamp` being ignored is the property that makes this flow safe. Any
  "simplification" that has the backend trust a client-supplied message is a
  break, not a cleanup.
- **`request.auth.uid` = wallet address**, and the `firestore.rules` posture
  built on it. Default-deny with `auth_nonces`, `approved_devices`,
  `push_tokens` and `push_receipts` closed in both directions is right, and the
  rules' own comments about authentication being cheap here are the correct
  reading of the threat model.
- **Device approval never blocking login**
  (`verifySignatureAndLogin.ts:167-183`). A best-effort side effect that cannot
  fail the primary action is the right call.
- **`void registerForPushNotifications()`** after the step completes, unawaited.
  Same reasoning, already documented at `useAutoAuth.ts:99-105`.

---

## Appendix — claims and how they were checked

| Claim                                                                                                                                             | Basis                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sub-hooks have exactly one consumer each                                                                                                          | `grep` for each hook name across `src/` and `app/`; only `useAutoAuth` imports them, only `connecting.tsx` imports it                                                                                |
| `logout`, `clearError`, `clearSignature`, `resetProgress`, `resetWalletState`, `resetInitialization`, `isAuthenticatingForWallet` have no callers | `grep` across `src/` and `app/`, excluding tests                                                                                                                                                     |
| `chainId` / `signatureType` are never populated                                                                                                   | `AuthenticationData` is constructed once, at `useAutoAuth.ts:83-91`                                                                                                                                  |
| `authStore.error` is cleared only by `reset()`/`startStep()`                                                                                      | `grep setError\|reset\|resetProgress` across the app                                                                                                                                                 |
| Tests hide the render-loop hazard                                                                                                                 | `useAutoAuth.test.ts:23-55` returns module-level constants from the mocked hooks                                                                                                                     |
| `safe-wallet` has no handler branch                                                                                                               | `verifySignatureAndLogin.ts:74` is a two-way `if/else` on `'typed-data'`                                                                                                                             |
| Safe support was removed but the enum stayed                                                                                                      | commit `4d2fa53` (2025-10-12), _"remove Safe wallet support"_                                                                                                                                        |
| No TTL policy on `auth_nonces`                                                                                                                    | nothing in `config/firebase.json` or `config/firestore.indexes.json`; TTL is configured out-of-band, so confirm in the console before acting                                                         |
| `expireTimeMillis` is absolute in the JS SDK                                                                                                      | Firebase JS SDK `AppCheckToken` contract; `customAppCheckMinter.test.ts:65` pins the duration being sent. **Worth confirming against the installed `firebase@12.2.1` typings before the fix lands.** |
| AppKit SIWX on RN 1.3.2                                                                                                                           | **not verified** — check before planning around it                                                                                                                                                   |
