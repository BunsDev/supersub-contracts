// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import {IAccount} from "./interfaces/IAccount.sol";
import {IAccountLoupe} from "./interfaces/IAccountLoupe.sol";
import {ISessionKeyPlugin} from "./interfaces/ISessionKeyPlugin.sol";
import {IPluginManager} from "./interfaces/IPluginManager.sol";
import {Call} from "./interfaces/IPluginExecutor.sol";
import {IERC20} from "./interfaces/IERC20.sol";



contract SubscriptionManager{
     uint256 numSubscriptionPlans;
     address public immutable sessionKeyPluginAddr;
     ISessionKeyPlugin public immutable sessionKeyPlugin;
     uint8 currentChainId;
     struct SubscriptionPlan{
          uint256 planId;
          uint256 price;
          uint256 chargeInterval;
          address tokenAddress;
          address provider;
          address receivingAddress;
          uint8 receiveChainId;
          bool deleted;
     }

     struct UserSubscription{
        uint256 lastChargeDate;
        uint256 startTime;
        uint256 endTime;
        bool isActive;
     }

     struct SpendLimitInfo{
          uint256 limitValue;
     }


     mapping (uint256 => SubscriptionPlan) subscriptionPlans;
     mapping(address=> mapping(uint256=>UserSubscription)) subscriptionStatuses;
     mapping(address=>mapping(address=>SpendLimitInfo)) tokenSpendLimitValues;

     event PlanCreated(uint256 planId,uint256 price,uint256 chargeInterval,address tokenAddress,address provider,address receivingAddress,uint8 receiveChainId);
     event PlanChanged(uint256 planId,uint256 price,uint256 chargeInterval,address tokenAddress,address provider,address receivingAddress,uint8 receiveChainId);
     event PlanDeleted(uint256 planId);
     event PlanSubscribed(uint256 planId,address indexed subscriber);
     event PlanUnsubscribed(uint256 planId,address indexed subscriber);
     event SubscriptionCharged(uint256 planId,address indexed subscriber);

     constructor(uint8 chainId, address _sessionKeyPluginAddr ){
          sessionKeyPluginAddr=_sessionKeyPluginAddr;
          currentChainId=chainId;
          sessionKeyPlugin=ISessionKeyPlugin(_sessionKeyPluginAddr);
     }

     modifier planExists(uint256 planId) {
          require(planId <= numSubscriptionPlans);
          _;
     }
     
     modifier isPlanProvider(uint256 planId,address caller) {
          subscriptionPlans[planId].provider==caller;
          _;
     }

     function createSubscriptionPlan(uint256 price,uint256 chargeInterval,address tokenAddress,address provider,address receivingAddress,uint8 receiveChainId)public{
          SubscriptionPlan memory plan=SubscriptionPlan({planId:numSubscriptionPlans,price:price,chargeInterval:chargeInterval,tokenAddress:tokenAddress,provider:provider,receivingAddress:receivingAddress,deleted:false,receiveChainId:receiveChainId});
          subscriptionPlans[numSubscriptionPlans]=plan;
          emit PlanCreated(numSubscriptionPlans, price, chargeInterval, tokenAddress, provider, receivingAddress,receiveChainId);
          numSubscriptionPlans++;
     }

     function changeSubscriptionPlanPaymentInfo(uint256 planId, address receivingAddress,uint8 receiveChainId)planExists(planId) isPlanProvider(planId, msg.sender) public {
           SubscriptionPlan memory plan=subscriptionPlans[planId];
           plan.receivingAddress=receivingAddress;
           plan.receiveChainId=receiveChainId;
           subscriptionPlans[planId]=plan;
          emit PlanChanged(planId, plan.price, plan.chargeInterval, plan.tokenAddress, plan.provider, receivingAddress, receiveChainId);

     }


     function deleteSubscription(uint256 planId)planExists(planId) isPlanProvider(planId, msg.sender) public {
          subscriptionPlans[planId].deleted=true;
          emit PlanDeleted(planId);
     }

     function subscribe(uint256 planId,uint256 duration )public{
          //checkif account is a erc6900 account, install plugin by calling smart contract account(use init data and manifest hash from the plugin)
          if(msg.sender.code.length==0){
               revert("Account is not of smart contract type");
          }
          if(isSubscribedToPlan(planId, msg.sender)){
               revert("User already subscribed to plan");
          }

          assert(isPluginInstalled(sessionKeyPluginAddr, msg.sender));
          SubscriptionPlan memory plan=subscriptionPlans[planId];
          bool isSessionAllowed=sessionKeyPlugin.isSessionKeyOf(msg.sender,address(this));
          if(!isSessionAllowed){
               revert("User has not given sesssion permission to contract");
          }
          uint256 totalTokenAllowance= (sessionKeyPlugin.getERC20SpendLimitInfo(msg.sender, address(this), plan.tokenAddress)).limit;
          uint256 tokenSpendLimitValue=tokenSpendLimitValues[msg.sender][plan.tokenAddress].limitValue;
          assert(tokenSpendLimitValue+plan.price<=totalTokenAllowance);
          tokenSpendLimitValues[msg.sender][plan.tokenAddress].limitValue=tokenSpendLimitValue+plan.price;
          // if(){
          //      //use update gotten from spendLimit of managercontract Info to update the session key

          //      sessionKeyPlugin.updateKeyPermissions(sessionKey, updates);

          // }else{

          // } DO OFFCHAIN

          UserSubscription memory userSubscription=UserSubscription({startTime:block.timestamp,endTime:block.timestamp+duration,isActive:true,lastChargeDate:0});
          subscriptionStatuses[msg.sender][planId]=userSubscription;
          emit PlanSubscribed(planId, msg.sender);
     }

     function isPluginInstalled(address pluginAddr,address userAddr)public view returns(bool){
          IAccountLoupe accountLoupe=IAccountLoupe(userAddr);
          address[] memory installedPlugins= accountLoupe.getInstalledPlugins();
          return addressInArray(pluginAddr, installedPlugins);
     }

     function addressInArray(address findAddress,address[] memory addressArray)private pure returns(bool){
          for (uint i = 0; i < addressArray.length; i++) {
               if (addressArray[i] == findAddress) {
               return true;
               }
          }

          return false;
     }

     function unsubscribe(uint256 planId)public{
          if(msg.sender.code.length==0){
               revert("Account is not of smart contract type");
          }
          if(!isSubscribedToPlan(planId, msg.sender)){
               revert("User not subscribed to plan");
          }
          SubscriptionPlan memory plan=subscriptionPlans[planId];
          uint256 tokenSpendLimitValue=tokenSpendLimitValues[msg.sender][plan.tokenAddress].limitValue;
          tokenSpendLimitValues[msg.sender][plan.tokenAddress].limitValue=tokenSpendLimitValue-plan.price;
          subscriptionStatuses[msg.sender][planId].isActive=false;
          emit PlanUnsubscribed(planId, msg.sender);
     }


     function isSubscribedToPlan(uint256 planId,address subscriber)public view returns(bool){
          return subscriptionStatuses[subscriber][planId].isActive;
     }

     function charge(uint256 planId,address subscriber)public{
          SubscriptionPlan memory plan=subscriptionPlans[planId]; 
          UserSubscription memory userSubscription=subscriptionStatuses[subscriber][planId];
          if(!isSubscribedToPlan(planId, subscriber)){
               revert("User not subscribed to plan");
          }
          if(plan.deleted==true){
               revert("Subscription has been deleted");
          }

          assert(plan.chargeInterval+userSubscription.lastChargeDate<=block.timestamp);
          assert(userSubscription.startTime>=block.timestamp);
          assert(userSubscription.endTime<=block.timestamp);

          bool isSessionAllowed=sessionKeyPlugin.isSessionKeyOf(msg.sender,address(this));
          if(!isSessionAllowed){
               revert("User has not given sesssion permission to contract");
          }
          uint256 totalTokenAllowance= (sessionKeyPlugin.getERC20SpendLimitInfo(msg.sender, address(this), plan.tokenAddress)).limit;
          assert(plan.price<=totalTokenAllowance);

          //execute transfer to this contract with session key
          Call[] memory calls = new Call[](1);
          bytes memory callData=abi.encodeCall(IERC20.transfer, (address(this), plan.price));
          calls[0] = Call({target: plan.tokenAddress, value: 0, data: callData});
          sessionKeyPlugin.executeWithSessionKey(calls, address(this));
          if(plan.receiveChainId==currentChainId){
               IERC20(plan.tokenAddress).transfer(plan.receivingAddress, plan.price);
          }else{
               //use CCIP for token transfer instead
          }

          emit SubscriptionCharged(planId, subscriber);
     }


}