import { Address } from '@alchemy/aa-core';
import { AlchemyProvider, Contract, Networkish } from 'ethers';
import { AlchemySmartAccountClient, createModularAccountAlchemyClient } from '@alchemy/aa-alchemy';
import { accountLoupeActions } from '@alchemy/aa-accounts';
import { LocalAccountSigner, polygonAmoy } from '@alchemy/aa-core';
import { abi } from '../artifacts/contracts/SubscriptionPlugin.sol/SubscriptionPlugin.json';
import { SubscriptionPlugin } from '../typechain-types';
import { ethers } from 'ethers';
import { config as envConfig } from 'dotenv';

envConfig();

interface Plan {
  price: number;
  chargeInterval: number;
}

class PluginClient {
  chain: Networkish;
  pluginAddress: Address;
  pluginContract: SubscriptionPlugin;
  smartAccountClient: AlchemySmartAccountClient;

  constructor(
    chain: Networkish,
    pluginAddr: Address,
    pluginAbi: ethers.Interface | ethers.InterfaceAbi,
    client: AlchemySmartAccountClient,
    provider: AlchemyProvider
  ) {
    this.chain = chain;
    this.pluginAddress = pluginAddr;
    this.pluginContract = new Contract(pluginAddr, pluginAbi, provider) as unknown as SubscriptionPlugin;
    this.smartAccountClient = client;
  }

  formatPrice(price: number, decimals: number) {
    return BigInt(price) * BigInt(10) ** BigInt(decimals);
  }

  async getInstalledPluginsForSmartAccount() {
    const accountLoupeActionsExtendedClient = this.smartAccountClient.extend(accountLoupeActions);
    //@ts-ignore
    return await accountLoupeActionsExtendedClient.getInstalledPlugins({});
  }

  async isPluginInstalled() {
    const accountLoupeActionsExtendedClient = this.smartAccountClient.extend(accountLoupeActions);
    //@ts-ignore
    const installedPlugins = await accountLoupeActionsExtendedClient.getInstalledPlugins({});
    if (installedPlugins.map((addr) => addr.toLowerCase()).includes(this.pluginAddress.toLowerCase())) {
      return true;
    }
    return false;
  }

  async installPlugin() {
    const pluginDependency0 = (await this.pluginContract.pack(
      '0xcE0000007B008F50d762D155002600004cD6c647',
      0
    )) as unknown as `0x${string}`;
    const pluginDependency1 = (await this.pluginContract.pack(
      '0xcE0000007B008F50d762D155002600004cD6c647',
      1
    )) as unknown as `0x${string}`;
    const accountLoupeActionsExtendedClient = this.smartAccountClient.extend(accountLoupeActions);
    //@ts-ignore
    await accountLoupeActionsExtendedClient.installPlugin({
      pluginAddress: this.pluginAddress,
      dependencies: [pluginDependency0, pluginDependency1],
    });
  }

  async uninstallPlugin(addr: Address) {
    const accountLoupeActionsExtendedClient = this.smartAccountClient.extend(accountLoupeActions);
    //@ts-ignore
    await accountLoupeActionsExtendedClient.uninstallPlugin({
      pluginAddress: this.pluginAddress,
    });
  }

  async execute(param: string) {
    //@ts-ignore
    const userOp = await this.smartAccountClient.sendUserOperation({ uo: param });
    const hash = await this.smartAccountClient.waitForUserOperationTransaction({ hash: userOp.hash });
    return hash;
  }

  async createProduct(
    name: string,
    description: string,
    logoUrl: string,
    chargeToken: Address,
    reciepient: Address,
    destinationChain: number
  ) {
    if (!(await this.isPluginInstalled())) {
      await this.installPlugin();
    }
    const param = this.pluginContract.interface.encodeFunctionData('createProduct', [
      ethers.encodeBytes32String(name),
      description,
      logoUrl,
      1,
      chargeToken,
      reciepient,
      destinationChain,
    ]) as any;
    const hash = await this.execute(param);
    console.log(`Create Product Txn Hash: ${hash}`);
    return hash;
  }

