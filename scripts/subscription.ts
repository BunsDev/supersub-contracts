import { Address } from '@alchemy/aa-core';
import {
  AddressLike,
  AlchemyProvider,
  Contract,
  encodeBytes32String,
  hexlify,
  Networkish,
  Wallet,
  zeroPadValue,
} from 'ethers';
import { abi } from '../artifacts/contracts/SubscriptionManagerWithProducts.sol/ProductSubscriptionManagerPlugin.json';
import { ALCHEMY_API_KEY, PRIVATE_KEY_1, PRIVATE_KEY_2 } from './main';

function filterArrayInRange(array: number[], minValue: number, maxValue: number): number[] {
  return array.filter((num) => num >= minValue && num <= maxValue);
}

export class Subscription {
  chain: Networkish;
  address: Address;
  contract: Contract;

  constructor(chain: string, address: Address) {
    this.address = address;
    this.chain = chain;
    const provider = new AlchemyProvider(chain, ALCHEMY_API_KEY);
    this.contract = new Contract(address, abi, provider);
  }

  async getDependency() {
    const dependency0 = await this.contract.pack('0xcE0000007B008F50d762D155002600004cD6c647', 0);
    const dependency1 = await this.contract.pack('0xcE0000007B008F50d762D155002600004cD6c647', 1);
    return [dependency0, dependency1];
  }

  async getManifestHash() {
    const manifest = await this.contract.pluginManifest();
    return this.contract.interface.encodeFunctionResult('pluginManifest', [manifest]) as Address;
  }

  encodeCreateRecurringPaymentParams(
    productId: number,
    initPlans: {
      price: number;
      chargeInterval: number;
      tokenAddress: string;
      receivingAddress: string;
      destinationChain: number;
    },
    subscribeParams: {
      endTime: number;
      paymentToken: string;
      paymentTokenSwapFee: number;
    }
  ) {
    return this.contract.interface.encodeFunctionData('createRecurringPayment', [
      productId,
      initPlans,
      subscribeParams.endTime,
      subscribeParams.paymentToken,
      subscribeParams.paymentTokenSwapFee,
    ]);
  }

  encodeCreateProductParams(
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
    return this.contract.interface.encodeFunctionData('createProduct', [
      encodeBytes32String(name),
      description,
      logoURL,
      productType,
      initPlans || [],
    ]);
  }

  encodeUpdateProductParams(productId: number, isActive: boolean) {
    return this.contract.interface.encodeFunctionData('updateProduct', [productId, isActive]);
  }

  encodeCreateSubscriptionPlanParams(
    productId: number,
    price: number,
    chargeInterval: number,
    planPaymentToken: string,
    receivingAddress: string,
    destinationChain: number
  ) {
    return this.contract.interface.encodeFunctionData('createSubscriptionPlan', [
      productId,
      price,
      chargeInterval,
      planPaymentToken,
      receivingAddress,
      destinationChain,
    ]);
  }

  encodeUpdateSubscriptionPlanParams(
    planId: number,
    receivingAddress: string,
    destinationChain: number,
    isActive: boolean
  ) {
    return this.contract.interface.encodeFunctionData('updateSubscriptionPlan', [
      planId,
      receivingAddress,
      destinationChain,
      isActive,
    ]);
  }

  encodeSubscribeFunctionParamas(planId: number, duration: number, paymentToken: string, paymentTokenSwapFee: number) {
    return this.contract.interface.encodeFunctionData('subscribe', [
      planId,
      duration,
      paymentToken,
      paymentTokenSwapFee,
    ]);
  }

  encodeUpdateUserSubscriptionParams(
    planId: number,
    endTime: number,
    paymentToken: string,
    paymentTokenSwapFee: number
  ) {
    return this.contract.interface.encodeFunctionData('updateUserSubscription', [
      planId,
      endTime,
      paymentToken,
      paymentTokenSwapFee,
    ]);
  }

  encodeUnsubscribeFunctionParamas(planId: number) {
    return this.contract.interface.encodeFunctionData('unsubscribe', [planId]);
  }

  async charge(planId: number, subscriber: string) {
    const chain = this.chain;
    const provider = new AlchemyProvider(chain, ALCHEMY_API_KEY);
    const signer = new Wallet(PRIVATE_KEY_2!, provider);
    const newContract = this.contract.connect(signer);
    //@ts-ignore
    await newContract.charge(planId, subscriber);
  }

  async getSubscriptionPlanById(planId: number) {
    return this.contract.subscriptionPlans(planId);
  }

