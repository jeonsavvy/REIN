import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const LIVE_URL = "https://rein-vvwpcipqca-du.a.run.app";
const EXPECTED_HOSTS = new Set(["rein-vvwpcipqca-du.a.run.app"]);
const outputDir = path.resolve("output/video/source");

if (process.env.ALLOW_REIN_LIVE_PURCHASE !== "1") {
  console.error(
    "Refusing to run: set ALLOW_REIN_LIVE_PURCHASE=1 to authorize exactly one 0.003 test-USDC Devnet run.",
  );
  process.exit(2);
}

const target = new URL(process.env.REIN_LIVE_URL || LIVE_URL);
if (target.protocol !== "https:" || !EXPECTED_HOSTS.has(target.hostname)) {
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

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const sourceFileName = `rein-live-run-${stamp}.webm`;
const sourceVideoPath = path.join(outputDir, sourceFileName);
const metadataPath = path.join(outputDir, "rein-live-run.json");
const actions = [];
const startedAt = Date.now();
const elapsed = () => Date.now() - startedAt;
const mark = (name, detail = {}) => actions.push({ name, elapsedMs: elapsed(), ...detail });

async function holdUntil(targetMs) {
  const remaining = targetMs - elapsed();
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
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
let pageReadyElapsedMs = null;

page.on("response", async (response) => {
  if (
    response.request().method() === "POST" &&
    new URL(response.url()).pathname === "/api/runs" &&
    response.status() === 202
  ) {
    const body = await response.json().catch(() => null);
    if (body?.runId) {
      runId = body.runId;
      mark("run-created", { runId });
    }
  }
});

async function scrollTo(selector, name) {
  await page.locator(selector).scrollIntoViewIfNeeded();
  mark(name);
  await page.waitForTimeout(900);
}

try {
  await page.goto(target.origin, { waitUntil: "networkidle", timeout: 45_000 });
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "smooth";
  });
  pageReadyElapsedMs = elapsed();
  mark("page-ready");

  // Preserve enough quiet time to introduce the goal before the one authorized purchase.
  await holdUntil(pageReadyElapsedMs + 16_000);
  const runButton = page.getByTestId("run-button");
  await runButton.scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  await runButton.click();
  clicked = true;
  mark("run-clicked");

  await page.getByTestId("run-status").waitFor({ state: "visible", timeout: 15_000 });
  await scrollTo("#run-progress", "progress-visible");

  const deadline = Date.now() + 100_000;
  while (Date.now() < deadline) {
    terminalStatus = (await page.getByTestId("run-status").getAttribute("data-status")) || "unknown";
    if (["completed", "denied", "reconciling", "failed"].includes(terminalStatus)) break;
    await page.waitForTimeout(1_500);
  }

  if (terminalStatus !== "completed") {
    throw new Error(`Live run ended without completion: ${terminalStatus}`);
  }
  mark("run-completed", { runId });
  await page.getByTestId("research-report").waitFor({ state: "visible", timeout: 10_000 });
  await scrollTo("#run-progress", "result-visible");

  await holdUntil(pageReadyElapsedMs + 61_000);
  await scrollTo("[data-testid='receipt-list']", "receipts-visible");
  explorerUrls = await page
    .locator("[data-testid='receipt-list'] a[href*='explorer.solana.com']")
    .evaluateAll((links) => links.map((link) => link.href));
  if (explorerUrls.length !== 2) {
    throw new Error(`Expected two Explorer receipts, found ${explorerUrls.length}`);
  }

  await holdUntil(pageReadyElapsedMs + 78_000);
  await scrollTo("[data-testid='research-report']", "report-visible");
  await page.screenshot({
    path: path.resolve("artifacts/qa/video-run-completed.png"),
    fullPage: true,
  });

  await holdUntil(pageReadyElapsedMs + 101_000);
  for (const [index, explorerUrl] of explorerUrls.entries()) {
    await page.goto(explorerUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    mark("explorer-visible", { index: index + 1, url: explorerUrl });
    await page.waitForTimeout(13_000);
  }
  mark("recording-complete");
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
  console.error(failure);
} finally {
  await page.close().catch(() => undefined);
  await context.close().catch(() => undefined);
  if (video) await video.saveAs(sourceVideoPath).catch(() => undefined);
  await browser.close().catch(() => undefined);

  const relativeSource = path.relative(process.cwd(), sourceVideoPath).replaceAll("\\", "/");
  await writeFile(
    metadataPath,
    `${JSON.stringify(
      {
        recordedAt: new Date(startedAt).toISOString(),
        target: target.origin,
        sourceVideo: relativeSource,
        sourceTrimSeconds:
          pageReadyElapsedMs === null ? 0 : Math.max(0, (pageReadyElapsedMs - 300) / 1000),
        clicked,
        runId,
        terminalStatus,
        explorerUrls,
        actions,
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
console.log(`Source video: ${sourceVideoPath}`);
