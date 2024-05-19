import { time, loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';

describe('Subscription Manager', function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deploySubscriptionManager() {
    const currentChainId = 4;

    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount] = await hre.ethers.getSigners();

    const SubscriptionManager = await hre.ethers.getContractFactory('SubscriptionManagerPlugin');
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

      expect(await subscriptionManager.supportedTokens('0xdAC17F958D2ee523a2206206994597C13D831ec7')).to.equal(true);
    });
  });

  describe('Subscriptions', function () {
    describe('Plans', function () {
      it('Should create a plan', async function () {
        const { subscriptionManager, owner, otherAccount } = await loadFixture(deploySubscriptionManager);

        const price = 1000000;
        const chargeInterval = 24 * 3600 * 30;
        const tokenAddr = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
        const createPlanTxn = subscriptionManager.createSubscriptionPlan(
          price,
          chargeInterval,
          tokenAddr,
          otherAccount.address,
          4
        );
        await expect(createPlanTxn).not.to.be.reverted;

        const plan = await subscriptionManager.subscriptionPlans(0);

        expect(await subscriptionManager.numSubscriptionPlans()).to.equal(1);
        expect(plan.tokenAddress).to.equal('0xdAC17F958D2ee523a2206206994597C13D831ec7');
        expect(plan.price).to.equal(price);
        expect(plan.chargeInterval).to.equal(chargeInterval);
        expect(plan.provider).to.equal(owner.address);
        expect(plan.deleted).to.equal(false);
        expect(plan.receivingAddress).to.equal(otherAccount.address);
        expect(plan.receiveChainId).to.equal(4);
      });

      it('Should change a plan', async function () {
        const { subscriptionManager, owner, otherAccount } = await loadFixture(deploySubscriptionManager);

        const price = 1000000;
        const chargeInterval = 24 * 3600 * 30;
        const tokenAddr = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
        const numSubscriptionPlans = await subscriptionManager.numSubscriptionPlans();
        const createPlanTxn = await subscriptionManager.createSubscriptionPlan(
          price,
          chargeInterval,
          tokenAddr,
          otherAccount.address,
          4
        );

        const editPlanTxn = subscriptionManager.changeSubscriptionPlanInfo(numSubscriptionPlans, owner.address, 3);
        await expect(editPlanTxn).not.to.be.reverted;

        expect(await subscriptionManager.numSubscriptionPlans()).to.equal(numSubscriptionPlans + BigInt(1));

        const plan = await subscriptionManager.subscriptionPlans(0);

        expect(plan.tokenAddress).to.equal('0xdAC17F958D2ee523a2206206994597C13D831ec7');
        expect(plan.price).to.equal(price);
        expect(plan.chargeInterval).to.equal(chargeInterval);
        expect(plan.provider).to.equal(owner.address);
        expect(plan.deleted).to.equal(false);
        expect(plan.receivingAddress).to.equal(owner.address);
        expect(plan.receiveChainId).to.equal(3);
      });
    });

    it('Should try to change a plan and fail', async function () {
      const { subscriptionManager, owner, otherAccount } = await loadFixture(deploySubscriptionManager);

      const price = 1000000;
      const chargeInterval = 24 * 3600 * 30;
      const tokenAddr = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
      const numSubscriptionPlans = await subscriptionManager.numSubscriptionPlans();
      const createPlanTxn = subscriptionManager.changeSubscriptionPlanInfo(
        numSubscriptionPlans + BigInt(1),
        owner.address,
        3
      );
      await expect(createPlanTxn).to.be.revertedWith('Plan does not exist');
    });

    it('Should delete a plan', async function () {
      const { subscriptionManager, owner, otherAccount } = await loadFixture(deploySubscriptionManager);

      const price = 1000000;
      const chargeInterval = 24 * 3600 * 30;
      const tokenAddr = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
      const numSubscriptionPlans = await subscriptionManager.numSubscriptionPlans();
      const createPlanTxn = await subscriptionManager.createSubscriptionPlan(
        price,
        chargeInterval,
        tokenAddr,
        otherAccount.address,
        4
      );

      expect(await subscriptionManager.numSubscriptionPlans()).to.equal(numSubscriptionPlans + BigInt(1));

      const deletePlan = subscriptionManager.deleteSubscription(numSubscriptionPlans);
      await expect(deletePlan).not.to.be.reverted;

      const plan = await subscriptionManager.subscriptionPlans(0);

      expect(plan.tokenAddress).to.equal('0xdAC17F958D2ee523a2206206994597C13D831ec7');
      expect(plan.deleted).to.equal(true);
    });

    it('Should try to delete a plan and fail', async function () {
      const { subscriptionManager, owner, otherAccount } = await loadFixture(deploySubscriptionManager);

      const price = 1000000;
      const chargeInterval = 24 * 3600 * 30;
      const tokenAddr = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
      const numSubscriptionPlans = await subscriptionManager.numSubscriptionPlans();
      const createPlanTxn = subscriptionManager.changeSubscriptionPlanInfo(
        numSubscriptionPlans + BigInt(1),
        owner.address,
        3
      );
      await expect(createPlanTxn).to.be.revertedWith('Plan does not exist');
    });

    it('Should try to change a plan and fail', async function () {
      const { subscriptionManager, owner, otherAccount } = await loadFixture(deploySubscriptionManager);

      const price = 1000000;
      const chargeInterval = 24 * 3600 * 30;
      const tokenAddr = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
      const numSubscriptionPlans = await subscriptionManager.numSubscriptionPlans();
      const createPlanTxn = subscriptionManager.changeSubscriptionPlanInfo(
        numSubscriptionPlans + BigInt(1),
        owner.address,
        3
      );
      await expect(createPlanTxn).to.be.revertedWith('Plan does not exist');
    });

    describe('Events', function () {
      it('Should emit an event on plan created', async function () {
        const { subscriptionManager, owner, otherAccount } = await loadFixture(deploySubscriptionManager);

        // Transactions are sent using the first signer by default
        const price = 1000000;
        const chargeInterval = 24 * 3600 * 30;
        const tokenAddr = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
        const createPlanTxn = await subscriptionManager.createSubscriptionPlan(
          price,
          chargeInterval,
          tokenAddr,
          otherAccount.address,
          4
        );
        await expect(createPlanTxn).not.to.be.reverted;
        const numSubscriptionPlans = await subscriptionManager.numSubscriptionPlans();

        await expect(createPlanTxn)
          .to.emit(subscriptionManager, 'PlanCreated')
          .withArgs(numSubscriptionPlans, price, chargeInterval, tokenAddr, owner.address, otherAccount.address, 4); // We accept any value as `when` arg
      });

      it('Should emit an event on plan changed', async function () {
        const { subscriptionManager, owner, otherAccount } = await loadFixture(deploySubscriptionManager);

        const price = 1000000;
        const chargeInterval = 24 * 3600 * 30;
        const tokenAddr = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
        const numSubscriptionPlans = await subscriptionManager.numSubscriptionPlans();
        const createPlanTxn = await subscriptionManager.createSubscriptionPlan(
          price,
          chargeInterval,
          tokenAddr,
          otherAccount.address,
          4
        );

        const editPlanTxn = subscriptionManager.changeSubscriptionPlanInfo(numSubscriptionPlans, owner.address, 3);
        await expect(editPlanTxn).not.to.be.reverted;

        expect(await subscriptionManager.numSubscriptionPlans()).to.equal(numSubscriptionPlans + BigInt(1));

        const plan = await subscriptionManager.subscriptionPlans(0);

        await expect(editPlanTxn)
          .to.emit(subscriptionManager, 'PlanChanged')
          .withArgs(plan.planId, plan.price, plan.chargeInterval, plan.tokenAddress, plan.provider, owner.address, 3); // We accept any value as `when` arg
      });

      it('Should emit an event on plan deleted', async function () {
        const { subscriptionManager, owner, otherAccount } = await loadFixture(deploySubscriptionManager);

        const price = 1000000;
        const chargeInterval = 24 * 3600 * 30;
        const tokenAddr = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
        const numSubscriptionPlans = await subscriptionManager.numSubscriptionPlans();
        const createPlanTxn = await subscriptionManager.createSubscriptionPlan(
          price,
          chargeInterval,
          tokenAddr,
          otherAccount.address,
          4
        );

        const planId = 0;
        const plan = await subscriptionManager.subscriptionPlans(planId);

        const deletePlanTxn = subscriptionManager.deleteSubscription(planId);
        await expect(deletePlanTxn).not.to.be.reverted;

        await expect(deletePlanTxn).to.emit(subscriptionManager, 'PlanDeleted').withArgs(plan.planId); // We accept any value as `when` arg
      });
    });
  });
});
