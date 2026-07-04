import { encodeFunctionData, toHex, type Address } from "viem";
import { agentVaultAbi } from "../abi.js";
import { entryPointAbi } from "./entryPointAbi.js";
import { publicClient, getAgentAccount, getAgentWalletClient } from "../chain.js";
import { config, requireVaultAddress } from "../config.js";
import {
  estimateUserOperationGas,
  getUserOperationGasPrice,
  pollUserOperationReceipt,
  sendUserOperation,
  sponsorUserOperation,
  type UnpackedUserOperation,
} from "./bundlerClient.js";

/**
 * Door 2: agent signs a UserOperation off-chain and a bundler submits it -
 * the agent never sends a transaction or pays gas itself. Same policy engine
 * as Door 1 (AgentVault.executeFromEntryPoint -> _authorizeAndSpend), reached
 * through EntryPoint validation instead of a direct call.
 *
 * Best-effort against Pimlico's documented v0.7 bundler API; verify the
 * exact RPC method names/shapes against Pimlico's current Monad-testnet
 * docs before relying on this in a live demo (see README "Door 2" section).
 */
export async function spendGasless(to: Address, amount: bigint, memo: string, opts: { sponsored?: boolean } = {}) {
  const vaultAddress = requireVaultAddress();
  const account = getAgentAccount();
  const { walletClient } = getAgentWalletClient();

  const callData = encodeFunctionData({
    abi: agentVaultAbi,
    functionName: "executeFromEntryPoint",
    args: [account.address, to, amount, memo],
  });

  const nonce = await publicClient.readContract({
    address: config.entryPointAddress,
    abi: entryPointAbi,
    functionName: "getNonce",
    args: [vaultAddress, 0n],
  });

  const gasPrice = await getUserOperationGasPrice();

  let userOp: UnpackedUserOperation = {
    sender: vaultAddress,
    nonce: toHex(nonce),
    callData,
    callGasLimit: toHex(500_000n),
    verificationGasLimit: toHex(500_000n),
    preVerificationGas: toHex(100_000n),
    maxFeePerGas: gasPrice.fast.maxFeePerGas,
    maxPriorityFeePerGas: gasPrice.fast.maxPriorityFeePerGas,
    signature: "0x",
  };

  if (opts.sponsored ?? true) {
    const sponsorship = await sponsorUserOperation(userOp);
    userOp = { ...userOp, ...sponsorship };
  }

  const estimate = await estimateUserOperationGas(userOp);
  userOp = { ...userOp, ...estimate };

  // Compute the exact hash the EntryPoint will use, then sign it the same
  // way AgentVault.validateUserOp expects (EIP-191 personal-sign over the
  // raw 32-byte hash).
  const packedForHash = {
    sender: userOp.sender,
    nonce,
    initCode: "0x" as const,
    callData: userOp.callData,
    accountGasLimits: packHighLow(BigInt(userOp.verificationGasLimit), BigInt(userOp.callGasLimit)),
    preVerificationGas: BigInt(userOp.preVerificationGas),
    gasFees: packHighLow(BigInt(userOp.maxPriorityFeePerGas), BigInt(userOp.maxFeePerGas)),
    paymasterAndData: buildPaymasterAndData(userOp),
    signature: "0x" as const,
  };

  const userOpHash = await publicClient.readContract({
    address: config.entryPointAddress,
    abi: entryPointAbi,
    functionName: "getUserOpHash",
    args: [packedForHash],
  });

  const signature = await walletClient.signMessage({ message: { raw: userOpHash } });
  userOp = { ...userOp, signature };

  const submittedHash = await sendUserOperation(userOp);
  console.log(`  UserOperation submitted: ${submittedHash}`);

  const receipt = await pollUserOperationReceipt(submittedHash);
  console.log(`  landed in tx ${receipt.receipt.transactionHash}, success=${receipt.success}`);
  return receipt;
}

function packHighLow(high: bigint, low: bigint): `0x${string}` {
  const packed = (high << 128n) | low;
  return toHex(packed, { size: 32 });
}

function buildPaymasterAndData(userOp: UnpackedUserOperation): `0x${string}` {
  if (!userOp.paymaster) return "0x";
  const pvgl = toHex(BigInt(userOp.paymasterVerificationGasLimit ?? "0x0"), { size: 16 }).slice(2);
  const ppgl = toHex(BigInt(userOp.paymasterPostOpGasLimit ?? "0x0"), { size: 16 }).slice(2);
  const data = (userOp.paymasterData ?? "0x").slice(2);
  return `0x${userOp.paymaster.slice(2)}${pvgl}${ppgl}${data}`;
}
