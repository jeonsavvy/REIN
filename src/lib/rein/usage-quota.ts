import { UsageLimitError } from "./errors";
import type { UsageAdmission } from "./types";

export interface UsageQuotaRecord {
  runUnits: number;
  modelUnits: number;
}

export function readUsageQuota(value: unknown): UsageQuotaRecord {
  if (value === undefined) return { runUnits: 0, modelUnits: 0 };
  if (!value || typeof value !== "object") {
    throw new Error("Invalid persisted usage quota");
  }
  const record = value as Partial<UsageQuotaRecord>;
  if (
    !Number.isSafeInteger(record.runUnits) ||
    Number(record.runUnits) < 0 ||
    !Number.isSafeInteger(record.modelUnits) ||
    Number(record.modelUnits) < 0
  ) {
    throw new Error("Invalid persisted usage quota");
  }
  return {
    runUnits: Number(record.runUnits),
    modelUnits: Number(record.modelUnits),
  };
}

function validateAdmission(admission: UsageAdmission): void {
  const integers = [
    admission.runUnits,
    admission.modelUnits,
    admission.globalRunLimit,
    admission.clientRunLimit,
    admission.globalModelLimit,
    admission.clientModelLimit,
  ];
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(admission.quotaKey) ||
    !/^[a-f0-9]{64}$/.test(admission.clientKey) ||
    integers.some((value) => !Number.isSafeInteger(value) || value < 0)
  ) {
    throw new Error("Invalid usage admission");
  }
}

export function applyUsageAdmission(
  globalUsage: UsageQuotaRecord,
  clientUsage: UsageQuotaRecord,
  admission: UsageAdmission,
): {
  globalUsage: UsageQuotaRecord;
  clientUsage: UsageQuotaRecord;
} {
  validateAdmission(admission);
  const nextGlobal = {
    runUnits: globalUsage.runUnits + admission.runUnits,
    modelUnits: globalUsage.modelUnits + admission.modelUnits,
  };
  const nextClient = {
    runUnits: clientUsage.runUnits + admission.runUnits,
    modelUnits: clientUsage.modelUnits + admission.modelUnits,
  };
  if (
    nextGlobal.runUnits > admission.globalRunLimit ||
    nextGlobal.modelUnits > admission.globalModelLimit
  ) {
    throw new UsageLimitError("global");
  }
  if (
    nextClient.runUnits > admission.clientRunLimit ||
    nextClient.modelUnits > admission.clientModelLimit
  ) {
    throw new UsageLimitError("client");
  }
  return { globalUsage: nextGlobal, clientUsage: nextClient };
}
