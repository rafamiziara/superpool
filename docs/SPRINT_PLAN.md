# 🚀 SuperPool Development Sprint Plan

This document outlines the structured development sprints for the SuperPool dApp. Each sprint focuses on a specific set of features, building a robust micro-lending platform incrementally.

## 🎯 Overall Goal

To build a functional micro-lending decentralized application on Polygon where users can connect wallets, join specific lending pools, contribute liquidity, request and repay loans, with comprehensive reputation tracking.

## 📍 Where things stand (2026-08-12)

| Sprint                         | Status                                              |
| ------------------------------ | --------------------------------------------------- |
| 1 · Foundation                 | ✅ Complete                                         |
| 2 · Authentication Enhancement | ✅ Complete                                         |
| 3 · Pool Creation              | 🚧 Complete locally; blocked on testnet deployment  |
| 4 · Pool Membership            | ✅ Complete                                         |
| 5 · Pool Liquidity             | 🚧 Native currency only; ERC-20 outstanding         |
| 6 · Loan Requests              | 🚧 Request flow complete; AI assessment not started |
| 7 · Loan Repayments            | ✅ Full, partial and accruing; no schedule          |
| 8 · Withdrawals                | ✅ Complete                                         |
| 9 · Reputations                | 🚧 History shipped; no score, deliberately          |
| 10 · Loan Management           | 🚧 Decisions and borrower history; AI support not   |
| 11 · Interest Distribution     | ✅ Complete                                         |
| 12 · Notifications             | 🚧 Owner-facing pushes shipped; delivery unverified |

Sprints 4–10 were shipped in a different order than planned. Membership (4)
landed after liquidity (5) and loans (6, 7, 10), and loan management (10)
shipped ahead of the AI (6) and reputation (9) work it was meant to consume.
The sprint numbers are the original plan's, not the build order.

Everything shipped is verified against a live Hardhat node and the Firebase
emulators, not only against mocked tests. **Nothing is deployed to a public
chain**, which is the single biggest gap in the project and is owned by no
sprint — see "Cross-cutting" at the end.

---

## 🏃‍♀️ Sprint 1: Foundation

**Sprint Goal:** Establish core wallet connection and user onboarding capabilities.

### Features:

- **User Onboarding & Wallet Connection** ✅
  - Implement multi-wallet connection (MetaMask, WalletConnect, Safe wallets)
  - Basic user registration/login via Firebase Authentication
  - Display connected wallet address and network information
  - Onboarding flow for new users
  - Basic error handling and user feedback

### Expected Deliverables:

- Users can successfully connect various wallet types
- Basic authentication flow with Firebase integration
- User onboarding screens and wallet address display
- Foundation for secure wallet-based authentication

---

## 🏃‍♀️ Sprint 2: Authentication Enhancement

**Sprint Goal:** Build robust, secure, and user-friendly authentication system with comprehensive state management.

### Features:

- **Design System & Branding** ✅
  - Establish SuperPool visual identity and brand guidelines
  - Implement NativeWind integration for consistent styling
  - Create reusable UI component library
  - Typography, color palette, and spacing standards

- **Authentication Flow Enhancement** ✅
  - Polished authentication UI/UX with loading states
  - Enhanced error handling and user guidance
  - Improved wallet selection interface
  - Success animations and visual feedback

- **State Management Optimization** ✅
  - MobX reactive state management implementation
  - Centralized authentication state with stores
  - Reduced component complexity and improved performance
  - Enhanced debugging and state predictability

- **Directory Structure Organization** ✅
  - Professional monorepo structure following best practices
  - Clear separation of configuration, documentation, and scripts
  - Improved maintainability and navigation

- **Security & Performance Improvements** ✅
  - Enhanced Safe wallet signature verification with EIP-1271 compliance
  - Race condition prevention with mutex locks and atomic state management
  - Targeted session cleanup optimization with SessionManager
  - Firebase authentication strategy improvements with fail-fast and circuit breaker patterns

- **Testing Infrastructure Enhancement** ✅
  - Comprehensive unit test coverage (95%+ achieved)
  - Integration testing for authentication flows
  - Performance benchmarking and memory leak detection
  - Advanced testing utilities and mock strategies (66 test files implemented)

