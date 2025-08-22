// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./SampleLendingPool.sol";

/**
 * @title PoolFactory
 * @dev Factory contract for deploying and managing lending pools using minimal proxies
 * This contract enables creation of multiple lending pools with different configurations
 * while maintaining upgradability and efficient deployment through proxy patterns.
 *
 * Features:
 * - Creates lending pools using minimal proxy pattern (ERC-1167)
 * - Maintains registry of all deployed pools
 * - Supports both ERC20 and native POL pools
 * - Owner-controlled pool creation with multi-sig compatibility
 * - Comprehensive event logging and pool tracking
 */
contract PoolFactory is
    Initializable,
    Ownable2StepUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using Clones for address;

    /// @dev Pool creation parameters
    struct PoolParams {
        address poolOwner;
        uint256 maxLoanAmount;
        uint256 interestRate;
        uint256 loanDuration;
        string name;
        string description;
    }

    /// @dev Pool registry information
    struct PoolInfo {
        address poolAddress;
        address poolOwner;
        uint256 maxLoanAmount;
        uint256 interestRate;
        uint256 loanDuration;
        string name;
        string description;
        uint256 createdAt;
        bool isActive;
    }

    /// @notice Address of the lending pool implementation contract
    address public lendingPoolImplementation;

    /// @notice Total number of pools created
    uint256 public poolCount;

    /// @notice Mapping from pool ID to pool information
    mapping(uint256 => PoolInfo) public pools;

    /// @notice Mapping from pool address to pool ID
    mapping(address => uint256) public poolAddressToId;

    /// @notice Mapping from owner address to array of pool IDs
    mapping(address => uint256[]) public ownerToPools;

    /// @notice Array of all pool addresses for enumeration
    address[] public allPools;

    /// @notice Mapping to track authorized pool creators (whitelist)
    mapping(address => bool) public authorizedCreators;

    /// @notice Whether pool creation is restricted to whitelist only
    bool public isWhitelistEnabled;

    /// @notice Events
    event PoolCreated(
        uint256 indexed poolId,
        address indexed poolAddress,
        address indexed poolOwner,
        string name,
        uint256 maxLoanAmount,
        uint256 interestRate,
        uint256 loanDuration
    );

    event PoolDeactivated(uint256 indexed poolId, address indexed poolAddress);
    event PoolReactivated(uint256 indexed poolId, address indexed poolAddress);
    event ImplementationUpdated(
        address indexed oldImplementation,
        address indexed newImplementation
    );

    event CreatorAuthorized(address indexed creator, bool authorized);
    event WhitelistModeChanged(bool enabled);

    /// @notice Custom errors for gas optimization
    error InvalidPoolOwner();
    error InvalidPoolOwnerAddress();
    error InvalidMaxLoanAmount();
    error InvalidInterestRate();
    error InvalidLoanDuration();
    error PoolNotFound();
    error PoolAlreadyExists();
    error EmptyName();
    error ImplementationNotSet();
    error PoolCreationFailed();
    error UnauthorizedCreator();

    /// @notice Modifier to check if pool exists
    modifier poolExists(uint256 _poolId) {
        if (_poolId == 0 || _poolId > poolCount) {
            revert PoolNotFound();
        }
        _;
    }

    /// @notice Modifier to check if caller is authorized to create pools
    modifier onlyAuthorizedCreator() {
        // Owner is always authorized
        if (msg.sender == owner()) {
            _;
            return;
        }

        // If whitelist is disabled, only owner can create pools
        if (!isWhitelistEnabled) {
            revert UnauthorizedCreator();
        }

        // If whitelist is enabled, check if caller is authorized
        if (!authorizedCreators[msg.sender]) {
            revert UnauthorizedCreator();
        }
        _;
    }

    /**
     * @dev Initialize the factory contract
     * @param _owner Initial owner of the factory
     * @param _implementation Address of the lending pool implementation contract
     */
    function initialize(
        address _owner,
        address _implementation
    ) public initializer {
        if (_owner == address(0)) revert InvalidPoolOwner();
        if (_implementation == address(0)) revert ImplementationNotSet();

        __Ownable_init(_owner);
        __Ownable2Step_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        lendingPoolImplementation = _implementation;
        poolCount = 0;

        // Initialize with whitelist disabled (owner-only by default)
        isWhitelistEnabled = false;
    }

    /**
     * @dev Required by UUPSUpgradeable to authorize upgrades
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {
        // Only owner can authorize upgrades
    }

    /**
     * @notice Create a new lending pool
     * @param _params Pool creation parameters
     * @return poolId The ID of the newly created pool
     * @return poolAddress The address of the newly created pool
     */
    function createPool(
        PoolParams calldata _params
    )
        external
        onlyAuthorizedCreator
        whenNotPaused
        nonReentrant
        returns (uint256 poolId, address poolAddress)
    {
        // Validate parameters
        if (_params.poolOwner == address(0)) revert InvalidPoolOwner();

        // Enhanced pool owner validation
        _validatePoolOwner(_params.poolOwner);

        if (_params.maxLoanAmount == 0) revert InvalidMaxLoanAmount();
        if (_params.interestRate > 10000) revert InvalidInterestRate(); // Max 100%
        if (_params.loanDuration == 0) revert InvalidLoanDuration();
        if (bytes(_params.name).length == 0) revert EmptyName();
        if (lendingPoolImplementation == address(0))
            revert ImplementationNotSet();

        // Deploy minimal proxy
        poolAddress = lendingPoolImplementation.clone();
        if (poolAddress == address(0)) revert PoolCreationFailed();

        // Initialize the new pool
        SampleLendingPool(poolAddress).initialize(
            _params.poolOwner,
            _params.maxLoanAmount,
            _params.interestRate,
            _params.loanDuration
        );

        // Increment pool count and assign ID
        poolId = ++poolCount;

        // Store pool information
        pools[poolId] = PoolInfo({
            poolAddress: poolAddress,
            poolOwner: _params.poolOwner,
            maxLoanAmount: _params.maxLoanAmount,
            interestRate: _params.interestRate,
            loanDuration: _params.loanDuration,
            name: _params.name,
            description: _params.description,
            createdAt: block.timestamp,
            isActive: true
        });

        // Update mappings
        poolAddressToId[poolAddress] = poolId;
        ownerToPools[_params.poolOwner].push(poolId);
        allPools.push(poolAddress);

        emit PoolCreated(
            poolId,
            poolAddress,
            _params.poolOwner,
            _params.name,
            _params.maxLoanAmount,
            _params.interestRate,
            _params.loanDuration
        );
    }

    /**
     * @notice Get pool address by ID
     * @param _poolId The pool ID to query
     * @return The address of the pool
     */
    function getPoolAddress(
        uint256 _poolId
    ) external view poolExists(_poolId) returns (address) {
        return pools[_poolId].poolAddress;
    }

    /**
     * @notice Get total number of pools created
     * @return Total pool count
     */
    function getPoolCount() external view returns (uint256) {
        return poolCount;
    }

    /**
     * @notice Get pool information by ID
     * @param _poolId The pool ID to query
     * @return Pool information struct
     */
    function getPoolInfo(
        uint256 _poolId
    ) external view poolExists(_poolId) returns (PoolInfo memory) {
        return pools[_poolId];
    }

    /**
     * @notice Get pool ID by address
     * @param _poolAddress The pool address to query
     * @return Pool ID (0 if not found)
     */
    function getPoolId(address _poolAddress) external view returns (uint256) {
        return poolAddressToId[_poolAddress];
    }

    /**
     * @notice Get all pool IDs owned by a specific address
     * @param _owner The owner address to query
     * @return Array of pool IDs
     */
    function getPoolsByOwner(
        address _owner
    ) external view returns (uint256[] memory) {
        return ownerToPools[_owner];
    }

    /**
     * @notice Get all pool addresses
     * @dev DEPRECATED: This function has been removed to prevent DoS attacks
     * from unbounded array returns with large numbers of pools.
     * Use getPoolsRange() instead for safe pagination.
     */
    // function getAllPoolAddresses() external view returns (address[] memory) {
    //     return allPools;
    // }

    /**
     * @notice Get pools within a range (for pagination)
     * @param _start Start index (inclusive)
     * @param _limit Maximum number of pools to return
     * @return poolIds Array of pool IDs
     * @return poolInfos Array of pool information
     */
    function getPoolsRange(
        uint256 _start,
        uint256 _limit
    )
        external
        view
        returns (uint256[] memory poolIds, PoolInfo[] memory poolInfos)
    {
        if (_start == 0 || _start > poolCount) {
            return (new uint256[](0), new PoolInfo[](0));
        }

        uint256 end = _start + _limit - 1;
        if (end > poolCount) {
            end = poolCount;
        }

        uint256 length = end - _start + 1;
        poolIds = new uint256[](length);
        poolInfos = new PoolInfo[](length);

        for (uint256 i = 0; i < length; i++) {
            uint256 poolId = _start + i;
            poolIds[i] = poolId;
            poolInfos[i] = pools[poolId];
        }
    }

    /**
     * @notice Deactivate a pool (only owner)
     * @param _poolId The pool ID to deactivate
     */
    function deactivatePool(
        uint256 _poolId
    ) external onlyOwner poolExists(_poolId) {
        pools[_poolId].isActive = false;
        emit PoolDeactivated(_poolId, pools[_poolId].poolAddress);
    }

    /**
     * @notice Reactivate a pool (only owner)
     * @param _poolId The pool ID to reactivate
     */
    function reactivatePool(
        uint256 _poolId
    ) external onlyOwner poolExists(_poolId) {
        pools[_poolId].isActive = true;
        emit PoolReactivated(_poolId, pools[_poolId].poolAddress);
    }

    /**
     * @notice Update the implementation contract (only owner)
     * @param _newImplementation Address of the new implementation
     */
    function updateImplementation(
        address _newImplementation
    ) external onlyOwner {
        if (_newImplementation == address(0)) revert ImplementationNotSet();

        address oldImplementation = lendingPoolImplementation;
        lendingPoolImplementation = _newImplementation;

        emit ImplementationUpdated(oldImplementation, _newImplementation);
    }

    /**
     * @notice Check if a pool is active
     * @param _poolId The pool ID to check
     * @return True if the pool is active
     */
    function isPoolActive(
        uint256 _poolId
    ) external view poolExists(_poolId) returns (bool) {
        return pools[_poolId].isActive;
    }

    /**
     * @notice Pause the factory (only owner)
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause the factory (only owner)
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Get contract version
     * @return Version string
     */
    function version() external pure returns (string memory) {
        return "1.0.0";
    }

    /**
     * @notice Get ownership status information
     * @return currentOwner Current owner address
     * @return pendingOwnerAddress Pending owner address (if any)
     * @return hasPendingTransfer Whether there's a pending ownership transfer
     */
    function getOwnershipStatus()
        external
        view
        returns (
            address currentOwner,
            address pendingOwnerAddress,
            bool hasPendingTransfer
        )
    {
        currentOwner = owner();
        pendingOwnerAddress = pendingOwner();
        hasPendingTransfer = pendingOwnerAddress != address(0);
    }

    /**
     * @notice Verify if address is current owner
     * @param _address Address to verify
     * @return True if address is current owner
     */
    function isCurrentOwner(address _address) external view returns (bool) {
        return owner() == _address;
    }

    /**
     * @notice Verify if address is pending owner
     * @param _address Address to verify
     * @return True if address is pending owner
     */
    function isPendingOwner(address _address) external view returns (bool) {
        return pendingOwner() == _address;
    }

    /**
     * @notice Emergency pause function (only owner)
     * @dev Can be used to halt all factory operations in emergency situations
     */
    function emergencyPause() external onlyOwner {
        if (!paused()) {
            _pause();
        }
    }

    /**
     * @notice Emergency unpause function (only owner)
     * @dev Can be used to resume factory operations after emergency
     */
    function emergencyUnpause() external onlyOwner {
        if (paused()) {
            _unpause();
        }
    }

    /**
     * @notice Authorize or revoke pool creation permission for an address
     * @param _creator Address to authorize or revoke
     * @param _authorized Whether to authorize (true) or revoke (false)
     */
    function setCreatorAuthorization(
        address _creator,
        bool _authorized
    ) external onlyOwner {
        if (_creator == address(0)) revert InvalidPoolOwner();

        authorizedCreators[_creator] = _authorized;
        emit CreatorAuthorized(_creator, _authorized);
    }

    /**
     * @notice Enable or disable whitelist mode for pool creation
     * @param _enabled Whether to enable whitelist mode
     * @dev When disabled, only owner can create pools (current behavior)
     * @dev When enabled, authorized creators + owner can create pools
     */
    function setWhitelistMode(bool _enabled) external onlyOwner {
        isWhitelistEnabled = _enabled;
        emit WhitelistModeChanged(_enabled);
    }

    /**
     * @notice Check if an address is authorized to create pools
     * @param _creator Address to check
     * @return True if authorized to create pools
     */
    function isAuthorizedCreator(
        address _creator
    ) external view returns (bool) {
        // Owner is always authorized
        if (_creator == owner()) {
            return true;
        }

        // If whitelist is disabled, only owner can create
        if (!isWhitelistEnabled) {
            return false;
        }

        // Check whitelist authorization
        return authorizedCreators[_creator];
    }

    /**
     * @notice Internal function to validate pool owner address
     * @param _poolOwner Address to validate as pool owner
     * @dev Performs enhanced validation beyond zero address check
     */
    function _validatePoolOwner(address _poolOwner) internal view {
        // Check if address is a contract
        uint256 codeSize;
        assembly {
            codeSize := extcodesize(_poolOwner)
        }

        // Allow EOA addresses and certain contract addresses
        // Reject if it's this factory contract (prevent circular ownership)
        if (_poolOwner == address(this)) {
            revert InvalidPoolOwnerAddress();
        }

        // Reject if it's the lending pool implementation
        if (_poolOwner == lendingPoolImplementation) {
            revert InvalidPoolOwnerAddress();
        }

        // Additional validation: warn if owner is a contract without proper interface
        // This is a soft check - contracts are allowed but flagged for review
        if (codeSize > 0) {
            // Allow known contract types (like multi-sig wallets)
            // For now, we just document this as a consideration
            // Future versions could implement a whitelist
        }
    }
}
