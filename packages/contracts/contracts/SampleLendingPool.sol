// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {
    OwnableUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {
    PausableUpgradeable
} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title SampleLendingPool
 * @notice A sample upgradeable lending pool contract for SuperPool platform
 * @author SuperPool Team
 * @dev A sample upgradeable lending pool contract for SuperPool platform
 * This contract demonstrates the basic structure for a lending pool with:
 * - Upgraded as a set through the factory's beacon, not per instance
 * - Access control with ownership
 * - Pausable functionality for emergency stops
 * - Reentrancy protection
 */
contract SampleLendingPool is
    Initializable,
    OwnableUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardTransient
{
    /// @dev Pool configuration
    struct PoolConfig {
        uint256 maxLoanAmount;
        uint256 interestRate;
        uint256 loanDuration;
        bool isActive;
        /**
         * @dev Whether borrowing needs the pool owner's approval. Packs into
         * `isActive`'s slot, and reads false on every pool that predates it —
         * which preserves the old behaviour of lending on demand.
         */
        bool requiresApproval;
    }

    /// @dev Loan information - optimized for gas efficiency
    /**
     * @notice Where a loan is in its lifecycle
     * @dev `Disbursed` is deliberately zero. This field was added to `Loan`
     * after pools were already holding loans, and a struct field that did not
     * exist reads as zero — so every pre-existing loan has to mean "disbursed",
     * which is exactly what they all were. Reordering this enum silently
     * relabels every historical loan.
     *
     * Repayment stays on the separate `isRepaid` flag rather than becoming a
     * fourth state, for the same reason: it predates this and already carries
     * that meaning.
     */
    enum LoanStatus {
        Disbursed,
        Requested,
        Rejected
    }

    struct Loan {
        address borrower;         // 20 bytes
        bool isRepaid;           // 1 byte - fits in same slot (21 bytes total)
        LoanStatus status;       // 1 byte - packs into the same slot (22 bytes)
        uint256 amount;          // 32 bytes - new slot
        uint256 interestRate;    // 32 bytes - new slot
        uint256 startTime;       // 32 bytes - new slot
        uint256 duration;        // 32 bytes - new slot
    }

    /// @notice Pool configuration
    PoolConfig public poolConfig;

    /// @notice Total funds available in the pool
    uint256 public totalFunds;

    /// @notice Mapping of loan ID to loan details
    mapping(uint256 => Loan) public loans;

    /// @notice Current loan ID counter
    uint256 public nextLoanId;

    /**
     * @notice Amount each member has deposited and not yet withdrawn
     * @dev Appended in v2. Before it existed, per-member balances had no
     * on-chain counterpart at all — they were derived from `FundsDeposited`
     * events off chain, which is why no withdrawal could be written. New state
     * goes at the end of the most-derived contract to keep the layout
     * upgrade-safe; the OpenZeppelin bases use ERC-7201 namespaces of their own.
     */
    mapping(address => uint256) public contributions;

    /**
     * @notice The borrower's unrepaid loan, or 0 if they have none
     * @dev Appended in v2, and doing double duty: it caps a borrower at one
     * open loan at a time, and it locks their contribution until they repay.
     * Loan ids start at 1, so 0 is an unambiguous "none".
     */
    mapping(address => uint256) public activeLoanId;

    /// @notice Events
    /**
     * @notice Emitted when the pool configuration is updated
     * @param maxLoanAmount Maximum loan amount allowed in the pool
     * @param interestRate Interest rate for loans (in basis points)
     * @param loanDuration Duration of loans in seconds
     */
    event PoolConfigured(
        uint256 indexed maxLoanAmount,
        uint256 indexed interestRate,
        uint256 indexed loanDuration
    );
    /**
     * @notice Emitted when funds are deposited into the pool
     * @param depositor Address of the account that deposited funds
     * @param amount Amount of funds deposited
     */
    event FundsDeposited(address indexed depositor, uint256 indexed amount);
    /**
     * @notice Emitted when a member withdraws part or all of their contribution
     * @param member Address of the account that withdrew funds
     * @param amount Amount withdrawn
     * @dev Both parameters are indexed to mirror `FundsDeposited`, so the two
     * share one decoding shape off chain: `data` is empty and every field comes
     * from the log topics.
     */
    event FundsWithdrawn(address indexed member, uint256 indexed amount);
    /**
     * @notice Emitted when a new loan is created
     * @param loanId Unique identifier of the created loan
     * @param borrower Address of the borrower
     * @param amount Amount of the loan
     */
    event LoanCreated(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 indexed amount
    );
    /**
     * @notice Emitted when a loan is repaid
     * @param loanId Unique identifier of the repaid loan
     * @param borrower Address of the borrower who repaid the loan
     * @param amount Total amount repaid (principal + interest)
     */
    event LoanRepaid(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 indexed amount
    );
    /**
     * @notice Emitted when a member asks to borrow and the pool needs approval
     * @param loanId Unique identifier of the requested loan
     * @param borrower Address of the requesting member
     * @param amount Amount requested
     */
    event LoanRequested(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 indexed amount
    );
    /**
     * @notice Emitted when the pool owner approves a request and funds go out
     * @param loanId Unique identifier of the approved loan
     * @param borrower Address of the borrower
     * @param amount Amount disbursed
     */
    event LoanApproved(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 indexed amount
    );
    /**
     * @notice Emitted when a request is turned down, by the owner or the borrower
     * @param loanId Unique identifier of the rejected request
     * @param borrower Address of the requesting member
     * @param amount Amount that was requested
     */
    event LoanRejected(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 indexed amount
    );
    /**
     * @notice Emitted when the pool owner turns approval on or off
     * @param requiresApproval Whether borrowing now needs approval
     */
    event ApprovalRequirementChanged(bool indexed requiresApproval);

    /// @notice Errors
    error InsufficientFunds();
    error InsufficientBalance();
    error InsufficientLiquidity();
    error LoanOutstanding();
    error LoanAlreadyRepaid();
    error UnauthorizedBorrower();
    error ExceedsMaxLoanAmount();
    error InvalidAmount();
    error PoolNotActive();
    error InsufficientRepaymentAmount();
    error TransferFailed();
    error RefundFailed();
    error InvalidImplementation();
    /// @dev `createLoan` on a pool whose owner reviews requests; use `requestLoan`.
    error ApprovalRequired();
    /// @dev The loan is not awaiting a decision — already approved, or rejected.
    error LoanNotPending();

    /**
     * @notice Initialize the contract (replaces constructor for upgradeable contracts)
     * @dev Initialize the contract (replaces constructor for upgradeable contracts)
     * @param _owner Initial owner of the contract
     * @param _maxLoanAmount Maximum loan amount allowed
     * @param _interestRate Interest rate (in basis points, e.g., 500 = 5%)
     * @param _loanDuration Loan duration in seconds
     */
    function initialize(
        address _owner,
        uint256 _maxLoanAmount,
        uint256 _interestRate,
        uint256 _loanDuration
    ) public initializer {
        __Ownable_init(_owner);
        __Pausable_init();

        poolConfig = PoolConfig({
            maxLoanAmount: _maxLoanAmount,
            interestRate: _interestRate,
            loanDuration: _loanDuration,
            isActive: true,
            // Off by default: a new pool lends on demand until its owner asks
            // to review requests, which keeps the factory's `createPool`
            // signature — and every caller of it — unchanged.
            requiresApproval: false
        });

        nextLoanId = 1;

        emit PoolConfigured(_maxLoanAmount, _interestRate, _loanDuration);
    }

    /**
     * @notice Deposit funds into the pool
     * @dev Credits the caller's contribution balance as well as pool liquidity.
     * The two differ once loans are outstanding: `totalFunds` is what the pool
     * can currently lend or return, while the sum of `contributions` is what it
     * owes its members.
     */
    function depositFunds() external payable whenNotPaused {
        if (msg.value == 0) revert InvalidAmount();
        totalFunds += msg.value;
        contributions[msg.sender] += msg.value;
        emit FundsDeposited(msg.sender, msg.value);
    }

    /**
     * @notice Withdraw part or all of your contribution
     * @param _amount Amount to withdraw, in wei
     * @dev Bounded by two independent limits: what the caller is owed
     * (`contributions[msg.sender]`) and what the pool can currently pay
     * (`totalFunds`, which excludes anything lent out). The second is
     * first-come-first-served on purpose — a member is not entitled to more
     * than the pool holds, and outstanding loans therefore delay some
     * withdrawals rather than failing them permanently.
     *
     * Interest earned through `repayLoan` is deliberately *not* withdrawable:
     * it raises `totalFunds` without crediting any contribution, so it
     * accumulates unclaimed. Distributing it is a separate milestone.
     */
    function withdraw(
        uint256 _amount
    ) external whenNotPaused nonReentrant {
        if (_amount == 0) revert InvalidAmount();
        if (activeLoanId[msg.sender] != 0) revert LoanOutstanding();

        uint256 balance = contributions[msg.sender];
        if (_amount > balance) revert InsufficientBalance();
        if (_amount > totalFunds) revert InsufficientLiquidity();

        // Complete all state changes before external call (CEI pattern)
        contributions[msg.sender] = balance - _amount;
        totalFunds -= _amount;

        // Emit event before external call
        emit FundsWithdrawn(msg.sender, _amount);

        (bool success, ) = payable(msg.sender).call{value: _amount}("");
        if (!success) revert TransferFailed();
    }

    /**
     * @notice Amount a member could withdraw right now
     * @param _member Address to query
     * @return The member's contribution, capped by the pool's free liquidity
     * @dev A UI convenience so a "withdraw max" control does not have to
     * reimplement the bound and drift from it.
     */
    function withdrawableAmount(
        address _member
    ) external view returns (uint256) {
        return Math.min(contributions[_member], totalFunds);
    }

    /**
     * @notice Create a new loan
     * @param _amount Loan amount requested
     * @return loanId The ID of the created loan
     * @dev Borrowing is restricted to members — a caller with a non-zero
     * contribution — which is the same definition of membership the app
     * already uses, and needs no separate approval flow. Before v2 there was
     * no check on `msg.sender` at all, so anyone could take `maxLoanAmount`
     * repeatedly until the pool was empty and never repay.
     *
     * Membership alone is a weak gate, so two limits back it up: one open loan
     * per borrower, which caps a single borrower's exposure at the owner's
     * configured `maxLoanAmount`; and a lock on the borrower's contribution
     * until they repay, so a member cannot borrow and then withdraw their
     * stake. Note the contribution is *not* collateral — it does not bound the
     * loan and is not seized on default.
     */
    function createLoan(
        uint256 _amount
    ) external whenNotPaused nonReentrant returns (uint256) {
        if (!poolConfig.isActive) revert PoolNotActive();

        // A pool that reviews requests must not have a side door that skips the
        // review. The app routes to `requestLoan` on this error.
        if (poolConfig.requiresApproval) revert ApprovalRequired();

        if (contributions[msg.sender] == 0) revert UnauthorizedBorrower();

        if (activeLoanId[msg.sender] != 0) revert LoanOutstanding();

        if (_amount > poolConfig.maxLoanAmount) {
            revert ExceedsMaxLoanAmount();
        }

        if (_amount > totalFunds) {
            revert InsufficientFunds();
        }

        uint256 loanId = nextLoanId++;

        // Complete all state changes before external call (CEI pattern)
        loans[loanId] = Loan({
            borrower: msg.sender,
            amount: _amount,
            interestRate: poolConfig.interestRate,
            startTime: block.timestamp,
            duration: poolConfig.loanDuration,
            isRepaid: false,
            status: LoanStatus.Disbursed
        });

        totalFunds -= _amount;
        activeLoanId[msg.sender] = loanId;

        // Emit event before external call
        emit LoanCreated(loanId, msg.sender, _amount);

        // Transfer funds to borrower (external call moved to end)
        (bool success, ) = payable(msg.sender).call{value: _amount}("");
        if (!success) revert TransferFailed();

        return loanId;
    }

    /**
     * @notice Turn owner approval on or off for this pool
     * @param _requiresApproval Whether borrowing should need a decision
     * @dev Off by default, which is how every pool created before this behaved.
     * Turning it on does not touch loans already outstanding, and turning it off
     * leaves any pending request pending — the owner still has to decide, since
     * the funds were never reserved.
     */
    function setRequiresApproval(bool _requiresApproval) external onlyOwner {
        poolConfig.requiresApproval = _requiresApproval;

        emit ApprovalRequirementChanged(_requiresApproval);
    }

    /**
     * @notice Ask to borrow, for the pool owner to decide on
     * @param _amount Loan amount requested
     * @return loanId The ID of the request
     * @dev Every check `createLoan` makes runs here except the liquidity one:
     * a request reserves nothing, so what matters is whether the pool can cover
     * it at the moment of approval, which is where it is checked. Requesting
     * against an empty pool is allowed on purpose — members can fund it while
     * the request sits.
     *
     * The request takes the borrower's `activeLoanId` slot, so a member has one
     * open request *or* one open loan, never both. `cancelLoanRequest` is what
     * frees them if the owner never decides.
     */
    function requestLoan(
        uint256 _amount
    ) external whenNotPaused nonReentrant returns (uint256) {
        if (!poolConfig.isActive) revert PoolNotActive();

        if (contributions[msg.sender] == 0) revert UnauthorizedBorrower();

        if (activeLoanId[msg.sender] != 0) revert LoanOutstanding();

        if (_amount == 0) revert InvalidAmount();

        if (_amount > poolConfig.maxLoanAmount) revert ExceedsMaxLoanAmount();

        uint256 loanId = nextLoanId++;

        loans[loanId] = Loan({
            borrower: msg.sender,
            amount: _amount,
            interestRate: poolConfig.interestRate,
            // Stamped again on approval: the term should run from when the
            // money actually arrives, not from when it was asked for.
            startTime: block.timestamp,
            duration: poolConfig.loanDuration,
            isRepaid: false,
            status: LoanStatus.Requested
        });

        activeLoanId[msg.sender] = loanId;

        emit LoanRequested(loanId, msg.sender, _amount);

        return loanId;
    }

    /**
     * @notice Approve a pending request and disburse it
     * @param _loanId The request to approve
     * @dev Only the pool owner. Liquidity is checked here rather than at request
     * time because that is when the funds actually move — a pool that was empty
     * when asked may be fundable by now, and one that was full may not be.
     */
    function approveLoan(
        uint256 _loanId
    ) external onlyOwner whenNotPaused nonReentrant {
        Loan storage loan = loans[_loanId];

        if (loan.status != LoanStatus.Requested) revert LoanNotPending();

        uint256 amount = loan.amount;
        if (amount > totalFunds) revert InsufficientFunds();

        address borrower = loan.borrower;

        // Complete all state changes before the external call (CEI pattern)
        loan.status = LoanStatus.Disbursed;
        loan.startTime = block.timestamp;
        totalFunds -= amount;

        emit LoanApproved(_loanId, borrower, amount);

        (bool success, ) = payable(borrower).call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    /**
     * @notice Turn down a pending request
     * @param _loanId The request to reject
     * @dev Only the pool owner. Nothing moves — a request never held funds — so
     * this only frees the borrower to ask again.
     */
    function rejectLoan(uint256 _loanId) external onlyOwner whenNotPaused {
        Loan storage loan = loans[_loanId];

        if (loan.status != LoanStatus.Requested) revert LoanNotPending();

        loan.status = LoanStatus.Rejected;
        delete activeLoanId[loan.borrower];

        emit LoanRejected(_loanId, loan.borrower, loan.amount);
    }

    /**
     * @notice Withdraw your own pending request
     * @param _loanId The request to cancel
     * @dev Without this a borrower whose owner never decides is stuck: the
     * request holds their `activeLoanId`, so they can neither borrow nor ask
     * again. Emits the same event as a rejection — the outcome is identical and
     * the record only tracks the state, not who ended it.
     */
    function cancelLoanRequest(uint256 _loanId) external whenNotPaused {
        Loan storage loan = loans[_loanId];

        if (loan.borrower != msg.sender) revert UnauthorizedBorrower();

        if (loan.status != LoanStatus.Requested) revert LoanNotPending();

        loan.status = LoanStatus.Rejected;
        delete activeLoanId[msg.sender];

        emit LoanRejected(_loanId, msg.sender, loan.amount);
    }

    /**
     * @notice Repay a loan with interest
     * @param _loanId The ID of the loan to repay
     */
    function repayLoan(
        uint256 _loanId
    ) external payable whenNotPaused nonReentrant {
        Loan storage loan = loans[_loanId];

        if (loan.borrower != msg.sender) {
            revert UnauthorizedBorrower();
        }

        if (loan.isRepaid) {
            revert LoanAlreadyRepaid();
        }

        uint256 interest = Math.mulDiv(loan.amount, loan.interestRate, 10000);
        uint256 totalRepayment = loan.amount + interest;

        if (msg.value < totalRepayment) revert InsufficientRepaymentAmount();

        // Complete all state changes before external call (CEI pattern)
        loan.isRepaid = true;
        totalFunds += totalRepayment;
        // Only clears the lock if this is the tracked loan. A pool upgraded to
        // v2 can hold loans created before `activeLoanId` existed; repaying one
        // of those must not release a lock taken by a newer loan.
        if (activeLoanId[msg.sender] == _loanId) {
            delete activeLoanId[msg.sender];
        }

        // Emit event before external call
        emit LoanRepaid(_loanId, msg.sender, totalRepayment);

        // Store refund amount for external call
        uint256 refundAmount = msg.value > totalRepayment ? msg.value - totalRepayment : 0;

        // Refund any excess payment (external call moved to end)
        if (refundAmount > 0) {
            (bool success, ) = payable(msg.sender).call{value: refundAmount}("");
            if (!success) revert RefundFailed();
        }
    }

    /**
     * @notice Update pool configuration (only owner)
     * @param _maxLoanAmount New maximum loan amount
     * @param _interestRate New interest rate
     * @param _loanDuration New loan duration
     */
    function updatePoolConfig(
        uint256 _maxLoanAmount,
        uint256 _interestRate,
        uint256 _loanDuration
    ) external onlyOwner {
        poolConfig.maxLoanAmount = _maxLoanAmount;
        poolConfig.interestRate = _interestRate;
        poolConfig.loanDuration = _loanDuration;

        emit PoolConfigured(_maxLoanAmount, _interestRate, _loanDuration);
    }

    /**
     * @notice Toggle pool active status (only owner)
     */
    function togglePoolStatus() external onlyOwner {
        poolConfig.isActive = !poolConfig.isActive;
    }

    /**
     * @notice Pause the contract (only owner)
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause the contract (only owner)
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Get loan details
     * @param _loanId The loan ID to query
     * @return Loan details
     */
    function getLoan(uint256 _loanId) external view returns (Loan memory) {
        return loans[_loanId];
    }

    /**
     * @notice Calculate loan repayment amount
     * @param _loanId The loan ID to calculate for
     * @return Total repayment amount including interest
     */
    function calculateRepaymentAmount(
        uint256 _loanId
    ) external view returns (uint256) {
        Loan storage loan = loans[_loanId];
        if (loan.amount == 0) return 0;

        uint256 interest = Math.mulDiv(loan.amount, loan.interestRate, 10000);
        return loan.amount + interest;
    }

    /**
     * @notice Get contract version for upgrades
     * @return version Version string of the contract
     */
    function version() external pure returns (string memory) {
        return "2.0.0";
    }
}
