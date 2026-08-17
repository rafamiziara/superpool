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
 * @title LendingPool
 * @notice One SuperPool lending pool: members contribute, borrow against the
 * pool's liquidity, repay with interest, and claim their share of it.
 * @author SuperPool Team
 * @dev The implementation every pool proxy delegates to:
 * - Upgraded as a set through the factory's beacon, not per instance
 * - Access control with ownership
 * - Pausable functionality for emergency stops
 * - Reentrancy protection
 */
contract LendingPool is
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
        /**
         * @dev Whether joining needs the pool owner's approval. Off leaves the
         * pool open to anyone, which is what every pool did before this
         * existed; on makes it the private trust circle the product is about.
         */
        bool requiresMembership;
    }

    /**
     * @notice Where an address stands with this pool
     * @dev `None` is deliberately zero: an address nobody has heard of has no
     * membership, so the default value is also the correct one. (Contrast
     * `LoanStatus.Disbursed`, which sits at zero only because it was retrofitted
     * onto pools that already held loans.)
     *
     * `Rejected`, `Removed` and `Left` are kept apart rather than collapsed into
     * `None` because they are decisions, and a decision that reads as "never
     * heard of them" would be silently undone by the auto-enrol path in an open
     * pool.
     */
    enum Membership {
        None,
        Requested,
        Active,
        Rejected,
        Removed,
        Left
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

    // The gas hint reads the 2 bytes left over in the first slot as waste, but
    // there is no rearrangement that removes them: everything else here is a
    // full word. Packing `repaidAt` in was the cheap option, not the costly one.
    // solhint-disable-next-line gas-struct-packing
    struct Loan {
        address borrower;         // 20 bytes
        bool isRepaid;           // 1 byte - fits in same slot (21 bytes total)
        LoanStatus status;       // 1 byte - packs into the same slot (22 bytes)
        /**
         * @dev When the loan was repaid, or 0 while it is not. Declared here
         * rather than at the end of the struct so it lands in the 10 bytes left
         * over in the first slot: the struct still spans five slots, so nothing
         * that already holds a `Loan` reads differently, and `repayLoan` writes
         * it in the same `SSTORE` that sets `isRepaid`.
         *
         * `uint64` for the same reason — it is what fits, and it dates
         * repayments until the year 2554. Everything else in the app treats
         * timestamps as `uint256`, so this is the one place that narrows.
         *
         * 0 is "not repaid" and also, on a loan repaid before this field
         * existed, "repaid, date unknown" — which is why `isRepaid` stays the
         * authority on *whether* and this only answers *when*.
         */
        uint64 repaidAt;         // 8 bytes - packs into the same slot (30 bytes)
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

    /**
     * @notice Where each address stands with this pool
     * @dev Written on every deposit, whether or not the pool is permissioned:
     * an open pool enrols a first-time depositor rather than leaving them
     * unrecorded. That is what keeps this mapping the single answer to "is this
     * address a member" in both modes — the app derives balances from events,
     * but never membership — and it is why an owner can turn
     * `requiresMembership` on later without stranding anyone who already
     * deposited.
     */
    mapping(address => Membership) public membership;

    /**
     * @notice How many addresses are currently `Active`
     * @dev A counter rather than an array: nothing on chain needs to enumerate
     * members, and the app builds its list from the events. Decremented on
     * `removeMember` and `leavePool`, so it tracks current members rather than
     * everyone who was ever admitted.
     */
    uint256 public memberCount;

    /**
     * @notice Interest accrued per unit of contribution since the pool began,
     * scaled by `PRECISION`
     * @dev Appended in v3, together with the three slots below. This is the
     * accumulator half of the standard "distribute to an unbounded set without
     * looping" pattern: repayments raise one number, and each member's share is
     * read off it on demand. The pool keeps no member array to walk (see
     * `memberCount`), and adding one would make every repayment cost gas
     * proportional to the membership.
     *
     * Only ever increases.
     */
    uint256 public accInterestPerShare;

    /**
     * @notice Sum of every member's outstanding contribution
     * @dev **Not `totalFunds`.** `totalFunds` falls when money is lent out —
     * which is precisely when interest is being earned — so dividing a
     * repayment's interest by it would pay a wildly inflated rate on any pool
     * with a loan outstanding. This is the denominator, and it changes only in
     * `depositFunds` and `withdraw`.
     *
     * There is nothing to reconcile it against: it is maintained, not derived,
     * and summing the `contributions` mapping is impossible on chain. A pool
     * upgraded from v2 while already holding deposits would start this at zero
     * and under-count for ever — which is survivable only because no pool
     * exists outside a disposable local chain yet.
     */
    uint256 public totalContributions;

    /**
     * @notice What each member had already accrued when their stake last changed
     * @dev The other half of the accumulator pattern, and the part that is easy
     * to leave out: without it, a deposit made after a repayment would earn a
     * share of that repayment. Restamped to `contributions * accInterestPerShare`
     * every time the stake moves, so the difference against the accumulator is
     * always exactly what accrued while the current stake was in place.
     */
    mapping(address => uint256) public interestDebt;

    /// @notice Interest credited to a member and not yet taken out
    mapping(address => uint256) public unclaimedInterest;

    /**
     * @dev Fixed-point scale for `accInterestPerShare`. Interest divided by the
     * pool's total contributions is otherwise zero in integer arithmetic for
     * any realistic pool.
     */
    uint256 private constant PRECISION = 1e18;

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
    /**
     * @notice Emitted when someone asks to join a permissioned pool
     * @param account Address of the applicant
     * @dev Every membership event carries the address alone, and indexed, so
     * they all decode the same way as `FundsDeposited` and `FundsWithdrawn`:
     * `data` is empty and the field comes from the topics.
     */
    event MembershipRequested(address indexed account);
    /**
     * @notice Emitted when the pool owner admits an applicant
     * @param account Address that is now a member
     */
    event MembershipApproved(address indexed account);
    /**
     * @notice Emitted when the pool owner turns an applicant down
     * @param account Address that was turned down
     */
    event MembershipRejected(address indexed account);
    /**
     * @notice Emitted when the pool owner removes a member
     * @param account Address that is no longer a member
     */
    event MembershipRevoked(address indexed account);
    /**
     * @notice Emitted when a member leaves of their own accord
     * @param account Address that left
     */
    event MembershipLeft(address indexed account);
    /**
     * @notice Emitted when depositing into an open pool enrols the depositor
     * @param account Address that became a member by funding the pool
     * @dev Kept distinct from `MembershipApproved` so the activity feed can tell
     * "the owner let them in" from "they joined by putting money in", even
     * though both land on `Active`.
     */
    event MemberJoined(address indexed account);
    /**
     * @notice Emitted when the pool owner opens or closes membership
     * @param requiresMembership Whether joining now needs approval
     */
    event MembershipRequirementChanged(bool indexed requiresMembership);
    /**
     * @notice Emitted when a repayment's interest is shared out to contributors
     * @param loanId The loan whose repayment produced the interest
     * @param amount The interest distributed, in wei
     * @dev Both parameters indexed, like every other event here: `data` is
     * empty and everything comes from the topics. Not emitted when the pool has
     * no contributions to share against — see `repayLoan`.
     */
    event InterestDistributed(uint256 indexed loanId, uint256 indexed amount);
    /**
     * @notice Emitted when an account takes its earned interest out
     * @param account Address that claimed
     * @param amount Amount paid out, in wei
     * @dev Shaped like `FundsWithdrawn` on purpose: both parameters indexed,
     * so the two decode the same way off chain.
     */
    event InterestClaimed(address indexed account, uint256 indexed amount);

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
    /// @dev The caller is not an `Active` member of a pool that requires one.
    error NotAMember();
    /// @dev Asking to join when already `Active` or already `Requested`.
    error AlreadyMember();
    /// @dev Deciding on an address that has not asked to join.
    error NoPendingRequest();
    /// @dev Claiming interest when none has accrued.
    error NothingToClaim();

    /**
     * @notice Initialize the contract (replaces constructor for upgradeable contracts)
     * @dev Initialize the contract (replaces constructor for upgradeable contracts)
     * @param _owner Initial owner of the contract
     * @param _maxLoanAmount Maximum loan amount allowed
     * @param _interestRate Interest rate (in basis points, e.g., 500 = 5%)
     * @param _loanDuration Loan duration in seconds
     * @param _requiresMembership Whether the owner admits members, or the pool
     * is open to anyone who funds it
     */
    function initialize(
        address _owner,
        uint256 _maxLoanAmount,
        uint256 _interestRate,
        uint256 _loanDuration,
        bool _requiresMembership
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
            requiresApproval: false,
            // The creator's choice, unlike `requiresApproval` above: a pool is
            // private or open from birth, and the owner can still change its
            // mind later through `setRequiresMembership`. The register is
            // written either way.
            requiresMembership: _requiresMembership
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

        if (poolConfig.requiresMembership) {
            if (membership[msg.sender] != Membership.Active) revert NotAMember();
        } else if (
            membership[msg.sender] == Membership.None ||
            membership[msg.sender] == Membership.Left
        ) {
            // An open pool enrols whoever funds it, which is the definition of
            // membership the app has always used — now recorded rather than
            // inferred. `Rejected` and `Removed` are deliberately absent from
            // this list: an owner's decision to keep someone out should survive
            // the gate being off, or turning it back on would silently readmit
            // them.
            _grantMembership(msg.sender);
            emit MemberJoined(msg.sender);
        }

        // Credit whatever the existing stake has earned before the stake
        // changes, then restamp against the new one — otherwise this deposit
        // would retroactively earn a share of every past repayment.
        _settle(msg.sender);

        totalFunds += msg.value;
        contributions[msg.sender] += msg.value;
        totalContributions += msg.value;

        _restampDebt(msg.sender);

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
     * Interest is *not* part of this. It is credited separately, through
     * `accInterestPerShare`, and taken out with `claimInterest` — so taking a
     * contribution back leaves everything it earned while it was in the pool
     * still claimable.
     *
     * **This is never gated on membership, and must not become so.** Removing a
     * member takes away what they may do next, not what they already put in;
     * gating here would let an owner strand someone else's money.
     */
    function withdraw(
        uint256 _amount
    ) external whenNotPaused nonReentrant {
        if (_amount == 0) revert InvalidAmount();
        if (activeLoanId[msg.sender] != 0) revert LoanOutstanding();

        uint256 balance = contributions[msg.sender];
        if (_amount > balance) revert InsufficientBalance();
        if (_amount > totalFunds) revert InsufficientLiquidity();

        // Bank what this stake has earned before shrinking it, or the accrual
        // leaves with the principal.
        _settle(msg.sender);

        // Complete all state changes before external call (CEI pattern)
        contributions[msg.sender] = balance - _amount;
        totalContributions -= _amount;
        totalFunds -= _amount;

        _restampDebt(msg.sender);

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
     * @notice Interest an account has earned and not yet taken out
     * @param _account Address to query
     * @return Credited interest plus whatever has accrued since it was last settled
     * @dev Deliberately **not** capped by free liquidity, unlike
     * `withdrawableAmount`. This is what the account has earned, and an
     * outstanding loan should not make a dashboard's earnings figure drop.
     * `claimInterest` applies the liquidity bound at payout time.
     */
    function claimable(address _account) external view returns (uint256) {
        return
            unclaimedInterest[_account] +
            (_accruedInterest(_account) - interestDebt[_account]);
    }

    /**
     * @notice Take out the interest you have earned
     * @dev Paid out of `totalFunds`, the same pot and the same
     * first-come-first-served rule `withdraw` uses. An outstanding loan
     * therefore delays a claim rather than failing it permanently, and a claim
     * the pool cannot cover in full is refused outright rather than paid
     * partially — a silent partial payment reads as a successful claim in every
     * UI.
     *
     * Gated on neither membership nor an outstanding loan, unlike `withdraw`.
     * Interest is earned money rather than the stake that borrowing locks, and
     * it is owed for the same reason a removed member's contribution is: it was
     * earned while the money was in the pool.
     */
    function claimInterest() external whenNotPaused nonReentrant {
        _settle(msg.sender);

        uint256 amount = unclaimedInterest[msg.sender];
        if (amount == 0) revert NothingToClaim();
        if (amount > totalFunds) revert InsufficientLiquidity();

        // Complete all state changes before external call (CEI pattern)
        unclaimedInterest[msg.sender] = 0;
        totalFunds -= amount;

        // Emit event before external call
        emit InterestClaimed(msg.sender, amount);

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    /**
     * @dev Moves everything the account's current stake has accrued into
     * `unclaimedInterest`. Must run *before* any change to `contributions`,
     * with `_restampDebt` after it — settling alone leaves the debt stamped
     * against a stake that no longer exists.
     *
     * Idempotent, and the subtraction cannot underflow: `interestDebt` is only
     * ever written as `_accruedInterest` at some earlier accumulator value, and
     * `accInterestPerShare` only grows.
     */
    function _settle(address _account) private {
        uint256 accrued = _accruedInterest(_account);

        unclaimedInterest[_account] += accrued - interestDebt[_account];
        interestDebt[_account] = accrued;
    }

    /// @dev Re-anchors an account after its stake changed. See `_settle`.
    function _restampDebt(address _account) private {
        interestDebt[_account] = _accruedInterest(_account);
    }

    /// @dev Lifetime interest owed to the account's *current* stake.
    function _accruedInterest(
        address _account
    ) private view returns (uint256) {
        return
            Math.mulDiv(
                contributions[_account],
                accInterestPerShare,
                PRECISION
            );
    }

    /**
     * @notice Create a new loan
     * @param _amount Loan amount requested
     * @return loanId The ID of the created loan
     * @dev Borrowing is restricted to `Active` members. This used to mean "has
     * a non-zero contribution", which was only ever a proxy for membership
     * while there was no register to ask; now there is one, and a member the
     * owner admitted can borrow without having lent first — which is the
     * micro-lending model the product is about, rather than a loosening.
     *
     * Two limits still back it up: one open loan per borrower, which caps a
     * single borrower's exposure at the owner's configured `maxLoanAmount`; and
     * a lock on the borrower's contribution until they repay, so a member
     * cannot borrow and then withdraw their stake. Note the contribution is
     * *not* collateral — it does not bound the loan and is not seized on
     * default.
     */
    function createLoan(
        uint256 _amount
    ) external whenNotPaused nonReentrant returns (uint256) {
        if (!poolConfig.isActive) revert PoolNotActive();

        // A pool that reviews requests must not have a side door that skips the
        // review. The app routes to `requestLoan` on this error.
        if (poolConfig.requiresApproval) revert ApprovalRequired();

        if (membership[msg.sender] != Membership.Active) {
            revert UnauthorizedBorrower();
        }

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
            repaidAt: 0,
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
     * @notice Open or close membership (only owner)
     * @param _requiresMembership Whether joining now needs the owner's approval
     * @dev Turning this on strands nobody: every address that has deposited is
     * already `Active`, because the register is written in both modes. Turning
     * it off does not clear anyone's status either, so a `Removed` address
     * stays out.
     */
    function setRequiresMembership(
        bool _requiresMembership
    ) external onlyOwner {
        poolConfig.requiresMembership = _requiresMembership;

        emit MembershipRequirementChanged(_requiresMembership);
    }

    /**
     * @notice Ask to join this pool, for the owner to decide on
     * @dev Open to anyone, including on a pool that is not currently
     * permissioned — an owner may be about to close it, and a request that has
     * to wait for that is worse than one that sits harmlessly.
     *
     * A previously rejected or removed address may ask again. The owner turned
     * them down once and can do so again; making rejection permanent would need
     * a separate ban, and nothing in the product asks for one.
     */
    function requestMembership() external whenNotPaused {
        if (!poolConfig.isActive) revert PoolNotActive();

        Membership current = membership[msg.sender];
        if (
            current == Membership.Active || current == Membership.Requested
        ) revert AlreadyMember();

        membership[msg.sender] = Membership.Requested;

        emit MembershipRequested(msg.sender);
    }

    /**
     * @notice Admit an applicant (only owner)
     * @param _account The address to admit
     */
    function approveMember(address _account) external onlyOwner whenNotPaused {
        if (membership[_account] != Membership.Requested) {
            revert NoPendingRequest();
        }

        _grantMembership(_account);

        emit MembershipApproved(_account);
    }

    /**
     * @notice Turn an applicant down (only owner)
     * @param _account The address to turn down
     * @dev Nothing moves; the applicant never held anything. They are free to
     * ask again.
     */
    function rejectMember(address _account) external onlyOwner whenNotPaused {
        if (membership[_account] != Membership.Requested) {
            revert NoPendingRequest();
        }

        membership[_account] = Membership.Rejected;

        emit MembershipRejected(_account);
    }

    /**
     * @notice Remove a member (only owner)
     * @param _account The member to remove
     * @dev Takes away what they may do next — depositing and borrowing — and
     * nothing else. Their contribution is untouched and remains withdrawable in
     * full; see `withdraw`. An outstanding loan also survives, and stays
     * repayable, because `repayLoan` asks only who the borrower is.
     *
     * Nothing is settled here on purpose: removal does not touch
     * `contributions`, so the accumulator keeps crediting a stake that is still
     * funding the pool's loans, and `claimInterest` is ungated for the same
     * reason `withdraw` is. Someone who wants out entirely withdraws.
     */
    function removeMember(address _account) external onlyOwner whenNotPaused {
        if (membership[_account] != Membership.Active) revert NotAMember();

        membership[_account] = Membership.Removed;
        --memberCount;

        emit MembershipRevoked(_account);
    }

    /**
     * @notice Leave this pool
     * @dev The member's own counterpart to `removeMember`, and with the same
     * consequences: their balance stays withdrawable and any loan stays
     * repayable. Leaving with money still in the pool is allowed on purpose —
     * requiring a withdrawal first would trap anyone whose funds are currently
     * lent out.
     */
    function leavePool() external whenNotPaused {
        if (membership[msg.sender] != Membership.Active) revert NotAMember();

        membership[msg.sender] = Membership.Left;
        --memberCount;

        emit MembershipLeft(msg.sender);
    }

    /**
     * @dev The one place `Active` is written, so `memberCount` cannot drift
     * from the mapping.
     */
    function _grantMembership(address _account) private {
        membership[_account] = Membership.Active;
        ++memberCount;
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

        if (membership[msg.sender] != Membership.Active) {
            revert UnauthorizedBorrower();
        }

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
            repaidAt: 0,
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
     * @dev The interest is shared out to contributors here, at the moment it
     * arrives, rather than being credited to whoever happens to be a member
     * later. A pool with no contributions left at all — every member having
     * withdrawn while the loan was out — has no one to share it with, and the
     * interest stays in the contract as it did before distribution existed.
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
        // Free, in the sense that matters: same slot as `isRepaid`, so this is
        // the same write. It is also the only record that a repayment happened
        // at a particular moment — `LoanRepaid` carries no timestamp, and a log
        // is not something a later reader can ask the chain for by loan id.
        loan.repaidAt = uint64(block.timestamp);
        totalFunds += totalRepayment;

        // Share the interest out across the contributions standing behind the
        // loan. The denominator is `totalContributions`, never `totalFunds` —
        // the latter is missing exactly the money that was lent out.
        if (interest > 0 && totalContributions > 0) {
            accInterestPerShare += Math.mulDiv(
                interest,
                PRECISION,
                totalContributions
            );

            emit InterestDistributed(_loanId, interest);
        }

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
