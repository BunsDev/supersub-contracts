import { time, loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'chai';
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');
import hre from 'hardhat';
import { IEntryPoint } from '../typechain-types';

describe('Subscription Plugin Tests', function () {
  const chainId = 1;

  const getCallData = (funcSig: string, types: string[], values: any[]) => {
    const abiCoder = hre.ethers.AbiCoder.defaultAbiCoder();
    const encodeCall = abiCoder.encode(types, values);
    const funcSelector = hre.ethers.id(funcSig).slice(0, 10);
    return funcSelector + encodeCall.slice(2);
  };

  async function setUp() {
    const EntryPointFactory = await hre.ethers.getContractFactory('EntryPoint');
    const TestTokenFactory = await hre.ethers.getContractFactory('TestToken');
    const SubscriptionPluginFactory = await hre.ethers.getContractFactory('SubscriptionPlugin');
    const SingleOwnerPluginFactory = await hre.ethers.getContractFactory('SingleOwnerPlugin');
    const UpgradeableModularAccountFactory = await hre.ethers.getContractFactory('UpgradeableModularAccount');
    const ccipLocalSimulatorFactory = await hre.ethers.getContractFactory('CCIPLocalSimulator');
    const ccipBridgeFactory = await hre.ethers.getContractFactory('SubscriptionTokenBridge');
    const bnmFactory = await hre.ethers.getContractFactory('BurnMintERC677Helper');

    const entrypoint = (await EntryPointFactory.deploy()) as unknown as IEntryPoint;
    const token = await TestTokenFactory.deploy();
    const singleOwnerPlugin = await SingleOwnerPluginFactory.deploy();
    const ccipLocalSimulator = await ccipLocalSimulatorFactory.deploy();
    const ccipConfig = await ccipLocalSimulator.configuration();
    const ccipBnM = bnmFactory.attach(ccipConfig.ccipBnM_);
    const tokenBridge = await ccipBridgeFactory.deploy(ccipConfig.sourceRouter_, ccipConfig.linkToken_, []);
    const subscriptionPlugin = await SubscriptionPluginFactory.deploy(chainId, await tokenBridge.getAddress());
    const [beneficiary, mscaOwner] = await hre.ethers.getSigners();
    const mscaAccount = await UpgradeableModularAccountFactory.deploy(await entrypoint.getAddress());
    const pluginAddr = await singleOwnerPlugin.getAddress();
    const packedVal = await mscaAccount.pack(pluginAddr, 1);
    await mscaAccount
      .connect(mscaOwner)
      .initialize(
        [pluginAddr],
        [await singleOwnerPlugin.getManifestHash()],
        [hre.ethers.AbiCoder.defaultAbiCoder().encode(['address'], [mscaOwner.address])]
      );
    await mscaAccount
      .connect(mscaOwner)
      .installPlugin(await subscriptionPlugin.getAddress(), await subscriptionPlugin.getManifestHash(), '0x', [
        packedVal,
        packedVal,
      ]);
    await beneficiary.sendTransaction({
      to: await mscaAccount.getAddress(),
      value: hre.ethers.parseEther('100'),
    });

    return {
      entrypoint,
      token,
      subscriptionPlugin,
      singleOwnerPlugin,
      beneficiary,
      mscaOwner,
      mscaAccount,
      tokenBridge,
      ccipLocalSimulator,
      ccipConfig,
      ccipBnM,
    };
  }

  describe('Deployment Test', function () {
    it('Should set correct chain ID and token bridge', async () => {
      const { subscriptionPlugin, tokenBridge } = await loadFixture(setUp);
      expect(await subscriptionPlugin.currentChainId()).to.equal(chainId);
      expect(await subscriptionPlugin.tokenBridge()).to.equal(await tokenBridge.getAddress());
    });
  });

  describe('Product/Plan Creation & Update', async () => {
    it('EOA can create Product', async () => {
      const [_, signer, reciepient] = await hre.ethers.getSigners();
      const { subscriptionPlugin, token } = await loadFixture(setUp);

      const productName = hre.ethers.encodeBytes32String('Test Product');
      const tokenAddress = await token.getAddress();
      const beforeCreateProductNonce = await await subscriptionPlugin.productNonce();
      const txn = await subscriptionPlugin
        .connect(signer)
        .createProduct(
          productName,
          'Test Product',
          'https://product.img',
          1,
          tokenAddress,
          reciepient.address,
          chainId
        );
      const afterCreateProductNonce = await subscriptionPlugin.productNonce();

      const product = await subscriptionPlugin.products(beforeCreateProductNonce);
      expect(afterCreateProductNonce).to.equal(beforeCreateProductNonce + BigInt(1));
      expect(product.productType).to.equal(1);
      expect(product.provider).to.equal(signer.address);
      expect(product.chargeToken).to.equal(tokenAddress);
      expect(product.receivingAddress).to.equal(reciepient.address);
      expect(product.destinationChain).to.equal(chainId);
      expect(product.productId).to.equal(beforeCreateProductNonce);
      expect(product.isActive).to.equal(true);
      await expect(txn)
        .to.emit(subscriptionPlugin, 'ProductCreated')
        .withArgs(
          product.productId,
          signer.address,
          productName,
          'Test Product',
          'https://product.img',
          1,
          tokenAddress,
          reciepient.address,
          chainId,
          true
        );
    });
    it('EOA can create plan', async () => {
      const [_, signer] = await hre.ethers.getSigners();
      const { subscriptionPlugin, token } = await loadFixture(setUp);

      // Create Product
      await subscriptionPlugin
        .connect(signer)
        .createProduct(
          hre.ethers.encodeBytes32String('Test Product'),
          'Test product',
          'http://product.img',
          1,
          await token.getAddress(),
          signer.address,
          chainId
        );

      const chargeInterval = 86400;
      const price = BigInt(100) * BigInt(10) ** (await token.decimals());
      const beforeCreatePlanNonce = await subscriptionPlugin.planNonce();
      const txn = await subscriptionPlugin.connect(signer).createPlan(1, chargeInterval, price);
      const afterCreatePlanNonce = await subscriptionPlugin.planNonce();

      const product = await subscriptionPlugin.products(1);
      const plan = await subscriptionPlugin.plans(beforeCreatePlanNonce);
      expect(plan.productId).to.equal(product.productId);
      expect(plan.provider).to.equal(product.provider);
      expect(plan.chargeInterval).to.equal(chargeInterval);
      expect(plan.price).to.equal(price);
      expect(plan.isActive).to.equal(true);
      expect(afterCreatePlanNonce).to.equal(beforeCreatePlanNonce + BigInt(1));
      expect(plan.planId).to.equal(beforeCreatePlanNonce);
      await expect(txn)
        .to.emit(subscriptionPlugin, 'PlanCreated')
        .withArgs(product.productId, beforeCreatePlanNonce, price, chargeInterval, true);
    });
    it('EOA can update Product & Plan', async () => {
      const [admin, signer] = await hre.ethers.getSigners();
      const { subscriptionPlugin, token } = await loadFixture(setUp);

      // Create Product & Plan
      await subscriptionPlugin
        .connect(signer)
        .createProduct(
          hre.ethers.encodeBytes32String('Test Product'),
          'Test product',
          'http://product.img',
          1,
          await token.getAddress(),
          signer.address,
          chainId
        );
      const chargeInterval = 86400;
      const price = BigInt(100) * BigInt(10) ** (await token.decimals());
      await subscriptionPlugin.connect(signer).createPlan(1, chargeInterval, price);

      // Update Product
      // Add new chain to list of supported destination chains
      await subscriptionPlugin.connect(admin).addChainSelector(3, 456778);
      const txn1 = await subscriptionPlugin
        .connect(signer)
        .updateProduct(1, '0xdAC17F958D2ee523a2206206994597C13D831ec7', 3, true);
      const product = await subscriptionPlugin.products(1);
      expect(product.receivingAddress).to.equal('0xdAC17F958D2ee523a2206206994597C13D831ec7');
      expect(product.destinationChain).to.equal(3);
      expect(product.isActive).to.equal(true);
      await expect(txn1)
        .to.emit(subscriptionPlugin, 'ProductUpdated')
        .withArgs(product.productId, '0xdAC17F958D2ee523a2206206994597C13D831ec7', 3, true);

      // Update Plan
      //const newPrice = BigInt(50) * BigInt(10) ** (await token.decimals());
      const txn2 = await subscriptionPlugin.connect(signer).updatePlan(1, false);
      const plan = await subscriptionPlugin.plans(1);
      // expect(plan.chargeInterval).to.equal(500);
      // expect(plan.price).to.equal(newPrice);
      expect(plan.isActive).to.equal(false);
      await expect(txn2).to.emit(subscriptionPlugin, 'PlanUpdated').withArgs(plan.planId, false);
    });
    it('MSCA can create & Update product', async () => {
      const { mscaAccount, mscaOwner, subscriptionPlugin, entrypoint, token, beneficiary } = await loadFixture(setUp);
      const funcSig = 'createProduct(bytes32,string,string,uint8,address,address,uint256)';
      const types = ['bytes32', 'string', 'string', 'uint8', 'address', 'address', 'uint256'];
      const productName = hre.ethers.encodeBytes32String('Test Product');
      const productDesc = 'Test product';
      const logoUrl = 'http://product.img';
      const tokenAddr = await token.getAddress();
      const recvAddr = mscaOwner.address;
      const destChain = chainId;
      const values = [productName, productDesc, logoUrl, 1, tokenAddr, recvAddr, destChain];
      const callData = getCallData(funcSig, types, values);

      const userOp = {
        sender: await mscaAccount.getAddress(),
        nonce: 0,
        initCode: '0x',
        callData: callData,
        callGasLimit: 700000,
        verificationGasLimit: 1000000,
        preVerificationGas: 0,
        maxFeePerGas: 2,
        maxPriorityFeePerGas: 1,
        paymasterAndData: '0x',
        signature: '0x',
      };
      const userOpHash = await entrypoint.connect(mscaOwner).getUserOpHash(userOp);
      const sig = await mscaOwner.signMessage(hre.ethers.getBytes(userOpHash));
      userOp.signature = sig;
      const txn = await entrypoint.handleOps([userOp], beneficiary.address);

      // Verify Post Creation Variables
      const expectedProductId = 1;
      const expectedProvider = await mscaAccount.getAddress();
      const product = await subscriptionPlugin.products(expectedProductId);
      const expectedCurrentNonce = 2;
      expect(expectedCurrentNonce).to.equal(await subscriptionPlugin.productNonce());
      expect(product.productType).to.equal(1);
      expect(product.provider).to.equal(expectedProvider);
      expect(product.chargeToken).to.equal(tokenAddr);
      expect(product.receivingAddress).to.equal(recvAddr);
      expect(product.destinationChain).to.equal(chainId);
      expect(product.productId).to.equal(expectedProductId);
      expect(product.isActive).to.equal(true);
      await expect(txn)
        .to.emit(subscriptionPlugin, 'ProductCreated')
        .withArgs(
          expectedProductId,
          expectedProvider,
          productName,
          productDesc,
          logoUrl,
          1,
          tokenAddr,
          recvAddr,
          chainId,
          true
        );

      // Update Product
      // Allow new chain id selector
      const [admin] = await hre.ethers.getSigners();
      await subscriptionPlugin.connect(admin).addChainSelector(10, 456778);
      const updateProductUserOp = {
        sender: await mscaAccount.getAddress(),
        nonce: 1,
        initCode: '0x',
        callData: getCallData(
          'updateProduct(uint256,address,uint256,bool)',
          ['uint256', 'address', 'uint256', 'bool'],
          [expectedProductId, beneficiary.address, 10, false]
        ),
        callGasLimit: 700000,
        verificationGasLimit: 1000000,
        preVerificationGas: 0,
        maxFeePerGas: 2,
        maxPriorityFeePerGas: 1,
        paymasterAndData: '0x',
        signature: '0x',
      };
      const updateProductUserOpHash = await entrypoint.connect(mscaOwner).getUserOpHash(updateProductUserOp);
      const updateProductSig = await mscaOwner.signMessage(hre.ethers.getBytes(updateProductUserOpHash));
      updateProductUserOp.signature = updateProductSig;
      const updateTxn = await entrypoint.handleOps([updateProductUserOp], beneficiary.address);
      const updatedProduct = await subscriptionPlugin.products(expectedProductId);
      expect(updatedProduct.chargeToken).to.equal(await token.getAddress());
      expect(updatedProduct.receivingAddress).to.equal(beneficiary.address);
      expect(updatedProduct.destinationChain).to.equal(10);
      expect(updatedProduct.isActive).to.equal(false);
      await expect(updateTxn)
        .to.emit(subscriptionPlugin, 'ProductUpdated')
        .withArgs(product.productId, beneficiary.address, 10, false);
    });
    it('MSCA can create & Update plan', async () => {
      const { mscaAccount, mscaOwner, subscriptionPlugin, entrypoint, token, beneficiary } = await loadFixture(setUp);

      // Create Product
      const createProductUserOp = {
        sender: await mscaAccount.getAddress(),
        nonce: 0,
        initCode: '0x',
        callData: getCallData(
          'createProduct(bytes32,string,string,uint8,address,address,uint256)',
          ['bytes32', 'string', 'string', 'uint8', 'address', 'address', 'uint256'],
          [
            hre.ethers.encodeBytes32String('Test Product'),
            'test product',
            'http://product.img',
            1,
            await token.getAddress(),
            mscaOwner.address,
            chainId,
          ]
        ),
        callGasLimit: 700000,
        verificationGasLimit: 1000000,
        preVerificationGas: 0,
        maxFeePerGas: 2,
        maxPriorityFeePerGas: 1,
        paymasterAndData: '0x',
        signature: '0x',
      };
      const createProductUserOpHash = await entrypoint.connect(mscaOwner).getUserOpHash(createProductUserOp);
      const createProductSig = await mscaOwner.signMessage(hre.ethers.getBytes(createProductUserOpHash));
      createProductUserOp.signature = createProductSig;
      await entrypoint.handleOps([createProductUserOp], beneficiary.address);

      // Create Plan
      const chargeInterval = 86400;
      const price = BigInt(100) * BigInt(10) ** (await token.decimals());
      const createPlanUserOp = {
        sender: await mscaAccount.getAddress(),
        nonce: 1,
        initCode: '0x',
        callData: getCallData(
          'createPlan(uint256,uint32,uint256)',
          ['uint256', 'uint32', 'uint256'],
          [1, chargeInterval, price]
        ),
        callGasLimit: 700000,
        verificationGasLimit: 1000000,
        preVerificationGas: 0,
        maxFeePerGas: 2,
        maxPriorityFeePerGas: 1,
        paymasterAndData: '0x',
        signature: '0x',
      };
      const userOpHash = await entrypoint.connect(mscaOwner).getUserOpHash(createPlanUserOp);
      const sig = await mscaOwner.signMessage(hre.ethers.getBytes(userOpHash));
      createPlanUserOp.signature = sig;
      const txn = await entrypoint.handleOps([createPlanUserOp], beneficiary.address);

      // Checks
      const expectedPlanId = 1;
      const expectedProductId = 1;
      const expectedProvider = await mscaAccount.getAddress();
      const product = await subscriptionPlugin.products(expectedProductId);
      const plan = await subscriptionPlugin.plans(expectedPlanId);
      expect(plan.productId).to.equal(product.productId);
      expect(plan.provider).to.equal(expectedProvider);
      expect(plan.chargeInterval).to.equal(chargeInterval);
      expect(plan.price).to.equal(price);
      expect(plan.isActive).to.equal(true);
      expect(await subscriptionPlugin.planNonce()).to.equal(2);
      await expect(txn)
        .to.emit(subscriptionPlugin, 'PlanCreated')
        .withArgs(product.productId, expectedPlanId, price, chargeInterval, true);

      // Update Plan
      const updatePlanUserOp = {
        sender: await mscaAccount.getAddress(),
        nonce: 2,
        initCode: '0x',
        callData: getCallData('updatePlan(uint256,bool)', ['uint256', 'bool'], [expectedPlanId, false]),
        callGasLimit: 700000,
        verificationGasLimit: 1000000,
        preVerificationGas: 0,
        maxFeePerGas: 2,
        maxPriorityFeePerGas: 1,
        paymasterAndData: '0x',
        signature: '0x',
      };
      const updatePlanUserOpHash = await entrypoint.connect(mscaOwner).getUserOpHash(updatePlanUserOp);
      const updatePlanSig = await mscaOwner.signMessage(hre.ethers.getBytes(updatePlanUserOpHash));
      updatePlanUserOp.signature = updatePlanSig;
      const updateTxn = await entrypoint.handleOps([updatePlanUserOp], beneficiary.address);
      const updatedPlan = await subscriptionPlugin.plans(expectedPlanId);
      expect(updatedPlan.isActive).to.equal(false);
      await expect(updateTxn).to.emit(subscriptionPlugin, 'PlanUpdated').withArgs(plan.planId, false);
    });
    it('Create Product With Plan Tests', async () => {
      const { subscriptionPlugin, token, beneficiary } = await loadFixture(setUp);
      const [provider] = await hre.ethers.getSigners();
      const productName = hre.ethers.encodeBytes32String('Test product with plan');
      const description = 'basic description here';
      const logo = 'http://p.img';
      const planNonce = await subscriptionPlugin.planNonce();
      const plans = [
        {
          price: BigInt(100) * BigInt(10) ** (await token.decimals()),
          chargeInterval: 86400,
          id: planNonce,
        },
        {
          price: BigInt(200) * BigInt(10) ** (await token.decimals()),
          chargeInterval: 90800,
          id: planNonce + BigInt(1),
        },
      ];
      const expectedProductId = await subscriptionPlugin.productNonce();
      const expectedPlanNonce = (await subscriptionPlugin.planNonce()) + BigInt(plans.length);
      const expectedProductNonce = expectedProductId + BigInt(1);
      const txn = await subscriptionPlugin.createProductWithPlans(
        productName,
        description,
        logo,
        1,
        await token.getAddress(),
        beneficiary.address,
        chainId,
        plans
      );
      const product = await subscriptionPlugin.products(expectedProductId);
      expect(await subscriptionPlugin.productNonce()).to.equal(expectedProductNonce);
      expect(await subscriptionPlugin.planNonce()).to.equal(expectedPlanNonce);
      expect(product.productId).to.equal(expectedProductId);
      expect(product.productType).to.equal(1);
      expect(product.provider).to.equal(provider.address);
      expect(product.chargeToken).to.equal(await token.getAddress());
      expect(product.receivingAddress).to.equal(beneficiary.address);
      expect(product.destinationChain).to.equal(chainId);
      expect(product.isActive).to.equal(true);
      await expect(txn)
        .to.emit(subscriptionPlugin, 'ProductCreated')
        .withArgs(
          product.productId,
          beneficiary.address,
          productName,
          description,
          logo,
          1,
          await token.getAddress(),
          beneficiary.address,
          chainId,
          true
        );
      for (const initPlan of plans) {
        const plan = await subscriptionPlugin.plans(initPlan.id);
        expect(plan.productId).to.equal(product.productId);
        expect(plan.provider).to.equal(product.provider);
        expect(plan.chargeInterval).to.equal(initPlan.chargeInterval);
        expect(plan.price).to.equal(initPlan.price);
        expect(plan.isActive).to.equal(true);
        expect(plan.planId).to.equal(initPlan.id);
        await expect(txn)
          .to.emit(subscriptionPlugin, 'PlanCreated')
          .withArgs(product.productId, initPlan.id, initPlan.price, initPlan.chargeInterval, true);
      }
    });
    it('Create Reccurring subscription test', async () => {
      const { subscriptionPlugin, token, beneficiary } = await loadFixture(setUp);
      const [provider] = await hre.ethers.getSigners();
      const productName = hre.ethers.encodeBytes32String('recurring subsciption');
      const description = 'basic description here';
      const logo = 'http://p.img';
      const chargeInterval = 86400;
      const price = BigInt(200) * BigInt(10) ** (await token.decimals());
      const expectedProductId = await subscriptionPlugin.productNonce();
      const expectedPlanId = await subscriptionPlugin.planNonce();
      const expectedPlanNonce = expectedPlanId + BigInt(1);
      const expectedProductNonce = expectedProductId + BigInt(1);
      const txn = await subscriptionPlugin.createRecurringSubscription(
        productName,
        description,
        logo,
        await token.getAddress(),
        beneficiary.address,
        chainId,
        chargeInterval,
        price
      );
      const product = await subscriptionPlugin.products(expectedProductId);
      expect(await subscriptionPlugin.productNonce()).to.equal(expectedProductNonce);
      expect(await subscriptionPlugin.planNonce()).to.equal(expectedPlanNonce);
      expect(product.productId).to.equal(expectedProductId);
      expect(product.productType).to.equal(0);
      expect(product.provider).to.equal(provider.address);
      expect(product.chargeToken).to.equal(await token.getAddress());
      expect(product.receivingAddress).to.equal(beneficiary.address);
      expect(product.destinationChain).to.equal(chainId);
      expect(product.isActive).to.equal(true);
      await expect(txn)
        .to.emit(subscriptionPlugin, 'ProductCreated')
        .withArgs(
          product.productId,
          beneficiary.address,
          productName,
          description,
          logo,
          0,
          await token.getAddress(),
          beneficiary.address,
          chainId,
          true
        );
      const plan = await subscriptionPlugin.plans(expectedPlanId);
      expect(plan.productId).to.equal(product.productId);
      expect(plan.provider).to.equal(product.provider);
      expect(plan.chargeInterval).to.equal(chargeInterval);
      expect(plan.price).to.equal(price);
      expect(plan.isActive).to.equal(true);
      expect(plan.planId).to.equal(expectedPlanId);
      await expect(txn)
        .to.emit(subscriptionPlugin, 'PlanCreated')
        .withArgs(product.productId, expectedPlanId, price, chargeInterval, true);
    });
  });

  describe('User Subscription', async () => {
    it('User can subscribe, unsubscribe, and change subscription plan', async () => {
      const { mscaAccount, mscaOwner, subscriptionPlugin, entrypoint, token, beneficiary } = await loadFixture(setUp);

      // Transfer tokens to the msca account
      const amount = BigInt(1000) * BigInt(10) ** (await token.decimals());
      await token.transfer(await mscaAccount.getAddress(), amount);

      // ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
      // ┃    Create Product & Plan  ┃
      // ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
      const chargeInterval = 86400;
      const price = BigInt(100) * BigInt(10) ** (await token.decimals());
      await subscriptionPlugin
        .connect(mscaOwner)
        .createProduct(
          hre.ethers.encodeBytes32String('Test product'),
          'Test product description',
          'http://product.img',
          1,
          await token.getAddress(),
          mscaOwner.address,
          chainId
        );
      await subscriptionPlugin.connect(mscaOwner).createPlan(1, chargeInterval, price);

      // ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
      // ┃    Subscribe to plan      ┃
      // ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
      const subscribeUserOp = {
        sender: await mscaAccount.getAddress(),
        nonce: 0,
        initCode: '0x',
        callData: getCallData('subscribe(uint256,uint256)', ['uint256', 'uint256'], [1, 0]),
        callGasLimit: 7000000,
        verificationGasLimit: 1000000,
        preVerificationGas: 0,
        maxFeePerGas: 2,
        maxPriorityFeePerGas: 1,
        paymasterAndData: '0x',
        signature: '0x',
      };
      const subscribeUserOpHash = await entrypoint.getUserOpHash(subscribeUserOp);
      const subscribeSig = await mscaOwner.signMessage(hre.ethers.getBytes(subscribeUserOpHash));
      subscribeUserOp.signature = subscribeSig;
      const beforeSubscriptionTokenBal = await token.balanceOf(await mscaAccount.getAddress());
      const subscribeTxn = await entrypoint.handleOps([subscribeUserOp], beneficiary.address);
      const expectedSubId = 0;
      const expectedSubscriber = await mscaAccount.getAddress();
      const userSub = await subscriptionPlugin.userSubscriptions(expectedSubscriber, expectedSubId);
      const subscriptionNonce = await subscriptionPlugin.subscriptionNonces(expectedSubscriber);
      const reciepientBalance = await token.balanceOf(mscaOwner.address);
      const afterSubscriptionTokenBal = await token.balanceOf(await mscaAccount.getAddress());
      expect(userSub.product).to.equal(1);
      expect(userSub.subscriptionId).to.equal(0);
      expect(userSub.endTime).to.equal(0);
      expect(userSub.provider).to.equal(mscaOwner.address);
      expect(userSub.plan).to.equal(1);
      expect(userSub.lastChargeDate).to.greaterThan(0);
      expect(userSub.isActive).to.equal(true);
      expect(subscriptionNonce).to.equal(1);
      expect(await subscriptionPlugin.subscribedToProduct(await mscaAccount.getAddress(), userSub.product)).to.equal(
        true
      );
      // Verify Charge on first subscription
      expect(reciepientBalance).to.equal(price);
      expect(beforeSubscriptionTokenBal - price).to.equal(afterSubscriptionTokenBal);
      await expect(subscribeTxn)
        .to.emit(subscriptionPlugin, 'Subscribed')
        .withArgs(expectedSubscriber, mscaOwner.address, 1, 1, expectedSubId, 0);
      await expect(subscribeTxn)
        .to.emit(subscriptionPlugin, 'SubscriptionCharged')
        .withArgs(await mscaAccount.getAddress(), mscaOwner.address, 0, 1, 1, price, userSub.lastChargeDate);

      // ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
      // ┃   Unsubscribe from plan   ┃
      // ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
      const unSubscribeUserOp = {
        sender: await mscaAccount.getAddress(),
        nonce: 1,
        initCode: '0x',
        callData: getCallData('unSubscribe(uint256)', ['uint256'], [0]),
        callGasLimit: 7000000,
        verificationGasLimit: 1000000,
        preVerificationGas: 0,
        maxFeePerGas: 2,
        maxPriorityFeePerGas: 1,
        paymasterAndData: '0x',
        signature: '0x',
      };
      const unSubscribeUserOpHash = await entrypoint.getUserOpHash(unSubscribeUserOp);
      const unSubscribeSig = await mscaOwner.signMessage(hre.ethers.getBytes(unSubscribeUserOpHash));
      unSubscribeUserOp.signature = unSubscribeSig;
      const unSubscribeTxn = await entrypoint.handleOps([unSubscribeUserOp], beneficiary.address);
      const sub = await subscriptionPlugin.userSubscriptions(expectedSubscriber, expectedSubId);
      expect(sub.isActive).to.equal(false);
      await expect(unSubscribeTxn)
        .to.emit(subscriptionPlugin, 'UnSubscribed')
        .withArgs(expectedSubscriber, expectedSubId);

      // ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
      // ┃   Change Plan             ┃
      // ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
      // create new plan
      // await subscriptionPlugin
      //   .connect(mscaOwner)
      //   .createPlan(1, 300, BigInt(50) * BigInt(10) ** (await token.decimals()));
      // change user sub
      // const changeSubUserOp = {
      //   sender: await mscaAccount.getAddress(),
      //   nonce: 2,
      //   initCode: '0x',
      //   callData: getCallData(
      //     'changeSubscriptionPlan(uint256,uint256,uint256)',
      //     ['uint256', 'uint256', 'uint256'],
      //     [1, 2, 0]
      //   ),
      //   callGasLimit: 7000000,
      //   verificationGasLimit: 1000000,
      //   preVerificationGas: 0,
      //   maxFeePerGas: 2,
      //   maxPriorityFeePerGas: 1,
      //   paymasterAndData: '0x',
      //   signature: '0x',
      // };
      // const changeSubUserOpHash = await entrypoint.getUserOpHash(changeSubUserOp);
      // const changeSubSig = await mscaOwner.signMessage(hre.ethers.getBytes(changeSubUserOpHash));
      // changeSubUserOp.signature = changeSubSig;
      // const changeSubTxn = await entrypoint.handleOps([changeSubUserOp], beneficiary.address);
      // const changedSub = await subscriptionPlugin.userSubscriptions(expectedSubscriber, 0);
      // expect(changedSub.isActive).to.equal(true);
      // expect(changedSub.plan).to.equal(2);
      // await expect(changeSubTxn)
      //   .to.emit(subscriptionPlugin, 'SubscriptionPlanChanged')
      //   .withArgs(expectedSubscriber, 0, 2);
    });
    it('Charge Failure Tests', async () => {
      const { mscaAccount, mscaOwner, subscriptionPlugin, entrypoint, token, beneficiary } = await loadFixture(setUp);

      // Transfer tokens to the msca account
      const amount = BigInt(1000) * BigInt(10) ** (await token.decimals());
      await token.transfer(await mscaAccount.getAddress(), amount);

      // ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
      // ┃    Create Product & Plan  ┃
      // ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
      const [_, signer] = await hre.ethers.getSigners();
      await subscriptionPlugin
        .connect(signer)
        .createProduct(
          hre.ethers.encodeBytes32String('Test Product'),
          'Test product',
          'http://product.img',
          1,
          await token.getAddress(),
          signer.address,
          chainId
        );
      await subscriptionPlugin
        .connect(signer)
        .createProduct(
          hre.ethers.encodeBytes32String('Test Product2'),
          'Test product 2',
          'http://product.img',
          1,
          await token.getAddress(),
          signer.address,
          chainId
        ); // Product 2
      const price = BigInt(100) * BigInt(10) ** (await token.decimals());
      await subscriptionPlugin.connect(signer).createPlan(1, 86400, price);
      await subscriptionPlugin.connect(signer).createPlan(1, 100000 * 2, price);

      // ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
      // ┃    Subscribe to plan      ┃
      // ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
      const subscribeUserOp = {
        sender: await mscaAccount.getAddress(),
        nonce: 0,
        initCode: '0x',
        callData: getCallData('subscribe(uint256,uint256)', ['uint256', 'uint256'], [1, 0]),
        callGasLimit: 7000000,
        verificationGasLimit: 1000000,
        preVerificationGas: 0,
        maxFeePerGas: 2,
        maxPriorityFeePerGas: 1,
        paymasterAndData: '0x',
        signature: '0x',
      };
      const subscribeUserOpHash = await entrypoint.getUserOpHash(subscribeUserOp);
      const subscribeSig = await mscaOwner.signMessage(hre.ethers.getBytes(subscribeUserOpHash));
      subscribeUserOp.signature = subscribeSig;
      await entrypoint.handleOps([subscribeUserOp], beneficiary.address);

      // ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
      // ┃    Charge Test [Failure]  ┃
      // ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
      await expect(subscriptionPlugin.charge(await mscaAccount.getAddress(), 0)).to.revertedWith(
        'time Interval not met'
      );
      // await time.increase(3600 * 2);
      // Todo: Test product and plan not active
      // await expect(
      //   subscriptionPlugin.charge(
      //     hre.ethers.toBeHex(1, 32),
      //     signer.address,
      //     hre.ethers.toBeHex(0, 32),
      //     await mscaAccount.getAddress(),
      //     hre.ethers.toBeHex(0, 32)
      //   )
      // ).to.revertedWith('Incorrect plan id');
      // await expect(
      //   subscriptionPlugin.charge(
      //     hre.ethers.toBeHex(0, 32),
      //     signer.address,
      //     hre.ethers.toBeHex(1, 32),
      //     await mscaAccount.getAddress(),
      //     hre.ethers.toBeHex(0, 32)
      //   )
      // ).to.revertedWith('Plan does not belong to specified product');
      // Unsubscribe from plan
      const unSubscribeUserOp = {
        sender: await mscaAccount.getAddress(),
        nonce: 1,
        initCode: '0x',
        callData: getCallData('unSubscribe(uint256)', ['uint256'], [0]),
        callGasLimit: 7000000,
        verificationGasLimit: 1000000,
        preVerificationGas: 0,
        maxFeePerGas: 2,
        maxPriorityFeePerGas: 1,
        paymasterAndData: '0x',
        signature: '0x',
      };
      const unSubscribeUserOpHash = await entrypoint.getUserOpHash(unSubscribeUserOp);
      const unSubscribeSig = await mscaOwner.signMessage(hre.ethers.getBytes(unSubscribeUserOpHash));
      unSubscribeUserOp.signature = unSubscribeSig;
      await entrypoint.handleOps([unSubscribeUserOp], beneficiary.address);
      await expect(subscriptionPlugin.charge(await mscaAccount.getAddress(), 0)).to.revertedWith(
        'Subscription not active'
      );
    });
    it('Charge Success Test', async () => {
      const { mscaAccount, mscaOwner, subscriptionPlugin, entrypoint, token, beneficiary } = await loadFixture(setUp);

      // Transfer tokens to the msca account
      const amount = BigInt(1000) * BigInt(10) ** (await token.decimals());
      await token.transfer(await mscaAccount.getAddress(), amount);

      // ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
      // ┃    Create Product & Plan  ┃
      // ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
      const [_, signer] = await hre.ethers.getSigners();
      await subscriptionPlugin
        .connect(signer)
        .createProduct(
          hre.ethers.encodeBytes32String('Test Product'),
          'Test product',
          'http://product.img',
          1,
          await token.getAddress(),
          signer.address,
          chainId
        );
      const price = BigInt(100) * BigInt(10) ** (await token.decimals());
      const price2 = BigInt(200) * BigInt(10) ** (await token.decimals());
      await subscriptionPlugin.connect(signer).createPlan(1, 86400, price); // First Plan
      await subscriptionPlugin.connect(signer).createPlan(1, 100000 * 2, price2); // Second Plan

      // ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
      // ┃    Subscribe to plan      ┃
      // ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
      const subscribeUserOp = {
        sender: await mscaAccount.getAddress(),
        nonce: 0,
        initCode: '0x',
        callData: getCallData('subscribe(uint256,uint256)', ['uint256', 'uint256'], [1, 0]),
        callGasLimit: 7000000,
        verificationGasLimit: 1000000,
        preVerificationGas: 0,
        maxFeePerGas: 2,
        maxPriorityFeePerGas: 1,
        paymasterAndData: '0x',
        signature: '0x',
      };
      const subscribeUserOpHash = await entrypoint.getUserOpHash(subscribeUserOp);
      const subscribeSig = await mscaOwner.signMessage(hre.ethers.getBytes(subscribeUserOpHash));
      subscribeUserOp.signature = subscribeSig;
      await entrypoint.handleOps([subscribeUserOp], beneficiary.address);

      // ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
      // ┃    Charge Test [Success]  ┃
      // ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
      const beforeChargeUserSub = await subscriptionPlugin.userSubscriptions(
        await mscaAccount.getAddress(),
        hre.ethers.toBeHex(0, 32)
      );
      await time.increase(86400);
      const chargeTxn = await subscriptionPlugin.charge(await mscaAccount.getAddress(), 0);
      const afterChargeUserSub = await subscriptionPlugin.userSubscriptions(
        await mscaAccount.getAddress(),
        hre.ethers.toBeHex(0, 32)
      );
      expect(afterChargeUserSub.lastChargeDate).to.greaterThanOrEqual(
        beforeChargeUserSub.lastChargeDate + BigInt(3600)
      );
      await expect(chargeTxn)
        .to.emit(subscriptionPlugin, 'SubscriptionCharged')
        .withArgs(await mscaAccount.getAddress(), signer.address, 0, 1, 1, price, afterChargeUserSub.lastChargeDate);
      // Change plan and test charge
      // const changeSubUserOp = {
      //   sender: await mscaAccount.getAddress(),
      //   nonce: 1,
      //   initCode: '0x',
      //   callData: getCallData(
      //     'changeSubscriptionPlan(uint256,uint256,uint256)',
      //     ['uint256', 'uint256', 'uint256'],
      //     [1, 2, 0]
      //   ),
      //   callGasLimit: 7000000,
      //   verificationGasLimit: 1000000,
      //   preVerificationGas: 0,
      //   maxFeePerGas: 2,
      //   maxPriorityFeePerGas: 1,
      //   paymasterAndData: '0x',
      //   signature: '0x',
      // };
      // const changeSubUserOpHash = await entrypoint.getUserOpHash(changeSubUserOp);
      // const changeSubSig = await mscaOwner.signMessage(hre.ethers.getBytes(changeSubUserOpHash));
      // changeSubUserOp.signature = changeSubSig;
      // await entrypoint.handleOps([changeSubUserOp], beneficiary.address);
      // await time.increase(3600 * 2);
      // const chargeTxn2 = await subscriptionPlugin.charge(await mscaAccount.getAddress(), 0);
      // const userSub2 = await subscriptionPlugin.userSubscriptions(await mscaAccount.getAddress(), 0);
      // await expect(chargeTxn2)
      //   .to.emit(subscriptionPlugin, 'SubscriptionCharged')
      //   .withArgs(await mscaAccount.getAddress(), signer.address, 0, 2, 1, price2, userSub2.lastChargeDate);
    });
    it('CCIP charge test', async () => {
      const {
        mscaAccount,
        mscaOwner,
        subscriptionPlugin,
        entrypoint,
        token,
        beneficiary,
        ccipConfig,
        ccipLocalSimulator,
        tokenBridge,
        ccipBnM,
      } = await loadFixture(setUp);

      // Transfer tokens to the msca account and add token to ccip supported tokens
      const amount = BigInt(1000) * BigInt(10) ** (await token.decimals());
      await token.transfer(await mscaAccount.getAddress(), amount);
      await ccipLocalSimulator.supportNewToken(await token.getAddress());

      // ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
      // ┃    Create Product & Plan  ┃
      // ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
      // Add a destination chain ID of 10 to supported chains
      const [admin, signer] = await hre.ethers.getSigners();
      await subscriptionPlugin.connect(admin).addChainSelector(10, ccipConfig.chainSelector_);
      await tokenBridge.connect(admin).addDestinationChainSupport(ccipConfig.chainSelector_);
      await subscriptionPlugin.connect(admin).setTokenBridge(await tokenBridge.getAddress());
      await subscriptionPlugin
        .connect(signer)
        .createProduct(
          hre.ethers.encodeBytes32String('Test Product'),
          'Test product',
          'http://product.img',
          1,
          await token.getAddress(),
          signer.address,
          10
        );
      const price = BigInt(100) * BigInt(10) ** (await token.decimals());
      await subscriptionPlugin.connect(signer).createPlan(1, 86400, price);

      // ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
      // ┃    Subscription Test      ┃
      // ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
      const subscribeUserOp = {
        sender: await mscaAccount.getAddress(),
        nonce: 0,
        initCode: '0x',
        callData: getCallData('subscribe(uint256,uint256)', ['uint256', 'uint256'], [1, 0]),
        callGasLimit: 7000000,
        verificationGasLimit: 1000000,
        preVerificationGas: 0,
        maxFeePerGas: 2,
        maxPriorityFeePerGas: 1,
        paymasterAndData: '0x',
        signature: '0x',
      };
      const subscribeUserOpHash = await entrypoint.getUserOpHash(subscribeUserOp);
      const subscribeSig = await mscaOwner.signMessage(hre.ethers.getBytes(subscribeUserOpHash));
      subscribeUserOp.signature = subscribeSig;
      const txn = await entrypoint.handleOps([subscribeUserOp], beneficiary.address);
      await expect(txn)
        .to.emit(subscriptionPlugin, 'Subscribed')
        .withArgs(await mscaAccount.getAddress(), signer.address, 1, 1, 0, 0);
      await expect(txn)
        .to.emit(tokenBridge, 'TokenTransferred')
        .withArgs(
          anyValue,
          ccipConfig.chainSelector_,
          signer.address,
          await token.getAddress(),
          ccipConfig.linkToken_,
          price,
          anyValue,
          0,
          1
        );

      // ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
      // ┃    Charge Test            ┃
      // ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
      await time.increase(86400);
      const chargeTxn = await subscriptionPlugin.charge(await mscaAccount.getAddress(), 0);
      await expect(chargeTxn)
        .to.emit(tokenBridge, 'TokenTransferred')
        .withArgs(
          anyValue,
          ccipConfig.chainSelector_,
          signer.address,
          await token.getAddress(),
          ccipConfig.linkToken_,
          price,
          anyValue,
          0,
          1
        );
    });
  });
});
