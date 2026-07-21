import { describe, expect, it } from "vitest";
import {
  parseModelProductIds,
  validateResearchBriefSemantics,
} from "@/lib/proofbuy/planner";
import type { ResearchBrief } from "@/lib/proofbuy/types";

function briefWith(interpretation: string): ResearchBrief {
  return {
    headline: "SOL과 ETH의 관측값 비교",
    executiveSummary:
      "구매한 시장 스냅샷과 두 저장소의 30일 커밋 수를 각각 비교했습니다.",
    findings: [
      {
        label: "30일 커밋",
        value: "agave 100건 이상 · go-ethereum 97건",
        interpretation,
      },
    ],
    caveats: ["두 저장소의 관측값은 전체 생태계를 대표하지 않습니다."],
    generatedBy: "Gemini 3.5 Flash",
  };
}

describe("Gemini report semantic guard", () => {
  it("accepts neutral repository-scoped findings", () => {
    const brief = briefWith(
      "같은 30일 창에서 두 저장소에 기록된 커밋 수를 비교했습니다.",
    );
    expect(validateResearchBriefSemantics(brief)).toBe(brief);
  });

  it.each([
    "ETH 시장 캡이 더 큽니다.",
    "두 자산은 긍정적인 흐름입니다.",
    "Solana 개발이 더 활발합니다.",
    "스타 수는 개발자 관심도를 보여줍니다.",
  ])("rejects unsupported or evaluative language: %s", (claim) => {
    expect(() => validateResearchBriefSemantics(briefWith(claim))).toThrow(
      "Gemini 응답 형식을 확인할 수 없습니다.",
    );
  });
});

describe("Gemini product ID protocol", () => {
  it("parses only allowlisted product IDs", () => {
    expect(parseModelProductIds(" market_snapshot,\n github_health ")).toEqual([
      "market_snapshot",
      "github_health",
    ]);
    expect(parseModelProductIds("NONE")).toEqual([]);
  });

  it.each([
    "market_snapshot,market_snapshot",
    "market_snapshot,https://example.com",
    "market_ snapshot",
    "Buy market_snapshot",
    "",
  ])("rejects malformed or invented model output: %s", (output) => {
    expect(() => parseModelProductIds(output)).toThrow(
      "Gemini 응답 형식을 확인할 수 없습니다.",
    );
  });
});
