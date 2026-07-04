// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BasePaymaster} from "@account-abstraction/contracts/core/BasePaymaster.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";

/// @notice Minimal "sponsor everything" paymaster used to exercise the gasless Door 2 flow
/// in tests and local demos. A production deployment would use Pimlico's verifying paymaster
/// on Monad testnet instead of this contract.
contract TestPaymaster is BasePaymaster {
    constructor(IEntryPoint _entryPoint) BasePaymaster(_entryPoint) {}

    function _validatePaymasterUserOp(
        PackedUserOperation calldata /*userOp*/,
        bytes32 /*userOpHash*/,
        uint256 /*maxCost*/
    ) internal pure override returns (bytes memory context, uint256 validationData) {
        return ("", 0);
    }
}
