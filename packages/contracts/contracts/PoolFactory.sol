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
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {BeaconProxy} from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import {
    UpgradeableBeacon
} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {LendingPool} from "./LendingPool.sol";

/**
 * @title PoolFactory
 * @notice Factory contract for deploying and managing lending pools behind a shared beacon
 * @author SuperPool Team
 * @dev Pools are BeaconProxy instances pointing at one UpgradeableBeacon that this
 * factory owns, so upgrading the beacon upgrades every pool at once.
 *
 * This replaced ERC-1167 minimal clones, which hardcode their implementation in
 * bytecode and can never be upgraded: pools created before an implementation
 * change were stranded on the old code forever, and each change forked the pool
 * population again. `LendingPool` also inherited `UUPSUpgradeable` under
 * that scheme, which advertised an upgrade path it did not have — calling
 * `upgradeToAndCall` on a clone wrote the ERC-1967 slot that a minimal proxy
 * never reads, so it reported success and changed nothing.
 *
 * Pools created before this change keep their old implementation permanently;
 * nothing can reach them. Everything created from here on upgrades together.
 *
 * Features:
 * - Creates lending pools as beacon proxies, upgradeable as a set
 * - Maintains registry of all deployed pools
 * - Supports both ERC20 and native POL pools
 * - Owner-controlled pool creation with multi-sig compatibility
 * - Comprehensive event logging and pool tracking
 */
