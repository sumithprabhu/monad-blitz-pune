import "dotenv/config";
import type { Address, Hex } from "viem";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name} (see .env.example)`);
  return v;
}

export const config = {
  rpcUrl: process.env.RPC_URL || "http://127.0.0.1:8545",
  chainId: Number(process.env.CHAIN_ID || 31337),
  explorerUrl: process.env.EXPLORER_URL || "https://testnet.monadexplorer.com",

  vaultAddress: process.env.VAULT_ADDRESS as Address | undefined,
  tokenAddress: process.env.TOKEN_ADDRESS as Address | undefined,

  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 3000),
  approvalPollTimeoutMs: Number(process.env.APPROVAL_POLL_TIMEOUT_MS || 5 * 60 * 1000),

  // Door 2 / ERC-4337 (Pimlico) — verify these against Pimlico's current
  // Monad-testnet endpoint and EntryPoint version before relying on Door 2.
  entryPointAddress: (process.env.ENTRY_POINT_ADDRESS ||
    "0x0000000071727De22E5E9d8BAf0edAc6f37da032") as Address,
  bundlerRpcUrl: process.env.BUNDLER_RPC_URL,
  paymasterRpcUrl: process.env.PAYMASTER_RPC_URL,

  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
};

export function requireVaultAddress(): Address {
  return requireEnv("VAULT_ADDRESS") as Address;
}

export function requireAgentPrivateKey(): Hex {
  return requireEnv("AGENT_PRIVATE_KEY") as Hex;
}
