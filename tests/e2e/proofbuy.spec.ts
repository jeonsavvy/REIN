import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  DEVNET_USDC_MINT,
  SOLANA_DEVNET,
} from "@/lib/proofbuy/constants";
import type { ResearchBrief, RunView } from "@/lib/proofbuy/types";

const eventTypes = [
  "run.started",
  "catalog.loaded",
  "selection.fallback",
  "choice.explained",
  "policy.approved",
  "policy.denied",
  "payment.requested",
  "payment.settled",
  "payment.reconciling",
  "data.received",
  "report.preview_ready",
  "report.completed",
  "report.retry_started",
  "report.retry_completed",
  "report.retry_failed",
  "run.error",
];

const fallbackSummary: ResearchBrief = {
  headline: "SOL–ETH 시장·개발 모멘텀 비교",
  executiveSummary:
    "시장과 개발 데이터는 서로 다른 시간축을 보여주므로 각 신호를 나란히 확인합니다.",
  findings: [
    {
      label: "24시간 시장 모멘텀",
      value: "ETH 우위",
      interpretation: "구매한 시장 스냅샷의 변화율을 비교했습니다.",
    },
  ],
  caveats: [
    "Gemini 응답이 늦어져 결제된 데이터는 REIN의 규칙 기반 분석으로 정리했습니다.",
  ],
  generatedBy: "REIN 규칙 기반 분석",
};

function fallbackRunView(summary: ResearchBrief = fallbackSummary): RunView {
  const now = "2026-07-22T00:00:00.000Z";
  const receipts = [
    {
      paymentId: "payment_market",
      productId: "market_snapshot" as const,
      amountAtomic: "1000",
    },
    {
      paymentId: "payment_github",
      productId: "github_health" as const,
      amountAtomic: "2000",
    },
  ].map((item) => ({
    ...item,
    decimals: 6 as const,
    network: SOLANA_DEVNET,
    asset: DEVNET_USDC_MINT,
    payer: "demo-payer",
    payee: "demo-payee",
    signature: `signature_${item.paymentId}`,
    settledAt: now,
    mode: "live" as const,
  }));
  return {
    run: {
      id: "fallback-ui",
      goal: "SOL과 ETH의 개발·시장 모멘텀 비교",
      maxBudgetAtomic: "3000",
      reservedAtomic: "0",
      spentAtomic: "3000",
      status: "completed",
      mode: "live",
      selectionMode: "gemini",
      reportMode: "fallback",
      nextEventSeq: 2,
      summary,
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    },
    events: [
      {
        id: "evt_fallback",
        seq: 1,
        type: "report.completed",
        tone: "success",
        title: "비교 보고서를 완성했습니다",
        detail: "구매 근거를 규칙 기반으로 정리했습니다.",
        at: now,
      },
    ],
    payments: receipts.map((receipt) => ({
      id: receipt.paymentId,
      runId: "fallback-ui",
      productId: receipt.productId,
      snapshotId: `snapshot_${receipt.productId}`,
      snapshotHash: `hash_${receipt.productId}`,
      quotaKey: "2026-07-22",
      requestFingerprint: `fingerprint_${receipt.productId}`,
      amountAtomic: receipt.amountAtomic,
      network: SOLANA_DEVNET,
      asset: DEVNET_USDC_MINT,
      payTo: receipt.payee,
      status: "settled" as const,
      receipt,
      createdAt: now,
      updatedAt: now,
    })),
    evidence: [
      {
        productId: "market_snapshot",
        snapshotId: "snapshot_market_snapshot",
        data: {
          kind: "market_snapshot",
          asOf: now,
          assets: [
            {
              symbol: "SOL",
              priceUsd: 80,
              change24hPct: 1,
              marketCapUsd: 45_000_000_000,
            },
            {
              symbol: "ETH",
              priceUsd: 2_000,
              change24hPct: 2,
              marketCapUsd: 230_000_000_000,
            },
          ],
        },
        receipt: receipts[0],
      },
      {
        productId: "github_health",
        snapshotId: "snapshot_github_health",
        data: {
          kind: "github_health",
          asOf: now,
          repositories: [
            {
              ecosystem: "Solana",
              repository: "anza-xyz/agave",
              stars: 0,
              forks: 0,
              openIssues: 0,
              commits30d: 100,
              commits30dCapped: true,
              pushedAt: now,
            },
            {
              ecosystem: "Ethereum",
              repository: "ethereum/go-ethereum",
              stars: 0,
              forks: 0,
              openIssues: 0,
              commits30d: 96,
              commits30dCapped: false,
              pushedAt: now,
            },
          ],
        },
        receipt: receipts[1],
      },
    ],
  };
}

