import { afterEach, describe, expect, it, vi } from "vitest";
import { sha256 } from "@/lib/proofbuy/crypto";
import {
  LiveX402PaymentGateway,
  validatePaidSnapshot,
  x402SettlementFailure,
  x402TransportFailure,
} from "@/lib/proofbuy/payment";
import type { MarketSnapshotData, Snapshot } from "@/lib/proofbuy/types";
import { paymentRecord } from "./helpers";

const data: MarketSnapshotData = {
  kind: "market_snapshot",
  asOf: "2026-07-21T00:00:00.000Z",
  assets: [
    { symbol: "SOL", priceUsd: 180, change24hPct: 2, marketCapUsd: 80_000_000_000 },
    { symbol: "ETH", priceUsd: 4_800, change24hPct: 1, marketCapUsd: 580_000_000_000 },
  ],
};
const requestHash = sha256(JSON.stringify(data));
const snapshot: Snapshot = {
  id: "snapshot_market_snapshot",
  productId: "market_snapshot",
  sourceName: "fixture",
  sourceUrl: "https://api.coingecko.com/api/v3",
  fetchedAt: "2026-07-21T00:00:00.000Z",
  expiresAt: "2026-07-21T00:05:00.000Z",
  requestHash,
  data,
};
const payment = {
  ...paymentRecord({ runId: "run_integrity" }),
  snapshotHash: requestHash,
};

describe("paid snapshot and live-origin binding", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts only the exact frozen snapshot hash", () => {
    expect(validatePaidSnapshot({ snapshot }, payment)).toEqual(snapshot);
    const tampered = structuredClone(snapshot);
    if (tampered.data.kind === "market_snapshot") {
      tampered.data.assets[0].priceUsd = 1;
    }
    expect(() => validatePaidSnapshot({ snapshot: tampered }, payment)).toThrow(
      "무결성",
    );
  });

  it("rejects a self-consistent response that differs from the reserved hash", () => {
    const substituted = structuredClone(snapshot);
    if (substituted.data.kind === "market_snapshot") {
      substituted.data.assets[0].priceUsd = 999;
    }
    substituted.requestHash = sha256(JSON.stringify(substituted.data));
    expect(() => validatePaidSnapshot({ snapshot: substituted }, payment)).toThrow(
      "무결성",
    );
  });

  it("fails closed before signing when the live origin is missing or changed", async () => {
    const gateway = new LiveX402PaymentGateway();
    vi.stubEnv("APP_BASE_URL", "");
    await expect(
      gateway.purchase({ payment, baseUrl: "https://proofbuy.example" }),
    ).rejects.toThrow("APP_BASE_URL");

    vi.stubEnv("APP_BASE_URL", "https://proofbuy.example");
    await expect(
      gateway.purchase({ payment, baseUrl: "https://evil.example" }),
    ).rejects.toThrow("APP_BASE_URL");
  });

  it("maps an insufficient-balance settlement to the faucet recovery state", () => {
    const failure = x402SettlementFailure("insufficient token balance");
    expect(failure.detail.code).toBe("INSUFFICIENT_DEVNET_BALANCE");
    expect(failure.detail.recovery).toContain("faucet");
    expect(failure.ambiguousSettlement).toBe(false);
  });

  it.each([
    ["AbortError", false, "MODEL_TIMEOUT", false],
    ["TimeoutError", true, "PAYMENT_RECONCILING", true],
    ["NetworkError", false, "PAYMENT_FAILED", false],
  ] as const)(
    "maps %s with payloadCreated=%s to %s",
    (name, payloadCreated, code, ambiguous) => {
      const error = new Error("transport failed");
      error.name = name;
      const failure = x402TransportFailure(error, payloadCreated);
      expect(failure.detail.code).toBe(code);
      expect(failure.ambiguousSettlement).toBe(ambiguous);
    },
  );
});
