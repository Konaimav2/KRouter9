import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// POST /v1/rerank — Cohere-compatible rerank pass-through.
// Body: { model: "cohere/rerank-v3.5", query, documents[], top_n? }. API key via Authorization header.
export async function POST(req) {
  try {
    const b = await req.json();
    const auth = req.headers.get("authorization") || "";
    if (!b.query || !Array.isArray(b.documents)) {
      return NextResponse.json({ error: "query and documents[] required" }, { status: 400 });
    }
    const r = await fetch("https://api.cohere.com/v2/rerank", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({ model: (b.model || "").split("/").pop() || "rerank-v3.5", query: b.query, documents: b.documents, top_n: b.top_n }),
    });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e) { return NextResponse.json({ error: String(e.message || e) }, { status: 500 }); }
}
