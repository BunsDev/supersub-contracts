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
    //@ts-ignore
    const userOp = await this.smartAccountClient.sendUserOperation({ uo: param });
    const hash = await this.smartAccountClient.waitForUserOperationTransaction({ hash: userOp.hash });
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
    //@ts-ignore
    const userOp = await this.smartAccountClient.sendUserOperation({ uo: param });
    const hash = await this.smartAccountClient.waitForUserOperationTransaction({ hash: userOp.hash });
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
    //@ts-ignore
    const userOp = await this.smartAccountClient.sendUserOperation({ uo: param });
    const hash = await this.smartAccountClient.waitForUserOperationTransaction({ hash: userOp.hash });
    return hash;
  }

  async updatePlan(planId: number, isActive: boolean) {
    if (!(await this.isPluginInstalled())) {
      await this.installPlugin();
    }
    const param = this.pluginContract.interface.encodeFunctionData('updatePlan', [planId, isActive]);
    //@ts-ignore
    const userOp = await this.smartAccountClient.sendUserOperation({ uo: param });
    const hash = await this.smartAccountClient.waitForUserOperationTransaction({ hash: userOp.hash });
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
    // const res = [
    //   ethers.encodeBytes32String(name),
    //   description,
    //   logoUrl,
    //   1,
    //   chargeToken,
    //   reciepient,
    //   destinationChain,
    //   plans.map(plan=>{
    //     return [this.formatPrice(plan.price, decimals), plan.chargeInterval]
    //   })
    // ];
    // console.log(res);
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
    //@ts-ignore
    const userOp = await this.smartAccountClient.sendUserOperation({ uo: param });
    const hash = await this.smartAccountClient.waitForUserOperationTransaction({ hash: userOp.hash });
    return hash;
  }

  async createRecurringSubscription(
    name: string,
    description: string,
    logoUrl: string,
    chargeToken: Address,
    chargeInterval: number,
    reciepient: Address,
    destinationChain: number,
    price: number,
    decimals: number
  ) {
    if (!(await this.isPluginInstalled())) {
      await this.installPlugin();
    }
    const param = this.pluginContract.interface.encodeFunctionData('createRecurringSubscription', [
      ethers.encodeBytes32String(name),
      description,
      logoUrl,
      chargeToken,
      reciepient,
      destinationChain,
      chargeInterval,
      this.formatPrice(price, decimals),
    ]);
    //@ts-ignore
    const userOp = await this.smartAccountClient.sendUserOperation({ uo: param });
    const hash = await this.smartAccountClient.waitForUserOperationTransaction({ hash: userOp.hash });
    return hash;
  }

  async subscribe(planId: number, endTime: number) {
    if (!(await this.isPluginInstalled())) {
      await this.installPlugin();
    }
    const param = this.pluginContract.interface.encodeFunctionData('subscribe', [planId, endTime]);
    //@ts-ignore
    const userOp = await this.smartAccountClient.sendUserOperation({ uo: param });
    const hash = await this.smartAccountClient.waitForUserOperationTransaction({ hash: userOp.hash });
    return hash;
  }

  async unSubscribe(subId: number) {
    if (!(await this.isPluginInstalled())) {
      await this.installPlugin();
    }
    const param = this.pluginContract.interface.encodeFunctionData('unSubscribe', [subId]);
    //@ts-ignore
    const userOp = await this.smartAccountClient.sendUserOperation({ uo: param });
    const hash = await this.smartAccountClient.waitForUserOperationTransaction({ hash: userOp.hash });
    return hash;
  }
}

const main = async () => {
  const subscriptionPluginAddr: Address = '0x92010Ac5622eDE0eD5AAe577A418A734A3B069a8';
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
  // await createProduct(
  //   "Spotify NGN",
  //   "spotify nigeria product",
  //   "https://upload.wikimedia.org/wikipedia/commons/1/19/Spotify_logo_without_text.svg",
  //   "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
  //   amoyChainId
  // )
  // await createPlan(
  //   1,
  //   86400, // 24 hours
  //   5
  // )
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
  // const hash = await client.createProduct(
  //   "YT Music Nigeria",
  //   "A new music service with official albums, singles, videos, remixes, live performances and more for Android, iOS and desktop. It's all here.",
  //   "https://music.youtube.com/img/on_platform_logo_dark.svg",
  //   "0x0Fd9e8d3aF1aaee056EB9e802c3A762a667b1904",
  //   "0xF65330dC75e32B20Be62f503a337cD1a072f898f",
  //   amoyChainId
  // );
  // const hash = await client.createPlan(
  //   2,
  //   86400,
  //   5,
  //   linkDecimals - 1
  // );
  const hash = await client.createProductWithPlans(
    'YT Nigeria',
    'Share your videos with friends, family, and the world',
    'https://t3.ftcdn.net/jpg/05/07/46/84/240_F_507468479_HfrpT7CIoYTBZSGRQi7RcWgo98wo3vb7.jpg',
    linkAddr,
    reciepient,
    amoyChainId,
    [
      {
        price: 1,
        chargeInterval: 86400,
      },
    ],
    linkDecimals - 1
  );
  console.log(hash);
};
main();
