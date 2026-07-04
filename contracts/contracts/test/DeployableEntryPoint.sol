// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Pulls the reference EntryPoint v0.7 implementation into the compilation graph so
// Hardhat produces artifacts/typechain bindings we can deploy locally in tests.
// On Monad testnet we point at the canonical, already-deployed EntryPoint instead.
import {EntryPoint} from "@account-abstraction/contracts/core/EntryPoint.sol";
