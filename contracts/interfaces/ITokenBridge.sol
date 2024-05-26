// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

interface ITokenBridge {
    function transferTokenPayNative(
        uint64 _chainSelector,
        address _receiver,
        address _token,
        uint256 _amount,
        uint256 _subId,
        uint256 _planId
    ) external;
    function transferToken(
        uint64 _chainSelector,
        address _receiver,
        address _token,
        uint256 _amount,
        uint256 _subId,
        uint256 _planId
    ) external;
}
