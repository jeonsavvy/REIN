import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const LIVE_URL = "https://rein-vvwpcipqca-du.a.run.app";
const EXPECTED_HOST = "rein-vvwpcipqca-du.a.run.app";
const outputDir = path.resolve("output/video/source");
const stableVideoPath = path.join(outputDir, "rein-live-run.webm");
const metadataPath = path.join(outputDir, "rein-live-run.json");

if (process.env.ALLOW_REIN_LIVE_PURCHASE !== "1") {
  console.error(
    "Refusing to run: set ALLOW_REIN_LIVE_PURCHASE=1 to authorize exactly one 0.003 test-USDC Devnet run.",
  );
  process.exit(2);
}

const target = new URL(process.env.REIN_LIVE_URL || LIVE_URL);
if (target.protocol !== "https:" || target.hostname !== EXPECTED_HOST) {
  console.error(`Refusing non-allowlisted target: ${target.origin}`);
  process.exit(2);
}

await mkdir(outputDir, { recursive: true });

const health = await fetch(`${target.origin}/api/health`).then((response) => {
  if (!response.ok) throw new Error(`Health check failed: HTTP ${response.status}`);
  return response.json();
});
if (health.mode !== "live" || health.storage !== "firestore") {
  throw new Error(`Unexpected runtime: ${JSON.stringify(health)}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  colorScheme: "light",
  recordVideo: { dir: outputDir, size: { width: 1920, height: 1080 } },
});
const page = await context.newPage();
const video = page.video();
let clicked = false;
let runId = null;
let explorerUrls = [];
let terminalStatus = "unknown";
let failure = null;

page.on("response", async (response) => {
  if (
    response.request().method() === "POST" &&
    new URL(response.url()).pathname === "/api/runs" &&
    response.status() === 202
  ) {
    const body = await response.json().catch(() => null);
    if (body?.runId) runId = body.runId;
  }
});

async function scrollTo(selector) {
  await page.locator(selector).scrollIntoViewIfNeeded();
  await page.waitForTimeout(850);
}

try {
  await page.goto(target.origin, { waitUntil: "networkidle", timeout: 45_000 });
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "smooth";
  });
  await page.waitForTimeout(4_500);

  const runButton = page.getByTestId("run-button");
  await runButton.scrollIntoViewIfNeeded();
  await page.waitForTimeout(2_000);
  await runButton.click();
  clicked = true;

  await page.waitForTimeout(5_000);
  await scrollTo(".ledger-panel");

  const deadline = Date.now() + 100_000;
  let pass = 0;
  while (Date.now() < deadline) {
    terminalStatus = ((await page.locator(".run-status").textContent()) || "")
      .trim()
      .toLowerCase();
    if (["completed", "denied", "reconciling", "error"].includes(terminalStatus)) break;

    if (pass % 3 === 1) await scrollTo("[data-testid='event-ledger']");
    if (pass % 3 === 2) await scrollTo("[data-testid='receipt-list']");
    pass += 1;
    await page.waitForTimeout(3_500);
  }

  if (terminalStatus !== "completed") {
    throw new Error(`Live run ended without completion: ${terminalStatus}`);
  }

  await scrollTo("[data-testid='receipt-list']");
  await page.waitForTimeout(6_000);
  explorerUrls = await page
    .locator("[data-testid='receipt-list'] a[href*='explorer.solana.com']")
    .evaluateAll((links) => links.map((link) => link.href));
  if (explorerUrls.length !== 2) {
    throw new Error(`Expected two Explorer receipts, found ${explorerUrls.length}`);
  }

  await scrollTo("[data-testid='research-report']");
  await page.waitForTimeout(10_000);
  await page.screenshot({
    path: path.resolve("artifacts/qa/video-run-completed.png"),
    fullPage: true,
  });

  for (const explorerUrl of explorerUrls) {
    await page.goto(explorerUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(8_000);
  }
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
  console.error(failure);
} finally {
  await page.close().catch(() => undefined);
  await context.close().catch(() => undefined);
  if (video) await video.saveAs(stableVideoPath).catch(() => undefined);
  await browser.close().catch(() => undefined);

  await writeFile(
    metadataPath,
    `${JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        target: target.origin,
        clicked,
        runId,
        terminalStatus,
        explorerUrls,
        failure,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

if (failure) process.exit(1);
console.log(`Recorded one completed live run: ${runId}`);
console.log(`Source video: ${stableVideoPath}`);
