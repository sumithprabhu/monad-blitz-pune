import type { Address } from "viem";

export const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 10143);
export const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "https://testnet-rpc.monad.xyz";
export const explorerUrl = process.env.NEXT_PUBLIC_EXPLORER_URL || "https://testnet.monadexplorer.com";

export const vaultAddress = process.env.NEXT_PUBLIC_VAULT_ADDRESS as Address | undefined;
export const tokenAddress = process.env.NEXT_PUBLIC_TOKEN_ADDRESS as Address | undefined;
export const tokenDecimals = Number(process.env.NEXT_PUBLIC_TOKEN_DECIMALS || 6);

export const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

// Goldsky subgraph - used for the historical event backfill (fast, no RPC block-range
// limits); live updates still come from the RPC's watchContractEvent. Optional - if unset,
// vaultEvents.tsx falls back to the (slower, range-limited) direct RPC backfill.
export const goldskySubgraphUrl = process.env.NEXT_PUBLIC_GOLDSKY_SUBGRAPH_URL;

export function requireVaultAddress(): Address {
  if (!vaultAddress) {
    throw new Error("NEXT_PUBLIC_VAULT_ADDRESS is not set - see .env.local.example");
  }
  return vaultAddress;
}

export function explorerTxUrl(hash: string): string {
  return `${explorerUrl}/tx/${hash}`;
}

export function explorerAddressUrl(address: string): string {
  return `${explorerUrl}/address/${address}`;
}

export function shortAddress(address: string, chars = 4): string {
  return `${address.slice(0, 2 + chars)}...${address.slice(-chars)}`;
}
