"use client";

import { useWriteContract } from "wagmi";
import { monadTestnet } from "./chain";

/**
 * Wraps wagmi's useWriteContract to always pin `chainId: monadTestnet.id`.
 *
 * Without this, wagmi sends a write on whatever network the connected wallet (MetaMask,
 * etc.) currently happens to have selected - which is very often NOT Monad testnet, since
 * external wallets remember whatever chain was last active in a different dApp. Pinning the
 * chainId here makes wagmi request a network switch (and add the chain if MetaMask doesn't
 * know it yet) before submitting, instead of silently trying to send the tx on the wrong chain.
 *
 * `writeContractAsync`/`writeContract` are cast back to wagmi's own (highly generic, per-ABI
 * overloaded) types rather than typed from `Parameters<...>`, which would collapse the
 * overloads to one concrete shape and break type inference at call sites with different ABIs.
 */
export function useVaultWriteContract() {
  const { writeContractAsync: rawAsync, writeContract: rawSync, ...rest } = useWriteContract();

  const writeContractAsync = ((args: Record<string, unknown>, options?: unknown) =>
    (rawAsync as (a: unknown, o?: unknown) => unknown)({ ...args, chainId: monadTestnet.id }, options)) as typeof rawAsync;

  const writeContract = ((args: Record<string, unknown>, options?: unknown) =>
    (rawSync as (a: unknown, o?: unknown) => unknown)({ ...args, chainId: monadTestnet.id }, options)) as typeof rawSync;

  return { writeContractAsync, writeContract, ...rest };
}
