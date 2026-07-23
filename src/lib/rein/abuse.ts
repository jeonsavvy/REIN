import { isIP } from "node:net";
import {
  MAX_DAILY_MODEL_CREDITS,
  MAX_DAILY_MODEL_CREDITS_PER_CLIENT,
  MAX_DAILY_RUN_ADMISSIONS,
  MAX_DAILY_RUN_ADMISSIONS_PER_CLIENT,
  REPORT_RECOVERY_MODEL_CREDITS,
  RUN_MODEL_CREDITS,
} from "./constants";
import { hmacSha256 } from "./crypto";
import { ReinError } from "./errors";
import { kstDateKey } from "./storage";
import type { UsageAdmission } from "./types";

function normalizedIp(value: string | undefined): string | undefined {
  const candidate = value?.trim();
  if (!candidate) return undefined;

  const bracketed = candidate.match(/^\[([^\]]+)\](?::\d+)?$/)?.[1];
  const withoutPort =
    bracketed ??
    (candidate.includes(".") && /:\d+$/.test(candidate)
      ? candidate.replace(/:\d+$/, "")
      : candidate);
  const normalized = withoutPort.startsWith("::ffff:")
    ? withoutPort.slice("::ffff:".length)
    : withoutPort;
  return isIP(normalized) ? normalized.toLowerCase() : undefined;
}

function normalizedForwardedIp(headers: Headers): string | undefined {
  const forwarded = headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!forwarded?.length) return undefined;

  // Cloud Run's managed proxy appends the direct peer address. Any preceding
  // values can be supplied by the caller, so only trust the final value.
  return normalizedIp(forwarded.at(-1));
}

function protectionUnavailable(): ReinError {
  return new ReinError({
    code: "INTERNAL_ERROR",
    message: "공개 데모 실행 보호를 확인할 수 없습니다.",
    recovery: "잠시 후 다시 시도하세요. 기존 조사 결과는 계속 확인할 수 있습니다.",
  });
}

export function clientUsageKey(
  request: Request,
  options: { now?: Date; secret?: string } = {},
): string {
  const secret = options.secret ?? process.env.ABUSE_HMAC_KEY;
  const clientIp = normalizedForwardedIp(request.headers);
  if (!secret || secret.trim().length < 32 || !clientIp) {
    throw protectionUnavailable();
  }
  return hmacSha256(
    secret.trim(),
    `${kstDateKey(options.now)}\0${clientIp}`,
  );
}

function admission(
  request: Request,
  runUnits: number,
  modelUnits: number,
  now = new Date(),
): UsageAdmission {
  return {
    quotaKey: kstDateKey(now),
    clientKey: clientUsageKey(request, { now }),
    runUnits,
    modelUnits,
    globalRunLimit: MAX_DAILY_RUN_ADMISSIONS,
    clientRunLimit: MAX_DAILY_RUN_ADMISSIONS_PER_CLIENT,
    globalModelLimit: MAX_DAILY_MODEL_CREDITS,
    clientModelLimit: MAX_DAILY_MODEL_CREDITS_PER_CLIENT,
  };
}

export function runUsageAdmission(
  request: Request,
  now?: Date,
): UsageAdmission {
  return admission(request, 1, RUN_MODEL_CREDITS, now);
}

export function reportRecoveryUsageAdmission(
  request: Request,
  now?: Date,
): UsageAdmission {
  return admission(request, 0, REPORT_RECOVERY_MODEL_CREDITS, now);
}
