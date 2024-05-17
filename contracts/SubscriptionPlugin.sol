// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {BasePlugin} from "./BasePlugin.sol";
import {IPluginExecutor} from "./interfaces/IPluginExecutor.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {
    ManifestFunction,
    ManifestAssociatedFunctionType,
    ManifestAssociatedFunction,
    PluginManifest,
    PluginMetadata,
    IPlugin
} from "./interfaces/IPlugin.sol";



contract SubscriptionPlugin is BasePlugin {
    string public constant NAME = "Subscription Plugin";
    string public constant VERSION = "1.0.0";
    string public constant AUTHOR = "Emmanuel Oluwatobi";

    uint256 internal constant _MANIFEST_DEPEDENCY_INDEX_OWNER_USER_OP_VALIDATION = 0;

    //  uint256 numSubscriptionPlans;
    //  address public immutable sessionKeyPluginAddr;
    //  ISessionKeyPlugin public immutable sessionKeyPlugin;
    struct Product {
        bytes32 productId;
        bytes32 name;
        address provider;
        address chargeToken;
        address receivingAddress;
        uint8 destinationChain;
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

    // ISessionKeyPlugin public immutable sessionKeyPluginAddr;
    uint8 currentChainId;
    mapping(address => uint256) productNonces;
    mapping(address => uint256) subscriptionNonces;
    mapping(address => mapping(bytes32 => Product)) providerProducts;
    mapping(address => mapping(bytes32 => Plan)) providerPlans;
    mapping(address => mapping(bytes32 => UserSubscription)) userSubscriptions;

    event ProductCreated (
        bytes32 indexed productId, 
        address indexed provider, 
        bytes32 name, 
        address chargeToken,
        uint8 destinationChain,
        bool isActive
    );
    event ProductUpdated (
        bytes32 indexed productId,
        address receivingAddress, 
        address chargeToken,
        uint8 destinationChain,
        bool isActive
    );
    event PlanCreated (
        bytes32 indexed productId,
        bytes32 indexed planId,
        uint256 price,
        uint256 chargeInterval,
        bool isActive
    );
    event PlanUpdated (
        bytes32 indexed planId,
        uint256 price,
        uint256 chargeInterval,
        bool isActive
    );
    event Subscribed (
        address indexed user,
        address provider,
        bytes32 indexed product,
        bytes32 indexed plan,
        bytes32 subscriptionId
    );
    event UnSubscribed (
        address indexed user,
        bytes32 subscriptionId
    );

    constructor(uint8 chainId){
        // sessionKeyPluginAddr=_sessionKeyPluginAddr;
        currentChainId=chainId;
        //sessionKeyPlugin=ISessionKeyPlugin(_sessionKeyPluginAddr);
    }

    modifier productExists(bytes32 productId, address provider) {
        require(providerProducts[provider][productId].chargeToken != address(0));
        _;
    }

    modifier planExists(bytes32 planId, address provider) {
        require(providerPlans[provider][planId].provider != address(0));
        _;
    }

    modifier isValidERC20(address addr) {
        require(validateERC20(addr));
        _;
    }
     
    function createProduct(
        bytes32 _name, 
        address _chargeToken, 
        address _receivingAddress, 
        uint8 _destinationChain
    ) isValidERC20(_chargeToken) public {
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
            product.productId, msg.sender, 
            product.name, product.chargeToken, 
            product.destinationChain, 
            product.isActive
        );
    }

    function createPlan(
        bytes32 _productId,
        uint32 _chargeInterval,
        uint256 _price
    ) productExists(_productId, msg.sender) public {
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
        emit PlanCreated(
            _productId, plan.planId, plan.price, 
            plan.chargeInterval, plan.isActive
        );
    }

    function updateProduct(
        bytes32 _productId, 
        address _chargeToken, 
        address _receivingAddr, 
        uint8 _destChain, bool _isActive
    ) productExists(_productId, msg.sender) isValidERC20(_chargeToken) public {
        Product storage product = providerProducts[msg.sender][_productId];
        product.chargeToken = _chargeToken;
        product.receivingAddress = _receivingAddr;
        product.destinationChain = _destChain;
        product.isActive = _isActive;
        emit ProductUpdated (
            product.productId,
            product.receivingAddress,
            product.chargeToken,
            product.destinationChain,
            product.isActive
        );
    }

    function updatePlan(
        bytes32 _planId,
        uint256 _price,
        uint32 _chargeInterval,
        bool _isActive
    ) planExists(_planId, msg.sender) public {
        Plan storage plan = providerPlans[msg.sender][_planId];
        plan.price = _price;
        plan.chargeInterval = _chargeInterval;
        plan.isActive = _isActive;
        emit PlanUpdated (
            plan.planId,
            plan.price,
            plan.chargeInterval,
            plan.isActive
        );
    }

    function subscribe(bytes32 planId, bytes32 productId, address provider) productExists(productId, provider) planExists(planId, provider) public {
        // Todo: plan & product must be active
        //Product storage product = providerProducts[provider][productId];
        Plan storage plan = providerPlans[provider][planId];
        UserSubscription memory subscription = UserSubscription(
            {
                subscriptionId: bytes32(subscriptionNonces[msg.sender]),
                product: productId,
                plan: plan.planId,
                provider: provider,
                isActive: true,
                lastChargeDate:0
            }
        );
        userSubscriptions[msg.sender][subscription.subscriptionId] = subscription;
        subscriptionNonces[msg.sender] += 1;
        emit Subscribed(msg.sender, provider, productId, planId, subscription.subscriptionId);
    }

    function unSubscribe(bytes32 subscriptionId) public {
        userSubscriptions[msg.sender][subscriptionId].isActive = false;
        emit UnSubscribed(msg.sender, subscriptionId);
    }

    function validateERC20(address tokenAddr) internal view returns (bool) {
        try IERC20(tokenAddr).totalSupply() returns (uint256) {
            return true;
        } catch {
            return false;
        }
    }

    /// @inheritdoc BasePlugin
    function onInstall(bytes calldata) external pure override {}

    /// @inheritdoc BasePlugin
    function onUninstall(bytes calldata) external pure override {}

    /// @inheritdoc BasePlugin
    function pluginManifest() external pure override returns (PluginManifest memory) {
        PluginManifest memory manifest;

        // Specify plugin dependencies
        manifest.dependencyInterfaceIds = new bytes4[](1);
        manifest.dependencyInterfaceIds[0] = type(IPlugin).interfaceId;

        // Specify execution function that can be called from the SCA
        // SCA can only call subscribe and unsubscribe functions
        manifest.executionFunctions = new bytes4[](2);
        manifest.executionFunctions[0] = this.subscribe.selector;
        manifest.executionFunctions[1] = this.unSubscribe.selector;
    }

    // function isPluginInstalled(address pluginAddr,address userAddr)public view returns(bool){
    //     IAccountLoupe accountLoupe=IAccountLoupe(userAddr);
    //     address[] memory installedPlugins= accountLoupe.getInstalledPlugins();
    //     return addressInArray(pluginAddr, installedPlugins);
    // }

    // function addressInArray(address findAddress,address[] memory addressArray)private pure returns(bool){
    //     for (uint i = 0; i < addressArray.length; i++) {
    //         if (addressArray[i] == findAddress) {
    //         return true;
    //         }
    //     }

    //     return false;
    // }

    // function unsubscribe(uint256 planId)public{
    //     if(msg.sender.code.length==0){
    //         revert("Account is not of smart contract type");
    //     }
    //     if(!isSubscribedToPlan(planId, msg.sender)){
    //         revert("User not subscribed to plan");
    //     }
    //     SubscriptionPlan memory plan=subscriptionPlans[planId];
    //     uint256 tokenSpendLimitValue=tokenSpendLimitValues[msg.sender][plan.tokenAddress].limitValue;
    //     tokenSpendLimitValues[msg.sender][plan.tokenAddress].limitValue=tokenSpendLimitValue-plan.price;
    //     subscriptionStatuses[msg.sender][planId].isActive=false;
    //     emit PlanUnsubscribed(planId, msg.sender);
    // }


    // function isSubscribedToPlan(uint256 planId,address subscriber)public view returns(bool){
    //     return subscriptionStatuses[subscriber][planId].isActive;
    // }

    // function charge(uint256 planId,address subscriber)public{
    //     SubscriptionPlan memory plan=subscriptionPlans[planId]; 
    //     UserSubscription memory userSubscription=subscriptionStatuses[subscriber][planId];
    //     if(!isSubscribedToPlan(planId, subscriber)){
    //         revert("User not subscribed to plan");
    //     }
    //     if(plan.deleted==true){
    //         revert("Subscription has been deleted");
    //     }

    //     assert(plan.chargeInterval+userSubscription.lastChargeDate<=block.timestamp);
    //     assert(userSubscription.startTime>=block.timestamp);
    //     assert(userSubscription.endTime<=block.timestamp);

    //     bool isSessionAllowed=sessionKeyPlugin.isSessionKeyOf(msg.sender,address(this));
    //     if(!isSessionAllowed){
    //         revert("User has not given sesssion permission to contract");
    //     }
    //     uint256 totalTokenAllowance= (sessionKeyPlugin.getERC20SpendLimitInfo(msg.sender, address(this), plan.tokenAddress)).limit;
    //     assert(plan.price<=totalTokenAllowance);

    //     //execute transfer to this contract with session key
    //     Call[] memory calls = new Call[](1);
    //     bytes memory callData=abi.encodeCall(IERC20.transfer, (address(this), plan.price));
    //     calls[0] = Call({target: plan.tokenAddress, value: 0, data: callData});
    //     sessionKeyPlugin.executeWithSessionKey(calls, address(this));
    //     if(plan.receiveChainId==currentChainId){
    //         IERC20(plan.tokenAddress).transfer(plan.receivingAddress, plan.price);
    //     }else{
    //         //use CCIP for token transfer instead
    //     }

    //     emit SubscriptionCharged(planId, subscriber);
    // }


}