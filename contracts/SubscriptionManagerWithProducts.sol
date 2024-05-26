// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { BasePlugin } from "modular-account-libs/src/plugins/BasePlugin.sol";
import { IPluginExecutor } from "modular-account-libs/src/interfaces/IPluginExecutor.sol";
import { FunctionReference } from "modular-account-libs/src/interfaces/IPluginManager.sol";
import { ManifestFunction, ManifestAssociatedFunctionType, ManifestAssociatedFunction, PluginManifest, PluginMetadata, IPlugin } from "modular-account-libs/src/interfaces/IPlugin.sol";

import { ITokenBridge } from "./interfaces/ITokenBridge.sol";
import { IWETH } from "./interfaces/IWETH.sol";
import { IUniswapV3Factory } from "./interfaces/IUniswapV3Factory.sol";
import { ISwapRouter } from "./interfaces/IUniswapV3Router.sol";
import { ITokenBridge } from "./interfaces/ITokenBridge.sol";

/// @title Counter Plugin
/// @author Your name
/// @notice This plugin lets increment a count!
contract ProductSubscriptionManagerPlugin is BasePlugin {
    // metadata used by the pluginMetadata() method down below
    string public constant NAME = "Subscription Plugin";
    string public constant VERSION = "1.0.0";
    string public constant AUTHOR = "PY devs";

    // this is a constant used in the manifest, to reference our only dependency: the single owner plugin
    // since it is the first, and only, plugin the index 0 will reference the single owner plugin
    // we can use this to tell the modular account that we should use the single owner plugin to validate our user op
    // in other words, we'll say "make sure the person calling increment is an owner of the account using our single plugin"
    // Constants used in the manifest
    uint256 internal constant _MANIFEST_DEPENDENCY_INDEX_OWNER_RUNTIME_VALIDATION = 0;
    uint256 internal constant _MANIFEST_DEPENDENCY_INDEX_OWNER_USER_OP_VALIDATION = 1;

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

    uint256 public numProducts;
    uint256 public numSubscriptionPlans;
    uint256 public currentChainId;
    address public owner;
    address public immutable WETH;
    ISwapRouter public immutable swapRouter;
    IUniswapV3Factory public immutable swapFactory;
    ITokenBridge public tokenBridge;

    enum ProductType {
        RECURRING,
        SUBSCRIPTION
    }

    struct Product {
        ProductType productType;
        address provider;
        bool isActive;
        uint256 productId;
    }

    struct SubscriptionPlan {
        uint256 planId;
        uint256 productId;
        uint256 price;
        uint256 chargeInterval;
        uint256 destinationChain;
        address tokenAddress;
        address receivingAddress;
        bool isActive;
    }

    struct UserSubscription {
        uint256 lastChargeDate;
        uint256 startTime;
        uint256 endTime;
        address paymentToken;
        uint24 paymentTokenSwapFee;
        bool isActive;
    }

    struct UserSubscriptionParams {
        uint256 price;
        uint256 chargeInterval;
        address tokenAddress;
        address receivingAddress;
        uint256 destinationChain;
    }

    mapping(uint256 => SubscriptionPlan) public subscriptionPlans;
    mapping(uint256 => Product) public products;
    mapping(address => bool) public supportedBridgingTokens;
    mapping(address => mapping(uint256 => UserSubscription)) public subscriptionStatuses;
    mapping(uint256 => uint64) public ccipChainSelectors;

    event ProductCreated(
        uint256 productId,
        bytes32 name,
        address indexed provider,
        ProductType indexed productType,
        string logoURL,
        string description
    );
    event ProductUpdated(uint256 productId, address indexed provider, bool isActive);

    event PlanCreated(
        uint256 planId,
        uint256 indexed productId,
        uint256 price,
        uint256 chargeInterval,
        address tokenAddress,
        address receivingAddress,
        uint256 destinationChain
    );
    event PlanUpdated(uint256 indexed planId, address receivingAddress, uint256 destinationChain, bool isActive);
    event PlanSubscribed(uint256 indexed planId, address indexed subscriber, address paymentToken, uint256 endTime);
    event PlanUnsubscribed(uint256 indexed planId, address indexed subscriber);
    event UserSubscriptionChanged(uint256 planId, address indexed subscriber, address paymentToken, uint256 endTime);
    event SubscriptionCharged(
        uint256 indexed planId,
        address indexed subscriber,
        address paymentToken,
        uint256 paymentTokenAmount
    );

    constructor(
        address[] memory _supportedBridgingTokens,
        uint256 chainId,
        address swapFactoryAddr,
        address swapRouterAddr,
        address _WETH
    ) {
        currentChainId = chainId;
        swapFactory = IUniswapV3Factory(swapFactoryAddr);
        swapRouter = ISwapRouter(swapRouterAddr);
        owner = msg.sender;
        WETH = _WETH;
        for (uint i = 0; i < _supportedBridgingTokens.length; i++) {
            supportedBridgingTokens[_supportedBridgingTokens[i]] = true;
        }
    }

    modifier productExists(uint256 productId) {
        require(productId < numProducts, "Product does not exist");
        _;
    }

    modifier isActiveProduct(uint256 productId) {
        Product memory product = products[productId];
        require(product.isActive, "Product not active");
        _;
    }

    modifier planExists(uint256 planId) {
        require(planId < numSubscriptionPlans, "Plan does not exist");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    modifier isActivePlan(uint256 planId) {
        SubscriptionPlan memory plan = subscriptionPlans[planId];
        require(plan.isActive, "Subscription plan not active");
        Product memory product = products[plan.productId];
        require(product.isActive, "Product not active");
        _;
    }

    modifier isProductProviderr(uint256 productId, address caller) {
        Product memory product = products[productId];
        require(product.provider == caller, "Caller not provider");
        _;
    }

    modifier isPlanProvider(uint256 planId, address caller) {
        SubscriptionPlan memory plan = subscriptionPlans[planId];
        Product memory product = products[plan.productId];
        require(product.provider == caller, "Caller not provider");
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
        supportedBridgingTokens[tokenAddr] = true;
    }

    function createProduct(
        bytes32 name,
        string memory description,
        string memory logoURL,
        ProductType productType,
        UserSubscriptionParams[] memory initPlans
    ) public {
        Product memory product = Product({
            productId: numProducts,
            provider: msg.sender,
            productType: productType,
            isActive: true
        });
        products[product.productId] = product;
        numProducts += 1;
        emit ProductCreated(product.productId, name, msg.sender, productType, logoURL, description);
        for (uint i = 0; i < initPlans.length; i++) {
            UserSubscriptionParams memory initPlan = initPlans[i];
            createSubscriptionPlan(
                product.productId,
                initPlan.price,
                initPlan.chargeInterval,
                initPlan.tokenAddress,
                initPlan.receivingAddress,
                initPlan.destinationChain
            );
        }
    }

    function updateProduct(
        uint256 productId,
        address provider,
        bool isActive
    ) public productExists(productId) isProductProviderr(productId, msg.sender) {
        Product storage product = products[productId];
        product.provider = provider;
        product.isActive = isActive;

        emit ProductUpdated(productId, provider, isActive);
    }

    function createSubscriptionPlan(
        uint256 productId,
        uint256 price,
        uint256 chargeInterval,
        address tokenAddress,
        address receivingAddress,
        uint256 destinationChain
    ) public productExists(productId) isActiveProduct(productId) isProductProviderr(productId, msg.sender) {
        require(chargeInterval < block.timestamp, "Invalid charge Interval ");
        if (destinationChain != currentChainId) {
            require(ccipChainSelectors[destinationChain] != 0, "destination chain not supported");
            require(supportedBridgingTokens[tokenAddress], "token specified is not supported");
        }
        SubscriptionPlan memory plan = SubscriptionPlan({
            productId: productId,
            planId: numSubscriptionPlans,
            price: price,
            chargeInterval: chargeInterval,
            tokenAddress: tokenAddress,
            receivingAddress: receivingAddress,
            isActive: true,
            destinationChain: destinationChain
        });
        subscriptionPlans[numSubscriptionPlans] = plan;
        emit PlanCreated(
            numSubscriptionPlans,
            productId,
            price,
            chargeInterval,
            tokenAddress,
            receivingAddress,
            destinationChain
        );
        numSubscriptionPlans++;
    }

    function updateSubscriptionPlan(
        uint256 planId,
        address receivingAddress,
        uint256 destinationChain,
        bool isActive
    ) public planExists(planId) isPlanProvider(planId, msg.sender) {
        SubscriptionPlan storage plan = subscriptionPlans[planId];
        plan.receivingAddress = receivingAddress;
        plan.destinationChain = destinationChain;
        plan.isActive = isActive;
        emit PlanUpdated(planId, receivingAddress, destinationChain, isActive);
    }

    function subscribe(
        uint256 planId,
        uint256 endTime,
        address paymentToken,
        uint24 paymentTokenSwapFee
    ) public planExists(planId) isActivePlan(planId) {
        if (isSubscribedToPlan(planId, msg.sender)) {
            revert("User already subscribed to plan");
        }
        require(endTime == 0 || endTime > block.timestamp, "Invalid end time provided");

        SubscriptionPlan memory plan = subscriptionPlans[planId];
        if (plan.tokenAddress != paymentToken) {
            address tokenA = plan.tokenAddress;
            address tokenB = paymentToken;
            if (plan.tokenAddress == address(0)) {
                tokenA = WETH;
            }
            if (paymentToken == address(0)) {
                tokenB = WETH;
            }
            address poolAddr = swapFactory.getPool(tokenA, tokenB, paymentTokenSwapFee);
            require(poolAddr != address(0), "Pool does not exist for specified pool");
        }
        UserSubscription memory userSubscription = UserSubscription({
            startTime: block.timestamp,
            endTime: endTime,
            isActive: true,
            paymentToken: paymentToken,
            paymentTokenSwapFee: paymentTokenSwapFee,
            lastChargeDate: 0
        });
        subscriptionStatuses[msg.sender][planId] = userSubscription;
        emit PlanSubscribed(planId, msg.sender, userSubscription.paymentToken, userSubscription.endTime);
    }

    function createRecurringPayment(
        uint256 productId,
        UserSubscriptionParams memory initPlan,
        uint256 endTime,
        address paymentToken,
        uint24 paymentTokenSwapFee
    ) public {
        uint256 recurringProductId = productId;
        UserSubscriptionParams[] memory nullPlan;
        if (recurringProductId >= numProducts) {
            recurringProductId = numProducts;
            createProduct("Supersub", "Self Recurring Payment", "supersub.jpg", ProductType.RECURRING, nullPlan);
        }
        Product memory recurringProduct = products[recurringProductId];
        require(recurringProduct.productType == ProductType.RECURRING, "Product is not of recurring type");
        require(recurringProduct.provider == msg.sender, "Recurring Product not belonging to user");
        createSubscriptionPlan(
            recurringProductId,
            initPlan.price,
            initPlan.chargeInterval,
            initPlan.tokenAddress,
            initPlan.receivingAddress,
            initPlan.destinationChain
        );
        //subscribe to latest plan created
        subscribe(numSubscriptionPlans - 1, endTime, paymentToken, paymentTokenSwapFee);
    }

    function updateUserSubscription(
        uint256 planId,
        uint256 endTime,
        address paymentToken,
        uint24 paymentTokenSwapFee
    ) public isActivePlan(planId) {
        require(isSubscribedToPlan(planId, msg.sender), "User not subscribed to plan");
        require(endTime > block.timestamp, "Invalid endTime Provided");
        SubscriptionPlan memory plan = subscriptionPlans[planId];
        if (plan.tokenAddress != paymentToken) {
            address tokenA = plan.tokenAddress;
            address tokenB = paymentToken;
            if (plan.tokenAddress == address(0)) {
                tokenA = WETH;
            }
            if (paymentToken == address(0)) {
                tokenB = WETH;
            }
            address poolAddr = swapFactory.getPool(tokenA, tokenB, paymentTokenSwapFee);
            require(poolAddr != address(0), "Pool does not exist for specified pool");
        }
        UserSubscription storage userSubscription = subscriptionStatuses[msg.sender][planId];
        userSubscription.paymentToken = paymentToken;
        userSubscription.endTime = endTime;
        userSubscription.paymentTokenSwapFee = paymentTokenSwapFee;
        emit UserSubscriptionChanged(planId, msg.sender, paymentToken, endTime);
    }

    function unsubscribe(uint256 planId) public planExists(planId) {
        require(isSubscribedToPlan(planId, msg.sender), "User not subscribed to plan");
        subscriptionStatuses[msg.sender][planId].isActive = false;
        emit PlanUnsubscribed(planId, msg.sender);
    }

    function charge(uint256 planId, address subscriber) public isActivePlan(planId) {
        require(isSubscribedToPlan(planId, subscriber), "User not subscribed to plan");
        SubscriptionPlan memory plan = subscriptionPlans[planId];
        UserSubscription storage userSubscription = subscriptionStatuses[subscriber][planId];
        require(block.timestamp - userSubscription.lastChargeDate >= plan.chargeInterval, "time Interval not met");
        require(userSubscription.startTime <= block.timestamp, "subscription is yet to start");
        require(userSubscription.endTime == 0 || userSubscription.endTime >= block.timestamp, "subscription has ended");
        userSubscription.lastChargeDate = block.timestamp;
        uint256 val = 0;

        if (plan.tokenAddress == userSubscription.paymentToken) {
            if (plan.tokenAddress == address(0)) {
                IPluginExecutor(subscriber).executeFromPluginExternal(address(this), plan.price, "");
            } else {
                bytes memory callData = abi.encodeCall(IERC20.transfer, (address(this), plan.price));
                IPluginExecutor(subscriber).executeFromPluginExternal(plan.tokenAddress, 0, callData);
            }
        } else {
            address tokenA = userSubscription.paymentToken;
            address tokenB = plan.tokenAddress;
            uint256 tokenBalance;
            if (userSubscription.paymentToken == address(0)) {
                tokenA = WETH;
                tokenBalance = address(subscriber).balance;
                val = tokenBalance;
            } else {
                tokenBalance = IERC20(plan.tokenAddress).balanceOf(subscriber);
            }
            if (plan.tokenAddress == address(0)) {
                tokenB = WETH;
            }
            bytes memory approveCallData = abi.encodeCall(IERC20.approve, (address(swapRouter), tokenBalance)); //try to swap with all of balance first
            IPluginExecutor(subscriber).executeFromPluginExternal(tokenA, 0, approveCallData);
            bytes memory callData = getSwapCallData(
                tokenA,
                tokenB,
                userSubscription.paymentTokenSwapFee,
                address(this),
                plan.price,
                tokenBalance
            );
            bytes memory returnData = IPluginExecutor(subscriber).executeFromPluginExternal(
                address(swapRouter),
                val,
                callData
            );
            val = abi.decode(returnData, (uint256));
            approveCallData = abi.encodeCall(IERC20.approve, (address(swapRouter), 0)); //set approval back to 0
            IPluginExecutor(subscriber).executeFromPluginExternal(tokenA, 0, approveCallData);
            if (tokenB == WETH) {
                IWETH(WETH).withdraw(plan.price);
            }
        }
        if (plan.destinationChain == currentChainId) {
            if (plan.tokenAddress == address(0)) {
                payable(plan.receivingAddress).call{ value: plan.price }("");
            } else {
                IERC20(plan.tokenAddress).transfer(plan.receivingAddress, plan.price);
            }
        } else {
            tokenBridge.transferToken(
                ccipChainSelectors[plan.destinationChain],
                plan.receivingAddress,
                plan.tokenAddress,
                plan.price,
                0,
                planId
            );
        }

        emit SubscriptionCharged(planId, subscriber, userSubscription.paymentToken, val);
    }

    function isSubscribedToPlan(uint256 planId, address subscriber) public view returns (bool) {
        return
            (subscriptionStatuses[subscriber][planId].endTime == 0 ||
                subscriptionStatuses[subscriber][planId].endTime > block.timestamp) &&
            subscriptionStatuses[subscriber][planId].isActive;
    }

    function getSwapCallData(
        address _tokenIn,
        address _tokenOut,
        uint24 fee,
        address _recipient,
        uint256 amountOut,
        uint256 amountInMax
    ) internal view returns (bytes memory callData) {
        ISwapRouter.ExactOutputSingleParams memory params = ISwapRouter.ExactOutputSingleParams({
            tokenIn: _tokenIn,
            tokenOut: _tokenOut,
            fee: fee,
            recipient: _recipient,
            deadline: block.timestamp + 3,
            amountInMaximum: amountInMax,
            amountOut: amountOut,
            limitSqrtPrice: 0
        });
        return abi.encodeCall(ISwapRouter.exactOutputSingle, (params)); //try to swap with all of balance first
    }

    function pack(address addr, uint256 functionId) public pure returns (FunctionReference) {
        return FunctionReference.wrap(bytes21(bytes20(addr)) | bytes21(uint168(functionId)));
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
        manifest.dependencyInterfaceIds = new bytes4[](2);
        manifest.dependencyInterfaceIds[_MANIFEST_DEPENDENCY_INDEX_OWNER_RUNTIME_VALIDATION] = type(IPlugin)
            .interfaceId;
        manifest.dependencyInterfaceIds[_MANIFEST_DEPENDENCY_INDEX_OWNER_USER_OP_VALIDATION] = type(IPlugin)
            .interfaceId;

        // we only have one execution function that can be called, which is the increment function
        // here we define that increment function on the manifest as something that can be called during execution
        manifest.executionFunctions = new bytes4[](8);
        manifest.executionFunctions[0] = this.subscribe.selector;
        manifest.executionFunctions[1] = this.unsubscribe.selector;
        manifest.executionFunctions[2] = this.updateUserSubscription.selector;
        manifest.executionFunctions[3] = this.createProduct.selector;
        manifest.executionFunctions[4] = this.createSubscriptionPlan.selector;
        manifest.executionFunctions[5] = this.updateProduct.selector;
        manifest.executionFunctions[6] = this.updateSubscriptionPlan.selector;
        manifest.executionFunctions[7] = this.createRecurringPayment.selector;

        // you can think of ManifestFunction as a reference to a function somewhere,
        // we want to say "use this function" for some purpose - in this case,
        // we'll be using the user op validation function from the single owner dependency
        // and this is specified by the depdendency index
        ManifestFunction memory ownerUserOpValidationFunction = ManifestFunction({
            functionType: ManifestAssociatedFunctionType.DEPENDENCY,
            functionId: 0, // unused since it's a dependency
            dependencyIndex: _MANIFEST_DEPENDENCY_INDEX_OWNER_USER_OP_VALIDATION
        });

        manifest.userOpValidationFunctions = new ManifestAssociatedFunction[](8);
        manifest.userOpValidationFunctions[0] = ManifestAssociatedFunction({
            executionSelector: this.subscribe.selector,
            associatedFunction: ownerUserOpValidationFunction
        });

        manifest.userOpValidationFunctions[1] = ManifestAssociatedFunction({
            executionSelector: this.unsubscribe.selector,
            associatedFunction: ownerUserOpValidationFunction
        });

        manifest.userOpValidationFunctions[2] = ManifestAssociatedFunction({
            executionSelector: this.updateUserSubscription.selector,
            associatedFunction: ownerUserOpValidationFunction
        });

        manifest.userOpValidationFunctions[3] = ManifestAssociatedFunction({
            executionSelector: this.createProduct.selector,
            associatedFunction: ownerUserOpValidationFunction
        });
        manifest.userOpValidationFunctions[4] = ManifestAssociatedFunction({
            executionSelector: this.createSubscriptionPlan.selector,
            associatedFunction: ownerUserOpValidationFunction
        });
        manifest.userOpValidationFunctions[5] = ManifestAssociatedFunction({
            executionSelector: this.updateProduct.selector,
            associatedFunction: ownerUserOpValidationFunction
        });
        manifest.userOpValidationFunctions[6] = ManifestAssociatedFunction({
            executionSelector: this.updateSubscriptionPlan.selector,
            associatedFunction: ownerUserOpValidationFunction
        });
        manifest.userOpValidationFunctions[7] = ManifestAssociatedFunction({
            executionSelector: this.createRecurringPayment.selector,
            associatedFunction: ownerUserOpValidationFunction
        });

        manifest.preRuntimeValidationHooks = new ManifestAssociatedFunction[](4);
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

        manifest.preRuntimeValidationHooks[2] = ManifestAssociatedFunction({
            executionSelector: this.updateUserSubscription.selector,
            associatedFunction: ManifestFunction({
                functionType: ManifestAssociatedFunctionType.PRE_HOOK_ALWAYS_DENY,
                functionId: 0,
                dependencyIndex: 0
            })
        });

        manifest.preRuntimeValidationHooks[3] = ManifestAssociatedFunction({
            executionSelector: this.createRecurringPayment.selector,
            associatedFunction: ManifestFunction({
                functionType: ManifestAssociatedFunctionType.PRE_HOOK_ALWAYS_DENY,
                functionId: 0,
                dependencyIndex: 0
            })
        });

        manifest.canSpendNativeToken = true;
        manifest.permitAnyExternalAddress = true;
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

    receive() external payable {}

    fallback() external payable {}
}
