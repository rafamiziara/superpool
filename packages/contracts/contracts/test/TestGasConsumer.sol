// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/**
 * @title TestGasConsumer
 * @dev A contract that consumes a lot of gas in its receive function
 * Used to test gas limits and handling of high gas consumption
 */
contract TestGasConsumer {
    uint256 public counter;
    mapping(uint256 => uint256) public data;

    // Consume gas by doing pointless computation
    receive() external payable {
        // Perform expensive operations to consume gas
        for (uint256 i = 0; i < 100; i++) {
            counter++;
            data[counter] = block.timestamp + i;
            // Hash operations to consume more gas
            keccak256(abi.encodePacked(counter, block.timestamp, i));
        }
    }

    function fundMe() external payable {
        // Simple funding function without gas consumption
    }

    function getCounter() external view returns (uint256) {
        return counter;
    }
}