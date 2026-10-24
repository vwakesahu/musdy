// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IMusdyLaunchpad {
    struct Curve {
        address creator;
        uint256 virtualMusd;
        uint256 virtualToken;
        uint256 realMusd;
        uint256 tokensSold;
        bool graduated;
        address pool;
    }

    event TokenCreated(address indexed token, address indexed creator, string name, string symbol, string image);
    event CurveTrade(
        address indexed token,
        address indexed trader,
        bool isBuy,
        uint256 musdAmount,
        uint256 tokenAmount,
        uint256 virtualMusd,
        uint256 virtualToken
    );
    event Graduated(address indexed token, address indexed pool, uint256 musdLiquidity, uint256 tokenLiquidity);

    error NotCurveToken();
    error AlreadyGraduated();
    error Slippage();
    error ZeroAmount();
    error BadMetadata();

    function MUSD() external view returns (address);
    function TOTAL_SUPPLY() external view returns (uint256);
    function CURVE_SUPPLY() external view returns (uint256);
    function createToken(string calldata name, string calldata symbol, string calldata image, address creator)
        external
        returns (address token);
    function buy(address token, uint256 musdIn, uint256 minTokensOut, address to)
        external
        returns (uint256 tokensOut, uint256 musdUsed);
    function sell(address token, uint256 tokensIn, uint256 minMusdOut, address to) external returns (uint256 musdOut);
    function quoteBuy(address token, uint256 musdIn) external view returns (uint256 tokensOut, uint256 musdUsed);
    function quoteSell(address token, uint256 tokensIn) external view returns (uint256 musdOut);
    function curveOf(address token) external view returns (Curve memory);
    function isCurve(address token) external view returns (bool);
    function isLaunched(address token) external view returns (bool);
}
