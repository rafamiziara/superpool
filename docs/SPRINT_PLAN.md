# 🚀 SuperPool MVP Sprint Plan

This document outlines the four sprints for the Minimum Viable Product (MVP) of the SuperPool dApp. Each sprint aims to deliver a set of functional, testable features, building upon the previous one.

## 🎯 Overall MVP Goal

To build a functional micro-lending decentralized application on Polygon Amoy where users can connect wallets, join specific lending pools, contribute liquidity, request and repay loans, and where borrower reputation is tracked.

---

## 🏃‍♀️ Sprint 1: Foundation & Pool Creation

**Sprint Goal:** Establish the foundational smart contracts and allow an admin/creator to set up the initial lending environment.

### Features:

- **User Onboarding & Wallet Connection**
  - Implement wallet connection (MetaMask/WalletConnect integration).
  - Basic user registration/login via Firebase Authentication.
  - Display connected wallet address.
- **Create a New Lending Pool**
  - **Smart Contracts:** Develop and deploy `PoolFactory.sol` and the initial `LendingPool.sol` implementation (as an upgradable proxy).
    - `PoolFactory`: `createPool` function.
    - `LendingPool`: Core structure, `constructor`, `initialize` (for upgradable proxies).
  - **Backend (Cloud Functions):** Create a Cloud Function to interact with `PoolFactory` (triggered by the mobile app, likely via the main Safe).
  - **Mobile App:** Implement UI for a "pool creator" to input pool details and trigger pool creation.
  - **Deployment Script:** Automate deployment of `PoolFactory` to Polygon Amoy, and transfer ownership to your designated multi-sig Safe.
  - **Contract Verification:** Automate `PoolFactory` verification on Polygonscan.

### Expected Deliverables:

- A user can successfully connect their wallet and log in.
- A designated pool creator/admin can successfully deploy a new lending pool on Amoy via the dApp.
- Deployed `PoolFactory` contract is verified on Polygonscan and owned by the multi-sig Safe.

---

## 🏃‍♀️ Sprint 2: Membership & Liquidity

**Sprint Goal:** Enable users to join existing pools and contribute liquidity, making the pools functional for lending.

### Features:

- **Request to Join Pool**
  - **Smart Contracts (`LendingPool.sol`):** Implement `requestToJoinPool` function.
  - **Backend (Cloud Functions):** Create an API endpoint to receive join requests and store off-chain data in Firestore (e.g., pending requests).
  - **Mobile App:** Develop UI for users to find a pool and submit a join request.
- **Admin Approves Pool Member**
  - **Smart Contracts (`LendingPool.sol`):** Implement `approveMember` function (restricted to pool admin).
  - **Backend (Cloud Functions):** Create an API endpoint for a pool admin to approve requests, triggering the `approveMember` call on-chain (via their respective Safe).
  - **Mobile App:** Develop admin UI to view pending join requests and approve/reject them.
- **Contribute Liquidity to Pool**
  - **Smart Contracts (`LendingPool.sol`):** Implement `deposit` function (for POL/ERC20 contribution into the pool).
  - **Backend (Cloud Functions):** Listen for `Deposit` events from the contract and update off-chain lender balances and pool liquidity data in Firestore.
  - **Mobile App:** Develop UI for approved members to contribute funds to the pool.

### Expected Deliverables:

- Users can request to join a specific lending pool.
- Pool admins can approve or reject membership requests.
- Approved members can contribute liquidity to a lending pool.
- Off-chain tracking of pool members and their contributed liquidity.

---

## 🏃‍♀️ Sprint 3: Lending Core & Withdrawals

**Sprint Goal:** Implement the core borrowing and repayment cycle, and provide essential liquidity control for lenders.

### Features:

- **Request a Loan**
  - **Smart Contracts (`LendingPool.sol`):** Implement `requestLoan` function.
  - **Backend (Cloud Functions):** Create an API for loan requests, triggering the AI agent for assessment (even if simplified). Store pending loan requests in Firestore.
  - **Mobile App:** Develop UI for approved members to request a loan, specifying amount and desired terms.
- **Repay a Loan**
  - **Smart Contracts (`LendingPool.sol`):** Implement `repayLoan` function.
  - **Backend (Cloud Functions):** Listen for `LoanRepaid` events and update loan status in Firestore.
  - **Mobile App:** Develop UI for borrowers to view their active loans and initiate repayment.
- **Withdraw Contribution (for Lenders)**
  - **Smart Contracts (`LendingPool.sol`):** Implement `withdrawContribution` function.
    - **Crucial Logic:** Add checks to prevent withdrawal of funds that are currently locked in active loans.
  - **Backend (Cloud Functions):** Listen for `Withdrawal` events and update off-chain lender balances.
  - **Mobile App:** Develop UI for lenders to view their available vs. locked contributions and request withdrawals.

### Expected Deliverables:

- Borrowers can request loans through the dApp (with initial AI assessment).
- Borrowers can successfully repay their loans.
- Lenders can withdraw their available (unlocked) contributions from the pool.
- Basic loan lifecycle (request -> repayment) is functional end-to-end.

---

## 🏃‍♀️ Sprint 4: Reputation & Refinement

**Sprint Goal:** Integrate the reputation system, refine existing features for robustness, and add final polish to the MVP.

### Features:

- **Handling Reputations**
  - **Smart Contracts:** Integrate reputation score updates into `repayLoan` and introduce logic for `liquidateLoan` (for defaults) to negatively impact reputation.
  - **Backend (Cloud Functions):** Create Cloud Functions to listen to `LoanRepaid` and `LoanLiquidated` events, updating a more complex off-chain reputation profile in Firestore.
  - **Mobile App:** Display borrower reputation (e.g., a score, "good standing" / "defaulted" status) on user profiles and within the loan request review process.
- **Loan Approval/Rejection (Admin side, leveraging Reputation)**
  - **Smart Contracts (`LendingPool.sol`):** Implement `approveLoan` / `rejectLoan` functions (restricted to pool admin).
  - **Backend (Cloud Functions):** Create an API for pool admins to approve/reject loan requests, utilizing the AI agent's recommendation and the newly integrated reputation data.
  - **Mobile App:** Enhance admin UI to view loan requests, see borrower reputation information, and finalize approval/rejection.
- **MVP Refinement & Edge Cases**
  - **Contracts:** Comprehensive unit and integration testing of `withdrawContribution` edge cases (e.g., trying to withdraw more than available).
  - **Error Handling:** Implement custom Solidity errors for all relevant revert conditions.
  - **UX/UI Polish:** Improve overall user flows, enhance loading states, and refine error messages across the mobile application.
  - **Security Check:** Perform a final round of static analysis (Slither, Solhint) and comprehensive end-to-end testing of the entire system.
  - **Basic Dashboards:** Implement simple "My Loans" (borrower), "My Contributions" (lender), and "Pool Overview" (admin) views to summarize user/pool status.

### Expected Deliverables:

- A functional on-chain and off-chain reputation system is in place, reflecting loan repayment behavior.
- Pool admins can approve/reject loans using the AI agent's recommendation and the borrower's reputation.
- A polished and robust MVP that demonstrates the core micro-lending functionality, ready for portfolio presentation.
- All core contracts are thoroughly tested, verified, and follow security best practices.
