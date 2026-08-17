// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title TestFeeOnTransferERC20
 * @dev An ERC-20 that burns a percentage of every transfer, so the recipient
 * receives less than the sender sent.
 *
 * This is the token that catches the worst bug available in the ERC-20 work.
 * A pool that credits the amount it *asked* for rather than the amount that
 * *arrived* over-states `contributions` — and, far worse, `totalContributions`,
 * which is the denominator every interest distribution divides by. Every other
 * lender in that pool is then diluted for as long as it exists, silently, with
 * nothing on chain to reconcile against.
 *
 * No well-behaved stablecoin does this, and the allowlist is meant to keep such
 * tokens out. The pool measures the balance either side of the transfer anyway,
 * because "we decided not to allow those" is not a property the accounting can
 * rest on.
 *
 * Minting and burning pass through untaxed; a fee on minting would just make
 * the fixtures lie about how much they created.
 */
contract TestFeeOnTransferERC20 is ERC20 {
    uint8 private immutable _customDecimals;

    /// @dev Share of every transfer that is burned, in basis points.
    uint256 public feeBasisPoints;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 feeBasisPoints_
    ) ERC20(name_, symbol_) {
        _customDecimals = decimals_;
        feeBasisPoints = feeBasisPoints_;
    }

    function decimals() public view override returns (uint8) {
        return _customDecimals;
    }

    function mint(address _to, uint256 _amount) external {
        _mint(_to, _amount);
    }

    function setFeeBasisPoints(uint256 _feeBasisPoints) external {
        feeBasisPoints = _feeBasisPoints;
    }

    function _update(
        address _from,
        address _to,
        uint256 _value
    ) internal override {
        // Mints and burns are not transfers between holders, and taxing them
        // would only make the test fixtures inexact.
        if (_from == address(0) || _to == address(0) || feeBasisPoints == 0) {
            super._update(_from, _to, _value);

            return;
        }

        uint256 fee = Math.mulDiv(_value, feeBasisPoints, 10000);

        super._update(_from, _to, _value - fee);

        // Burned rather than paid to a collector: the sender is debited the
        // full `_value` across the two calls either way, and a collector would
        // be one more balance for a test to have to account for.
        if (fee > 0) super._update(_from, address(0), fee);
    }
}
