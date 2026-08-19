# 🚀 SuperPool Development Sprint Plan

This document outlines the structured development sprints for the SuperPool dApp. Each sprint focuses on a specific set of features, building a robust micro-lending platform incrementally.

## 🎯 Overall Goal

To build a functional micro-lending decentralized application on Polygon where users can connect wallets, join specific lending pools, contribute liquidity, request and repay loans, with comprehensive reputation tracking.

## 📍 Where things stand (2026-08-19)

| Sprint                         | Status                                                 |
| ------------------------------ | ------------------------------------------------------ |
| 1 · Foundation                 | ✅ Complete                                            |
| 2 · Authentication Enhancement | ✅ Complete                                            |
| 3 · Pool Creation              | 🚧 Complete locally; blocked on testnet deployment     |
| 4 · Pool Membership            | ✅ Complete                                            |
| 5 · Pool Liquidity             | ✅ Complete — native POL and ERC-20 pools              |
| 6 · Loan Requests              | ✅ Complete — request flow and AI assessment           |
| 7 · Loan Repayments            | ✅ Full, partial, accruing; reminders; no schedule     |
| 8 · Withdrawals                | ✅ Complete                                            |
| 9 · Reputations                | 🚧 History and defaults observed; no score, on purpose |
| 10 · Loan Management           | ✅ Complete — decisions, support, queue and portfolio  |
| 11 · Interest Distribution     | ✅ Complete                                            |
| 12 · Notifications             | 🚧 All nine kinds shipped; delivery unverified         |

