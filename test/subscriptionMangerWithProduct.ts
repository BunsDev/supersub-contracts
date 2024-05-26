import { time, loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';
import SubscriptionManager from '../ignition/modules/SubscriptionManager';

describe('Subscription Manager', function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deploySubscriptionManager() {
    const currentChainId = 4;

    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount] = await hre.ethers.getSigners();

    const SubscriptionManager = await hre.ethers.getContractFactory('ProductSubscriptionManagerPlugin');
    const swapRouterAddr = '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD';
    const swapFactoryAddr = '0x4648a43B2C14Da09FdF82B161150d3F634f40491';
    const WETH = '0x5302086A3a25d473aAbBd0356eFf8Dd811a4d89B';
    const subscriptionManager = await SubscriptionManager.deploy(
      ['0xdAC17F958D2ee523a2206206994597C13D831ec7'],
      4,
      swapFactoryAddr,
      swapRouterAddr,
      WETH
    );

    return {
      subscriptionManager,
      currentChainId,
      owner,
      otherAccount,
    };
  }

  describe('Deployment', function () {
    it('Should set the right currentChainId', async function () {
      const { subscriptionManager, currentChainId } = await loadFixture(deploySubscriptionManager);

      expect(await subscriptionManager.currentChainId()).to.equal(currentChainId);
    });

    it('Should support the right token', async function () {
      const { subscriptionManager, currentChainId } = await loadFixture(deploySubscriptionManager);

      expect(await subscriptionManager.supportedBridgingTokens('0xdAC17F958D2ee523a2206206994597C13D831ec7')).to.equal(
        true
      );
    });
  });

  describe('Subscriptions', function () {
    describe('Plans and Products', function () {
      it('Should create a product and plan', async function () {
        const { subscriptionManager, owner, otherAccount } = await loadFixture(deploySubscriptionManager);

        const createProductTxn = await subscriptionManager.createProduct(
          hre.ethers.encodeBytes32String('Spotify'),
          'Enjoy unlimited music',
          'spotify.jpg',
          1,
          []
        );

        await createProductTxn.wait();
        expect(await subscriptionManager.numProducts()).to.equal(1);

        const price = 1000000;
        const chargeInterval = 24 * 3600 * 30;
        const tokenAddr = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
        const createPlanTxn = await subscriptionManager.createSubscriptionPlan(
          0,
          price,
          chargeInterval,
          tokenAddr,
          otherAccount.address,
          4
        );

        await expect(createPlanTxn).not.to.be.reverted;
        await createPlanTxn.wait();
        const product = await subscriptionManager.products(0);
        console.log(product);
        const plan = await subscriptionManager.subscriptionPlans(0);

        expect(await subscriptionManager.numSubscriptionPlans()).to.equal(1);
        expect(plan.tokenAddress).to.equal('0xdAC17F958D2ee523a2206206994597C13D831ec7');
        expect(plan.price).to.equal(price);
        expect(plan.chargeInterval).to.equal(chargeInterval);
        expect(plan.isActive).to.equal(true);
        expect(plan.receivingAddress).to.equal(otherAccount.address);
        expect(plan.destinationChain).to.equal(4);
      });
      it('Should create a product and plan atomically', async function () {
        const { subscriptionManager, owner, otherAccount } = await loadFixture(deploySubscriptionManager);
        const price = 1000000;
        const chargeInterval = 24 * 3600 * 30;
        const tokenAddr = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
        const destinationChain = 4;
        const initPlans = [
          {
            price: price,
            chargeInterval: chargeInterval,
            destinationChain: destinationChain,
            receivingAddress: otherAccount.address,
            tokenAddress: tokenAddr,
          },
          //   {
          //     price: price * 2,
          //     chargeInterval: chargeInterval,
          //     destinationChain: destinationChain,
          //     receivingAddress: otherAccount.address,
          //     tokenAddress: tokenAddr,
          //   },
          //   {
          //     price: price * 3,
          //     chargeInterval: chargeInterval,
          //     destinationChain: destinationChain,
          //     receivingAddress: owner.address,
          //     tokenAddress: tokenAddr,
          //   },
        ];

        const createProductTxn = await subscriptionManager.createProduct(
          hre.ethers.encodeBytes32String('Spotify'),
          'Enjoy unlimited music',
          'spotify.jpg',
          1,
          initPlans
        );

        await createProductTxn.wait();
        expect(await subscriptionManager.numProducts()).to.equal(1);

        await expect(createProductTxn).not.to.be.reverted;
        const product = await subscriptionManager.products(0);
        const plan = await subscriptionManager.subscriptionPlans(0);

        expect(await subscriptionManager.numSubscriptionPlans()).to.equal(initPlans.length);
        expect(plan.tokenAddress).to.equal(tokenAddr);
        expect(plan.price).to.equal(price);
        expect(plan.chargeInterval).to.equal(chargeInterval);
        expect(plan.isActive).to.equal(true);
        expect(plan.receivingAddress).to.equal(otherAccount.address);
        expect(plan.destinationChain).to.equal(destinationChain);
      });

      it('Should change a plan and product', async function () {
        const { subscriptionManager, owner, otherAccount } = await loadFixture(deploySubscriptionManager);

        const price = 1000000;
        const chargeInterval = 24 * 3600 * 30;
        const createProductTxn = await subscriptionManager.createProduct(
          hre.ethers.encodeBytes32String('Spotify'),
          'Enjoy unlimited music',
          'spotify.jpg',
          1,
          []
        );
        const tokenAddr = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
        const numSubscriptionPlans = await subscriptionManager.numSubscriptionPlans();
        const createPlanTxn = await subscriptionManager.createSubscriptionPlan(
          0,
          price,
          chargeInterval,
          tokenAddr,
          owner.address,
          4
        );

        await createPlanTxn.wait();
        const numPlans = await subscriptionManager.numProducts();
        expect(numPlans).to.equal(1);

        await subscriptionManager.updateSubscriptionPlan(0, otherAccount.address, 3, true);

        const editProductTxn = await subscriptionManager.updateProduct(0, otherAccount.address, false);
        await expect(editProductTxn).not.to.be.reverted;
        await editProductTxn.wait();
        const product = await subscriptionManager.products(0);
        expect(product.provider).to.equal(otherAccount.address);

        const plan = await subscriptionManager.subscriptionPlans(0);

        expect(plan.tokenAddress).to.equal('0xdAC17F958D2ee523a2206206994597C13D831ec7');
        expect(plan.price).to.equal(price);
        expect(plan.chargeInterval).to.equal(chargeInterval);
        expect(plan.isActive).to.equal(true);
        expect(plan.receivingAddress).to.equal(otherAccount.address);
        expect(plan.destinationChain).to.equal(3);

        expect(await subscriptionManager.numSubscriptionPlans()).to.equal(numSubscriptionPlans + BigInt(1));
      });
    });

    it('Should try to change a product and fail', async function () {
      const { subscriptionManager, owner, otherAccount } = await loadFixture(deploySubscriptionManager);

      const price = 1000000;
      const chargeInterval = 24 * 3600 * 30;
      const tokenAddr = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
      const numSubscriptionPlans = await subscriptionManager.numSubscriptionPlans();
      const createPlanTxn = subscriptionManager.updateProduct(0, owner.address, true);
      await expect(createPlanTxn).to.be.revertedWith('Product does not exist');
    });

    it('Should try to change a plan and fail', async function () {
      const { subscriptionManager, owner, otherAccount } = await loadFixture(deploySubscriptionManager);

      const price = 1000000;
      const chargeInterval = 24 * 3600 * 30;
      const tokenAddr = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
      const numSubscriptionPlans = await subscriptionManager.numSubscriptionPlans();
      const createPlanTxn = subscriptionManager.updateSubscriptionPlan(0, otherAccount.address, 3, true);

      await expect(createPlanTxn).to.be.revertedWith('Plan does not exist');
    });

    describe('Events', function () {
      it('Should emit an event on plan created', async function () {
        const { subscriptionManager, owner, otherAccount } = await loadFixture(deploySubscriptionManager);

        // Transactions are sent using the first signer by default
        const createProductTxn = await subscriptionManager.createProduct(
          hre.ethers.encodeBytes32String('Spotify'),
          'Enjoy unlimited music',
          'spotify.jpg',
          1,
          []
        );
        const price = 1000000;
        const chargeInterval = 24 * 3600 * 30;
        const tokenAddr = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
        const createPlanTxn = await subscriptionManager.createSubscriptionPlan(
          0,
          price,
          chargeInterval,
          tokenAddr,
          otherAccount.address,
          4
        );
        await expect(createPlanTxn).not.to.be.reverted;
        const numSubscriptionPlans = await subscriptionManager.numSubscriptionPlans();

        console.log(numSubscriptionPlans);

        await expect(createProductTxn)
          .to.emit(subscriptionManager, 'ProductCreated')
          .withArgs(
            0,
            hre.ethers.encodeBytes32String('Spotify'),
            owner.address,
            1,
            'spotify.jpg',
            'Enjoy unlimited music'
          );

        await expect(createPlanTxn)
          .to.emit(subscriptionManager, 'PlanCreated')
          .withArgs(0, 0, price, chargeInterval, tokenAddr, otherAccount.address, 4); // We accept any value as `when` arg
      });

      it('Should emit an event on plan and product changed', async function () {
        const { subscriptionManager, owner, otherAccount } = await loadFixture(deploySubscriptionManager);

        const price = 1000000;
        const chargeInterval = 24 * 3600 * 30;
        const tokenAddr = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
        const product = await subscriptionManager.createProduct(
          hre.ethers.encodeBytes32String('Spotify'),
          'Enjoy unlimited music',
          'spotify.jpg',
          1,
          []
        );
        const numSubscriptionPlans = await subscriptionManager.numSubscriptionPlans();
        const createPlanTxn = await subscriptionManager.createSubscriptionPlan(
          0,
          price,
          chargeInterval,
          tokenAddr,
          owner.address,
          4
        );

        const editPlanTxn = subscriptionManager.updateSubscriptionPlan(0, otherAccount.address, 3, true);
        await expect(editPlanTxn).not.to.be.reverted;

        expect(await subscriptionManager.numSubscriptionPlans()).to.equal(numSubscriptionPlans + BigInt(1));

        await createPlanTxn.wait();
        const editProductTxn = await subscriptionManager.updateProduct(0, otherAccount.address, true);
        await expect(editProductTxn).not.to.be.reverted;

        await expect(editProductTxn)
          .to.emit(subscriptionManager, 'ProductUpdated')
          .withArgs(0, otherAccount.address, true);

        const plan = await subscriptionManager.subscriptionPlans(0);

        await expect(editPlanTxn)
          .to.emit(subscriptionManager, 'PlanUpdated')
          .withArgs(plan.planId, otherAccount.address, 3, true); // We accept any value as `when` arg
      });
    });
  });
});