  async updateProduct(productId: number, reciepient: Address, destinationChain: number, isActive: boolean) {
    if (!(await this.isPluginInstalled())) {
      await this.installPlugin();
    }
    const param = this.pluginContract.interface.encodeFunctionData('updateProduct', [
      productId,
      reciepient,
      destinationChain,
      isActive,
    ]);

    const hash = await this.execute(param);
    console.log(`Update Product Txn Hash: ${hash}`);
    return hash;
  }

  async createPlan(productId: number, chargeInterval: number, price: number, decimals: number) {
    if (!(await this.isPluginInstalled())) {
      await this.installPlugin();
    }
    const param = this.pluginContract.interface.encodeFunctionData('createPlan', [
      productId,
      chargeInterval,
      this.formatPrice(price, decimals),
    ]) as any;
    const hash = await this.execute(param);
    console.log(`Create Plan Txn Hash: ${hash}`);
    return hash;
  }

  async updatePlan(planId: number, isActive: boolean) {
    if (!(await this.isPluginInstalled())) {
      await this.installPlugin();
    }
    const param = this.pluginContract.interface.encodeFunctionData('updatePlan', [planId, isActive]);
    const hash = await this.execute(param);
    console.log(`Update Plan Txn Hash: ${hash}`);
    return hash;
  }

  async createProductWithPlans(
    name: string,
    description: string,
    logoUrl: string,
    chargeToken: Address,
    reciepient: Address,
    destinationChain: number,
    plans: Plan[],
    decimals: number
  ) {
    if (!(await this.isPluginInstalled())) {
      await this.installPlugin();
    }
    const param = this.pluginContract.interface.encodeFunctionData('createProductWithPlans', [
      ethers.encodeBytes32String(name),
      description,
      logoUrl,
      1,
      chargeToken,
      reciepient,
      destinationChain,
      plans.map((plan) => {
        return { price: this.formatPrice(plan.price, decimals), chargeInterval: plan.chargeInterval };
      }),
    ]);
    const hash = await this.execute(param);
    console.log(`Create Product With Plans Txn Hash: ${hash}`);
    return hash;
  }

  async createRecurringPayment(
    name: string,
    description: string,
    logoUrl: string,
    chargeToken: Address,
    chargeInterval: number,
    endTime: number,
    reciepient: Address,
    destinationChain: number,
    price: number,
    decimals: number
  ) {
    if (!(await this.isPluginInstalled())) {
      await this.installPlugin();
    }
    const param = this.pluginContract.interface.encodeFunctionData('createRecurringPayment', [
      ethers.encodeBytes32String(name),
      description,
      logoUrl,
      chargeToken,
      reciepient,
      destinationChain,
      chargeInterval,
      endTime,
      this.formatPrice(price, decimals),
    ]);
    const hash = await this.execute(param);
    console.log(`Recurring Payment Txn Hash: ${hash}`);
    return hash;
  }

  async subscribe(planId: number, endTime: number) {
    if (!(await this.isPluginInstalled())) {
      await this.installPlugin();
    }
    const param = this.pluginContract.interface.encodeFunctionData('subscribe', [planId, endTime]);
    const hash = await this.execute(param);
    console.log(`Subscribe Txn Hash: ${hash}`);
    return hash;
  }

  async unSubscribe(subId: number) {
    if (!(await this.isPluginInstalled())) {
      await this.installPlugin();
    }
    const param = this.pluginContract.interface.encodeFunctionData('unSubscribe', [subId]);
    const hash = await this.execute(param);
    console.log(`Unsubscribe Txn Hash: ${hash}`);
    return hash;
  }

