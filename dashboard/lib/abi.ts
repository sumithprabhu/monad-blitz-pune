import { parseAbi } from "viem";

export const agentVaultAbi = parseAbi([
  // reads
  "function owner() view returns (address)",
  "function token() view returns (address)",
  "function entryPoint() view returns (address)",
  "function nextRequestId() view returns (uint256)",
  "function agentExists(address agent) view returns (bool)",
  "function agentOwner(address agent) view returns (address)",
  "function allowed(address agent, address recipient) view returns (bool)",
  "function blacklisted(address user, address recipient) view returns (bool)",
  "function userBalance(address user) view returns (uint256)",
  "function userWindowStart(address user) view returns (uint256)",
  "function userSpentInWindow(address user) view returns (uint256)",
  "function userVelocityCap(address user) view returns (uint256)",
  "function userPaused(address user) view returns (bool)",
  "function policies(address agent) view returns (bool active, uint256 perTxCap, uint256 dailyCap, uint256 spentToday, uint256 windowStart, uint256 approvalThreshold, uint256 validAfter, uint256 validUntil, bool whitelistOnly)",
  "function getRequest(uint256 id) view returns ((uint256 id, address agent, address to, uint256 amount, string memo, uint256 createdAt, uint8 status))",
  "function getAgentRequestIds(address agent) view returns (uint256[])",
  "function entryPointDepositBalance() view returns (uint256)",

  // user writes (self-service, no admin gate)
  "function deposit(uint256 amount) external",
  "function withdraw(uint256 amount) external",
  "function registerAgent(address agent, (uint256 perTxCap, uint256 dailyCap, uint256 approvalThreshold, uint256 validAfter, uint256 validUntil, bool whitelistOnly) p) external",
  "function updateAgent(address agent, (uint256 perTxCap, uint256 dailyCap, uint256 approvalThreshold, uint256 validAfter, uint256 validUntil, bool whitelistOnly) p) external",
  "function setRecipient(address agent, address recipient, bool ok) external",
  "function setBlacklist(address recipient, bool blocked) external",
  "function revokeAgent(address agent) external",
  "function approveRequest(uint256 id, uint256 finalAmount) external",
  "function rejectRequest(uint256 id) external",
  "function setVelocityCap(uint256 cap) external",
  "function setPaused(bool p) external",

  // agent write (Door 1 - called by the agent itself, not the vault owner; used by the Demo tab)
  "function spend(address to, uint256 amount, string memo) external",

  // deployer-only: EntryPoint gas float (Door 2 infra, not user treasury)
  "function fundEntryPointDeposit() external payable",
  "function withdrawEntryPointDeposit(address to, uint256 amount) external",

  // events
  "event Deposited(address indexed user, uint256 amount)",
  "event Withdrawn(address indexed user, uint256 amount)",
  "event AgentRegistered(address indexed user, address indexed agent, uint256 perTxCap, uint256 dailyCap, uint256 approvalThreshold, uint256 validAfter, uint256 validUntil, bool whitelistOnly)",
  "event AgentUpdated(address indexed agent)",
  "event RecipientAllowed(address indexed agent, address indexed recipient, bool allowed)",
  "event RecipientBlacklisted(address indexed user, address indexed recipient, bool blocked)",
  "event AgentRevoked(address indexed agent)",
  "event SpendExecuted(address indexed agent, address indexed to, uint256 amount, string memo)",
  "event SpendBlocked(address indexed agent, address indexed to, uint256 amount, string memo, string reason)",
  "event SpendRequested(uint256 indexed id, address indexed agent, address indexed to, uint256 amount, string memo)",
  "event RequestApproved(uint256 indexed id, uint256 finalAmount)",
  "event RequestRejected(uint256 indexed id)",
  "event RequestCancelled(uint256 indexed id)",
  "event CircuitBreakerTripped(address indexed user, uint256 windowSpent, uint256 cap)",
  "event Paused(address indexed user, bool paused)",
]);

export const erc20Abi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function mint(address to, uint256 amount) external",
]);
