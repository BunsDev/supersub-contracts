import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import hre from 'hardhat';

const SubscriptionPluginModule = buildModule('SubscriptionPluginModule', (m) => {
  const chainId = hre.config.networks[hre.network.name].chainId ? hre.config.networks[hre.network.name].chainId : 1;
  const subscriptionPlugin = m.contract('SubscriptionPlugin', [chainId]);
  return { subscriptionPlugin };
});

export default SubscriptionPluginModule;
