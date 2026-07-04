import { ethers } from "hardhat";
import type { AddressLike, BigNumberish, BytesLike, Signer } from "ethers";

export interface PackedUserOperationStruct {
  sender: string;
  nonce: bigint;
  initCode: string;
  callData: string;
  accountGasLimits: string;
  preVerificationGas: bigint;
  gasFees: string;
  paymasterAndData: string;
  signature: string;
}

function packHighLow(high: bigint, low: bigint): string {
  const packed = (high << 128n) | low;
  return ethers.zeroPadValue(ethers.toBeHex(packed), 32);
}

export interface BuildUserOpParams {
  sender: string;
  nonce: bigint;
  callData: string;
  initCode?: string;
  verificationGasLimit?: bigint;
  callGasLimit?: bigint;
  preVerificationGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  maxFeePerGas?: bigint;
  paymaster?: string;
  paymasterVerificationGasLimit?: bigint;
  paymasterPostOpGasLimit?: bigint;
  paymasterData?: string;
}

export function buildUnsignedUserOp(p: BuildUserOpParams): PackedUserOperationStruct {
  const verificationGasLimit = p.verificationGasLimit ?? 1_000_000n;
  const callGasLimit = p.callGasLimit ?? 1_000_000n;
  const maxPriorityFeePerGas = p.maxPriorityFeePerGas ?? ethers.parseUnits("1", "gwei");
  const maxFeePerGas = p.maxFeePerGas ?? ethers.parseUnits("20", "gwei");

  let paymasterAndData = "0x";
  if (p.paymaster) {
    const pvgl = p.paymasterVerificationGasLimit ?? 300_000n;
    const ppgl = p.paymasterPostOpGasLimit ?? 100_000n;
    paymasterAndData = ethers.concat([
      p.paymaster,
      ethers.zeroPadValue(ethers.toBeHex(pvgl), 16),
      ethers.zeroPadValue(ethers.toBeHex(ppgl), 16),
      p.paymasterData ?? "0x",
    ]);
  }

  return {
    sender: p.sender,
    nonce: p.nonce,
    initCode: p.initCode ?? "0x",
    callData: p.callData,
    accountGasLimits: packHighLow(verificationGasLimit, callGasLimit),
    preVerificationGas: p.preVerificationGas ?? 200_000n,
    gasFees: packHighLow(maxPriorityFeePerGas, maxFeePerGas),
    paymasterAndData,
    signature: "0x",
  };
}

/// Signs userOpHash the same way AgentVault.validateUserOp expects: EIP-191
/// personal-sign prefix over the raw 32-byte hash, recovered via ECDSA.recover.
export async function signUserOpHash(signer: Signer, userOpHash: BytesLike): Promise<string> {
  return signer.signMessage(ethers.getBytes(userOpHash));
}
