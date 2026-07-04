import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { agentVaultAbi, erc20Abi } from "./abi";
import { requireVaultAddress, tokenAddress, tokenDecimals } from "./config";

const POLL_MS = 4000;

/** The Ownable deployer address - relevant ONLY for the EntryPoint gas-float admin panel,
 * not for anything user-facing (deposits/agents/etc. have no admin gate at all). */
export function useVaultOwner() {
  return useReadContract({
    address: requireVaultAddress(),
    abi: agentVaultAbi,
    functionName: "owner",
    query: { refetchInterval: POLL_MS },
  });
}

export function useIsDeployerAdmin() {
  const { address } = useAccount();
  const { data: owner } = useVaultOwner();
  if (!address || !owner) return false;
  return address.toLowerCase() === owner.toLowerCase();
}

/** Total mUSDC actually sitting in the contract across every user - informational only,
 * not any one person's balance. See useUserBalance for what a connected user can withdraw. */
export function usePoolTotalBalance() {
  return useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: tokenAddress ? [requireVaultAddress()] : undefined,
    query: { refetchInterval: POLL_MS, enabled: Boolean(tokenAddress) },
  });
}

/** The connected user's own tracked balance inside the pool - what they can withdraw and
 * what their agents can spend against. */
export function useUserBalance(user: `0x${string}` | undefined) {
  return useReadContract({
    address: requireVaultAddress(),
    abi: agentVaultAbi,
    functionName: "userBalance",
    args: user ? [user] : undefined,
    query: { refetchInterval: POLL_MS, enabled: Boolean(user) },
  });
}

/** The connected wallet's raw mUSDC holdings (outside the vault) - used to size a deposit. */
export function useWalletTokenBalance() {
  const { address } = useAccount();
  return useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { refetchInterval: POLL_MS, enabled: Boolean(tokenAddress && address) },
  });
}

export function useWalletAllowance() {
  const { address } = useAccount();
  return useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, requireVaultAddress()] : undefined,
    query: { refetchInterval: POLL_MS, enabled: Boolean(tokenAddress && address) },
  });
}

/** Per-user circuit breaker: paused flag, velocity cap, and spend-in-window for `user`. */
export function useUserCircuitBreaker(user: `0x${string}` | undefined) {
  return useReadContracts({
    contracts: [
      { address: requireVaultAddress(), abi: agentVaultAbi, functionName: "userPaused", args: user ? [user] : undefined },
      {
        address: requireVaultAddress(),
        abi: agentVaultAbi,
        functionName: "userVelocityCap",
        args: user ? [user] : undefined,
      },
      {
        address: requireVaultAddress(),
        abi: agentVaultAbi,
        functionName: "userSpentInWindow",
        args: user ? [user] : undefined,
      },
    ],
    query: { refetchInterval: POLL_MS, enabled: Boolean(user) },
  });
}

export function useAgentPolicy(agent: `0x${string}`) {
  return useReadContract({
    address: requireVaultAddress(),
    abi: agentVaultAbi,
    functionName: "policies",
    args: [agent],
    query: { refetchInterval: POLL_MS },
  });
}

/** Same read as useAgentPolicy, batched across an arbitrary list of agents - lets a single
 * component (e.g. the Skills.md generator) read every one of a user's agents' policies
 * without calling a hook inside a loop. */
export function useAgentPoliciesBatch(agents: `0x${string}`[]) {
  return useReadContracts({
    contracts: agents.map((agent) => ({
      address: requireVaultAddress(),
      abi: agentVaultAbi,
      functionName: "policies",
      args: [agent],
    })),
    query: { refetchInterval: POLL_MS, enabled: agents.length > 0 },
  });
}

export function useAllowedRecipient(agent: `0x${string}`, recipient: `0x${string}` | undefined) {
  return useReadContract({
    address: requireVaultAddress(),
    abi: agentVaultAbi,
    functionName: "allowed",
    args: recipient ? [agent, recipient] : undefined,
    query: { refetchInterval: POLL_MS, enabled: Boolean(recipient) },
  });
}

export function useEntryPointDepositBalance() {
  return useReadContract({
    address: requireVaultAddress(),
    abi: agentVaultAbi,
    functionName: "entryPointDepositBalance",
    query: { refetchInterval: POLL_MS },
  });
}

export { tokenDecimals };
