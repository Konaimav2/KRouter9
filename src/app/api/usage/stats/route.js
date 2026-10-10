import { NextResponse } from "next/server";
import { getUsageStats } from "@/lib/usageDb";

const VALID_PERIODS = new Set(["today", "24h", "7d", "30d", "60d", "all"]);

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "7d";

    if (!VALID_PERIODS.has(period)) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    const startDateRaw = searchParams.get("startDate");
    const endDateRaw = searchParams.get("endDate");

    let filter = period;
    if (startDateRaw || endDateRaw) {
      if (!startDateRaw || !endDateRaw) {
        return NextResponse.json(
          { error: "startDate and endDate must be provided together" },
          { status: 400 }
        );
      }
      const start = new Date(startDateRaw);
      const end = new Date(endDateRaw);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return NextResponse.json(
          { error: "Invalid startDate or endDate (expected ISO date)" },
          { status: 400 }
        );
      }
      if (start > end) {
        return NextResponse.json(
          { error: "startDate must not be after endDate" },
          { status: 400 }
        );
      }
      if (end - start > 60 * 86400000) {
        return NextResponse.json(
          { error: "Custom range must not exceed 60 days" },
          { status: 400 }
        );
      }
      filter = { period, startDate: start.toISOString(), endDate: end.toISOString() };
    }

    const stats = await getUsageStats(filter);
    return NextResponse.json(stats);
  } catch (error) {
    console.error("[API] Failed to get usage stats:", error);
    return NextResponse.json({ error: "Failed to fetch usage stats" }, { status: 500 });
  }
}
