// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {IMusdyVault} from "../src/interfaces/IMusdyVault.sol";
import {IMusdyLaunchpad} from "../src/interfaces/IMusdyLaunchpad.sol";
import {MusdyVault} from "../src/MusdyVault.sol";
import {MusdyToken} from "../src/MusdyToken.sol";
import {MockERC20Permit} from "../src/mocks/MockERC20Permit.sol";
import {MockBtcPermit} from "../src/mocks/MockBtcPermit.sol";

contract VaultTest is Base {
    bytes32 internal constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    function _permit(uint256 key, MockERC20Permit token, uint256 amount, uint256 deadline)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        address o = vm.addr(key);
        bytes32 structHash =
            keccak256(abi.encode(PERMIT_TYPEHASH, o, address(vault), amount, token.nonces(o), deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
        (v, r, s) = vm.sign(key, digest);
    }

    function _allowancesClean(address token) internal view {
        assertEq(MockERC20Permit(token).allowance(address(vault), address(router)), 0);
        assertEq(MockERC20Permit(token).allowance(address(vault), address(launchpad)), 0);
    }

    // views and admin

    function test_views() public view {
        assertEq(vault.MUSD(), address(musd));
        assertEq(vault.router(), address(router));
        assertEq(vault.factory(), address(factory));
        assertEq(vault.launchpad(), address(launchpad));
        assertEq(vault.feeRecipient(), feeTo);
        assertEq(vault.feeBps(), 50);
        bytes32 expected = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("musdy"),
                keccak256("1"),
                block.chainid,
                address(vault)
            )
        );
        assertEq(vault.DOMAIN_SEPARATOR(), expected);
    }

    function test_setFee() public {
        vm.expectRevert();
        vault.setFee(alice, 10);
        vm.startPrank(owner);
        vm.expectRevert(IMusdyVault.FeeTooHigh.selector);
        vault.setFee(alice, 101);
        vm.expectRevert(MusdyVault.ZeroAddress.selector);
        vault.setFee(address(0), 10);
        vm.expectEmit();
        emit IMusdyVault.FeeSet(alice, 100);
        vault.setFee(alice, 100);
        vm.stopPrank();
        assertEq(vault.feeRecipient(), alice);
        assertEq(vault.feeBps(), 100);
    }

    function test_constructorChecks() public {
        vm.expectRevert(IMusdyVault.FeeTooHigh.selector);
        new MusdyVault(address(musd), address(router), address(launchpad), feeTo, 101, owner);
        vm.expectRevert(MusdyVault.ZeroAddress.selector);
        new MusdyVault(address(musd), address(router), address(launchpad), address(0), 50, owner);
    }

    // deposits

    function test_deposit_creditsOnBehalfOf() public {
        musd.mint(bob, 100e18);
        vm.startPrank(bob);
        musd.approve(address(vault), 100e18);
        vm.expectEmit();
        emit IMusdyVault.Deposited(alice, address(musd), 100e18);
        vault.deposit(address(musd), 100e18, alice);
        vm.stopPrank();
        assertEq(vault.balanceOf(alice, address(musd)), 100e18);
        assertEq(vault.balanceOf(bob, address(musd)), 0);
    }

    function test_deposit_zeroReverts() public {
        vm.expectRevert(IMusdyVault.ZeroAmount.selector);
        vault.deposit(address(musd), 0, alice);
    }

    function test_deposit_zeroOnBehalfOfReverts() public {
        musd.mint(bob, 1e18);
        vm.startPrank(bob);
        musd.approve(address(vault), 1e18);
        vm.expectRevert(MusdyVault.ZeroAddress.selector);
        vault.deposit(address(musd), 1e18, address(0));
        vm.stopPrank();
    }

    function test_depositWithPermit_btcPrecompileDomain() public {
        MockBtcPermit pbtc = new MockBtcPermit();
        assertEq(pbtc.name(), "BTC");
        assertEq(pbtc.decimals(), 18);
        (bool ok,) = address(pbtc).staticcall(abi.encodeWithSignature("nonces(address)", alice));
        assertFalse(ok);
        (ok,) = address(pbtc).staticcall(abi.encodeWithSignature("eip712Domain()"));
        assertFalse(ok);
        pbtc.mint(alice, 2e18);
        uint256 deadline = block.timestamp + 100;
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("BTC"),
                keccak256("1"),
                block.chainid,
                address(pbtc)
            )
        );
        assertEq(pbtc.DOMAIN_SEPARATOR(), domain);
        assertEq(pbtc.PERMIT_TYPEHASH(), PERMIT_TYPEHASH);
        bytes32 structHash =
            keccak256(abi.encode(PERMIT_TYPEHASH, alice, address(vault), 2e18, pbtc.nonce(alice), deadline));
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(aliceKey, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        vm.prank(relayer);
        vault.depositWithPermit(alice, address(pbtc), 2e18, deadline, v, r, s);
        assertEq(vault.balanceOf(alice, address(pbtc)), 2e18);
        assertEq(pbtc.balanceOf(alice), 0);
        assertEq(pbtc.nonce(alice), 1);
        assertEq(vault.balanceOf(relayer, address(pbtc)), 0);
    }

    // a standing allowance can be swept by anyone, but only into the owner's own vault balance
    function test_depositWithPermit_thirdPartySweepCreditsOwner() public {
        musd.mint(alice, 40e18);
        vm.prank(alice);
        musd.approve(address(vault), 40e18);
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vault.depositWithPermit(alice, address(musd), 40e18, block.timestamp + 100, 27, bytes32(0), bytes32(0));
        assertEq(vault.balanceOf(alice, address(musd)), 40e18);
        assertEq(vault.balanceOf(stranger, address(musd)), 0);
        assertEq(vault.balanceOf(relayer, address(musd)), 0);
        assertEq(vault.balanceOf(feeTo, address(musd)), 0);
        assertEq(musd.balanceOf(address(vault)), 40e18);
        vm.prank(alice);
        vault.withdraw(address(musd), 40e18, alice);
        assertEq(musd.balanceOf(alice), 40e18);
    }

    function test_depositWithPermit_relayed() public {
        btc.mint(alice, 1e18);
        uint256 deadline = block.timestamp + 100;
        (uint8 v, bytes32 r, bytes32 s) = _permit(aliceKey, btc, 1e18, deadline);
        vm.prank(relayer);
        vault.depositWithPermit(alice, address(btc), 1e18, deadline, v, r, s);
        assertEq(vault.balanceOf(alice, address(btc)), 1e18);
        assertEq(btc.balanceOf(alice), 0);
        assertEq(btc.allowance(alice, address(vault)), 0);
    }

    function test_depositWithPermit_frontRunPermit() public {
        musd.mint(alice, 50e18);
        uint256 deadline = block.timestamp + 100;
        (uint8 v, bytes32 r, bytes32 s) = _permit(aliceKey, musd, 50e18, deadline);
        vm.prank(bob);
        musd.permit(alice, address(vault), 50e18, deadline, v, r, s);
        vm.prank(relayer);
        vault.depositWithPermit(alice, address(musd), 50e18, deadline, v, r, s);
        assertEq(vault.balanceOf(alice, address(musd)), 50e18);
    }

    function test_depositWithPermit_badPermitNoAllowance() public {
        musd.mint(alice, 50e18);
        uint256 deadline = block.timestamp + 100;
        (uint8 v, bytes32 r, bytes32 s) = _permit(bobKey, musd, 50e18, deadline);
        vm.expectRevert(IMusdyVault.Insufficient.selector);
        vault.depositWithPermit(alice, address(musd), 50e18, deadline, v, r, s);
    }

    // trades on pools

    function test_trade_buyPool() public {
        _fund(alice, 1000e18);
        (uint256 qOut, uint256 qFee) = vault.quote(address(nvda), true, 1000e18);
        assertEq(qFee, 5e18);
        IMusdyVault.Trade memory t = _trade(alice, address(nvda), true, 1000e18, qOut, address(0));
        vm.expectEmit();
        emit IMusdyVault.Traded(alice, address(nvda), true, 1000e18, qOut, 5e18, address(0), IMusdyVault.Venue.Pool);
        uint256 out = _execTrade(aliceKey, t);
        assertEq(out, qOut);
        assertApproxEqRel(out, uint256(995e18) * 1e18 / 151e18, 0.01e18);
        assertEq(vault.balanceOf(alice, address(musd)), 0);
        assertEq(vault.balanceOf(alice, address(nvda)), out);
        assertEq(vault.balanceOf(feeTo, address(musd)), 5e18);
        assertEq(vault.nonces(alice), 1);
        _allowancesClean(address(musd));
    }

    function test_trade_sellPool() public {
        _fund(alice, 1000e18);
        uint256 got = _execTrade(aliceKey, _trade(alice, address(btc), true, 1000e18, 0, address(0)));
        (uint256 qOut, uint256 qFee) = vault.quote(address(btc), false, got);
        uint256 net = _execTrade(aliceKey, _trade(alice, address(btc), false, got, qOut, address(0)));
        assertEq(net, qOut);
        assertEq(vault.balanceOf(alice, address(btc)), 0);
        assertEq(vault.balanceOf(alice, address(musd)), net);
        assertEq(vault.balanceOf(feeTo, address(musd)), 5e18 + qFee);
        assertLt(net, 1000e18);
        _allowancesClean(address(btc));
    }

    function test_trade_stablePoolFallback() public {
        _fund(alice, 100e18);
        (, bool stable) = vault.poolFor(address(stab));
        assertTrue(stable);
        uint256 out = _execTrade(aliceKey, _trade(alice, address(stab), true, 100e18, 0, address(0)));
        assertApproxEqRel(out, 99.5e18, 0.01e18);
    }

    function test_trade_noRoute() public {
        _fund(alice, 100e18);
        MockERC20Permit orphan = new MockERC20Permit("O", "O");
        IMusdyVault.Trade memory t = _trade(alice, address(orphan), true, 100e18, 0, address(0));
        bytes memory sig = _sign(aliceKey, vault.hashTrade(t));
        vm.expectRevert(IMusdyVault.NoRoute.selector);
        vault.executeTrade(t, sig);
        vm.expectRevert(IMusdyVault.NoRoute.selector);
        vault.quote(address(orphan), true, 1e18);
        t = _trade(alice, address(musd), true, 100e18, 0, address(0));
        sig = _sign(aliceKey, vault.hashTrade(t));
        vm.expectRevert(IMusdyVault.NoRoute.selector);
        vault.executeTrade(t, sig);
        t = _trade(alice, address(musd), false, 100e18, 0, address(0));
        sig = _sign(aliceKey, vault.hashTrade(t));
        vm.expectRevert(IMusdyVault.NoRoute.selector);
        vault.executeTrade(t, sig);
    }

    function test_trade_slippageAndInsufficient() public {
        _fund(alice, 100e18);
        IMusdyVault.Trade memory t = _trade(alice, address(nvda), true, 101e18, 0, address(0));
        bytes memory sig = _sign(aliceKey, vault.hashTrade(t));
        vm.expectRevert(IMusdyVault.Insufficient.selector);
        vault.executeTrade(t, sig);
        t = _trade(alice, address(nvda), true, 0, 0, address(0));
        sig = _sign(aliceKey, vault.hashTrade(t));
        vm.expectRevert(IMusdyVault.ZeroAmount.selector);
        vault.executeTrade(t, sig);
        uint256 got = _execTrade(aliceKey, _trade(alice, address(nvda), true, 100e18, 0, address(0)));
        t = _trade(alice, address(nvda), false, got, 100e18, address(0));
        sig = _sign(aliceKey, vault.hashTrade(t));
        vm.expectRevert(IMusdyVault.Slippage.selector);
        vault.executeTrade(t, sig);
    }

    function test_trade_ref() public {
        _fund(alice, 100e18);
        IMusdyVault.Trade memory t = _trade(alice, address(nvda), true, 100e18, 0, bob);
        vm.expectEmit(true, true, true, false);
        emit IMusdyVault.Traded(alice, address(nvda), true, 0, 0, 0, bob, IMusdyVault.Venue.Pool);
        _execTrade(aliceKey, t);
    }

    // trades on the curve

    function test_trade_buySellCurve() public {
        _fund(alice, 1000e18);
        (address token,) = _execLaunch(aliceKey, _launch(alice, "Coin", 0));
        (uint256 qOut,) = vault.quote(token, true, 100e18);
        IMusdyVault.Trade memory t = _trade(alice, token, true, 100e18, qOut, address(0));
        vm.expectEmit();
        emit IMusdyVault.Traded(alice, token, true, 100e18, qOut, 0.5e18, address(0), IMusdyVault.Venue.Curve);
        uint256 out = _execTrade(aliceKey, t);
        assertEq(vault.balanceOf(alice, token), out);
        (uint256 qNet,) = vault.quote(token, false, out);
        uint256 net = _execTrade(aliceKey, _trade(alice, token, false, out, qNet, address(0)));
        assertEq(net, qNet);
        assertLt(net, 99.5e18);
        assertEq(vault.balanceOf(alice, token), 0);
        _allowancesClean(address(musd));
        _allowancesClean(token);
    }

    function test_trade_curvePartialFillGraduates() public {
        _fund(alice, 10_000e18);
        (address token,) = _execLaunch(aliceKey, _launch(alice, "Coin", 0));
        (uint256 qOut, uint256 qFee) = vault.quote(token, true, 10_000e18);
        uint256 out = _execTrade(aliceKey, _trade(alice, token, true, 10_000e18, 0, address(0)));
        assertEq(out, launchpad.CURVE_SUPPLY());
        assertEq(out, qOut);
        IMusdyLaunchpad.Curve memory c = launchpad.curveOf(token);
        assertTrue(c.graduated);
        uint256 spent = 10_000e18 - vault.balanceOf(alice, address(musd));
        assertEq(spent, c.realMusd + qFee);
        assertEq(vault.balanceOf(feeTo, address(musd)), qFee);
        // after graduation the same token trades through the new pool
        IMusdyVault.Trade memory t = _trade(alice, token, false, out / 10, 0, address(0));
        vm.expectEmit(true, true, true, false);
        emit IMusdyVault.Traded(alice, token, false, 0, 0, 0, address(0), IMusdyVault.Venue.Pool);
        assertGt(_execTrade(aliceKey, t), 0);
        _allowancesClean(address(musd));
        _allowancesClean(token);
    }

    // signatures, nonces, deadlines

    function test_trade_badSignature() public {
        _fund(alice, 100e18);
        IMusdyVault.Trade memory t = _trade(alice, address(nvda), true, 100e18, 0, address(0));
        bytes memory sig = _sign(bobKey, vault.hashTrade(t));
        vm.expectRevert(IMusdyVault.BadSignature.selector);
        vault.executeTrade(t, sig);
        vm.expectRevert(IMusdyVault.BadSignature.selector);
        vault.executeTrade(t, hex"1234");
        sig = _sign(aliceKey, vault.hashTrade(t));
        t.amountIn = 99e18;
        vm.expectRevert(IMusdyVault.BadSignature.selector);
        vault.executeTrade(t, sig);
    }

    function test_trade_badNonceAndReplay() public {
        _fund(alice, 100e18);
        IMusdyVault.Trade memory t = _trade(alice, address(nvda), true, 10e18, 0, address(0));
        bytes memory sig = _sign(aliceKey, vault.hashTrade(t));
        vault.executeTrade(t, sig);
        vm.expectRevert(IMusdyVault.BadNonce.selector);
        vault.executeTrade(t, sig);
        t.nonce = 5;
        sig = _sign(aliceKey, vault.hashTrade(t));
        vm.expectRevert(IMusdyVault.BadNonce.selector);
        vault.executeTrade(t, sig);
    }

    function test_trade_expired() public {
        _fund(alice, 100e18);
        IMusdyVault.Trade memory t = _trade(alice, address(nvda), true, 10e18, 0, address(0));
        bytes memory sig = _sign(aliceKey, vault.hashTrade(t));
        vm.warp(t.deadline + 1);
        vm.expectRevert(IMusdyVault.Expired.selector);
        vault.executeTrade(t, sig);
    }

    // withdrawals

    function _withdrawMsg(address user, address token, uint256 amount, address to)
        internal
        view
        returns (IMusdyVault.Withdraw memory)
    {
        return IMusdyVault.Withdraw(user, token, amount, to, vault.nonces(user), block.timestamp + 60);
    }

    function test_withdraw_signed() public {
        _fund(alice, 100e18);
        IMusdyVault.Withdraw memory w = _withdrawMsg(alice, address(musd), 40e18, bob);
        bytes memory sig = _sign(aliceKey, vault.hashWithdraw(w));
        vm.expectEmit();
        emit IMusdyVault.Withdrawn(alice, address(musd), 40e18, bob);
        vm.prank(relayer);
        vault.executeWithdraw(w, sig);
        assertEq(musd.balanceOf(bob), 40e18);
        assertEq(vault.balanceOf(alice, address(musd)), 60e18);
        vm.expectRevert(IMusdyVault.BadNonce.selector);
        vault.executeWithdraw(w, sig);
    }

    function test_withdraw_failures() public {
        _fund(alice, 100e18);
        IMusdyVault.Withdraw memory w = _withdrawMsg(alice, address(musd), 101e18, bob);
        bytes memory sig = _sign(aliceKey, vault.hashWithdraw(w));
        vm.expectRevert(IMusdyVault.Insufficient.selector);
        vault.executeWithdraw(w, sig);
        w = _withdrawMsg(alice, address(musd), 0, bob);
        sig = _sign(aliceKey, vault.hashWithdraw(w));
        vm.expectRevert(IMusdyVault.ZeroAmount.selector);
        vault.executeWithdraw(w, sig);
        w = _withdrawMsg(alice, address(musd), 1e18, bob);
        sig = _sign(bobKey, vault.hashWithdraw(w));
        vm.expectRevert(IMusdyVault.BadSignature.selector);
        vault.executeWithdraw(w, sig);
    }

    function test_withdraw_curveTokenLockedUntilGraduation() public {
        _fund(alice, 10_000e18);
        (address token, uint256 out) = _execLaunch(aliceKey, _launch(alice, "Coin", 100e18));
        IMusdyVault.Withdraw memory w = _withdrawMsg(alice, token, out, alice);
        bytes memory sig = _sign(aliceKey, vault.hashWithdraw(w));
        vm.expectRevert(MusdyToken.Locked.selector);
        vault.executeWithdraw(w, sig);
        _execTrade(bobKey, _fundAndTrade(bob, token));
        w = _withdrawMsg(alice, token, out, alice);
        sig = _sign(aliceKey, vault.hashWithdraw(w));
        vault.executeWithdraw(w, sig);
        assertEq(MusdyToken(token).balanceOf(alice), out);
    }

    function _fundAndTrade(address user, address token) internal returns (IMusdyVault.Trade memory) {
        _fund(user, 10_000e18);
        return _trade(user, token, true, 10_000e18, 0, address(0));
    }

    function test_escapeHatch() public {
        _fund(alice, 100e18);
        _execTrade(aliceKey, _trade(alice, address(btc), true, 50e18, 0, address(0)));
        uint256 b = vault.balanceOf(alice, address(btc));
        vm.startPrank(alice);
        vault.withdraw(address(musd), 50e18, alice);
        vault.withdraw(address(btc), b, alice);
        vm.expectRevert(IMusdyVault.Insufficient.selector);
        vault.withdraw(address(musd), 1, alice);
        vm.stopPrank();
        assertEq(musd.balanceOf(alice), 50e18);
        assertEq(btc.balanceOf(alice), b);
        vm.prank(bob);
        vm.expectRevert(IMusdyVault.Insufficient.selector);
        vault.withdraw(address(musd), 1, bob);
    }

    // launches through the vault

    function test_launch_viaVaultWithInitialBuy() public {
        _fund(alice, 1000e18);
        IMusdyVault.Launch memory l = _launch(alice, "Coin", 100e18);
        vm.expectEmit(true, false, false, false);
        emit IMusdyVault.Launched(alice, address(0));
        (address token, uint256 out) = _execLaunch(aliceKey, l);
        assertTrue(launchpad.isCurve(token));
        assertEq(launchpad.curveOf(token).creator, alice);
        assertEq(vault.balanceOf(alice, token), out);
        assertGt(out, 0);
        assertEq(vault.balanceOf(alice, address(musd)), 900e18);
        assertEq(vault.balanceOf(feeTo, address(musd)), 0.5e18);
        assertEq(vault.nonces(alice), 1);
        assertEq(MusdyToken(token).symbol(), "MEME");
    }

    function test_launch_viaVaultNoBuy() public {
        (address token, uint256 out) = _execLaunch(aliceKey, _launch(alice, "Coin", 0));
        assertEq(out, 0);
        assertTrue(launchpad.isLaunched(token));
    }

    function test_launch_viaVaultFailures() public {
        IMusdyVault.Launch memory l = _launch(alice, "Coin", 10e18);
        bytes memory sig = _sign(aliceKey, vault.hashLaunch(l));
        vm.expectRevert(IMusdyVault.Insufficient.selector);
        vault.executeLaunch(l, sig);
        l.name = "Other";
        vm.expectRevert(IMusdyVault.BadSignature.selector);
        vault.executeLaunch(l, sig);
        l = _launch(alice, "", 0);
        sig = _sign(aliceKey, vault.hashLaunch(l));
        vm.expectRevert(IMusdyLaunchpad.BadMetadata.selector);
        vault.executeLaunch(l, sig);
    }

    function testFuzz_trade_feeMath(uint256 amount) public {
        amount = bound(amount, 1e12, 100_000e18);
        _fund(alice, amount);
        _execTrade(aliceKey, _trade(alice, address(nvda), true, amount, 0, address(0)));
        assertEq(vault.balanceOf(feeTo, address(musd)), amount * 50 / 10_000);
        assertEq(vault.balanceOf(alice, address(musd)), 0);
    }
}
