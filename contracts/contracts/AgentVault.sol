// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {IAccount} from "@account-abstraction/contracts/interfaces/IAccount.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {_packValidationData, SIG_VALIDATION_FAILED} from "@account-abstraction/contracts/core/Helpers.sol";

/// @title AgentVault
/// @notice Multi-tenant spend-authorization vault for AI agents.
///
/// One contract, one pooled ERC-20 balance - but every deposit is tracked against the
/// depositing address internally, so many independent users can share the same contract
/// without ever being able to touch each other's funds. A "user" deposits, registers their
/// own agents with a spend policy (caps, whitelist, expiry, approval threshold, blacklist),
/// and only that user can manage those agents or withdraw their own tracked balance. Agents
/// never hold funds; they hold scoped permission to trigger transfers out of the *registering
/// user's* balance, enforced on-chain by `_authorizeAndSpend` on every call.
///
/// There is no protocol-wide admin over user funds or user agents - every user is sovereign
/// over their own slice of the pool. (The one exception is the EntryPoint gas-float deposit
/// used for Door 2, which is an operational concern about this contract's own MON balance,
/// not user treasury - that stays behind the deployer-controlled `onlyOwner`. See
/// `fundEntryPointDeposit` / `withdrawEntryPointDeposit`.)
///
/// One policy engine, two entry points ("doors"):
///   Door 1 - `spend()`         agent calls directly, msg.sender is the agent's own EOA.
///   Door 2 - ERC-4337          agent signs a UserOperation; a bundler submits it to the
///                              canonical EntryPoint, which calls `validateUserOp` then
///                              `executeFromEntryPoint` on this contract. A paymaster can
///                              sponsor gas so the agent needs zero native balance.
///
/// Zero-value convention (documented once, applies throughout):
///   - perTxCap / dailyCap        : 0 means the agent may spend nothing (safe-by-default deny).
///   - validAfter                 : 0 means valid immediately.
///   - validUntil                 : 0 means never expires.
///   - approvalThreshold          : 0 means no human-approval gate (always auto-execute, still
///                                  subject to the caps above).
///   - userVelocityCap            : 0 means that user's circuit breaker is disabled (opt-in).
contract AgentVault is Ownable, ReentrancyGuard, IAccount {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    struct AgentPolicy {
        bool active; // false = revoked/frozen; spends rejected
        uint256 perTxCap; // max value of a single spend
        uint256 dailyCap; // max total spend per rolling day
        uint256 spentToday; // running total for current window
        uint256 windowStart; // timestamp the current daily window began
        uint256 approvalThreshold; // spends >= this go to the approval queue instead of executing
        uint256 validAfter; // policy inactive before this timestamp (0 = immediately)
        uint256 validUntil; // policy auto-expires at this timestamp (0 = never)
        bool whitelistOnly; // if true, recipient MUST be in allowedRecipients
    }

    /// @notice Input shape for registerAgent/updateAgent. Runtime counters
    /// (spentToday/windowStart) and `active` are managed internally and are not
    /// settable here, so the caller cannot accidentally corrupt live counters.
    struct PolicyParams {
        uint256 perTxCap;
        uint256 dailyCap;
        uint256 approvalThreshold;
        uint256 validAfter;
        uint256 validUntil;
        bool whitelistOnly;
    }

    struct PendingRequest {
        uint256 id;
        address agent;
        address to;
        uint256 amount;
        string memo;
        uint256 createdAt;
        uint8 status; // 0 = pending, 1 = approved/executed, 2 = rejected, 3 = cancelled
    }

    // ---------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------

    IERC20 public immutable token;
    IEntryPoint public immutable entryPoint;

    // Per-user pooled balance ledger - the ONLY thing that determines what a user's
    // agents can spend. Depositing/withdrawing never touches any other user's entry.
    mapping(address => uint256) public userBalance;

    mapping(address => AgentPolicy) public policies;
    mapping(address => bool) public agentExists;
    mapping(address => address) public agentOwner; // agent => the user who registered it
    mapping(address => mapping(address => bool)) public allowed; // agent => recipient => whitelisted
    mapping(address => mapping(address => bool)) public blacklisted; // user => recipient => blocked for ALL of that user's agents

    mapping(uint256 => PendingRequest) public requests;
    mapping(address => uint256[]) public agentRequestIds;
    uint256 public nextRequestId;

    // Circuit breaker - per user, not global. Only that user can pause/configure it, and
    // it only ever blocks that user's own agents.
    mapping(address => uint256) public userWindowStart;
    mapping(address => uint256) public userSpentInWindow;
    mapping(address => uint256) public userVelocityCap; // 0 = disabled
    mapping(address => bool) public userPaused;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event AgentRegistered(
        address indexed user,
        address indexed agent,
        uint256 perTxCap,
        uint256 dailyCap,
        uint256 approvalThreshold,
        uint256 validAfter,
        uint256 validUntil,
        bool whitelistOnly
    );
    event AgentUpdated(address indexed agent);
    event RecipientAllowed(address indexed agent, address indexed recipient, bool allowed);
    event RecipientBlacklisted(address indexed user, address indexed recipient, bool blocked);
    event AgentRevoked(address indexed agent);
    event SpendExecuted(address indexed agent, address indexed to, uint256 amount, string memo);
    event SpendBlocked(address indexed agent, address indexed to, uint256 amount, string memo, string reason);
    event SpendRequested(uint256 indexed id, address indexed agent, address indexed to, uint256 amount, string memo);
    event RequestApproved(uint256 indexed id, uint256 finalAmount);
    event RequestRejected(uint256 indexed id);
    event RequestCancelled(uint256 indexed id);
    event CircuitBreakerTripped(address indexed user, uint256 windowSpent, uint256 cap);
    event Paused(address indexed user, bool paused);

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(address _token, address _entryPoint, address initialOwner) Ownable(initialOwner) {
        require(_token != address(0), "token=0");
        require(_entryPoint != address(0), "entryPoint=0");
        token = IERC20(_token);
        entryPoint = IEntryPoint(_entryPoint);
    }

    receive() external payable {}

    // ---------------------------------------------------------------------
    // Users: funding (self-service, no admin gate - your deposit is only ever yours)
    // ---------------------------------------------------------------------

    /// @notice Deposit into your own pooled balance. Caller must approve this contract first.
    function deposit(uint256 amount) external {
        token.safeTransferFrom(msg.sender, address(this), amount);
        userBalance[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    /// @notice Withdraw up to your own tracked balance. Can never touch another user's funds.
    function withdraw(uint256 amount) external nonReentrant {
        require(userBalance[msg.sender] >= amount, "insufficient balance");
        userBalance[msg.sender] -= amount;
        token.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Users: agent lifecycle (only the registering user can manage their own agents)
    // ---------------------------------------------------------------------

    function registerAgent(address agent, PolicyParams calldata p) external {
        require(agent != address(0), "agent=0");
        require(!agentExists[agent], "already registered");
        require(
            p.approvalThreshold == 0 || p.approvalThreshold <= p.perTxCap,
            "approvalThreshold > perTxCap makes the queue unreachable"
        );

        agentExists[agent] = true;
        agentOwner[agent] = msg.sender;
        policies[agent] = AgentPolicy({
            active: true,
            perTxCap: p.perTxCap,
            dailyCap: p.dailyCap,
            spentToday: 0,
            windowStart: block.timestamp,
            approvalThreshold: p.approvalThreshold,
            validAfter: p.validAfter,
            validUntil: p.validUntil,
            whitelistOnly: p.whitelistOnly
        });

        emit AgentRegistered(
            msg.sender,
            agent,
            p.perTxCap,
            p.dailyCap,
            p.approvalThreshold,
            p.validAfter,
            p.validUntil,
            p.whitelistOnly
        );
    }

    /// @notice Update an existing agent's policy limits. Does not touch spentToday/windowStart
    /// (those are live counters) and does not reactivate a revoked agent — use revokeAgent /
    /// re-register semantics deliberately kept separate so a single "oops" update can't
    /// silently un-revoke a frozen agent.
    function updateAgent(address agent, PolicyParams calldata p) external {
        require(agentExists[agent], "not registered");
        require(agentOwner[agent] == msg.sender, "not your agent");
        require(
            p.approvalThreshold == 0 || p.approvalThreshold <= p.perTxCap,
            "approvalThreshold > perTxCap makes the queue unreachable"
        );

        AgentPolicy storage policy = policies[agent];
        policy.perTxCap = p.perTxCap;
        policy.dailyCap = p.dailyCap;
        policy.approvalThreshold = p.approvalThreshold;
        policy.validAfter = p.validAfter;
        policy.validUntil = p.validUntil;
        policy.whitelistOnly = p.whitelistOnly;

        emit AgentUpdated(agent);
    }

    function setRecipient(address agent, address recipient, bool ok) external {
        require(agentExists[agent], "not registered");
        require(agentOwner[agent] == msg.sender, "not your agent");
        allowed[agent][recipient] = ok;
        emit RecipientAllowed(agent, recipient, ok);
    }

    /// @notice Blacklist (or un-blacklist) a recipient for ALL of your agents at once,
    /// regardless of each agent's individual whitelist setting. A hard safety net: even an
    /// agent with whitelistOnly=false can never reach a blacklisted address.
    function setBlacklist(address recipient, bool blocked) external {
        blacklisted[msg.sender][recipient] = blocked;
        emit RecipientBlacklisted(msg.sender, recipient, blocked);
    }

    /// @notice Freeze an agent immediately and cancel all of its pending approval requests.
    function revokeAgent(address agent) external {
        require(agentExists[agent], "not registered");
        require(agentOwner[agent] == msg.sender, "not your agent");
        policies[agent].active = false;

        uint256[] storage ids = agentRequestIds[agent];
        for (uint256 i = 0; i < ids.length; i++) {
            PendingRequest storage r = requests[ids[i]];
            if (r.status == 0) {
                r.status = 3;
                emit RequestCancelled(r.id);
            }
        }

        emit AgentRevoked(agent);
    }

    // ---------------------------------------------------------------------
    // Users: approval queue (only the owning user of the request's agent)
    // ---------------------------------------------------------------------

    /// @notice Approve a pending request, optionally at a reduced amount (<= originally requested).
    /// @dev perTxCap is intentionally NOT re-checked here: it is a hard ceiling enforced before a
    /// spend ever reaches the queue (see _authorizeAndSpend step order), so any queued request is
    /// already <= perTxCap. Daily cap, the user's own balance/circuit breaker, and the recipient
    /// whitelist/blacklist are re-checked because time may have passed since the request was created.
    function approveRequest(uint256 id, uint256 finalAmount) external nonReentrant {
        PendingRequest storage r = requests[id];
        require(r.status == 0, "not pending");
        address user = agentOwner[r.agent];
        require(user == msg.sender, "not your agent");
        require(finalAmount > 0 && finalAmount <= r.amount, "invalid finalAmount");

        AgentPolicy storage policy = policies[r.agent];
        require(policy.active, "agent not active");
        require(!policy.whitelistOnly || allowed[r.agent][r.to], "recipient not whitelisted");
        require(!blacklisted[user][r.to], "recipient blacklisted");

        _rollAgentWindow(policy);
        require(policy.spentToday + finalAmount <= policy.dailyCap, "exceeds daily cap");

        require(userBalance[user] >= finalAmount, "insufficient balance");

        _rollUserWindow(user);
        require(
            userVelocityCap[user] == 0 || userSpentInWindow[user] + finalAmount <= userVelocityCap[user],
            "exceeds circuit breaker cap"
        );

        policy.spentToday += finalAmount;
        userSpentInWindow[user] += finalAmount;
        userBalance[user] -= finalAmount;
        r.status = 1;

        token.safeTransfer(r.to, finalAmount);
        emit RequestApproved(id, finalAmount);
        emit SpendExecuted(r.agent, r.to, finalAmount, r.memo);
    }

    function rejectRequest(uint256 id) external {
        PendingRequest storage r = requests[id];
        require(r.status == 0, "not pending");
        require(agentOwner[r.agent] == msg.sender, "not your agent");
        r.status = 2;
        emit RequestRejected(id);
    }

    // ---------------------------------------------------------------------
    // Users: circuit breaker (per user - only affects your own agents)
    // ---------------------------------------------------------------------

    function setVelocityCap(uint256 cap) external {
        userVelocityCap[msg.sender] = cap;
    }

    function setPaused(bool p) external {
        userPaused[msg.sender] = p;
        emit Paused(msg.sender, p);
    }

    // ---------------------------------------------------------------------
    // Door 1: direct call
    // ---------------------------------------------------------------------

    /// @notice Agent spends directly. msg.sender IS the agent identity, guaranteed by its
    /// own signature on the transaction - no auth server needed.
    function spend(address to, uint256 amount, string calldata memo) external nonReentrant {
        _authorizeAndSpend(msg.sender, to, amount, memo);
    }

    function getRequest(uint256 id) external view returns (PendingRequest memory) {
        return requests[id];
    }

    function getAgentRequestIds(address agent) external view returns (uint256[] memory) {
        return agentRequestIds[agent];
    }

    // ---------------------------------------------------------------------
    // Door 2: ERC-4337
    // ---------------------------------------------------------------------
    //
    // This vault acts as a single shared ERC-4337 "account" for every registered agent
    // (there is no per-agent smart-account deployment). `validateUserOp` recovers the
    // signer of the UserOperation and requires it to equal the `agent` address encoded
    // as the first parameter of `executeFromEntryPoint` in the UserOp's callData. Because
    // callData is part of what userOpHash commits to, the EntryPoint only ever calls
    // executeFromEntryPoint with the exact agent/to/amount/memo tuple that was signed and
    // validated - binding signature to call is enforced at validation time, not trusted
    // blindly at execution time.

    /// @inheritdoc IAccount
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external override returns (uint256 validationData) {
        require(msg.sender == address(entryPoint), "only entrypoint");

        address agent = _decodeAgentFromCallData(userOp.callData);
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(userOpHash);
        address recovered = ECDSA.recover(ethSignedHash, userOp.signature);

        if (recovered != agent) {
            return SIG_VALIDATION_FAILED;
        }

        AgentPolicy storage policy = policies[agent];
        if (!policy.active) {
            return SIG_VALIDATION_FAILED;
        }

        if (missingAccountFunds > 0) {
            // Best-effort prefund from the vault's own MON balance. In the sponsored-gas
            // demo flow a paymaster covers the op and this branch is never hit.
            (bool success, ) = payable(msg.sender).call{value: missingAccountFunds}("");
            success;
        }

        return _packValidationData(false, uint48(policy.validUntil), uint48(policy.validAfter));
    }

    /// @notice Entry point for policy-checked spends coming from a validated UserOperation.
    function executeFromEntryPoint(address agent, address to, uint256 amount, string calldata memo) external nonReentrant {
        require(msg.sender == address(entryPoint), "only entrypoint");
        _authorizeAndSpend(agent, to, amount, memo);
    }

    function _decodeAgentFromCallData(bytes calldata callData) internal pure returns (address agent) {
        require(callData.length >= 36, "bad calldata");
        bytes4 selector = bytes4(callData[:4]);
        require(selector == this.executeFromEntryPoint.selector, "bad selector");
        agent = address(uint160(uint256(bytes32(callData[4:36]))));
    }

    // ---------------------------------------------------------------------
    // Owner (deployer): EntryPoint gas-float management only. This is NOT user treasury -
    // it is this contract's own MON balance staked at the EntryPoint for Door 2 self-funding
    // without a paymaster. Kept behind onlyOwner deliberately: withdrawing it can send MON
    // to an arbitrary address, and it isn't scoped to any one user's deposit.
    // ---------------------------------------------------------------------

    function fundEntryPointDeposit() external payable onlyOwner {
        entryPoint.depositTo{value: msg.value}(address(this));
    }

    function withdrawEntryPointDeposit(address payable to, uint256 amount) external onlyOwner {
        entryPoint.withdrawTo(to, amount);
    }

    function entryPointDepositBalance() external view returns (uint256) {
        return entryPoint.balanceOf(address(this));
    }

    // ---------------------------------------------------------------------
    // Shared policy engine (written once, reached by both doors)
    // ---------------------------------------------------------------------

    /// @dev Deliberately non-reverting on policy failures: a leaked-key attacker's blocked
    /// attempt should still land on-chain as a visible SpendBlocked event for the dashboard,
    /// rather than disappearing as a reverted transaction. Only access-control/reentrancy
    /// guards on the external wrappers revert.
    function _authorizeAndSpend(address agent, address to, uint256 amount, string calldata memo) internal {
        address user = agentOwner[agent];

        if (userPaused[user]) {
            emit SpendBlocked(agent, to, amount, memo, "vault paused");
            return;
        }

        AgentPolicy storage policy = policies[agent];

        if (!policy.active) {
            emit SpendBlocked(agent, to, amount, memo, "agent not active");
            return;
        }
        if (blacklisted[user][to]) {
            emit SpendBlocked(agent, to, amount, memo, "recipient blacklisted");
            return;
        }
        if (block.timestamp < policy.validAfter) {
            emit SpendBlocked(agent, to, amount, memo, "policy not yet valid");
            return;
        }
        if (policy.validUntil != 0 && block.timestamp >= policy.validUntil) {
            emit SpendBlocked(agent, to, amount, memo, "policy expired");
            return;
        }
        if (policy.whitelistOnly && !allowed[agent][to]) {
            emit SpendBlocked(agent, to, amount, memo, "recipient not whitelisted");
            return;
        }
        if (amount > policy.perTxCap) {
            emit SpendBlocked(agent, to, amount, memo, "over per-tx cap");
            return;
        }

        _rollAgentWindow(policy);
        if (policy.spentToday + amount > policy.dailyCap) {
            emit SpendBlocked(agent, to, amount, memo, "over daily cap");
            return;
        }

        if (userBalance[user] < amount) {
            emit SpendBlocked(agent, to, amount, memo, "insufficient user balance");
            return;
        }

        _rollUserWindow(user);
        if (userVelocityCap[user] != 0 && userSpentInWindow[user] + amount > userVelocityCap[user]) {
            userPaused[user] = true;
            emit CircuitBreakerTripped(user, userSpentInWindow[user], userVelocityCap[user]);
            emit SpendBlocked(agent, to, amount, memo, "circuit breaker tripped");
            return;
        }

        if (policy.approvalThreshold != 0 && amount >= policy.approvalThreshold) {
            uint256 id = nextRequestId++;
            requests[id] = PendingRequest({
                id: id,
                agent: agent,
                to: to,
                amount: amount,
                memo: memo,
                createdAt: block.timestamp,
                status: 0
            });
            agentRequestIds[agent].push(id);
            emit SpendRequested(id, agent, to, amount, memo);
            return;
        }

        policy.spentToday += amount;
        userSpentInWindow[user] += amount;
        userBalance[user] -= amount;
        token.safeTransfer(to, amount);
        emit SpendExecuted(agent, to, amount, memo);
    }

    function _rollAgentWindow(AgentPolicy storage policy) internal {
        if (block.timestamp - policy.windowStart >= 1 days) {
            policy.spentToday = 0;
            policy.windowStart = block.timestamp;
        }
    }

    function _rollUserWindow(address user) internal {
        if (block.timestamp - userWindowStart[user] >= 1 days) {
            userSpentInWindow[user] = 0;
            userWindowStart[user] = block.timestamp;
        }
    }
}
