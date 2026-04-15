// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/DropParty.sol";

contract DeployScript is Script {
    function run() external {
        address usdc = 0x3600000000000000000000000000000000000000;

        vm.startBroadcast();
        DropParty dropParty = new DropParty(usdc);
        vm.stopBroadcast();

        console.log("DropParty deployed at:", address(dropParty));
        console.log("USDC address:", address(dropParty.usdc()));
    }
}
