/* eslint-disable no-console */
const path = require("node:path");
const pptxgen = require("pptxgenjs");
const { imageSizingCrop } = require("./pptxgenjs_helpers/image");
const {
  warnIfSlideHasOverlaps,
  warnIfSlideElementsOutOfBounds,
} = require("./pptxgenjs_helpers/layout");

const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "REIN";
pptx.company = "REIN";
pptx.subject = "Google Cloud x Solana AI Agentic Hackathon submission";
pptx.title = "REIN - Autonomy, held to proof";
pptx.lang = "ko-KR";
pptx.theme = {
  headFontFace: "Noto Sans KR",
  bodyFontFace: "Noto Sans KR",
  lang: "ko-KR",
};
pptx.defineSlideMaster({
  title: "REIN",
  background: { color: "F0EDE4" },
  objects: [],
  slideNumber: { x: 12.25, y: 7.05, w: 0.4, h: 0.18, color: "52645D", fontFace: "Cascadia Mono", fontSize: 7, align: "right" },
});

const C = {
  bg: "F0EDE4",
  paper: "F8F5ED",
  ink: "111A16",
  green: "08664B",
  signal: "BD3F2B",
  mint: "DDEBE5",
  amber: "A86A10",
  amberPale: "F1E4CB",
  brick: "B43B2D",
  brickPale: "F2DDD7",
  rule: "9AA8A1",
  soft: "D4DAD5",
  muted: "52645D",
  white: "FFFFFF",
};

const FONT = "Noto Sans KR";
const MONO = "Cascadia Mono";
const screenshot = path.resolve(
  __dirname,
  "../../artifacts/qa/desktop-live-completed.png",
);
const liveUrl = process.env.REIN_LIVE_URL || "https://rein-vvwpcipqca-du.a.run.app";
const marketTx = process.env.REIN_MARKET_TX || "2NuicT57mQD1Uu5yumPnubCkrdSVHQUegbxLEBsDtpdVTTjw5dTdyB3QpH9t7VZLGnyQyNV9DySA9xWMY9YMpArw";
const githubTx = process.env.REIN_GITHUB_TX || "3vpyu3DsDvDT2m71kj3Pt5GQ4Ba2jQVYkuFhWL9eTUgiVXwpMiQKpbtjSPKaV5J5K3cpff6726kXT8p5Ui6gbcGR";
const hasLiveProof = ![liveUrl, marketTx, githubTx].some((value) =>
  value.startsWith("["),
);

function text(slide, value, x, y, w, h, options = {}) {
  slide.addText(value, {
    x,
    y,
    w,
    h,
    fontFace: FONT,
    fontSize: 18,
    color: C.ink,
    margin: 0,
    breakLine: false,
    valign: "mid",
    ...options,
  });
}

function rule(slide, x, y, w, color = C.rule, width = 0.8) {
  slide.addShape(pptx.ShapeType.line, {
    x,
    y,
    w,
    h: 0,
    line: { color, width },
  });
}

function box(slide, x, y, w, h, options = {}) {
  slide.addShape(pptx.ShapeType.rect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.04,
    fill: { color: options.fill || C.paper, transparency: options.transparency || 0 },
    line: { color: options.line || C.rule, width: options.width || 0.8 },
  });
}