  async addSubscriptionSupportedToken(tokenAddr: string) {
    const provider = new AlchemyProvider(this.chain, ALCHEMY_API_KEY);
    const signer = new Wallet(PRIVATE_KEY_1!, provider);
    const newContract = this.contract.connect(signer);
    //@ts-ignore
    return newContract.addSupportedToken(tokenAddr);
  }

  async getSubscriptionByAddress(subscriber: Address, minPlanId?: number, maxPlanId?: number) {
    const numOfSubscription = Number(await this.contract.numSubscriptionPlans());
    console.log(await this.checkAddressSubscribedToPlan(subscriber, 0));
    const numbers = Array.from({ length: numOfSubscription }, (_, i) => i); // Array of numbers from 0 to 100
    const filteredNumbers = filterArrayInRange(numbers, minPlanId || 0, maxPlanId || numOfSubscription - 1);

    const subscriptions = await Promise.all(
      filteredNumbers.map((number) => this.getUserSubscriptionByPlanId(subscriber, number))
    );
    return subscriptions;
  }

  async checkAddressSubscribedToPlan(subscriber: string, planId: number) {
    return await this.contract.isSubscribedToPlan(planId, subscriber);
  }

  async getUserSubscriptionByPlanId(subscriber: string, planId: number) {
    return await this.contract.subscriptionStatuses(subscriber, planId);
  }

  async updatePlan(planId: number, receivingAddress: string, destinationChain: number, isActive: boolean) {
    const provider = new AlchemyProvider(this.chain, ALCHEMY_API_KEY);
    const signer = new Wallet(PRIVATE_KEY_2!, provider);
    const newContract = this.contract.connect(signer);
    //@ts-ignore
    const txn2 = await newContract.updateSubscriptionPlan(planId, receivingAddress, destinationChain, isActive);
    await txn2.wait();
  }

  async updateProduct(productId: number, isActive: boolean) {
    const provider = new AlchemyProvider(this.chain, ALCHEMY_API_KEY);
    const signer = new Wallet(PRIVATE_KEY_2!, provider);
    const newContract = this.contract.connect(signer);
    //@ts-ignore
    const txn2 = await newContract.updateProduct(productId, isActive);
    await txn2.wait();
  }

  async createProduct(name?: string, description?: string, logoURL?: string, productType?: 0 | 1) {
    const provider = new AlchemyProvider(this.chain, ALCHEMY_API_KEY);
    const signer = new Wallet(PRIVATE_KEY_2!, provider);
    const newContract = this.contract.connect(signer);
    //@ts-ignore
    const txn2 = await newContract.createProduct(
      encodeBytes32String(name || 'Spotify'),
      description || 'Enjoy unlimited music',
      logoURL || 'spotify.jpg',
      productType || 1
    );
    await txn2.wait();
  }

  async getTotalProducts() {
    return this.contract.numProducts();
  }

  async getTotalPlans() {
    return this.contract.numSubscriptionPlans();
  }

  async getProductForRecurringPayment(address: string) {
    const filters = {
      topics: [
        this.contract.interface.getEvent('ProductCreated')!.topicHash,
        zeroPadValue(address, 32),
        '0x0000000000000000000000000000000000000000000000000000000000000000',
      ],
      toBlock: 'latest',
      fromBlock: 0, //change to from block
    };

    const logs = await this.contract.queryFilter(filters.topics, filters.fromBlock, filters.toBlock);
    if (logs.length > 0) {
      return this.contract.interface.decodeEventLog('ProductCreated', logs[0].data)[0]; //use earliest
    }
    const productId = await this.getTotalProducts();
    return productId;
  }

  async createPlan(
    productId?: number,
    price?: number,
    chargeInterval?: number,
    planPaymentToken?: string,
    receivingAddress?: string,
    destinationChain?: number
  ) {
    const txn = await this.addSubscriptionSupportedToken(
      planPaymentToken || '0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582'
    );
    const totalProductId = await this.getTotalProducts();
    await txn.wait();
    const provider = new AlchemyProvider(this.chain, ALCHEMY_API_KEY);
    const signer = new Wallet(PRIVATE_KEY_2!, provider);
    const newContract = this.contract.connect(signer);
    //@ts-ignore
    const txn2 = await newContract.createSubscriptionPlan(
      productId || totalProductId,
      price || 100000,
      chargeInterval || 24 * 3600 * 30,
      planPaymentToken || '0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582',
      receivingAddress || signer.address,
      destinationChain || 4
    );
    await txn2.wait();
  }
}
