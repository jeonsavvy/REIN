import { NextResponse } from "next/server";
import { toRunError } from "@/lib/proofbuy/errors";
import {
  recoverRunReport,
  ReportRecoveryUnavailableError,
} from "@/lib/proofbuy/report-recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Leave response and Firestore overhead outside the model's 30-second deadline.
export const maxDuration = 45;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const view = await recoverRunReport(id);
    return NextResponse.json(view, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
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