test.beforeAll(async () => {
  await mkdir(path.resolve("artifacts/qa"), { recursive: true });
});

test("runs the two-product demo and renders an explicit simulated receipt", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /목표와 예산만 정하면/ })).toBeVisible();
  await expect(page.getByText("브라우저 지갑을 연결하지 않습니다.")).toBeVisible();
  await expect(page.getByTestId("mode-badge")).toContainText(
    "데모 · 온체인 전송 없음",
  );
  await expect(page.getByText(/CoinGecko Public API/)).toBeVisible();
  await expect(page.getByText(/GitHub Public API/)).toBeVisible();
  await expect(page.getByLabel("최대 예산")).toHaveValue("0.003");

  await page.getByTestId("run-button").click();
  await expect(page.getByTestId("research-report")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("receipt-list").getByText("데모 기록")).toHaveCount(2);
  await expect(page.getByTestId("receipt-list").getByText("온체인 거래 아님")).toHaveCount(2);
  await expect(page.getByTestId("research-report").getByText("0.003 USDC")).toBeVisible();
  await expect(page.getByRole("link", { name: /Explorer에서 확인/ })).toHaveCount(0);
  await expect(page).toHaveURL(/\?run=run_/);

  await page.reload();
  await expect(page.getByTestId("research-report")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("receipt-list").getByText("데모 기록")).toHaveCount(2);
  await expect(page.getByTestId("run-button")).toBeEnabled();

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
  await page.getByLabel("최대 예산").fill("0");
  await page.getByTestId("run-button").click();
  await expect(
    page.getByRole("heading", {
      name: "현재 예산으로 구매 가능한 관련 데이터 상품이 없습니다.",
    }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("정책 중단")).toBeVisible();
  await expect(page.getByTestId("receipt-list")).toHaveCount(0);
});

test("marks an incomplete Gemini report and retries without another payment", async ({
  page,
}, testInfo) => {
  const geminiView = fallbackRunView({
    ...fallbackSummary,
    headline: "Gemini가 다시 분석한 비교 결과",
    generatedBy: "Gemini 3.5 Flash",
  });
  geminiView.run.reportMode = "gemini";
  geminiView.run.reportRecoveryState = "succeeded";
  geminiView.run.reportRecoveryAttempts = 1;

  await page.route("**/api/catalog", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ mode: "live", products: [] }),
    });
  });
  await page.route("**/api/runs/fallback-ui/events", async (route) => {
    const event = fallbackRunView().events[0];
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `event: report.completed\ndata: ${JSON.stringify(event)}\n\n`,
    });
  });
  await page.route("**/api/runs/fallback-ui/report", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(geminiView),
    });
  });
  await page.route("**/api/runs/fallback-ui", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fallbackRunView()),
    });
  });

  await page.goto("/?run=fallback-ui");
  await expect(page.getByText("Gemini 보고서를 완료하지 못했습니다")).toBeVisible();
  await expect(page.getByTestId("run-status")).toContainText("Gemini 분석 필요");
  await expect(page.getByText(/새 결제는 발생하지 않습니다/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "결제한 데이터와 영수증을 보존했습니다" }),
  ).toBeVisible();
  await expect(page.getByText(fallbackSummary.headline)).toHaveCount(0);
  await expect(page.getByText("ETH 우위")).toHaveCount(0);
  await expect(page.getByText(fallbackSummary.caveats[0])).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "구매한 데이터", exact: true })).toBeVisible();
  await page.screenshot({
    path: path.resolve(`artifacts/qa/${testInfo.project.name}-fallback.png`),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Gemini 보고서 다시 작성" }).click();
  await expect(page.getByRole("heading", { name: "Gemini가 다시 분석한 비교 결과" })).toBeVisible();
  await expect(page.getByText("Gemini 보고서를 완료하지 못했습니다")).toHaveCount(0);
  await expect(page.getByTestId("run-status")).toContainText("완료");
});

