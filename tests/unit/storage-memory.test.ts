import { beforeEach, describe, expect, it } from "vitest";
import { MemoryReinStore } from "@/lib/rein/storage-memory";
import { paymentReceipt, paymentRecord } from "./helpers";

const store = new MemoryReinStore();

async function runningRun(maxBudgetAtomic = "10000") {
  const run = await store.createRun({
    goal: "test",
    maxBudgetAtomic,
    mode: "demo",
  });
  expect(await store.claimRun(run.id, `claim_${run.id}`)).toBe(true);
  return run;
}

describe("atomic payment reservations", () => {
  beforeEach(async () => {
    await store.reset();
  });

  it("reserves and settles exactly once for an idempotent payment ID", async () => {
    const run = await runningRun();
    const payment = paymentRecord({ id: "payment_same", runId: run.id });
    await store.reservePayment({ payment, dailyLimitAtomic: "250000" });
    await store.reservePayment({ payment, dailyLimitAtomic: "250000" });
    expect((await store.getRun(run.id))?.reservedAtomic).toBe("1000");

    await store.settlePayment(payment.id, paymentReceipt(payment));
    await store.settlePayment(payment.id, paymentReceipt(payment));
    const settled = await store.getRun(run.id);
    expect(settled?.reservedAtomic).toBe("0");
    expect(settled?.spentAtomic).toBe("1000");
  });

  it("rejects payment-ID reuse with a different request fingerprint", async () => {
    const run = await runningRun();
    const first = paymentRecord({
      id: "payment_collision",
      runId: run.id,
      fingerprint: "first",
    });
    await store.reservePayment({ payment: first, dailyLimitAtomic: "250000" });
    await expect(
      store.reservePayment({
        payment: { ...first, requestFingerprint: "attacker" },
        dailyLimitAtomic: "250000",
      }),
    ).rejects.toThrow("재사용");
  });

  it("enforces run and daily caps under concurrent reservations", async () => {
    const run = await runningRun("1000");
    const attempts = await Promise.allSettled([
      store.reservePayment({
        payment: paymentRecord({ id: "p1", runId: run.id }),
        dailyLimitAtomic: "250000",
      }),
      store.reservePayment({
        payment: paymentRecord({ id: "p2", runId: run.id }),
        dailyLimitAtomic: "250000",
      }),
    ]);
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((result) => result.status === "rejected")).toHaveLength(1);

    const secondRun = await runningRun();
    await expect(
      store.reservePayment({
        payment: paymentRecord({ id: "daily_over", runId: secondRun.id }),
        dailyLimitAtomic: "1500",
      }),
    ).rejects.toThrow("일일");
  });

  it("accepts exactly 250000 daily atomic units and rejects the next one", async () => {
    for (let index = 0; index < 62; index += 1) {
      const run = await runningRun("4000");
      await store.reservePayment({
        payment: paymentRecord({
          id: `daily_4000_${index}`,
          runId: run.id,
          amountAtomic: "4000",
        }),
        dailyLimitAtomic: "250000",
      });
    }
    const finalRun = await runningRun("2000");
    await store.reservePayment({
      payment: paymentRecord({
        id: "daily_exact_cap",
        runId: finalRun.id,
        amountAtomic: "2000",
      }),
      dailyLimitAtomic: "250000",
    });

    const overRun = await runningRun("1");
    await expect(
      store.reservePayment({
        payment: paymentRecord({
          id: "daily_one_over",
          runId: overRun.id,
          amountAtomic: "1",
        }),
        dailyLimitAtomic: "250000",
      }),
    ).rejects.toThrow("일일");
  });

  it("releases known failures but holds ambiguous settlement reservations", async () => {
    const knownRun = await runningRun();
    const known = paymentRecord({ id: "known", runId: knownRun.id });
    await store.reservePayment({ payment: known, dailyLimitAtomic: "250000" });
    await store.failPayment(known.id, "known failure", false);
    expect((await store.getRun(knownRun.id))?.reservedAtomic).toBe("0");

    const ambiguousRun = await runningRun();
    const ambiguous = paymentRecord({ id: "ambiguous", runId: ambiguousRun.id });
    await store.reservePayment({ payment: ambiguous, dailyLimitAtomic: "250000" });
    await store.failPayment(ambiguous.id, "unknown settlement", true);
    expect((await store.getRun(ambiguousRun.id))?.reservedAtomic).toBe("1000");
    expect((await store.getPayment(ambiguous.id))?.status).toBe("reconciling");
  });
});
