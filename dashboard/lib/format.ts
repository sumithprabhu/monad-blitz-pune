import { formatUnits, parseUnits } from "viem";
import { tokenDecimals } from "./config";

export function formatUsdc(amount: bigint | undefined): string {
  if (amount === undefined) return "—";
  const n = Number(formatUnits(amount, tokenDecimals));
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function parseUsdc(amount: string): bigint {
  return parseUnits(amount || "0", tokenDecimals);
}

export function formatRelativeTime(unixSeconds: bigint | number): string {
  const ms = Number(unixSeconds) * 1000;
  const diff = Date.now() - ms;
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatExpiry(validUntil: bigint): string {
  if (validUntil === 0n) return "never";
  const ms = Number(validUntil) * 1000;
  if (ms < Date.now()) return "expired";
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
