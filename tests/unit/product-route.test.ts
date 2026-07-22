import { describe, expect, it } from "vitest";
import { canonicalProductUrl } from "@/lib/rein/public-origin";

describe("canonicalProductUrl", () => {
  it("replaces the internal Cloud Run origin without changing the paid resource", () => {
    const actual = canonicalProductUrl(
      new URL(
        "https://0.0.0.0:8080/api/products/market-snapshot?snapshotId=snap_123",
      ),
      "https://rein.example",
    );

    expect(actual.toString()).toBe(
      "https://rein.example/api/products/market-snapshot?snapshotId=snap_123",
    );
  });

  it("rejects a non-HTTPS public origin", () => {
    expect(() =>
      canonicalProductUrl(
        new URL("http://127.0.0.1:8080/api/products/github-health"),
        "http://rein.example",
      ),
    ).toThrow("APP_BASE_URL must use HTTPS");
  });
});
