import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config, requireAgentPrivateKey } from "./config.js";

export const chain = defineChain({
  id: config.chainId,
  name: config.chainId === 10143 ? "Monad Testnet" : `chain-${config.chainId}`,
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
});

export const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });

export function getAgentAccount() {
  return privateKeyToAccount(requireAgentPrivateKey());
}

export function getAgentWalletClient() {
  const account = getAgentAccount();
  const walletClient = createWalletClient({ account, chain, transport: http(config.rpcUrl) });
  return { account, walletClient };
}

export function explorerTxUrl(hash: string): string {
  return `${config.explorerUrl}/tx/${hash}`;
}
