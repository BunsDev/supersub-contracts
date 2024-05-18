import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-chai-matchers';
import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-verify';
import 'hardhat-abi-exporter';
import 'dotenv/config';

const config: HardhatUserConfig = {
  solidity: '0.8.24',
  abiExporter: {
    path: './abis',
    pretty: true,
  },
  sourcify: {
    enabled: true,
  },
};

export default config;
