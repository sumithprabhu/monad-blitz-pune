import { parseAbi } from "viem";

/** Just enough of IEntryPoint to compute a nonce and a userOpHash for signing. */
export const entryPointAbi = parseAbi([
  "function getNonce(address sender, uint192 key) view returns (uint256)",
  "function getUserOpHash((address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature) userOp) view returns (bytes32)",
]);
