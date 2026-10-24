// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";

// writes one chain's Deployment into shared/deployments.json, keeping the other chain keys
abstract contract DeploymentWriter is Script {
    struct TokenEntry {
        address addr;
        string symbol;
        string name;
        string kind;
    }

    struct Addrs {
        address vault;
        address launchpad;
        address musd;
        address btc;
        address router;
        address factory;
        uint256 startBlock;
    }

    function _path() internal view returns (string memory) {
        return string.concat(vm.projectRoot(), "/../shared/deployments.json");
    }

    function _write(Addrs memory a, TokenEntry[] memory tokens) internal {
        string memory chainKey = vm.toString(block.chainid);
        string[] memory tokenJson = new string[](tokens.length);
        for (uint256 i; i < tokens.length; ++i) {
            string memory k = string.concat("token", vm.toString(i));
            vm.serializeAddress(k, "address", tokens[i].addr);
            vm.serializeString(k, "symbol", tokens[i].symbol);
            vm.serializeString(k, "name", tokens[i].name);
            vm.serializeUint(k, "decimals", 18);
            tokenJson[i] = vm.serializeString(k, "kind", tokens[i].kind);
        }
        string memory d = "deployment";
        vm.serializeUint(d, "chainId", block.chainid);
        vm.serializeAddress(d, "vault", a.vault);
        vm.serializeAddress(d, "launchpad", a.launchpad);
        vm.serializeAddress(d, "musd", a.musd);
        vm.serializeAddress(d, "btc", a.btc);
        vm.serializeAddress(d, "router", a.router);
        vm.serializeAddress(d, "factory", a.factory);
        vm.serializeUint(d, "startBlock", a.startBlock);
        string memory deployment = vm.serializeString(d, "tokens", tokenJson);

        string memory root = "root";
        string memory path = _path();
        vm.serializeJson(root, vm.exists(path) ? vm.readFile(path) : "{}");
        vm.writeJson(vm.serializeString(root, chainKey, deployment), path);
    }
}
