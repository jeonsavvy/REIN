import { NextResponse } from "next/server";
import { toRunError } from "@/lib/rein/errors";
import {
  recoverRunReport,
  ReportRecoveryUnavailableError,
} from "@/lib/rein/report-recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Leave response and Firestore overhead outside two bounded model attempts.
export const maxDuration = 50;

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
