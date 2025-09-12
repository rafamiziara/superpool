/**
 * ABI definitions for smart contracts
 */

export const PoolFactoryABI = [
  // Events
  'event PoolCreated(uint256 indexed poolId, address indexed poolAddress, address indexed poolOwner, string name, uint256 maxLoanAmount, uint256 interestRate, uint256 loanDuration)',
  'event PoolDeactivated(uint256 indexed poolId, address indexed poolAddress)',
  'event PoolReactivated(uint256 indexed poolId, address indexed poolAddress)',
  'event ImplementationUpdated(address indexed oldImplementation, address indexed newImplementation)',
  'event CreatorAuthorized(address indexed creator, bool authorized)',
  'event WhitelistModeChanged(bool enabled)',

  // View functions
  'function getPoolAddress(uint256 _poolId) external view returns (address)',
  'function getPoolCount() external view returns (uint256)',
  'function getPoolInfo(uint256 _poolId) external view returns (tuple(address poolAddress, address poolOwner, uint256 maxLoanAmount, uint256 interestRate, uint256 loanDuration, string name, string description, uint256 createdAt, bool isActive))',
  'function getPoolId(address _poolAddress) external view returns (uint256)',
  'function getPoolsByOwner(address _owner) external view returns (uint256[] memory)',
  'function getPoolsRange(uint256 _start, uint256 _limit) external view returns (uint256[] memory poolIds, tuple(address poolAddress, address poolOwner, uint256 maxLoanAmount, uint256 interestRate, uint256 loanDuration, string name, string description, uint256 createdAt, bool isActive)[] memory poolInfos)',
  'function isPoolActive(uint256 _poolId) external view returns (bool)',
  'function isAuthorizedCreator(address _creator) external view returns (bool)',
  'function getOwnershipStatus() external view returns (address currentOwner, address pendingOwnerAddress, bool hasPendingTransfer)',
  'function version() external pure returns (string memory)',

  // State-changing functions
  'function createPool(tuple(address poolOwner, uint256 maxLoanAmount, uint256 interestRate, uint256 loanDuration, string name, string description) calldata _params) external returns (uint256 poolId, address poolAddress)',
  'function deactivatePool(uint256 _poolId) external',
  'function reactivatePool(uint256 _poolId) external',
  'function updateImplementation(address _newImplementation) external',
  'function setCreatorAuthorization(address _creator, bool _authorized) external',
  'function setWhitelistMode(bool _enabled) external',
  'function pause() external',
  'function unpause() external',
  'function emergencyPause() external',
  'function emergencyUnpause() external',

  // Ownable functions
  'function owner() external view returns (address)',
  'function pendingOwner() external view returns (address)',
  'function transferOwnership(address newOwner) external',
  'function acceptOwnership() external',
  'function renounceOwnership() external',
] as const

export const SampleLendingPoolABI = [
  // Events
  'event LoanRequested(uint256 indexed loanId, address indexed borrower, uint256 amount, uint256 duration)',
  'event LoanApproved(uint256 indexed loanId, address indexed lender)',
  'event LoanDisbursed(uint256 indexed loanId, uint256 amount)',
  'event LoanRepaid(uint256 indexed loanId, uint256 amount, uint256 interest)',
  'event LoanDefaulted(uint256 indexed loanId)',
  'event FundsDeposited(address indexed lender, uint256 amount)',
  'event FundsWithdrawn(address indexed lender, uint256 amount)',

  // View functions
  'function owner() external view returns (address)',
  'function maxLoanAmount() external view returns (uint256)',
  'function interestRate() external view returns (uint256)',
  'function loanDuration() external view returns (uint256)',
  'function totalDeposits() external view returns (uint256)',
  'function availableFunds() external view returns (uint256)',
  'function loanCount() external view returns (uint256)',

  // State-changing functions
  'function initialize(address _owner, uint256 _maxLoanAmount, uint256 _interestRate, uint256 _loanDuration) external',
  'function deposit() external payable',
  'function withdraw(uint256 amount) external',
  'function requestLoan(uint256 amount, uint256 duration) external',
  'function approveLoan(uint256 loanId) external',
  'function disburseLoan(uint256 loanId) external',
  'function repayLoan(uint256 loanId) external payable',
] as const
