// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {MusdyToken} from "../src/MusdyToken.sol";
import {MusdyLaunchpad} from "../src/MusdyLaunchpad.sol";
import {IMusdyLaunchpad} from "../src/interfaces/IMusdyLaunchpad.sol";
import {IMezoPool} from "../src/interfaces/IMezoPools.sol";
import {MockPool} from "../src/mocks/MockPool.sol";

contract LaunchpadTest is Base {
    address internal token;
    address internal dead = 0x000000000000000000000000000000000000dEaD;

    function setUp() public override {
        super.setUp();
        token = launchpad.createToken("Pepe", "PEPE", "https://x.test/p.png", bob);
        musd.mint(alice, 100_000e18);
        vm.prank(alice);
        musd.approve(address(launchpad), type(uint256).max);
    }

    function _buy(address who, uint256 amount) internal returns (uint256 out, uint256 used) {
        vm.prank(who);
        (out, used) = launchpad.buy(token, amount, 0, who);
    }

    function test_launch_createsTokenWithSupplyOnLaunchpad() public {
        vm.expectEmit(false, true, false, true);
        emit IMusdyLaunchpad.TokenCreated(address(0), alice, "Dog", "DOG", "");
        address t = launchpad.createToken("Dog", "DOG", "", alice);
        assertEq(MusdyToken(t).totalSupply(), launchpad.TOTAL_SUPPLY());
        assertEq(MusdyToken(t).balanceOf(address(launchpad)), launchpad.TOTAL_SUPPLY());
        assertEq(MusdyToken(t).decimals(), 18);
        assertEq(MusdyToken(t).image(), "");
        IMusdyLaunchpad.Curve memory c = launchpad.curveOf(t);
        assertEq(c.creator, alice);
        assertEq(c.virtualMusd, 1500e18);
        assertEq(c.virtualToken, 1_073_000_000e18);
        assertTrue(launchpad.isCurve(t));
        assertTrue(launchpad.isLaunched(t));
        assertFalse(launchpad.isLaunched(address(nvda)));
        assertEq(launchpad.MUSD(), address(musd));
        assertEq(launchpad.priceOf(t), uint256(1500e18) * 1e18 / 1_073_000_000e18);
    }

    function test_launch_badMetadata() public {
        vm.expectRevert(IMusdyLaunchpad.BadMetadata.selector);
        launchpad.createToken("", "X", "", alice);
        vm.expectRevert(IMusdyLaunchpad.BadMetadata.selector);
        launchpad.createToken("123456789012345678901234567890123", "X", "", alice);
        vm.expectRevert(IMusdyLaunchpad.BadMetadata.selector);
        launchpad.createToken("A", "", "", alice);
        vm.expectRevert(IMusdyLaunchpad.BadMetadata.selector);
        launchpad.createToken("A", "12345678901", "", alice);
        vm.expectRevert(IMusdyLaunchpad.BadMetadata.selector);
        launchpad.createToken("A", "B", string(new bytes(257)), alice);
        vm.expectRevert(IMusdyLaunchpad.BadMetadata.selector);
        launchpad.createToken("A", "B", "", address(0));
        launchpad.createToken("12345678901234567890123456789012", "1234567890", string(new bytes(256)), alice);
    }

    function test_launch_constructorChecks() public {
        vm.expectRevert(MusdyLaunchpad.ZeroAddress.selector);
        new MusdyLaunchpad(address(0), address(router), 1, owner);
        vm.expectRevert(IMusdyLaunchpad.ZeroAmount.selector);
        new MusdyLaunchpad(address(musd), address(router), 0, owner);
    }

    function test_curve_buy_sell_roundTrip() public {
        uint256 bal0 = musd.balanceOf(alice);
        (uint256 out, uint256 used) = _buy(alice, 100e18);
        assertEq(used, 100e18);
        uint256 k = uint256(1500e18) * 1_073_000_000e18;
        assertApproxEqAbs(out, 1_073_000_000e18 - k / 1600e18, 1);
        assertEq(MusdyToken(token).balanceOf(alice), out);
        IMusdyLaunchpad.Curve memory c = launchpad.curveOf(token);
        assertEq(c.realMusd, 100e18);
        assertEq(c.tokensSold, out);
        assertEq(musd.balanceOf(address(launchpad)), 100e18);
        assertEq(launchpad.quoteSell(token, out), launchpad.quoteSell(token, out));
        vm.startPrank(alice);
        MusdyToken(token).approve(address(launchpad), out);
        uint256 back = launchpad.sell(token, out, 0, alice);
        vm.stopPrank();
        assertLe(back, 100e18);
        assertApproxEqAbs(back, 100e18, 2);
        assertEq(musd.balanceOf(alice), bal0 - 100e18 + back);
        assertEq(launchpad.curveOf(token).tokensSold, 0);
    }

    function test_curve_buy_sell_priceMoves() public {
        uint256 p0 = launchpad.priceOf(token);
        (uint256 out,) = _buy(alice, 500e18);
        uint256 p1 = launchpad.priceOf(token);
        assertGt(p1, p0);
        vm.startPrank(alice);
        MusdyToken(token).approve(address(launchpad), out);
        launchpad.sell(token, out / 2, 0, alice);
        vm.stopPrank();
        assertLt(launchpad.priceOf(token), p1);
    }

    function test_curve_buy_sell_reverts() public {
        vm.expectRevert(IMusdyLaunchpad.ZeroAmount.selector);
        _buy(alice, 0);
        vm.prank(alice);
        vm.expectRevert(IMusdyLaunchpad.Slippage.selector);
        launchpad.buy(token, 1e18, type(uint256).max, alice);
        vm.expectRevert(IMusdyLaunchpad.NotCurveToken.selector);
        launchpad.buy(address(nvda), 1e18, 0, alice);
        vm.expectRevert(IMusdyLaunchpad.NotCurveToken.selector);
        launchpad.priceOf(address(nvda));
        vm.expectRevert(IMusdyLaunchpad.ZeroAmount.selector);
        launchpad.sell(token, 0, 0, alice);
        (uint256 out,) = _buy(alice, 10e18);
        vm.startPrank(alice);
        MusdyToken(token).approve(address(launchpad), out);
        vm.expectRevert(IMusdyLaunchpad.Slippage.selector);
        launchpad.sell(token, out, type(uint256).max, alice);
        vm.expectRevert(IMusdyLaunchpad.Slippage.selector);
        launchpad.sell(token, out + 1, 0, alice);
        vm.stopPrank();
    }

    function test_curve_buy_sell_lockedTransfers() public {
        (uint256 out,) = _buy(alice, 10e18);
        vm.prank(alice);
        vm.expectRevert(MusdyToken.Locked.selector);
        MusdyToken(token).transfer(bob, out);
        vm.expectRevert(MusdyToken.OnlyLaunchpad.selector);
        MusdyToken(token).unlock();
    }

    function test_graduation_capsRefundsAndCreatesPool() public {
        uint256 bal0 = musd.balanceOf(alice);
        (uint256 qOut, uint256 qUsed) = launchpad.quoteBuy(token, 10_000e18);
        vm.expectEmit(true, false, false, false);
        emit IMusdyLaunchpad.Graduated(token, address(0), 0, 0);
        (uint256 out, uint256 used) = _buy(alice, 10_000e18);
        assertEq(out, qOut);
        assertEq(used, qUsed);
        assertEq(out, launchpad.CURVE_SUPPLY());
        assertLt(used, 10_000e18);
        assertApproxEqRel(used, 4250e18, 0.01e18);
        assertEq(musd.balanceOf(alice), bal0 - used);
        IMusdyLaunchpad.Curve memory c = launchpad.curveOf(token);
        assertTrue(c.graduated);
        assertFalse(launchpad.isCurve(token));
        assertEq(c.pool, factory.getPool(token, address(musd), false));
        (uint256 r0, uint256 r1,) = IMezoPool(c.pool).getReserves();
        bool tokenIs0 = IMezoPool(c.pool).token0() == token;
        assertEq(tokenIs0 ? r0 : r1, 206_900_000e18);
        assertEq(tokenIs0 ? r1 : r0, used);
        assertEq(musd.balanceOf(address(launchpad)), 0);
        assertEq(MusdyToken(token).balanceOf(address(launchpad)), 0);
        assertEq(MockPool(c.pool).balanceOf(dead) + 1000, MockPool(c.pool).totalSupply());
        assertEq(musd.allowance(address(launchpad), address(router)), 0);
    }

    function test_graduation_unlocksTransfersAndBlocksCurve() public {
        (uint256 out,) = _buy(alice, 10_000e18);
        vm.prank(alice);
        MusdyToken(token).transfer(bob, out / 2);
        assertEq(MusdyToken(token).balanceOf(bob), out / 2);
        assertTrue(MusdyToken(token).unlocked());
        vm.expectRevert(IMusdyLaunchpad.AlreadyGraduated.selector);
        _buy(alice, 1e18);
        vm.expectRevert(IMusdyLaunchpad.AlreadyGraduated.selector);
        launchpad.sell(token, 1e18, 0, alice);
        vm.expectRevert(IMusdyLaunchpad.AlreadyGraduated.selector);
        launchpad.quoteBuy(token, 1e18);
    }

    function test_graduation_usesExistingPool() public {
        address pool = factory.createPool(token, address(musd), false);
        _buy(alice, 10_000e18);
        assertEq(launchpad.curveOf(token).pool, pool);
    }

    function testFuzz_curve_buyThenSellNeverProfits(uint256 pre, uint256 amount) public {
        pre = bound(pre, 0, 4000e18);
        amount = bound(amount, 1e6, 5000e18);
        musd.mint(bob, pre);
        if (pre > 0) {
            vm.prank(bob);
            musd.approve(address(launchpad), pre);
            _buy(bob, pre);
        }
        if (!launchpad.isCurve(token)) return;
        (uint256 out, uint256 used) = _buy(alice, amount);
        if (!launchpad.isCurve(token)) return;
        vm.startPrank(alice);
        MusdyToken(token).approve(address(launchpad), out);
        uint256 back = launchpad.sell(token, out, 0, alice);
        vm.stopPrank();
        assertLe(back, used);
    }
}
