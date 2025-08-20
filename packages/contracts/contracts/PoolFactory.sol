// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
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
    OwnableUpgradeable,
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

    /// @notice Custom errors for gas optimization
    error InvalidPoolOwner();
    error InvalidMaxLoanAmount();
    error InvalidInterestRate();
    error InvalidLoanDuration();
    error PoolNotFound();
    error PoolAlreadyExists();
    error EmptyName();
    error ImplementationNotSet();
    error PoolCreationFailed();

    /// @notice Modifier to check if pool exists
    modifier poolExists(uint256 _poolId) {
        if (_poolId == 0 || _poolId > poolCount) {
            revert PoolNotFound();
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
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        lendingPoolImplementation = _implementation;
        poolCount = 0;
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
        onlyOwner
        whenNotPaused
        nonReentrant
        returns (uint256 poolId, address poolAddress)
    {
        // Validate parameters
        if (_params.poolOwner == address(0)) revert InvalidPoolOwner();
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
     * @return Array of all pool addresses
     */
    function getAllPoolAddresses() external view returns (address[] memory) {
        return allPools;
    }

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
}
