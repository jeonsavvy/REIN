import { NextResponse } from "next/server";
import { z } from "zod";
import { runUsageAdmission } from "@/lib/rein/abuse";
import { toRunError, UsageLimitError } from "@/lib/rein/errors";
import { getRuntimeMode } from "@/lib/rein/planner";
import { validateRunBudget } from "@/lib/rein/policy";
import { getStore } from "@/lib/rein/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inputSchema = z
  .object({
    goal: z.string().trim().min(8).max(500),
    maxBudgetAtomic: z.string().regex(/^(0|[1-9]\d*)$/),
    preset: z.string().trim().max(80).optional(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    validateRunBudget(input.maxBudgetAtomic);
    const mode = getRuntimeMode();
    const run = await getStore().createRun({
      ...input,
      mode,
    }, mode === "live" ? runUsageAdmission(request) : undefined);
    return NextResponse.json(
      { runId: run.id },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const detail =
      error instanceof z.ZodError
        ? {
            code: "VALIDATION_ERROR",
            message: error.issues[0]?.message ?? "Invalid request",
            recovery: "목표와 atomic-unit 예산을 확인하세요.",
          }
        : toRunError(error);
    return NextResponse.json(
      { error: detail },
      {
        status:
          error instanceof UsageLimitError
            ? 429
            : detail.code === "INTERNAL_ERROR"
              ? 503
              : 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
