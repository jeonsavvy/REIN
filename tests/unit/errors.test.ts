import { describe, expect, it } from "vitest";
import { toRunError } from "@/lib/proofbuy/errors";

describe("timeout error mapping", () => {
  it.each(["AbortError", "TimeoutError"])("maps %s to the visible timeout state", (name) => {
    const error = new Error("deadline exceeded");
    error.name = name;
    expect(toRunError(error).code).toBe("MODEL_TIMEOUT");
  });
});
