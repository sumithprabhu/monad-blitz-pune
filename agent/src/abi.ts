import { parseAbi } from "viem";

export const agentVaultAbi = parseAbi([
  "function spend(address to, uint256 amount, string memo) external",
  "function executeFromEntryPoint(address agent, address to, uint256 amount, string memo) external",
  "function getRequest(uint256 id) view returns ((uint256 id, address agent, address to, uint256 amount, string memo, uint256 createdAt, uint8 status))",
  "function policies(address agent) view returns (bool active, uint256 perTxCap, uint256 dailyCap, uint256 spentToday, uint256 windowStart, uint256 approvalThreshold, uint256 validAfter, uint256 validUntil, bool whitelistOnly)",
  "function allowed(address agent, address recipient) view returns (bool)",
  "function paused() view returns (bool)",
  "function nextRequestId() view returns (uint256)",
  "event SpendExecuted(address indexed agent, address indexed to, uint256 amount, string memo)",
  "event SpendBlocked(address indexed agent, address indexed to, uint256 amount, string memo, string reason)",
  "event SpendRequested(uint256 indexed id, address indexed agent, address indexed to, uint256 amount, string memo)",
  "event RequestApproved(uint256 indexed id, uint256 finalAmount)",
  "event RequestRejected(uint256 indexed id)",
  "event RequestCancelled(uint256 indexed id)",
  "event AgentRevoked(address indexed agent)",
  "event CircuitBreakerTripped(uint256 windowSpent, uint256 cap)",
  "event Paused(bool paused)",
]);

/** Owner-only functions, used by the demo harness (see ownerActions.ts) to play the owner's part end-to-end from the CLI. */
export const agentVaultOwnerAbi = parseAbi([
  "function approveRequest(uint256 id, uint256 finalAmount) external",
  "function rejectRequest(uint256 id) external",
  "function revokeAgent(address agent) external",
]);

export const mockUsdcAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function mint(address to, uint256 amount) external",
]);
