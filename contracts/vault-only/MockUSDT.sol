// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title  MockUSDT
 * @notice Minimal ERC-20 token for local/testnet testing.
 *         Mirrors real USDT: 6 decimals, no return value on transfer/transferFrom
 *         (non-standard USDT behaviour — tests our safeTransfer wrappers).
 */
contract MockUSDT {

    string  public constant name     = "Mock USDT";
    string  public constant symbol   = "USDT";
    uint8   public constant decimals = 6;

    uint256 public totalSupply;

    mapping(address => uint256)                     public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    address public immutable minter;

    constructor() {
        minter = msg.sender;
    }

    /// @notice Mint tokens (test helper).
    function mint(address to, uint256 amount) external {
        require(msg.sender == minter, "MockUSDT: not minter");
        totalSupply        += amount;
        balanceOf[to]      += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    // USDT does NOT return a bool — intentional, tests _safeTransfer logic.
    function transfer(address to, uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "MockUSDT: insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to]         += amount;
        emit Transfer(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) external {
        require(balanceOf[from] >= amount,              "MockUSDT: insufficient balance");
        require(allowance[from][msg.sender] >= amount,  "MockUSDT: insufficient allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from]             -= amount;
        balanceOf[to]               += amount;
        emit Transfer(from, to, amount);
    }
}