### Current Status: **COMPLETE** (6/6 completed) ✅

### Expected Deliverables:

- Robust authentication system ready for production
- Comprehensive design system and component library
- Optimized state management architecture
- Enhanced security and performance measures
- Comprehensive testing coverage and quality assurance

---

## 🏃‍♀️ Sprint 3: Pool Creation

**Sprint Goal:** Implement smart contract architecture and UI for creating new lending pools.

See [`POOL_CREATION.md`](POOL_CREATION.md) for how the shipped system works.

### Features:

- **Smart Contract Development** ✅
  - Develop and deploy `PoolFactory.sol` with upgradeable proxy pattern
  - Implement `LendingPool.sol` core structure and initialization
  - Create pool creation functions with parameter validation
  - Multi-sig Safe integration for admin controls

- **Backend Integration** ✅
  - Cloud Functions to interact with PoolFactory (`preparePoolCreation`, `indexPool`, `listPools`)
  - Event listeners for pool creation events (`syncPoolEvents`, now covering every feed and live-verified)
  - Off-chain pool metadata storage in Firestore
  - Admin authentication and authorization

- **Mobile App Implementation** ✅
  - Pool creator UI for inputting pool parameters
  - Pool creation form validation and user feedback
  - Integration with smart contracts via backend
  - Pool creation success and error handling

- **Deployment & Verification** 🚧
  - Automated deployment scripts for Polygon — localhost only; Amoy needs a funded deployer
  - Contract verification on Polygonscan — not started
  - Multi-sig ownership transfer automation — scripted, not run on a testnet

### Expected Deliverables:

- Pool creators can deploy new lending pools via the dApp — ✅ verified end to end against a local Hardhat node and the Firebase emulators
- PoolFactory contract deployed, verified, and owned by multi-sig Safe — 🚧 local only
- Pool creation UI integrated with smart contracts — ✅
- Off-chain pool data management system — ✅

### Current Status: **Feature complete locally; blocked on testnet deployment** 🚧

One thing gates the rest now: **no funded Amoy deployer or backend wallet.**

The other half of the blocker was code and is fixed — the backend resolved
exactly one chain at a time, so localhost and Amoy could not both be served and
the app's network picker was presentational. It now serves every chain
configured; see the Chains section in [`CLAUDE.md`](../CLAUDE.md). What remains
is a chequebook, a `hardhat.config.ts` network entry and the per-network
deployment checklist.

---

## 🏃‍♀️ Sprint 4: Pool Membership

**Sprint Goal:** Enable users to join existing pools with admin approval system.

See [`MEMBERSHIP.md`](MEMBERSHIP.md) for how the shipped system works.

**Built out of order.** This sprint was meant to precede Sprint 5 — its goal line
reads "enable _approved members_ to contribute funds" — but liquidity shipped
first and membership came six sprints later. In the meantime the app inferred
membership from having contributed, which is the model Sprint 4 replaced.

### Features:

- **Pool Discovery & Joining** ✅
  - Smart contract `requestMembership` (the plan called it `requestToJoinPool`)
  - UI for users to browse and find available pools ✅ — **this was ticked here
    before it was true.** `pool/join` was reachable only from `pool/[id]`, and
    that only from a list narrowed to `myPools`, so the join flow had no entry
    point for the people it was for. The Discover tab closed it (`6a9d793`);
    see the Discovery section in [`CLAUDE.md`](../CLAUDE.md).
  - Pool details display and join request submission (`pool/join.tsx`)
  - Request status tracking — ✅; notifications — ✅ Sprint 12

- **Admin Membership Management** ✅
  - Smart contract `approveMember` / `rejectMember` / `removeMember`, owner-only
  - Admin UI to view pending requests and the roster (`pool/members.tsx`)
  - Approval/rejection workflow — ✅; **reason tracking — ❌ deliberately deferred**
    (free text on chain costs gas and is metadata; it belongs in Firestore)
  - Member list management and permissions ✅

