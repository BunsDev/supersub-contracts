// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { IRouterClient } from "@chainlink/contracts-ccip/src/v0.8/ccip/interfaces/IRouterClient.sol";
import { OwnerIsCreator } from "@chainlink/contracts-ccip/src/v0.8/shared/access/OwnerIsCreator.sol";
import { Client } from "@chainlink/contracts-ccip/src/v0.8/ccip/libraries/Client.sol";
import { IERC20 } from "@chainlink/contracts-ccip/src/v0.8/vendor/openzeppelin-solidity/v4.8.3/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@chainlink/contracts-ccip/src/v0.8/vendor/openzeppelin-solidity/v4.8.3/contracts/token/ERC20/utils/SafeERC20.sol";

contract SubscriptionTokenBridge is OwnerIsCreator {
    using SafeERC20 for IERC20;

    event TokenTransferred(
        bytes32 indexed messageId,
        uint64 indexed destinationChainSelector,
        address receipient,
        address token,
        address feeToken,
        uint256 amount,
        uint256 fees,
        uint256 subscriptionId,
        uint256 planId
    );

    mapping(uint64 => bool) public allowedDestinationChains;
    IRouterClient private router;
    IERC20 private linkToken;

    constructor(address _router, address _link, uint64[] memory _supportedDestinationChains) {
        router = IRouterClient(_router);
        linkToken = IERC20(_link);
        for (uint i = 0; i < _supportedDestinationChains.length; i++) {
            allowedDestinationChains[_supportedDestinationChains[i]] = true;
        }
    }

    modifier isAllowedDestinationChain(uint64 _selector) {
        require(allowedDestinationChains[_selector], "invalid destination chain");
        _;
    }

    modifier isValidReceiver(address _receiver) {
        require(_receiver != address(0), "invalid token receiver");
        _;
    }

    function _buildCCIPMessage(
        address _receiver,
        address _token,
        uint256 _amount,
        address _feeToken
    ) private pure returns (Client.EVM2AnyMessage memory) {
        Client.EVMTokenAmount[] memory tokenAmounts = new Client.EVMTokenAmount[](1);
        tokenAmounts[0] = Client.EVMTokenAmount({ token: _token, amount: _amount });
        return
            Client.EVM2AnyMessage({
                receiver: abi.encode(_receiver),
                data: "",
                tokenAmounts: tokenAmounts,
                extraArgs: Client._argsToBytes(Client.EVMExtraArgsV1({ gasLimit: 0 })),
                feeToken: _feeToken
            });
    }

    function transferTokenPayNative(
        uint64 _chainSelector,
        address _receiver,
        address _token,
        uint256 _amount,
        uint256 _subId,
        uint256 _planId
    ) public {
        // Build CCIP message
        Client.EVM2AnyMessage memory evm2AnyMessage = _buildCCIPMessage(
            _receiver,
            _token,
            _amount,
            address(0) // fee token is native here
        );
        // Get the fee required to send the message
        uint256 fees = router.getFee(_chainSelector, evm2AnyMessage);
        require(address(this).balance > fees, "not enough native balance for fees");
        // Caller should give the CCIP prior approval to spend tokens on its behalf
        IERC20(_token).transferFrom(msg.sender, address(this), _amount);
        // Approve the router to spend contract tokens
        IERC20(_token).approve(address(router), _amount);
        bytes32 messageId = router.ccipSend{ value: fees }(_chainSelector, evm2AnyMessage);

        emit TokenTransferred(messageId, _chainSelector, _receiver, _token, address(0), _amount, fees, _subId, _planId);
    }

    function transferToken(
        uint64 _chainSelector,
        address _receiver,
        address _token,
        uint256 _amount,
        uint256 _subId,
        uint256 _planId
    ) public isAllowedDestinationChain(_chainSelector) {
        // Build CCIP message
        Client.EVM2AnyMessage memory evm2AnyMessage = _buildCCIPMessage(
            _receiver,
            _token,
            _amount,
            address(linkToken) // Pays fees in link token
        );

        // Get the fee required to send the message
        uint256 fees = router.getFee(_chainSelector, evm2AnyMessage);
        if (fees > linkToken.balanceOf(address(this))) {
            // Attempt to pay fees in native token if link balance is insufficient
            return transferTokenPayNative(_chainSelector, _receiver, _token, _amount, _subId, _planId);
        }
        linkToken.approve(address(router), fees);
        // Caller should give the CCIP prior approval to spend tokens on its behalf
        IERC20(_token).transferFrom(msg.sender, address(this), _amount);
        // Approve ccip router to spend tokens from ccip contract
        IERC20(_token).approve(address(router), _amount);
        bytes32 messageId = router.ccipSend(_chainSelector, evm2AnyMessage);
        emit TokenTransferred(
            messageId,
            _chainSelector,
            _receiver,
            _token,
            address(linkToken),
            _amount,
            fees,
            _subId,
            _planId
        );
    }

    receive() external payable {}

    function withdrawNative(address _beneficiary) public onlyOwner {
        uint256 amount = address(this).balance;
        require(amount != 0, "insufficient balance to withdraw");
        (bool sent, ) = _beneficiary.call{ value: amount }("");
        require(sent, "failed to withdraw");
    }

    function withdrawToken(address _beneficiary, address _token) public onlyOwner {
        uint256 amount = IERC20(_token).balanceOf(address(this));
        require(amount != 0, "insufficient balance to withdraw");
        IERC20(_token).safeTransfer(_beneficiary, amount);
    }

    function addDestinationChainSupport(uint64 _chainSelector) public onlyOwner {
        allowedDestinationChains[_chainSelector] = true;
    }
}
