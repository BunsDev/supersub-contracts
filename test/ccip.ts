import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'chai';
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');
import hre from 'hardhat';

describe('CCIP Bridge Tests', function () {
  async function setUp() {
    const TestTokenFactory = await hre.ethers.getContractFactory('TestToken');
    const ccipLocalSimulatorFactory = await hre.ethers.getContractFactory('CCIPLocalSimulator');
    const ccipBridgeFactory = await hre.ethers.getContractFactory('SubscriptionTokenBridge');

    const token = await TestTokenFactory.deploy();
    const ccipLocalSimulator = await ccipLocalSimulatorFactory.deploy();
    const ccipConfig = await ccipLocalSimulator.configuration();
    const linkToken = await TestTokenFactory.attach(ccipConfig.linkToken_);
    const tokenBridge = await ccipBridgeFactory.deploy(ccipConfig.sourceRouter_, ccipConfig.linkToken_, []);
    const [, user] = await hre.ethers.getSigners();
    token.transfer(user.address, BigInt(1000) * BigInt(10) ** (await token.decimals()));

    return {
      token,
      tokenBridge,
      ccipLocalSimulator,
      ccipConfig,
      user,
      linkToken,
    };
  }

  describe('Transfer Token Tests', async () => {
    it('Should allow user to transfer tokens to allowed destination chain', async () => {
      const { user, tokenBridge, token, ccipConfig } = await loadFixture(setUp);
      const amount = BigInt(1000) * BigInt(10) ** (await token.decimals());
      await tokenBridge.addDestinationChainSupport(ccipConfig.chainSelector_);
      await token.connect(user).approve(await tokenBridge.getAddress(), amount);
      const txn = await tokenBridge
        .connect(user)
        .transferToken(ccipConfig.chainSelector_, user.address, await token.getAddress(), amount, 0, 0);
      await expect(txn)
        .to.emit(tokenBridge, 'TokenTransferred')
        .withArgs(
          anyValue,
          ccipConfig.chainSelector_,
          user.address,
          await token.getAddress(),
          ccipConfig.linkToken_,
          amount,
          anyValue,
          0,
          0
        );
    });
    it('Should not allow user transfer tokens to not allowed destination chain', async () => {
      const { user, tokenBridge, token, ccipConfig } = await loadFixture(setUp);
      const amount = BigInt(1000) * BigInt(10) ** (await token.decimals());
      await token.connect(user).approve(await tokenBridge.getAddress(), amount);
      await expect(
        tokenBridge
          .connect(user)
          .transferToken(ccipConfig.chainSelector_, user.address, await token.getAddress(), amount, 0, 0)
      ).to.revertedWith('invalid destination chain');
    });
    it('Should not allow user transfer tokens without approval', async () => {
      const { user, tokenBridge, token, ccipConfig } = await loadFixture(setUp);
      const amount = BigInt(1000) * BigInt(10) ** (await token.decimals());
      await tokenBridge.addDestinationChainSupport(ccipConfig.chainSelector_);
      await expect(
        tokenBridge
          .connect(user)
          .transferToken(ccipConfig.chainSelector_, user.address, await token.getAddress(), amount, 0, 0)
      ).to.revertedWith('ERC20: insufficient allowance');
    });
    it('Should allow user transfer tokens with native fee payment', async () => {
      const { user, tokenBridge, token, ccipConfig } = await loadFixture(setUp);
      const amount = BigInt(1000) * BigInt(10) ** (await token.decimals());
      await tokenBridge.addDestinationChainSupport(ccipConfig.chainSelector_);
      await token.connect(user).approve(await tokenBridge.getAddress(), amount);
      await user.sendTransaction({
        to: await tokenBridge.getAddress(),
        value: hre.ethers.parseEther('10'),
      });
      const txn = await tokenBridge
        .connect(user)
        .transferTokenPayNative(ccipConfig.chainSelector_, user.address, await token.getAddress(), amount, 0, 0);
      await expect(txn)
        .to.emit(tokenBridge, 'TokenTransferred')
        .withArgs(
          anyValue,
          ccipConfig.chainSelector_,
          user.address,
          await token.getAddress(),
          '0x0000000000000000000000000000000000000000',
          amount,
          anyValue,
          0,
          0
        );
    });
  });

  describe('Admin Operation Tests', async () => {
    it('Should allow admin withdraw native', async () => {
      const { user, tokenBridge } = await loadFixture(setUp);
      await user.sendTransaction({
        to: await tokenBridge.getAddress(),
        value: hre.ethers.parseEther('10'),
      });
      await tokenBridge.withdrawNative(user.address);
    });
    it('Should allow admin withdraw token', async () => {
      const { user, tokenBridge, token } = await loadFixture(setUp);
      const amount = BigInt(1000) * BigInt(10) ** (await token.decimals());
      await token.transfer(await tokenBridge.getAddress(), amount);
      await tokenBridge.withdrawToken(user.address, await token.getAddress());
    });
    it('Should allow admin add destination chain support', async () => {
      const { tokenBridge } = await loadFixture(setUp);
      expect(await tokenBridge.allowedDestinationChains(890)).to.equal(false);
      await tokenBridge.addDestinationChainSupport(890);
      const chain = await tokenBridge.allowedDestinationChains(890);
      expect(chain).to.equal(true);
    });
    it('Should not allow non-admin withdraw native', async () => {
      const { user, tokenBridge } = await loadFixture(setUp);
      await user.sendTransaction({
        to: await tokenBridge.getAddress(),
        value: hre.ethers.parseEther('10'),
      });
      await expect(tokenBridge.connect(user).withdrawNative(user.address)).to.revertedWith('Only callable by owner');
    });
    it('Should not allow non-admin withdraw token', async () => {
      const { user, tokenBridge, token } = await loadFixture(setUp);
      const amount = BigInt(1000) * BigInt(10) ** (await token.decimals());
      await token.transfer(await tokenBridge.getAddress(), amount);
      await expect(tokenBridge.connect(user).withdrawToken(user.address, await token.getAddress())).to.revertedWith(
        'Only callable by owner'
      );
    });
    it('Should not allow non-admin add destination chain support', async () => {
      const { tokenBridge, user } = await loadFixture(setUp);
      await expect(tokenBridge.connect(user).addDestinationChainSupport(890)).to.revertedWith('Only callable by owner');
    });
  });
});
