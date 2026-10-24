// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockERC20Permit} from "../src/mocks/MockERC20Permit.sol";
import {MockPoolFactory} from "../src/mocks/MockPoolFactory.sol";
import {MockRouter} from "../src/mocks/MockRouter.sol";
import {MusdyLaunchpad} from "../src/MusdyLaunchpad.sol";
import {MusdyVault} from "../src/MusdyVault.sol";
import {IMusdyVault} from "../src/interfaces/IMusdyVault.sol";

abstract contract Base is Test {
    MockERC20Permit internal musd;
    MockERC20Permit internal btc;
    MockERC20Permit internal nvda;
    MockERC20Permit internal stab;
    MockPoolFactory internal factory;
    MockRouter internal router;
    MusdyLaunchpad internal launchpad;
    MusdyVault internal vault;

    address internal owner = makeAddr("owner");
    address internal feeTo = makeAddr("feeTo");
    address internal relayer = makeAddr("relayer");
    uint256 internal aliceKey = 0xA11CE;
    uint256 internal bobKey = 0xB0B;
    address internal alice;
    address internal bob;

    function setUp() public virtual {
        alice = vm.addr(aliceKey);
        bob = vm.addr(bobKey);
        musd = new MockERC20Permit("Mezo USD", "MUSD");
        btc = new MockERC20Permit("Bitcoin", "BTC");
        nvda = new MockERC20Permit("NVIDIA", "NVDA");
        stab = new MockERC20Permit("Stable Thing", "STB");
        factory = new MockPoolFactory();
        router = new MockRouter(address(factory));
        _seed(address(btc), 100e18, 7_870_000e18, false);
        _seed(address(nvda), 10_000e18, 1_510_000e18, false);
        _seed(address(stab), 1_000_000e18, 1_000_000e18, true);
        launchpad = new MusdyLaunchpad(address(musd), address(router), 1500e18, owner);
        vault = new MusdyVault(address(musd), address(router), address(launchpad), feeTo, 50, owner);
    }

    function _seed(address token, uint256 tokenAmt, uint256 musdAmt, bool stable) internal {
        MockERC20Permit(token).mint(address(this), tokenAmt);
        musd.mint(address(this), musdAmt);
        MockERC20Permit(token).approve(address(router), tokenAmt);
        musd.approve(address(router), musdAmt);
        router.addLiquidity(token, address(musd), stable, tokenAmt, musdAmt, 0, 0, address(this), block.timestamp);
    }

    function _fund(address user, uint256 amount) internal {
        musd.mint(user, amount);
        vm.startPrank(user);
        musd.approve(address(vault), amount);
        vault.deposit(address(musd), amount, user);
        vm.stopPrank();
    }

    function _sign(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _trade(address user, address token, bool isBuy, uint256 amountIn, uint256 minOut, address ref)
        internal
        view
        returns (IMusdyVault.Trade memory t)
    {
        t = IMusdyVault.Trade({
            user: user,
            token: token,
            isBuy: isBuy,
            amountIn: amountIn,
            minOut: minOut,
            ref: ref,
            nonce: vault.nonces(user),
            deadline: block.timestamp + 60
        });
    }

    function _execTrade(uint256 key, IMusdyVault.Trade memory t) internal returns (uint256) {
        bytes memory sig = _sign(key, vault.hashTrade(t));
        vm.prank(relayer);
        return vault.executeTrade(t, sig);
    }

    function _launch(address user, string memory name, uint256 initialBuy)
        internal
        view
        returns (IMusdyVault.Launch memory l)
    {
        l = IMusdyVault.Launch({
            user: user,
            name: name,
            symbol: "MEME",
            image: "https://x.test/a.png",
            initialBuy: initialBuy,
            nonce: vault.nonces(user),
            deadline: block.timestamp + 60
        });
    }

    function _execLaunch(uint256 key, IMusdyVault.Launch memory l) internal returns (address, uint256) {
        bytes memory sig = _sign(key, vault.hashLaunch(l));
        vm.prank(relayer);
        return vault.executeLaunch(l, sig);
    }
}
