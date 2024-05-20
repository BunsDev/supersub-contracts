import { time, loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';
import { IEntryPoint } from '../typechain-types';

// import { PluginManifestStructOutput } from '../typechain-types/contracts/tests/account/interfaces/IPlugin';

describe('Subscription Plugin Tests', function () {
  const chainId = 1;

  // const encodePluginManifest = (manifest: PluginManifestStructOutput) => {
  //   const PluginManifestType = [
  //     'bytes4[]',
  //     'bytes4[]',
  //     'bytes4[]',
  //     'bytes4[]',
  //     'bool',
  //     'bool',
  //     'tuple(address,bool,bytes4[])[]', // ManifestExternalCallPermission
  //     'tuple(bytes4,tuple(uint8,uint8,uint256))[]', // ManifestAssociatedFunction
  //     'tuple(bytes4,tuple(uint8,uint8,uint256))[]', // ManifestAssociatedFunction
  //     'tuple(bytes4,tuple(uint8,uint8,uint256))[]', // ManifestAssociatedFunction
  //     'tuple(bytes4,tuple(uint8,uint8,uint256))[]', // ManifestAssociatedFunction
  //     'tuple(bytes4,tuple(uint8,uint8,uint256),tuple(uint8,uint8,uint256))[]', // ManifestExecutionHook
  //   ];
  //   const values = [
  //     manifest.interfaceIds,
  //     manifest.dependencyInterfaceIds,
  //     manifest.executionFunctions,
  //     manifest.permittedExecutionSelectors,
  //     manifest.permitAnyExternalAddress,
  //     manifest.canSpendNativeToken,
  //     manifest.permittedExternalCalls.map((call) => [call.externalAddress, call.permitAnySelector, call.selectors]),
  //     manifest.userOpValidationFunctions.map((func) => [
  //       func.executionSelector,
  //       [
  //         func.associatedFunction.functionType,
  //         func.associatedFunction.functionId,
  //         func.associatedFunction.dependencyIndex,
  //       ],
  //     ]),
  //     manifest.runtimeValidationFunctions.map((func) => [
  //       func.executionSelector,
  //       [
  //         func.associatedFunction.functionType,
  //         func.associatedFunction.functionId,
  //         func.associatedFunction.dependencyIndex,
  //       ],
  //     ]),
  //     manifest.preUserOpValidationHooks.map((hook) => [
  //       hook.executionSelector,
  //       [
  //         hook.associatedFunction.functionType,
  //         hook.associatedFunction.functionId,
  //         hook.associatedFunction.dependencyIndex,
  //       ],
  //     ]),
  //     manifest.preRuntimeValidationHooks.map((hook) => [
  //       hook.executionSelector,
  //       [
  //         hook.associatedFunction.functionType,
  //         hook.associatedFunction.functionId,
  //         hook.associatedFunction.dependencyIndex,
  //       ],
  //     ]),
  //     manifest.executionHooks.map((hook) => [
  //       hook.executionSelector,
  //       [hook.preExecHook.functionType, hook.preExecHook.functionId, hook.preExecHook.dependencyIndex],
  //       [hook.postExecHook.functionType, hook.postExecHook.functionId, hook.postExecHook.dependencyIndex],
  //     ]),
  //   ];
  //   const abiCoder = hre.ethers.AbiCoder.defaultAbiCoder();
  //   const encodeData = abiCoder.encode(PluginManifestType, values);
  //   return encodeData;
  // };

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

    const entrypoint = (await EntryPointFactory.deploy()) as unknown as IEntryPoint;
    const token = await TestTokenFactory.deploy();
    const subscriptionPlugin = await SubscriptionPluginFactory.deploy(chainId, [await token.getAddress()]);
    const singleOwnerPlugin = await SingleOwnerPluginFactory.deploy();
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
    };
  }

  describe('Deployment Test', function () {
    it('Should set correct chain ID and supported tokens', async () => {
      const { subscriptionPlugin, token } = await loadFixture(setUp);
      expect(await subscriptionPlugin.currentChainId()).to.equal(chainId);
      expect(await subscriptionPlugin.supportedTokens(await token.getAddress())).to.equal(true);
    });
  });

  describe('Product/Plan Creation & Update', async () => {
    it('EOA can create Product', async () => {
      const [_, signer, reciepient] = await hre.ethers.getSigners();
      const { subscriptionPlugin, token } = await loadFixture(setUp);

      const productName = hre.ethers.encodeBytes32String('Test Product');
      const tokenAddress = await token.getAddress();

      const txn = await subscriptionPlugin
        .connect(signer)
        .createProduct(productName, tokenAddress, reciepient.address, chainId);
      const currentNonce = await subscriptionPlugin.productNonces(signer.address);

      const product = await subscriptionPlugin.providerProducts(signer.address, hre.ethers.toBeHex(0, 32));
      expect(currentNonce).to.equal(1);
      expect(product.name).to.equal(productName);
      expect(product.provider).to.equal(signer.address);
      expect(product.chargeToken).to.equal(tokenAddress);
      expect(product.receivingAddress).to.equal(reciepient.address);
      expect(product.destinationChain).to.equal(chainId);
      expect(product.planNonce).to.equal(0);
      expect(product.isActive).to.equal(true);
      await expect(txn)
        .to.emit(subscriptionPlugin, 'ProductCreated')
        .withArgs(product.productId, signer.address, productName, tokenAddress, chainId, true);
    });
    it('EOA can create plan', async () => {
      const [_, signer] = await hre.ethers.getSigners();
      const { subscriptionPlugin, token } = await loadFixture(setUp);

      // Create Product
      await subscriptionPlugin
        .connect(signer)
        .createProduct(
          hre.ethers.encodeBytes32String('Test Product'),
          await token.getAddress(),
          signer.address,
          chainId
        );

      const chargeInterval = 3600;
      const price = BigInt(100) * BigInt(10) ** (await token.decimals());
      const txn = await subscriptionPlugin.connect(signer).createPlan(hre.ethers.toBeHex(0, 32), chargeInterval, price);

      const product = await subscriptionPlugin.providerProducts(signer.address, hre.ethers.toBeHex(0, 32));
      const plan = await subscriptionPlugin.providerPlans(signer.address, hre.ethers.toBeHex(0, 32));
      expect(plan.productId).to.equal(product.productId);
      expect(plan.provider).to.equal(product.provider);
      expect(plan.chargeInterval).to.equal(chargeInterval);
      expect(plan.price).to.equal(price);
      expect(plan.isActive).to.equal(true);
      expect(product.planNonce).to.equal(1);
      await expect(txn)
        .to.emit(subscriptionPlugin, 'PlanCreated')
        .withArgs(product.productId, hre.ethers.toBeHex(0, 32), price, chargeInterval, true);
    });
    it('EOA can update Product & Plan', async () => {
      const [_, signer] = await hre.ethers.getSigners();
      const { subscriptionPlugin, token } = await loadFixture(setUp);

      // Create Product & Plan
      await subscriptionPlugin
        .connect(signer)
        .createProduct(
          hre.ethers.encodeBytes32String('Test Product'),
          await token.getAddress(),
          signer.address,
          chainId
        );
      const chargeInterval = 3600;
      const price = BigInt(100) * BigInt(10) ** (await token.decimals());
      await subscriptionPlugin.connect(signer).createPlan(hre.ethers.toBeHex(0, 32), chargeInterval, price);

      // Update Product
      const txn1 = await subscriptionPlugin
        .connect(signer)
        .updateProduct(
          hre.ethers.toBeHex(0, 32),
          await token.getAddress(),
          '0xdAC17F958D2ee523a2206206994597C13D831ec7',
          3,
          true
        );
      const product = await subscriptionPlugin.providerProducts(signer.address, hre.ethers.toBeHex(0, 32));
      expect(product.chargeToken).to.equal(await token.getAddress());
      expect(product.receivingAddress).to.equal('0xdAC17F958D2ee523a2206206994597C13D831ec7');
      expect(product.destinationChain).to.equal(3);
      expect(product.isActive).to.equal(true);
      await expect(txn1)
        .to.emit(subscriptionPlugin, 'ProductUpdated')
        .withArgs(product.productId, '0xdAC17F958D2ee523a2206206994597C13D831ec7', await token.getAddress(), 3, true);

      // Update Plan
      const newPrice = BigInt(50) * BigInt(10) ** (await token.decimals());
      const txn2 = await subscriptionPlugin.connect(signer).updatePlan(hre.ethers.toBeHex(0, 32), newPrice, 500, true);
      const plan = await subscriptionPlugin.providerPlans(signer.address, hre.ethers.toBeHex(0, 32));
      expect(plan.chargeInterval).to.equal(500);
      expect(plan.price).to.equal(newPrice);
      expect(plan.isActive).to.equal(true);
      await expect(txn2).to.emit(subscriptionPlugin, 'PlanUpdated').withArgs(plan.planId, newPrice, 500, true);
    });
    it('MSCA can create & Update product', async () => {
      const { mscaAccount, mscaOwner, subscriptionPlugin, entrypoint, token, beneficiary } = await loadFixture(setUp);
      const funcSig = 'createProduct(bytes32,address,address,uint8)';
      const types = ['bytes32', 'address', 'address', 'uint8'];
      const productName = hre.ethers.encodeBytes32String('Test Product');
      const tokenAddr = await token.getAddress();
      const recvAddr = mscaOwner.address;
      const destChain = chainId;
      const values = [productName, tokenAddr, recvAddr, destChain];
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
      const expectedProductId = hre.ethers.toBeHex(0, 32);
      const expectedProvider = await mscaAccount.getAddress();
      const product = await subscriptionPlugin.providerProducts(await mscaAccount.getAddress(), expectedProductId);
      const expectedCurrentNonce = await subscriptionPlugin.productNonces(await mscaAccount.getAddress());
      expect(expectedCurrentNonce).to.equal(1);
      expect(product.name).to.equal(productName);
      expect(product.provider).to.equal(expectedProvider);
      expect(product.chargeToken).to.equal(tokenAddr);
      expect(product.receivingAddress).to.equal(recvAddr);
      expect(product.destinationChain).to.equal(chainId);
      expect(product.planNonce).to.equal(0);
      expect(product.isActive).to.equal(true);
      await expect(txn)
        .to.emit(subscriptionPlugin, 'ProductCreated')
        .withArgs(expectedProductId, expectedProvider, productName, tokenAddr, chainId, true);

      // Update Product
      const updateProductUserOp = {
        sender: await mscaAccount.getAddress(),
        nonce: 1,
        initCode: '0x',
        callData: getCallData(
          'updateProduct(bytes32,address,address,uint8,bool)',
          ['bytes32', 'address', 'address', 'uint8', 'bool'],
          [expectedProductId, await token.getAddress(), beneficiary.address, 10, false]
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
      const updatedProduct = await subscriptionPlugin.providerProducts(expectedProvider, expectedProductId);
      expect(updatedProduct.chargeToken).to.equal(await token.getAddress());
      expect(updatedProduct.receivingAddress).to.equal(beneficiary.address);
      expect(updatedProduct.destinationChain).to.equal(10);
      expect(updatedProduct.isActive).to.equal(false);
      await expect(updateTxn)
        .to.emit(subscriptionPlugin, 'ProductUpdated')
        .withArgs(product.productId, beneficiary.address, await token.getAddress(), 10, false);
    });
    it('MSCA can create & Update plan', async () => {
      const { mscaAccount, mscaOwner, subscriptionPlugin, entrypoint, token, beneficiary } = await loadFixture(setUp);

      // Create Product
      const createProductUserOp = {
        sender: await mscaAccount.getAddress(),
        nonce: 0,
        initCode: '0x',
        callData: getCallData(
          'createProduct(bytes32,address,address,uint8)',
          ['bytes32', 'address', 'address', 'uint8'],
          [hre.ethers.encodeBytes32String('Test Product'), await token.getAddress(), mscaOwner.address, chainId]
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
      const chargeInterval = 3600;
      const price = BigInt(100) * BigInt(10) ** (await token.decimals());
      const createPlanUserOp = {
        sender: await mscaAccount.getAddress(),
        nonce: 1,
        initCode: '0x',
        callData: getCallData(
          'createPlan(bytes32,uint32,uint256)',
          ['bytes32', 'uint32', 'uint256'],
          [hre.ethers.toBeHex(0, 32), chargeInterval, price]
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
      const expectedPlanId = hre.ethers.toBeHex(0, 32);
      const expectedProductId = hre.ethers.toBeHex(0, 32);
      const expectedProvider = await mscaAccount.getAddress();
      const product = await subscriptionPlugin.providerProducts(expectedProvider, expectedProductId);
      const plan = await subscriptionPlugin.providerPlans(expectedProvider, expectedPlanId);
      expect(plan.productId).to.equal(product.productId);
      expect(plan.provider).to.equal(expectedProvider);
      expect(plan.chargeInterval).to.equal(chargeInterval);
      expect(plan.price).to.equal(price);
      expect(plan.isActive).to.equal(true);
      expect(product.planNonce).to.equal(1);
      await expect(txn)
        .to.emit(subscriptionPlugin, 'PlanCreated')
        .withArgs(product.productId, expectedPlanId, price, chargeInterval, true);

      // Update Plan
      const newPrice = BigInt(500) * BigInt(10) ** (await token.decimals());
      const newInterval = 600;
      const updatePlanUserOp = {
        sender: await mscaAccount.getAddress(),
        nonce: 2,
        initCode: '0x',
        callData: getCallData(
          'updatePlan(bytes32,uint256,uint32,bool)',
          ['bytes32', 'uint256', 'uint32', 'bool'],
          [expectedPlanId, newPrice, newInterval, false]
        ),
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
      const updatedPlan = await subscriptionPlugin.providerPlans(expectedProvider, expectedPlanId);
      expect(updatedPlan.price).to.equal(newPrice);
      expect(updatedPlan.chargeInterval).to.equal(newInterval);
      expect(updatedPlan.isActive).to.equal(false);
      await expect(updateTxn)
        .to.emit(subscriptionPlugin, 'PlanUpdated')
        .withArgs(plan.planId, newPrice, newInterval, false);
    });
  });

  describe('User Subscription', async () => {
    it('User can subscribe, unsubscribe, and change subscription plan', async () => {
      const { mscaAccount, mscaOwner, subscriptionPlugin, entrypoint, token, beneficiary } = await loadFixture(setUp);

      // Transfer tokens to the msca account
      const amount = BigInt(1000) * BigInt(10) ** (await token.decimals());
      await token.transfer(await mscaAccount.getAddress(), amount);

      // Create Product
      const createProductUserOp = {
        sender: await mscaAccount.getAddress(),
        nonce: 0,
        initCode: '0x',
        callData: getCallData(
          'createProduct(bytes32,address,address,uint8)',
          ['bytes32', 'address', 'address', 'uint8'],
          [hre.ethers.encodeBytes32String('Test Product'), await token.getAddress(), mscaOwner.address, chainId]
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
      const chargeInterval = 3600;
      const price = BigInt(100) * BigInt(10) ** (await token.decimals());
      const createPlanUserOp = {
        sender: await mscaAccount.getAddress(),
        nonce: 1,
        initCode: '0x',
        callData: getCallData(
          'createPlan(bytes32,uint32,uint256)',
          ['bytes32', 'uint32', 'uint256'],
          [hre.ethers.toBeHex(0, 32), chargeInterval, price]
        ),
        callGasLimit: 700000,
        verificationGasLimit: 1000000,
        preVerificationGas: 0,
        maxFeePerGas: 2,
        maxPriorityFeePerGas: 1,
        paymasterAndData: '0x',
        signature: '0x',
      };
      const createPlanUserOpHash = await entrypoint.connect(mscaOwner).getUserOpHash(createPlanUserOp);
      const createPlanSig = await mscaOwner.signMessage(hre.ethers.getBytes(createPlanUserOpHash));
      createPlanUserOp.signature = createPlanSig;
      await entrypoint.handleOps([createPlanUserOp], beneficiary.address);

      // Subscribe to plan
      const subscribeUserOp = {
        sender: await mscaAccount.getAddress(),
        nonce: 2,
        initCode: '0x',
        callData: getCallData(
          'subscribe(bytes32,bytes32,address)',
          ['bytes32', 'bytes32', 'address'],
          [hre.ethers.toBeHex(0, 32), hre.ethers.toBeHex(0, 32), await mscaAccount.getAddress()]
        ),
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
      const expectedSubId = hre.ethers.toBeHex(0, 32);
      const expectedSubscriber = await mscaAccount.getAddress();
      const userSub = await subscriptionPlugin.userSubscriptions(expectedSubscriber, expectedSubId);
      const subscriptionNonce = await subscriptionPlugin.subscriptionNonces(expectedSubscriber);
      const reciepientBalance = await token.balanceOf(mscaOwner.address);
      const afterSubscriptionTokenBal = await token.balanceOf(await mscaAccount.getAddress());
      expect(userSub.product).to.equal(hre.ethers.toBeHex(0, 32));
      expect(userSub.provider).to.equal(await mscaAccount.getAddress());
      expect(userSub.plan).to.equal(hre.ethers.toBeHex(0, 32));
      expect(userSub.lastChargeDate).to.greaterThan(0);
      expect(userSub.isActive).to.equal(true);
      expect(subscriptionNonce).to.equal(1);
      // Verify Charge on first subscription
      expect(reciepientBalance).to.equal(price);
      expect(beforeSubscriptionTokenBal - price).to.equal(afterSubscriptionTokenBal);
      await expect(subscribeTxn)
        .to.emit(subscriptionPlugin, 'Subscribed')
        .withArgs(
          expectedSubscriber,
          await mscaAccount.getAddress(),
          hre.ethers.toBeHex(0, 32),
          hre.ethers.toBeHex(0, 32),
          expectedSubId
        );

      // Todo: Because I wan go Sleep
      // 1. Test unsubscribe
      // 2. Test change subscription plan
    });
    it('Charge Tests', async () => {
      // 1. Charge at the appropriate time
      // 2. Cannot charge before time elapse
      // 3. Test change plan charge
    });
  });
});
