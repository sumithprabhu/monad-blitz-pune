import { defineChain } from "viem";
import { chainId, explorerUrl, rpcUrl } from "./config";

export const monadTestnet = defineChain({
  id: chainId,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: [rpcUrl] },
  },
  blockExplorers: {
    default: { name: "Monad Explorer", url: explorerUrl },
  },
  testnet: true,
});
