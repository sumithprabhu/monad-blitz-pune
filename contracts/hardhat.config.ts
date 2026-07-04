import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const MONAD_TESTNET_RPC_URL = process.env.MONAD_TESTNET_RPC_URL || "https://testnet-rpc.monad.xyz";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    monadTestnet: {
      url: MONAD_TESTNET_RPC_URL,
      chainId: 10143,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
  },
  sourcify: {
    // Monad testnet's own explorer (testnet.monadvision.com) sits behind a Cloudflare
    // bot-challenge that blocks programmatic Etherscan-style verification. Sourcify
    // is chain-agnostic and lists Monad Testnet (10143) as supported, so verify there
    // instead: `npx hardhat verify --network monadTestnet <address> [constructorArgs]`.
    enabled: true,
  },
  etherscan: {
    enabled: false,
  },
};

export default config;