- **Off-chain Integration** ✅
  - Backend APIs for join request processing (`indexMembership`, `listMembers`)
  - Firestore storage for membership requests and statuses
  - Event listeners for membership changes (all six events in `syncPoolEvents`)
  - Push notifications — ✅ Sprint 12 (owner side: somebody asked to join).
    **Email — ❌ and out of scope**: no email address exists anywhere in this
    project and collecting one is a different product decision.

### Expected Deliverables:

- Users can discover and request to join lending pools — ✅
- Pool admins can approve or reject membership requests — ✅
- Complete membership management system — ✅
- Off-chain tracking of pool memberships — ✅

### Current Status: **COMPLETE** ✅

Live-verified: 81 checks against a Hardhat node and the Firestore emulator.
Two design decisions worth not re-deriving, both in [`MEMBERSHIP.md`](MEMBERSHIP.md):
the register is written on **every** deposit in both modes, so an open pool can
be closed without stranding anyone; and `withdraw` and `repayLoan` are never
gated on membership, because removal takes away what you may do next and not
what you already put in.

Deliberately not built: a member cap — `memberCount` is tracked but nothing
bounds it, and the `maxMembers` field that implied otherwise was deleted — and
a request never expires.

---

## 🏃‍♀️ Sprint 5: Pool Liquidity

**Sprint Goal:** Enable approved members to contribute funds to lending pools.

See [`CONTRIBUTIONS.md`](CONTRIBUTIONS.md) for how the shipped system works.

### Features:

- **Liquidity Contribution System** 🚧
  - `depositFunds` for POL — ✅; **ERC-20 — ❌**, needs contract work
  - Contribution amount validation — ✅; **a minimum deposit — ❌**, and no
    longer implied: the `minimumContribution` field that promised one was
    deleted rather than implemented
  - Real-time pool liquidity tracking ✅
  - Member contribution history and balances ✅

- **Frontend Integration** ✅
  - UI for members to contribute funds
  - Contribution form with amount selection and confirmation
  - Real-time pool statistics display
  - Transaction status and confirmation screens

- **Backend & Event Management** 🚧
  - Event listeners for deposit transactions ✅
  - Off-chain balance and liquidity data updates in Firestore ✅
  - Pool statistics calculation — ✅; **caching — deliberately not done.**
    Liquidity and balances are summed from events on read, so there is no
    denormalised total that can fall out of step with the chain. Treat this as
    settled, not outstanding.
  - **Contribution analytics and reporting — ❌** not started

### Expected Deliverables:

- Members can contribute liquidity to pools — ✅
- Real-time pool liquidity tracking and display — ✅
- Member contribution management system — ✅
- Off-chain liquidity data synchronization — ✅

### Current Status: **Native currency complete; ERC-20 outstanding** 🚧

---

## 🏃‍♀️ Sprint 6: Loan Requests

**Sprint Goal:** Implement loan request functionality with AI assessment integration.

See [`LOANS.md`](LOANS.md) for how the shipped system works.

### Features:

- **Loan Request System** ✅
  - Smart contract `requestLoan` ✅
  - Loan parameter specification: amount ✅, terms ✅ (from the pool's config,
    not per-loan), **purpose — ❌** (no such field exists)
  - Request validation and eligibility checks ✅
  - Loan request queue management ✅

- **AI Assessment Integration — ❌ NOT STARTED**
  - No AI agent, no scoring, no assessment storage. Nothing in the repo
    references an LLM provider of any kind.
  - This is the largest unstarted scope in the plan and it also blocks half of
    Sprint 10. Worth splitting into its own sprint before it is picked up.

- **User Interface** ✅
  - Loan request form for members
  - Loan amount calculator and term selection
  - Request status tracking and updates
  - Loan history and pending requests display

### Expected Deliverables:

- Members can request loans through the dApp — ✅
- AI assessment system evaluates loan requests — ❌
- Loan request management and tracking system — ✅
- Preliminary risk scoring for loan decisions — ❌

### Current Status: **Request flow complete; the AI half not started** 🚧

---

## 🏃‍♀️ Sprint 7: Loan Repayments

**Sprint Goal:** Implement loan repayment functionality and lifecycle management.

### Features:

