// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title TestNoReturnERC20
 * @dev An ERC-20 whose `transfer`, `transferFrom` and `approve` return nothing
 * at all, the way USDT's do.
 *
 * Written out by hand rather than inherited, because the whole point is a
 * signature the interface forbids: a contract calling `IERC20.transfer`
 * directly would decode a `bool` that is not there and revert on a transfer
 * that actually succeeded. That is what `SafeERC20` exists to absorb, and this
 * is what proves the pool goes through it — a pool that reached for `IERC20`
 * anywhere would be unusable with the largest stablecoin in circulation.
 *
 * Deliberately minimal and deliberately not `is IERC20`. Six decimals, like the
 * token it imitates.
 */
contract TestNoReturnERC20 {
    string public name = "No Return Token";
    string public symbol = "NRT";
    uint8 public decimals = 6;

    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error InsufficientBalance();
    error InsufficientAllowance();

    function mint(address _to, uint256 _amount) external {
        balanceOf[_to] += _amount;
        totalSupply += _amount;

        emit Transfer(address(0), _to, _amount);
    }

    /// @dev Returns nothing. This is the point of the fixture.
    function approve(address _spender, uint256 _amount) external {
        allowance[msg.sender][_spender] = _amount;

        emit Approval(msg.sender, _spender, _amount);
    }

    /// @dev Returns nothing. This is the point of the fixture.
    function transfer(address _to, uint256 _amount) external {
        _move(msg.sender, _to, _amount);
    }

    /// @dev Returns nothing. This is the point of the fixture.
    function transferFrom(
        address _from,
        address _to,
        uint256 _amount
    ) external {
        uint256 allowed = allowance[_from][msg.sender];
        if (allowed < _amount) revert InsufficientAllowance();

        // An infinite allowance is left alone, as most implementations do.
        if (allowed != type(uint256).max) {
            allowance[_from][msg.sender] = allowed - _amount;
        }

        _move(_from, _to, _amount);
    }

    function _move(address _from, address _to, uint256 _amount) private {
        uint256 balance = balanceOf[_from];
        if (balance < _amount) revert InsufficientBalance();

        balanceOf[_from] = balance - _amount;
        balanceOf[_to] += _amount;

        emit Transfer(_from, _to, _amount);
    }
}
