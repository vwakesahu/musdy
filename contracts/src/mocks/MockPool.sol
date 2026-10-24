// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IMezoPool} from "../interfaces/IMezoPools.sol";

contract MockPool is IMezoPool, ERC20 {
    using SafeERC20 for IERC20;

    uint256 public constant MINIMUM_LIQUIDITY = 1000;

    address public immutable token0;
    address public immutable token1;
    bool public immutable stable;

    uint256 private reserve0;
    uint256 private reserve1;
    uint256 private blockTimestampLast;

    event Mint(address indexed to, uint256 amount0, uint256 amount1, uint256 liquidity);
    event Swap(address indexed to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out);
    event Sync(uint256 reserve0, uint256 reserve1);

    error InsufficientLiquidity();
    error InsufficientInput();
    error K();

    constructor(address token0_, address token1_, bool stable_) ERC20("Mock LP", "MLP") {
        token0 = token0_;
        token1 = token1_;
        stable = stable_;
    }

    function getReserves() external view returns (uint256, uint256, uint256) {
        return (reserve0, reserve1, blockTimestampLast);
    }

    function totalSupply() public view override(ERC20, IMezoPool) returns (uint256) {
        return super.totalSupply();
    }

    function sync() external {
        _update(IERC20(token0).balanceOf(address(this)), IERC20(token1).balanceOf(address(this)));
    }

    function mint(address to) external returns (uint256 liquidity) {
        uint256 bal0 = IERC20(token0).balanceOf(address(this));
        uint256 bal1 = IERC20(token1).balanceOf(address(this));
        uint256 a0 = bal0 - reserve0;
        uint256 a1 = bal1 - reserve1;
        uint256 supply = totalSupply();
        if (supply == 0) {
            liquidity = Math.sqrt(a0 * a1) - MINIMUM_LIQUIDITY;
            _mint(address(1), MINIMUM_LIQUIDITY);
        } else {
            liquidity = Math.min(a0 * supply / reserve0, a1 * supply / reserve1);
        }
        if (liquidity == 0) revert InsufficientLiquidity();
        _mint(to, liquidity);
        _update(bal0, bal1);
        emit Mint(to, a0, a1, liquidity);
    }

    function swap(uint256 amount0Out, uint256 amount1Out, address to) external {
        if (amount0Out >= reserve0 || amount1Out >= reserve1) revert InsufficientLiquidity();
        if (amount0Out > 0) IERC20(token0).safeTransfer(to, amount0Out);
        if (amount1Out > 0) IERC20(token1).safeTransfer(to, amount1Out);
        uint256 bal0 = IERC20(token0).balanceOf(address(this));
        uint256 bal1 = IERC20(token1).balanceOf(address(this));
        uint256 in0 = bal0 > reserve0 - amount0Out ? bal0 - (reserve0 - amount0Out) : 0;
        uint256 in1 = bal1 > reserve1 - amount1Out ? bal1 - (reserve1 - amount1Out) : 0;
        if (in0 == 0 && in1 == 0) revert InsufficientInput();
        uint256 adj0 = bal0 * 1000 - in0 * 3;
        uint256 adj1 = bal1 * 1000 - in1 * 3;
        if (adj0 * adj1 < reserve0 * reserve1 * 1e6) revert K();
        _update(bal0, bal1);
        emit Swap(to, in0, in1, amount0Out, amount1Out);
    }

    function _update(uint256 bal0, uint256 bal1) private {
        reserve0 = bal0;
        reserve1 = bal1;
        blockTimestampLast = block.timestamp;
        emit Sync(bal0, bal1);
    }
}
