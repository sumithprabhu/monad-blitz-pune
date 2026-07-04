import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  webpack: (config) => {
    // wagmi's MetaMask connector pulls in React Native's async-storage as an
    // optional peer dep it never uses in a browser build; stub it out.
    // pino-pretty is WalletConnect's optional dev-only log formatter, also unused
    // in a browser build - same treatment.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "@react-native-async-storage/async-storage": false,
      "pino-pretty": false,
    };
    return config;
  },
};

export default nextConfig;
