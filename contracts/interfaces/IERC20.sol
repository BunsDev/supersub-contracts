// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

interface IERC20 {
    function transfer(address recipient, uint amount) external returns (bool);
    function totalSupply() external view returns (uint256);
}