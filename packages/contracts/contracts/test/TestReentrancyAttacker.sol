// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

interface ILendingPool {
    function createLoan(uint256 _amount) external returns (uint256);
    function repayLoan(uint256 _loanId) external payable;
    function depositFunds() external payable;
}

/**
 * @title TestReentrancyAttacker
 * @dev A malicious contract for testing reentrancy protection
 * This contract should NOT be able to exploit the lending pool
 */
contract TestReentrancyAttacker {
    ILendingPool public target;
    uint256 public attackCount;
    uint256 public maxAttacks = 3;
    bool public attacking = false;

    receive() external payable {
        if (attacking && attackCount < maxAttacks) {
            attackCount++;
            // Attempt to create another loan during the callback
            try target.createLoan(0.1 ether) {} catch {}
        }
    }

    function setTarget(address _target) external {
        target = ILendingPool(_target);
    }

    function attackCreateLoan(uint256 _amount) external {
        attacking = true;
        attackCount = 0;
        target.createLoan(_amount);
        attacking = false;
    }

    function attackRepayLoan(uint256 _loanId, uint256 _value) external {
        attacking = true;
        attackCount = 0;
        target.repayLoan{value: _value}(_loanId);
        attacking = false;
    }

    // Allow the contract to receive funds for testing
    function fund() external payable {}
}