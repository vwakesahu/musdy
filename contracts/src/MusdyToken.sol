// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// launch token, locked to curve trades until the launchpad graduates it
contract MusdyToken is ERC20 {
    address public immutable launchpad;
    string public image;
    bool public unlocked;

    event Unlocked();

    error Locked();
    error OnlyLaunchpad();

    constructor(string memory name_, string memory symbol_, string memory image_, uint256 supply)
        ERC20(name_, symbol_)
    {
        launchpad = msg.sender;
        image = image_;
        _mint(msg.sender, supply);
    }

    function unlock() external {
        if (msg.sender != launchpad) revert OnlyLaunchpad();
        unlocked = true;
        emit Unlocked();
    }

    function _update(address from, address to, uint256 value) internal override {
        if (!unlocked && from != launchpad && to != launchpad) revert Locked();
        super._update(from, to, value);
    }
}
