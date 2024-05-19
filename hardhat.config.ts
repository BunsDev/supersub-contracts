import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-chai-matchers';
import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-verify';
import 'hardhat-abi-exporter';
import 'dotenv/config';
import "hardhat-gas-reporter"
import { ALCHEMY_API_KEY, PRIVATE_KEY_1 } from './scripts/main';



const config: HardhatUserConfig = {
  solidity: '0.8.24',
  gasReporter: {
    enabled: true
  },

  networks:{
 eth: {
      url: `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      accounts: [PRIVATE_KEY_1!],
    },
    amoy:{
       url: `https://polygon-amoy.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      accounts: [PRIVATE_KEY_1!],
    }

  },

  sourcify: {
    enabled: true,
  },
};

export default config;
