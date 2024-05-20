import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

const SubscriptionPluginModule = buildModule('SubscriptionPluginModule', (m) => {
  const supportedTokens = m.getParameter('supportedTokens', []);
  const subscriptionPlugin = m.contract('SubscriptionPlugin', [supportedTokens]);

  return { subscriptionPlugin };
});

export default SubscriptionPluginModule;
