// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

interface ILendingPool {
    function createLoan(uint256 _amount) external returns (uint256);
    function depositFunds() external payable;
}

/**
 * @title TestRejectingContract
 * @dev A contract that always reverts when receiving ETH
 * Used to test how the lending pool handles failed transfers
 */
contract TestRejectingContract {
    
    // Always revert when receiving ETH
    receive() external payable {
        revert("I reject all payments");
    }

    // Allow funding through this function for testing
    function fundMe() external payable {
        // Accept payments through this function only
    }

    function createLoan(address _pool, uint256 _amount) external {
        ILendingPool(_pool).createLoan(_amount);
    }

    function depositFunds(address _pool) external payable {
        ILendingPool(_pool).depositFunds{value: msg.value}();
    }
}