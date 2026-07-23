import { NextResponse } from "next/server";
import { reportRecoveryUsageAdmission } from "@/lib/rein/abuse";
import { toRunError, UsageLimitError } from "@/lib/rein/errors";
import { getRuntimeMode } from "@/lib/rein/planner";
import {
  recoverRunReport,
  ReportRecoveryUnavailableError,
} from "@/lib/rein/report-recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Leave response and Firestore overhead outside two bounded model attempts.
export const maxDuration = 50;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const view = await recoverRunReport(id, {
      admission:
        getRuntimeMode() === "live"
          ? reportRecoveryUsageAdmission(request)
          : undefined,
    });
    return NextResponse.json(view, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof UsageLimitError) {
      return NextResponse.json(
        { error: error.detail },
        { status: 429, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (error instanceof ReportRecoveryUnavailableError) {
      return NextResponse.json(
        {
          error: {
            code: "REPORT_RECOVERY_UNAVAILABLE",
            message: error.message,
          },
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { error: toRunError(error) },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
