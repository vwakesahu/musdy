// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IMezoPoolFactory} from "../interfaces/IMezoPools.sol";
import {MockPool} from "./MockPool.sol";

contract MockPoolFactory is IMezoPoolFactory {
    mapping(address => mapping(address => mapping(bool => address))) private pools;

    event PoolCreated(address indexed token0, address indexed token1, bool indexed stable, address pool);

    error SameToken();
    error ZeroAddress();
    error PoolExists();

    function getPool(address tokenA, address tokenB, bool stable) external view returns (address) {
        return pools[tokenA][tokenB][stable];
    }

    function createPool(address tokenA, address tokenB, bool stable) external returns (address pool) {
        if (tokenA == tokenB) revert SameToken();
        (address t0, address t1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        if (t0 == address(0)) revert ZeroAddress();
        if (pools[t0][t1][stable] != address(0)) revert PoolExists();
        pool = address(new MockPool(t0, t1, stable));
        pools[t0][t1][stable] = pool;
        pools[t1][t0][stable] = pool;
        emit PoolCreated(t0, t1, stable, pool);
    }
}
