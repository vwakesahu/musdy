// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {IMezoRouter, IMezoPool} from "../src/interfaces/IMezoPools.sol";
import {MockPool} from "../src/mocks/MockPool.sol";
import {MockPoolFactory} from "../src/mocks/MockPoolFactory.sol";

contract MocksTest is Base {
    function _route(address from, address to) internal view returns (IMezoRouter.Route[] memory r) {
        r = new IMezoRouter.Route[](1);
        r[0] = IMezoRouter.Route(from, to, false, address(factory));
    }

    function test_mock_swapMatchesConstantProduct() public {
        address pool = factory.getPool(address(nvda), address(musd), false);
        (uint256 r0, uint256 r1,) = IMezoPool(pool).getReserves();
        bool musdIs0 = IMezoPool(pool).token0() == address(musd);
        (uint256 rIn, uint256 rOut) = musdIs0 ? (r0, r1) : (r1, r0);
        uint256 amountIn = 1000e18;
        uint256 expected = amountIn * 997 * rOut / (rIn * 1000 + amountIn * 997);
        musd.mint(address(this), amountIn);
        musd.approve(address(router), amountIn);
        uint256 before = nvda.balanceOf(alice);
        uint256[] memory amounts = router.swapExactTokensForTokens(
            amountIn, expected, _route(address(musd), address(nvda)), alice, block.timestamp
        );
        assertEq(amounts[1], expected);
        assertEq(nvda.balanceOf(alice) - before, expected);
        (r0, r1,) = IMezoPool(pool).getReserves();
        assertEq(musdIs0 ? r0 : r1, rIn + amountIn);
        assertEq(router.getAmountsOut(amountIn, _route(address(musd), address(nvda)))[1] > 0, true);
    }

    function test_mock_addLiquidityProportional() public {
        address pool = factory.getPool(address(btc), address(musd), false);
        uint256 supply = MockPool(pool).totalSupply();
        btc.mint(address(this), 2e18);
        musd.mint(address(this), 1_000_000e18);
        btc.approve(address(router), 2e18);
        musd.approve(address(router), 1_000_000e18);
        (uint256 a, uint256 b, uint256 liq) =
            router.addLiquidity(address(btc), address(musd), false, 1e18, 1_000_000e18, 0, 0, alice, block.timestamp);
        assertEq(a, 1e18);
        assertEq(b, 78_700e18);
        assertEq(liq, supply / 100);
        assertEq(MockPool(pool).balanceOf(alice), liq);
        (a, b,) = router.addLiquidity(address(btc), address(musd), false, 2e18, 1e18, 0, 0, alice, block.timestamp);
        assertEq(b, 1e18);
        assertApproxEqAbs(a, uint256(1e18) * 1e18 / 78_700e18, 1);
    }

    function test_mock_reverts() public {
        vm.expectRevert(MockPoolFactory.PoolExists.selector);
        factory.createPool(address(musd), address(btc), false);
        vm.expectRevert(MockPoolFactory.SameToken.selector);
        factory.createPool(address(btc), address(btc), false);
        vm.expectRevert(MockPoolFactory.ZeroAddress.selector);
        factory.createPool(address(0), address(btc), false);
        IMezoRouter.Route[] memory r = _route(address(musd), address(alice));
        vm.expectRevert();
        router.getAmountsOut(1e18, r);
        vm.expectRevert();
        router.getAmountsOut(1e18, new IMezoRouter.Route[](0));
        r = _route(address(musd), address(btc));
        vm.expectRevert();
        router.swapExactTokensForTokens(1e18, 0, r, alice, block.timestamp - 1);
        musd.mint(address(this), 1e18);
        musd.approve(address(router), 1e18);
        vm.expectRevert();
        router.swapExactTokensForTokens(1e18, type(uint256).max, r, alice, block.timestamp);
        assertEq(router.getAmountOut(1, 0, 1), 0);
        assertTrue(!MockPool(factory.getPool(address(btc), address(musd), false)).stable());
    }
}
