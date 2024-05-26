import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-chai-matchers';
import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-foundry';
import 'hardhat-abi-exporter';
import 'hardhat-gas-reporter';
import 'solidity-coverage';
import 'dotenv/config';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  gasReporter: {
    enabled: true,
  },
  abiExporter: {
    runOnCompile: true,
    only: ['SubscriptionPlugin', 'SubscriptionManager', 'SubscriptionTokenBridge'],
    path: './abis',
    format: 'json',
    clear: true,
  },
  networks:
    process.env.ALCHEMY_API_KEY && process.env.PRIVATE_KEY
      ? {
          hardhat: {
            allowUnlimitedContractSize: true,
          },
          eth: {
            url: `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY!}`,
            chainId: 1,
            accounts: [process.env.PRIVATE_KEY!],
          },
          polygonAmoy: {
            url: `https://polygon-amoy.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY!}`,
            chainId: 80002,
            accounts: [process.env.PRIVATE_KEY!],
          },
        }
      : undefined,
  etherscan: process.env.POLYGON_AMOY_EXPLORER_API_KEY
    ? {
        customChains: [
          {
            network: 'polygonAmoy',
            chainId: 80002,
            urls: {
              apiURL: 'https://api-testnet.polygonscan.com/api',
              browserURL: 'https://amoy.polygonscan.com/',
            },
          },
        ],
        apiKey: {
          polygonAmoy: process.env.POLYGON_AMOY_EXPLORER_API_KEY!,
        },
      }
    : undefined,
  sourcify: {
    enabled: true,
  },
};

export default config;
