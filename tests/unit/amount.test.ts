import { describe, expect, it } from "vitest";
import {
  addAtomic,
  formatUsdcAtomic,
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

  it("blocks underflow", () => {
    expect(safeSubtractAtomic("3000", "2000")).toBe("1000");
    expect(() => safeSubtractAtomic("999", "1000")).toThrow(
      "atomic amount underflow",
    );
  });
});
