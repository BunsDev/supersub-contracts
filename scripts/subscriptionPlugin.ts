import { Address, BatchUserOperationCallData, UserOperationCallData } from '@alchemy/aa-core';
import { AlchemyProvider, Contract, Interface, Networkish, Wallet, ZeroAddress } from 'ethers';
import { AlchemySmartAccountClient, createModularAccountAlchemyClient } from '@alchemy/aa-alchemy';
import { accountLoupeActions } from '@alchemy/aa-accounts';
import { LocalAccountSigner, polygonAmoy } from '@alchemy/aa-core';
import { abi } from '../artifacts/contracts/SubscriptionPlugin.sol/SubscriptionPlugin.json';
import { abi as bridgeAbi } from '../artifacts/contracts/CCIP.sol/SubscriptionTokenBridge.json';
import { SubscriptionPlugin, SubscriptionTokenBridge } from '../typechain-types';
import { ethers } from 'ethers';
import { config as envConfig } from 'dotenv';

envConfig();

interface Plan {
  price: number;
  chargeInterval: number;
}

class PluginClient {
  chain: Networkish;
  signer: Wallet;
  pluginAddress: Address;
  pluginContract: SubscriptionPlugin;
  bridgeContract: SubscriptionTokenBridge;
  smartAccountClient: AlchemySmartAccountClient;

  constructor(
    chain: Networkish,
    pluginAddr: Address,
    pluginAbi: ethers.Interface | ethers.InterfaceAbi,
    bridgeAddr: Address,
    bridgeAbi: ethers.Interface | ethers.InterfaceAbi,
    client: AlchemySmartAccountClient,
    provider: AlchemyProvider,
    signer: Wallet
  ) {
    this.chain = chain;
    this.signer = signer;
    this.pluginAddress = pluginAddr;
    this.pluginContract = new Contract(pluginAddr, pluginAbi, provider) as unknown as SubscriptionPlugin;
    this.bridgeContract = new Contract(bridgeAddr, bridgeAbi, provider) as unknown as SubscriptionTokenBridge;
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

  async execute(param: string | UserOperationCallData | BatchUserOperationCallData) {
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

  async sendToken(tokenAddr: string, recipient: string, value: bigint) {
    var userOp: UserOperationCallData;
    if (tokenAddr == ZeroAddress) {
      userOp = {
        target: recipient as `0x${string}`,
        value: value,
        data: '0x',
      };
    } else {
      const erc20Abi = ['function transfer(address to, uint256 value) public returns (bool)'];

      // Create an instance of the Interface
      const callData = new Interface(erc20Abi).encodeFunctionData('transfer', [recipient, value]);
      userOp = {
        target: tokenAddr as `0x${string}`,
        data: callData as `0x${string}`,
      };
    }
    const hash = await this.execute(userOp);
    console.log(`Change sendToken  Txn Hash: ${hash}`);
    return hash;
  }

  async bridgeAsset(chainSelector: bigint, reciepient: string, token: string, value: number) {
    const erc20Abi = ['function approve(address spender, uint256 value) public returns (bool)'];
    const bridgeContractAddr = await this.bridgeContract.getAddress();
    const approveCallData = new Interface(erc20Abi).encodeFunctionData('approve', [bridgeContractAddr, value]);
    const approveUserOp = {
      target: token as `0x${string}`,
      data: approveCallData as `0x${string}`,
    };

    const callData = this.bridgeContract.interface.encodeFunctionData('transferToken', [
      chainSelector,
      reciepient,
      token,
      value,
      0,
      0,
    ]);
    const bridgeUserOp = {
      target: bridgeContractAddr as `0x${string}`,
      data: callData as `0x${string}`,
    };
    const hash = await this.execute([approveUserOp, bridgeUserOp]);
    console.log(`Change bridge Asset  Txn Hash: ${hash}`);
    return hash;
  }
}

const main = async () => {
  const subscriptionPluginAddr: Address = '0x37604f45111AB488aeC38DBb17F90Ef1CC90cc32';
  const oldPluginAddr: Address = '0xc0d50057A3a174267Ed6a95E7b1E4A7C7Df3D390';
  const ccipBridgeAddr: Address = '0x28689f559337a8851b53ab5f3e0ddd39e5d145eb';
  const PRIVATE_KEY = process.env.PRIVATE_KEY_1;
  const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
  const accountSalt = 13;
  const ACCOUNT_ABSTRATION_POLICY_ID = process.env.ACCOUNT_ABSTRATION_POLICY_ID;
  const provider = new AlchemyProvider('matic-amoy', ALCHEMY_API_KEY);
  const signer = new Wallet(PRIVATE_KEY!, provider);
  const amoyChainId = 80002;
  const sepoliaChainId = 11155111;
  const usdcDecimals = 6;
  const linkDecimals = 18;
  const usdcAddr = '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582';
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
    ccipBridgeAddr,
    bridgeAbi,
    //@ts-ignore
    smartAccount,
    provider,
    signer
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

  // CCIP Bridge Test Txns
  // await client.pluginContract.connect(client.signer).addChainSelector(sepoliaChainId, BigInt('16015286601757825753'));
  //console.log(await client.pluginContract.ccipChainSelectors(sepoliaChainId))
  // await client.createProductWithPlans(
  //   'Spotify NGN',
  //   'Spotify is a digital music service that gives you access to millions of songs.',
  //   'https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Spotify_logo_without_text.svg/168px-Spotify_logo_without_text.svg.png',
  //   usdcAddr,
  //   reciepient,
  //   sepoliaChainId,
  //   [
  //     {// PLAN ID -> 5
  //       price: 1,
  //       chargeInterval: 3600,
  //     },
  //     {// PLAN ID -> 6
  //       price: 2,
  //       chargeInterval: 9000,
  //     }
  //   ],
  //   usdcDecimals - 1
  // );
  //const plan = await client.pluginContract.plans(5);
  // await client.subscribe(5, 0);
  //console.log(await client.bridgeContract.allowedDestinationChains(BigInt('16015286601757825753')))
  // const product = await client.pluginContract.products(plan.productId)
  // console.log(plan.planId, plan.productId, plan.price, plan.provider, product.chargeToken, product.destinationChain);
};
main();
