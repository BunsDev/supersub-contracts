import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

const SubscriptionManager = buildModule('SubscriptionManager', (m) => {
  const supportedTokens = m.getParameter('supportedTokens', []);
  const subscriptionManager = m.contract('SubscriptionManagerPlugin', [supportedTokens]);

  return { subscriptionManager };
});

export default SubscriptionManager;
