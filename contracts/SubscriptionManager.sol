// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import { IERC20 } from "./interfaces/IERC20.sol";
import { BasePlugin } from "./libraries/BasePlugin.sol";
import { IPluginExecutor } from "./interfaces/IPluginExecutor.sol";

import { ManifestFunction, ManifestAssociatedFunctionType, ManifestAssociatedFunction, PluginManifest, PluginMetadata, IPlugin } from "./interfaces/IPlugin.sol";

/// @title Counter Plugin
/// @author Your name
/// @notice This plugin lets increment a count!
contract SubscriptionManagerPlugin is BasePlugin {
    // metadata used by the pluginMetadata() method down below
    string public constant NAME = "Subscription Plugin";
    string public constant VERSION = "1.0.0";
    string public constant AUTHOR = "PY devs";

    // this is a constant used in the manifest, to reference our only dependency: the single owner plugin
    // since it is the first, and only, plugin the index 0 will reference the single owner plugin
    // we can use this to tell the modular account that we should use the single owner plugin to validate our user op
    // in other words, we'll say "make sure the person calling increment is an owner of the account using our single plugin"
    uint256 internal constant _MANIFEST_DEPENDENCY_INDEX_OWNER_USER_OP_VALIDATION = 0;

    /*
     * Note to Developer:
     * If you're using storage during validation, you need to use "associated storage".
     * ERC 7562 defines the associated storage rules for ERC 4337 accounts.
     * See: https://eips.ethereum.org/EIPS/eip-7562#validation-rules
     *
     * Plugins need to follow this definition for bundlers to accept user ops targeting their validation functions.
     * In this case, "count" is only used in an execution function, but nonetheless, it's worth noting
     * that a mapping from the account address is considered associated storage.
     */
    uint256 public numSubscriptionPlans;
    uint8 public currentChainId;
    address public owner;
    struct SubscriptionPlan {
        uint256 planId;
        uint256 price;
        uint256 chargeInterval;
        address tokenAddress;
        address provider;
        address receivingAddress;
        uint8 receiveChainId;
        bool deleted;
    }

    struct UserSubscription {
        uint256 lastChargeDate;
        uint256 startTime;
        uint256 endTime;
        bool isActive;
    }

    mapping(uint256 => SubscriptionPlan) public subscriptionPlans;
    mapping(address => bool) public supportedTokens;
    mapping(address => mapping(uint256 => UserSubscription)) public subscriptionStatuses;

    event PlanCreated(
        uint256 planId,
        uint256 price,
        uint256 chargeInterval,
        address tokenAddress,
        address provider,
        address receivingAddress,
        uint8 receiveChainId
    );
    event PlanChanged(
        uint256 planId,
        uint256 price,
        uint256 chargeInterval,
        address tokenAddress,
        address provider,
        address receivingAddress,
        uint8 receiveChainId
    );
    event PlanDeleted(uint256 planId);
    event PlanSubscribed(uint256 planId, address indexed subscriber);
    event PlanUnsubscribed(uint256 planId, address indexed subscriber);
    event SubscriptionCharged(uint256 planId, address indexed subscriber);

    constructor(address[] memory _supportedTokens, uint8 chainId) {
        currentChainId = chainId;
        owner = msg.sender;
        for (uint i = 0; i < _supportedTokens.length; i++) {
            supportedTokens[_supportedTokens[i]] = true;
        }
    }

    modifier planExists(uint256 planId) {
        require(planId < numSubscriptionPlans, "Plan does not exist");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    modifier planNotDeleted(uint256 planId) {
        SubscriptionPlan memory plan = subscriptionPlans[planId];
        require(!plan.deleted, "subscriptin plan deleted");
        _;
    }

    modifier isPlanProvider(uint256 planId, address caller) {
        subscriptionPlans[planId].provider == caller;
        _;
    }

    // ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
    // ┃    Execution functions    ┃
    // ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

    // this is the one thing we are attempting to do with our plugin!
    // we define increment to modify our associated storage, count
    // then in the manifest we define it as an execution function,
    // and we specify the validation function for the user op targeting this function

    function addSupportedToken(address tokenAddr) public onlyOwner {
        supportedTokens[tokenAddr] = true;
    }

    function createSubscriptionPlan(
        uint256 price,
        uint256 chargeInterval,
        address tokenAddress,
        address receivingAddress,
        uint8 receiveChainId
    ) public {
        require(supportedTokens[tokenAddress], "token specified is not supported");
        SubscriptionPlan memory plan = SubscriptionPlan({
            planId: numSubscriptionPlans,
            price: price,
            chargeInterval: chargeInterval,
            tokenAddress: tokenAddress,
            provider: msg.sender,
            receivingAddress: receivingAddress,
            deleted: false,
            receiveChainId: receiveChainId
        });
        subscriptionPlans[numSubscriptionPlans] = plan;
        numSubscriptionPlans++;
        emit PlanCreated(
            numSubscriptionPlans,
            price,
            chargeInterval,
            tokenAddress,
            msg.sender,
            receivingAddress,
            receiveChainId
        );
    }

    function changeSubscriptionPlanPaymentInfo(
        uint256 planId,
        address receivingAddress,
        uint8 receiveChainId
    ) public planExists(planId) planNotDeleted(planId) isPlanProvider(planId, msg.sender) {
        SubscriptionPlan memory plan = subscriptionPlans[planId];
        plan.receivingAddress = receivingAddress;
        plan.receiveChainId = receiveChainId;
        subscriptionPlans[planId] = plan;
        emit PlanChanged(
            planId,
            plan.price,
            plan.chargeInterval,
            plan.tokenAddress,
            plan.provider,
            receivingAddress,
            receiveChainId
        );
    }

    function deleteSubscription(uint256 planId) public planExists(planId) isPlanProvider(planId, msg.sender) {
        subscriptionPlans[planId].deleted = true;
        emit PlanDeleted(planId);
    }

    //only called by user operation by smart account
    function subscribe(uint256 planId, uint256 duration) public planExists(planId) planNotDeleted(planId) {
        //checkif account is a erc6900 account, install plugin by calling smart contract account(use init data and manifest hash from the plugin)
        if (msg.sender.code.length == 0) {
            revert("Account is not of smart contract type");
        }
        if (isSubscribedToPlan(planId, msg.sender)) {
            revert("User already subscribed to plan");
        }

        UserSubscription memory userSubscription = UserSubscription({
            startTime: block.timestamp,
            endTime: block.timestamp + duration,
            isActive: true,
            lastChargeDate: 0
        });
        subscriptionStatuses[msg.sender][planId] = userSubscription;
        emit PlanSubscribed(planId, msg.sender);
    }

    // same performing conditions as
    function unsubscribe(uint256 planId) public planExists(planId) {
        if (msg.sender.code.length == 0) {
            revert("Account is not of smart contract type");
        }
        if (!isSubscribedToPlan(planId, msg.sender)) {
            revert("User not subscribed to plan");
        }
        subscriptionStatuses[msg.sender][planId].isActive = false;
        emit PlanUnsubscribed(planId, msg.sender);
    }

    function isSubscribedToPlan(uint256 planId, address subscriber) public view returns (bool) {
        return subscriptionStatuses[subscriber][planId].isActive;
    }

    //called direectly in runtime
    function charge(uint256 planId, address subscriber) public planNotDeleted(planId) {
        SubscriptionPlan memory plan = subscriptionPlans[planId];
        UserSubscription memory userSubscription = subscriptionStatuses[subscriber][planId];
        if (!isSubscribedToPlan(planId, subscriber)) {
            revert("User not subscribed to plan");
        }
        if (plan.deleted == true) {
            revert("Subscription has been deleted");
        }

        require(plan.chargeInterval + userSubscription.lastChargeDate <= block.timestamp, "time Interval not met");
        require(userSubscription.startTime >= block.timestamp, "subscription is yet to start");
        require(userSubscription.endTime <= block.timestamp, "subscription has ended");

        //execute transfer to this contract with session key
        bytes memory callData = abi.encodeCall(IERC20.transfer, (address(this), plan.price));
        //use UserOperation signed by external signer
        userSubscription.lastChargeDate = block.timestamp;
        IPluginExecutor(subscriber).executeFromPluginExternal(plan.tokenAddress, 0, callData);
        if (plan.receiveChainId == currentChainId) {
            IERC20(plan.tokenAddress).transfer(plan.receivingAddress, plan.price);
        } else {
            //use CCIP for token transfer instead
        }

        emit SubscriptionCharged(planId, subscriber);
    }

    // ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
    // ┃    Plugin interface functions    ┃
    // ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

    /// @inheritdoc BasePlugin
    function onInstall(bytes calldata) external pure override {}

    /// @inheritdoc BasePlugin
    function onUninstall(bytes calldata) external pure override {}

    /// @inheritdoc BasePlugin
    function pluginManifest() external pure override returns (PluginManifest memory) {
        PluginManifest memory manifest;

        // since we are using the modular account, we will specify one depedency
        // which will handle the user op validation for ownership
        // you can find this depedency specified in the installPlugin call in the tests
        manifest.dependencyInterfaceIds = new bytes4[](1);
        manifest.dependencyInterfaceIds[0] = type(IPlugin).interfaceId;

        // we only have one execution function that can be called, which is the increment function
        // here we define that increment function on the manifest as something that can be called during execution
        manifest.executionFunctions = new bytes4[](2);
        manifest.executionFunctions[0] = this.subscribe.selector;
        manifest.executionFunctions[1] = this.unsubscribe.selector;

        // you can think of ManifestFunction as a reference to a function somewhere,
        // we want to say "use this function" for some purpose - in this case,
        // we'll be using the user op validation function from the single owner dependency
        // and this is specified by the depdendency index
        ManifestFunction memory ownerUserOpValidationFunction = ManifestFunction({
            functionType: ManifestAssociatedFunctionType.DEPENDENCY,
            functionId: 0, // unused since it's a dependency
            dependencyIndex: _MANIFEST_DEPENDENCY_INDEX_OWNER_USER_OP_VALIDATION
        });

        // here we will link together the increment function with the single owner user op validation
        // this basically says "use this user op validation function and make sure everythings okay before calling increment"
        // this will ensure that only an owner of the account can call increment
        manifest.userOpValidationFunctions = new ManifestAssociatedFunction[](2);
        manifest.userOpValidationFunctions[0] = ManifestAssociatedFunction({
            executionSelector: this.subscribe.selector,
            associatedFunction: ownerUserOpValidationFunction
        });

        manifest.userOpValidationFunctions[1] = ManifestAssociatedFunction({
            executionSelector: this.unsubscribe.selector,
            associatedFunction: ownerUserOpValidationFunction
        });

        // finally here we will always deny runtime calls to the increment function as we will only call it through user ops
        // this avoids a potential issue where a future plugin may define
        // a runtime validation function for it and unauthorized calls may occur due to that
        manifest.preRuntimeValidationHooks = new ManifestAssociatedFunction[](2);
        manifest.preRuntimeValidationHooks[0] = ManifestAssociatedFunction({
            executionSelector: this.subscribe.selector,
            associatedFunction: ManifestFunction({
                functionType: ManifestAssociatedFunctionType.PRE_HOOK_ALWAYS_DENY,
                functionId: 0,
                dependencyIndex: 0
            })
        });
        manifest.preRuntimeValidationHooks[1] = ManifestAssociatedFunction({
            executionSelector: this.unsubscribe.selector,
            associatedFunction: ManifestFunction({
                functionType: ManifestAssociatedFunctionType.PRE_HOOK_ALWAYS_DENY,
                functionId: 0,
                dependencyIndex: 0
            })
        });

        return manifest;
    }

    /// @inheritdoc BasePlugin
    function pluginMetadata() external pure virtual override returns (PluginMetadata memory) {
        PluginMetadata memory metadata;
        metadata.name = NAME;
        metadata.version = VERSION;
        metadata.author = AUTHOR;
        return metadata;
    }
}
