// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Base} from "../Base.t.sol";
import {MockERC20Permit} from "../../src/mocks/MockERC20Permit.sol";
import {MusdyVault} from "../../src/MusdyVault.sol";
import {IMusdyVault} from "../../src/interfaces/IMusdyVault.sol";
import {IMusdyLaunchpad} from "../../src/interfaces/IMusdyLaunchpad.sol";

contract VaultHandler is Test {
    MusdyVault public vault;
    MockERC20Permit public musd;
    address public launchpad;
    address public router;
    address[] public tokens;
    uint256[3] internal keys = [uint256(0x5001), 0x5002, 0x5003];
    address public feeTo;

    address public vaultOwner;

    mapping(address => uint256) public ghostNonce;
    bool public unauthorizedDecrease;
    bool public sweepMisCredited;
    uint256 public replaySuccess;
    uint256 public tamperSuccess;
    uint256 public launches;
    uint256 public sweeps;
    uint256 public tradeTries;
    uint256 public trades;
    uint256 public withdrawTries;
    uint256 public withdraws;
    uint256 public launchTries;

    address public solver;
    uint256 public ghostSolverMusd;
    uint256 public intentsOpened;
    uint256 public intentsClosed;
    uint256 public doubleClose;
    bytes32[] internal openIds;
    bytes32[] internal closedIds;

    IMusdyVault.Trade[] internal doneTrades;
    bytes[] internal doneTradeSigs;
    IMusdyVault.Withdraw[] internal doneWithdraws;
    bytes[] internal doneWithdrawSigs;

    bytes32 internal constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    constructor(
        MusdyVault vault_,
        MockERC20Permit musd_,
        address[] memory tokens_,
        address feeTo_,
        address vaultOwner_
    ) {
        vault = vault_;
        musd = musd_;
        launchpad = vault.launchpad();
        router = vault.router();
        tokens = tokens_;
        feeTo = feeTo_;
        vaultOwner = vaultOwner_;
        solver = vault.solver();
    }

    function actor(uint256 i) public view returns (address) {
        return vm.addr(keys[i % 3]);
    }

    function tokenCount() external view returns (uint256) {
        return tokens.length;
    }

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

    function _cash(address a) internal returns (uint256 bal) {
        bal = vault.balanceOf(a, address(musd));
        if (bal >= 1e18) return bal;
        musd.mint(a, 10_000e18);
        vm.startPrank(a);
        musd.approve(address(vault), 10_000e18);
        vault.deposit(address(musd), 10_000e18, a);
        vm.stopPrank();
        bal += 10_000e18;
    }

    function trade(uint256 who, uint256 tSeed, bool isBuy, uint256 amount) external watch(who) {
        address a = actor(who);
        address token = tokens[1 + tSeed % (tokens.length - 1)];
        if (!isBuy && vault.balanceOf(a, token) == 0) isBuy = true;
        uint256 bal = isBuy ? _cash(a) : vault.balanceOf(a, token);
        amount = bound(amount, bal < 1e12 ? bal : 1e12, bal);
        IMusdyVault.Trade memory t =
            IMusdyVault.Trade(a, token, isBuy, amount, 0, address(0), vault.nonces(a), block.timestamp + 1);
        bytes memory sig = _sig(who, vault.hashTrade(t));
        tradeTries++;
        try vault.executeTrade(t, sig) {
            ghostNonce[a]++;
            trades++;
            doneTrades.push(t);
            doneTradeSigs.push(sig);
        } catch {}
    }

    function _withdrawable(address a, uint256 tSeed) internal returns (address token, uint256 bal) {
        token = tokens[tSeed % tokens.length];
        bal = vault.balanceOf(a, token);
        if (bal == 0 || IMusdyLaunchpad(launchpad).isCurve(token)) {
            token = address(musd);
            bal = _cash(a);
        }
    }

    function withdrawSigned(uint256 who, uint256 tSeed, uint256 amount) external watch(who) {
        address a = actor(who);
        (address token, uint256 bal) = _withdrawable(a, tSeed);
        amount = bound(amount, 1, bal);
        IMusdyVault.Withdraw memory w =
            IMusdyVault.Withdraw(a, token, amount, address(0xBEEF), vault.nonces(a), block.timestamp + 1);
        bytes memory sig = _sig(who, vault.hashWithdraw(w));
        withdrawTries++;
        try vault.executeWithdraw(w, sig) {
            ghostNonce[a]++;
            withdraws++;
            doneWithdraws.push(w);
            doneWithdrawSigs.push(sig);
        } catch {}
    }

    function replay(uint256 idx, bool asTrade) external watch(type(uint256).max) {
        if (asTrade && doneTrades.length > 0) {
            uint256 i = idx % doneTrades.length;
            try vault.executeTrade(doneTrades[i], doneTradeSigs[i]) {
                replaySuccess++;
            } catch {}
        } else if (doneWithdraws.length > 0) {
            uint256 i = idx % doneWithdraws.length;
            try vault.executeWithdraw(doneWithdraws[i], doneWithdrawSigs[i]) {
                replaySuccess++;
            } catch {}
        }
    }

    function tamper(uint256 who, uint256 field, uint256 seed) external watch(type(uint256).max) {
        address a = actor(who);
        uint256 mode = field % 3;
        if (mode == 0) {
            uint256 bal = vault.balanceOf(a, address(musd));
            if (bal == 0) return;
            IMusdyVault.Withdraw memory w =
                IMusdyVault.Withdraw(a, address(musd), bal, a, vault.nonces(a), block.timestamp + 1);
            bytes memory sig = _sig(who, vault.hashWithdraw(w));
            w.to = address(uint160(bound(seed, 1, type(uint160).max)));
            if (w.to == a) w.to = address(0xBAD);
            try vault.executeWithdraw(w, sig) {
                tamperSuccess++;
            } catch {}
            return;
        }
        uint256 musdBal = vault.balanceOf(a, address(musd));
        if (musdBal < 2) return;
        IMusdyVault.Trade memory t =
            IMusdyVault.Trade(a, tokens[1], true, musdBal / 2, 0, address(0), vault.nonces(a), block.timestamp + 1);
        bytes memory tsig = _sig(who, vault.hashTrade(t));
        if (mode == 1) {
            t.amountIn = bound(seed, 1, musdBal);
            if (t.amountIn == musdBal / 2) t.amountIn = musdBal;
        } else {
            t.token = tokens[2 + seed % (tokens.length - 2)];
        }
        try vault.executeTrade(t, tsig) {
            tamperSuccess++;
        } catch {}
    }

    function launch(uint256 who, uint256 buy) external watch(who) {
        address a = actor(who);
        uint256 initialBuy = buy % 3 == 0 ? 0 : bound(buy, 1e15, _cash(a) / 5);
        IMusdyVault.Launch memory l =
            IMusdyVault.Launch(a, "Inv Coin", "INV", "", initialBuy, vault.nonces(a), block.timestamp + 1);
        launchTries++;
        try vault.executeLaunch(l, _sig(who, vault.hashLaunch(l))) returns (address token, uint256) {
            ghostNonce[a]++;
            launches++;
            tokens.push(token);
        } catch {}
    }

    function depositWithPermitRelayed(uint256 who, uint256 by, uint256 amount) external watch(type(uint256).max) {
        if (who % 3 == by % 3) return;
        address o = actor(who);
        address caller = actor(by);
        amount = bound(amount, 1, 50_000e18);
        musd.mint(o, amount);
        uint256 ownerBefore = vault.balanceOf(o, address(musd));
        uint256 callerBefore = vault.balanceOf(caller, address(musd));
        _relayPermit(who, caller, amount);
        sweeps++;
        if (vault.balanceOf(o, address(musd)) != ownerBefore + amount) sweepMisCredited = true;
        if (vault.balanceOf(caller, address(musd)) != callerBefore) sweepMisCredited = true;
    }

    function setFee(uint256 who, uint256 bps) external watch(type(uint256).max) {
        address recipient = who % 4 == 3 ? feeTo : actor(who);
        uint16 b = uint16(bound(bps, 0, vault.MAX_FEE_BPS()));
        vm.prank(vaultOwner);
        vault.setFee(recipient, b);
    }

    function escape(uint256 who, uint256 tSeed, uint256 amount) external watch(who) {
        address a = actor(who);
        (address token, uint256 bal) = _withdrawable(a, tSeed);
        amount = bound(amount, 1, bal);
        withdrawTries++;
        vm.prank(a);
        try vault.withdraw(token, amount, a) {
            withdraws++;
        } catch {}
    }

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

    function openIntent(uint256 who, bool isBuy, uint256 amount) external watch(who) {
        address a = actor(who);
        uint256 bal = isBuy ? _cash(a) : type(uint128).max;
        amount = bound(amount, 1, bal);
        IMusdyVault.Intent memory i = IMusdyVault.Intent(
            a,
            isBuy,
            8453,
            "0x4200000000000000000000000000000000000006",
            amount,
            0,
            address(0),
            vault.nonces(a),
            block.timestamp + 1
        );
        bytes32 id = vault.executeIntent(i, _sig(who, vault.hashIntent(i)));
        ghostNonce[a]++;
        intentsOpened++;
        if (isBuy) ghostSolverMusd += amount;
        openIds.push(id);
    }

    function settleIntent(uint256 idx, uint256 pay, bool ok) external watch(type(uint256).max) {
        if (openIds.length == 0) return;
        bytes32 id = _takeOpen(idx);
        (address user,,,,) = vault.intents(id);
        pay = bound(pay, 0, ghostSolverMusd);
        vm.prank(solver);
        vault.settleIntent(id, user, pay, pay / 3, ok);
        ghostSolverMusd -= pay;
        intentsClosed++;
    }

    function refundIntent(uint256 idx, uint256 wait) external watch(type(uint256).max) {
        if (openIds.length == 0) return;
        uint256 j = idx % openIds.length;
        bytes32 id = openIds[j];
        (address user, bool isBuy, uint256 amountIn, uint256 openedAt,) = vault.intents(id);
        if (!isBuy) return;
        vm.warp(
            openedAt + 1 hours + bound(wait, 0, 1 days) > block.timestamp
                ? openedAt + 1 hours + bound(wait, 0, 1 days)
                : block.timestamp
        );
        if (ghostSolverMusd < amountIn) _solverDeposit(amountIn - ghostSolverMusd);
        vm.prank(user);
        vault.refundIntent(id);
        _takeOpen(j);
        ghostSolverMusd -= amountIn;
        intentsClosed++;
    }

    function closeTwice(uint256 idx, bool asRefund) external watch(type(uint256).max) {
        if (closedIds.length == 0) return;
        bytes32 id = closedIds[idx % closedIds.length];
        (address user,,,,) = vault.intents(id);
        vm.warp(block.timestamp + 2 hours);
        vm.prank(asRefund ? user : solver);
        if (asRefund) {
            try vault.refundIntent(id) {
                doubleClose++;
            } catch {}
        } else {
            try vault.settleIntent(id, user, 0, 0, true) {
                doubleClose++;
            } catch {}
        }
    }

    function _solverDeposit(uint256 amount) internal {
        musd.mint(solver, amount);
        vm.startPrank(solver);
        musd.approve(address(vault), amount);
        vault.deposit(address(musd), amount, solver);
        vm.stopPrank();
        ghostSolverMusd += amount;
    }

    function _takeOpen(uint256 idx) internal returns (bytes32 id) {
        uint256 j = idx % openIds.length;
        id = openIds[j];
        openIds[j] = openIds[openIds.length - 1];
        openIds.pop();
        closedIds.push(id);
    }

    function _relayPermit(uint256 who, address caller, uint256 amount) internal {
        address o = actor(who);
        uint256 deadline = block.timestamp + 1;
        bytes32 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, o, address(vault), amount, musd.nonces(o), deadline));
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(keys[who % 3], keccak256(abi.encodePacked("\x19\x01", musd.DOMAIN_SEPARATOR(), structHash)));
        vm.prank(caller);
        vault.depositWithPermit(o, address(musd), amount, deadline, v, r, s);
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
        handler = new VaultHandler(vault, musd, tokens, feeTo, owner);
        targetContract(address(handler));
    }

    function invariant_vault_solvent() public view {
        for (uint256 j; j < handler.tokenCount(); ++j) {
            address token = handler.tokens(j);
            uint256 sum = vault.balanceOf(feeTo, token) + vault.balanceOf(handler.solver(), token);
            for (uint256 i; i < 3; ++i) {
                sum += vault.balanceOf(handler.actor(i), token);
            }
            assertLe(sum, MockERC20Permit(token).balanceOf(address(vault)));
        }
    }

    function invariant_vault_onlyOwnerDebits() public view {
        assertFalse(handler.unauthorizedDecrease());
    }

    function invariant_vault_solverHoldsOpenIntentCash() public view {
        assertEq(vault.balanceOf(handler.solver(), address(musd)), handler.ghostSolverMusd());
    }

    function invariant_vault_intentSettlesOnce() public view {
        assertEq(handler.doubleClose(), 0);
    }

    function test_vault_intentActionsHold() public {
        for (uint256 i; i < 300; ++i) {
            uint256 r = uint256(keccak256(abi.encode("intent", i)));
            uint256 k = r % 4;
            if (k == 0) handler.openIntent(r >> 8, (r >> 16) % 3 != 0, r >> 32);
            else if (k == 1) handler.settleIntent(r >> 8, r >> 32, (r >> 16) % 2 == 0);
            else if (k == 2) handler.refundIntent(r >> 8, r >> 32);
            else handler.closeTwice(r >> 8, (r >> 16) % 2 == 0);
        }
        emit log_named_uint("intents opened", handler.intentsOpened());
        emit log_named_uint("intents closed", handler.intentsClosed());
        assertGe(handler.intentsOpened(), 50);
        assertGe(handler.intentsClosed(), 40);
        invariant_vault_solvent();
        invariant_vault_solverHoldsOpenIntentCash();
        invariant_vault_intentSettlesOnce();
        invariant_vault_noncesStepByOne();
        assertFalse(handler.unauthorizedDecrease());
    }

    function invariant_vault_noncesStepByOne() public view {
        for (uint256 i; i < 3; ++i) {
            address a = handler.actor(i);
            assertEq(vault.nonces(a), handler.ghostNonce(a));
        }
    }

    function invariant_vault_noReplay() public view {
        assertEq(handler.replaySuccess(), 0);
    }

    function invariant_vault_noTamper() public view {
        assertEq(handler.tamperSuccess(), 0);
    }

    function invariant_vault_permitSweepCreditsOwnerOnly() public view {
        assertFalse(handler.sweepMisCredited());
    }

    function afterInvariant() public view {
        _assertMostlySucceeded(handler.trades(), handler.tradeTries());
        _assertMostlySucceeded(handler.withdraws(), handler.withdrawTries());
        _assertMostlySucceeded(handler.launches(), handler.launchTries());
        assertGe(handler.trades() + handler.withdraws() + handler.launches() + handler.sweeps(), 2);
    }

    function _assertMostlySucceeded(uint256 ok, uint256 tries) internal pure {
        assertGe(ok * 10, tries * 9, "under 90% of attempts succeeded");
    }

    function test_vault_handlerActionsSucceed() public {
        for (uint256 i; i < 400; ++i) {
            uint256 r = uint256(keccak256(abi.encode(i)));
            uint256 k = r % 5;
            if (k == 0) handler.trade(r >> 8, r >> 16, (r >> 24) % 2 == 0, r >> 32);
            else if (k == 1) handler.withdrawSigned(r >> 8, r >> 16, r >> 32);
            else if (k == 2) handler.escape(r >> 8, r >> 16, r >> 32);
            else if (k == 3) handler.launch(r >> 8, r >> 32);
            else handler.depositWithPermitRelayed(r >> 8, (r >> 8) + 1 + (r >> 16) % 2, r >> 32);
        }
        emit log_named_uint("trades", handler.trades());
        emit log_named_uint("withdraws", handler.withdraws());
        emit log_named_uint("launches", handler.launches());
        emit log_named_uint("permit deposits", handler.sweeps());
        assertGe(handler.trades(), 60);
        assertGe(handler.withdraws(), 120);
        assertGe(handler.launches(), 60);
        assertGe(handler.sweeps(), 60);
        afterInvariant();
        assertFalse(handler.unauthorizedDecrease());
        assertFalse(handler.sweepMisCredited());
    }

    function invariant_vault_noLingeringAllowance() public view {
        for (uint256 j; j < handler.tokenCount(); ++j) {
            MockERC20Permit token = MockERC20Permit(handler.tokens(j));
            assertEq(token.allowance(address(vault), address(router)), 0);
            assertEq(token.allowance(address(vault), address(launchpad)), 0);
        }
    }
}
