import { createModularAccountAlchemyClient } from '@alchemy/aa-alchemy';
import { LocalAccountSigner, sepolia } from '@alchemy/aa-core';
import { accountLoupeActions, pluginManagerActions } from '@alchemy/aa-accounts';
import { Subscription } from './subscription';
import { ACCOUNT_ABSTRATION_POLICY_ID, ALCHEMY_API_KEY } from './main';
import { parseEther } from 'ethers';

export class UserAccount {
  privateKey: string;
  chain;
  salt;
  constructor(privateKey: string, chain?: any, salt?: number) {
    this.privateKey = privateKey;
    this.chain = chain || sepolia;
    this.salt = salt;
  }

  async _initializeAccountClient(salt?: number) {
    const chain = this.chain;
    const privateKey = this.privateKey;
    const smartAccountClient = await createModularAccountAlchemyClient({
      apiKey: ALCHEMY_API_KEY,
      chain,
      // you can swap this out for any SmartAccountSigner
      //@ts-ignore
      signer: LocalAccountSigner.privateKeyToAccountSigner(privateKey),
      salt: BigInt(salt || 0),
      gasManagerConfig: {
        policyId: ACCOUNT_ABSTRATION_POLICY_ID!,
      },
    });
    return smartAccountClient;
  }

  async initializeAccountClient() {
    return this._initializeAccountClient(this.salt);
  }

  async installSubscriptionPlugin(subscription: Subscription) {
    const accountPluginManager = (await this.initializeAccountClient()).extend(pluginManagerActions);
    const dependencies = await subscription.getDependency();
    const txn = await accountPluginManager.installPlugin({ pluginAddress: subscription.address, dependencies });
    await accountPluginManager.waitForUserOperationTransaction({ hash: txn.hash });
  }

  async isPluginInstalled(pluginAddr: string) {
    const accountLoupeActionsExtendedClient = (await this.initializeAccountClient()).extend(accountLoupeActions);
    const installedPlugins = await accountLoupeActionsExtendedClient.getInstalledPlugins({});
    console.log('Installed Plugins include', installedPlugins);
    if (installedPlugins.map((addr) => addr.toLowerCase()).includes(pluginAddr.toLowerCase())) {
      return true;
    }
    return false;
  }

  async subscribe(subscriptionManagerPlugin: Subscription, planId: number, duration: number) {
    const subscribeParams = (await subscriptionManagerPlugin.encodeSubscribeFunctionParamas(planId, duration)) as any;
    const accountClient = await this.initializeAccountClient();
    const isPluginInstalled = await this.isPluginInstalled(subscriptionManagerPlugin.address);
    console.log('Subscription Plugin installation status: ', isPluginInstalled);
    if (!isPluginInstalled) {
      await this.installSubscriptionPlugin(subscriptionManagerPlugin);
      console.log('Installed subscription Plugin');
    }
    console.log('subscribe params', subscribeParams);
    const userOp = await accountClient.sendUserOperation({ uo: subscribeParams });
    console.log(userOp);
    const hash = await accountClient.waitForUserOperationTransaction({ hash: userOp.hash });
    console.log(hash, 'Subscription txn gone');
  }

  async sendEther() {
    const accountClient = await this.initializeAccountClient();
    await accountClient.sendUserOperation({
      uo: {
        target: '0x9d1bc836941319df22C3Dd9Ebba6EB1eE058b623',
        value: parseEther('0.00001'),
        data: '0x',
      },
    });
  }

  async unsubscribe(subscriptionManagerPlugin: Subscription, planId: number) {
    const unsubscribeParams = (await subscriptionManagerPlugin.encodeUnsubscribeFunctionParamas(planId)) as any;
    const accountClient = await this.initializeAccountClient();
    const isPluginInstalled = await this.isPluginInstalled(subscriptionManagerPlugin.address);
    if (isPluginInstalled) {
      await accountClient.sendUserOperation({
        uo: {
          target: subscriptionManagerPlugin.address,
          value: BigInt(0),
          data: unsubscribeParams,
        },
      });
    }
  }

  async getSubscriptions(subscriptionManagerPlugin: Subscription) {
    const address = (await this.initializeAccountClient()).getAddress();
    return subscriptionManagerPlugin.getSubscriptionByAddress(address);
  }

  async getSubscriptionInfo(subscriptionManagerPlugin: Subscription, planId: number) {
    const address = (await this.initializeAccountClient()).getAddress();
    return subscriptionManagerPlugin.getUserSubscriptionByPlanId(address, planId);
  }
}
