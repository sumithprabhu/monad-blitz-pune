import { createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { agentVaultOwnerAbi } from "./abi.js";
import { chain, publicClient } from "./chain.js";
import { requireVaultAddress } from "./config.js";

/**
 * Owner-side actions, used only by the demo harness so all four demo beats can
 * be driven end-to-end from the CLI before the dashboard exists. In the real
 * flow these are normally clicked from the dashboard (Phase 4), not scripted.
 */
export function getOwnerWalletClient(ownerPrivateKey: Hex) {
  const account = privateKeyToAccount(ownerPrivateKey);
  const walletClient = createWalletClient({ account, chain, transport: http() });
  return { account, walletClient };
}

export async function approveRequest(ownerPrivateKey: Hex, id: bigint, finalAmount: bigint): Promise<Hex> {
  const { walletClient } = getOwnerWalletClient(ownerPrivateKey);
  const hash = await walletClient.writeContract({
    address: requireVaultAddress(),
    abi: agentVaultOwnerAbi,
    functionName: "approveRequest",
    args: [id, finalAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function rejectRequest(ownerPrivateKey: Hex, id: bigint): Promise<Hex> {
  const { walletClient } = getOwnerWalletClient(ownerPrivateKey);
  const hash = await walletClient.writeContract({
    address: requireVaultAddress(),
    abi: agentVaultOwnerAbi,
    functionName: "rejectRequest",
    args: [id],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function revokeAgent(ownerPrivateKey: Hex, agent: Address): Promise<Hex> {
  const { walletClient } = getOwnerWalletClient(ownerPrivateKey);
  const hash = await walletClient.writeContract({
    address: requireVaultAddress(),
    abi: agentVaultOwnerAbi,
    functionName: "revokeAgent",
    args: [agent],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
