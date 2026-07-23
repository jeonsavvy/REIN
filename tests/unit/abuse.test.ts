import { describe, expect, it } from "vitest";
import { clientUsageKey } from "@/lib/rein/abuse";
import { readUsageQuota } from "@/lib/rein/usage-quota";

const SECRET = "test-only-abuse-hmac-key-with-32-characters";

function requestFor(ip?: string): Request {
  return new Request("https://rein.example/api/runs", {
    headers: ip ? { "x-forwarded-for": ip } : undefined,
  });
}

describe("anonymous usage identity", () => {
  it("is stable within a KST day without retaining the raw IP", () => {
    const now = new Date("2026-07-23T01:00:00.000Z");
    const first = clientUsageKey(requestFor("203.0.113.7"), {
      now,
      secret: SECRET,
    });
    const second = clientUsageKey(requestFor("203.0.113.7"), {
      now,
      secret: SECRET,
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain("203.0.113.7");
  });

  it("ignores caller-supplied addresses before Google's trusted suffix", () => {
    const now = new Date("2026-07-23T01:00:00.000Z");
    const clean = clientUsageKey(requestFor("203.0.113.7"), {
      now,
      secret: SECRET,
    });
    const spoofed = clientUsageKey(
      requestFor("198.51.100.200, 203.0.113.7"),
      { now, secret: SECRET },
    );

    expect(spoofed).toBe(clean);
  });

  it("rotates the identifier at the KST date boundary", () => {
    const beforeMidnight = clientUsageKey(requestFor("203.0.113.7"), {
      now: new Date("2026-07-23T14:59:59.000Z"),
      secret: SECRET,
    });
    const afterMidnight = clientUsageKey(requestFor("203.0.113.7"), {
      now: new Date("2026-07-23T15:00:00.000Z"),
      secret: SECRET,
    });

    expect(beforeMidnight).not.toBe(afterMidnight);
  });

  it("normalizes IPv4-mapped IPv6 and rejects missing protection inputs", () => {
    const now = new Date("2026-07-23T01:00:00.000Z");
    expect(
      clientUsageKey(requestFor("::ffff:203.0.113.7"), {
        now,
        secret: SECRET,
      }),
    ).toBe(
      clientUsageKey(requestFor("203.0.113.7"), {
        now,
        secret: SECRET,
      }),
    );
    expect(() =>
      clientUsageKey(requestFor(), { now, secret: SECRET }),
    ).toThrow("실행 보호");
    expect(() =>
      clientUsageKey(requestFor("203.0.113.7"), {
        now,
        secret: "short",
      }),
    ).toThrow("실행 보호");
  });

  it("fails closed when a persisted quota record is malformed", () => {
    expect(readUsageQuota(undefined)).toEqual({
      runUnits: 0,
      modelUnits: 0,
    });
    expect(() =>
      readUsageQuota({ runUnits: "0", modelUnits: 0 }),
    ).toThrow("Invalid persisted usage quota");
    expect(() =>
      readUsageQuota({ runUnits: -1, modelUnits: 0 }),
    ).toThrow("Invalid persisted usage quota");
  });
});
