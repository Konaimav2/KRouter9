import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// POST /v1/music — NOTE: stub. Donor musicGeneration.ts (672 lines) needs provider
// credentials + polling flow. Returns 501 with wiring guidance until ported.
export async function POST() {
  return NextResponse.json({ error: "music generation not yet wired — see PORT_OMNIROUTE.md" }, { status: 501 });
}
