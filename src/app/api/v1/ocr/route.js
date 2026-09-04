import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// POST /v1/ocr — Mistral OCR pass-through (document understanding).
// Body: { model?: "mistral-ocr-latest", document: { type: "document_url", document_url } }. Key via Authorization.
export async function POST(req) {
  try {
    const b = await req.json();
    const auth = req.headers.get("authorization") || "";
    const r = await fetch("https://api.mistral.ai/v1/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({ model: b.model || "mistral-ocr-latest", document: b.document }),
    });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e) { return NextResponse.json({ error: String(e.message || e) }, { status: 500 }); }
}
