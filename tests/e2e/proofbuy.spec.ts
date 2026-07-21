import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const eventTypes = [
  "run.started",
  "catalog.loaded",
  "choice.explained",
  "policy.approved",
  "policy.denied",
  "payment.requested",
  "payment.settled",
  "payment.reconciling",
  "data.received",
  "report.completed",
  "run.error",
];

test.beforeAll(async () => {
  await mkdir(path.resolve("artifacts/qa"), { recursive: true });
});

test("runs the two-product demo and renders an explicit simulated receipt", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /자율 구매에/ })).toBeVisible();
  await expect(page.getByTestId("mode-badge")).toContainText(
    "DEMO MODE · NO ON-CHAIN TX",
  );
  await expect(page.getByText("Snapshot ready")).toHaveCount(2);

  await page.getByTestId("run-button").click();
  await expect(page.getByTestId("research-report")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("receipt-list").getByText("SIMULATED")).toHaveCount(2);
  await expect(page.getByTestId("receipt-list").getByText("온체인 거래 아님")).toHaveCount(2);
  await expect(page.getByTestId("budget-meter-fill")).toHaveAttribute(
    "style",
    /width: 100%/,
  );
  await expect(page.getByRole("link", { name: /Solana Explorer/ })).toHaveCount(0);
  await expect(page.getByText("3개 구매 근거로 보고서를 작성했습니다.")).toHaveCount(0);
  await expect(page.getByText("2개 구매 근거로 보고서를 작성했습니다.")).toBeVisible();

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBe(false);
  await page.screenshot({
    path: path.resolve(`artifacts/qa/${testInfo.project.name}-completed.png`),
    fullPage: true,
  });
});

test("shows a policy denial without attempting payment", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Hard budget").fill("0");
  await page.getByTestId("run-button").click();
  await expect(page.getByText("Policy denied purchase")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId("receipt-list").getByText("SIMULATED")).toHaveCount(0);
});

test("protects paid resources with a 402 challenge and rejects unknown proof", async ({
  request,
}) => {
  const challenge = await request.get(
    "/api/products/market-snapshot?snapshotId=not-granted",
  );
  expect(challenge.status()).toBe(402);
  expect(await challenge.json()).toMatchObject({
    error: "PAYMENT_REQUIRED",
    mode: "demo",
    priceAtomic: "1000",
  });

  const attacker = await request.get(
    "/api/products/market-snapshot?snapshotId=not-granted",
    {
      headers: {
        "x-proofbuy-payment-id": "unknown",
        "x-proofbuy-demo-payment": "forged",
      },
    },
  );
  expect(attacker.status()).toBe(403);
});

test("replays persisted SSE events after a client reconnect", async ({ page }) => {
  await page.goto("/");
  const replay = await page.evaluate(
    async ({ types }) => {
      const created = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: "SOL과 ETH의 개발·시장 모멘텀 비교",
          maxBudgetAtomic: "3000",
        }),
      });
      const { runId } = (await created.json()) as { runId: string };

      return new Promise<{ firstType: string; replayed: string[] }>(
        (resolve, reject) => {
          const timer = window.setTimeout(
            () => reject(new Error("SSE reconnect timed out")),
            25_000,
          );
          const first = new EventSource(`/api/runs/${runId}/events`);
          const firstHandler = (message: Event) => {
            first.close();
            const firstType = message.type;
            window.setTimeout(() => {
              const second = new EventSource(`/api/runs/${runId}/events`);
              const replayed: string[] = [];
              const replayHandler = (next: Event) => {
                replayed.push(next.type);
                if (["report.completed", "policy.denied", "run.error"].includes(next.type)) {
                  window.clearTimeout(timer);
                  second.close();
                  resolve({ firstType, replayed });
                }
              };
              for (const type of types) second.addEventListener(type, replayHandler);
              second.onerror = () => {
                // EventSource reconnect behavior is expected until a terminal event arrives.
              };
            }, 20);
          };
          for (const type of types) first.addEventListener(type, firstHandler, {
            once: true,
          });
          first.onerror = () => reject(new Error("Initial SSE connection failed"));
        },
      );
    },
    { types: eventTypes },
  );

  expect(replay.firstType).toBe("run.started");
  expect(replay.replayed).toContain("run.started");
  expect(replay.replayed).toContain("report.completed");
});
