require("dotenv").config();
require("@nomicfoundation/hardhat-ethers");

const RPC_URL = process.env.RPC_URL || "https://evmrpc-testnet.0g.ai";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
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
    galileo: {
      url: RPC_URL,
      chainId: 16602,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
};
