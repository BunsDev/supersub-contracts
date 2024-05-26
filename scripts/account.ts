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

  async createProduct(
    subscriptionManagerPlugin: Subscription,
    name: string,
    description: string,
    logoURL: string,
    productType: 0 | 1,
    initPlans?: {
      price: number;
      chargeInterval: number;
      tokenAddress: string;
      receivingAddress: string;
      destinationChain: number;
    }[]
  ) {
    const currentProductId = await subscriptionManagerPlugin.getTotalProducts();
    console.log(currentProductId);
    const isPluginInstalled = await this.isPluginInstalled(subscriptionManagerPlugin.address);
    console.log('Subscription Plugin installation status: ', isPluginInstalled);
    if (!isPluginInstalled) {
      await this.installSubscriptionPlugin(subscriptionManagerPlugin);
      console.log('Installed subscription Plugin');
    }
    const productParams = subscriptionManagerPlugin.encodeCreateProductParams(
      name,
      description,
      logoURL,
      productType,
      initPlans
    ) as `0x${string}`;
    const accountClient = await this.initializeAccountClient();
    const userOp = await accountClient.sendUserOperation({
      uo: productParams,
    });
    const hash = await accountClient.waitForUserOperationTransaction({ hash: userOp.hash });
    console.log(hash, 'product Creation txn gone');
  }

  async updateProduct(subscriptionManagerPlugin: Subscription, productId: number, isActive: boolean) {
    const updateParams = subscriptionManagerPlugin.encodeUpdateProductParams(productId, isActive);
    const accountClient = await this.initializeAccountClient();
    const userOp = await accountClient.sendUserOperation({
      uo: {
        target: subscriptionManagerPlugin.address,
        data: updateParams as `0x${string}`,
      },
    });
    const hash = await accountClient.waitForUserOperationTransaction({ hash: userOp.hash });
    console.log(hash, 'product update txn gone');
  }

  async createPlan(
    subscriptionManagerPlugin: Subscription,
    productId: number,
    price: number,
    chargeInterval: number,
    planPaymentToken: string,
    receivingAddress: string,
    destinationChain: number
  ) {
    const createPlanParams = subscriptionManagerPlugin.encodeCreateSubscriptionPlanParams(
      productId,
      price,
      chargeInterval,
      planPaymentToken,
      receivingAddress,
      destinationChain
    );
    const accountClient = await this.initializeAccountClient();
    const userOp = await accountClient.sendUserOperation({
      uo: {
        target: subscriptionManagerPlugin.address,
        data: createPlanParams as `0x${string}`,
      },
    });
    const hash = await accountClient.waitForUserOperationTransaction({ hash: userOp.hash });
    console.log(hash, 'plan Creation txn gone');
  }

  async updateSubscriptionPlan(
    subscriptionManagerPlugin: Subscription,
    planId: number,
    receivingAddress: string,
    destinationChain: number,
    isActive: boolean
  ) {
    const updatePlanParams = subscriptionManagerPlugin.encodeUpdateSubscriptionPlanParams(
      planId,
      receivingAddress,
      destinationChain,
      isActive
    );
    const accountClient = await this.initializeAccountClient();
    const userOp = await accountClient.sendUserOperation({
      uo: {
        target: subscriptionManagerPlugin.address,
        data: updatePlanParams as `0x${string}`,
      },
    });
    const hash = await accountClient.waitForUserOperationTransaction({ hash: userOp.hash });
    console.log(hash, 'plan update txn gone');
  }

  async subscribe(
    subscriptionManagerPlugin: Subscription,
    planId: number,
    endTime: number,
    paymentToken?: string,
    paymentTokenSwapFee: number = 0
  ) {
    const subscriptionPlan = await subscriptionManagerPlugin.getSubscriptionPlanById(planId);
    if (!paymentToken) {
      paymentToken = subscriptionPlan[5];
      console.log(subscriptionPlan, paymentToken);
    }
    const subscribeParams = (await subscriptionManagerPlugin.encodeSubscribeFunctionParamas(
      planId,
      endTime,
      paymentToken!,
      paymentTokenSwapFee
    )) as any;
    const accountClient = await this.initializeAccountClient();
    const isPluginInstalled = await this.isPluginInstalled(subscriptionManagerPlugin.address);
    console.log('Subscription Plugin installation status: ', isPluginInstalled);
    if (!isPluginInstalled) {
      await this.installSubscriptionPlugin(subscriptionManagerPlugin);
      console.log('Installed subscription Plugin');
    }
    console.log('subscribe params', subscribeParams);
    const userOp = await accountClient.sendUserOperation({ uo: subscribeParams });
    const hash = await accountClient.waitForUserOperationTransaction({ hash: userOp.hash });
    console.log(hash, 'Subscription txn gone');
  }

  async changeSubscriptionPlanPaymentInfo(
    subscriptionManagerPlugin: Subscription,
    planId: number,
    endTime?: number,
    paymentToken?: string,
    paymentTokenSwapFee: number = 0
  ) {
    const accountClient = await this.initializeAccountClient();
    const smartAccountAddress = accountClient.getAddress();
    const subscription = await subscriptionManagerPlugin.getUserSubscriptionByPlanId(smartAccountAddress, planId);
    if (!paymentToken) {
      paymentToken = subscription[3];
    }
    if (!endTime) {
      endTime = Number(subscription[2]);
    }
    const subscribeParams = subscriptionManagerPlugin.encodeUpdateUserSubscriptionParams(
      planId,
      endTime,
      paymentToken!,
      paymentTokenSwapFee
    ) as any;
    const isPluginInstalled = await this.isPluginInstalled(subscriptionManagerPlugin.address);
    console.log('Subscription Plugin installation status: ', isPluginInstalled);
    if (!isPluginInstalled) {
      await this.installSubscriptionPlugin(subscriptionManagerPlugin);
      console.log('Installed subscription Plugin');
    }
    console.log('subscribe params', subscribeParams);
    const userOp = await accountClient.sendUserOperation({ uo: subscribeParams });
    const hash = await accountClient.waitForUserOperationTransaction({ hash: userOp.hash });
    console.log(hash, 'Subscription txn gone');
  }

  async createRecurringPayment(
    subscriptionManagerPlugin: Subscription,
    initPlans: {
      price: number; //amount
      chargeInterval: number;
      tokenAddress: string; //token to send to recipient
      receivingAddress: string; //recipient address
      destinationChain: number; // recipientt chain
    },
    endTime: number,
    paymentToken?: string,
    paymentTokenSwapFee: number = 0
  ) {
    if (!paymentToken) {
      paymentToken = initPlans.tokenAddress;
    }
    const accountClient = await this.initializeAccountClient();
    const recurringProductId = await subscriptionManagerPlugin.getProductForRecurringPayment(
      accountClient.getAddress()
    );
    const recurringPaymentParams = subscriptionManagerPlugin.encodeCreateRecurringPaymentParams(
      recurringProductId,
      initPlans,
      { endTime, paymentToken, paymentTokenSwapFee }
    ) as `0x${string}`;
    const isPluginInstalled = await this.isPluginInstalled(subscriptionManagerPlugin.address);
    if (!isPluginInstalled) {
      await this.installSubscriptionPlugin(subscriptionManagerPlugin);
      console.log('Installed subscription Plugin');
    }
    const userOp = await accountClient.sendUserOperation({ uo: recurringPaymentParams });
    const hash = await accountClient.waitForUserOperationTransaction({ hash: userOp.hash });
    console.log(hash, 'create Recurring txn gone');
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
        uo: unsubscribeParams,
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
