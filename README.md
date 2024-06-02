# Supersub Contracts

This repository contains the core smart contracts for [Supersub](https://supersub.vercel.app/), a subscription platform powered by Alchemy's account abstraction [infrastructure](https://www.alchemy.com/account-abstraction-infrastructure) and Chainlink's [Cross-chain interoperability protocol](https://chain.link/cross-chain). The contracts are divided into two main components; [`Subscription Plugin`](contracts/SubscriptionPlugin.sol) and [`Cross chain Bridge`](contracts/CCIP.sol).

## Subscription Plugin

This contract implements the [ERC-6900](https://eips.ethereum.org/EIPS/eip-6900) standard, empowering Supersub's smart contract accounts with subscription capabilities. By installing this plugin, smart accounts gain the ability to create products and plans, set up recurring subscriptions, subscribe to services, and manage active subscriptions seamlessly.

### Deployment Addresses

|  Blockchain  |                                                            Address                                                            |
| :----------: | :---------------------------------------------------------------------------------------------------------------------------: |
| Polygon Amoy | [0x37604f45111AB488aeC38DBb17F90Ef1CC90cc32](https://amoy.polygonscan.com/address/0x37604f45111ab488aec38dbb17f90ef1cc90cc32) |
| Polygon POS  |                                                          Coming Soon                                                          |

### Test transactions

The plugin contract is currently deployed on Polygon amoy with some test transactions below:
| Operation | Txn Hash |
| :---: | :---: |
| Create product with plans | [0xadb6e2558cabde7cac6550d8bd26cc726d59c116937234ba45b16154700bd4ee](https://amoy.polygonscan.com/tx/0xadb6e2558cabde7cac6550d8bd26cc726d59c116937234ba45b16154700bd4ee) |
| Create recurring payment | [0x87b5057d4ce7103f528ab21e5ede2931aafabb1b033e104d7e82658af303a303](https://amoy.polygonscan.com/tx/0x87b5057d4ce7103f528ab21e5ede2931aafabb1b033e104d7e82658af303a303) |
| Subscribe | [0x004ea934e59d689187e41bb1852f551a9497699c2e08ca36ddad2e4825e19028](https://amoy.polygonscan.com/tx/0x004ea934e59d689187e41bb1852f551a9497699c2e08ca36ddad2e4825e19028) |
| Unsubscribe | [0xbd118a64895040b80b27b1a348ef99a66f5a9f49332061b70284b75f5c57b836](https://amoy.polygonscan.com/tx/0xbd118a64895040b80b27b1a348ef99a66f5a9f49332061b70284b75f5c57b836) |

### Supported Destination chains

The plugin allows service providers to accept subscription on other chains using the chainlink CCIP bridge. Users can pay for subscription on polygon amoy or polygon POS and the plugin routes the tokens to the supported destination chains as specified by the service provider. Below are the list of supported destination chains for both polygon amoy and polygon POS.

| Source Chain |                 Supported destination chains                 |
| :----------: | :----------------------------------------------------------: |
| Polygon Amoy | `Ethereum Sepolia`, `Avalanche Fuji`, and `Optimism Sepolia` |
| Polygon POS  |                         Coming soon                          |

<!-- 2. **Cross-Chain Bridge Contract**: Leveraging the Chainlink Cross-Chain Interoperability Protocol (CCIP), this contract facilitates secure asset transfers between different blockchain networks. It enables providers to accept subscriptions on multiple chains and also allows users send assets to multiple chains. -->
