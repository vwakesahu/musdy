// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {IERC5267} from "@openzeppelin/contracts/interfaces/IERC5267.sol";
import {MusdyLaunchpad} from "../../src/MusdyLaunchpad.sol";
import {MusdyVault} from "../../src/MusdyVault.sol";
import {MusdyToken} from "../../src/MusdyToken.sol";
import {IMusdyVault} from "../../src/interfaces/IMusdyVault.sol";
import {IMusdyLaunchpad} from "../../src/interfaces/IMusdyLaunchpad.sol";
import {IMezoPool, IMezoPoolFactory} from "../../src/interfaces/IMezoPools.sol";

// runs against mezo testnet: forge test --match-path 'test/fork/*' --fork-url mezo_testnet
// BTC (0x7b7C...) is a cosmos precompile, an anvil fork only sees its stub bytecode, so BTC trades are not covered here
interface ISyncPool {
    function sync() external;
}

contract MezoForkTest is Test {
    address internal constant ROUTER = 0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9;
    address internal constant MUSD = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    address internal constant NVDA = 0x0dd342913752311E88BBfb0184E3f55FAeFc866a;
    address internal constant BTC = 0x7b7C000000000000000000000000000000000000;

    MusdyLaunchpad internal launchpad;
    MusdyVault internal vault;
    uint256 internal aliceKey = 0xA11CE;
    address internal alice;
    address internal feeTo = makeAddr("feeTo");

    function setUp() public {
        if (block.chainid != 31611) vm.skip(true);
        alice = vm.addr(aliceKey);
        launchpad = new MusdyLaunchpad(MUSD, ROUTER, 1500e18, address(this));
        vault = new MusdyVault(MUSD, BTC, ROUTER, address(launchpad), feeTo, 50, address(this));
        deal(MUSD, alice, 10_000e18);
        vm.startPrank(alice);
        IERC20(MUSD).approve(address(vault), 10_000e18);
        vault.deposit(MUSD, 10_000e18, alice);
        vm.stopPrank();
    }

    function _trade(address token, bool isBuy, uint256 amountIn, uint256 minOut) internal returns (uint256) {
        IMusdyVault.Trade memory t = IMusdyVault.Trade(
            alice, token, isBuy, amountIn, minOut, address(0), vault.nonces(alice), block.timestamp + 60
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(aliceKey, vault.hashTrade(t));
        return vault.executeTrade(t, abi.encodePacked(r, s, v));
    }

    function test_fork_depositAndFactory() public view {
        assertEq(vault.balanceOf(alice, MUSD), 10_000e18);
        assertEq(vault.factory(), 0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A);
        (address pool,) = vault.poolFor(NVDA);
        assertTrue(pool != address(0));
    }

    function test_fork_depositWithPermit() public {
        uint256 key = 0xB0B;
        address owner = vm.addr(key);
        address relayer = makeAddr("relayer");
        deal(MUSD, owner, 250e18);
        (, string memory name, string memory version, uint256 chainId, address verifying,,) =
            IERC5267(MUSD).eip712Domain();
        assertEq(chainId, 31611);
        assertEq(verifying, MUSD);
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                chainId,
                verifying
            )
        );
        assertEq(domain, IERC20Permit(MUSD).DOMAIN_SEPARATOR());
        uint256 deadline = block.timestamp + 600;
        uint256 n = IERC20Permit(MUSD).nonces(owner);
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                owner,
                address(vault),
                250e18,
                n,
                deadline
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        vm.prank(relayer);
        vault.depositWithPermit(owner, MUSD, 250e18, deadline, v, r, s);
        assertEq(vault.balanceOf(owner, MUSD), 250e18);
        assertEq(vault.balanceOf(relayer, MUSD), 0);
        assertEq(IERC20(MUSD).balanceOf(owner), 0);
        assertEq(IERC20Permit(MUSD).nonces(owner), n + 1);
        assertEq(IERC20(MUSD).allowance(owner, address(vault)), 0);
    }

    function test_fork_buySellNvda() public {
        (uint256 qOut,) = vault.quote(NVDA, true, 10e18);
        uint256 out = _trade(NVDA, true, 10e18, qOut);
        assertEq(out, qOut);
        assertGt(out, 0);
        assertEq(vault.balanceOf(alice, NVDA), out);
        assertEq(IERC20(NVDA).allowance(address(vault), ROUTER), 0);
        (uint256 qNet,) = vault.quote(NVDA, false, out);
        uint256 net = _trade(NVDA, false, out, qNet);
        assertEq(net, qNet);
        assertLt(net, 10e18);
        assertGt(net, 9e18);
        assertEq(IERC20(MUSD).allowance(address(vault), ROUTER), 0);
    }

    function test_fork_launchAndGraduate() public {
        IMusdyVault.Launch memory l =
            IMusdyVault.Launch(alice, "Fork Coin", "FORK", "", 100e18, vault.nonces(alice), block.timestamp + 60);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(aliceKey, vault.hashLaunch(l));
        (address token, uint256 first) = vault.executeLaunch(l, abi.encodePacked(r, s, v));
        assertGt(first, 0);
        assertTrue(launchpad.isCurve(token));
        uint256 out = _trade(token, true, 9_000e18, 0);
        assertEq(first + out, launchpad.CURVE_SUPPLY());
        _checkGraduated(token);
        assertGt(_trade(token, false, out / 100, 0), 0);
        IMusdyVault.Withdraw memory w =
            IMusdyVault.Withdraw(alice, token, first, alice, vault.nonces(alice), block.timestamp + 60);
        (v, r, s) = vm.sign(aliceKey, vault.hashWithdraw(w));
        vault.executeWithdraw(w, abi.encodePacked(r, s, v));
        assertEq(MusdyToken(token).balanceOf(alice), first);
    }

    function test_fork_graduationSurvivesDonatedPool() public {
        IMusdyVault.Launch memory l =
            IMusdyVault.Launch(alice, "Grief Coin", "GRF", "", 0, vault.nonces(alice), block.timestamp + 60);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(aliceKey, vault.hashLaunch(l));
        (address token,) = vault.executeLaunch(l, abi.encodePacked(r, s, v));
        address attacker = makeAddr("attacker");
        deal(MUSD, attacker, 500e18);
        vm.startPrank(attacker);
        address pool = IMezoPoolFactory(vault.factory()).createPool(token, MUSD, false);
        IERC20(MUSD).transfer(pool, 500e18);
        ISyncPool(pool).sync();
        vm.stopPrank();
        (uint256 r0, uint256 r1,) = IMezoPool(pool).getReserves();
        assertEq(r0 + r1, 500e18);
        uint256 out = _trade(token, true, 9_000e18, 0);
        assertEq(out, launchpad.CURVE_SUPPLY());
        IMusdyLaunchpad.Curve memory c = launchpad.curveOf(token);
        assertTrue(c.graduated);
        assertEq(c.pool, pool);
        (r0, r1,) = IMezoPool(pool).getReserves();
        bool tokenIs0 = IMezoPool(pool).token0() == token;
        assertEq(tokenIs0 ? r0 : r1, 206_900_000e18);
        assertEq(tokenIs0 ? r1 : r0, c.realMusd + 500e18);
        assertEq(IERC20(pool).balanceOf(0x000000000000000000000000000000000000dEaD) + 1000, IERC20(pool).totalSupply());
        assertEq(IERC20(pool).balanceOf(attacker), 0);
        assertGt(_trade(token, false, out / 100, 0), 0);
    }

    function _checkGraduated(address token) internal view {
        IMusdyLaunchpad.Curve memory c = launchpad.curveOf(token);
        assertTrue(c.graduated);
        assertEq(c.pool, IMezoPoolFactory(vault.factory()).getPool(token, MUSD, false));
        (uint256 r0, uint256 r1,) = IMezoPool(c.pool).getReserves();
        bool tokenIs0 = IMezoPool(c.pool).token0() == token;
        assertEq(tokenIs0 ? r0 : r1, 206_900_000e18);
        assertEq(tokenIs0 ? r1 : r0, c.realMusd);
        assertGt(IERC20(c.pool).balanceOf(0x000000000000000000000000000000000000dEaD), 0);
        // real pool locks MINIMUM_LIQUIDITY (1000) at address(1) like the mock, all the rest is dEaD's
        assertEq(IERC20(c.pool).balanceOf(address(1)), 1000);
        assertEq(
            IERC20(c.pool).balanceOf(0x000000000000000000000000000000000000dEaD) + 1000, IERC20(c.pool).totalSupply()
        );
    }
}