contract PoolFactory is
    Initializable,
    Ownable2StepUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardTransient,
    UUPSUpgradeable
{
    /// @dev Pool creation parameters
    struct PoolParams {
        uint256 maxLoanAmount;
        uint256 interestRate;
        uint256 loanDuration;
        string name;
        string description;
        /**
         * @dev Whether the new pool is a private trust circle, whose owner
         * admits members, or open to anyone who funds it. Appended last so the
         * existing field order — which the mobile ABI and every caller encode
         * positionally — is untouched.
         */
        bool requiresMembership;
        /**
         * @dev The ERC-20 the new pool is denominated in, or `address(0)` for
         * native POL. Appended last for the same reason `requiresMembership`
         * was: the mobile ABI and every script encode these fields positionally,
         * so inserting anywhere else silently reinterprets every existing
         * caller's arguments.
         *
         * Validated against `authorizedLoanTokens` — a pool denominated in an
         * arbitrary address is either unusable, because the app cannot format
         * it, or a rug, because its "stablecoin" is a contract the pool's own
         * owner controls.
         */
        address loanToken;
    }

    /// @dev Pool registry information - optimized for gas efficiency
    struct PoolInfo {
        address poolAddress;      // 20 bytes
        address poolOwner;        // 20 bytes - cannot fit together (40 bytes > 32)
        bool isActive;            // 1 byte - fits with poolOwner (21 bytes total)
        uint256 maxLoanAmount;    // 32 bytes - new slot
        uint256 interestRate;     // 32 bytes - new slot
        uint256 loanDuration;     // 32 bytes - new slot
        uint256 createdAt;        // 32 bytes - new slot
        string name;              // 32 bytes - new slot
        string description;       // 32 bytes - new slot
        /**
         * @dev What the pool lends, mirrored from its `PoolConfig`.
         *
         * Appended last, and safe to append: `pools` is a mapping, so each entry
         * hashes to its own base slot and a wider struct extends into words that
         * were never allocated. A pool registered before this field reads
         * `address(0)` here, which is exactly what it is — native.
         *
         * Carried here as well as on the pool so `getPoolsRange` can hand back a
         * denominated list in one call. Reading it per pool instead would cost
         * an RPC round trip per card in a scrolling list, which is the same
         * price that keeps `requiresMembership` off the pool cards.
         *
         * Unlike `requiresMembership`, this one cannot go stale: the pool has no
         * setter for it.
         */
        address loanToken;        // 32 bytes - new slot
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

    /**
     * @notice The beacon every pool proxies through
     * @dev Appended after `isWhitelistEnabled` on purpose: this factory is itself
     * behind a UUPS proxy, so storage may only ever grow at the end. Owned by the
     * factory, which is what lets `updateImplementation` stay `onlyOwner`.
     */
    UpgradeableBeacon public poolBeacon;

    /**
     * @notice Tokens a pool may be denominated in
     * @dev Appended after `poolBeacon`, for the reason that one was appended
     * after `isWhitelistEnabled`: this factory sits behind a UUPS proxy, so its
     * storage may only ever grow at the end.
     *
     * A curated list rather than a free-form address, and the second reason is
     * the real one:
     *
     * - a pool denominated in a token the app cannot format is unusable, since
     *   decimals decide whether a balance reads as 5 or as 5,000,000;
     * - an arbitrary-token pool is a rug vector — a pool whose "stablecoin" is a
     *   contract its own owner wrote, sitting in Discover beside the rest.
     *
     * `address(0)` is never in here and never needs to be: native POL is the
     * absence of a token, and `createPool` lets it through without asking.
     */
    mapping(address => bool) public authorizedLoanTokens;

    /**
     * @notice The address allowed to whitelist pool creators, besides the owner
     * @dev Appended after `authorizedLoanTokens`, for the reason everything
     * here is appended: this factory sits behind a UUPS proxy.
     *
     * **This exists to keep one key out of the other's job.** `createPool` is
     * gated on `authorizedCreators`, and the backend adds a wallet to that list
     * on demand and pays the gas — so the wallet that does it must be able to
     * call `setCreatorAuthorization`. That was `onlyOwner`, which made the
     * backend's hot key the factory *owner*: the same key that authorises a
     * UUPS upgrade and that can point the beacon at new pool logic. One write
     * there replaces the implementation of every pool at once, so a key living
     * in a server's environment held every member's money.
     *
     * The two powers are now separable. Ownership goes to the Safe — upgrades,
     * pause, the token allowlist, and the right to appoint this role. This
     * address may do exactly one thing: add and remove pool creators. Losing it
     * costs a spam list, not the protocol.
     *
     * Zero by default, which is the world before this existed: only the owner
     * may authorise creators. Nothing has to be migrated.
     */
    address public poolCreatorAdmin;

    /// @notice Events
    /**
     * @notice Emitted when a new lending pool is created
     * @param poolId Unique identifier of the created pool
     * @param poolAddress Address of the deployed pool contract
     * @param poolOwner Address of the pool owner
     * @param name Name of the pool
     * @param maxLoanAmount Maximum loan amount allowed in the pool
     * @param interestRate Interest rate for loans (in basis points)
     * @param loanDuration Duration of loans in seconds
     */
    event PoolCreated(
        uint256 indexed poolId,
        address indexed poolAddress,
        address indexed poolOwner,
        string name,
        uint256 maxLoanAmount,
        uint256 interestRate,
        uint256 loanDuration
    );

    /**
     * @notice Emitted when a pool is deactivated by the factory owner
     * @param poolId Unique identifier of the deactivated pool
     * @param poolAddress Address of the deactivated pool contract
     */
    event PoolDeactivated(uint256 indexed poolId, address indexed poolAddress);
    /**
     * @notice Emitted when a previously deactivated pool is reactivated
     * @param poolId Unique identifier of the reactivated pool
     * @param poolAddress Address of the reactivated pool contract
     */
    event PoolReactivated(uint256 indexed poolId, address indexed poolAddress);
    /**
     * @notice Emitted when the lending pool implementation is updated
     * @param oldImplementation Address of the previous implementation
     * @param newImplementation Address of the new implementation
     */
    event ImplementationUpdated(
        address indexed oldImplementation,
        address indexed newImplementation
    );

    /**
     * @notice Emitted when a creator's authorization status is changed
     * @param creator Address of the creator
     * @param authorized Whether the creator is now authorized
     */
    event CreatorAuthorized(address indexed creator, bool indexed authorized);
    /**
     * @notice Emitted when whitelist mode is enabled or disabled
     * @param enabled Whether whitelist mode is now enabled
     */
    event WhitelistModeChanged(bool indexed enabled);
    /**
     * @notice Emitted when a token is allowed or disallowed as a pool's denomination
     * @param token Address of the ERC-20
     * @param authorized Whether pools may now be denominated in it
     * @dev Shaped like `CreatorAuthorized`: both parameters indexed, `data`
     * empty, so the two decode the same way off chain.
     *
     * Disallowing a token does **not** touch pools already denominated in it.
     * They hold real balances and real debts in it, and a pool that could not
     * be repaid because the factory changed its mind would strand both sides.
     * This gate is on creation only.
     */
    event LoanTokenAuthorized(address indexed token, bool indexed authorized);
    /**
     * @notice Emitted when the owner appoints or clears the pool-creator admin
     * @param admin The address that may now whitelist creators, or `address(0)`
     * @dev On the public record because it is a delegation of the owner's
     * authority: anyone reading the chain can see which key was trusted with
     * it, and when it changed.
     */
    event PoolCreatorAdminChanged(address indexed admin);

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
    /// @dev `migrateToBeacon` is a one-time migration; a second call is a mistake.
    error BeaconAlreadySet();
    error UnauthorizedCreator();
    /// @dev Creating a pool denominated in a token the factory has not allowed.
    error UnauthorizedLoanToken();
    /**
     * @dev Authorizing something that cannot be a pool's denomination.
     *
     * Either `address(0)`, which is how a pool says "native" and so is not a
     * token to allow; or an address with no code, which is the shape a
     * mistyped token address takes and which would deploy a pool that reverts
     * on its first deposit.
     */
    error InvalidLoanToken();
    /**
     * @dev `renounceOwnership`, which this contract does not allow.
     *
     * An unowned factory can never be upgraded, can never appoint a
     * `poolCreatorAdmin`, and — with the whitelist off — can never create
     * another pool. Nothing recovers from it.
     */
    error OwnershipCannotBeRenounced();

    /**
     * @notice Locks the implementation contract against initialization
     * @dev Runs at deployment of the *implementation*, never through the proxy
     * — a constructor's code is not part of the runtime bytecode a proxy
     * delegates to, which is why upgradeable contracts have `initialize` at
     * all.
     *
     * Without this the implementation sits on chain uninitialized, and anyone
     * can call `initialize` on it directly and own it. It is not a route into
     * the proxy's storage, and `upgradeToAndCall` is `onlyProxy` so it cannot
     * be driven from there either — but "no exploit we can currently name" is
     * not a security property, and the whole cost of closing it is this
     * constructor.
     *
     * @custom:oz-upgrades-unsafe-allow constructor
     */
    constructor() {
        _disableInitializers();
    }

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
     * @notice Initialize the factory contract with owner and implementation
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

        // The beacon owns the upgrade path for every pool this factory creates.
        // `lendingPoolImplementation` is kept in step with it so existing readers
        // — scripts, tests, the backend — keep working unchanged.
        poolBeacon = new UpgradeableBeacon(_implementation, address(this));
        lendingPoolImplementation = _implementation;
        poolCount = 0;

        // Initialize with whitelist disabled (owner-only by default)
        isWhitelistEnabled = false;
    }

    /**
     * @notice Authorize contract upgrades (only owner)
     * @dev Required by UUPSUpgradeable to authorize upgrades
     * @param newImplementation Address of the new implementation contract
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal view override onlyOwner {
        // Only owner can authorize upgrades
        // Additional upgrade logic can be added here if needed
        // For now, the onlyOwner modifier provides sufficient access control
        // Validation of newImplementation address could be added here
        if (newImplementation == address(0)) revert ImplementationNotSet();
    }

    /**
     * @notice Create a new lending pool
     * @dev Pool owner is automatically set to msg.sender
     * @dev Requires caller to be whitelisted (lazy whitelisting via backend)
     * @dev Function exceeds 50-line limit but maintains readability
     * @param _params Pool creation parameters struct
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
        // Validate pool owner (msg.sender becomes pool owner)
        if (msg.sender == address(0)) revert InvalidPoolOwner();

        // Enhanced pool owner validation
        _validatePoolOwner(msg.sender);

        // Validate parameters
        if (_params.maxLoanAmount == 0) revert InvalidMaxLoanAmount();
        if (_params.interestRate > 10000) revert InvalidInterestRate(); // Max 100%
        if (_params.loanDuration == 0) revert InvalidLoanDuration();
        if (bytes(_params.name).length == 0) revert EmptyName();
        // `address(0)` is native POL and always allowed; anything else has to
        // be on the list. See `authorizedLoanTokens`.
        if (
            _params.loanToken != address(0) &&
            !authorizedLoanTokens[_params.loanToken]
        ) revert UnauthorizedLoanToken();
        if (address(poolBeacon) == address(0)) revert ImplementationNotSet();

        // Deploy a beacon proxy. Unlike a clone this keeps no implementation of
        // its own — it asks the beacon on every call — which is what lets one
        // upgrade reach every pool.
        poolAddress = address(new BeaconProxy(address(poolBeacon), ""));
        if (poolAddress == address(0)) revert PoolCreationFailed();

        // Initialize the new pool (msg.sender becomes pool owner)
        LendingPool(poolAddress).initialize(
            msg.sender,
            _params.maxLoanAmount,
            _params.interestRate,
            _params.loanDuration,
            _params.requiresMembership,
            _params.loanToken
        );

        // Increment pool count and assign ID (using pre-increment for gas efficiency)
        poolId = ++poolCount;

        // Store pool information (msg.sender becomes pool owner)
        pools[poolId] = PoolInfo({
            poolAddress: poolAddress,
            poolOwner: msg.sender,
            maxLoanAmount: _params.maxLoanAmount,
            interestRate: _params.interestRate,
            loanDuration: _params.loanDuration,
            name: _params.name,
            description: _params.description,
            createdAt: block.timestamp,
            isActive: true,
            loanToken: _params.loanToken
        });

        // Update mappings
        poolAddressToId[poolAddress] = poolId;
        ownerToPools[msg.sender].push(poolId);
        allPools.push(poolAddress);

        emit PoolCreated(
            poolId,
            poolAddress,
            msg.sender,
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

        for (uint256 i = 0; i < length; ++i) {
            uint256 poolId = _start + i;
            poolIds[i] = poolId;
            poolInfos[i] = pools[poolId];
        }
    }

    /**
     * @notice Hide a pool from discovery (only owner)
     * @param _poolId The pool ID to hide
     * @dev **This is moderation, not a kill switch, and reading it as one is
     * the mistake worth guarding against.** It writes a flag on the *registry
     * entry*, which is what `listPools` filters on — so the pool stops being
     * discoverable. The pool contract itself is untouched: it goes on taking
     * deposits, lending and accepting repayments from anyone who holds its
     * address, because nothing in `LendingPool` reads this.
     *
     * The pool's own switch is `LendingPool.togglePoolStatus`, which *is*
     * binding — `createLoan`, `requestLoan` and `requestMembership` all check
     * it — and belongs to the pool's owner rather than to this factory's. There
     * is deliberately no path from here to there: a protocol operator who could
     * close somebody's pool could strand its members mid-loan, and the pools
     * are other people's.
     *
     * So the honest description of what this can do about a bad pool is: stop
     * showing it to people who have not found it yet.
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

        // This is the whole point of the beacon: one write, and every pool ever
        // created through it runs the new code — including pools that already
        // exist. Under the old clone scheme this only affected future pools.
        poolBeacon.upgradeTo(_newImplementation);
        lendingPoolImplementation = _newImplementation;

        emit ImplementationUpdated(oldImplementation, _newImplementation);
    }

    /**
     * @notice Create the beacon for a factory deployed before beacons existed
     * @dev A factory upgraded in place has no beacon: `initialize` already ran,
     * so the constructor-time creation above never happened for it. This runs
     * once, seeded from whatever implementation the factory was last pointed at.
     * Pools created before it stay on their hardcoded clone implementation —
     * nothing can move them.
     */
    function migrateToBeacon() external onlyOwner reinitializer(2) {
        if (address(poolBeacon) != address(0)) revert BeaconAlreadySet();
        if (lendingPoolImplementation == address(0))
            revert ImplementationNotSet();

        poolBeacon = new UpgradeableBeacon(
            lendingPoolImplementation,
            address(this)
        );
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
     * @notice Disabled. This factory cannot be left without an owner.
     * @dev Inherited from `Ownable`, where it exists for contracts that are
     * meant to become autonomous. This one is the opposite: the owner
     * authorises every UUPS upgrade, owns the beacon that every pool's logic
     * hangs from, appoints `poolCreatorAdmin`, and is the only address that can
     * create a pool while the whitelist is off. An owner of `address(0)` ends
     * all of that permanently, and there is no recovery — not even an upgrade,
     * because authorising one is itself `onlyOwner`.
     *
     * `Ownable2Step` already makes *transferring* safe by requiring the new
     * owner to accept. This closes the one path that transfers to nobody.
     */
    function renounceOwnership() public view override onlyOwner {
        revert OwnershipCannotBeRenounced();
    }

    /**
     * @notice Get contract version
     * @return version Version string of the contract
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
     * @dev The owner **or** `poolCreatorAdmin`. Deliberately no longer
     * `onlyOwner`: the backend whitelists a wallet on demand and pays the gas,
     * so requiring ownership here meant the backend's hot key had to be the
     * factory owner — and therefore had to hold the upgrade authority over
     * every pool. See `poolCreatorAdmin`.
     */
    function setCreatorAuthorization(
        address _creator,
        bool _authorized
    ) external {
        // The owner, or the one address it has delegated this single power to.
        // See `poolCreatorAdmin` for why the two are not the same key.
        if (msg.sender != owner() && msg.sender != poolCreatorAdmin) {
            revert UnauthorizedCreator();
        }

        if (_creator == address(0)) revert InvalidPoolOwner();

        authorizedCreators[_creator] = _authorized;
        emit CreatorAuthorized(_creator, _authorized);
    }

    /**
     * @notice Appoint the address that may whitelist pool creators (only owner)
     * @param _admin The backend's wallet, or `address(0)` to withdraw the role
     * @dev The point of the whole arrangement: this is the only power the
     * owner can hand out, and it is the only one the backend needs. Set it to
     * the backend wallet, then transfer ownership to the Safe — after that a
     * compromised backend key can add a spam creator and nothing else.
     *
     * One address rather than a mapping, because one backend calls this. A
     * second would be a list, and a list of keys that can each be lost is a
     * worse thing to own than one that can be replaced in a single
     * transaction.
     *
     * Clearing it is `address(0)`, which is also the default — so "no
     * delegate" is the zero value and needs no migration.
     */
    function setPoolCreatorAdmin(address _admin) external onlyOwner {
        poolCreatorAdmin = _admin;

        emit PoolCreatorAdminChanged(_admin);
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
     * @notice Allow or disallow a token as a pool denomination (only owner)
     * @param _token Address of the ERC-20
     * @param _authorized Whether pools may be denominated in it
     * @dev Only affects pools created from here on; see `LoanTokenAuthorized`
     * for why disallowing cannot reach back.
     */
    function setLoanTokenAuthorization(
        address _token,
        bool _authorized
    ) external onlyOwner {
        // `address(0)` is not a token that could be allowed or refused — it is
        // how a pool says it is native, which `createPool` never consults this
        // list about. Accepting it would write a flag nothing reads.
        if (_token == address(0)) revert InvalidLoanToken();

        // A token address with no code behind it is the shape a typo takes.
        // Cheap to catch here, where the owner is watching, rather than at the
        // first deposit into a pool that can never hold anything.
        if (_token.code.length == 0) revert InvalidLoanToken();

        authorizedLoanTokens[_token] = _authorized;

        emit LoanTokenAuthorized(_token, _authorized);
    }

    /**
     * @notice Whether a pool may be denominated in a token
     * @param _token Address to check, or `address(0)` for native POL
     * @return True if `createPool` would accept it
     * @dev Answers `true` for `address(0)`: every pool may be native, and a
     * caller checking before it creates should not have to special-case the
     * denomination that needs no permission.
     */
    function isAuthorizedLoanToken(
        address _token
    ) external view returns (bool) {
        if (_token == address(0)) return true;

        return authorizedLoanTokens[_token];
    }

    /**
     * @notice Refuse the two addresses that cannot coherently own a pool
     * @param _poolOwner Address to validate as pool owner
     * @dev Contracts are allowed on purpose — a Safe owning a pool is a
     * feature, not something to guard against. Only two addresses are refused,
     * and both because owning a pool would mean something circular: this
     * factory, and the shared implementation every pool delegates to.
     *
     * It used to read `extcodesize` into a local and never look at it, under a
     * comment about a "soft check" that flagged contracts for review. Nothing
     * reviewed anything; the value was written and dropped, so the only effect
     * was the gas. Deleting it changes no behaviour — which is exactly why it
     * was worth checking before deleting rather than after.
     */
    function _validatePoolOwner(address _poolOwner) internal view {
        // Circular: the factory would own a pool it created.
        if (_poolOwner == address(this)) {
            revert InvalidPoolOwnerAddress();
        }

        // Circular in the other direction: the implementation every pool
        // delegates to would own one of them.
        if (_poolOwner == lendingPoolImplementation) {
            revert InvalidPoolOwnerAddress();
        }
    }
}
