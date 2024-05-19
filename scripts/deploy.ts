import { ethers } from 'hardhat';

type Network = 'testnet' | 'mainnet';
type Chain = 'eth' | 'zkEVM';

async function deploy(supportedTokens: string[], chainId: number,swapRouterAddr:string,swapFactoryAddr:string,WETH:string) {
  
  const subscriptionManger = await ethers.deployContract('SubscriptionManagerPlugin', [supportedTokens, chainId,]);

  await subscriptionManger.waitForDeployment();
  console.log(`Subscription Manager  Deployed At: ${subscriptionManger.target}`);
}

// deploy("testnet", "zkEVM").catch((error) => console.log(error));
// deploy("mainnet", "eth").catch((error) => console.log(error));
deploy(['0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'], 4,"","","");
