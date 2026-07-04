// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Minimal mock USDC (6 decimals) used as the demo settlement asset for AgentVault.
/// @dev Anyone can mint on testnet so the demo is self-serve; not for production use.
contract MockUSDC is ERC20, Ownable {
    uint8 private constant DECIMALS = 6;

    constructor(address initialOwner) ERC20("Mock USDC", "mUSDC") Ownable(initialOwner) {
        _mint(initialOwner, 1_000_000 * 10 ** DECIMALS);
    }

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    /// @notice Open faucet mint so anyone can top up for the demo/testnet.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
