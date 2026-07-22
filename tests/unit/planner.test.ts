import { describe, expect, it, vi } from "vitest";
import {
  generateValidatedResearchBrief,
  parseModelProductIds,
  researchBriefSemanticViolations,
  validateResearchBriefSemantics,
} from "@/lib/rein/planner";
import type { ResearchBrief } from "@/lib/rein/types";

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
    "Solana 개발 활성도가 우위입니다.",
    "스타 수는 개발자 관심도를 보여줍니다.",
  ])("rejects unsupported or evaluative language: %s", (claim) => {
    expect(() => validateResearchBriefSemantics(briefWith(claim))).toThrow(
      "Gemini 응답 형식을 확인할 수 없습니다.",
    );
  });

  it("automatically rewrites one invalid draft before returning a report", async () => {
    const invalid = briefWith("Solana 저장소의 개발 활성도가 우위입니다.");
    const valid = briefWith(
      "같은 30일 창에서 agave 100건 이상, go-ethereum 97건이 관찰되었습니다.",
    );
    const generate = vi
      .fn()
      .mockResolvedValueOnce(invalid)
      .mockResolvedValueOnce(valid);

    await expect(generateValidatedResearchBrief(generate)).resolves.toBe(valid);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]?.[0]).toMatchObject({
      attempt: 2,
      previousDraft: invalid,
      violations: ["평가·순위 표현"],
    });
    expect(researchBriefSemanticViolations(valid)).toEqual([]);
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