  async changeSubscriptionEndTime(subId: number, endTime: number) {
    if (!(await this.isPluginInstalled())) {
      await this.installPlugin();
    }
    const param = this.pluginContract.interface.encodeFunctionData('changeSubscriptionEndTime', [subId, endTime]);
    const hash = await this.execute(param);
    console.log(`Change subscription endtime Txn Hash: ${hash}`);
    return hash;
  }
}

const main = async () => {
  const subscriptionPluginAddr: Address = '0x37604f45111AB488aeC38DBb17F90Ef1CC90cc32';
  const oldPluginAddr: Address = '0xc0d50057A3a174267Ed6a95E7b1E4A7C7Df3D390';
  const PRIVATE_KEY = process.env.PRIVATE_KEY_1;
  const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
  const accountSalt = 13;
  const ACCOUNT_ABSTRATION_POLICY_ID = process.env.ACCOUNT_ABSTRATION_POLICY_ID;
  const provider = new AlchemyProvider('matic-amoy', ALCHEMY_API_KEY);
  const amoyChainId = 80002;
  const usdcDecimals = 6;
  const linkDecimals = 18;
  const linkAddr = '0x0Fd9e8d3aF1aaee056EB9e802c3A762a667b1904';
  const reciepient = '0xF65330dC75e32B20Be62f503a337cD1a072f898f';
  const smartAccount = await createModularAccountAlchemyClient({
    apiKey: ALCHEMY_API_KEY!,
    chain: polygonAmoy,
    //@ts-ignore
    signer: LocalAccountSigner.privateKeyToAccountSigner(PRIVATE_KEY),
    salt: BigInt(accountSalt || 0),
    gasManagerConfig: {
      policyId: ACCOUNT_ABSTRATION_POLICY_ID!,
    },
  });
  const client = new PluginClient(
    polygonAmoy,
    subscriptionPluginAddr,
    abi,
    //@ts-ignore
    smartAccount,
    provider
  );
  //await client.installPlugin();
  // Product ID -> 1
  // await client.createProductWithPlans(
  //   'YT Nigeria',
  //   'Share your videos with friends, family, and the world',
  //   'https://t3.ftcdn.net/jpg/05/07/46/84/240_F_507468479_HfrpT7CIoYTBZSGRQi7RcWgo98wo3vb7.jpg',
  //   linkAddr,
  //   reciepient,
  //   amoyChainId,
  //   [
  //     {// PlanID --> 1
  //       price: 1,
  //       chargeInterval: 3600,
  //     },
  //     {// PlanID --> 2
  //       price: 2,
  //       chargeInterval: 9000,
  //     }
  //   ],
  //   linkDecimals - 1
  // );
  // await client.createRecurringPayment( // ProductID --> 2 & Subscription 0
  //   "Debt repayment",
  //   "Monthly debt repayment for eniola",
  //   "https://amoy.polygonscan.com/assets/poly/images/svg/logos/logo-dim.svg?v=24.5.4.0",
  //   linkAddr,
  //   2592000,
  //   1725588639,
  //   reciepient,
  //   amoyChainId,
  //   5,
  //   linkDecimals - 1
  // );
  // await client.createProduct( // Product ID --> 3
  //   "YT Music Nigeria",
  //   "A new music service with official albums, singles, videos, remixes, live performances and more for Android, iOS and desktop. It's all here.",
  //   "https://music.youtube.com/img/on_platform_logo_dark.svg",
  //   "0x0Fd9e8d3aF1aaee056EB9e802c3A762a667b1904",
  //   "0xF65330dC75e32B20Be62f503a337cD1a072f898f",
  //   amoyChainId
  // );
  // await client.createPlan( // Plan ID --> 4
  //   3,
  //   3600,
  //   5,
  //   linkDecimals - 1
  // );
  // await client.subscribe(
  //   1,
  //   1725554989
  // )
  // await client.changeSubscriptionEndTime(
  //   1,
  //   0 // indefinite
  // )
  // await client.subscribe(
  //   4,
  //   1725554989
  // )
  // await client.unSubscribe(
  //   2
  // );
};
main();
