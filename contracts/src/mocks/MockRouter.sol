// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IMezoRouter, IMezoPoolFactory, IMezoPool} from "../interfaces/IMezoPools.sol";
import {MockPool} from "./MockPool.sol";

// aerodrome shaped router over MockPoolFactory, constant product with 0.3% fee
contract MockRouter is IMezoRouter {
    using SafeERC20 for IERC20;

    address public immutable defaultFactory;

    error Expired();
    error NoPool();
    error InsufficientOutput();
    error InsufficientAmount();
    error InvalidPath();

    constructor(address factory_) {
        defaultFactory = factory_;
    }

    modifier ensure(uint256 deadline) {
        if (block.timestamp > deadline) revert Expired();
        _;
    }

    function getAmountsOut(uint256 amountIn, Route[] calldata routes) public view returns (uint256[] memory amounts) {
        if (routes.length == 0) revert InvalidPath();
        amounts = new uint256[](routes.length + 1);
        amounts[0] = amountIn;
        for (uint256 i; i < routes.length; ++i) {
            address pool = _pool(routes[i]);
            (uint256 rIn, uint256 rOut) = _reserves(pool, routes[i].from);
            amounts[i + 1] = getAmountOut(amounts[i], rIn, rOut);
        }
    }

    function getAmountOut(uint256 amountIn, uint256 rIn, uint256 rOut) public pure returns (uint256) {
        if (rIn == 0 || rOut == 0) return 0;
        uint256 inWithFee = amountIn * 997;
        return inWithFee * rOut / (rIn * 1000 + inWithFee);
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        Route[] calldata routes,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        amounts = getAmountsOut(amountIn, routes);
        if (amounts[amounts.length - 1] < amountOutMin) revert InsufficientOutput();
        IERC20(routes[0].from).safeTransferFrom(msg.sender, _pool(routes[0]), amountIn);
        for (uint256 i; i < routes.length; ++i) {
            address pool = _pool(routes[i]);
            address dest = i + 1 < routes.length ? _pool(routes[i + 1]) : to;
            uint256 out = amounts[i + 1];
            bool zeroIn = routes[i].from == IMezoPool(pool).token0();
            MockPool(pool).swap(zeroIn ? 0 : out, zeroIn ? out : 0, dest);
        }
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        bool stable,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        address pool = IMezoPoolFactory(defaultFactory).getPool(tokenA, tokenB, stable);
        if (pool == address(0)) pool = IMezoPoolFactory(defaultFactory).createPool(tokenA, tokenB, stable);
        (amountA, amountB) = _optimal(pool, tokenA, amountADesired, amountBDesired);
        if (amountA < amountAMin || amountB < amountBMin) revert InsufficientAmount();
        liquidity = _fund(pool, tokenA, tokenB, amountA, amountB, to);
    }

    function _fund(address pool, address tokenA, address tokenB, uint256 amountA, uint256 amountB, address to)
        private
        returns (uint256)
    {
        IERC20(tokenA).safeTransferFrom(msg.sender, pool, amountA);
        IERC20(tokenB).safeTransferFrom(msg.sender, pool, amountB);
        return MockPool(pool).mint(to);
    }

    function _optimal(address pool, address tokenA, uint256 aDesired, uint256 bDesired)
        private
        view
        returns (uint256, uint256)
    {
        (uint256 rA, uint256 rB) = _reserves(pool, tokenA);
        if (rA == 0 && rB == 0) return (aDesired, bDesired);
        uint256 bOptimal = aDesired * rB / rA;
        if (bOptimal <= bDesired) return (aDesired, bOptimal);
        return (bDesired * rA / rB, bDesired);
    }

    function _pool(Route calldata r) private view returns (address pool) {
        pool = IMezoPoolFactory(r.factory == address(0) ? defaultFactory : r.factory).getPool(r.from, r.to, r.stable);
        if (pool == address(0)) revert NoPool();
    }

    function _reserves(address pool, address tokenIn) private view returns (uint256 rIn, uint256 rOut) {
        (uint256 r0, uint256 r1,) = IMezoPool(pool).getReserves();
        (rIn, rOut) = tokenIn == IMezoPool(pool).token0() ? (r0, r1) : (r1, r0);
    }
}
