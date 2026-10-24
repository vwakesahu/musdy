// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IMusdyLaunchpad} from "./interfaces/IMusdyLaunchpad.sol";
import {IMezoRouter, IMezoPoolFactory, IMezoPool} from "./interfaces/IMezoPools.sol";
import {MusdyToken} from "./MusdyToken.sol";

contract MusdyLaunchpad is IMusdyLaunchpad, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant TOTAL_SUPPLY = 1_000_000_000e18;
    uint256 public constant CURVE_SUPPLY = 793_100_000e18;
    uint256 public constant VIRTUAL_TOKEN = 1_073_000_000e18;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    address public immutable MUSD;
    address public immutable router;
    address public immutable factory;
    uint256 public immutable initialVirtualMusd;

    mapping(address => Curve) private curves;

    error ZeroAddress();

    constructor(address musd, address router_, uint256 virtualMusd, address owner_) Ownable(owner_) {
        if (musd == address(0) || router_ == address(0)) revert ZeroAddress();
        if (virtualMusd == 0) revert ZeroAmount();
        MUSD = musd;
        router = router_;
        factory = IMezoRouter(router_).defaultFactory();
        initialVirtualMusd = virtualMusd;
    }

    function createToken(string calldata name, string calldata symbol, string calldata image, address creator)
        external
        nonReentrant
        returns (address token)
    {
        uint256 n = bytes(name).length;
        uint256 s = bytes(symbol).length;
        if (n == 0 || n > 32 || s == 0 || s > 10 || bytes(image).length > 256 || creator == address(0)) {
            revert BadMetadata();
        }
        token = address(new MusdyToken(name, symbol, image, TOTAL_SUPPLY));
        curves[token] = Curve({
            creator: creator,
            virtualMusd: initialVirtualMusd,
            virtualToken: VIRTUAL_TOKEN,
            realMusd: 0,
            tokensSold: 0,
            graduated: false,
            pool: address(0)
        });
        emit TokenCreated(token, creator, name, symbol, image);
    }

    function buy(address token, uint256 musdIn, uint256 minTokensOut, address to)
        external
        nonReentrant
        returns (uint256 tokensOut, uint256 musdUsed)
    {
        // locked tokens may only leave the curve to the buyer itself, never to a pool before graduation
        if (to != msg.sender) revert BadRecipient();
        Curve storage c = _live(token);
        if (musdIn == 0) revert ZeroAmount();
        (tokensOut, musdUsed) = _quoteBuy(c, musdIn);
        if (tokensOut == 0) revert ZeroAmount();
        if (tokensOut < minTokensOut) revert Slippage();
        IERC20(MUSD).safeTransferFrom(msg.sender, address(this), musdUsed);
        c.virtualMusd += musdUsed;
        c.virtualToken -= tokensOut;
        c.realMusd += musdUsed;
        c.tokensSold += tokensOut;
        IERC20(token).safeTransfer(msg.sender, tokensOut);
        emit CurveTrade(token, msg.sender, true, musdUsed, tokensOut, c.virtualMusd, c.virtualToken);
        if (c.tokensSold == CURVE_SUPPLY) _graduate(token, c);
    }

    function sell(address token, uint256 tokensIn, uint256 minMusdOut, address to)
        external
        nonReentrant
        returns (uint256 musdOut)
    {
        // to only receives MUSD, which anyone can already donate to a pool, locked tokens only flow back to the curve
        Curve storage c = _live(token);
        if (tokensIn == 0) revert ZeroAmount();
        musdOut = _quoteSell(c, tokensIn);
        if (musdOut < minMusdOut) revert Slippage();
        IERC20(token).safeTransferFrom(msg.sender, address(this), tokensIn);
        c.virtualMusd -= musdOut;
        c.virtualToken += tokensIn;
        c.realMusd -= musdOut;
        c.tokensSold -= tokensIn;
        IERC20(MUSD).safeTransfer(to, musdOut);
        emit CurveTrade(token, msg.sender, false, musdOut, tokensIn, c.virtualMusd, c.virtualToken);
    }

    function quoteBuy(address token, uint256 musdIn) external view returns (uint256 tokensOut, uint256 musdUsed) {
        return _quoteBuy(_live(token), musdIn);
    }

    function quoteSell(address token, uint256 tokensIn) external view returns (uint256 musdOut) {
        return _quoteSell(_live(token), tokensIn);
    }

    function curveOf(address token) external view returns (Curve memory) {
        return curves[token];
    }

    function isCurve(address token) public view returns (bool) {
        return curves[token].virtualToken != 0 && !curves[token].graduated;
    }

    function isLaunched(address token) public view returns (bool) {
        return curves[token].virtualToken != 0;
    }

    function priceOf(address token) external view returns (uint256) {
        Curve storage c = curves[token];
        if (c.virtualToken == 0) revert NotCurveToken();
        return c.virtualMusd * 1e18 / c.virtualToken;
    }

    function _live(address token) private view returns (Curve storage c) {
        c = curves[token];
        if (c.virtualToken == 0) revert NotCurveToken();
        if (c.graduated) revert AlreadyGraduated();
    }

    function _quoteBuy(Curve storage c, uint256 musdIn) private view returns (uint256 tokensOut, uint256 musdUsed) {
        uint256 vM = c.virtualMusd;
        uint256 vT = c.virtualToken;
        uint256 k = vM * vT;
        tokensOut = vT - Math.ceilDiv(k, vM + musdIn);
        musdUsed = musdIn;
        uint256 remaining = CURVE_SUPPLY - c.tokensSold;
        if (tokensOut > remaining) {
            tokensOut = remaining;
            musdUsed = Math.ceilDiv(k, vT - remaining) - vM;
        }
    }

    function _quoteSell(Curve storage c, uint256 tokensIn) private view returns (uint256) {
        if (tokensIn > c.tokensSold) revert Slippage();
        uint256 vM = c.virtualMusd;
        return vM - Math.ceilDiv(vM * c.virtualToken, c.virtualToken + tokensIn);
    }

    function _graduate(address token, Curve storage c) private {
        c.graduated = true;
        MusdyToken(token).unlock();
        address pool = IMezoPoolFactory(factory).getPool(token, MUSD, false);
        if (pool == address(0)) pool = IMezoPoolFactory(factory).createPool(token, MUSD, false);
        c.pool = pool;
        // no curve token sits in the pool before unlock, so LP supply is zero and all LP above the minimum goes to dEaD
        if (IMezoPool(pool).totalSupply() != 0) revert PoolNotEmpty();
        uint256 musdAmount = c.realMusd;
        uint256 tokenAmount = TOTAL_SUPPLY - CURVE_SUPPLY;
        // fund the pool directly and mint, a pre created pool with donated and synced MUSD can't block this
        IERC20(MUSD).safeTransfer(pool, musdAmount);
        IERC20(token).safeTransfer(pool, tokenAmount);
        IMezoPool(pool).mint(DEAD);
        emit Graduated(token, pool, musdAmount, tokenAmount);
    }
}
