// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { BasePlugin } from "modular-account-libs/plugins/BasePlugin.sol";
import { IPluginExecutor } from "modular-account-libs/interfaces/IPluginExecutor.sol";
import { ManifestFunction, ManifestAssociatedFunctionType, ManifestAssociatedFunction, PluginManifest, PluginMetadata, IPlugin } from "modular-account-libs/interfaces/IPlugin.sol";
import { ITokenBridge } from "./interfaces/ITokenBridge.sol";

contract SubscriptionPlugin is BasePlugin {
    string public constant NAME = "Subscription Plugin";
    string public constant VERSION = "1.0.0";
    string public constant AUTHOR = "Tee-py & Jaybee";

    uint256 internal constant _MANIFEST_DEPENDENCY_INDEX_OWNER_USER_OP_VALIDATION = 0;

    enum ProductType {
        RECURRING,
        SUBSCRIPTION
    }

    struct Product {
        uint256 productId;
        ProductType productType;
        address provider;
        address chargeToken;
        address receivingAddress;
        uint256 destinationChain;
        bool isActive;
    }
    struct Plan {
        uint256 productId;
        uint256 planId;
        address provider;
        uint256 price;
        uint32 chargeInterval;
        bool isActive;
    }
    struct UserSubscription {
        uint256 subscriptionId;
        uint256 product;
        address provider;
        uint256 plan;
        uint256 lastChargeDate;
        uint256 endTime;
        bool isActive;
    }

    uint256 public currentChainId;
    address public admin;
    uint256 public productNonce;
    uint256 public planNonce;
    ITokenBridge public tokenBridge;
    mapping(uint256 => uint64) public ccipChainSelectors;
    mapping(uint256 => Product) public products;
    mapping(uint256 => Plan) public plans;
    mapping(address => uint256) public subscriptionNonces;
    mapping(address => mapping(uint256 => UserSubscription)) public userSubscriptions;
    mapping(address => mapping(uint256 => bool)) public subscribedToProduct;

    event ProductCreated(
        uint256 indexed productId,
        address indexed provider,
        bytes32 name,
        string description,
        string logoUrl,
        ProductType productType,
        address chargeToken,
        address receivingAddress,
        uint256 destinationChain,
        bool isActive
    );
    event ProductUpdated(uint256 indexed productId, address receivingAddress, uint256 destinationChain, bool isActive);
    event PlanCreated(
        uint256 indexed productId,
        uint256 indexed planId,
        uint256 price,
        uint256 chargeInterval,
        bool isActive
    );
    event PlanUpdated(uint256 indexed planId, bool isActive);
    event Subscribed(
        address indexed subscriber,
        address provider,
        uint256 indexed product,
        uint256 indexed plan,
        uint256 subscriptionId,
        uint256 endTime
    );
    event UnSubscribed(address indexed user, uint256 subscriptionId);
    event SubscriptionPlanChanged(address indexed user, uint256 subscriptionId, uint256 planId);
    event SubscriptionCharged(
        address indexed subscriber,
        address recipient,
        uint256 subscriptionId,
        uint256 indexed planId,
        uint256 indexed productId,
        uint256 amount,
        uint256 timestamp
    );

    constructor(uint256 chainId) {
        admin = msg.sender;
        currentChainId = chainId;
        productNonce = 1;
        planNonce = 1;
    }

    // ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
    // ┃    Contract Modifiers     ┃
    // ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

    modifier onlyAdmin() {
        require(msg.sender == admin);
        _;
    }

    modifier productExists(uint256 productId) {
        require(products[productId].productId != 0, "Product Not Found");
        _;
    }

    modifier planExists(uint256 planId) {
        require(plans[planId].planId != 0, "Plan Not Found");
        _;
    }

    modifier isActiveProduct(uint256 productId) {
        require(products[productId].isActive, "Product is inactive");
        _;
    }

    modifier isActivePlan(uint256 planId) {
        require(plans[planId].isActive, "Plan is inactive");
        _;
    }

    modifier isActiveSubscription(address subscriber, uint256 subscriptionId) {
        require(userSubscriptions[subscriber][subscriptionId].isActive, "Subscription not active");
        _;
    }

    modifier subscriptionExists(address subscriber, uint256 subscriptionId) {
        require(userSubscriptions[subscriber][subscriptionId].provider != address(0), "Subscription not found");
        _;
    }

    modifier productBelongsToCaller(uint256 productId) {
        require(products[productId].provider == msg.sender, "Not authorized provider");
        _;
    }

    // ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
    // ┃    Execution functions    ┃
    // ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

    function createProduct(
        bytes32 _name,
        string calldata _description,
        string calldata _logoUrl,
        ProductType _type,
        address _chargeToken,
        address _receivingAddress,
        uint256 _destinationChain
    ) public {
        if (_destinationChain != currentChainId) {
            require(ccipChainSelectors[_destinationChain] != 0, "destination chain not supported");
        }
        Product memory product = Product({
            productId: productNonce,
            provider: msg.sender,
            productType: _type,
            chargeToken: _chargeToken,
            receivingAddress: _receivingAddress,
            destinationChain: _destinationChain,
            isActive: true
        });
        products[product.productId] = product;
        productNonce += 1;
        emit ProductCreated(
            product.productId,
            msg.sender,
            _name,
            _description,
            _logoUrl,
            _type,
            product.chargeToken,
            product.receivingAddress,
            product.destinationChain,
            product.isActive
        );
    }

    function createPlan(
        uint256 _productId,
        uint32 _chargeInterval,
        uint256 _price
    ) public productExists(_productId) productBelongsToCaller(_productId) {
        Product storage product = products[_productId];
        Plan memory plan = Plan({
            productId: _productId,
            planId: planNonce,
            provider: product.provider,
            chargeInterval: _chargeInterval,
            price: _price,
            isActive: true
        });
        plans[plan.planId] = plan;
        planNonce += 1;
        emit PlanCreated(_productId, plan.planId, plan.price, plan.chargeInterval, plan.isActive);
    }

    function updateProduct(
        uint256 _productId,
        address _receivingAddr,
        uint256 _destChain,
        bool _isActive
    ) public productExists(_productId) productBelongsToCaller(_productId) {
        if (_destChain != currentChainId) {
            require(ccipChainSelectors[_destChain] != 0, "destination chain not supported");
        }
        Product storage product = products[_productId];
        product.receivingAddress = _receivingAddr;
        product.destinationChain = _destChain;
        product.isActive = _isActive;
        emit ProductUpdated(product.productId, product.receivingAddress, product.destinationChain, product.isActive);
    }

    function updatePlan(uint256 _planId, bool _isActive) public planExists(_planId) {
        Plan storage plan = plans[_planId];
        require(plan.provider == msg.sender, "Not authorized provider");
        plan.isActive = _isActive;
        emit PlanUpdated(plan.planId, plan.isActive);
    }

    function subscribe(uint256 planId, uint256 endTime) public isActivePlan(planId) {
        if (msg.sender.code.length == 0) {
            revert("Account is not of smart contract type");
        }
        Plan memory plan = plans[planId];
        Product memory product = products[plan.productId];
        require(plan.isActive && product.isActive, "Plan and product must be active");
        require(!subscribedToProduct[msg.sender][product.productId], "Product subscription already exists");
        UserSubscription memory subscription = UserSubscription({
            subscriptionId: subscriptionNonces[msg.sender],
            product: product.productId,
            plan: plan.planId,
            provider: plan.provider,
            isActive: true,
            lastChargeDate: block.timestamp,
            endTime: endTime
        });
        // Charge on first subscription
        _executeTransfer(
            plan.price,
            msg.sender,
            product.chargeToken,
            product.receivingAddress,
            product.destinationChain,
            subscription.subscriptionId,
            plan.planId
        );
        userSubscriptions[msg.sender][subscription.subscriptionId] = subscription;
        subscriptionNonces[msg.sender] += 1;
        subscribedToProduct[msg.sender][product.productId] = true;
        emit Subscribed(msg.sender, plan.provider, product.productId, planId, subscription.subscriptionId, endTime);
        emit SubscriptionCharged(
            msg.sender,
            product.receivingAddress,
            subscription.subscriptionId,
            planId,
            product.productId,
            plan.price,
            subscription.lastChargeDate
        );
    }

    function unSubscribe(uint256 subscriptionId) public {
        userSubscriptions[msg.sender][subscriptionId].isActive = false;
        emit UnSubscribed(msg.sender, subscriptionId);
    }

    // ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
    // ┃  Author Plugin functions  ┃
    // ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

    function changeSubscriptionPlan(
        uint256 productId,
        uint256 planId,
        uint256 subscriptionId
    ) public isActiveProduct(productId) isActivePlan(planId) subscriptionExists(msg.sender, subscriptionId) {
        UserSubscription storage subscription = userSubscriptions[msg.sender][subscriptionId];
        Plan memory plan = plans[planId];
        if (subscription.provider != plan.provider) {
            revert("Provider mismatch");
        }
        if (plan.productId != subscription.product) {
            revert("Plan does not belong to current product");
        }
        subscription.plan = planId;
        subscription.isActive = true;
        emit SubscriptionPlanChanged(msg.sender, subscriptionId, planId);
    }

    function changeSubscriptionEndTime(uint256 subscriptionId, uint256 endTime) public {
        UserSubscription storage subscription = userSubscriptions[msg.sender][subscriptionId];
        subscription.endTime = endTime;
    }

    function _executeTransfer(
        uint256 amount,
        address subscriber,
        address chargeToken,
        address receivingAddress,
        uint256 destinationChain,
        uint256 subId,
        uint256 planId
    ) private {
        bytes memory callData = abi.encodeCall(IERC20.transfer, (address(this), amount));
        IPluginExecutor(subscriber).executeFromPluginExternal(chargeToken, 0, callData);
        if (destinationChain == currentChainId) {
            IERC20(chargeToken).transfer(receivingAddress, amount);
        } else {
            IERC20(chargeToken).transfer(address(tokenBridge), amount);
            tokenBridge.transferToken(
                ccipChainSelectors[destinationChain],
                receivingAddress,
                chargeToken,
                amount,
                subId,
                planId
            );
        }
    }

    function charge(
        address subscriber,
        uint256 subscriptionId
    ) public isActiveSubscription(subscriber, subscriptionId) {
        UserSubscription storage userSubscription = userSubscriptions[subscriber][subscriptionId];
        Plan memory plan = plans[userSubscription.plan];
        Product memory product = products[userSubscription.product];
        require(plan.chargeInterval + userSubscription.lastChargeDate <= block.timestamp, "time Interval not met");
        require(
            userSubscription.endTime > block.timestamp || userSubscription.endTime == 0,
            "subscription end time elapsed"
        );
        require(product.isActive, "Product is inactive");
        require(plan.isActive, "Plan is inactive");
        _executeTransfer(
            plan.price,
            subscriber,
            product.chargeToken,
            product.receivingAddress,
            product.destinationChain,
            userSubscription.subscriptionId,
            plan.planId
        );
        userSubscription.lastChargeDate = block.timestamp;
        emit SubscriptionCharged(
            subscriber,
            product.receivingAddress,
            subscriptionId,
            plan.planId,
            plan.productId,
            plan.price,
            userSubscription.lastChargeDate
        );
    }

    function setTokenBridge(address _bridgeAddr) public onlyAdmin {
        tokenBridge = ITokenBridge(_bridgeAddr);
    }

    function addChainSelector(uint256 _chainId, uint64 _selector) public onlyAdmin {
        ccipChainSelectors[_chainId] = _selector;
    }

    function getUserSubscriptions(address subscriber) public view returns (UserSubscription[] memory subscriptions) {
        uint256 nonce = subscriptionNonces[subscriber];
        subscriptions = new UserSubscription[](nonce);
        for (uint i = 0; i < subscriptionNonces[subscriber]; i++) {
            subscriptions[i] = userSubscriptions[subscriber][i];
        }
        return subscriptions;
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

        // Specify plugin dependencies
        manifest.dependencyInterfaceIds = new bytes4[](1);
        manifest.dependencyInterfaceIds[_MANIFEST_DEPENDENCY_INDEX_OWNER_USER_OP_VALIDATION] = type(IPlugin)
            .interfaceId;

        // Specify execution function that can be called from the SCA
        // SCA can only call subscribe and unsubscribe functions
        manifest.executionFunctions = new bytes4[](7);
        manifest.executionFunctions[0] = this.subscribe.selector;
        manifest.executionFunctions[1] = this.unSubscribe.selector;
        manifest.executionFunctions[2] = this.changeSubscriptionPlan.selector;
        manifest.executionFunctions[3] = this.createProduct.selector;
        manifest.executionFunctions[4] = this.createPlan.selector;
        manifest.executionFunctions[5] = this.updateProduct.selector;
        manifest.executionFunctions[6] = this.updatePlan.selector;

        // A dependency manifest function to validate user operations using the single owner dependency plugin
        ManifestFunction memory ownerUserOpValidationFunction = ManifestFunction({
            functionType: ManifestAssociatedFunctionType.DEPENDENCY,
            functionId: 0, // unused since it's a dependency
            dependencyIndex: _MANIFEST_DEPENDENCY_INDEX_OWNER_USER_OP_VALIDATION
        });

        // set the manifest function as validation function for calls to `subscribe`,
        // `unsubscribe`, `createPlan`, `createProduct`, `Updateplan` and `updateProduct` from the SCA.
        manifest.userOpValidationFunctions = new ManifestAssociatedFunction[](7);
        manifest.userOpValidationFunctions[0] = ManifestAssociatedFunction({
            executionSelector: this.subscribe.selector,
            associatedFunction: ownerUserOpValidationFunction
        });
        manifest.userOpValidationFunctions[1] = ManifestAssociatedFunction({
            executionSelector: this.unSubscribe.selector,
            associatedFunction: ownerUserOpValidationFunction
        });
        manifest.userOpValidationFunctions[2] = ManifestAssociatedFunction({
            executionSelector: this.changeSubscriptionPlan.selector,
            associatedFunction: ownerUserOpValidationFunction
        });
        manifest.userOpValidationFunctions[3] = ManifestAssociatedFunction({
            executionSelector: this.createProduct.selector,
            associatedFunction: ownerUserOpValidationFunction
        });
        manifest.userOpValidationFunctions[4] = ManifestAssociatedFunction({
            executionSelector: this.createPlan.selector,
            associatedFunction: ownerUserOpValidationFunction
        });
        manifest.userOpValidationFunctions[5] = ManifestAssociatedFunction({
            executionSelector: this.updateProduct.selector,
            associatedFunction: ownerUserOpValidationFunction
        });
        manifest.userOpValidationFunctions[6] = ManifestAssociatedFunction({
            executionSelector: this.updatePlan.selector,
            associatedFunction: ownerUserOpValidationFunction
        });

        // Prevent runtime calls to subscribe, unsubscribe and changeSubscriptionPlan
        manifest.preRuntimeValidationHooks = new ManifestAssociatedFunction[](3);
        manifest.preRuntimeValidationHooks[0] = ManifestAssociatedFunction({
            executionSelector: this.subscribe.selector,
            associatedFunction: ManifestFunction({
                functionType: ManifestAssociatedFunctionType.PRE_HOOK_ALWAYS_DENY,
                functionId: 0,
                dependencyIndex: 0
            })
        });
        manifest.preRuntimeValidationHooks[1] = ManifestAssociatedFunction({
            executionSelector: this.unSubscribe.selector,
            associatedFunction: ManifestFunction({
                functionType: ManifestAssociatedFunctionType.PRE_HOOK_ALWAYS_DENY,
                functionId: 0,
                dependencyIndex: 0
            })
        });
        manifest.preRuntimeValidationHooks[2] = ManifestAssociatedFunction({
            executionSelector: this.changeSubscriptionPlan.selector,
            associatedFunction: ManifestFunction({
                functionType: ManifestAssociatedFunctionType.PRE_HOOK_ALWAYS_DENY,
                functionId: 0,
                dependencyIndex: 0
            })
        });

        manifest.permitAnyExternalAddress = true;
        manifest.canSpendNativeToken = true;

        return manifest;
    }

    // @inheritdoc BasePlugin
    function pluginMetadata() external pure virtual override returns (PluginMetadata memory) {
        PluginMetadata memory metadata;
        metadata.name = NAME;
        metadata.version = VERSION;
        metadata.author = AUTHOR;
        return metadata;
    }

    function getManifestHash() public view returns (bytes32) {
        return keccak256(abi.encode(this.pluginManifest()));
    }
}
