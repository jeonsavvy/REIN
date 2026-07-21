import type { RunError } from "./types";

export class ProofBuyError extends Error {
  constructor(
    public readonly detail: RunError,
    public readonly ambiguousSettlement = false,
  ) {
    super(detail.message);
    this.name = "ProofBuyError";
  }
}

export class PolicyDeniedError extends ProofBuyError {
  constructor(message: string) {
    super({
      code: "POLICY_DENIED",
      message,
      recovery: "예산을 늘리거나 더 저렴한 상품만 선택해 다시 실행하세요.",
    });
    this.name = "PolicyDeniedError";
  }
}

export function toRunError(error: unknown): RunError {
  if (error instanceof ProofBuyError) return error.detail;
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