function mark(slide, x = 0.62, y = 0.37, scale = 1) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><g fill="none" stroke="#${C.signal}" stroke-width="2.35" stroke-linecap="square" stroke-linejoin="miter"><path d="M6 4v32M13 4v32"/><path d="M13 7h9.5c5 0 8 2.7 8 7s-3 7-8 7H13"/><path d="m21 21 11 15"/><path d="M5 4h9M5 36h9"/></g></svg>`;
  slide.addImage({
    data: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    x,
    y,
    w: 0.48 * scale,
    h: 0.48 * scale,
  });
}

function header(slide, kicker, title, subtitle) {
  mark(slide);
  text(slide, "REIN/", 1.2, 0.32, 1.45, 0.35, {
    bold: true,
    fontSize: 17,
  });
  text(slide, kicker.toUpperCase(), 0.68, 1.03, 4.5, 0.22, {
    color: C.green,
    fontFace: MONO,
    fontSize: 8.5,
    bold: true,
    charSpacing: 1.5,
  });
  text(slide, title, 0.68, 1.31, 11.95, 0.58, {
    fontSize: 27,
    bold: true,
    breakLine: true,
  });
  if (subtitle) {
    text(slide, subtitle, 0.7, 1.95, 11.75, 0.38, {
      fontSize: 11.5,
      color: C.muted,
    });
  }
  rule(slide, 0.68, 2.33, 11.95);
}

function footer(slide, label = "GCP x SOLANA AI AGENTIC HACKATHON / 2026") {
  rule(slide, 0.68, 6.88, 11.95, C.soft, 0.6);
  text(slide, label, 0.68, 7.02, 5.5, 0.18, {
    fontFace: MONO,
    fontSize: 6.8,
    color: C.muted,
  });
}

function stepCircle(slide, n, x, y, tone = C.green) {
  text(slide, String(n).padStart(2, "0"), x, y, 0.38, 0.38, {
    shape: pptx.ShapeType.ellipse,
    fill: { color: C.bg },
    line: { color: tone, width: 1.2 },
    fontFace: MONO,
    fontSize: 7,
    color: tone,
    bold: true,
    align: "center",
  });
}

function receipt(slide, x, y, label, amount, signature, live) {
  box(slide, x, y, 5.72, 1.32, {
    fill: live ? C.paper : C.amberPale,
    line: live ? C.green : C.amber,
    width: 1.1,
  });
  text(slide, live ? "SETTLED / DEVNET" : "LIVE PROOF PENDING", x + 0.22, y + 0.18, 2.25, 0.18, {
    fontFace: MONO,
    fontSize: 7.5,
    bold: true,
    color: live ? C.green : C.amber,
  });
  text(slide, label, x + 0.22, y + 0.46, 2.7, 0.28, {
    fontSize: 14,
    bold: true,
  });
  text(slide, amount, x + 4.15, y + 0.18, 1.32, 0.28, {
    fontFace: MONO,
    fontSize: 12,
    bold: true,
    align: "right",
  });
  text(slide, signature, x + 0.22, y + 0.9, 5.23, 0.18, {
    fontFace: MONO,
    fontSize: 7.1,
    color: C.muted,
  });
}

// 1. Title
{
  const slide = pptx.addSlide("REIN");
  mark(slide, 0.72, 0.58, 1.35);
  text(slide, "REIN/", 1.55, 0.52, 2.2, 0.56, {
    fontSize: 28,
    bold: true,
  });
  text(slide, "AGENT-INITIATED COMMERCE", 0.76, 1.63, 4.4, 0.25, {
    fontFace: MONO,
    fontSize: 9,
    color: C.green,
    bold: true,
    charSpacing: 1.7,
  });
  text(slide, "Autonomy,\nheld to proof.", 0.72, 2.03, 7.5, 1.72, {
    fontSize: 42,
    bold: true,
    breakLine: true,
    valign: "top",
  });
  text(slide, "목표와 예산만 지정하면, 선택·결제·근거 보고서까지 한 번에.", 0.76, 4.18, 7.1, 0.44, {
    fontSize: 15,
    color: C.muted,
  });

  box(slide, 8.65, 1.47, 3.75, 4.48, { fill: C.ink, line: C.ink });
  text(slide, "DEFAULT RUN", 9.02, 1.83, 2.7, 0.2, {
    color: C.mint,
    fontFace: MONO,
    fontSize: 8,
    bold: true,
    charSpacing: 1.4,
  });
  text(slide, "0.003", 8.98, 2.2, 2.75, 0.72, {
    color: C.white,
    fontFace: MONO,
    fontSize: 37,
    bold: true,
  });
  text(slide, "TEST USDC HARD CAP", 9.02, 2.92, 2.7, 0.2, {
    color: C.mint,
    fontFace: MONO,
    fontSize: 7.5,
  });
  rule(slide, 9.02, 3.42, 2.95, C.muted, 0.7);
  text(slide, "02", 9.02, 3.69, 0.75, 0.48, {
    color: C.white,
    fontFace: MONO,
    fontSize: 26,
    bold: true,
  });
  text(slide, "DATA PURCHASES", 9.85, 3.83, 1.9, 0.2, {
    color: C.mint,
    fontFace: MONO,
    fontSize: 7.5,
  });
  text(slide, "Gemini 3.5 Flash\nx402 · Solana Devnet", 9.02, 4.55, 2.8, 0.62, {
    color: C.white,
    fontSize: 12,
    bold: true,
    breakLine: true,
  });
  footer(slide);
}

// 2. Problem
{
  const slide = pptx.addSlide("REIN");
  header(
    slide,
    "02 / problem",
    "AI가 결제할수록, 답변보다 구매 통제가 먼저입니다.",
    "Target: 유료 외부 데이터를 쓰는 리서치·AI 운영팀",
  );
  const risks = [
    ["01", "WHY", "왜 이 데이터를 샀는가?", "추천 문장만으로는 관련성과 가격을 감사할 수 없습니다."],
    ["02", "LIMIT", "상한을 정말 지켰는가?", "모델 출력만 믿으면 URL·자산·금액이 정책을 벗어날 수 있습니다."],
    ["03", "PROOF", "정말 한 번만 결제했는가?", "timeout과 retry는 이중 결제 또는 가짜 완료 표시를 만듭니다."],
  ];
  risks.forEach(([n, tag, titleValue, body], i) => {
    const x = 0.72 + i * 4.14;
    box(slide, x, 2.67, 3.78, 2.72, { fill: C.paper, line: i === 2 ? C.brick : C.rule });
    text(slide, n, x + 0.22, 2.92, 0.52, 0.28, {
      fontFace: MONO,
      fontSize: 14,
      bold: true,
      color: i === 2 ? C.brick : C.green,
    });
    text(slide, tag, x + 2.72, 2.96, 0.72, 0.18, {
      fontFace: MONO,
      fontSize: 7,
      color: C.muted,
      align: "right",
      bold: true,
    });
    rule(slide, x + 0.22, 3.34, 3.34, C.soft, 0.7);
    text(slide, titleValue, x + 0.22, 3.61, 3.18, 0.62, {
      fontSize: 17,
      bold: true,
      breakLine: true,
      valign: "top",
    });
    text(slide, body, x + 0.22, 4.46, 3.18, 0.58, {
      fontSize: 10,
      color: C.muted,
      breakLine: true,
      valign: "top",
    });
  });
  text(slide, "REIN의 답", 0.74, 5.76, 1.35, 0.22, {
    color: C.green,
    fontFace: MONO,
    fontSize: 8,
    bold: true,
  });
  text(slide, "선택 이유 + deterministic policy + 공개 영수증을 하나의 run에 묶습니다.", 2.15, 5.65, 9.9, 0.44, {
    fontSize: 16,
    bold: true,
  });
  footer(slide);
}

// 3. Product flow
{
  const slide = pptx.addSlide("REIN");
  header(
    slide,
    "03 / product",
    "사람은 목표와 상한을 정하고, 에이전트는 조달을 완결합니다.",
    "기본 데모: 0.003 테스트 USDC로 SOL·ETH 시장과 개발 모멘텀 비교",
  );
  const steps = [
    ["GOAL", "조사 주문", "목표 + 3000 atomic"],
    ["SELECT", "상품 선택", "Market 1000\nGitHub 2000"],
    ["POLICY", "서명 전 승인", "URL·mint·금액\n상한 재검증"],
    ["PAY", "x402 결제", "Devnet USDC\n2 transactions"],
    ["PROVE", "근거 보고서", "snapshot + receipt\n+ caveat"],
  ];
  steps.forEach(([tag, name, detail], i) => {
    const x = 0.62 + i * 2.52;
    stepCircle(slide, i + 1, x + 0.88, 2.75, i === 3 ? C.amber : C.green);
    if (i < steps.length - 1) {
      slide.addShape(pptx.ShapeType.line, {
        x: x + 1.34,
        y: 2.94,
        w: 1.55,
        h: 0,
        line: { color: C.rule, width: 1, endArrowType: "triangle" },
      });
    }
    text(slide, tag, x + 0.1, 3.4, 1.95, 0.2, {
      fontFace: MONO,
      fontSize: 7.5,
      color: C.green,
      bold: true,
      align: "center",
    });
    text(slide, name, x, 3.71, 2.15, 0.34, {
      fontSize: 15,
      bold: true,
      align: "center",
    });
    text(slide, detail, x + 0.05, 4.18, 2.05, 0.72, {
      fontSize: 9.5,
      color: C.muted,
      align: "center",
      breakLine: true,
      valign: "top",
    });
  });
  box(slide, 0.72, 5.31, 11.88, 0.78, { fill: C.mint, line: C.green });
  text(slide, "MODEL OUTPUT", 0.98, 5.55, 1.45, 0.2, {
    fontFace: MONO,
    fontSize: 7.5,
    color: C.green,
    bold: true,
  });
  text(slide, "상품 · 관련성 · 가격 · 짧은 선택 이유", 2.55, 5.43, 3.55, 0.4, {
    fontSize: 13,
    bold: true,
  });
  text(slide, "NOT EXPOSED", 7.03, 5.55, 1.2, 0.2, {
    fontFace: MONO,
    fontSize: 7.5,
    color: C.brick,
    bold: true,
  });
  text(slide, "chain-of-thought · key · arbitrary URL", 8.25, 5.43, 3.8, 0.4, {
    fontSize: 12,
    color: C.brick,
    bold: true,
  });
  footer(slide);
}

// 4. UX
{
  const slide = pptx.addSlide("REIN");
  header(
    slide,
    "04 / experience",
    "채팅창 대신, 구매 결정을 읽는 조달 데스크.",
    "Cloud Run live run — Gemini 선택, 정책 승인, Devnet 결제, 영수증을 한 화면에",
  );
  slide.addImage({
    path: screenshot,
    ...imageSizingCrop(screenshot, 0.7, 2.64, 8.2, 3.79),
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.7,
    y: 2.64,
    w: 8.2,
    h: 3.79,
    fill: { color: C.white, transparency: 100 },
    line: { color: C.ink, width: 0.9 },
  });
  text(slide, "LIVE / COMPLETED", 0.92, 2.82, 1.78, 0.24, {
    fontFace: MONO,
    fontSize: 7,
    bold: true,
    color: C.green,
    fill: { color: C.mint },
    margin: 0.05,
    align: "center",
  });

  const notes = [
    ["01", "Timeline first", "탐색 → 이유 → 정책 → 결제 → 수령을 같은 축에서 확인"],
    ["02", "Spend always visible", "지출, 남은 상한, 영수증을 decision 옆에 고정"],
    ["03", "Failure is a state", "denied·unavailable·reconciling·timeout을 명시적으로 복구"],
  ];
  notes.forEach(([n, titleValue, body], i) => {
    const y = 2.69 + i * 1.22;
    text(slide, n, 9.25, y, 0.38, 0.24, {
      fontFace: MONO,
      fontSize: 8,
      color: C.green,
      bold: true,
    });
    text(slide, titleValue, 9.72, y - 0.02, 2.55, 0.28, {
      fontSize: 13,
      bold: true,
    });
    text(slide, body, 9.25, y + 0.36, 3.0, 0.54, {
      fontSize: 9.2,
      color: C.muted,
      breakLine: true,
      valign: "top",
    });
    if (i < 2) rule(slide, 9.25, y + 1.04, 3.02, C.soft, 0.6);
  });
  footer(slide);
}

// 5. Architecture
{
  const slide = pptx.addSlide("REIN");
  header(
    slide,
    "05 / architecture",
    "한 서비스, 세 개의 권한 경계.",
    "Cloud Run이 UI·agent API·paid data API를 소유하고, 키는 Secret Manager에만 존재",
  );
  const layers = [
    { x: 0.72, w: 3.26, label: "DECIDE", tone: C.green, title: "Vertex AI + Google ADK", items: ["gemini-3.5-flash", "structured selection", "purchased-evidence synthesis"] },
    { x: 4.34, w: 4.63, label: "CONTROL", tone: C.ink, title: "Next.js policy + Firestore", items: ["fixed catalog / BigInt limits", "transactional reservation", "events · payments · quota"] },
    { x: 9.33, w: 3.28, label: "SETTLE", tone: C.amber, title: "x402 + Solana Devnet", items: ["buyer + protected seller", "payment-identifier", "Circle test USDC receipt"] },
  ];
  layers.forEach((layer) => {
    box(slide, layer.x, 2.72, layer.w, 2.6, { fill: C.paper, line: layer.tone, width: 1.1 });
    text(slide, layer.label, layer.x + 0.23, 2.95, layer.w - 0.46, 0.2, {
      fontFace: MONO,
      fontSize: 7.5,
      color: layer.tone,
      bold: true,
    });
    text(slide, layer.title, layer.x + 0.23, 3.27, layer.w - 0.46, 0.48, {
      fontSize: 15,
      bold: true,
      breakLine: true,
      valign: "top",
    });
    layer.items.forEach((item, i) => {
      slide.addShape(pptx.ShapeType.ellipse, {
        x: layer.x + 0.25,
        y: 4.04 + i * 0.36,
        w: 0.08,
        h: 0.08,
        fill: { color: layer.tone },
        line: { color: layer.tone },
      });
      text(slide, item, layer.x + 0.42, 3.95 + i * 0.36, layer.w - 0.7, 0.24, {
        fontSize: 9,
        color: C.muted,
      });
    });
  });
  slide.addShape(pptx.ShapeType.line, { x: 4.02, y: 4.03, w: 0.31, h: 0, line: { color: C.rule, width: 1.2, endArrowType: "triangle" } });
  slide.addShape(pptx.ShapeType.line, { x: 8.99, y: 4.03, w: 0.31, h: 0, line: { color: C.rule, width: 1.2, endArrowType: "triangle" } });
  box(slide, 1.52, 5.65, 10.3, 0.58, { fill: C.mint, line: C.green });
  text(slide, "PRE-PAYMENT SNAPSHOT", 1.78, 5.84, 2.06, 0.18, { fontFace: MONO, fontSize: 7.2, color: C.green, bold: true });
  text(slide, "CoinGecko + GitHub → snapshotId 고정 → 결제 후 동일 payload 반환", 3.9, 5.71, 7.38, 0.38, { fontSize: 11.5, bold: true });
  footer(slide);
}

// 6. Safety
{
  const slide = pptx.addSlide("REIN");
  header(
    slide,
    "06 / safety",
    "안전은 프롬프트가 아니라 불변식으로 구현했습니다.",
    "모델 제안은 hypothesis, 결제 정책은 code-owned contract",
  );
  const safeguards = [
    ["ALLOWLIST", "2 products only", "모델은 URL·network·mint·payee·price를 만들 수 없음"],
    ["ATOMIC", "BigInt money", "6자리 atomic string, purchase 4000 / run 10000 / daily 250000"],
    ["IDEMPOTENCY", "One payment fingerprint", "payment ID가 다른 요청에 재사용되면 transaction에서 거부"],
    ["RECONCILE", "No blind retry", "서명 후 상태 불명은 reservation을 유지하고 Explorer 확인"],
    ["SECRET", "Server-side signer", "키는 Secret Manager → Cloud Run에만 주입, Gemini·브라우저에는 없음"],
    ["INJECTION", "Untrusted evidence", "숫자 중심 normalization, catalog/data 안의 지시는 무시"],
  ];
  safeguards.forEach(([tag, titleValue, body], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.72 + col * 6.02;
    const y = 2.62 + row * 1.15;
    text(slide, tag, x, y + 0.04, 1.23, 0.2, {
      fontFace: MONO,
      fontSize: 7,
      bold: true,
      color: i === 3 ? C.amber : C.green,
    });
    text(slide, titleValue, x + 1.32, y, 2.08, 0.29, {
      fontSize: 13,
      bold: true,
    });
    text(slide, body, x + 1.32, y + 0.39, 4.18, 0.43, {
      fontSize: 8.8,
      color: C.muted,
      breakLine: true,
      valign: "top",
    });
    rule(slide, x, y + 0.94, 5.55, C.soft, 0.6);
  });
  box(slide, 0.72, 6.12, 11.88, 0.45, { fill: C.brickPale, line: C.brick });
  text(slide, "MVP excludes", 0.95, 6.24, 1.25, 0.18, { fontFace: MONO, fontSize: 7, color: C.brick, bold: true });
  text(slide, "mainnet · real funds · arbitrary seller · login · subscription · multi-agent", 2.25, 6.17, 9.85, 0.28, { fontSize: 10.5, color: C.brick, bold: true });
  footer(slide);
}

// 7. Evidence
{
  const slide = pptx.addSlide("REIN");
  header(
    slide,
    "07 / evidence",
    hasLiveProof ? "두 번의 구매, 두 개의 공개 영수증." : "로컬은 검증 완료. 온체인 증거는 live smoke 뒤에 고정합니다.",
    hasLiveProof ? liveUrl : "현재 deck은 정직한 제출 초안이며, simulated receipt를 온체인으로 주장하지 않습니다.",
  );
  receipt(slide, 0.72, 2.7, "Market snapshot", "0.001 USDC", marketTx, hasLiveProof);
  receipt(slide, 6.89, 2.7, "GitHub health", "0.002 USDC", githubTx, hasLiveProof);
  text(slide, hasLiveProof ? "LIVE DEVNET EVIDENCE" : "LOCAL VERIFICATION", 0.74, 4.42, 2.35, 0.2, {
    fontFace: MONO,
    fontSize: 8,
    color: hasLiveProof ? C.green : C.amber,
    bold: true,
  });
  const metrics = [
    ["48", "unit tests", "amount·policy·quota·agent eval·failure"],
    ["08", "browser tests", "desktop + Pixel 7 + 402 + SSE reconnect"],
    ["09", "compiled routes", "Next.js production build"],
  ];
  metrics.forEach(([number, label, detail], i) => {
    const x = 0.72 + i * 4.05;
    text(slide, number, x, 4.78, 0.82, 0.5, {
      fontFace: MONO,
      fontSize: 27,
      bold: true,
      color: C.green,
    });
    text(slide, label, x + 0.9, 4.84, 2.3, 0.25, { fontSize: 13, bold: true });
    text(slide, detail, x + 0.9, 5.2, 2.75, 0.45, { fontSize: 8.5, color: C.muted, breakLine: true, valign: "top" });
  });
  box(slide, 0.72, 5.94, 11.88, 0.5, { fill: hasLiveProof ? C.mint : C.amberPale, line: hasLiveProof ? C.green : C.amber });
  text(slide, hasLiveProof ? "PASS" : "NEXT GATE", 0.96, 6.08, 1.05, 0.18, { fontFace: MONO, fontSize: 7, bold: true, color: hasLiveProof ? C.green : C.amber });
  text(slide, hasLiveProof ? "Explorer에서 network·mint·payee·amount를 검증했습니다." : "사용자 GCP·Devnet wallet 승인 → Cloud Run 배포 → x402 2건 → Explorer 캡처", 2.05, 6.0, 9.9, 0.3, { fontSize: 10.7, bold: true });
  footer(slide);
}

// 8. Close
{
  const slide = pptx.addSlide("REIN");
  mark(slide, 0.76, 0.61, 1.25);
  text(slide, "REIN/", 1.53, 0.55, 2.2, 0.52, { fontSize: 26, bold: true });
  text(slide, "WHY NOW", 0.76, 1.65, 1.3, 0.2, { fontFace: MONO, fontSize: 8, color: C.green, bold: true });
  text(slide, "에이전트 커머스의 다음 UX는\n‘살 수 있음’이 아니라 ‘증명 가능한 구매’입니다.", 0.72, 1.98, 7.85, 1.36, {
    fontSize: 31,
    bold: true,
    breakLine: true,
    valign: "top",
  });
  text(slide, "REIN은 작은 고정 카탈로그에서 시작하지만, 같은 contract를 리서치 API, B2B 데이터, 모델·툴 조달로 확장할 수 있습니다.", 0.76, 3.75, 7.2, 0.8, { fontSize: 13, color: C.muted, breakLine: true, valign: "top" });

  box(slide, 8.78, 1.55, 3.62, 4.44, { fill: C.ink, line: C.ink });
  text(slide, "SUBMISSION", 9.12, 1.91, 2.8, 0.2, { fontFace: MONO, fontSize: 8, color: C.mint, bold: true });
  text(slide, "GitHub", 9.12, 2.43, 2.5, 0.24, { fontSize: 13, color: C.white, bold: true });
  text(slide, "github.com/jeonsavvy/REIN", 9.12, 2.78, 2.75, 0.23, { fontFace: MONO, fontSize: 7.2, color: C.mint });
  rule(slide, 9.12, 3.24, 2.9, C.muted, 0.7);
  text(slide, "Live app", 9.12, 3.55, 2.5, 0.24, { fontSize: 13, color: C.white, bold: true });
  text(slide, liveUrl, 9.12, 3.9, 2.75, 0.48, { fontFace: MONO, fontSize: 7.1, color: C.mint, breakLine: true, valign: "top" });
  rule(slide, 9.12, 4.64, 2.9, C.muted, 0.7);
  text(slide, "Video demo", 9.12, 4.95, 2.5, 0.24, { fontSize: 13, color: C.white, bold: true });
  text(slide, "≤ 3 min · captions included", 9.12, 5.3, 2.75, 0.23, { fontFace: MONO, fontSize: 7.2, color: C.mint });

  text(slide, "Autonomy, held to proof.", 0.76, 5.68, 7.4, 0.42, { fontSize: 18, color: C.green, bold: true });
  footer(slide, "REIN / AGENT-INITIATED COMMERCE");
}

for (const slide of pptx._slides) {
  // Full-slide backgrounds and boxed labels intentionally contain text.
  warnIfSlideHasOverlaps(slide, pptx, {
    ignoreDecorativeShapes: true,
    ignoreLines: true,
    muteContainment: true,
  });
  warnIfSlideElementsOutOfBounds(slide, pptx);
}

pptx
  .writeFile({ fileName: path.resolve(__dirname, "REIN-Hackathon-Deck.pptx") })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
