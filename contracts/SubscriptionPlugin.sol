// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { BasePlugin } from "modular-account-libs/plugins/BasePlugin.sol";
import { IPluginExecutor } from "modular-account-libs/interfaces/IPluginExecutor.sol";
import { ManifestFunction, ManifestAssociatedFunctionType, ManifestAssociatedFunction, PluginManifest, PluginMetadata, IPlugin } from "modular-account-libs/interfaces/IPlugin.sol";

contract SubscriptionPlugin is BasePlugin {
    string public constant NAME = "Subscription Plugin";
    string public constant VERSION = "1.0.0";
    string public constant AUTHOR = "Tee-py & Jaybee";

    uint256 internal constant _MANIFEST_DEPENDENCY_INDEX_OWNER_USER_OP_VALIDATION = 0;

    struct Product {
        bytes32 productId;
        bytes32 name;
        address provider;
        address chargeToken;
        address receivingAddress;
        uint256 destinationChain;
        uint8 planNonce;
        bool isActive;
    }
    struct Plan {
        bytes32 productId;
        bytes32 planId;
        address provider;
        uint256 price;
        uint32 chargeInterval;
        bool isActive;
    }
    struct UserSubscription {
        bytes32 subscriptionId;
        bytes32 product;
        address provider;
        bytes32 plan;
        uint256 lastChargeDate;
        bool isActive;
    }

    uint256 public currentChainId;
    address public admin;
    mapping(address => uint256) public productNonces;
    mapping(address => uint256) public subscriptionNonces;
    mapping(address => mapping(bytes32 => Product)) public providerProducts;
    mapping(address => mapping(bytes32 => Plan)) public providerPlans;
    mapping(address => mapping(bytes32 => UserSubscription)) public userSubscriptions;

    event ProductCreated(
        bytes32 indexed productId,
        address indexed provider,
        bytes32 name,
        address chargeToken,
        uint256 destinationChain,
        bool isActive
    );
    event ProductUpdated(
        bytes32 indexed productId,
        address receivingAddress,
        address chargeToken,
        uint256 destinationChain,
        bool isActive
    );
    event PlanCreated(
        bytes32 indexed productId,
        bytes32 indexed planId,
        uint256 price,
        uint256 chargeInterval,
        bool isActive
    );
    event PlanUpdated(bytes32 indexed planId, bool isActive);
    event Subscribed(
        address indexed subscriber,
        address provider,
        bytes32 indexed product,
        bytes32 indexed plan,
        bytes32 subscriptionId
    );
    event UnSubscribed(address indexed user, bytes32 subscriptionId);
    event SubscriptionPlanChanged(address indexed user, bytes32 subscriptionId, bytes32 planId);
    event SubscriptionCharged(
        address indexed subscriber,
        bytes32 subscriptionId,
        bytes32 indexed planId,
        uint256 amount
    );

    constructor(uint256 chainId) {
        admin = msg.sender;
        currentChainId = chainId;
    }

    // ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
    // ┃    Contract Modifiers     ┃
    // ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

    modifier onlyAdmin() {
        require(msg.sender == admin);
        _;
    }

    modifier productExists(bytes32 productId, address provider) {
        require(providerProducts[provider][productId].chargeToken != address(0), "Product Not Found");
        _;
    }

    modifier planExists(bytes32 planId, address provider) {
        require(providerPlans[provider][planId].provider != address(0), "Plan Not Found");
        _;
    }

    modifier isActiveProduct(bytes32 productId, address provider) {
        require(providerProducts[provider][productId].isActive, "Product is inactive");
        _;
    }

    modifier isActivePlan(bytes32 planId, address provider) {
        require(providerPlans[provider][planId].isActive, "Plan is inactive");
        _;
    }

    modifier isActiveSubscription(address subscriber, bytes32 subscriptionId) {
        require(userSubscriptions[subscriber][subscriptionId].isActive, "Subscription not active");
        _;
    }

    modifier subscriptionExists(address subscriber, bytes32 subscriptionId) {
        require(userSubscriptions[subscriber][subscriptionId].provider != address(0), "Subscription not found");
        _;
    }

    // ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
    // ┃    Execution functions    ┃
    // ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

    function createProduct(
        bytes32 _name,
        address _chargeToken,
        address _receivingAddress,
        uint256 _destinationChain
    ) public {
        Product memory product = Product({
            name: _name,
            productId: bytes32(uint256(productNonces[msg.sender])),
            provider: msg.sender,
            chargeToken: _chargeToken,
            receivingAddress: _receivingAddress,
            destinationChain: _destinationChain,
            planNonce: 0,
            isActive: true
        });
        providerProducts[msg.sender][product.productId] = product;
        productNonces[msg.sender] += 1;
        emit ProductCreated(
            product.productId,
            msg.sender,
            product.name,
            product.chargeToken,
            product.destinationChain,
            product.isActive
        );
    }

    function createPlan(
        bytes32 _productId,
        uint32 _chargeInterval,
        uint256 _price
    ) public productExists(_productId, msg.sender) {
        Product storage product = providerProducts[msg.sender][_productId];
        Plan memory plan = Plan({
            productId: _productId,
            planId: bytes32(uint256(product.planNonce)),
            provider: product.provider,
            chargeInterval: _chargeInterval,
            price: _price,
            isActive: true
        });
        providerPlans[msg.sender][plan.planId] = plan;
        product.planNonce += 1;
        emit PlanCreated(_productId, plan.planId, plan.price, plan.chargeInterval, plan.isActive);
    }

    function updateProduct(
        bytes32 _productId,
        address _chargeToken,
        address _receivingAddr,
        uint256 _destChain,
        bool _isActive
    ) public productExists(_productId, msg.sender) {
        Product storage product = providerProducts[msg.sender][_productId];
        product.chargeToken = _chargeToken;
        product.receivingAddress = _receivingAddr;
        product.destinationChain = _destChain;
        product.isActive = _isActive;
        emit ProductUpdated(
            product.productId,
            product.receivingAddress,
            product.chargeToken,
            product.destinationChain,
            product.isActive
        );
    }

    function updatePlan(
        bytes32 _planId,
        bool _isActive
    ) public planExists(_planId, msg.sender) {
        Plan storage plan = providerPlans[msg.sender][_planId];
        plan.isActive = _isActive;
        emit PlanUpdated(plan.planId, plan.isActive);
    }

    function subscribe(
        bytes32 planId,
        bytes32 productId,
        address provider
    ) public isActiveProduct(productId, provider) isActivePlan(planId, provider) {
        if (msg.sender.code.length == 0) {
            revert("Account is not of smart contract type");
        }
        if (isSubscribedToProduct(msg.sender, productId)) {
            revert("Product subscription already exists");
        }
        Plan memory plan = providerPlans[provider][planId];
        Product memory product = providerProducts[provider][productId];
        // Charge on first subscription
        executeTransfer(
            plan.price,
            msg.sender,
            product.chargeToken,
            product.receivingAddress,
            product.destinationChain
        );
        UserSubscription memory subscription = UserSubscription({
            subscriptionId: bytes32(subscriptionNonces[msg.sender]),
            product: productId,
            plan: plan.planId,
            provider: provider,
            isActive: true,
            lastChargeDate: block.timestamp
        });
        userSubscriptions[msg.sender][subscription.subscriptionId] = subscription;
        subscriptionNonces[msg.sender] += 1;
        emit Subscribed(msg.sender, provider, productId, planId, subscription.subscriptionId);
    }

    function unSubscribe(bytes32 subscriptionId) public {
        userSubscriptions[msg.sender][subscriptionId].isActive = false;
        emit UnSubscribed(msg.sender, subscriptionId);
    }

    // ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
    // ┃  Author Plugin functions  ┃
    // ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

    function changeSubscriptionPlan(
        bytes32 productId,
        bytes32 planId,
        bytes32 subscriptionId,
        address provider
    )
        public
        isActiveProduct(productId, provider)
        isActivePlan(planId, provider)
        subscriptionExists(msg.sender, subscriptionId)
    {
        UserSubscription storage subscription = userSubscriptions[msg.sender][subscriptionId];
        Plan memory plan = providerPlans[provider][planId];
        if (subscription.provider != provider) {
            revert("Provider mismatch");
        }
        if (plan.productId != subscription.product) {
            revert("Plan does not belong to current product");
        }
        subscription.plan = planId;
        subscription.isActive = true;
        emit SubscriptionPlanChanged(msg.sender, subscriptionId, planId);
    }

    function isSubscribedToProduct(address subscriber, bytes32 productId) public view returns (bool) {
        for (uint i = 0; i < subscriptionNonces[subscriber]; i++) {
            if (userSubscriptions[subscriber][bytes32(i)].product == productId) {
                return true;
            }
        }
        return false;
    }

    function executeTransfer(
        uint256 amount,
        address subscriber,
        address chargeToken,
        address receivingAddress,
        uint256 destinationChain
    ) internal {
        bytes memory callData = abi.encodeCall(IERC20.transfer, (address(this), amount));
        IPluginExecutor(subscriber).executeFromPluginExternal(chargeToken, 0, callData);
        if (destinationChain == currentChainId) {
            IERC20(chargeToken).transfer(receivingAddress, amount);
        } else {
            //use CCIP for token transfer instead
        }
    }

    function charge(
        bytes32 planId,
        address provider,
        bytes32 productId,
        address subscriber,
        bytes32 subscriptionId
    )
        public
        isActivePlan(planId, provider)
        isActiveProduct(productId, provider)
        isActiveSubscription(subscriber, subscriptionId)
    {
        Plan memory plan = providerPlans[provider][planId];
        Product memory product = providerProducts[provider][productId];
        UserSubscription storage userSubscription = userSubscriptions[subscriber][subscriptionId];
        require(plan.chargeInterval + userSubscription.lastChargeDate <= block.timestamp, "time Interval not met");
        require(plan.planId == userSubscription.plan, "Incorrect plan id");
        require(plan.productId == productId, "Plan does not belong to specified product");
        executeTransfer(
            plan.price,
            subscriber,
            product.chargeToken,
            product.receivingAddress,
            product.destinationChain
        );
        userSubscription.lastChargeDate = block.timestamp;
        emit SubscriptionCharged(subscriber, subscriptionId, planId, plan.price);
    }

    function getUserSubscriptions(address subscriber) public view returns (UserSubscription[] memory subscriptions) {
        uint256 nonce = subscriptionNonces[subscriber];
        subscriptions = new UserSubscription[](nonce);
        for (uint i = 0; i < subscriptionNonces[subscriber]; i++) {
            subscriptions[i] = userSubscriptions[subscriber][bytes32(i)];
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
