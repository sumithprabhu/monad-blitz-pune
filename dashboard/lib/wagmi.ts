import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { monadTestnet } from "./chain";
import { walletConnectProjectId } from "./config";

export const wagmiConfig = getDefaultConfig({
  appName: "Leash Protocol",
  // A real WalletConnect Cloud project ID is needed for the WalletConnect/mobile-QR
  // connector to work - get one free at https://cloud.reown.com. Injected wallets
  // (MetaMask, Coinbase extension, etc.) work regardless of this value.
  projectId: walletConnectProjectId || "00000000000000000000000000000000",
  chains: [monadTestnet],
  transports: {
    [monadTestnet.id]: http(monadTestnet.rpcUrls.default.http[0]),
  },
  ssr: true,
});
