// This work is marked with CC0 1.0 Universal.
//
// SPDX-License-Identifier: CC0-1.0
//
// To view a copy of this license, visit http://creativecommons.org/publicdomain/zero/1.0

pragma solidity ^0.8.20;

struct Call {
    // The target address for the account to call.
    address target;
    // The value to send with the call.
    uint256 value;
    // The calldata for the call.
    bytes data;
}

interface IStandardExecutor {
    /// @notice Standard execute method.
    /// @dev If the target is a plugin, the call SHOULD revert.
    /// @param target The target address for account to call.
    /// @param value The value to send with the call.
    /// @param data The calldata for the call.
    /// @return The return data from the call.
    function execute(address target, uint256 value, bytes calldata data) external payable returns (bytes memory);

    /// @notice Standard executeBatch method.
    /// @dev If the target is a plugin, the call SHOULD revert. If any of the calls revert, the entire batch MUST
    /// revert.
    /// @param calls The array of calls.
    /// @return An array containing the return data from the calls.
    function executeBatch(Call[] calldata calls) external payable returns (bytes[] memory);
}

/// @title Plugin Executor Interface
interface IPluginExecutor {
    /// @notice Execute a call from a plugin through the account.
    /// @dev Permissions must be granted to the calling plugin for the call to go through.
    /// @param data The calldata to send to the account.
    /// @return The return data from the call.
    function executeFromPlugin(bytes calldata data) external payable returns (bytes memory);

    /// @notice Execute a call from a plugin to a non-plugin address.
    /// @dev If the target is a plugin, the call SHOULD revert. Permissions must be granted to the calling plugin
    /// for the call to go through.
    /// @param target The address to be called.
    /// @param value The value to send with the call.
    /// @param data The calldata to send to the target.
    /// @return The return data from the call.
    function executeFromPluginExternal(
        address target,
        uint256 value,
        bytes calldata data
    ) external payable returns (bytes memory);
}
