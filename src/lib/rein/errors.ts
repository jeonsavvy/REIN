import type { RunError } from "./types";

export class ReinError extends Error {
  constructor(
    public readonly detail: RunError,
    public readonly ambiguousSettlement = false,
  ) {
    super(detail.message);
    this.name = "ReinError";
  }
}

export class PolicyDeniedError extends ReinError {
  constructor(message: string) {
    super({
      code: "POLICY_DENIED",
      message,
      recovery: "예산을 늘리거나 더 저렴한 상품만 선택해 다시 실행하세요.",
    });
    this.name = "PolicyDeniedError";
  }
}

export class UsageLimitError extends ReinError {
  constructor(public readonly scope: "global" | "client") {
    super({
      code: "USAGE_LIMIT_REACHED",
      message:
        scope === "global"
          ? "오늘 공개 데모에서 실행 가능한 횟수를 모두 사용했습니다."
          : "현재 네트워크에서 오늘 실행 가능한 횟수를 모두 사용했습니다.",
      recovery:
        "한국 시간 자정 이후 다시 시도하세요. 완료된 조사 결과와 영수증은 계속 확인할 수 있습니다.",
    });
    this.name = "UsageLimitError";
  }
}

export function toRunError(error: unknown): RunError {
  if (error instanceof ReinError) return error.detail;
  if (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  ) {
    return {
      code: "MODEL_TIMEOUT",
      message: "90초 실행 제한을 초과했습니다.",
      recovery: "잠시 후 다시 실행하세요. 결제 전송 후라면 영수증 상태를 먼저 확인하세요.",
    };
  }
  return {
    code: "INTERNAL_ERROR",
    message: error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.",
    recovery: "실행 기록을 확인한 뒤 새 조사를 시작하세요.",
  };
}
