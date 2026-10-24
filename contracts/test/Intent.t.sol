// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base} from "./Base.t.sol";
import {MusdyVault} from "../src/MusdyVault.sol";
import {IMusdyVault} from "../src/interfaces/IMusdyVault.sol";

contract IntentTest is Base {
    string internal constant SOL_TOKEN = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
    uint256 internal constant SOLANA = 792703809;

    function _intent(address user, bool isBuy, uint256 amountIn) internal view returns (IMusdyVault.Intent memory i) {
        i = IMusdyVault.Intent({
            user: user,
            isBuy: isBuy,
            chainId: SOLANA,
            token: SOL_TOKEN,
            amountIn: amountIn,
            minOut: 1,
            ref: address(0),
            nonce: vault.nonces(user),
            deadline: block.timestamp + 60
        });
    }

    function _open(uint256 key, IMusdyVault.Intent memory i) internal returns (bytes32) {
        bytes memory sig = _sign(key, vault.hashIntent(i));
        vm.prank(relayer);
        return vault.executeIntent(i, sig);
    }

    function _bal(address a) internal view returns (uint256) {
        return vault.balanceOf(a, address(musd));
    }

    function test_setSolver_onlyOwnerEmits() public {
        address next = makeAddr("next");
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vm.prank(alice);
        vault.setSolver(next);
        vm.expectRevert(MusdyVault.ZeroAddress.selector);
        vm.prank(owner);
        vault.setSolver(address(0));
        vm.expectEmit(address(vault));
        emit IMusdyVault.SolverSet(next);
        vm.prank(owner);
        vault.setSolver(next);
        assertEq(vault.solver(), next);
    }

    function test_intent_buyMovesCashToSolver() public {
        _fund(alice, 100e18);
        IMusdyVault.Intent memory i = _intent(alice, true, 40e18);
        bytes32 digest = vault.hashIntent(i);
        vm.expectEmit(address(vault));
        emit IMusdyVault.IntentOpened(digest, alice, true, SOLANA, SOL_TOKEN, 40e18, 1, address(0));
        bytes32 id = _open(aliceKey, i);
        assertEq(id, digest);
        assertEq(_bal(alice), 60e18);
        assertEq(_bal(solver), 40e18);
        assertEq(vault.nonces(alice), 1);
        (address user, bool isBuy, uint256 amountIn, uint256 openedAt, bool settled) = vault.intents(id);
        assertEq(user, alice);
        assertTrue(isBuy);
        assertEq(amountIn, 40e18);
        assertEq(openedAt, block.timestamp);
        assertFalse(settled);
    }

    function test_intent_buyInsufficientCash() public {
        _fund(alice, 10e18);
        IMusdyVault.Intent memory i = _intent(alice, true, 11e18);
        bytes memory sig = _sign(aliceKey, vault.hashIntent(i));
        vm.expectRevert(IMusdyVault.Insufficient.selector);
        vault.executeIntent(i, sig);
    }

    function test_intent_sellMovesNothing() public {
        _fund(alice, 5e18);
        bytes32 id = _open(aliceKey, _intent(alice, false, 1234));
        assertEq(_bal(alice), 5e18);
        assertEq(_bal(solver), 0);
        musd.mint(solver, 30e18);
        vm.startPrank(solver);
        musd.approve(address(vault), 30e18);
        vault.deposit(address(musd), 30e18, solver);
        vm.expectEmit(address(vault));
        emit IMusdyVault.IntentSettled(id, alice, 25e18, 1234, true);
        vault.settleIntent(id, alice, 25e18, 1234, true);
        vm.stopPrank();
        assertEq(_bal(alice), 30e18);
        assertEq(_bal(solver), 5e18);
    }

    function test_intent_sellNotRefundable() public {
        bytes32 id = _open(aliceKey, _intent(alice, false, 1));
        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert(IMusdyVault.NotRefundable.selector);
        vm.prank(alice);
        vault.refundIntent(id);
    }

    function test_intent_badSignature() public {
        _fund(alice, 10e18);
        IMusdyVault.Intent memory i = _intent(alice, true, 1e18);
        bytes memory sig = _sign(bobKey, vault.hashIntent(i));
        vm.expectRevert(IMusdyVault.BadSignature.selector);
        vault.executeIntent(i, sig);
        sig = _sign(aliceKey, vault.hashIntent(i));
        i.token = "So11111111111111111111111111111111111111112";
        vm.expectRevert(IMusdyVault.BadSignature.selector);
        vault.executeIntent(i, sig);
    }

    function test_intent_tradeSigNotAnIntent() public {
        _fund(alice, 10e18);
        IMusdyVault.Intent memory i = _intent(alice, true, 1e18);
        IMusdyVault.Trade memory t = _trade(alice, address(nvda), true, 1e18, 1, address(0));
        bytes memory sig = _sign(aliceKey, vault.hashTrade(t));
        vm.expectRevert(IMusdyVault.BadSignature.selector);
        vault.executeIntent(i, sig);
    }

    function test_intent_badNonceAndReplay() public {
        _fund(alice, 10e18);
        IMusdyVault.Intent memory i = _intent(alice, true, 1e18);
        bytes memory sig = _sign(aliceKey, vault.hashIntent(i));
        vault.executeIntent(i, sig);
        vm.expectRevert(IMusdyVault.BadNonce.selector);
        vault.executeIntent(i, sig);
        i.nonce = 5;
        sig = _sign(aliceKey, vault.hashIntent(i));
        vm.expectRevert(IMusdyVault.BadNonce.selector);
        vault.executeIntent(i, sig);
    }

    function test_intent_expired() public {
        _fund(alice, 10e18);
        IMusdyVault.Intent memory i = _intent(alice, true, 1e18);
        bytes memory sig = _sign(aliceKey, vault.hashIntent(i));
        vm.warp(i.deadline + 1);
        vm.expectRevert(IMusdyVault.Expired.selector);
        vault.executeIntent(i, sig);
    }

    function test_intent_zeroAmount() public {
        IMusdyVault.Intent memory i = _intent(alice, false, 0);
        bytes memory sig = _sign(aliceKey, vault.hashIntent(i));
        vm.expectRevert(IMusdyVault.ZeroAmount.selector);
        vault.executeIntent(i, sig);
    }

    function test_intent_noSolver() public {
        MusdyVault fresh =
            new MusdyVault(address(musd), address(btc), address(router), address(launchpad), feeTo, 50, owner);
        IMusdyVault.Intent memory i = _intent(alice, false, 1);
        bytes memory sig = _sign(aliceKey, fresh.hashIntent(i));
        vm.expectRevert(IMusdyVault.NoSolver.selector);
        fresh.executeIntent(i, sig);
    }

    function test_settle_onlySolver() public {
        _fund(alice, 10e18);
        bytes32 id = _open(aliceKey, _intent(alice, true, 10e18));
        vm.expectRevert(IMusdyVault.NotSolver.selector);
        vm.prank(alice);
        vault.settleIntent(id, alice, 10e18, 0, false);
        vm.expectRevert(IMusdyVault.NotSolver.selector);
        vm.prank(owner);
        vault.settleIntent(id, alice, 0, 5, true);
    }

    function test_settle_buyOkThenDoubleSettle() public {
        _fund(alice, 10e18);
        bytes32 id = _open(aliceKey, _intent(alice, true, 10e18));
        vm.expectEmit(address(vault));
        emit IMusdyVault.IntentSettled(id, alice, 0, 777, true);
        vm.prank(solver);
        vault.settleIntent(id, alice, 0, 777, true);
        (,,,, bool settled) = vault.intents(id);
        assertTrue(settled);
        assertEq(_bal(solver), 10e18);
        vm.expectRevert(IMusdyVault.AlreadySettled.selector);
        vm.prank(solver);
        vault.settleIntent(id, alice, 10e18, 0, false);
        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert(IMusdyVault.AlreadySettled.selector);
        vm.prank(alice);
        vault.refundIntent(id);
    }

    function test_settle_failedBuyRefundsUser() public {
        _fund(alice, 10e18);
        bytes32 id = _open(aliceKey, _intent(alice, true, 10e18));
        vm.prank(solver);
        vault.settleIntent(id, alice, 10e18, 0, false);
        assertEq(_bal(alice), 10e18);
        assertEq(_bal(solver), 0);
    }

    function test_settle_wrongUserOrUnknownId() public {
        _fund(alice, 10e18);
        bytes32 id = _open(aliceKey, _intent(alice, true, 10e18));
        vm.startPrank(solver);
        vm.expectRevert(IMusdyVault.UnknownIntent.selector);
        vault.settleIntent(id, bob, 10e18, 0, false);
        vm.expectRevert(IMusdyVault.UnknownIntent.selector);
        vault.settleIntent(keccak256("nope"), alice, 0, 0, false);
        vm.stopPrank();
    }

    function test_settle_solverCannotOverpay() public {
        _fund(alice, 10e18);
        bytes32 id = _open(aliceKey, _intent(alice, true, 10e18));
        vm.expectRevert(IMusdyVault.Insufficient.selector);
        vm.prank(solver);
        vault.settleIntent(id, alice, 10e18 + 1, 0, false);
    }

    function test_refund_timing() public {
        _fund(alice, 10e18);
        bytes32 id = _open(aliceKey, _intent(alice, true, 10e18));
        uint256 opened = block.timestamp;
        vm.warp(opened + 1 hours - 1);
        vm.expectRevert(IMusdyVault.TooEarly.selector);
        vm.prank(alice);
        vault.refundIntent(id);
        vm.warp(opened + 1 hours);
        vm.expectEmit(address(vault));
        emit IMusdyVault.IntentSettled(id, alice, 10e18, 0, false);
        vm.prank(alice);
        vault.refundIntent(id);
        assertEq(_bal(alice), 10e18);
        assertEq(_bal(solver), 0);
        vm.expectRevert(IMusdyVault.AlreadySettled.selector);
        vm.prank(alice);
        vault.refundIntent(id);
        vm.expectRevert(IMusdyVault.AlreadySettled.selector);
        vm.prank(solver);
        vault.settleIntent(id, alice, 0, 0, true);
    }

    function test_refund_onlyIntentUser() public {
        _fund(alice, 10e18);
        bytes32 id = _open(aliceKey, _intent(alice, true, 10e18));
        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert(IMusdyVault.UnknownIntent.selector);
        vm.prank(bob);
        vault.refundIntent(id);
    }

    function test_refund_solverShortReverts() public {
        _fund(alice, 10e18);
        bytes32 id = _open(aliceKey, _intent(alice, true, 10e18));
        vm.prank(solver);
        vault.withdraw(address(musd), 4e18, solver);
        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert(IMusdyVault.SolverInsufficient.selector);
        vm.prank(alice);
        vault.refundIntent(id);
        musd.mint(solver, 4e18);
        vm.startPrank(solver);
        musd.approve(address(vault), 4e18);
        vault.deposit(address(musd), 4e18, solver);
        vm.stopPrank();
        vm.prank(alice);
        vault.refundIntent(id);
        assertEq(_bal(alice), 10e18);
    }

    function test_intent_hashMatchesTypedData() public view {
        IMusdyVault.Intent memory i = _intent(alice, true, 3e18);
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Intent(address user,bool isBuy,uint256 chainId,string token,uint256 amountIn,uint256 minOut,address ref,uint256 nonce,uint256 deadline)"
                ),
                i.user,
                i.isBuy,
                i.chainId,
                keccak256(bytes(i.token)),
                i.amountIn,
                i.minOut,
                i.ref,
                i.nonce,
                i.deadline
            )
        );
        assertEq(vault.hashIntent(i), keccak256(abi.encodePacked("\x19\x01", vault.DOMAIN_SEPARATOR(), structHash)));
    }
}