- **Repayment System** 🚧
  - Smart contract `repayLoan` ✅
  - **Payment scheduling and reminder system — ❌** still outstanding after
    Sprint 12, which shipped only the owner-facing half. Due and overdue are
    **not events** — nothing on chain fires when a term lapses — so this is a
    scheduled scan, not an indexer hook.
  - Full repayment ✅; **partial repayment ✅** — `repayLoan` takes any amount
    above zero, `amountRepaid` is the running total on the `Loan` struct, and
    the loan closes only on the payment that finishes it. Each payment is its
    own indexed record in `loan_repayments`, because a loan holds one
    `repaidAt` and a debt returned in four transactions has four dates
  - Interest calculation ✅ — **accrued per second** on the principal still
    out, uncapped past the due date. `interestRate` still means the price of one
    full term, so nothing had to be reinterpreted; repaying early now costs
    less and running late costs more

- **User Experience** ✅
  - Borrower dashboard with active loans
  - Repayment interface with amount calculation
  - Payment confirmation and receipt system
  - Loan status tracking throughout lifecycle

- **Backend Integration** 🚧
  - Event listeners for loan repayment transactions ✅
  - Loan status updates in Firestore ✅
  - Payment history ✅ — per payment now, not per loan; **analytics — ❌**
  - **Automated notifications for due dates — ❌** see Sprint 12's remainder

### Expected Deliverables:

- Borrowers can repay loans through the dApp — ✅
- Complete loan lifecycle management — ✅
- Payment tracking and history system — ✅
- Automated loan status updates — ✅

### Current Status: **Full and partial repayment both work** ✅

Two gaps that mattered were not in this sprint and are both closed now. Repaid
interest reached the pool and could not be distributed — Sprint 11. And a
borrower who could pay half could pay nothing, which is the one that made the
product unusable for the people it is for; closed 2026-08-17, live-verified
with 47 checks (`pnpm --filter backend testPartial`).

Accrued interest landed the same day (`testAccrual`, 36 live checks). The rate
is the price of one full term and the clock never stops at the due date — no
cap, deliberately, because a cap makes time free once a loan is late and leaves
a borrower no reason to settle. That is the closest thing the project has to a
consequence for running late, and it is not a penalty: it is the same price
applied to more time.

What is left here is **scheduling**: no minimum payment, no instalment plan, no
reminder when a term lapses. Due and overdue are not events — nothing on chain
fires when a term passes — so that is a scheduled scan, not an indexer hook, and
it is Sprint 12's remainder. Note accrual is pressure, not enforcement: nothing
still marks a loan defaulted.

The live run also found what mocks could not: an instalment moves `amountRepaid`
and nothing else, so an indexer currency check that does not compare it reports
the payment as already indexed and leaves the record claiming the whole debt is
outstanding.

---

## 🏃‍♀️ Sprint 8: Withdrawals

**Sprint Goal:** Enable lenders to withdraw their contributions with proper fund locking.

### Features:

- **Withdrawal System** ✅
  - Smart contract `withdraw` (the plan called it `withdrawContribution`)
  - Available vs. locked funds calculation ✅ (`withdrawableAmount`)
  - Withdrawal eligibility validation ✅
  - Fund locking during active loans ✅ (`activeLoanId` locks the borrower's
    own contribution until they repay)

- **Safety Mechanisms** 🚧
  - Prevention of withdrawal of locked funds ✅
  - Real-time availability calculations ✅ — bounded by the caller's balance
    _and_ by the pool's free liquidity, first-come-first-served on purpose
  - Withdrawal limits and constraints ✅
  - **Emergency withdrawal procedures — ❌** (`pause`/`unpause` exist; there is
    no separate emergency path)

- **User Interface** ✅
  - Lender dashboard with contribution overview
  - Withdrawal request interface
  - Available funds display and calculations
  - Withdrawal history ✅ (in the activity feed); pending requests ✅

### Expected Deliverables:

- Lenders can withdraw available contributions — ✅
- Proper fund locking prevents withdrawal conflicts — ✅
- Real-time contribution availability tracking — ✅
- Safe withdrawal process with validation — ✅

### Current Status: **COMPLETE** ✅

Note the deliberate asymmetry with membership: **`withdraw` is never gated on
membership**, so a removed member can still take out everything they put in.

---

## 🏃‍♀️ Sprint 9: Reputations

