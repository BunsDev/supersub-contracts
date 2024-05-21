import { Address, polygonAmoy, sepolia } from '@alchemy/aa-core';
import { config as envConfig } from 'dotenv';
import { UserAccount } from './account';
import { Subscription } from './subscription';
import { AlchemyProvider, parseEther, Wallet } from 'ethers';

envConfig();

// Supported Networks

// Ethereum Mainnet (mainnet)
// Goerli Testnet (goerli)
// Sepolia Testnet (sepolia)
// Arbitrum (arbitrum)
// Arbitrum Goerli Testnet (arbitrum-goerli)
// Arbitrum Sepolia Testnet (arbitrum-sepolia)
// Base (base)
// Base Goerlia Testnet (base-goerli)
// Base Sepolia Testnet (base-sepolia)
// Optimism (optimism)
// Optimism Goerli Testnet (optimism-goerli)
// Optimism Sepolia Testnet (optimism-sepolia)
// Polygon (matic)
// Polygon Amoy Testnet (matic-amoy)
// Polygon Mumbai Testnet (matic-mumbai)

export const subscriptionPluginAddr: Address = '0x43121CB8e7EDCbc7Ce46be07965f678a9a9a530B';
export const PRIVATE_KEY_1 = process.env.PRIVATE_KEY_1;
export const PRIVATE_KEY_2 = process.env.PRIVATE_KEY_2;
export const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
export const accountSalt = 8;

export const ACCOUNT_ABSTRATION_POLICY_ID = process.env.ACCOUNT_ABSTRATION_POLICY_ID;

async function main() {
  const provider = new AlchemyProvider('matic-amoy', ALCHEMY_API_KEY);
  const signer = new Wallet(PRIVATE_KEY_2!, provider);
  const account = new UserAccount(signer.privateKey!, polygonAmoy, accountSalt);
  const smartAccountAddress = (await account.initializeAccountClient()).getAddress();
  console.log('Smart Account Addr', smartAccountAddress);
  // const tx=await signer.sendTransaction({
  //      to:smartAccountAddress,
  //      data:"0x",
  //      value:parseEther("0.001")
  // })
  // await tx.wait()
  const subscription = new Subscription('matic-amoy', subscriptionPluginAddr);
  //     await subscription.createPlan();
  //     console.log('Successfully created Plan');
  const planId = Number(await subscription.contract.numSubscriptionPlans());
  //   console.log(planId);

  //   //   // await account.sendEther()
  const duration = 24 * 30 * 12 * 60 * 60;
  //   //   //      // console.log(duration)
  //     await account.subscribe(subscription, planId - 1, duration);
  await account.changeSubscriptionPlanPaymentInfo(
    subscription,
    0,
    Math.floor(Date.now() / 1000) + duration,
    '0x2B0B2894A7003a2617f1C8322951D569Cc6b7cb7'
  );
  console.log(await account.getSubscriptions(subscription));
  //   console.log(await account.getSubscriptionInfo(subscription, 1));
  //   console.log(await subscription.getSubscriptionById(0));
  //   console.log('Successfully subscribed');
}

async function charge() {
  const provider = new AlchemyProvider('matic-amoy', ALCHEMY_API_KEY);
  const subscription = new Subscription('matic-amoy', subscriptionPluginAddr);
  const signer = new Wallet(PRIVATE_KEY_2!, provider);
  const account = new UserAccount(signer.privateKey!, polygonAmoy, accountSalt);
  const smartAccountAddress = (await account.initializeAccountClient()).getAddress();
  await subscription.charge(0, smartAccountAddress);
  console.log('Successfully charged subscription');
}

// main();
// charge();
