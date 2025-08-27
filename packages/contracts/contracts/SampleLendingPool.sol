// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {
    OwnableUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {
    PausableUpgradeable
} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {
    ReentrancyGuardUpgradeable
} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title SampleLendingPool
 * @notice A sample upgradeable lending pool contract for SuperPool platform
 * @author SuperPool Team
 * @dev A sample upgradeable lending pool contract for SuperPool platform
 * This contract demonstrates the basic structure for a lending pool with:
 * - Upgradeable patterns using OpenZeppelin
 * - Access control with ownership
 * - Pausable functionality for emergency stops
 * - Reentrancy protection
 */
contract SampleLendingPool is
    Initializable,
    OwnableUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    /// @dev Pool configuration
    struct PoolConfig {
        uint256 maxLoanAmount;
        uint256 interestRate;
        uint256 loanDuration;
        bool isActive;
    }

    /// @dev Loan information - optimized for gas efficiency
    struct Loan {
        address borrower;         // 20 bytes
        bool isRepaid;           // 1 byte - fits in same slot (21 bytes total)
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

    /// @notice Errors
    error InsufficientFunds();
    error LoanAlreadyRepaid();
    error UnauthorizedBorrower();
    error ExceedsMaxLoanAmount();
    error InvalidAmount();
    error PoolNotActive();
    error InsufficientRepaymentAmount();
    error TransferFailed();
    error RefundFailed();
    error InvalidImplementation();

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
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        poolConfig = PoolConfig({
            maxLoanAmount: _maxLoanAmount,
            interestRate: _interestRate,
            loanDuration: _loanDuration,
            isActive: true
        });

        nextLoanId = 1;

        emit PoolConfigured(_maxLoanAmount, _interestRate, _loanDuration);
    }

    /**
     * @notice Authorize contract upgrades (only owner)
     * @dev Required by UUPSUpgradeable to authorize upgrades
     * @param newImplementation Address of the new implementation contract
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {
        // Only owner can authorize upgrades
        // Additional upgrade logic can be added here if needed
        // For now, the onlyOwner modifier provides sufficient access control
        // Validation of newImplementation address could be added here
        if (newImplementation == address(0)) revert InvalidImplementation();
    }

    /**
     * @notice Deposit funds into the pool
     */
    function depositFunds() external payable whenNotPaused {
        if (msg.value == 0) revert InvalidAmount();
        totalFunds += msg.value;
        emit FundsDeposited(msg.sender, msg.value);
    }

    /**
     * @notice Create a new loan
     * @param _amount Loan amount requested
     * @return loanId The ID of the created loan
     */
    function createLoan(
        uint256 _amount
    ) external whenNotPaused nonReentrant returns (uint256) {
        if (!poolConfig.isActive) revert PoolNotActive();

        if (_amount > poolConfig.maxLoanAmount) {
            revert ExceedsMaxLoanAmount();
        }

        if (_amount > totalFunds) {
            revert InsufficientFunds();
        }

        uint256 loanId = ++nextLoanId;

        // Complete all state changes before external call (CEI pattern)
        loans[loanId] = Loan({
            borrower: msg.sender,
            amount: _amount,
            interestRate: poolConfig.interestRate,
            startTime: block.timestamp,
            duration: poolConfig.loanDuration,
            isRepaid: false
        });

        totalFunds -= _amount;

        // Emit event before external call
        emit LoanCreated(loanId, msg.sender, _amount);

        // Transfer funds to borrower (external call moved to end)
        (bool success, ) = payable(msg.sender).call{value: _amount}("");
        if (!success) revert TransferFailed();

        return loanId;
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
        return "1.0.0";
    }
}
