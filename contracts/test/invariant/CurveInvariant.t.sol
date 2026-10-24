// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockERC20Permit} from "../../src/mocks/MockERC20Permit.sol";
import {MockPoolFactory} from "../../src/mocks/MockPoolFactory.sol";
import {MockRouter} from "../../src/mocks/MockRouter.sol";
import {MusdyLaunchpad} from "../../src/MusdyLaunchpad.sol";
import {MusdyToken} from "../../src/MusdyToken.sol";
import {IMusdyLaunchpad} from "../../src/interfaces/IMusdyLaunchpad.sol";

contract CurveHandler is Test {
    MusdyLaunchpad public lp;
    MockERC20Permit public musd;
    address[] public tokens;
    address[3] internal traders = [address(0x1001), address(0x1002), address(0x1003)];

    bool public priceViolated;
    bool public graduatedTradeSucceeded;

    constructor(MusdyLaunchpad lp_, MockERC20Permit musd_) {
        lp = lp_;
        musd = musd_;
        for (uint256 i; i < 2; ++i) {
            tokens.push(lp.createToken("Coin", "C", "", address(this)));
        }
        for (uint256 i; i < 3; ++i) {
            vm.prank(traders[i]);
            musd.approve(address(lp), type(uint256).max);
        }
    }

    function createToken(uint256 who) external {
        if (tokens.length >= 12) return;
        address creator = traders[who % 3];
        vm.prank(creator);
        tokens.push(lp.createToken("Coin", "C", "", creator));
    }

    function tokenCount() external view returns (uint256) {
        return tokens.length;
    }

    function _price(address t) internal view returns (uint256) {
        IMusdyLaunchpad.Curve memory c = lp.curveOf(t);
        return c.virtualMusd * 1e18 / c.virtualToken;
    }

    function buy(uint256 tSeed, uint256 who, uint256 amount) external {
        address t = tokens[tSeed % tokens.length];
        address trader = traders[who % 3];
        amount = bound(amount, 1e15, 3000e18);
        musd.mint(trader, amount);
        if (!lp.isCurve(t)) {
            vm.prank(trader);
            try lp.buy(t, amount, 0, trader) {
                graduatedTradeSucceeded = true;
            } catch {}
            return;
        }
        uint256 p0 = _price(t);
        vm.prank(trader);
        lp.buy(t, amount, 0, trader);
        if (lp.isCurve(t) && _price(t) <= p0) priceViolated = true;
    }

    function sell(uint256 tSeed, uint256 who, uint256 frac) external {
        address t = tokens[tSeed % tokens.length];
        address trader = traders[who % 3];
        uint256 bal = MusdyToken(t).balanceOf(trader);
        uint256 amount = bal * bound(frac, 1, 100) / 100;
        if (amount == 0) return;
        vm.startPrank(trader);
        MusdyToken(t).approve(address(lp), amount);
        if (!lp.isCurve(t)) {
            try lp.sell(t, amount, 0, trader) {
                graduatedTradeSucceeded = true;
            } catch {}
            vm.stopPrank();
            return;
        }
        uint256 p0 = _price(t);
        lp.sell(t, amount, 0, trader);
        vm.stopPrank();
        if (_price(t) >= p0) priceViolated = true;
    }
}

contract CurveInvariantTest is Test {
    MusdyLaunchpad internal lp;
    MockERC20Permit internal musd;
    CurveHandler internal handler;

    function setUp() public {
        musd = new MockERC20Permit("Mezo USD", "MUSD");
        MockPoolFactory factory = new MockPoolFactory();
        MockRouter router = new MockRouter(address(factory));
        lp = new MusdyLaunchpad(address(musd), address(router), 1500e18, address(this));
        handler = new CurveHandler(lp, musd);
        targetContract(address(handler));
    }

    function invariant_curve_realMusdMatchesBalance() public view {
        uint256 sum;
        for (uint256 i; i < handler.tokenCount(); ++i) {
            IMusdyLaunchpad.Curve memory c = lp.curveOf(handler.tokens(i));
            if (!c.graduated) sum += c.realMusd;
        }
        assertEq(sum, musd.balanceOf(address(lp)));
    }

    function invariant_curve_tokensSoldBounded() public view {
        for (uint256 i; i < handler.tokenCount(); ++i) {
            address t = handler.tokens(i);
            IMusdyLaunchpad.Curve memory c = lp.curveOf(t);
            assertLe(c.tokensSold, lp.CURVE_SUPPLY());
            if (!c.graduated) assertEq(MusdyToken(t).balanceOf(address(lp)), lp.TOTAL_SUPPLY() - c.tokensSold);
        }
    }

    function invariant_curve_priceDirection() public view {
        assertFalse(handler.priceViolated());
    }

    function invariant_curve_graduatedReverts() public view {
        assertFalse(handler.graduatedTradeSucceeded());
    }
}
