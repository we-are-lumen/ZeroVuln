// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ZVContract
 * - Fee gate untuk fitur CodeGen & Analyze (0.1 0g per call)
 * - Admin bisa mengalokasikan reward ke submitter saat finding di-approve
 * - User bisa claim reward dari contract
 *
 * Catatan:
 * - Contract ini pakai native token chain (diasumsikan 0g adalah native currency).
 * - Backend/FE bisa memverifikasi pembayaran/reward lewat event yang di-emit.
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

  // Default: 0.1 0g (diasumsikan 18 decimals seperti Ether)
  uint256 public featureFee = 0.1 ether;

  // Rewards
  mapping(address => uint256) public claimableRewards;
  mapping(bytes32 => bool) public rewardAllocated; // prevent double-allocate per finding
  uint256 public totalOutstandingRewards;

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

  /**
   * Owner withdraw sisa dana (misal fee revenue).
   * Note: tetap menjaga outstanding rewards agar contract tetap solvable.
   */
  function ownerWithdraw(address payable to, uint256 amount)
    external
    onlyOwner
    nonReentrant
  {
    if (to == address(0)) revert ZeroAddress();
    if (amount == 0) revert ZeroAmount();

    uint256 balance = address(this).balance;
    // Jangan biarkan withdraw mengganggu kemampuan bayar rewards.
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
   * Bayar untuk menggunakan fitur (CodeGen / Analyze).
   * refId opsional: bisa diisi contract_uuid / audit_uuid / request id.
   * Jika user kirim > featureFee, contract akan refund kelebihan.
   */
  function payForFeature(Feature feature, bytes32 refId) external payable nonReentrant {
    uint256 fee = featureFee;
    if (msg.value < fee) revert InvalidFee(fee, msg.value);

    // Refund kelebihan (kalau ada)
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
  /**
   * Dipanggil admin saat approve finding.
   * findingId: sebaiknya hash dari auditor_finding_uuid (misal keccak256(uuidString)).
   */
  function allocateReward(bytes32 findingId, address submitter, uint256 amount)
    external
    onlyAdmin
  {
    if (submitter == address(0)) revert ZeroAddress();
    if (amount == 0) revert ZeroAmount();
    if (rewardAllocated[findingId]) revert AlreadyAllocated(findingId);

    // Ensure solvency: contract harus punya balance cukup untuk outstanding + amount baru
    uint256 balance = address(this).balance;
    uint256 required = totalOutstandingRewards + amount;
    if (balance < required) revert InsufficientContractBalance(required, balance);

    rewardAllocated[findingId] = true;
    claimableRewards[submitter] += amount;
    totalOutstandingRewards = required;

    emit RewardAllocated(findingId, submitter, amount);
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