Three deferrals across Sprints 4, 6 and 10 — a membership reason, a loan
purpose, a decision reason — turned out to be one missing mechanism, and were
built together on 2026-08-18 as [Notes](../CLAUDE.md#notes).

Sprints 4–10 were shipped in a different order than planned. Membership (4)
landed after liquidity (5) and loans (6, 7, 10), and loan management (10)
shipped ahead of the AI (6) and reputation (9) work it was meant to consume.
The sprint numbers are the original plan's, not the build order.

Everything shipped is verified against a live Hardhat node and the Firebase
emulators, not only against mocked tests. **Nothing is deployed to a public
chain**, which is the single biggest gap in the project and is owned by no
sprint — see "Cross-cutting" at the end.

**Most of what is left is configuration, not code.** The three things that would
change what an outsider can see — a public deployment, a build that can actually
receive push, and a deployed agent service — are keys, funding and credentials.
The development work that remains is real but optional, and none of it blocks a
demo; both halves are listed under "What is left, split by kind" at the end.

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
configured; see the Chains section in [`CLAUDE.md`](../CLAUDE.md).
`hardhat.config.ts` already carries `polygonAmoy` and its explorer entry, so what
remains is a chequebook and the per-network deployment checklist.

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
  - Approval/rejection workflow — ✅; **reason tracking — ✅ 2026-08-18**, in
    Firestore exactly as the deferral said. See [Notes](../CLAUDE.md#notes).
    A removal reason has nowhere to be pushed — being removed is not a
    decision on anything the member asked for — so it lands on the pool page
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

- **Liquidity Contribution System** ✅
  - `depositFunds` for POL ✅; **ERC-20 — ✅ 2026-08-18** via `depositTokens`.
    One asset per pool, chosen at creation and never changed, with `address(0)`
    meaning native so nothing existing had to migrate. Deliberately **not** an
    overload of `depositFunds`: ethers refuses to resolve an ambiguous bare
    name, which would have broken every native call site
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

### Current Status: **COMPLETE — native and token pools** ✅

ERC-20 shipped 2026-08-18, all five phases of
[`.dev/contracts/ERC20_PLAN.md`](../.dev/contracts/ERC20_PLAN.md), live-verified
with 29 checks (`pnpm --filter backend testErc20`). Each protection was checked
by **mutation** rather than trusted for passing: crediting the requested amount
instead of the delivered balance fails exactly the two fee-on-transfer checks.

Phase 3 before phase 4 is the ordering worth remembering — the decimals refactor
landed while every pool was still native and 18-decimal, so the existing mobile
suite was the proof it changed nothing, and making `formatToken`'s exponent
_required_ let the type checker enumerate all 42 arithmetic sites.

Three rules that are easy to break, all in
[`CLAUDE.md`](../CLAUDE.md#denominations):

- **Formatting is three-way**, and collapsing it to two is a factor-of-10¹² bug:
  native, a token whose decimals the backend read, and a token it could not —
  the third is shown as unsupported and never falls back to 18.
- **Credit the balance delta, never the requested amount.** A fee-on-transfer
  token delivers less than it was asked for, and crediting the request inflates
  `totalContributions` — the denominator every interest distribution divides by.
- **Never sum balances across pools.** `totalBalance` and `totalEarned` are
  native-only now; adding a USDC balance to a POL one needs a price, and the
  oracle is deliberately absent.

One thing is still open here and it is **configuration**: which stablecoin to use
on Amoy. The app reads it from `EXPO_PUBLIC_USDC_ADDRESS_AMOY` and offers native
alone until it is set, and the token must also be authorized on the deployed
factory with `setLoanTokenAuthorization`. Nothing is blocked and nothing is
guessed — a wrong address would create pools denominated in nothing,
permanently, since `loanToken` has no setter.

---

## 🏃‍♀️ Sprint 6: Loan Requests

**Sprint Goal:** Implement loan request functionality with AI assessment integration.

See [`LOANS.md`](LOANS.md) for how the shipped system works.

### Features:

- **Loan Request System** ✅
  - Smart contract `requestLoan` ✅
  - Loan parameter specification: amount ✅, terms ✅ (from the pool's config,
    not per-loan), **purpose — ✅ 2026-08-18**, off chain and optional. Staged
    under the requesting transaction and resolved by the indexer, because the
    loan has no id until it is mined. See [Notes](../CLAUDE.md#notes)
  - Request validation and eligibility checks ✅
  - Loan request queue management ✅

- **AI Assessment Integration — ✅ 2026-08-18**
  - `packages/agents` (Mastra), the `assessLoan` / `getAssessment` callables,
    and the panel on the owner's queue. It was split into its own sprint, as
    the note here recommended.
  - **Advisory, never load-bearing**, and it produces a band rather than a
    score — `REPUTATION_PLAN` §7's argument was kept, not overturned. See
    [Assessment](../CLAUDE.md#assessment).
  - Held by seven eval cases (`pnpm --filter agents eval`) and 21 live checks
    against a real model (`pnpm --filter backend testAssessment`). The last of
    those is a **daily per-wallet cap** on fresh readings, shipped 2026-08-18:
    this is the only callable in the project that spends money on somebody
    else's behalf, and the owner's queue asks for a reading per undecided
    request the first time it opens.

- **User Interface** ✅
  - Loan request form for members
  - Loan amount calculator and term selection
  - Request status tracking and updates
  - Loan history and pending requests display

### Expected Deliverables:

- Members can request loans through the dApp — ✅
- AI assessment system evaluates loan requests — ✅ 2026-08-18
- Loan request management and tracking system — ✅
- Preliminary risk scoring for loan decisions — **deliberately not built.** A
  band, not a score: a number can be thresholded into a gate, and this feature
  must never gate anything

### Current Status: **Complete** ✅

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
  - Default and liquidation reputation penalties — 🚧. Default handling shipped
    2026-08-18, so a default is now **observed**: `BorrowerHistory.defaulted`
    counts declarations over a wallet's whole record. There is still no
    _penalty_ — nothing gates on the count, and there is no liquidation anywhere
    in the project, deliberately
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
consume — so the mechanical half shipped first and everything depending on AI
or reputation waited for them. Closed on 2026-08-19, a day after the
assessment work landed.

### Features:

- **Admin Loan Management** 🚧
  - Smart contract `approveLoan` and `rejectLoan`, owner-only ✅
  - Admin dashboard for loan request review ✅ (`pool/approvals.tsx`)
  - Loan decision workflow ✅; **reasoning — ✅ 2026-08-18**, same mechanism as
    Sprint 4 and Sprint 6 — the three were one missing feature. Written before
    the transaction, so the borrower's push carries it
  - **Batch loan processing — ❌ deliberately.** Decisions are serialised
    because each is a separate transaction from one wallet, and two in flight
    means two signature prompts racing for one nonce.

- **Decision Support System ✅**
  - AI recommendation integration — ✅ 2026-08-18, as a _reading_ rather than a
    recommendation: it says what it notices and never what to do
  - Borrower reputation display ✅ — `BorrowerHistoryPanel` on every card in
    the queue, above the buttons rather than below them
  - Risk assessment summary — ✅ 2026-08-18 (`AssessmentPanel`)
  - Historical decision tracking and analytics — ✅ 2026-08-19, as the
    `loan_decisions` collection: one immutable record per decision log, which
    is the only place a decision's date, its author, and the difference
    between a refusal and a withdrawal exist. See
    [Decisions](../CLAUDE.md#decisions)

- **Administrative Tools** ✅
  - Loan queue management ✅; **prioritisation — ✅ 2026-08-19.** Longest
    waiting by default, plus two orders by amount. Deliberately never by
    assessment band or borrowing history: a band cannot be sorted by design,
    and "fewest defaults first" is a score with the arithmetic hidden
  - Decision audit trail — on chain by construction; **tooling over it — ✅
    2026-08-19** (`listLoanDecisions`, and the history on `pool/portfolio`)
  - Admin notification and alert system — ✅ Sprint 12. A loan request now
    reaches the owner's phone and deep-links to the queue.
  - **Loan portfolio overview and statistics — ✅ 2026-08-19** — what is out
    on loan, what the pool holds, how much of it is working, the loans by
    state, and the decisions by outcome

### Expected Deliverables:

- Pool admins can approve or reject loan requests — ✅
- AI-assisted loan decision making system — ✅ 2026-08-18, advisory only
- Complete administrative loan management tools — ✅
- Comprehensive loan decision audit system — ✅ 2026-08-19

### Current Status: **COMPLETE** ✅

The last three items shipped together on 2026-08-19, because they were one
missing record: a loan document keeps only the state a decision left behind, so
prioritisation had no wait to sort by past the approval, a portfolio had no
approvals to count, and an audit trail had nothing to read. `loan_decisions`
answers all three.

Still deliberately absent: **batch processing**, for the reason above — two
decisions in flight from one wallet means two signature prompts racing for one
nonce.

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

- ~~**Borrower-facing pushes**~~ — shipped 2026-08-18: loan approved, loan
  rejected, loan defaulted, membership approved, membership rejected. The trap
  the plan predicted was real and is handled by reading the **transaction's
  sender**: `cancelLoanRequest` emits `LoanRejected` and leaves the record
  identical to a rejection, so only who sent it separates the two. It also
  forced a distinction in the indexer — `approved` and `disbursed` are now
  different transitions, because both end at `disbursed` and only one is an
  answer to somebody.
- ~~**`sendDueReminders`**~~ (Sprint 7's half) — shipped 2026-08-18, hourly,
  with the clock discipline the plan called for: **chain time, not server
  time**, from one `getBlock('latest')` per chain per run. A loan remembers it
  was reminded through the same `notifications_sent` marker everything else
  uses, so it is one due-soon and one overdue reminder per loan, ever.
- **Receipt polling.** Only send-response `DeviceNotRegistered` pruning is
  implemented. Expo's `getReceipts` needs a deferred second pass.
- **Preferences beyond on/off**, digests, quiet hours, an in-app notification
  centre — all deliberately out of scope, see the plan §7.

### Current Status: **All nine kinds shipped; delivery unverified** 🚧

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
  now — and `hardhat.config.ts` already carries `polygonAmoy`, so what is left
  is a funded deployer key, a funded backend wallet and the per-network
  checklist in
  [`.dev/deployment/GOING_PUBLIC.md`](../.dev/deployment/GOING_PUBLIC.md) §1.
  Until this moves, nothing in the project is publicly inspectable.
- **`main` is 158 commits behind `develop`** (measured 2026-08-18). GitHub shows
  `main` by default, so every visitor sees a snapshot with no loans, no
  contributions, no interest, no notifications and none of the docs. Cheaper
  than the deploy, and worth doing before it.
- **The agent service runs nowhere but a laptop.** `packages/agents` is packaged
  and deployable, but a deployed backend needs `AGENT_SERVICE_URL`, a shared
  `MASTRA_JWT_SECRET`, and an `ANTHROPIC_API_KEY` living with the agent and
  nowhere else. Without them `assessLoan` degrades to `not-configured`, which is
  by design and silent — so the AI half is simply invisible until the
  credentials exist. The eval suite is out of CI for the same reason: it needs a
  provider key there, which is a deployment decision.
- ~~**Nothing in the app says which chain a pool is on.**~~ Closed 2026-08-17.
  `NetworkBadge` goes **one per screen, never one per card**: every list is
  already narrowed to the connected chain, so a badge per pool would repeat one
  fact as many times as there are pools. It sits on the Pools and Discover
  headers and beside the dashboard balance, which is the per-chain figure that
  reads as everything the user owns without it. Joining a pool on another
  network turned out to be unreachable for the same reason. See the Chains
  section in [`CLAUDE.md`](../CLAUDE.md#chains).
- **Default handling — shipped 2026-08-18.** `LoanStatus.Defaulted`, an
  owner-only `markDefaulted` behind a settable `defaultGracePeriod`, the
  owner's late-loan list, the borrower's notice, and the scheduled reminder scan
  that closes Sprint 7's half of Sprint 12. Still **no liquidation and no
  penalty rate**: a declaration records a judgement, and what actually presses a
  late borrower is accrual. See
  [`LOANS.md`](LOANS.md#late-and-in-default-are-different-questions).
  36 live checks: `pnpm --filter backend testDefaults`.
- **Pending transaction tracking.** Shipped without a sprint: persistence across
  restarts, startup recovery, per-type result extraction and the status modal.
  Every write flow depends on it; the plan has never mentioned it.
- **Pool discovery.** Also shipped without a sprint, and Sprint 4 had ticked it
  years-of-code before it existed. `PoolStore.discoverablePools` is the
  complement of `myPools`, so the Pools and Discover tabs partition the chain.
  Its known limit is written down rather than fixed: search is client-side over
  one page of 50 pools, because `listPools` has no text filter and Firestore
  cannot match a substring. The fix is search tokens on the pool document.

---

## 🧭 What is left, split by kind (2026-08-19)

### Configuration and credentials — no code

1. **Merge `develop` → `main`.** 158 commits, one hour, and it stops the shop
   window showing five-month-old stock.
2. **Amoy.** A funded deployer key and a funded backend wallet, then the
   per-network checklist. Budget for bugs: this is the first time the mobile
   screens meet real latency and real reorgs rather than a node that mines
   instantly.
3. **A build that can receive push.** `eas build --profile development`, an APNs
   key and an FCM v1 service account uploaded to EAS. Expo Go on Android cannot
   receive remote push at all since SDK 53, so the dev build is not optional.
4. **A deployed agent service**, with its own `ANTHROPIC_API_KEY`.
5. **Firebase quotas and limits**, before anything is publicly reachable.
6. **Which stablecoin on Amoy**, and whether it has a faucet.

### Still to build — none of it blocking a demo

- **Sprint 12**: receipt polling. Only send-response `DeviceNotRegistered`
  pruning exists; Expo's `getReceipts` needs a deferred second pass.
- **Discovery**: search tokens written onto the pool document by the indexer, so
  search stops being client-side over one page of 50 pools.
- ~~**Contracts tooling**~~ — shipped 2026-08-19
  ([`.dev/contracts/CONTRACTS_BACKLOG.md`](../.dev/contracts/CONTRACTS_BACKLOG.md)
  §4). Verification deduplicated into `scripts/lib/verification.ts`;
  `pnpm env:print` emits the `.env` lines from `deployments/<network>.json`;
  Arbitrum, Base, BSC and mainnet added. **The find that mattered was not on the
  list**: `hardhat-verify` picks its API from the _shape_ of `etherscan.apiKey`,
  and the per-network map the config used selects the **v1** API that was
  switched off in May 2025 — so verification on the Amoy deploy would have
  failed against a dead endpoint. One string selects v2. Left as migrations:
  Hardhat 3, Solidity 0.8.30, Ignition.
- ~~**Zod validation**~~ — shipped 2026-08-19. It was already in the app and the
  agent; the chore only ever meant the backend, whose 28 endpoints hand-rolled
  their checks. See [`CLAUDE.md` → Request validation](../CLAUDE.md#request-validation).
- **Chores** ([`.dev/todo.md`](../.dev/todo.md)): Maestro + EAS workflows for
  E2E, an environments document, the 'Empty' illustration and a hero
  background.

### Deliberately not built, so it is not re-proposed

A reputation **score** and its enforcing half (eligibility, terms); liquidation
and penalty rates; batch loan decisions; auto-approval from an assessment;
editing or deleting a note; cross-chain views; a member cap; and a minimum
deposit. Each has its reasoning recorded where it was refused — that reasoning
is the point of keeping the entry.
