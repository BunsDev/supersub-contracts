import { ethers } from 'hardhat';

type Network = 'testnet' | 'mainnet';
type Chain = 'eth' | 'zkEVM';

async function deploy(
  supportedTokens: string[],
  chainId: number,
  swapRouterAddr: string,
  swapFactoryAddr: string,
  WETH: string
) {
  const subscriptionManger = await ethers.deployContract('SubscriptionManagerPlugin', [
    supportedTokens,
    chainId,
    swapFactoryAddr,
    swapRouterAddr,
    WETH,
  ]);

  await subscriptionManger.waitForDeployment();
  console.log(`Subscription Manager  Deployed At: ${subscriptionManger.target}`);
}

// deploy("testnet", "zkEVM").catch((error) => console.log(error));
// deploy("mainnet", "eth").catch((error) => console.log(error));
const swapRouterAddr = '0x4832EEB61E08A4fdCABDBD5d7ea131A7b82714b2';
const swapFactoryAddr = '0xa104915E5729681075E308F8bB133213C839fe93';
const WETH = '0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9';
deploy(['0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'], 4, swapFactoryAddr, swapRouterAddr, WETH);
