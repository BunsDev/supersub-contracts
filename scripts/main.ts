import { Address, polygonAmoy, sepolia } from '@alchemy/aa-core';
import { config as envConfig } from 'dotenv';
import { UserAccount } from './account';
import { Subscription } from './subscription';
import { AlchemyProvider, formatEther, parseEther, Wallet, ZeroAddress } from 'ethers';

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

//'0xf3e04Aeab32569c69F60f44fBA797922FC6b1cE2' use for everything except createRecurringPayment

export const subscriptionPluginAddr: Address = '0x8B09DBE796e0383C32a3D7F403bEed0E9135c49A';
export const PRIVATE_KEY_1 = process.env.PRIVATE_KEY_1;
export const PRIVATE_KEY_2 = process.env.PRIVATE_KEY_2;
export const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
export const accountSalt = 13;
const subscription = new Subscription('matic-amoy', subscriptionPluginAddr);

export const ACCOUNT_ABSTRATION_POLICY_ID = process.env.ACCOUNT_ABSTRATION_POLICY_ID;

async function createProduct() {
  const provider = new AlchemyProvider('matic-amoy', ALCHEMY_API_KEY);
  const signer = new Wallet(PRIVATE_KEY_2!, provider);
  const account = new UserAccount(signer.privateKey!, polygonAmoy, accountSalt);
  const smartAccountAddress = (await account.initializeAccountClient()).getAddress();
  console.log('Smart Account Addr', smartAccountAddress);
  const subscription = new Subscription('matic-amoy', subscriptionPluginAddr);
  const productName = 'Spotify inc';
  const productLogoUrl = 'https://storage.googleapis.com/pr-newsroom-wp/1/2023/05/Spotify_Primary_Logo_RGB_Black.png';
  const productDescription = 'Spotify is a digital music service that gives you access to millions of songs.';
  const productType = 1;
  const initialPlans = [
    {
      price: 100000,
      chargeInterval: 24 * 3600 * 30,
      tokenAddress: '0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582',
      receivingAddress: smartAccountAddress,
      destinationChain: 4,
    },
    {
      price: 100000000000000,
      chargeInterval: 24 * 3600 * 30,
      tokenAddress: ZeroAddress,
      receivingAddress: smartAccountAddress,
      destinationChain: 4,
    },
  ];
  await account.createProduct(subscription, productName, productDescription, productLogoUrl, productType, initialPlans);
  // await subscription.createProduct(productName, productDescription, productLogoUrl, productType);
}

async function createRecurringPayment() {
  const provider = new AlchemyProvider('matic-amoy', ALCHEMY_API_KEY);
  const signer = new Wallet(PRIVATE_KEY_2!, provider);
  const account = new UserAccount(signer.privateKey!, polygonAmoy, accountSalt);
  const smartAccountAddress = (await account.initializeAccountClient()).getAddress();
  console.log('Smart Account Addr', smartAccountAddress);
  const subscription = new Subscription('matic-amoy', subscriptionPluginAddr);
  const duration = 24 * 30 * 12 * 60 * 60;
  const endTime = Math.floor(Date.now() / 1000) + duration;
  const initialPlans = [
    {
      price: 100000000000000,
      chargeInterval: 24 * 3600 * 30,
      tokenAddress: ZeroAddress,
      receivingAddress: '0x9d1bc836941319df22C3Dd9Ebba6EB1eE058b623',
      destinationChain: 4,
    },
  ];
  await account.createRecurringPayment(subscription, initialPlans[0], endTime);
}

async function main() {
  const provider = new AlchemyProvider('matic-amoy', ALCHEMY_API_KEY);
  const signer = new Wallet(PRIVATE_KEY_1!, provider);
  const account = new UserAccount(signer.privateKey!, polygonAmoy, accountSalt);
  const smartAccountAddress = (await account.initializeAccountClient()).getAddress();
  console.log('Smart Account Addr', smartAccountAddress);

  const planId = Number(await subscription.getTotalPlans());
  console.log(planId);

  const duration = 24 * 30 * 12 * 60 * 60;
  const endTime = Math.floor(Date.now() / 1000) + duration;
  await account.subscribe(subscription, planId - 1, endTime);

  console.log('Successfully subscribed');
  console.log(await account.getSubscriptions(subscription));
  console.log(formatEther(100000000000000n));

  // await account.changeSubscriptionPlanPaymentInfo(
  //   subscription,
  //   0,
  //   endTime,
  //   '0x2B0B2894A7003a2617f1C8322951D569Cc6b7cb7'
  // );
}

async function charge() {
  const provider = new AlchemyProvider('matic-amoy', ALCHEMY_API_KEY);
  const subscription = new Subscription('matic-amoy', subscriptionPluginAddr);
  const signer = new Wallet(PRIVATE_KEY_2!, provider);
  // console.log(await subscription.getSubscriptionPlanById(2));
  const account = new UserAccount(signer.privateKey!, polygonAmoy, accountSalt);
  const smartAccountAddress = (await account.initializeAccountClient()).getAddress();
  console.log(smartAccountAddress);
  await subscription.charge(0, smartAccountAddress);
  console.log('Successfully charged subscription');
}

//FUNCTIONS TO RUN

// createRecurringPayment(); //0xee558a9391ab56f59c933056c35044573caeb4f63928efb4cdb14cd6a50bb8e4 tx hash of create Recurring Payment

// createProduct(); //0xa442fa1f006f09f4f975b6d80f193340062692c29343182e4599771a6e6e02a3 tx hash of product and plan creation(check on polygonscan yourself)
// main();
//First subscribe txnHash 0x763cda5150e6b7068c10bb88f8c205f83449a274fcd946ff3e09e55524d5eb67 of subscription
//Second subscribe txnHash 0xd6dd75b4432c866c8952237b49c3f304ee8e7a0ab06422e9a04addac1992cc00

charge(); //https://amoy.polygonscan.com/tx/0x681b4e921981fd2ad7c338fae780f74e7017c54a3e826179c9127e3443266460 (charge with native token)

//old adresss
// 0x8cda78ab26ab7e06dae01972a9d47b4ce0f673e1dc16671750fa8155d827cde4 charged in USDC token
// 0x8cda78ab26ab7e06dae01972a9d47b4ce0f673e1dc16671750fa8155d827cde4 charged in USDC token

// version of modular account sdk to use
// "@alchemy/aa-alchemy": "^3.14.1",
// "@alchemy/aa-core": "^3.12.3",