**Sprint Goal:** Implement comprehensive reputation tracking system.

### Current Status: **PARTIAL** 🚧

Borrowing history is real and shown where decisions are made. **No score
exists, and none is planned yet** — see [`docs/LOANS.md`](LOANS.md#borrowing-history).

The finding that shaped the sprint: **"repaid on time" was not derivable
anywhere** — the contract recorded whether a loan was repaid and never when, and
neither did the index. A borrower who settled on day 2 and one who settled on
day 400 were the same record, so any score built first would have been scoring a
signal that was not there. The contract stamps `repaidAt` now, live-verified.

### Features:

- **Reputation Scoring System** 🚧
  - **On-chain reputation score updates — ❌ and recommended against.** A score
    is an analytics artefact: the formula will be wrong the first time and want
    retuning, which off chain is a recomputation and on chain is a migration
    plus gas on every loan event. What belongs on chain is what only the chain
    can witness — a repayment's timing — and that is what was added.
  - Repayment history impact on reputation ✅ — counted, not scored
  - Default and liquidation reputation penalties — ❌; there is no liquidation
    anywhere in the project and default handling is owned by no sprint
  - Reputation recovery mechanisms — ❌, meaningless until there is a penalty

- **Reputation Integration** 🚧
  - Borrower reputation display in profiles ✅ — the owner's queue and the
    dashboard, via `BorrowerHistoryPanel`
  - Reputation-based loan eligibility — ❌ deliberately. The enforcing half is
    what makes reputation load-bearing, and it should not be built until the
    figures have been watched against real behaviour.
  - Historical reputation tracking ✅ — derived on read from the loans
  - Reputation analytics and insights — ❌

- **Backend Systems** 🚧
  - Event listeners for reputation-affecting events ✅ — the existing loan
    indexer, which already sees every event that touches a loan
  - Complex off-chain reputation profile management — ❌ **and not wanted.**
    Nothing about a borrower is stored, for the same reason liquidity and
    memberships are not: a figure written down is one that can disagree with
    the chain.
  - Reputation calculation algorithms — ❌, no score
  - Reputation data storage and retrieval ✅ — `repaidAt` on the loan record

### Expected Deliverables:

- Functional on-chain and off-chain reputation system 🚧 — facts, not a score
- Reputation-based loan decision support ✅ — the counts an owner asks for
- Borrower reputation profiles and history ✅
- Reputation impact on lending terms — ❌, see eligibility above

### Live verification

26 checks against a Hardhat node and the Firestore emulator, re-runnable as
`pnpm testHistory` from `packages/backend`. The pair that matters is a loan
repaid inside its term and one repaid two hours into a one-minute term reading
**differently** — before `repaidAt` those two records were identical, and the
check failed for every input.

It also found a defect the mocked suite could not: a loan first seen at its
repayment kept pointing at the repayment forever, because every field the
indexer's currency check compares already matched. The reference now moves to
the earliest event carrying the loan's current date.

### Not derivable, and worth knowing

Reputation is **per chain**: loan documents are keyed `${chainId}-${poolId}-${loanId}`
and the backend resolves one chain at a time, so a borrower's record on Amoy and
on localhost are different objects. It is also bounded by the page size the
feeds are fetched with — a wallet with more loans than that on one chain would
be summarised from part of its history.

---

## 🏃‍♀️ Sprint 10: Loan Management

**Sprint Goal:** Complete loan approval and rejection system for pool administrators.

**Built out of order**, ahead of Sprints 6 and 9 whose outputs it was meant to
consume. The mechanical half shipped; every part that depends on AI or
reputation is still waiting on those sprints.

### Features:

- **Admin Loan Management** 🚧
  - Smart contract `approveLoan` and `rejectLoan`, owner-only ✅
  - Admin dashboard for loan request review ✅ (`pool/approvals.tsx`)
  - Loan decision workflow ✅; **reasoning — ❌**, same deferral as Sprint 4
  - **Batch loan processing — ❌ deliberately.** Decisions are serialised
    because each is a separate transaction from one wallet, and two in flight
    means two signature prompts racing for one nonce.

- **Decision Support System 🚧**
  - AI recommendation integration — blocked on Sprint 6
  - Borrower reputation display ✅ — `BorrowerHistoryPanel` on every card in
    the queue, above the buttons rather than below them
  - Risk assessment summary — blocked on Sprint 6
  - Historical decision tracking and analytics — not started

- **Administrative Tools** 🚧
  - Loan queue management ✅; prioritisation ❌
  - Decision audit trail — on chain by construction; **no tooling over it** ❌
  - Admin notification and alert system — ✅ Sprint 12. A loan request now
    reaches the owner's phone and deep-links to the queue.
  - **Loan portfolio overview and statistics — ❌**

### Expected Deliverables:

- Pool admins can approve or reject loan requests — ✅
- AI-assisted loan decision making system — ❌
- Complete administrative loan management tools — 🚧
- Comprehensive loan decision audit system — 🚧

### Current Status: **Decisions work; decision _support_ not started** 🚧

---

## 🏃‍♀️ Sprint 11: Interest Distribution

**Sprint Goal:** Let the lenders who funded a loan actually earn from it.

Added 2026-08-12. This was missing from the plan entirely, which is how it went
unnoticed: the money loop has a hole at the end of it.

### Why this was next

`repayLoan` added principal plus interest to `totalFunds`, but `withdraw` was
bounded by `contributions[msg.sender]` — what the caller put in. Nothing credited
the interest to anybody, so it accumulated in the contract **permanently
unclaimable**, and every lender's lifetime earnings were structurally zero.

The app already shipped the surface for a number that could not exist:
`PoolStore.totalEarned` was a dashboard tile whose own docstring said it was zero
against real data and always would be.

Plan: [`.dev/old/INTEREST_DISTRIBUTION_PLAN.md`](../.dev/old/INTEREST_DISTRIBUTION_PLAN.md).
How it works: [`INTEREST.md`](INTEREST.md).

### Features:

- **Per-share accounting in the contract** ✅
  - An accumulator (`accInterestPerShare`) credited on repayment
  - `interestDebt` per member, so a deposit made after a repayment does not earn
    from it retroactively
  - `claimable(address)` and `claimInterest()`
  - `totalContributions` tracked separately from `totalFunds` — the distinction
    the whole design turns on, since `totalFunds` is missing exactly the money
    that was lent out

- **Indexing and the app** ✅
  - `interest_claims`, an append-only log; `indexInterestClaim` and
    `listInterestClaims`, both served from `src/index.ts`
  - `InterestClaimed` swept by `syncPoolEvents`. `InterestDistributed` gets no
    collection — it moves a pool-level figure read from the chain
  - `PoolStore.totalEarned` stops being a subtraction: claims plus what
    `claimable` reports, added rather than chosen between
  - `ClaimInterestCard` on the pool page; `ClaimableInterestSync` behind the
    dashboard tile

### Expected Deliverables:

- A lender's earnings are non-zero and withdrawable — ✅
- The dashboard tile means something — ✅

### Current Status: **COMPLETE** ✅

Live-verified: 66 checks against a Hardhat node and the Firestore emulator —
40 on the contract arithmetic, 19 on indexing, 7 driving the esbuild-bundled
mobile decoder over a real receipt. Re-runnable as `pnpm testInterest` from
`packages/backend`. The check that mattered most: a pool distributing while
another loan is outstanding, which is the only way to catch `totalFunds` used
where `totalContributions` belongs — a mistake that pays roughly double and
that no test with an unborrowed pool can see.

Deliberately not built: **no compounding** — unclaimed interest does not itself
earn, since that would mean adding it to `contributions` and changing what
`withdraw` means. **No platform fee** (`ROADMAP.md` Phase 3): the same
arithmetic, but a product decision. **No per-loan attribution**: the pool is
fungible. A claim has no activity-feed row yet.

---

## 🏃‍♀️ Sprint 12: Notifications

**Sprint Goal:** Tell people when something is waiting on them.

Added 2026-08-12. Not previously its own sprint, but Sprints 4, 7 and 10 each
list notifications as a feature and none of them had any — so it kept being
"part of" work that shipped without it.

Plan: [`.dev/features/NOTIFICATIONS_PLAN.md`](../.dev/features/NOTIFICATIONS_PLAN.md). How it
works: the Notifications section in [`CLAUDE.md`](../CLAUDE.md).

### Why it needed a sprint of its own

Every owner-side flow depended on someone noticing: a loan or membership request
costs the asker nothing to make and the owner everything to miss. The only way
to find out was to open the pool.

### What shipped (plan §8) ✅

- **Expo push, not Firebase Cloud Messaging.** The sprint text said "FCM
  wiring", and that was wrong in a load-bearing way: `firebase/messaging` in the
  JS SDK is web-only, so `messagingSenderId` was inert rather than a head start.
  The alternative was a second, native Firebase SDK beside the one the app
  already uses. The backend POSTs to `exp.host` and gains no messaging
  dependency at all.
- **Token registration** — `registerPushToken` / `unregisterPushToken`, their
  own `push_tokens` collection, given back on wallet disconnect _and_ switch.
- **Transition detection in the existing indexers**, not new listeners, as the
  sprint asked. All six transitions from the plan's table are detected and
  tested; the two owner-facing ones dispatch.
- **Membership request received** (Sprint 4) and **loan request received**
  (Sprints 6, 10), both to the pool owner, both deep-linking to the queue.
- Idempotency per (record, transition), so re-scanning genesis cannot produce a
  push per request ever made.

### What is left ❌

- **Borrower-facing pushes**: loan approved, loan rejected, membership decided.
  Courtesies rather than the reason the sprint exists — and note
  `cancelLoanRequest` emits `LoanRejected`, so a borrower who cancels their own
  request must not be told it was declined.
- **`sendDueReminders`** (Sprint 7's half). A scheduled scan, not an event hook,
  plus its own clock discipline: the record's `startedAt` is chain time and the
  job's "now" is server time, and a loan has to remember it was reminded.
- **Receipt polling.** Only send-response `DeviceNotRegistered` pruning is
  implemented. Expo's `getReceipts` needs a deferred second pass.
- **Preferences beyond on/off**, digests, quiet hours, an in-app notification
  centre — all deliberately out of scope, see the plan §7.

### Current Status: **Owner-facing pushes shipped; delivery unverified** 🚧

The code is written and tested — 116 tests over transitions, idempotency,
recipient resolution, token pruning and the deep links. **Nothing has reached a
phone.** This is the first milestone in the project whose acceptance test the
sandbox cannot run: the emulator does not deliver push. Closing it needs
`eas build --profile development`, an APNs key and an FCM v1 service account
uploaded to EAS. Expo Go on Android cannot receive remote push at all since
SDK 53.

---

## 📋 Cross-cutting, owned by no sprint

- **Deployment to a public chain.** Sprint 3 names it as blocked but nothing
  owns fixing it. The backend half is done — it serves every configured chain
  now — so what is left is a funded deployer and backend wallet, an Amoy entry
  in `hardhat.config.ts`, and the per-network checklist in
  [`.dev/deployment/GOING_PUBLIC.md`](../.dev/deployment/GOING_PUBLIC.md)
  §2.2. Until this moves, nothing in the project is publicly inspectable.
- **Nothing in the app says which chain a pool is on.** Now that the backend can
  serve several, this is the gap it exposes: pool cards carry no network badge,
  and joining a pool on another network fails at the wallet rather than being
  explained. The old multi-chain plan's §3.2 and §4.1 are still the right
  sketch for it.
- **Default handling.** A loan's term is recorded and displayed, and nothing on
  chain enforces it — no liquidation, no penalty, no default state. Listed in
  [`ROADMAP.md`](ROADMAP.md) Phase 3, absent from every sprint.
- **Pending transaction tracking.** Shipped without a sprint: persistence across
  restarts, startup recovery, per-type result extraction and the status modal.
  Every write flow depends on it; the plan has never mentioned it.
- **Pool discovery.** Also shipped without a sprint, and Sprint 4 had ticked it
  years-of-code before it existed. `PoolStore.discoverablePools` is the
  complement of `myPools`, so the Pools and Discover tabs partition the chain.
  Its known limit is written down rather than fixed: search is client-side over
  one page of 50 pools, because `listPools` has no text filter and Firestore
  cannot match a substring. The fix is search tokens on the pool document.
