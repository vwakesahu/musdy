// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockERC20Permit} from "../../src/mocks/MockERC20Permit.sol";
import {MockPoolFactory} from "../../src/mocks/MockPoolFactory.sol";
import {MockRouter} from "../../src/mocks/MockRouter.sol";
import {MockPool} from "../../src/mocks/MockPool.sol";
import {MusdyLaunchpad} from "../../src/MusdyLaunchpad.sol";
import {MusdyToken} from "../../src/MusdyToken.sol";
import {IMusdyLaunchpad} from "../../src/interfaces/IMusdyLaunchpad.sol";

contract CurveHandler is Test {
    MusdyLaunchpad public lp;
    MockERC20Permit public musd;
    MockPoolFactory public factory;
    address[] public tokens;
    address internal attacker = address(0x0BAD);
    address[3] internal traders = [address(0x1001), address(0x1002), address(0x1003)];

    bool public priceViolated;
    bool public graduatedTradeSucceeded;
    bool public graduatedWrongError;
    bool public foreignBuySucceeded;
    bool public foreignBuyWrongError;
    bool public preGraduationMint;
    uint256 public seeds;
    mapping(address => int256) public ghostMusd;

    modifier track(uint256 tSeed) {
        address t = tokens[tSeed % tokens.length];
        uint256 b0 = musd.balanceOf(address(lp));
        _;
        ghostMusd[t] += int256(musd.balanceOf(address(lp))) - int256(b0);
    }

    constructor(MusdyLaunchpad lp_, MockERC20Permit musd_, MockPoolFactory factory_) {
        lp = lp_;
        musd = musd_;
        factory = factory_;
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

    function _graduatedRevert(bytes memory err) internal {
        if (bytes4(err) != IMusdyLaunchpad.AlreadyGraduated.selector) graduatedWrongError = true;
    }

    function _poolOf(address t) internal returns (address pool) {
        pool = factory.getPool(t, address(musd), false);
        if (pool == address(0)) pool = factory.createPool(t, address(musd), false);
    }

    function _price(address t) internal view returns (uint256) {
        IMusdyLaunchpad.Curve memory c = lp.curveOf(t);
        return c.virtualMusd * 1e18 / c.virtualToken;
    }

    function buy(uint256 tSeed, uint256 who, uint256 amount, uint256 toSeed, address randomTo) external track(tSeed) {
        address t = tokens[tSeed % tokens.length];
        address trader = traders[who % 3];
        amount = bound(amount, 1e15, 3000e18);
        musd.mint(trader, amount);
        uint256 mode = toSeed % 3;
        address to = mode == 0 ? trader : mode == 1 ? _poolOf(t) : randomTo;
        if (to != trader) {
            vm.prank(trader);
            try lp.buy(t, amount, 0, to) {
                foreignBuySucceeded = true;
            } catch (bytes memory err) {
                if (bytes4(err) != IMusdyLaunchpad.BadRecipient.selector) foreignBuyWrongError = true;
            }
            return;
        }
        if (!lp.isCurve(t)) {
            vm.prank(trader);
            try lp.buy(t, amount, 0, trader) {
                graduatedTradeSucceeded = true;
            } catch (bytes memory err) {
                _graduatedRevert(err);
            }
            return;
        }
        uint256 p0 = _price(t);
        vm.prank(trader);
        lp.buy(t, amount, 0, trader);
        if (lp.isCurve(t) && _price(t) <= p0) priceViolated = true;
    }

    function sell(uint256 tSeed, uint256 who, uint256 frac) external track(tSeed) {
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
            } catch (bytes memory err) {
                _graduatedRevert(err);
            }
            vm.stopPrank();
            return;
        }
        uint256 p0 = _price(t);
        lp.sell(t, amount, 0, trader);
        vm.stopPrank();
        if (_price(t) >= p0) priceViolated = true;
    }

    function seedPool(uint256 tSeed, uint256 amount, bool doSync) external {
        address t = tokens[tSeed % tokens.length];
        address pool = _poolOf(t);
        amount = bound(amount, 1, 10_000e18);
        bool live = lp.isCurve(t);
        musd.mint(attacker, amount);
        vm.startPrank(attacker);
        musd.transfer(pool, amount);
        if (doSync) MockPool(pool).sync();
        try MockPool(pool).mint(attacker) {
            if (live) preGraduationMint = true;
        } catch {}
        vm.stopPrank();
        ++seeds;
    }
}

contract CurveInvariantTest is Test {
    MusdyLaunchpad internal lp;
    MockERC20Permit internal musd;
    MockPoolFactory internal factory;
    CurveHandler internal handler;

    function setUp() public {
        musd = new MockERC20Permit("Mezo USD", "MUSD");
        factory = new MockPoolFactory();
        MockRouter router = new MockRouter(address(factory));
        lp = new MusdyLaunchpad(address(musd), address(router), 1500e18, address(this));
        handler = new CurveHandler(lp, musd, factory);
        targetContract(address(handler));
    }

    function invariant_curve_realMusdBackedPerToken() public view {
        uint256 held = musd.balanceOf(address(lp));
        uint256 sum;
        for (uint256 i; i < handler.tokenCount(); ++i) {
            address t = handler.tokens(i);
            IMusdyLaunchpad.Curve memory c = lp.curveOf(t);
            int256 ghost = handler.ghostMusd(t);
            assertGe(ghost, 0);
            if (c.graduated) {
                assertEq(ghost, 0);
                continue;
            }
            assertEq(uint256(ghost), c.realMusd);
            assertLe(c.realMusd, held);
            sum += c.realMusd;
        }
        assertEq(sum, held);
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
        assertFalse(handler.graduatedWrongError());
    }

    function invariant_curve_buyOnlyToBuyer() public view {
        assertFalse(handler.foreignBuySucceeded());
        assertFalse(handler.foreignBuyWrongError());
    }

    function invariant_curve_graduationLpLocked() public view {
        assertFalse(handler.preGraduationMint());
        for (uint256 i; i < handler.tokenCount(); ++i) {
            address t = handler.tokens(i);
            IMusdyLaunchpad.Curve memory c = lp.curveOf(t);
            address pool = factory.getPool(t, address(musd), false);
            if (!c.graduated) {
                if (pool != address(0)) assertEq(MockPool(pool).totalSupply(), 0);
                continue;
            }
            MockPool p = MockPool(c.pool);
            assertEq(p.balanceOf(lp.DEAD()) + p.MINIMUM_LIQUIDITY(), p.totalSupply());
        }
    }
}
