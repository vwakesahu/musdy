// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IMusdyVault} from "./interfaces/IMusdyVault.sol";
import {IMusdyLaunchpad} from "./interfaces/IMusdyLaunchpad.sol";
import {IMezoRouter, IMezoPoolFactory} from "./interfaces/IMezoPools.sol";

// custodial ledger, users sign eip712 actions and anyone relays them
contract MusdyVault is IMusdyVault, EIP712, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant TRADE_TYPEHASH = keccak256(
        "Trade(address user,address token,bool isBuy,uint256 amountIn,uint256 minOut,address ref,uint256 nonce,uint256 deadline)"
    );
    bytes32 public constant WITHDRAW_TYPEHASH =
        keccak256("Withdraw(address user,address token,uint256 amount,address to,uint256 nonce,uint256 deadline)");
    bytes32 public constant LAUNCH_TYPEHASH = keccak256(
        "Launch(address user,string name,string symbol,string image,uint256 initialBuy,uint256 nonce,uint256 deadline)"
    );
    uint16 public constant MAX_FEE_BPS = 100;
    uint256 private constant BPS = 10_000;

    address public immutable MUSD;
    address public immutable router;
    address public immutable factory;
    address public immutable launchpad;
    address public feeRecipient;
    uint16 public feeBps;

    mapping(address => mapping(address => uint256)) public balanceOf;
    mapping(address => uint256) public nonces;

    error ZeroAddress();

    constructor(
        address musd,
        address router_,
        address launchpad_,
        address feeRecipient_,
        uint16 feeBps_,
        address owner_
    ) EIP712("musdy", "1") Ownable(owner_) {
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        if (musd == address(0) || router_ == address(0) || launchpad_ == address(0) || feeRecipient_ == address(0)) {
            revert ZeroAddress();
        }
        MUSD = musd;
        router = router_;
        factory = IMezoRouter(router_).defaultFactory();
        launchpad = launchpad_;
        feeRecipient = feeRecipient_;
        feeBps = feeBps_;
        emit FeeSet(feeRecipient_, feeBps_);
    }

    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function hashTrade(Trade calldata t) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(TRADE_TYPEHASH, t.user, t.token, t.isBuy, t.amountIn, t.minOut, t.ref, t.nonce, t.deadline)
            )
        );
    }

    function hashWithdraw(Withdraw calldata w) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(abi.encode(WITHDRAW_TYPEHASH, w.user, w.token, w.amount, w.to, w.nonce, w.deadline))
        );
    }

    function hashLaunch(Launch calldata l) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    LAUNCH_TYPEHASH,
                    l.user,
                    keccak256(bytes(l.name)),
                    keccak256(bytes(l.symbol)),
                    keccak256(bytes(l.image)),
                    l.initialBuy,
                    l.nonce,
                    l.deadline
                )
            )
        );
    }

    function deposit(address token, uint256 amount, address onBehalfOf) external nonReentrant {
        _pull(token, msg.sender, amount, onBehalfOf);
    }

    function depositWithPermit(
        address owner,
        address token,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        // a front run permit already set the allowance, so only a short allowance is fatal
        try IERC20Permit(token).permit(owner, address(this), amount, deadline, v, r, s) {}
        catch {
            if (IERC20(token).allowance(owner, address(this)) < amount) revert Insufficient();
        }
        _pull(token, owner, amount, owner);
    }

    function withdraw(address token, uint256 amount, address to) external nonReentrant {
        _withdraw(msg.sender, token, amount, to);
    }

    function executeTrade(Trade calldata t, bytes calldata sig) external nonReentrant returns (uint256 amountOut) {
        _use(t.user, t.nonce, t.deadline, hashTrade(t), sig);
        if (t.amountIn == 0) revert ZeroAmount();
        amountOut = t.isBuy ? _buy(t.user, t.token, t.amountIn, t.minOut, t.ref) : _sell(t);
    }

    function executeWithdraw(Withdraw calldata w, bytes calldata sig) external nonReentrant {
        _use(w.user, w.nonce, w.deadline, hashWithdraw(w), sig);
        _withdraw(w.user, w.token, w.amount, w.to);
    }

    function executeLaunch(Launch calldata l, bytes calldata sig)
        external
        nonReentrant
        returns (address token, uint256 tokensOut)
    {
        _use(l.user, l.nonce, l.deadline, hashLaunch(l), sig);
        token = IMusdyLaunchpad(launchpad).createToken(l.name, l.symbol, l.image, l.user);
        emit Launched(l.user, token);
        if (l.initialBuy > 0) tokensOut = _buy(l.user, token, l.initialBuy, 0, address(0));
    }

    function quote(address token, bool isBuy, uint256 amountIn) external view returns (uint256 amountOut, uint256 fee) {
        if (isBuy) {
            fee = _fee(amountIn);
            uint256 net = amountIn - fee;
            if (_onCurve(token)) {
                uint256 used;
                (amountOut, used) = IMusdyLaunchpad(launchpad).quoteBuy(token, net);
                if (used < net) fee = _scaledFee(fee, used, net);
            } else {
                amountOut = _poolQuote(MUSD, token, net);
            }
        } else {
            uint256 gross = _onCurve(token)
                ? IMusdyLaunchpad(launchpad).quoteSell(token, amountIn)
                : _poolQuote(token, MUSD, amountIn);
            fee = _fee(gross);
            amountOut = gross - fee;
        }
    }

    function setFee(address recipient, uint16 bps) external onlyOwner {
        if (bps > MAX_FEE_BPS) revert FeeTooHigh();
        if (recipient == address(0)) revert ZeroAddress();
        feeRecipient = recipient;
        feeBps = bps;
        emit FeeSet(recipient, bps);
    }

    // returns the pool a pool trade of token would use, address(0) when there is none
    function poolFor(address token) public view returns (address pool, bool stable) {
        pool = IMezoPoolFactory(factory).getPool(token, MUSD, false);
        if (pool == address(0)) {
            pool = IMezoPoolFactory(factory).getPool(token, MUSD, true);
            stable = pool != address(0);
        }
    }

    function _buy(address user, address token, uint256 amountIn, uint256 minOut, address ref)
        private
        returns (uint256 tokensOut)
    {
        if (token == MUSD) revert NoRoute();
        _debit(user, MUSD, amountIn);
        uint256 fee = _fee(amountIn);
        uint256 net = amountIn - fee;
        uint256 musdAmount = amountIn;
        Venue venue = Venue.Pool;
        if (_onCurve(token)) {
            venue = Venue.Curve;
            uint256 used;
            IERC20(MUSD).forceApprove(launchpad, net);
            (tokensOut, used) = IMusdyLaunchpad(launchpad).buy(token, net, minOut, address(this));
            IERC20(MUSD).forceApprove(launchpad, 0);
            if (used < net) {
                fee = _scaledFee(fee, used, net);
                musdAmount = used + fee;
                balanceOf[user][MUSD] += amountIn - musdAmount;
            }
        } else {
            tokensOut = _swap(MUSD, token, net, minOut);
        }
        if (tokensOut < minOut) revert Slippage();
        balanceOf[feeRecipient][MUSD] += fee;
        balanceOf[user][token] += tokensOut;
        emit Traded(user, token, true, musdAmount, tokensOut, fee, ref, venue);
    }

    function _sell(Trade calldata t) private returns (uint256 net) {
        if (t.token == MUSD) revert NoRoute();
        _debit(t.user, t.token, t.amountIn);
        uint256 gross;
        Venue venue = Venue.Pool;
        if (_onCurve(t.token)) {
            venue = Venue.Curve;
            IERC20(t.token).forceApprove(launchpad, t.amountIn);
            gross = IMusdyLaunchpad(launchpad).sell(t.token, t.amountIn, 0, address(this));
            IERC20(t.token).forceApprove(launchpad, 0);
        } else {
            gross = _swap(t.token, MUSD, t.amountIn, 0);
        }
        uint256 fee = _fee(gross);
        net = gross - fee;
        if (net < t.minOut) revert Slippage();
        balanceOf[feeRecipient][MUSD] += fee;
        balanceOf[t.user][MUSD] += net;
        emit Traded(t.user, t.token, false, net, t.amountIn, fee, t.ref, venue);
    }

    function _swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut)
        private
        returns (uint256 received)
    {
        IMezoRouter.Route[] memory routes = _route(tokenIn, tokenOut);
        uint256 before = IERC20(tokenOut).balanceOf(address(this));
        IERC20(tokenIn).forceApprove(router, amountIn);
        IMezoRouter(router).swapExactTokensForTokens(amountIn, minOut, routes, address(this), block.timestamp);
        IERC20(tokenIn).forceApprove(router, 0);
        received = IERC20(tokenOut).balanceOf(address(this)) - before;
    }

    function _poolQuote(address tokenIn, address tokenOut, uint256 amountIn) private view returns (uint256) {
        if (amountIn == 0) return 0;
        uint256[] memory amounts = IMezoRouter(router).getAmountsOut(amountIn, _route(tokenIn, tokenOut));
        return amounts[amounts.length - 1];
    }

    function _route(address tokenIn, address tokenOut) private view returns (IMezoRouter.Route[] memory routes) {
        address token = tokenIn == MUSD ? tokenOut : tokenIn;
        if (token == MUSD) revert NoRoute();
        (address pool, bool stable) = poolFor(token);
        if (pool == address(0)) revert NoRoute();
        routes = new IMezoRouter.Route[](1);
        routes[0] = IMezoRouter.Route({from: tokenIn, to: tokenOut, stable: stable, factory: factory});
    }

    function _onCurve(address token) private view returns (bool) {
        return IMusdyLaunchpad(launchpad).isCurve(token);
    }

    function _use(address user, uint256 nonce, uint256 deadline, bytes32 digest, bytes calldata sig) private {
        if (block.timestamp > deadline) revert Expired();
        if (nonce != nonces[user]) revert BadNonce();
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, sig);
        if (err != ECDSA.RecoverError.NoError || signer != user || user == address(0)) revert BadSignature();
        nonces[user] = nonce + 1;
    }

    function _pull(address token, address from, uint256 amount, address to) private {
        if (amount == 0) revert ZeroAmount();
        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(from, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - before;
        balanceOf[to][token] += received;
        emit Deposited(to, token, received);
    }

    function _withdraw(address user, address token, uint256 amount, address to) private {
        if (amount == 0) revert ZeroAmount();
        _debit(user, token, amount);
        IERC20(token).safeTransfer(to, amount);
        emit Withdrawn(user, token, amount, to);
    }

    function _debit(address user, address token, uint256 amount) private {
        uint256 bal = balanceOf[user][token];
        if (bal < amount) revert Insufficient();
        balanceOf[user][token] = bal - amount;
    }

    function _fee(uint256 amount) private view returns (uint256) {
        return amount * feeBps / BPS;
    }

    function _scaledFee(uint256 fee, uint256 used, uint256 net) private pure returns (uint256) {
        return fee * used / net;
    }
}
