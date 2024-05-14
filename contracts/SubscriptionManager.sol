// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import {IAccount} from "./interfaces/IAccount.sol";
import {ISessionKeyPlugin} from "./interfaces/ISessionKeyPlugin.sol";
import {IPluginManager} from "./interfaces/IPluginManager.sol";



contract SubscriptionManager{
     uint256 numSubscriptionPlans;
     ISessionKeyPlugin public immutable sessionKeyPluginAddr;
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


     mapping (uint256 => SubscriptionPlan) subscriptionPlans;
     mapping(address=> mapping(uint256=>UserSubscription)) subscriptionStatuses;

     event PlanCreated(uint256 planId,uint256 price,uint256 chargeInterval,address tokenAddress,address provider,address receivingAddress);
     event PlanChanged(uint256 planId,uint256 price,uint256 chargeInterval,address tokenAddress,address provider,address receivingAddress);
     event PlanDeleted(uint256 planId);
     event PlanSubscribed(uint256 planId,address indexed subscriber);
     event PlanUnsubscribed(uint256 planId,address indexed subscriber);
     event SubscriptionCharged(uint256 planId,address indexed subscriber);

     constructor(){

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
          emit PlanCreated(numSubscriptionPlans, price, chargeInterval, tokenAddress, provider, receivingAddress);
          numSubscriptionPlans++;
     }

     function changeSubscriptionPlanPaymentInfo(uint256 planId, uint256 price, address tokenAddress)planExists(planId) isPlanProvider(planId, msg.sender) public {
          //To-Do(Might not be possible)

     }


     function deleteSubscription(uint256 planId)planExists(planId) isPlanProvider(planId, msg.sender) public {
          subscriptionPlans[planId].deleted=true;
          emit PlanDeleted(planId);
     }

     function subscribe(uint256 planId )public{
          //checkif account is a erc6900 account, install plugin by calling smart contract account(use init data and manifest hash from the plugin)

          if(msg.sender.code.length==0){
               revert("Account is not of smart contract type");
          }




          emit PlanSubscribed(planId, msg.sender);

     }

     function unsubscribe(uint256 planId)public{

          emit PlanUnsubscribed(planId, msg.sender);
     }


     function isSubscribedToPlan(uint256 planId,address subscriber)public view returns(bool){
          return subscriptionStatuses[subscriber][planId].isActive;
     }

     function charge(uint256 planId,address subscriber)public{
          if(!isSubscribedToPlan(planId, subscriber)){
               revert("User not subscribed to plan");
          }
          if(subscriptionPlans[planId].deleted==true){
               revert("Subscription has been deleted");
          }

          //execute transfer with session key

          emit SubscriptionCharged(planId, subscriber);
     }


}