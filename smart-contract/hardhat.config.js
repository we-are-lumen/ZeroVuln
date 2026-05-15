require("dotenv").config();
require("@nomicfoundation/hardhat-ethers");

// 0G RPC endpoints (default: mainnet)
// Ref: https://docs.0g.ai/developer-hub/mainnet/mainnet-overview
const RPC_URL_MAINNET = process.env.RPC_URL_MAINNET || "https://evmrpc.0g.ai";
const RPC_URL_TESTNET =
  process.env.RPC_URL_TESTNET || "https://evmrpc-testnet.0g.ai";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  // Requested: default to mainnet
  defaultNetwork: "mainnet",
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  paths: {
    // Don't use "." — Hardhat would also scan node_modules and can hit HH1006
    sources: "contracts",
    tests: "test",
    cache: "cache",
    artifacts: "artifacts",
  },
  networks: {
    // 0G Mainnet
    mainnet: {
      url: RPC_URL_MAINNET,
      chainId: 16661,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    // 0G Galileo Testnet (backwards-compatible alias: "galileo")
    testnet: {
      url: RPC_URL_TESTNET,
      chainId: 16602,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    galileo: {
      url: RPC_URL_TESTNET,
      chainId: 16602,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
};
