// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ZVContract
 * - Fee gate for the CodeGen & Analyze features (0.1 0g per call)
 * - Admins can allocate rewards to a submitter when a finding is approved
 * - Users can claim rewards from the contract
 *
 * Notes:
 * - This contract uses the chain's native token (0g is assumed to be the native currency).
 * - Backend/FE can verify payments and rewards via the emitted events.
 */
contract ZVContract {
  // =========================
  // Errors
  // =========================
  error NotOwner();
  error NotAdmin();
  error InvalidFee(uint256 required, uint256 sent);
  error ZeroAddress();
  error ZeroAmount();
  error AlreadyAllocated(bytes32 findingId);
  error InsufficientContractBalance(uint256 required, uint256 balance);
  error NothingToClaim();
  error TransferFailed();

  // =========================
  // Events
  // =========================
  event AdminSet(address indexed admin, bool enabled);
  event FeatureFeeUpdated(uint256 oldFee, uint256 newFee);

  event FeaturePaid(
    address indexed payer,
    uint8 indexed feature,
    uint256 amount,
    bytes32 indexed refId
  );

  event RewardAllocated(
    bytes32 indexed findingId,
    address indexed submitter,
    uint256 amount
  );

  event CatalogRewardUpdated(bytes32 indexed catalogId, uint256 rewardPerFinding);

  event RewardClaimed(address indexed submitter, uint256 amount);
  event OwnerWithdraw(address indexed to, uint256 amount);
  event Funded(address indexed from, uint256 amount);

  // =========================
  // Access control
  // =========================
  address public owner;
  mapping(address => bool) public admins;

  modifier onlyOwner() {
    if (msg.sender != owner) revert NotOwner();
    _;
  }

  modifier onlyAdmin() {
    if (!admins[msg.sender]) revert NotAdmin();
    _;
  }

  // =========================
  // Business logic
  // =========================
  enum Feature {
    CodeGen,
    Analyze
  }

  // Default: 0.1 0g (assumed to use 18 decimals, same as Ether)
  uint256 public featureFee = 0.1 ether;

  // Rewards
  mapping(address => uint256) public claimableRewards;
  mapping(bytes32 => bool) public rewardAllocated; // prevent double-allocate per finding
  uint256 public totalOutstandingRewards;

  /**
   * Reward-per-finding for a catalog contract.
   * - catalogId: bytes32 (recommended: keccak256(bytes(<contract_catalog_uuid_string>))).
   * - value: amount in wei (native token). 1 0g = 1e18 wei.
   */
  mapping(bytes32 => uint256) public catalogRewardPerFinding;

  // =========================
  // Reentrancy guard (minimal)
  // =========================
  uint256 private _locked = 1;
  modifier nonReentrant() {
    require(_locked == 1, "REENTRANCY");
    _locked = 2;
    _;
    _locked = 1;
  }

  constructor() {
    owner = msg.sender;
    admins[msg.sender] = true;
    emit AdminSet(msg.sender, true);
  }

  // =========================
  // Admin / owner ops
  // =========================
  function setAdmin(address admin, bool enabled) external onlyOwner {
    if (admin == address(0)) revert ZeroAddress();
    admins[admin] = enabled;
    emit AdminSet(admin, enabled);
  }

  function setFeatureFee(uint256 newFee) external onlyOwner {
    if (newFee == 0) revert ZeroAmount();
    uint256 old = featureFee;
    featureFee = newFee;
    emit FeatureFeeUpdated(old, newFee);
  }

  function setCatalogReward(bytes32 catalogId, uint256 rewardPerFindingWei)
    external
    onlyAdmin
  {
    if (catalogId == bytes32(0)) revert ZeroAmount();
    catalogRewardPerFinding[catalogId] = rewardPerFindingWei;
    emit CatalogRewardUpdated(catalogId, rewardPerFindingWei);
  }

  /**
   * Owner withdraws leftover funds (e.g. fee revenue).
   * Note: preserves outstanding rewards so the contract remains solvent.
   */
  function ownerWithdraw(address payable to, uint256 amount)
    external
    onlyOwner
    nonReentrant
  {
    if (to == address(0)) revert ZeroAddress();
    if (amount == 0) revert ZeroAmount();

    uint256 balance = address(this).balance;
    // Don't let withdrawals compromise the ability to pay out rewards.
    if (balance < totalOutstandingRewards + amount) {
      revert InsufficientContractBalance(totalOutstandingRewards + amount, balance);
    }

    (bool ok, ) = to.call{ value: amount }("");
    if (!ok) revert TransferFailed();
    emit OwnerWithdraw(to, amount);
  }

  // =========================
  // Fee gate
  // =========================
  /**
   * Pay to use a feature (CodeGen / Analyze).
   * refId is optional: can be contract_uuid / audit_uuid / request id.
   * If msg.value > featureFee, the contract refunds the excess.
   */
  function payForFeature(Feature feature, bytes32 refId) external payable nonReentrant {
    uint256 fee = featureFee;
    if (msg.value < fee) revert InvalidFee(fee, msg.value);

    // Refund the excess (if any)
    uint256 change = msg.value - fee;
    if (change > 0) {
      (bool ok, ) = payable(msg.sender).call{ value: change }("");
      if (!ok) revert TransferFailed();
    }

    emit FeaturePaid(msg.sender, uint8(feature), fee, refId);
  }

  // =========================
  // Reward flow
  // =========================
  function _allocateReward(bytes32 findingId, address submitter, uint256 amount) internal {
    if (submitter == address(0)) revert ZeroAddress();
    if (amount == 0) revert ZeroAmount();
    if (rewardAllocated[findingId]) revert AlreadyAllocated(findingId);

    // Ensure solvency: contract balance must cover outstanding + the new amount
    uint256 balance = address(this).balance;
    uint256 required = totalOutstandingRewards + amount;
    if (balance < required) revert InsufficientContractBalance(required, balance);

    rewardAllocated[findingId] = true;
    claimableRewards[submitter] += amount;
    totalOutstandingRewards = required;

    emit RewardAllocated(findingId, submitter, amount);
  }

  /**
   * Called by an admin when approving a finding.
   * findingId: should be a hash of auditor_finding_uuid (e.g. keccak256(uuidString)).
   */
  function allocateReward(bytes32 findingId, address submitter, uint256 amount)
    external
    onlyAdmin
  {
    _allocateReward(findingId, submitter, amount);
  }

  /**
   * Reward variant that follows the reward_per_finding config from a catalog contract.
   * catalogId: recommended to hash contract_catalog.uuid (keccak256(bytes(uuidString))).
   */
  function allocateRewardFromCatalog(bytes32 findingId, bytes32 catalogId, address submitter)
    external
    onlyAdmin
  {
    uint256 amount = catalogRewardPerFinding[catalogId];
    if (amount == 0) revert ZeroAmount();
    _allocateReward(findingId, submitter, amount);
  }

  function claimReward() external nonReentrant {
    uint256 amount = claimableRewards[msg.sender];
    if (amount == 0) revert NothingToClaim();

    // Effects first
    claimableRewards[msg.sender] = 0;
    totalOutstandingRewards -= amount;

    // Interaction
    (bool ok, ) = payable(msg.sender).call{ value: amount }("");
    if (!ok) revert TransferFailed();

    emit RewardClaimed(msg.sender, amount);
  }

  // =========================
  // Funding
  // =========================
  function fund() external payable {
    if (msg.value == 0) revert ZeroAmount();
    emit Funded(msg.sender, msg.value);
  }

  receive() external payable {
    emit Funded(msg.sender, msg.value);
  }
}
