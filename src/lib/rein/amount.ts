import { USDC_DECIMALS } from "./constants";

const ATOMIC_PATTERN = /^(0|[1-9]\d*)$/;
const USDC_PATTERN = /^(?:0|[1-9]\d*)(?:\.(\d{0,6}))?$/;

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

export function parseUsdcDisplay(value: string, field = "amount"): string {
  const normalized = value.trim();
  const match = USDC_PATTERN.exec(normalized);
  if (!match) {
    throw new Error(`${field} must be a non-negative USDC amount with up to 6 decimals`);
  }
  const [whole = "0"] = normalized.split(".");
  const fraction = (match[1] ?? "").padEnd(USDC_DECIMALS, "0");
  return (BigInt(whole) * 10n ** BigInt(USDC_DECIMALS) + BigInt(fraction || "0")).toString();
}

export function safeSubtractAtomic(left: string, right: string): string {
  const result = parseAtomic(left) - parseAtomic(right);
  if (result < 0n) throw new Error("atomic amount underflow");
  return result.toString();
}
