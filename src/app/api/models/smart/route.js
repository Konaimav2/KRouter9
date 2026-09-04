import { NextResponse } from "next/server";
import { syncArenaRankings, smartSuggestions } from "@/lib/modelIntelligence.js";

export const dynamic = "force-dynamic";

// GET /api/models/smart?q=&limit= — rank-aware model suggestions
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const limit = parseInt(searchParams.get("limit") || "10", 10);
  const suggestions = await smartSuggestions(q, isNaN(limit) ? 10 : limit);
  return NextResponse.json({ suggestions });
}

// POST /api/models/smart — trigger rankings sync now
export async function POST() {
  const result = await syncArenaRankings();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
