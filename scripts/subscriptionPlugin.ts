import { Address } from '@alchemy/aa-core';
import { AlchemyProvider, Contract, Wallet } from 'ethers';
import { createModularAccountAlchemyClient } from '@alchemy/aa-alchemy';
import { accountLoupeActions } from '@alchemy/aa-accounts';
import { LocalAccountSigner, polygonAmoy } from '@alchemy/aa-core';
import { abi } from '../artifacts/contracts/SubscriptionPlugin.sol/SubscriptionPlugin.json';
import { SubscriptionPlugin } from '../typechain-types';
import { ethers } from 'ethers';
import { config as envConfig } from 'dotenv';

envConfig();

const subscriptionPluginAddr: Address = '0x92010Ac5622eDE0eD5AAe577A418A734A3B069a8';
const PRIVATE_KEY_1 = process.env.PRIVATE_KEY_1;
const PRIVATE_KEY_2 = process.env.PRIVATE_KEY_2;
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
const accountSalt = 13;
const ACCOUNT_ABSTRATION_POLICY_ID = process.env.ACCOUNT_ABSTRATION_POLICY_ID;
const provider = new AlchemyProvider('matic-amoy', ALCHEMY_API_KEY);
const subscriptionPlugin = new Contract(subscriptionPluginAddr, abi, provider) as unknown as SubscriptionPlugin;
const signer = new Wallet(PRIVATE_KEY_2!, provider);
const amoyChainId = 80002;
const usdcDecimals = 6;

const setUpModularAccount = async (privateKey: String, salt: number) => {
  const smartAccount = await createModularAccountAlchemyClient({
    apiKey: ALCHEMY_API_KEY!,
    chain: polygonAmoy,
    //@ts-ignore
    signer: LocalAccountSigner.privateKeyToAccountSigner(privateKey),
    salt: BigInt(salt || 0),
    gasManagerConfig: {
      policyId: ACCOUNT_ABSTRATION_POLICY_ID!,
    },
  });
  const accountLoupeActionsExtendedClient = smartAccount.extend(accountLoupeActions);
  const installedPlugins = await accountLoupeActionsExtendedClient.getInstalledPlugins({});
  if (!installedPlugins.map((addr) => addr.toLowerCase()).includes(subscriptionPluginAddr.toLowerCase())) {
    const pluginDependency0 = (await subscriptionPlugin.pack(
      '0xcE0000007B008F50d762D155002600004cD6c647',
      0
    )) as unknown as `0x${string}`;
    const pluginDependency1 = (await subscriptionPlugin.pack(
      '0xcE0000007B008F50d762D155002600004cD6c647',
      1
    )) as unknown as `0x${string}`;
    await accountLoupeActionsExtendedClient.installPlugin({
      pluginAddress: subscriptionPluginAddr,
      dependencies: [pluginDependency0, pluginDependency1],
    });
  }
  return smartAccount;
};

const createProduct = async (
  name: string,
  description: string,
  logo: string,
  chargeToken: string,
  destinationChain: number
) => {
  const txn = await subscriptionPlugin
    .connect(signer)
    .createProduct(
      ethers.encodeBytes32String(name),
      description,
      logo,
      1,
      chargeToken,
      signer.address,
      destinationChain
    );
  console.log(`Transaction Hash: ${txn.hash}`);
};

const createPlan = async (productId: number, chargeInterval: number, price: number) => {
  const txn = await subscriptionPlugin
    .connect(signer)
    .createPlan(productId, chargeInterval, BigInt(price) * BigInt(10) ** BigInt(usdcDecimals));
  console.log(`Transaction Hash: ${txn.hash}`);
};

const updateProduct = async (productId: number, reciepient: string, destChain: number) => {
  const txn = await subscriptionPlugin.connect(signer).updateProduct(productId, reciepient, destChain, true);
  console.log(`Transaction Hash: ${txn.hash}`);
};

const updatePlan = async (planId: number) => {
  const txn = await subscriptionPlugin.connect(signer).updatePlan(planId, true);
  console.log(`Transaction Hash: ${txn.hash}`);
};

const main = async () => {
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
  const smartAccount = await setUpModularAccount(PRIVATE_KEY_1!, accountSalt);
  const subscribeParams = subscriptionPlugin.interface.encodeFunctionData('unSubscribe', [0]) as any;
  const userOp = await smartAccount.sendUserOperation({ uo: subscribeParams });
  const hash = await smartAccount.waitForUserOperationTransaction({ hash: userOp.hash });
  console.log(`Transaction hash: ${hash}`);
};
main();
