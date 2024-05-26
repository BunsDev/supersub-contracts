import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import hre from 'hardhat';

const SubscriptionPluginModule = buildModule('SubscriptionPluginModule', (m) => {
  const amoyChainId = 80002;
  const polygonChainId = 137;
  const ccipAmoyRouter = '0x9C32fCB86BF0f4a1A8921a9Fe46de3198bb884B2';
  const ccipAmoyLink = '0x0Fd9e8d3aF1aaee056EB9e802c3A762a667b1904';
  const amoyDestinationChains = [
    '14767482510784806043',
    '13264668187771770619',
    '16015286601757825753',
    '5224473277236331295',
  ];
  const ccipBridge = m.contract('SubscriptionTokenBridge', [ccipAmoyRouter, ccipAmoyLink, amoyDestinationChains]);
  const subscriptionPlugin = m.contract('SubscriptionPlugin', [amoyChainId, ccipBridge]);
  return { subscriptionPlugin, ccipBridge };
});

export default SubscriptionPluginModule;
