import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadFixtureCatalog } from "@/lib/proofbuy/catalog-fixtures";
import { executeRun } from "@/lib/proofbuy/orchestrator";
import { ProofBuyError } from "@/lib/proofbuy/errors";
import { DemoProcurementPlanner } from "@/lib/proofbuy/planner";
import { MemoryProofBuyStore } from "@/lib/proofbuy/storage-memory";
import type { PaymentGateway } from "@/lib/proofbuy/payment";
import type { PaymentReceipt } from "@/lib/proofbuy/types";

const store = new MemoryProofBuyStore();

async function createClaimedRun(goal: string, maxBudgetAtomic = "3000") {
  const run = await store.createRun({ goal, maxBudgetAtomic, mode: "demo" });
  await store.claimRun(run.id, `claim_${run.id}`);
  return run;
}

function successfulGateway(): PaymentGateway {
  return {
    async purchase({ payment }) {
      const snapshot = await store.getSnapshot(payment.snapshotId);
      if (!snapshot) throw new Error("fixture snapshot missing");
      const receipt: PaymentReceipt = {
        paymentId: payment.id,
        productId: payment.productId,
        amountAtomic: payment.amountAtomic,
        decimals: 6,
        network: payment.network,
        asset: payment.asset,
        payer: "demo-buyer-no-wallet",
        payee: payment.payTo,
        signature: `demo_${payment.id}`,
        settledAt: new Date().toISOString(),
        mode: "demo",
      };
      return { snapshot, receipt };
    },
  };
}

describe("procurement orchestration", () => {
  beforeEach(async () => {
    await store.reset();
  });

  it("completes two purchases, persists evidence, and emits sanitized milestones", async () => {
    const run = await createClaimedRun("SOL과 ETH의 개발·시장 모멘텀 비교");
    await executeRun(run.id, {
      store,
      planner: new DemoProcurementPlanner(),
      gateway: successfulGateway(),
      catalogLoader: loadFixtureCatalog,
    });
    const view = await store.getRunView(run.id);
    expect(view?.run.status).toBe("completed");
    expect(view?.run.spentAtomic).toBe("3000");
    expect(view?.payments).toHaveLength(2);
    expect(view?.evidence).toHaveLength(2);
    expect(view?.events.map((event) => event.type)).toContain("report.completed");
    expect(JSON.stringify(view?.events)).not.toMatch(/chain.of.thought|private.?key/i);
  });

  it("does not retry an ambiguous settlement and leaves it reconciling", async () => {
    const run = await createClaimedRun("SOL ETH 가격 비교", "1000");
    const purchase = vi.fn(async () => {
      throw new ProofBuyError(
        {
          code: "PAYMENT_RECONCILING",
          message: "facilitator response was lost after signing",
          recovery: "Explorer에서 먼저 확인하세요.",
        },
        true,
      );
    });
    await executeRun(run.id, {
      store,
      planner: new DemoProcurementPlanner(),
      gateway: { purchase },
      catalogLoader: loadFixtureCatalog,
    });
    const view = await store.getRunView(run.id);
    expect(purchase).toHaveBeenCalledTimes(1);
    expect(view?.run.status).toBe("reconciling");
    expect(view?.run.reservedAtomic).toBe("1000");
    expect(view?.payments[0]?.status).toBe("reconciling");
    expect(view?.events.at(-1)?.type).toBe("payment.reconciling");
  });

  it("releases a known payment failure and stops safely", async () => {
    const run = await createClaimedRun("SOL ETH 가격 비교", "1000");
    await executeRun(run.id, {
      store,
      planner: new DemoProcurementPlanner(),
      gateway: {
        async purchase() {
          throw new ProofBuyError({
            code: "PAYMENT_FAILED",
            message: "facilitator rejected before settlement",
            recovery: "facilitator 상태를 확인하세요.",
          });
        },
      },
      catalogLoader: loadFixtureCatalog,
    });
    const view = await store.getRunView(run.id);
    expect(view?.run.status).toBe("failed");
    expect(view?.run.reservedAtomic).toBe("0");
    expect(view?.payments[0]?.status).toBe("failed");
  });

  it("surfaces upstream outage before any payment reservation", async () => {
    const run = await createClaimedRun("SOL ETH 가격 비교");
    await executeRun(run.id, {
      store,
      planner: new DemoProcurementPlanner(),
      gateway: successfulGateway(),
      catalogLoader: async () =>
        (await loadFixtureCatalog(store)).map((product) => ({
          ...product,
          available: false,
          snapshotId: undefined,
          unavailableReason: "upstream down",
        })),
    });
    const view = await store.getRunView(run.id);
    expect(view?.run.status).toBe("failed");
    expect(view?.run.error?.code).toBe("UPSTREAM_UNAVAILABLE");
    expect(view?.payments).toEqual([]);
  });
});
