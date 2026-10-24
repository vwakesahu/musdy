// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {DeploymentWriter} from "./DeploymentWriter.sol";
import {MockERC20Permit} from "../src/mocks/MockERC20Permit.sol";
import {MockBtcPermit} from "../src/mocks/MockBtcPermit.sol";
import {MockPoolFactory} from "../src/mocks/MockPoolFactory.sol";
import {MockRouter} from "../src/mocks/MockRouter.sol";
import {MusdyLaunchpad} from "../src/MusdyLaunchpad.sol";
import {MusdyVault} from "../src/MusdyVault.sol";

// anvil only: mocks, seeded MUSD pools at testnet like prices, launchpad, vault, faucet MUSD
contract DeployLocal is DeploymentWriter {
    uint256 internal constant ANVIL_0 = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    address internal constant FAUCET = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    MockERC20Permit internal musd;
    MockRouter internal router;
    address internal deployer;

    function run() external {
        uint256 key = vm.envOr("DEPLOYER_KEY", ANVIL_0);
        deployer = vm.addr(key);
        uint256 startBlock = block.number;
        vm.startBroadcast(key);

        musd = new MockERC20Permit("Mezo USD", "MUSD");
        // BTC copies the precompile permit (domain "BTC", nonce(owner)) so the web permit path works locally
        MockBtcPermit btc = new MockBtcPermit();
        MockERC20Permit nvda = new MockERC20Permit("NVIDIA", "NVDA");
        MockERC20Permit tsla = new MockERC20Permit("Tesla", "TSLA");
        MockERC20Permit googl = new MockERC20Permit("Alphabet", "GOOGL");
        MockPoolFactory factory = new MockPoolFactory();
        router = new MockRouter(address(factory));

        _seed(MockERC20Permit(address(btc)), 100e18, 78_700);
        _seed(nvda, 20_000e18, 151);
        _seed(tsla, 7_000e18, 431);
        _seed(googl, 9_000e18, 333);

        MusdyLaunchpad launchpad = new MusdyLaunchpad(address(musd), address(router), 1500e18, deployer);
        MusdyVault vault = new MusdyVault(address(musd), address(router), address(launchpad), deployer, 50, deployer);
        musd.mint(FAUCET, 1_000_000e18);
        vm.stopBroadcast();

        TokenEntry[] memory tokens = new TokenEntry[](5);
        tokens[0] = TokenEntry(address(musd), "MUSD", "Mezo USD", "musd");
        tokens[1] = TokenEntry(address(btc), "BTC", "Bitcoin", "btc");
        tokens[2] = TokenEntry(address(nvda), "NVDA", "NVIDIA", "stock");
        tokens[3] = TokenEntry(address(tsla), "TSLA", "Tesla", "stock");
        tokens[4] = TokenEntry(address(googl), "GOOGL", "Alphabet", "stock");
        _write(
            Addrs(
                address(vault),
                address(launchpad),
                address(musd),
                address(btc),
                address(router),
                address(factory),
                startBlock
            ),
            tokens
        );
    }

    function _seed(MockERC20Permit token, uint256 tokenAmt, uint256 price) internal {
        uint256 musdAmt = tokenAmt * price;
        token.mint(deployer, tokenAmt);
        musd.mint(deployer, musdAmt);
        token.approve(address(router), tokenAmt);
        musd.approve(address(router), musdAmt);
        router.addLiquidity(
            address(token), address(musd), false, tokenAmt, musdAmt, 0, 0, deployer, block.timestamp + 600
        );
    }
}
