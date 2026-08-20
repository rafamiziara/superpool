// SPDX-License-Identifier: MIT
pragma solidity ^0.8.36;

import {
    Ownable2StepUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {
    PausableUpgradeable
} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

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
    Ownable2StepUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardTransient
{
    using SafeERC20 for IERC20;

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
        /**
         * @dev What this pool lends, and the only thing it will accept.
         *
         * **`address(0)` means native POL**, which is the zero value — so every
         * pool created before this field existed stays native with no migration
         * and no flag day. The same retrofit the codebase already relies on
         * twice: `LoanStatus.Disbursed` is ordinal 0 because every pre-existing
         * loan was disbursed, and `requiresApproval` reads `false` because that
         * was the old behaviour. A field that did not exist should read as the
         * world before it.
         *
         * Chosen at creation and never changed. A pool is a group of people
         * lending each other one thing; re-denominating it mid-life would
         * reinterpret every `contributions` entry and every outstanding loan as
         * a quantity of something else. `updatePoolConfig` deliberately does not
         * touch it.
         *
         * Packs into the three bools' slot: 3 bytes used, 20 more here, so the
         * struct still spans slots 0–3 and `totalFunds` does not move. That is
         * why there was no storage deadline on this change.
         */
        address loanToken;
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
        Rejected,
        /**
         * @dev Declared past a loan's term and not paid, by the pool's owner.
         *
         * **Appended**, which is the only safe place for it: the three above
         * keep their ordinals, so no stored loan is relabelled. `Disbursed`
         * staying at zero is what the retrofit above depends on.
         *
         * A label on a debt that is still owed, not an ending. The money is
         * still due, interest still accrues on it, `repayLoan` still takes it
         * and the borrower's `activeLoanId` is still held — see
         * `markDefaulted`. Nothing is seized, because there is no collateral
         * in this project to seize.
         */
        Defaulted
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
        /**
         * @dev How much of `amount + interest` has been handed back so far.
         *
         * **Appended**, unlike `repaidAt`, and safely so: `loans` is a mapping,
         * so each entry sits at its own `keccak256(loanId . slot)` and widening
         * the struct from five words to six extends every entry into a word
         * that was previously unallocated rather than shifting any field that
         * already exists. A loan written before this field reads 0 here, which
         * is the correct answer for one that was never partly paid and — read
         * beside `isRepaid` — for one that was settled in full.
         *
         * `isRepaid` stays the authority on whether the debt is closed. This
         * says how far along it is, and the two are only redundant at the ends.
         *
         * A running total of everything handed back, principal and interest
         * together. It is what the app displays; the split that decides what is
         * still owed is `principalOutstanding` and `interestOutstanding`.
         */
        uint256 amountRepaid;    // 32 bytes - new slot
        /**
         * @dev Principal not yet returned. Starts at `amount`.
         *
         * The base interest accrues on, which is why it is tracked rather than
         * derived from `amountRepaid`: a payment is split between interest and
         * principal, so the two cannot be recovered from their sum.
         *
         * Paying this down is what makes future interest cheaper — the whole
         * point of accrual, and the thing a flat rate could not express.
         */
        uint256 principalOutstanding;  // 32 bytes - new slot
        /**
         * @dev Interest accrued and not yet paid, **as of `accruedAt`**.
         *
         * A snapshot, not a live figure: it is brought up to date by `_accrue`
         * before anything reads or changes it. Anything asking what is owed
         * *now* must project it forward — `loanBalance` and
         * `outstandingBalanceAt` do, and are the only honest answers.
         *
         * `uint192` because it shares this slot with `accruedAt`, and written
         * through `SafeCast` so an impossible figure reverts rather than
         * silently wrapping. 2^192 wei is more interest than any pool can hold.
         */
        uint192 interestOutstanding;   // 24 bytes - new slot
        /**
         * @dev When `interestOutstanding` was last brought up to date.
         *
         * **Zero means the loan predates accrual**, and is the flag `_accrue`
         * converts on. It is never zero on a loan created since: `createLoan`,
         * `requestLoan` and `approveLoan` all stamp it, so a real loan always
         * carries a real timestamp.
         */
        uint64 accruedAt;        // 8 bytes - packs into the same slot (32 bytes)
        /**
         * @dev When the owner declared this loan defaulted, or 0 if they never
         * did.
         *
         * **A seventh word, appended**, on the same reasoning that made
         * `amountRepaid` free: `loans` is a mapping, so each entry hashes to
         * its own base slot and widening the struct extends into a word that
         * was never allocated. Nothing above it moves, and a loan written
         * before this reads 0 — "not defaulted", which every one of them was.
         *
         * It leaves 24 bytes of this slot unused, and there is nowhere to pack
         * it: the first slot has 2 bytes left and the `interestOutstanding`
         * slot is full. Narrowing either to make room would be a restructure
         * rather than an append, and would relabel loans that already exist.
         *
         * On chain rather than left to the `LoanDefaulted` log for exactly the
         * reason `repaidAt` is: the indexer reads state, not logs, so that a
         * re-scan is harmless — and a log is not something a later reader can
         * ask the chain for by loan id. Without this, a loan first seen after
         * it defaulted could say *that* it had but never *when*.
         *
         * `uint64` like `repaidAt`, and read beside `status`: this answers
         * *when*, `status` stays the authority on *whether*.
         */
        uint64 defaultedAt;      // 8 bytes - new slot
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
     *
     * The pool's owner is `Active` from the moment they own it, deposit or no
     * deposit; see `_transferOwnership`.
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
     * @notice How long past its term a loan is left alone before the owner may
     * declare it defaulted, in seconds
     * @dev Appended in v4, and **zero by default** — the same retrofit as
     * `LoanStatus.Disbursed` being ordinal zero and `requiresApproval` being
     * false: a pool that predates this reads 0, which means the owner may act
     * the moment the term lapses. That is the behaviour of a pool that has
     * never been told otherwise, so nothing has to be migrated or backfilled.
     *
     * It exists so an owner can make a promise their members can check —
     * "nobody is called a defaulter for the first thirty days" — rather than
     * having to be trusted to wait. It bounds the *owner*, not the borrower:
     * interest has been accruing since the due date either way, and lengthening
     * it costs the borrower nothing.
     *
     * Read from the chain, never from an indexed pool record. Like
     * `requiresMembership` and `requiresApproval`, the owner can change it at
     * any moment and nothing indexes it.
     */
    uint256 public defaultGracePeriod;

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
     * @notice Emitted when a loan is repaid in full and the debt is closed
     * @param loanId Unique identifier of the repaid loan
     * @param borrower Address of the borrower who repaid the loan
     * @param amount Total amount repaid (principal + interest)
     * @dev Still means exactly what it always did — the loan is settled — which
     * is why partial payments got an event of their own rather than being
     * folded into this one. Everything downstream that reads this as "the debt
     * is over" stays correct, and `amount` is the whole of it however many
     * transactions it arrived in.
     */
    event LoanRepaid(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 indexed amount
    );
    /**
     * @notice Emitted on every payment towards a loan, part or whole
     * @param loanId Unique identifier of the loan being paid down
     * @param borrower Address of the borrower making the payment
     * @param amount What this payment credited, in wei, after any refund
     * @dev The settling payment emits this *and* `LoanRepaid`: the first says
     * money moved, the second says the debt is closed, and they are different
     * facts the moment a loan can be paid in instalments.
     *
     * This is the only record that a particular payment happened at a
     * particular moment. `Loan.amountRepaid` is a running total and
     * `Loan.repaidAt` only dates the last one, so a feed that wants to show
     * instalments has to index these logs — as it already does for deposits and
     * withdrawals, which are events for the same reason.
     *
     * Three indexed parameters, `data` empty, like every other event here.
     */
    event LoanRepaymentMade(
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
     * @notice Emitted when someone becomes a member without anybody deciding
     * @param account Address that became a member
     * @dev Two ways in: depositing into an open pool, and taking ownership of a
     * pool — which includes creating one, so a pool's first log is its owner
     * joining it.
     *
     * Kept distinct from `MembershipApproved` so the activity feed can tell "the
     * owner let them in" from "they joined without being let in", even though
     * both land on `Active`. Nothing notifies on this one for the same reason.
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
    /**
     * @notice Emitted when the owner declares a loan defaulted
     * @param loanId The loan declared
     * @param borrower Whose debt it is
     * @param outstanding What was still owed at that moment, in wei
     * @dev Three indexed parameters and empty `data`, like every other event
     * here, so it decodes from topics alone.
     *
     * `outstanding` is taken after accrual, so it is the debt as of this block
     * rather than as of the last payment. It is a record of the moment, not a
     * figure anything should keep: interest goes on accruing afterwards, so
     * what is owed only grows from here.
     */
    event LoanDefaulted(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 indexed outstanding
    );
    /**
     * @notice Emitted when the owner changes how long they will wait before
     * declaring a loan defaulted
     * @param gracePeriod The new period, in seconds past a loan's term
     * @dev Nothing indexes this — like `ApprovalRequirementChanged`, the pool
     * document carries no such field and every screen that cares reads the
     * chain. It exists so the change is on the public record.
     */
    event DefaultGracePeriodChanged(uint256 indexed gracePeriod);
    /**
     * @notice Emitted when the pool owner opens or closes the pool
     * @param isActive Whether the pool now takes new loans and applications
     * @dev The **pool's own** flag, not the factory registry's — see
     * `togglePoolStatus` for why confusing the two matters. Indexed and `data`
     * empty, like every other event here.
     */
    event PoolStatusChanged(bool indexed isActive);

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
    error TransferFailed();
    error RefundFailed();
    error InvalidImplementation();
    /// @dev `createLoan` on a pool whose owner reviews requests; use `requestLoan`.
    error ApprovalRequired();
    /// @dev The loan is not awaiting a decision — already approved, or rejected.
    error LoanNotPending();
    /**
     * @dev Paying towards a loan that never paid out.
     *
     * A request and a refused request both have a borrower and read
     * `isRepaid == false`, so the two checks `repayLoan` used to make let
     * either through: the money was taken, the request was marked settled, and
     * nothing had ever been lent. Nothing in the app routes there — the repay
     * panel is fed by `activeLoanFor`, which is disbursed-only — but the
     * contract is what has to refuse it.
     */
    error LoanNotDisbursed();
    /// @dev The caller is not an `Active` member of a pool that requires one.
    error NotAMember();
    /// @dev Asking to join when already `Active` or already `Requested`.
    error AlreadyMember();
    /// @dev Deciding on an address that has not asked to join.
    error NoPendingRequest();
    /// @dev Claiming interest when none has accrued.
    error NothingToClaim();
    /// @dev A rate above 100%, which `PoolFactory` refuses at creation too.
    error InvalidInterestRate();
    /// @dev A zero term. It is the denominator interest accrues over.
    error InvalidLoanDuration();
    /**
     * @dev Declaring a default before the term plus the grace period is up.
     *
     * The one thing that stops `markDefaulted` from being an owner's opinion.
     * A loan inside its term is not late, and a loan inside the grace period is
     * late on terms the owner published in advance.
     */
    error LoanNotOverdue();
    /// @dev Declaring a default on a loan already carrying one. Nothing to add.
    error LoanAlreadyDefaulted();
    /**
     * @dev Removing the owner from their own pool, or the owner leaving it.
     *
     * The owner is `Active` by construction — see `_transferOwnership` — and a
     * permissioned pool only lets an `Active` address deposit. Letting the
     * membership go would lock the owner out of funding their own pool with no
     * way back other than approving themselves.
     */
    error OwnerIsAlwaysAMember();
    /**
     * @dev Sending native value to a pool denominated in a token.
     *
     * Thrown by the `payable` `depositFunds()` and `repayLoan(uint256)` when
     * `loanToken` is set. The token pool's counterparts take an explicit amount
     * and pull it, so there is no path where value arrives here by accident and
     * is credited as something else.
     */
    error TokenPoolOnly();
    /**
     * @dev Calling a token entry point on a native pool.
     *
     * The mirror of `TokenPoolOnly`, thrown by `depositTokens` and
     * `repayLoanWithTokens`. Both pairs revert rather than one function
     * quietly accepting either: a payable function that also takes an amount
     * has two ways of being told how much, and disagreeing with itself is how a
     * member deposits 100 and is credited 0.
     */
    error NativePoolOnly();
    /**
     * @dev `renounceOwnership`, which a pool does not allow.
     *
     * A pool with no owner can never approve a loan, admit a member, declare a
     * default or be unpaused again. Nothing recovers from it, and the
     * `_transferOwnership` hook below would have to special-case an owner who
     * is nobody. Handing the pool over is `transferOwnership`, which the new
     * owner then has to accept.
     */
    error OwnershipCannotBeRenounced();

    /**
     * @notice Locks the implementation contract against initialization
     * @dev Runs when the *implementation* is deployed, and never through a
     * beacon proxy — constructor code is not part of the runtime bytecode a
     * proxy delegates to, which is why `initialize` exists at all.
     *
     * Without it the implementation sits on chain uninitialized and anyone can
     * call `initialize` on it and own it. No pool's storage is reachable that
     * way, and there is no `delegatecall` here to turn it into one — but an
     * unowned live contract carrying this contract's name is a thing nobody
     * should have to explain, and closing it costs one constructor.
     *
     * @custom:oz-upgrades-unsafe-allow constructor
     */
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract (replaces constructor for upgradeable contracts)
     * @dev Initialize the contract (replaces constructor for upgradeable contracts)
     * @param _owner Initial owner of the contract
     * @param _maxLoanAmount Maximum loan amount allowed
     * @param _interestRate Interest rate (in basis points, e.g., 500 = 5%)
     * @param _loanDuration Loan duration in seconds
     * @param _requiresMembership Whether the owner admits members, or the pool
     * is open to anyone who funds it
     * @param _loanToken The ERC-20 this pool is denominated in, or
     * `address(0)` for native POL. Appended last, like `_requiresMembership`
     * before it, because every caller encodes these positionally.
     */
    function initialize(
        address _owner,
        uint256 _maxLoanAmount,
        uint256 _interestRate,
        uint256 _loanDuration,
        bool _requiresMembership,
        address _loanToken
    ) public initializer {
        __Ownable_init(_owner);
        // Handing a pool over is now two steps: the new owner has to accept.
        // A pool owner is an ordinary person rather than a deployer, the
        // address they type is not checked against anything, and the mistake is
        // irreversible — it takes with it every approval, every membership
        // decision and the pause on other people's money.
        __Ownable2Step_init();
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
            requiresMembership: _requiresMembership,
            // The one setting with no setter. Zero here is native POL, which is
            // what every pool made before this field was one.
            loanToken: _loanToken
        });

        nextLoanId = 1;

        emit PoolConfigured(_maxLoanAmount, _interestRate, _loanDuration);
    }

    /**
     * @notice Deposit native POL into the pool
     * @dev Credits the caller's contribution balance as well as pool liquidity.
     * The two differ once loans are outstanding: `totalFunds` is what the pool
     * can currently lend or return, while the sum of `contributions` is what it
     * owes its members.
     *
     * Native pools only. A pool denominated in a token has
     * `depositTokens` instead, and this refuses rather than accepting
     * POL a token pool has no way to account for.
     */
    function depositFunds() external payable whenNotPaused {
        if (poolConfig.loanToken != address(0)) revert TokenPoolOnly();
        if (msg.value == 0) revert InvalidAmount();

        _deposit(msg.value);
    }

    /**
     * @notice Deposit tokens into a pool denominated in an ERC-20
     * @param _amount How much to deposit, in the token's own units
     * @dev The token counterpart of `depositFunds()`, and a separate function
     * rather than a payable one that also takes an amount — see
     * `NativePoolOnly`. Requires the caller to have approved this pool for at
     * least `_amount` first; that approval is a second transaction, which is
     * why the app treats it as a stage of the deposit rather than an action of
     * its own.
     *
     * **A distinct name rather than an overload of `depositFunds`.** Solidity
     * would happily take a `depositFunds(uint256)` beside the payable one, and
     * the ABI would carry both — but ethers then refuses to resolve
     * `contract.depositFunds(…)` at all, because the bare name is ambiguous, so
     * every existing native call site in the backend, the scripts and the tests
     * would have to name a full signature to keep working. The overload buys
     * nothing that the name does not, and costs that.
     *
     * **What gets credited is what arrived, not what was asked for.** A
     * fee-on-transfer token delivers less than `_amount`, and crediting
     * `_amount` would inflate `totalContributions` — the denominator every
     * interest distribution divides by — quietly diluting every other lender in
     * the pool for the life of it. So the balance is measured either side of
     * the transfer and the difference is what counts.
     *
     * `nonReentrant` because the transfer happens before any state is written,
     * which it has to: the delta is unknowable until the token has moved.
     */
    function depositTokens(
        uint256 _amount
    ) external whenNotPaused nonReentrant {
        if (poolConfig.loanToken == address(0)) revert NativePoolOnly();
        if (_amount == 0) revert InvalidAmount();

        uint256 received = _pullIn(msg.sender, _amount);

        // A token that delivered nothing at all is an invalid deposit, not a
        // zero-value member. Without this the caller would be enrolled and
        // settled for no money.
        if (received == 0) revert InvalidAmount();

        _deposit(received);
    }

    /**
     * @notice Record a deposit that has already arrived
     * @param _amount What actually arrived, in the pool's own denomination
     * @dev Everything a deposit does once the money is in: membership,
     * accounting and the event. Shared so the two entry points above cannot
     * drift — a token deposit that enrolled differently from a native one would
     * make `membership` mean two things.
     */
    function _deposit(uint256 _amount) private {
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

        totalFunds += _amount;
        contributions[msg.sender] += _amount;
        totalContributions += _amount;

        _restampDebt(msg.sender);

        emit FundsDeposited(msg.sender, _amount);
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
     *
     * **Nor on `whenNotPaused`, for the same reason.** The pause belongs to the
     * pool's owner, who is an ordinary member of this product rather than an
     * operator, and a pause that stopped withdrawals would let one user hold
     * everybody else's money indefinitely with a single transaction. A pause
     * stops the pool doing anything *new* — deposits, lending, decisions — and
     * leaves the three exits open: this, `claimInterest` and `repayLoan`.
     */
    function withdraw(uint256 _amount) external nonReentrant {
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

        _payOut(msg.sender, _amount);
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
     *
     * Nor on `whenNotPaused` — one of the three exits a pause leaves open. See
     * `withdraw`.
     */
    function claimInterest() external nonReentrant {
        _settle(msg.sender);

        uint256 amount = unclaimedInterest[msg.sender];
        if (amount == 0) revert NothingToClaim();
        if (amount > totalFunds) revert InsufficientLiquidity();

        // Complete all state changes before external call (CEI pattern)
        unclaimedInterest[msg.sender] = 0;
        totalFunds -= amount;

        // Emit event before external call
        emit InterestClaimed(msg.sender, amount);

        _payOut(msg.sender, amount);
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

        // `requestLoan` has always refused a zero, and this is why it matters
        // more here: a zero loan takes the borrower's `activeLoanId` slot and,
        // in a token pool, there is no way to give it back. `_repay` prices the
        // payment at `min(offered, 0)`, `_pullIn` delivers nothing, and the
        // call reverts `InvalidAmount` for ever — so the borrower can never
        // repay, never borrow again, and `withdraw` refuses their whole
        // contribution on `LoanOutstanding` permanently.
        if (_amount == 0) revert InvalidAmount();

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
            amountRepaid: 0,
            principalOutstanding: _amount,
            interestOutstanding: 0,
            // Non-zero from birth, which is what tells a loan made under
            // accrual from one that predates it. Interest runs from here.
            accruedAt: SafeCast.toUint64(block.timestamp),
            defaultedAt: 0,
            status: LoanStatus.Disbursed
        });

        totalFunds -= _amount;
        activeLoanId[msg.sender] = loanId;

        // Emit event before external call
        emit LoanCreated(loanId, msg.sender, _amount);

        // Transfer funds to borrower (external call moved to end)
        _payOut(msg.sender, _amount);

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
     * @notice Set how long past its term a loan is left before it may be
     * declared defaulted (only owner)
     * @param _gracePeriod Seconds past `startTime + duration`. Zero means the
     * owner may act as soon as the term lapses, which is how every pool created
     * before this behaved.
     * @dev Deliberately unbounded above. A cap would be this contract deciding
     * how patient an owner is allowed to be with their own pool's money, and
     * there is no figure to pick that is not invented; an owner who never wants
     * to call a default can simply never call one.
     *
     * Takes effect immediately, including on loans already overdue. It bounds
     * when the owner may *act*, so a loan that becomes ineligible again has
     * lost nothing — the debt and the interest on it are untouched, and a loan
     * already carrying a default keeps it.
     */
    function setDefaultGracePeriod(uint256 _gracePeriod) external onlyOwner {
        defaultGracePeriod = _gracePeriod;

        emit DefaultGracePeriodChanged(_gracePeriod);
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
        // The owner is `Active` by construction; removing them would lock them
        // out of funding their own pool. Transferring ownership is what hands a
        // pool over, not this.
        if (_account == owner()) revert OwnerIsAlwaysAMember();

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
        // Same reason `removeMember` refuses: the owner would be locked out of
        // their own pool. Leaving is for members, handing it over is for owners.
        if (msg.sender == owner()) revert OwnerIsAlwaysAMember();

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
     * @dev Whoever owns the pool is a member of it.
     *
     * `initialize` calls `__Ownable_init`, which reaches here, so a pool's
     * creator is `Active` from birth — before this, the owner of a
     * **permissioned** pool could not fund it: `depositFunds` requires `Active`
     * and nothing had granted it, so the only way in was to call
     * `requestMembership` and then approve themselves. Borrowing was shut the
     * same way.
     *
     * Overriding the hook rather than granting in `initialize` covers the later
     * transfer too, which would otherwise hand the pool to a non-member and
     * recreate exactly that lockout. `_transferOwnership` is also the one path
     * OpenZeppelin routes both through, so the invariant cannot be sidestepped.
     *
     * The previous owner keeps their membership: they may still hold a
     * contribution, and being demoted is not being turned out.
     */
    function _transferOwnership(address newOwner) internal override {
        super._transferOwnership(newOwner);

        // `renounceOwnership` passes the zero address; there is nobody to
        // enrol. Anyone already `Active` — the usual case for a member promoted
        // to owner — must not be counted twice.
        if (
            newOwner != address(0) && membership[newOwner] != Membership.Active
        ) {
            _grantMembership(newOwner);
            emit MemberJoined(newOwner);
        }
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
            amountRepaid: 0,
            principalOutstanding: _amount,
            interestOutstanding: 0,
            // Stamped again on approval, like `startTime`: nothing is owed
            // while a request waits, so the clock starts when the money moves.
            accruedAt: SafeCast.toUint64(block.timestamp),
            defaultedAt: 0,
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
        // Beside `startTime`, and for the same reason: a request that waited a
        // week on the owner must not arrive already owing a week of interest.
        loan.accruedAt = SafeCast.toUint64(block.timestamp);
        totalFunds -= amount;

        emit LoanApproved(_loanId, borrower, amount);

        _payOut(borrower, amount);
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
     * @notice Declare an overdue loan defaulted (only owner)
     * @param _loanId The loan to declare
     * @dev **A label, not an ending.** Everything about the debt survives it:
     * the money is still owed, interest goes on accruing at the same
     * uncapped rate, `repayLoan` still takes payment, and the borrower's
     * `activeLoanId` is still held — so a defaulter cannot open a second loan.
     * Nothing is seized because there is no collateral in this project to
     * seize, and inventing one here would be a different feature.
     *
     * Which is the point: *late* is derivable by anyone with a clock, so it is
     * not worth a transaction. What only the chain can witness is the owner
     * **saying so** — a judgement, made at a moment, on the public record,
     * where a borrower's later history can be read against it.
     *
     * Three things it deliberately does not do:
     *
     * - **It does not free the borrower's slot.** `rejectLoan` does, because a
     *   refused request never took anything; this one has money out.
     * - **It does not stop the clock.** Interest past the due date is not a
     *   penalty, it is the same price applied to more time, and a default
     *   changes nothing about how long the money has been out.
     * - **It cannot be undone.** There is no `unmarkDefaulted`, so that the
     *   record says what actually happened. The way out is to pay: a loan
     *   settled after a default keeps `Defaulted` and gains `isRepaid`, which
     *   reads as recovered — a fact worth more to a later lender than either
     *   half alone. An owner who would rather not brand a late payer simply
     *   does not call this.
     */
    function markDefaulted(
        uint256 _loanId
    ) external onlyOwner whenNotPaused {
        Loan storage loan = loans[_loanId];

        // A loan id nobody has issued reads as a zeroed struct, which is
        // `Disbursed` with a zero `startTime` — so every date check below
        // passed and the owner could declare a default on a loan that does not
        // exist. It emitted `LoanDefaulted(id, address(0), 0)`, and the indexer
        // writes what it is told: a loan document for a borrower who is nobody.
        if (loan.borrower == address(0)) revert LoanNotDisbursed();

        if (loan.status == LoanStatus.Defaulted) {
            revert LoanAlreadyDefaulted();
        }

        // Only a loan the pool actually paid out can be in default. A request
        // waiting on a decision has taken nothing, and a refused one never
        // will; both would otherwise pass the date check below on their
        // `startTime`, and a request left alone long enough would become
        // declarable.
        if (loan.status != LoanStatus.Disbursed) revert LoanNotDisbursed();

        if (loan.isRepaid) revert LoanAlreadyRepaid();

        if (block.timestamp <= defaultableAt(_loanId)) revert LoanNotOverdue();

        // Bring the debt up to now, so what the event records is the debt as of
        // this block rather than as of the last payment. Also the loan's first
        // touch if it predates accrual, converting it on the flat terms it was
        // made under — the same conversion a payment would have done, and the
        // reason this is `_accrue` rather than a view: the figure emitted and
        // the figure stored must not be able to disagree.
        _accrue(loan);

        loan.status = LoanStatus.Defaulted;
        loan.defaultedAt = uint64(block.timestamp);

        emit LoanDefaulted(
            _loanId,
            loan.borrower,
            loan.principalOutstanding + loan.interestOutstanding
        );
    }

    /**
     * @notice The moment after which this loan may be declared defaulted
     * @param _loanId The loan to ask about
     * @return Unix seconds: `startTime + duration + defaultGracePeriod`
     * @dev Public so an owner's screen can show the date rather than restate
     * the arithmetic, and so a borrower can see the same date the contract
     * will enforce. Note it moves when the owner changes the grace period, and
     * is meaningless on a loan that is not an open debt.
     *
     * A loan is **overdue** at `startTime + duration`, which is earlier than
     * this whenever a grace period is set. Overdue is the borrower's fact and
     * needs no function: `startedAt + duration` is on every indexed record.
     * This is the owner's.
     */
    function defaultableAt(uint256 _loanId) public view returns (uint256) {
        Loan storage loan = loans[_loanId];

        return loan.startTime + loan.duration + defaultGracePeriod;
    }

    /**
     * @notice Pay native POL towards a loan, in part or in full
     * @param _loanId The ID of the loan to pay down
     * @dev Native pools only; a token pool takes `repayLoanWithTokens`,
     * which needs no refund at all — see there.
     *
     * Any amount above zero is accepted and credited against
     * `amount + interest`; anything beyond what is still owed is refunded, so
     * overpaying is as safe as it was when the call demanded the exact sum. The
     * loan closes — `isRepaid`, `repaidAt`, the borrower's lock released — on
     * the payment that finishes it, whether that is the first or the fifth.
     *
     * **Interest is shared out in proportion to what has been paid**, not
     * interest-first and not principal-first. Each payment distributes the
     * difference between two cumulative figures, which has three consequences
     * worth stating because none of them survives a rewrite that distributes
     * `payment * rate` directly:
     *
     * - the parts sum to exactly `interest` at settlement, since the last
     *   difference is taken against the whole debt and integer truncation
     *   cancels rather than accumulating;
     * - a borrower therefore cannot change what the pool distributes by
     *   choosing how to split their payments. The per-share accumulator below
     *   is the one place a split is not quite free: it divides by
     *   `totalContributions` once per payment, so instalments leave up to one
     *   wei-per-share of dust each. Always downwards, and the same dust a
     *   single repayment already leaves once;
     * - a lender who deposits between two instalments earns from the later one
     *   and not the earlier, which is the same rule the accumulator already
     *   enforces for whole repayments.
     *
     * A pool with no contributions left at all — every member having withdrawn
     * while the loan was out — has no one to share with, and that payment's
     * interest stays in the contract as it did before distribution existed.
     *
     * **Not `whenNotPaused`, and this is the one where it would do real harm.**
     * Interest accrues against the clock, so a paused pool that refused
     * repayment would grow a borrower's debt for exactly as long as it denied
     * them any way to stop it — the pool's owner charging someone for time
     * they were not allowed to buy back. The same applies to
     * `repayLoanWithTokens`.
     */
    function repayLoan(uint256 _loanId) external payable nonReentrant {
        if (poolConfig.loanToken != address(0)) revert TokenPoolOnly();

        _repay(_loanId, msg.value, true);
    }

    /**
     * @notice Pay towards a loan in a token pool, in part or in full
     * @param _loanId The ID of the loan to pay down
     * @param _amount The most to pay. Anything beyond the debt is left alone.
     * @dev The token counterpart of `repayLoan(uint256)`, and the same
     * arithmetic underneath: `_amount` plays exactly the part `msg.value` plays
     * in a native pool, capped by what is actually owed at execution time.
     *
     * Named rather than overloaded, for the reason `depositTokens` is.
     *
     * **Nothing is refunded, because nothing is overpaid.** A native repayment
     * has to take the value up front and hand back the excess, which is why the
     * app quotes an hour ahead and warns that the wallet will ask for slightly
     * more than the screen says (see `outstandingBalanceAt`). Here the pool
     * pulls `min(_amount, outstanding)` — the debt is priced at the moment the
     * transaction executes, so "pay it off" is exact and the borrower is never
     * out of pocket for a quote that aged.
     *
     * The head-room does not disappear; it moves to the **allowance**, which
     * must cover a debt that is still growing while the transaction waits. That
     * is the right place for it: an allowance larger than the debt costs the
     * borrower nothing, where an over-payment costs them a refund transfer.
     *
     * `_amount` is still explicit rather than inferred from the allowance. An
     * allowance left over from an abandoned deposit would otherwise decide how
     * much a later repayment took, which is a surprise the caller cannot see
     * coming.
     */
    function repayLoanWithTokens(
        uint256 _loanId,
        uint256 _amount
    ) external nonReentrant {
        if (poolConfig.loanToken == address(0)) revert NativePoolOnly();

        _repay(_loanId, _amount, false);
    }

    /**
     * @notice Credit a payment against a loan, whichever denomination it is in
     * @param _loanId The loan being paid down
     * @param _offered The most the caller is willing to pay
     * @param _isNative Whether the money is already here (`msg.value`) or has
     * still to be pulled
     * @dev The whole of `repayLoan`, shared by both entry points so the two can
     * never disagree about what a payment does. The denomination changes only
     * how the money moves: everything about accrual, the interest/principal
     * split, settlement and distribution is identical.
     */
    function _repay(
        uint256 _loanId,
        uint256 _offered,
        bool _isNative
    ) private {
        Loan storage loan = loans[_loanId];

        if (loan.borrower != msg.sender) {
            revert UnauthorizedBorrower();
        }

        // Before `isRepaid`, because a request that was never funded is not a
        // debt that happens to be unpaid — see `LoanNotDisbursed`. Loans made
        // before `status` existed read `Disbursed`, which is what they all were.
        //
        // A **defaulted** loan passes: the declaration is a label on a debt
        // that is still owed, and refusing payment here would make calling a
        // default the act that forgave it.
        if (
            loan.status != LoanStatus.Disbursed &&
            loan.status != LoanStatus.Defaulted
        ) {
            revert LoanNotDisbursed();
        }

        if (loan.isRepaid) {
            revert LoanAlreadyRepaid();
        }

        if (_offered == 0) revert InvalidAmount();

        // Stop the clock before pricing the payment. Everything below is
        // arithmetic on figures that are now current.
        _accrue(loan);

        uint256 interestDue = loan.interestOutstanding;
        uint256 principalDue = loan.principalOutstanding;
        uint256 outstanding = interestDue + principalDue;

        uint256 payment = _offered < outstanding ? _offered : outstanding;

        // A token pool takes the money here rather than having been sent it,
        // and credits what arrived: a fee-on-transfer token delivers less than
        // it was asked for, and a payment that under-delivers simply does not
        // settle the loan. Same rule as `depositTokens`, and it matters
        // for the same reason — `interestPaid` below moves the accumulator
        // every other lender is paid from.
        if (!_isNative) {
            payment = _pullIn(msg.sender, payment);
            if (payment == 0) revert InvalidAmount();
        }

        // Complete all state changes before external call (CEI pattern)
        uint256 interestPaid = _creditPayment(loan, payment);
        totalFunds += payment;

        bool settled = payment == outstanding;

        if (settled) _closeLoan(loan, _loanId);

        _distributeInterest(_loanId, interestPaid);

        // Emit events before external call
        emit LoanRepaymentMade(_loanId, msg.sender, payment);

        if (settled) {
            emit LoanRepaid(_loanId, msg.sender, loan.amountRepaid);
        }

        // Native only: the value arrived up front, so whatever the debt did not
        // need goes back. A token pool pulled the payment and no more, so there
        // is nothing to return.
        if (_isNative) {
            uint256 refundAmount = _offered - payment;

            if (refundAmount > 0) {
                (bool success, ) = payable(msg.sender).call{
                    value: refundAmount
                }("");
                if (!success) revert RefundFailed();
            }
        }
    }

    /**
     * @notice Credit a payment's interest to everyone standing behind the loan
     * @param _loanId The loan the interest came from
     * @param _interestPaid The interest this payment covered
     * @dev **The denominator is `totalContributions`, never `totalFunds`.**
     * `totalFunds` falls when money is lent out, which is exactly when interest
     * is being earned, so dividing by it would pay roughly double on any pool
     * with a loan outstanding — and no test in which nothing is borrowed would
     * notice.
     *
     * A pool with no contributions left at all — every member having withdrawn
     * while the loan was out — has nobody to share with, and the interest stays
     * in the contract as it did before distribution existed. No event either:
     * nothing was distributed.
     */
    function _distributeInterest(
        uint256 _loanId,
        uint256 _interestPaid
    ) private {
        if (_interestPaid == 0 || totalContributions == 0) return;

        accInterestPerShare += Math.mulDiv(
            _interestPaid,
            PRECISION,
            totalContributions
        );

        emit InterestDistributed(_loanId, _interestPaid);
    }

    /**
     * @notice Send the pool's denomination to an address
     * @param _to Recipient
     * @param _amount How much, in the pool's own denomination
     * @dev The single outbound path, shared by `withdraw`, `claimInterest`,
     * `createLoan` and `approveLoan`. One place decides native or token, so a
     * value-moving function added later cannot get it half right.
     *
     * Always last in its caller, after every state change and every event —
     * the CEI ordering the native transfers already followed, and now also what
     * keeps a token with a transfer callback from re-entering mid-update.
     */
    function _payOut(address _to, uint256 _amount) private {
        // Some ERC-20s revert on a zero-value transfer. No caller can reach
        // here with nothing to send any more — `createLoan` refuses a zero
        // amount as `requestLoan` always did — so this is now belt and braces
        // rather than the load-bearing guard it was. Kept because the cost is
        // one comparison and the failure it prevents is a transfer reverting
        // inside a function that has already written its state.
        if (_amount == 0) return;

        address token = poolConfig.loanToken;

        if (token == address(0)) {
            (bool success, ) = payable(_to).call{value: _amount}("");
            if (!success) revert TransferFailed();

            return;
        }

        IERC20(token).safeTransfer(_to, _amount);
    }

    /**
     * @notice Take the pool's token from an address, and report what arrived
     * @param _from Who to pull from. Must have approved this pool already.
     * @param _amount How much to ask for
     * @return received What the pool's balance actually grew by
     * @dev **The return value is the point.** A fee-on-transfer token delivers
     * less than it was asked for, and every caller here credits the result
     * against figures other members are paid from — `totalContributions` is the
     * denominator of every interest distribution, and over-crediting it dilutes
     * every other lender in the pool for as long as it exists. Measuring the
     * balance either side is the only way to know, and it costs two reads.
     *
     * `SafeERC20` rather than `IERC20` directly: USDT and friends do not return
     * a bool from `transfer`, so a bare call reverts on decoding a return value
     * that is not there.
     */
    function _pullIn(
        address _from,
        uint256 _amount
    ) private returns (uint256 received) {
        IERC20 token = IERC20(poolConfig.loanToken);

        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(_from, address(this), _amount);

        return token.balanceOf(address(this)) - balanceBefore;
    }

    /**
     * @notice Whether a loan is money currently owed to the pool
     * @param loan The loan to judge
     * @return True while the debt is live, whatever the owner has called it
     * @dev **`Defaulted` counts.** Declaring a default records a judgement; it
     * does not cancel the debt, forgive the interest or close the loan. Every
     * gate and every valuation below therefore has to admit it, and each one
     * that did not would be its own silent bug: a repayment refused with
     * `LoanNotDisbursed`, or an outstanding balance quoted as zero — which
     * would tell a borrower their debt had disappeared and hand a repay screen
     * a figure of nothing to send.
     *
     * The single definition, rather than the same two-clause test written in
     * four places, precisely because the next state added to the enum has to
     * be considered once.
     */
    function _isOpenDebt(Loan storage loan) private view returns (bool) {
        if (loan.isRepaid) return false;

        return
            loan.status == LoanStatus.Disbursed ||
            loan.status == LoanStatus.Defaulted;
    }

    /**
     * @notice What a loan owes, projected to a moment in time
     * @param loan The loan to price
     * @param _at The moment to price it at. Earlier than `accruedAt` accrues nothing.
     * @return principal Principal not yet returned
     * @return interest Interest accrued and not yet paid, at `_at`
     * @dev The single definition of what is owed, shared by `_accrue` — which
     * writes it down — and by every view that reports it. Two copies of this
     * arithmetic is how a screen ends up quoting a figure the contract will not
     * accept.
     *
     * **The rate is the price of the full term, and the clock never stops.**
     * `interestRate` basis points buys `duration` seconds, so a loan held twice
     * its term costs twice its stated rate. There is no cap, deliberately: a cap
     * would make time free after the due date, which is a rule that has to be
     * invented rather than one that falls out of pricing time.
     *
     * Linear and simple, not compounding: unpaid interest does not itself
     * accrue. Same reasoning as unclaimed interest not earning — see
     * `docs/INTEREST.md`.
     *
     * A loan whose `accruedAt` is zero predates this and is priced on the terms
     * it was made under; see `_accrue`.
     */

    function _balanceAt(
        Loan storage loan,
        uint256 _at
    ) private view returns (uint256 principal, uint256 interest) {
        if (loan.accruedAt == 0) {
            return _legacyBalance(loan);
        }

        principal = loan.principalOutstanding;
        interest = loan.interestOutstanding;

        // `<=` rather than `<` is the intent: at the instant of the last
        // accrual no time has passed, and a moment before it is not a rebate.
        // solhint-disable-next-line gas-strict-inequalities
        if (_at <= loan.accruedAt || principal == 0 || loan.duration == 0) {
            return (principal, interest);
        }

        // `mulDiv` rather than a bare product: the numerator is a wei amount
        // times a rate times an elapsed second count, and the 512-bit
        // intermediate is what keeps a long-running loan on a large pool from
        // overflowing on the way to a small answer.
        interest += Math.mulDiv(
            principal,
            loan.interestRate * (_at - loan.accruedAt),
            10000 * loan.duration
        );
    }

    /**
     * @notice Price a loan made before interest accrued, on the terms it was made under
     * @param loan The loan to price
     * @return principal Principal not yet returned
     * @return interest What is still owed of its flat interest
     * @dev Such a loan carries `principalOutstanding == 0` and `accruedAt == 0`,
     * because neither field existed when it was written — and reading the first
     * literally would say the principal is already back.
     *
     * It was priced flat, and `amountRepaid` was applied across principal and
     * that flat interest **pro rata**, so it is converted on exactly those
     * terms. No new money is invented and none is forgiven: what it owed a
     * moment before the upgrade is what it owes a moment after.
     *
     * Accrual then starts from the conversion, not from `startTime` — dating it
     * back would charge the loan twice for time it already paid flat interest
     * on.
     */
    function _legacyBalance(
        Loan storage loan
    ) private view returns (uint256 principal, uint256 interest) {
        uint256 flatInterest = Math.mulDiv(
            loan.amount,
            loan.interestRate,
            10000
        );
        uint256 owedInFull = loan.amount + flatInterest;

        if (owedInFull == 0) return (0, 0);

        uint256 principalPaid = Math.mulDiv(
            loan.amountRepaid,
            loan.amount,
            owedInFull
        );

        return (
            loan.amount - principalPaid,
            flatInterest - (loan.amountRepaid - principalPaid)
        );
    }

    /**
     * @notice Bring a loan's interest up to now, so it can be read or paid
     * @param loan The loan to accrue
     * @dev Called before anything that changes the debt. Writing the snapshot
     * down and moving `accruedAt` is what makes accrual path-independent: the
     * interest already earned is fixed, and only the principal still out earns
     * from here.
     *
     * Also where a pre-accrual loan is converted, once, on its first touch —
     * a migration nobody has to run, in the same spirit as `LoanStatus.Disbursed`
     * being ordinal zero.
     */
    function _accrue(Loan storage loan) private {
        (uint256 principal, uint256 interest) = _balanceAt(
            loan,
            block.timestamp
        );

        loan.principalOutstanding = principal;
        loan.interestOutstanding = SafeCast.toUint192(interest);
        loan.accruedAt = SafeCast.toUint64(block.timestamp);
    }

    /**
     * @notice Split a payment across a loan's interest and principal
     * @param loan The loan being paid, already accrued to now
     * @param payment What to credit. Never more than the loan owes.
     * @return interestPaid The part that covered interest, and so the part the
     * lenders earn
     * @dev **Interest first, then principal.** Not a convention borrowed for
     * its own sake: interest is the price of time already used, and letting a
     * payment cut principal while interest stands would let a borrower reduce
     * what they owe for time they have not paid for yet.
     *
     * It also makes the lenders' share *exact* rather than apportioned. The
     * flat model had to split each payment pro rata across a fixed total; here
     * the interest in a payment is simply the interest it covered.
     */
    function _creditPayment(
        Loan storage loan,
        uint256 payment
    ) private returns (uint256 interestPaid) {
        uint256 interestDue = loan.interestOutstanding;

        interestPaid = payment < interestDue ? payment : interestDue;

        loan.interestOutstanding = SafeCast.toUint192(
            interestDue - interestPaid
        );
        loan.principalOutstanding -= payment - interestPaid;
        loan.amountRepaid += payment;
    }

    /**
     * @notice Close a fully-paid loan: mark it, date it, free the borrower's slot
     * @dev
     *
     * Reached only when the whole of `amount + interest` is back, which is why
     * it is a step of its own rather than three lines inside `repayLoan` — a
     * part-paid loan must go through none of it. Freeing the slot early would
     * be the costly half: `activeLoanId` is what caps a borrower at one open
     * loan, so a borrower who paid a wei could open a second.
     *
     * @param loan The loan being settled
     * @param _loanId Its id, needed to check the borrower's lock points here
     */
    function _closeLoan(Loan storage loan, uint256 _loanId) private {
        loan.isRepaid = true;
        // Free, in the sense that matters: same slot as `isRepaid`, so this is
        // the same write. It is also the only record that a repayment happened
        // at a particular moment — `LoanRepaid` carries no timestamp, and a log
        // is not something a later reader can ask the chain for by loan id. It
        // dates the *settlement*; the instalments before it are dated by their
        // `LoanRepaymentMade` logs.
        loan.repaidAt = uint64(block.timestamp);

        // Only clears the lock if this is the tracked loan. A pool upgraded to
        // v2 can hold loans created before `activeLoanId` existed; repaying one
        // of those must not release a lock taken by a newer loan.
        if (activeLoanId[msg.sender] == _loanId) {
            delete activeLoanId[msg.sender];
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
        // The same three rules `PoolFactory.createPool` enforces, which this
        // could always sidestep. It matters more now: `duration` is the
        // denominator interest accrues over, so a zero here would have made
        // every later loan from this pool interest-free.
        if (_maxLoanAmount == 0) revert InvalidAmount();
        if (_interestRate > 10000) revert InvalidInterestRate();
        if (_loanDuration == 0) revert InvalidLoanDuration();

        poolConfig.maxLoanAmount = _maxLoanAmount;
        poolConfig.interestRate = _interestRate;
        poolConfig.loanDuration = _loanDuration;

        emit PoolConfigured(_maxLoanAmount, _interestRate, _loanDuration);
    }

    /**
     * @notice Open or close this pool to new business (only owner)
     * @dev **Not the same flag as `PoolFactory.deactivatePool`, and the two are
     * not substitutes.** This one is the pool owner's and is the one that
     * *binds*: `createLoan`, `requestLoan` and `requestMembership` all check
     * `poolConfig.isActive`. The factory's is the protocol operator's and only
     * decides whether `listPools` shows the pool — a pool hidden there still
     * takes deposits from anyone holding its address.
     *
     * Closing a pool stops new business and nothing else. Deposits, loans and
     * memberships already in place are untouched, and the three exits stay open
     * for the same reason a pause leaves them open — see `withdraw`.
     *
     * The event was missing entirely, which made this the one owner action that
     * left no trace: the flag it flips is invisible to the index, so a closed
     * pool went on looking open everywhere off chain. Nothing indexes it yet,
     * like `DefaultGracePeriodChanged` — it is here so the change is on the
     * public record and so indexing it later needs no upgrade.
     */
    function togglePoolStatus() external onlyOwner {
        bool isActive = !poolConfig.isActive;

        poolConfig.isActive = isActive;

        emit PoolStatusChanged(isActive);
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
     * @notice What a loan costs if it runs exactly its term and is repaid once
     * @param _loanId The loan ID to calculate for
     * @return Principal plus the rate applied over the full term
     * @dev **The quoted price, not the bill.** `interestRate` buys `duration`
     * seconds, so this is what the loan costs held exactly that long — which is
     * what the borrow form states before anyone signs, and what it has always
     * returned. The arithmetic is unchanged; what changed underneath is that
     * repaying earlier now costs less and repaying later costs more.
     *
     * What is owed *now* is `outstandingBalance`, and that is the figure to
     * send as `value`. The two agree only on a loan repaid in one payment at
     * the exact end of its term.
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
     * @notice What is left to pay on a loan right now
     * @param _loanId The loan ID to calculate for
     * @return The amount `repayLoan` would still credit, in wei
     * @dev Zero on anything that is not an open debt — a settled loan, a
     * request nobody has approved, a refused one — rather than the sum such a
     * loan would owe if it existed. That mirrors the gate in `repayLoan`, so a
     * caller can send this figure without first working out whether the call
     * would revert.
     *
     * **This figure grows between blocks.** Sending exactly it settles nothing
     * if a block passes on the way — the loan is left owing a few seconds of
     * interest, which is a worse surprise than a revert because it looks like
     * success. Anything meaning to close a loan should send
     * `outstandingBalanceAt` a little in the future and let the refund return
     * the difference.
     */
    function outstandingBalance(
        uint256 _loanId
    ) external view returns (uint256) {
        return _outstandingAt(_loanId, block.timestamp);
    }

    /**
     * @notice What a loan will owe at a given moment, if nothing is paid before then
     * @param _loanId The loan ID to calculate for
     * @param _at Unix seconds. Anything at or before the last accrual accrues nothing.
     * @return The amount owed at `_at`, in wei
     * @dev Exists so that "pay it off" can be a single transaction. The debt
     * grows while the wallet is being signed and the block is being mined, so a
     * caller quotes slightly ahead and relies on `repayLoan` refunding whatever
     * it did not need. The horizon is the caller's to choose — the app uses an
     * hour, which is worth a few wei of principal and covers any realistic
     * delay.
     */
    function outstandingBalanceAt(
        uint256 _loanId,
        uint256 _at
    ) external view returns (uint256) {
        return _outstandingAt(_loanId, _at);
    }

    /**
     * @notice The two halves of what a loan owes right now
     * @param _loanId The loan ID to calculate for
     * @return principal Principal not yet returned
     * @return interest Interest accrued and not yet paid
     * @dev Both from one call, because a screen showing a debt wants to show
     * what it is made of — and because deriving one from the other off chain
     * means restating the accrual rule somewhere it can drift.
     *
     * Zero for anything that is not an open debt, like `outstandingBalance`.
     */
    function loanBalance(
        uint256 _loanId
    ) external view returns (uint256 principal, uint256 interest) {
        Loan storage loan = loans[_loanId];

        if (!_isOpenDebt(loan)) return (0, 0);

        return _balanceAt(loan, block.timestamp);
    }

    function _outstandingAt(
        uint256 _loanId,
        uint256 _at
    ) private view returns (uint256) {
        Loan storage loan = loans[_loanId];

        if (!_isOpenDebt(loan)) return 0;

        (uint256 principal, uint256 interest) = _balanceAt(loan, _at);

        return principal + interest;
    }

    /**
     * @notice Disabled. A pool cannot be left without an owner.
     * @dev Everything this pool does that needs a decision needs *this*
     * address: approving a request to borrow, admitting a member, declaring a
     * default, changing the terms, pausing. An owner of `address(0)` ends all
     * of them permanently, and a permissioned pool becomes one nobody can ever
     * join. There is no recovery — a beacon upgrade could not restore an owner
     * without inventing one.
     *
     * The money is never trapped by it: `withdraw`, `claimInterest` and
     * `repayLoan` need no owner and no pause. But a pool frozen half way
     * through its life, with requests pending that nobody can answer, is not a
     * state worth being one mis-click from.
     *
     * `Ownable2Step` covers the other half — handing the pool to an address
     * that cannot accept it. This covers handing it to nobody.
     */
    function renounceOwnership() public view override onlyOwner {
        revert OwnershipCannotBeRenounced();
    }

    /**
     * @notice Get contract version for upgrades
     * @return version Version string of the contract
     */
    function version() external pure returns (string memory) {
        return "2.0.0";
    }
}
