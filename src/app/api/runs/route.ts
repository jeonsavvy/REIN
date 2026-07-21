import { NextResponse } from "next/server";
import { z } from "zod";
import { toRunError } from "@/lib/proofbuy/errors";
import { getRuntimeMode } from "@/lib/proofbuy/planner";
import { validateRunBudget } from "@/lib/proofbuy/policy";
import { getStore } from "@/lib/proofbuy/store";

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
    const run = await getStore().createRun({
      ...input,
      mode: getRuntimeMode(),
    });
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
    return NextResponse.json({ error: detail }, { status: 400 });
  }
}
