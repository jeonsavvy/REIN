import { USDC_DECIMALS } from "./constants";

const ATOMIC_PATTERN = /^(0|[1-9]\d*)$/;

export function parseAtomic(value: string, field = "amount"): bigint {
  if (!ATOMIC_PATTERN.test(value)) {
    throw new Error(`${field} must be a non-negative integer string`);
  }
  return BigInt(value);
}

export function addAtomic(...values: string[]): string {
  return values.reduce((sum, value) => sum + parseAtomic(value), 0n).toString();
}

export function formatUsdcAtomic(value: string): string {
  const amount = parseAtomic(value);
  const scale = 10n ** BigInt(USDC_DECIMALS);
  const whole = amount / scale;
  const fraction = (amount % scale).toString().padStart(USDC_DECIMALS, "0");
  const trimmed = fraction.replace(/0+$/, "");
  return `${whole.toString()}.${trimmed || "0"}`;
}

export function safeSubtractAtomic(left: string, right: string): string {
  const result = parseAtomic(left) - parseAtomic(right);
  if (result < 0n) throw new Error("atomic amount underflow");
  return result.toString();
}
