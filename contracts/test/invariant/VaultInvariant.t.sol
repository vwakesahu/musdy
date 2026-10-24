// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Base} from "../Base.t.sol";
import {MockERC20Permit} from "../../src/mocks/MockERC20Permit.sol";
import {MusdyVault} from "../../src/MusdyVault.sol";
import {IMusdyVault} from "../../src/interfaces/IMusdyVault.sol";

contract VaultHandler is Test {
    MusdyVault public vault;
    MockERC20Permit public musd;
    address public launchpad;
    address public router;
    address[] public tokens;
    uint256[3] internal keys = [uint256(0x5001), 0x5002, 0x5003];
    address public feeTo;

    mapping(address => uint256) public ghostNonce;
    bool public unauthorizedDecrease;

    constructor(MusdyVault vault_, MockERC20Permit musd_, address[] memory tokens_, address feeTo_) {
        vault = vault_;
        musd = musd_;
        launchpad = vault.launchpad();
        router = vault.router();
        tokens = tokens_;
        feeTo = feeTo_;
    }

    function actor(uint256 i) public view returns (address) {
        return vm.addr(keys[i % 3]);
    }

    function tokenCount() external view returns (uint256) {
        return tokens.length;
    }

    // records every actor balance, runs the action, then flags any drop for someone who didn't authorise it
    modifier watch(uint256 authorised) {
        uint256 n = tokens.length;
        uint256[3][] memory before = new uint256[3][](n);
        for (uint256 j; j < n; ++j) {
            for (uint256 i; i < 3; ++i) {
                before[j][i] = vault.balanceOf(actor(i), tokens[j]);
            }
        }
        _;
        for (uint256 j; j < n; ++j) {
            for (uint256 i; i < 3; ++i) {
                if (i != authorised % 3 && vault.balanceOf(actor(i), tokens[j]) < before[j][i]) {
                    unauthorizedDecrease = true;
                }
            }
        }
    }

    function deposit(uint256 who, uint256 amount) external watch(type(uint256).max) {
        amount = bound(amount, 1, 50_000e18);
        address a = actor(who);
        musd.mint(a, amount);
        vm.startPrank(a);
        musd.approve(address(vault), amount);
        vault.deposit(address(musd), amount, a);
        vm.stopPrank();
    }

    function trade(uint256 who, uint256 tSeed, bool isBuy, uint256 amount) external watch(who) {
        address a = actor(who);
        address token = tokens[1 + tSeed % (tokens.length - 1)];
        address spend = isBuy ? address(musd) : token;
        uint256 bal = vault.balanceOf(a, spend);
        if (bal == 0) return;
        amount = bound(amount, 1, bal);
        IMusdyVault.Trade memory t =
            IMusdyVault.Trade(a, token, isBuy, amount, 0, address(0), vault.nonces(a), block.timestamp + 1);
        try vault.executeTrade(t, _sig(who, vault.hashTrade(t))) {
            ghostNonce[a]++;
        } catch {}
    }

    function withdrawSigned(uint256 who, uint256 tSeed, uint256 amount) external watch(who) {
        address a = actor(who);
        address token = tokens[tSeed % tokens.length];
        uint256 bal = vault.balanceOf(a, token);
        if (bal == 0) return;
        amount = bound(amount, 1, bal);
        IMusdyVault.Withdraw memory w =
            IMusdyVault.Withdraw(a, token, amount, address(0xBEEF), vault.nonces(a), block.timestamp + 1);
        try vault.executeWithdraw(w, _sig(who, vault.hashWithdraw(w))) {
            ghostNonce[a]++;
        } catch {}
    }

    function escape(uint256 who, uint256 tSeed, uint256 amount) external watch(who) {
        address a = actor(who);
        address token = tokens[tSeed % tokens.length];
        uint256 bal = vault.balanceOf(a, token);
        if (bal == 0) return;
        amount = bound(amount, 1, bal);
        vm.prank(a);
        try vault.withdraw(token, amount, a) {} catch {}
    }

    // a signature from the wrong key must never move anything or bump a nonce
    function forged(uint256 who, uint256 signer, uint256 amount) external watch(type(uint256).max) {
        address a = actor(who);
        if (signer % 3 == who % 3) return;
        IMusdyVault.Withdraw memory w = IMusdyVault.Withdraw(
            a, address(musd), bound(amount, 1, 1e24), address(0xBAD), vault.nonces(a), block.timestamp + 1
        );
        try vault.executeWithdraw(w, _sig(signer, vault.hashWithdraw(w))) {
            ghostNonce[a]++;
        } catch {}
    }

    function _sig(uint256 who, bytes32 digest) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(keys[who % 3], digest);
        return abi.encodePacked(r, s, v);
    }
}

contract VaultInvariantTest is Base {
    VaultHandler internal handler;

    function setUp() public override {
        super.setUp();
        address[] memory tokens = new address[](4);
        tokens[0] = address(musd);
        tokens[1] = address(btc);
        tokens[2] = address(nvda);
        vm.prank(address(0xC0FFEE));
        tokens[3] = launchpad.createToken("Curve", "CRV", "", address(0xC0FFEE));
        handler = new VaultHandler(vault, musd, tokens, feeTo);
        targetContract(address(handler));
    }

    function invariant_vault_solvent() public view {
        for (uint256 j; j < handler.tokenCount(); ++j) {
            address token = handler.tokens(j);
            uint256 sum = vault.balanceOf(feeTo, token);
            for (uint256 i; i < 3; ++i) {
                sum += vault.balanceOf(handler.actor(i), token);
            }
            assertLe(sum, MockERC20Permit(token).balanceOf(address(vault)));
        }
    }

    function invariant_vault_onlyOwnerDebits() public view {
        assertFalse(handler.unauthorizedDecrease());
    }

    function invariant_vault_noncesStepByOne() public view {
        for (uint256 i; i < 3; ++i) {
            address a = handler.actor(i);
            assertEq(vault.nonces(a), handler.ghostNonce(a));
        }
    }

    function invariant_vault_noLingeringAllowance() public view {
        for (uint256 j; j < handler.tokenCount(); ++j) {
            MockERC20Permit token = MockERC20Permit(handler.tokens(j));
            assertEq(token.allowance(address(vault), address(router)), 0);
            assertEq(token.allowance(address(vault), address(launchpad)), 0);
        }
    }
}
