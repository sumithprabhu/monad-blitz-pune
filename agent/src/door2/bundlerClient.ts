import { config } from "../config.js";

/**
 * Minimal JSON-RPC client for an ERC-4337 v0.7 bundler (Pimlico). Uses the
 * "unpacked" UserOperation wire format that bundlers expect over RPC - this
 * differs from the packed on-chain PackedUserOperation struct AgentVault
 * consumes internally; the bundler/EntryPoint handle packing.
 *
 * NOT exercised against a live endpoint in this repo (no network access at
 * build time). Verify the Pimlico Monad-testnet URL and exact RPC method
 * names against their current docs before the demo - see README.
 */
export interface UnpackedUserOperation {
  sender: `0x${string}`;
  nonce: `0x${string}`;
  factory?: `0x${string}`;
  factoryData?: `0x${string}`;
  callData: `0x${string}`;
  callGasLimit: `0x${string}`;
  verificationGasLimit: `0x${string}`;
  preVerificationGas: `0x${string}`;
  maxFeePerGas: `0x${string}`;
  maxPriorityFeePerGas: `0x${string}`;
  paymaster?: `0x${string}`;
  paymasterVerificationGasLimit?: `0x${string}`;
  paymasterPostOpGasLimit?: `0x${string}`;
  paymasterData?: `0x${string}`;
  signature: `0x${string}`;
}

async function rpcCall<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as { result?: T; error?: { code: number; message: string } };
  if (body.error) throw new Error(`bundler RPC ${method} failed: ${body.error.message}`);
  return body.result as T;
}

export function requireBundlerUrl(): string {
  if (!config.bundlerRpcUrl) throw new Error("BUNDLER_RPC_URL not set (see .env.example)");
  return config.bundlerRpcUrl;
}

export async function estimateUserOperationGas(
  userOp: UnpackedUserOperation
): Promise<Pick<UnpackedUserOperation, "callGasLimit" | "verificationGasLimit" | "preVerificationGas">> {
  return rpcCall(requireBundlerUrl(), "eth_estimateUserOperationGas", [userOp, config.entryPointAddress]);
}

export async function getUserOperationGasPrice(): Promise<{
  fast: { maxFeePerGas: `0x${string}`; maxPriorityFeePerGas: `0x${string}` };
}> {
  return rpcCall(requireBundlerUrl(), "pimlico_getUserOperationGasPrice", []);
}

export async function sendUserOperation(userOp: UnpackedUserOperation): Promise<`0x${string}`> {
  return rpcCall(requireBundlerUrl(), "eth_sendUserOperation", [userOp, config.entryPointAddress]);
}

export interface UserOperationReceipt {
  success: boolean;
  receipt: { transactionHash: `0x${string}` };
}

export async function getUserOperationReceipt(userOpHash: `0x${string}`): Promise<UserOperationReceipt | null> {
  return rpcCall(requireBundlerUrl(), "eth_getUserOperationReceipt", [userOpHash]);
}

export async function sponsorUserOperation(
  userOp: UnpackedUserOperation
): Promise<
  Pick<
    UnpackedUserOperation,
    "paymaster" | "paymasterVerificationGasLimit" | "paymasterPostOpGasLimit" | "paymasterData"
  >
> {
  if (!config.paymasterRpcUrl) throw new Error("PAYMASTER_RPC_URL not set (see .env.example)");
  return rpcCall(config.paymasterRpcUrl, "pm_sponsorUserOperation", [userOp, config.entryPointAddress]);
}

export async function pollUserOperationReceipt(
  userOpHash: `0x${string}`,
  opts: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<UserOperationReceipt> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const intervalMs = opts.intervalMs ?? 3000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const receipt = await getUserOperationReceipt(userOpHash);
    if (receipt) return receipt;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for UserOperation ${userOpHash} to land`);
}
