import "@cofhe/hardhat-plugin";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import * as dotenv from "dotenv";

dotenv.config();

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org";
const PRIVATE_KEY     = process.env.PRIVATE_KEY     || "";

const config = {
  solidity: {
    compilers: [
      {
        version: "0.8.25",
        settings: {
          evmVersion: "cancun",
          viaIR: true,
          optimizer: { enabled: true, runs: 200 },
        },
      },
    ],
    // CofheHoldemPvP gained the confidential-bankroll funding layer and now
    // exceeds the 24576-byte EIP-170 limit. Optimise it for size (runs:1) and
    // strip revert strings — this contract only. Showdown gas is dominated by
    // FHE precompile calls, not the contract's own opcodes, so runtime-gas
    // impact is negligible.
    overrides: {
      "contracts/CofheHoldemPvP.sol": {
        version: "0.8.25",
        settings: {
          evmVersion: "cancun",
          viaIR: true,
          optimizer: { enabled: true, runs: 1 },
          debug: { revertStrings: "strip" },
        },
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    "eth-sepolia": {
      url: SEPOLIA_RPC_URL,
      chainId: 11155111,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      gasMultiplier: 1.2,
    },
  },
  defaultNetwork: "hardhat",
  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
