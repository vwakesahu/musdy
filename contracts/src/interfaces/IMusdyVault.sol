// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IMusdyVault {
    // eip712 domain: name "musdy", version "1"
    struct Trade {
        address user;
        address token;
        bool isBuy;
        uint256 amountIn;
        uint256 minOut;
        address ref;
        uint256 nonce;
        uint256 deadline;
    }

    struct Withdraw {
        address user;
        address token;
        uint256 amount;
        address to;
        uint256 nonce;
        uint256 deadline;
    }

    struct Launch {
        address user;
        string name;
        string symbol;
        string image;
        uint256 initialBuy;
        uint256 nonce;
        uint256 deadline;
    }

    enum Venue {
        Pool,
        Curve
    }

    event Deposited(address indexed user, address indexed token, uint256 amount);
    event Withdrawn(address indexed user, address indexed token, uint256 amount, address to);
    event Traded(
        address indexed user,
        address indexed token,
        bool isBuy,
        uint256 musdAmount,
        uint256 tokenAmount,
        uint256 fee,
        address indexed ref,
        Venue venue
    );
    event Launched(address indexed user, address indexed token);
    event FeeSet(address feeRecipient, uint16 feeBps);

    error BadSignature();
    error BadNonce();
    error Expired();
    error Insufficient();
    error NoRoute();
    error Slippage();
    error ZeroAmount();
    error FeeTooHigh();
    error BadRecipient();
    error UnsupportedToken();

    function MUSD() external view returns (address);
    function BTC() external view returns (address);
    function router() external view returns (address);
    function factory() external view returns (address);
    function launchpad() external view returns (address);
    function feeRecipient() external view returns (address);
    function feeBps() external view returns (uint16);

    function balanceOf(address user, address token) external view returns (uint256);
    function nonces(address user) external view returns (uint256);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function hashTrade(Trade calldata t) external view returns (bytes32);
    function hashWithdraw(Withdraw calldata w) external view returns (bytes32);
    function hashLaunch(Launch calldata l) external view returns (bytes32);

    function deposit(address token, uint256 amount, address onBehalfOf) external;
    function depositWithPermit(
        address owner,
        address token,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
    function withdraw(address token, uint256 amount, address to) external;

    function executeTrade(Trade calldata t, bytes calldata sig) external returns (uint256 amountOut);
    function executeWithdraw(Withdraw calldata w, bytes calldata sig) external;
    function executeLaunch(Launch calldata l, bytes calldata sig) external returns (address token, uint256 tokensOut);

    function quote(address token, bool isBuy, uint256 amountIn) external view returns (uint256 amountOut, uint256 fee);
    function setFee(address recipient, uint16 bps) external;
}
