// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title TestERC20
 * @dev A well-behaved ERC-20 with configurable decimals, for testing pools
 * denominated in a token.
 *
 * Decimals are a constructor argument rather than the usual 18 because the
 * whole point of the stablecoin work is that USDC has **6**, and a test token
 * that quietly had 18 would let an off-by-10^12 through every assertion in the
 * suite. Anything exercising a token pool should deploy this with 6 unless it
 * is specifically checking that 18 still behaves.
 *
 * One opt-in misbehaviour, off by default: `setRejectsZeroTransfers`. Some real
 * ERC-20s revert rather than move nothing, and OpenZeppelin's does not — so
 * without this flag a test of the pool's zero-value guard would pass whether
 * the guard existed or not.
 *
 * `mint` is open to anyone. This is a test fixture and there is nothing to
 * protect.
 */
contract TestERC20 is ERC20 {
    uint8 private immutable _customDecimals;

    /// @dev Whether a transfer of nothing reverts, as some real tokens do.
    bool public rejectsZeroTransfers;

    error ZeroValueTransfer();

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) ERC20(name_, symbol_) {
        _customDecimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _customDecimals;
    }

    function mint(address _to, uint256 _amount) external {
        _mint(_to, _amount);
    }

    function setRejectsZeroTransfers(bool _rejects) external {
        rejectsZeroTransfers = _rejects;
    }

    function _update(
        address _from,
        address _to,
        uint256 _value
    ) internal override {
        if (rejectsZeroTransfers && _value == 0) revert ZeroValueTransfer();

        super._update(_from, _to, _value);
    }
}
