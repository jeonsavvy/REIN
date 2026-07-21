import { describe, expect, it } from "vitest";
import {
  addAtomic,
  formatUsdcAtomic,
  parseUsdcDisplay,
  parseAtomic,
  safeSubtractAtomic,
} from "@/lib/proofbuy/amount";

describe("atomic USDC amounts", () => {
  it("keeps boundary values as exact integer strings", () => {
    expect(parseAtomic("0")).toBe(0n);
    expect(parseAtomic("10000")).toBe(10_000n);
    expect(parseAtomic("9007199254740993123456789")).toBe(
      9_007_199_254_740_993_123_456_789n,
    );
    expect(addAtomic("1000", "2000", "7000")).toBe("10000");
  });

  it.each(["-1", "1.5", "01", " 1", "1e3", ""]) (
    "rejects non-canonical amount %j",
    (value) => {
      expect(() => parseAtomic(value)).toThrow(
        "must be a non-negative integer string",
      );
    },
  );

  it("formats six-decimal atomic USDC without floating point math", () => {
    expect(formatUsdcAtomic("0")).toBe("0.0");
    expect(formatUsdcAtomic("1")).toBe("0.000001");
    expect(formatUsdcAtomic("1000")).toBe("0.001");
    expect(formatUsdcAtomic("1234567")).toBe("1.234567");
  });

  it("parses a human-readable USDC amount into exact atomic units", () => {
    expect(parseUsdcDisplay("0.003")).toBe("3000");
    expect(parseUsdcDisplay("1")).toBe("1000000");
    expect(parseUsdcDisplay("1.000001")).toBe("1000001");
  });

  it.each(["-1", ".003", "0.0000001", "1e-3", "01.0", ""]) (
    "rejects an invalid human-readable USDC amount %j",
    (value) => {
      expect(() => parseUsdcDisplay(value)).toThrow("USDC amount");
    },
  );

  it("blocks underflow", () => {
    expect(safeSubtractAtomic("3000", "2000")).toBe("1000");
    expect(() => safeSubtractAtomic("999", "1000")).toThrow(
      "atomic amount underflow",
    );
  });
});
