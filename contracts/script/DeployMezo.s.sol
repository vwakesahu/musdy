// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {DeploymentWriter} from "./DeploymentWriter.sol";
import {MusdyLaunchpad} from "../src/MusdyLaunchpad.sol";
import {MusdyVault} from "../src/MusdyVault.sol";
import {IMezoRouter} from "../src/interfaces/IMezoPools.sol";

// mezo testnet: launchpad and vault against the real router, MUSD and BTC from shared/chains.ts
contract DeployMezo is DeploymentWriter {
    address internal constant ROUTER = 0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9;
    address internal constant MUSD = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    address internal constant BTC = 0x7b7C000000000000000000000000000000000000;

    error WrongChain();

    function run() external {
        if (block.chainid != 31611) revert WrongChain();
        uint256 key = vm.envUint("DEPLOYER_KEY");
        address deployer = vm.addr(key);
        address factory = IMezoRouter(ROUTER).defaultFactory();
        uint256 startBlock = block.number;
        vm.startBroadcast(key);
        MusdyLaunchpad launchpad = new MusdyLaunchpad(MUSD, ROUTER, 1500e18, deployer);
        MusdyVault vault = new MusdyVault(MUSD, BTC, ROUTER, address(launchpad), deployer, 50, deployer);
        vm.stopBroadcast();

        TokenEntry[] memory tokens = new TokenEntry[](6);
        tokens[0] = TokenEntry(MUSD, "MUSD", "Mezo USD", "musd");
        tokens[1] = TokenEntry(BTC, "BTC", "Bitcoin", "btc");
        tokens[2] = TokenEntry(0x0dd342913752311E88BBfb0184E3f55FAeFc866a, "NVDA", "NVIDIA", "stock");
        tokens[3] = TokenEntry(0x012296B64995A9E3dB50249AFdB409a9954b1457, "GOOGL", "Alphabet", "stock");
        tokens[4] = TokenEntry(0x7AdC67AB18eFa1Ce921e4054C01C5A8E8699375D, "TSLA", "Tesla", "stock");
        tokens[5] = TokenEntry(0xdd8Bf5ACa0579bEE7e6cd20AC7683E279a5f7d48, "mT", "Threshold", "other");
        _write(Addrs(address(vault), address(launchpad), MUSD, BTC, ROUTER, factory, startBlock), tokens);
    }
}
