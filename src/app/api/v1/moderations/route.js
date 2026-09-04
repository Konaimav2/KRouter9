import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// POST /v1/moderations — OpenAI-compatible moderation pass-through.
export async function POST(req) {
  try {
    const b = await req.json();
    const auth = req.headers.get("authorization") || "";
    const r = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify(b),
    });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e) { return NextResponse.json({ error: String(e.message || e) }, { status: 500 }); }
}