test("shows one no-payment recovery action after a post-payment report failure", async ({
  page,
}) => {
  const failed = fallbackRunView();
  failed.run.id = "failed-report-ui";
  failed.run.status = "failed";
  failed.run.reportMode = "preview";
  failed.run.error = {
    code: "MODEL_ERROR",
    message: "Gemini 응답 형식을 확인할 수 없습니다.",
    recovery: "기존 근거로 분석만 다시 시도하세요.",
  };
  failed.events = [
    {
      ...failed.events[0],
      id: "evt_preview",
      seq: 1,
      type: "report.preview_ready",
      tone: "pending",
      title: "구매 데이터를 먼저 정리했습니다",
      detail: "Gemini가 최종 분석을 작성하고 있습니다.",
    },
    {
      ...failed.events[0],
      id: "evt_error",
      seq: 2,
      type: "run.error",
      tone: "danger",
      title: "실행을 중단했습니다",
      detail: "Gemini 응답 형식을 확인할 수 없습니다.",
    },
  ];

  await page.route("**/api/catalog", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ mode: "live", products: [] }),
    });
  });
  await page.route("**/api/runs/failed-report-ui", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(failed),
    });
  });

  await page.goto("/?run=failed-report-ui");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Gemini 보고서를 완료하지 못했습니다" })
      .getByText("Gemini 응답 형식을 확인할 수 없습니다."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Gemini 보고서 다시 작성" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "결제 없이 분석 다시 시도" })).toHaveCount(0);
  await expect(page.getByText("ETH 우위")).toHaveCount(0);
});

test("shows purchased results while Gemini finishes the final report", async ({
  page,
}, testInfo) => {
  const preview = fallbackRunView();
  preview.run.status = "running";
  preview.run.reportMode = "preview";
  preview.run.selectionMode = "gemini";
  preview.events[0] = {
    ...preview.events[0],
    type: "report.preview_ready",
    tone: "pending",
    title: "구매 데이터를 먼저 정리했습니다",
    detail: "Gemini가 최종 분석을 작성하고 있습니다.",
  };

  await page.route("**/api/catalog", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ mode: "live", products: [] }),
    });
  });
  await page.route("**/api/runs/preview-ui/events", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: "",
    });
  });
  await page.route("**/api/runs/preview-ui", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...preview,
        run: { ...preview.run, id: "preview-ui" },
      }),
    });
  });

  await page.goto("/?run=preview-ui");
  await expect(page.getByText("결제 완료 · Gemini 분석 중")).toBeVisible();
  await expect(page.getByTestId("run-status")).toContainText(
    "결제 완료 · 분석 중",
  );
  await expect(page.getByTestId("research-report")).toBeVisible();
  await expect(page.getByText("추가 결제는 발생하지 않았습니다.")).toHaveCount(0);
  await page.screenshot({
    path: path.resolve(`artifacts/qa/${testInfo.project.name}-preview.png`),
    fullPage: true,
  });
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
        "x-rein-payment-id": "unknown",
        "x-rein-demo-payment": "forged",
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
